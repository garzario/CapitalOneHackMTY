import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";

/**
 * The image has to be buildable from this tree, and the list that decides it lives in
 * a Dockerfile nothing else reads.
 *
 * `apps/api/Dockerfile` copies the workspace manifests one by one before
 * `bun install --frozen-lockfile`, which is a real optimisation: that layer only
 * changes when a dependency changes, so a code edit rebuilds in seconds. The price is
 * a list that drifts, and the drift is invisible until somebody deploys, because
 * nothing in `bun test`, `bun run typecheck` or `bun run build` reads a Dockerfile.
 *
 * It drifted. `packages/rail` and `packages/consortium` arrived with issues #164 and
 * #198 and were never added, so `bun install` inside the image answered
 * "Workspace dependency @hackmty/rail not found" and the build failed at that line.
 * The instance went on serving a container built before either package existed, which
 * means the deployed API had no payment run and no consortium endpoint while the
 * repository had both. That was found on 2026-09-13 by trying to redeploy for #200.
 *
 * So the list is checked against the disk rather than against a memory. A package
 * added next week fails here, in a suite that runs on every pull request, instead of
 * failing on the one deploy that matters.
 */

const ROOT = new URL("..", import.meta.url).pathname;
const DOCKERFILE = "apps/api/Dockerfile";

const dockerfile = await Bun.file(`${ROOT}${DOCKERFILE}`).text();

/** Every workspace directory on disk, from the globs in the root package.json. */
function workspaces(): string[] {
  const roots = ["apps", "packages"];
  const found: string[] = [];

  for (const root of roots) {
    for (const entry of readdirSync(`${ROOT}${root}`, {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (Bun.file(`${ROOT}${root}/${entry.name}/package.json`).size > 0) {
        found.push(`${root}/${entry.name}`);
      }
    }
  }

  return found.sort();
}

describe("the API image", () => {
  it("found the workspaces, so an empty list cannot pass this file", () => {
    expect(workspaces().length).toBeGreaterThan(10);
  });

  it("copies every workspace manifest before bun install", () => {
    /* The RUN line and not the first mention of the command, because the comment
       above the COPY block names it too. */
    const install = dockerfile.indexOf("RUN bun install --frozen-lockfile");
    expect(install).toBeGreaterThan(0);

    const manifests = dockerfile.slice(0, install);
    const missing = workspaces().filter(
      (workspace) => !manifests.includes(`COPY ${workspace}/package.json`),
    );

    /* A manifest that is missing here is not a slower build: `--frozen-lockfile`
       refuses to resolve a workspace dependency it cannot see and the whole image
       fails to build. */
    expect(missing).toEqual([]);
  });

  it("copies the sources the API reads at runtime", () => {
    /* `packages` whole, because `GET /api/v1/sat/lookup` reads the committed 69-B
       snapshot off disk at first use and an image without it would answer
       "not listed" to every RFC, which is the one answer that endpoint may not
       invent. */
    expect(dockerfile).toContain("COPY packages packages");
    expect(dockerfile).toContain("COPY apps/api apps/api");
  });

  it("pins the runtime to the version .bun-version names", async () => {
    const pinned = (await Bun.file(`${ROOT}.bun-version`).text()).trim();

    expect(dockerfile).toContain(`FROM oven/bun:${pinned}-slim`);
  });
});
