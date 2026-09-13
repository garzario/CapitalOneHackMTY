# The API image. Build context is the REPO ROOT, not this folder:
#
#   docker build -f apps/api/Dockerfile -t sentryone-api .
#
# because apps/api imports eight workspace packages by name and a context rooted
# at apps/api cannot see them. deploy/docker-compose.yml sets `context: ..` for
# the same reason.
#
# The tag matches .bun-version, so the container runs the runtime the repo is
# developed and tested on. ADR-0005 still holds: this workspace imports no bun:*
# module and touches no Bun global, so the same source runs under a Node adapter
# if the deploy target ever moves. Bun here is a packaging choice, not a
# dependency of the code.
FROM oven/bun:1.3.11-slim

ENV NODE_ENV=production

WORKDIR /srv/sentryone

# Manifests first: this layer only changes when a dependency changes, so a code
# edit rebuilds in seconds instead of reinstalling the workspace.
#
# Every workspace manifest has to be here or `bun install --frozen-lockfile` below
# refuses the whole build with "Workspace dependency not found", and the place that
# refusal shows up is a deploy and never a test. It happened: `packages/rail` and
# `packages/consortium` arrived with issues #164 and #198 and were not added here, so
# the image could not be built from the tree at all and the instance kept serving a
# container from before either of them existed. `scripts/docker-image.test.ts` is now
# the guard, and it reads the directories off disk rather than trusting this list.
COPY package.json bun.lock bunfig.toml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/cep/package.json packages/cep/
COPY packages/consortium/package.json packages/consortium/
COPY packages/constancia/package.json packages/constancia/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/engine/package.json packages/engine/
COPY packages/extract/package.json packages/extract/
COPY packages/nessie/package.json packages/nessie/
COPY packages/rail/package.json packages/rail/
COPY packages/sat/package.json packages/sat/
COPY packages/seed/package.json packages/seed/
COPY packages/voice/package.json packages/voice/

# --frozen-lockfile for the same reason CI uses it: the image resolves the
# versions the lockfile pins or the build fails, it never silently upgrades.
RUN bun install --frozen-lockfile

# The sources, including packages/sat/src/snapshot/official-2026-09-12.csv,
# which GET /api/v1/sat/lookup reads off disk at first use. An image without it
# answers "not listed" to every RFC, which is the one answer that endpoint must
# never invent.
COPY tsconfig.base.json ./
COPY packages packages
COPY apps/api apps/api

USER bun

EXPOSE 3000

# Liveness only, the same contract as GET /health: no database, no Nessie. Bun
# runs it because the slim image ships no curl and adding one to check a local
# socket is a package more than this needs.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD ["bun", "--eval", "const r = await fetch('http://127.0.0.1:3000/health'); process.exit(r.ok ? 0 : 1)"]

CMD ["bun", "run", "apps/api/src/index.ts"]
