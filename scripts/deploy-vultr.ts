/**
 * bun run scripts/deploy-vultr.ts
 *
 * Puts apps/api on a Vultr instance behind HTTPS, and proves it did.
 *
 * The shape of it: one instance labelled `sentryone-api`, Ubuntu 24.04, running
 * docker compose with two services, the API image built from this repo and
 * Caddy terminating TLS on `api.<ip>.sslip.io`. No domain is bought, no DNS is
 * delegated and no certificate is copied anywhere: sslip.io resolves a name
 * that embeds an IPv4 address to that address, so Let's Encrypt can answer the
 * HTTP-01 challenge the minute the box boots. `deploy/docker-compose.yml`,
 * `deploy/Caddyfile` and `deploy/cloud-init.sh` are the three files it runs
 * there, and `apps/api/Dockerfile` is the image.
 *
 * Three properties this script is written around.
 *
 * 1. It reuses. A second run finds the instance by label and does nothing
 *    destructive to it. Wiping a box is opt in (`--reinstall`), because the
 *    instance answering the demo URL is not something to recreate by accident
 *    at 03:00.
 * 2. It proves. Creating an instance is not deploying: the run ends with GET
 *    /health and GET /api/v1/run/current over HTTPS, and it exits non-zero if
 *    either one does not answer. "The server exists" and "the API answers the
 *    contract in docs/09-api.md" are different claims.
 * 3. It never prints a secret. The values that reach the instance go into
 *    `/srv/sentryone/.env` through the cloud-init user data, and `--dry-run`
 *    prints that block redacted, so the output of this script is safe to paste
 *    into an issue.
 *
 * Environment, read from the shell or from `bun --env-file=.env run ...`:
 *
 *   VULTR_API_KEY               required, the deploy machine only
 *   DATABASE_URL                required, Tiger Data. Without it the API would
 *                               boot on the in-memory fixture and a deployed
 *                               instance must never serve that.
 *   NESSIE_API_KEY              optional, the bank mirror
 *   ALLOW_CEP_FETCH, BANXICO_CEP_CERT_PEM       optional, the CEP portal and seal
 *   GEMINI_API_KEY, GEMINI_MODEL                optional, photo and voice note
 *   ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID,
 *   ELEVENLABS_PHONE_NUMBER_ID, ELEVENLABS_VOICE_ID   optional, the call
 *
 * Exit codes: 0 deployed and smoke tested, 1 something failed, 2 the Vultr key
 * was refused for this machine's IP and the console steps were printed instead.
 */

import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const API = "https://api.vultr.com/v2";

const DEFAULTS = {
  label: "sentryone-api",
  plan: "vc2-1c-2gb",
  /** Mexico City first: the venue is in Monterrey and the judges are in the room. */
  regions: ["mex", "dfw"],
  os: "Ubuntu 24.04 LTS x64",
  repo: "https://github.com/garzario/CapitalOneHackMTY.git",
  branch: "main",
  sshPublicKey: `${process.env.HOME ?? ""}/.ssh/sentryone_vultr.pub`,
} as const;

/** Variables copied into /srv/sentryone/.env on the instance. */
const FORWARDED_ENV = [
  "DATABASE_URL",
  "NESSIE_API_KEY",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_AGENT_ID",
  "ELEVENLABS_PHONE_NUMBER_ID",
  "ELEVENLABS_VOICE_ID",
  "ALLOW_CEP_FETCH",
  "BANXICO_CEP_CERT_PEM",
] as const;

/** cloud-init has to install Docker and build the image before anything answers. */
const SMOKE_TIMEOUT_MS = 15 * 60 * 1000;
const SMOKE_INTERVAL_MS = 15 * 1000;
const BOOT_TIMEOUT_MS = 8 * 60 * 1000;
const BOOT_INTERVAL_MS = 10 * 1000;

type Argv = {
  label: string;
  plan: string;
  region?: string;
  branch: string;
  repo: string;
  sshPublicKey: string;
  dryRun: boolean;
  reinstall: boolean;
  smokeOnly: boolean;
};

function parseArgs(argv: string[]): Argv {
  const value = (name: string, fallback: string): string => {
    const index = argv.indexOf(`--${name}`);
    if (index === -1) {
      return fallback;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`--${name} needs a value`);
    }
    return next;
  };

  return {
    label: value("label", DEFAULTS.label),
    plan: value("plan", DEFAULTS.plan),
    region: argv.includes("--region") ? value("region", "") : undefined,
    branch: value("branch", DEFAULTS.branch),
    repo: value("repo", DEFAULTS.repo),
    sshPublicKey: value("ssh-public-key", DEFAULTS.sshPublicKey),
    dryRun: argv.includes("--dry-run"),
    reinstall: argv.includes("--reinstall"),
    smokeOnly: argv.includes("--smoke-only"),
  };
}

const HELP = `bun run scripts/deploy-vultr.ts [options]

  --branch <name>          branch the instance clones (default ${DEFAULTS.branch})
  --label <name>           instance label to create or reuse (default ${DEFAULTS.label})
  --region <id>            force a region, otherwise ${DEFAULTS.regions.join(" then ")}
  --plan <id>              instance plan (default ${DEFAULTS.plan})
  --ssh-public-key <path>  key added to root, for diagnosing a half-finished boot
  --repo <url>             clone source, must be public
  --dry-run                print what would be sent, secrets redacted, change nothing
  --reinstall              WIPES the reused instance and provisions it again
  --smoke-only             skip provisioning, just test the instance that exists
`;

class VultrError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    message: string,
  ) {
    super(message);
    this.name = "VultrError";
  }
}

async function vultr<T>(
  key: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();

  if (!response.ok) {
    throw new VultrError(
      response.status,
      text,
      `${init.method ?? "GET"} ${path} answered ${response.status}`,
    );
  }

  return (text === "" ? {} : JSON.parse(text)) as T;
}

/**
 * The refusal this account actually produces. The Vultr key is restricted to a
 * list of source addresses, so a teammate on a different network gets a 403
 * that says nothing about IPs unless you know to look for it. Printing the
 * steps beats printing the status code.
 */
async function printIpRestrictionSteps(): Promise<void> {
  const ip = await publicIp();

  console.error("");
  console.error("Vultr refused the key from this machine.");
  console.error("");
  console.error(
    "The key is almost certainly IP restricted, which is the default on a new",
  );
  console.error(
    "Vultr account. Nothing was created and nothing was changed. To fix it, the",
  );
  console.error("account owner does this, once:");
  console.error("");
  console.error("  1. https://my.vultr.com/settings/#settingsapi");
  console.error("  2. Access Control, IPv4 allowed addresses");
  console.error(`  3. Add ${ip ?? "<this machine's public IPv4>"}/32`);
  console.error("  4. Save, then run this script again");
  console.error("");
  console.error(
    "Check the address from the machine that will run the deploy, not from the",
  );
  console.error("owner's laptop:  curl -s https://api.ipify.org");
  console.error("");
}

async function publicIp(): Promise<string | undefined> {
  try {
    const response = await fetch("https://api.ipify.org", {
      signal: AbortSignal.timeout(5000),
    });
    const text = (await response.text()).trim();
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(text) ? text : undefined;
  } catch {
    return undefined;
  }
}

type Instance = {
  id: string;
  label: string;
  main_ip: string;
  region: string;
  plan: string;
  status: string;
  power_status: string;
  server_status: string;
  os: string;
  date_created: string;
};

async function findInstance(
  key: string,
  label: string,
): Promise<Instance | undefined> {
  const { instances } = await vultr<{ instances: Instance[] }>(
    key,
    `/instances?label=${encodeURIComponent(label)}&per_page=100`,
  );

  return instances.find((instance) => instance.label === label);
}

async function resolveOsId(key: string, name: string): Promise<number> {
  const { os } = await vultr<{ os: { id: number; name: string }[] }>(
    key,
    "/os?per_page=500",
  );
  const match = os.find((entry) => entry.name === name);

  if (match === undefined) {
    throw new Error(`Vultr has no operating system named ${name}`);
  }

  return match.id;
}

async function resolveRegion(
  key: string,
  plan: string,
  forced?: string,
): Promise<string> {
  const candidates = forced === undefined ? DEFAULTS.regions : [forced];

  for (const region of candidates) {
    const { available_plans } = await vultr<{ available_plans: string[] }>(
      key,
      `/regions/${region}/availability?type=vc2`,
    );

    if (available_plans.includes(plan)) {
      return region;
    }

    console.log(`region ${region} has no ${plan} right now`);
  }

  throw new Error(
    `no region in ${candidates.join(", ")} has ${plan} available`,
  );
}

/**
 * The generated half of the user data: the values, and nothing else. The part
 * a human reviews is `deploy/cloud-init.sh`, which this prepends to.
 */
function buildUserData(argv: Argv, sshKey: string | undefined): string {
  const lines: string[] = [];

  for (const name of FORWARDED_ENV) {
    const value = process.env[name];

    if (value === undefined || value === "") {
      continue;
    }

    if (value.includes("\n")) {
      throw new Error(`${name} contains a newline and cannot be forwarded`);
    }

    lines.push(`${name}=${value}`);
  }

  const header = [
    "#!/bin/bash",
    "# Generated by scripts/deploy-vultr.ts. The body below is deploy/cloud-init.sh.",
    "set -euo pipefail",
    `export SENTRYONE_BRANCH=${shellQuote(argv.branch)}`,
    `export SENTRYONE_REPO=${shellQuote(argv.repo)}`,
    `export SENTRYONE_SSH_KEY=${shellQuote(sshKey ?? "")}`,
    "install -d -m 0750 /srv/sentryone",
    "cat >/srv/sentryone/.env <<'SENTRYONE_ENV_EOF'",
    ...lines,
    "SENTRYONE_ENV_EOF",
    "chmod 600 /srv/sentryone/.env",
    "",
  ].join("\n");

  return header;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function redactUserData(userData: string): string {
  return userData.replace(
    /(<<'SENTRYONE_ENV_EOF'\n)[\s\S]*?(SENTRYONE_ENV_EOF)/,
    (_match, open: string, close: string) =>
      `${open}# ${FORWARDED_ENV.length} variables, redacted\n${close}`,
  );
}

async function readSshKey(path: string): Promise<string | undefined> {
  const file = Bun.file(path);

  if (!(await file.exists())) {
    console.log(`no ssh public key at ${path}, the instance gets none`);
    return undefined;
  }

  const key = (await file.text()).trim();

  if (!key.startsWith("ssh-")) {
    throw new Error(`${path} does not look like an OpenSSH public key`);
  }

  return key;
}

async function accountSshKeyIds(key: string): Promise<string[]> {
  const { ssh_keys } = await vultr<{ ssh_keys: { id: string }[] }>(
    key,
    "/ssh-keys?per_page=100",
  );

  return ssh_keys.map((entry) => entry.id);
}

async function waitForBoot(key: string, id: string): Promise<Instance> {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;

  for (;;) {
    const { instance } = await vultr<{ instance: Instance }>(
      key,
      `/instances/${id}`,
    );

    if (
      instance.status === "active" &&
      instance.power_status === "running" &&
      instance.server_status !== "none" &&
      instance.main_ip !== "0.0.0.0"
    ) {
      return instance;
    }

    if (Date.now() > deadline) {
      throw new Error(
        `instance ${id} is still ${instance.status}/${instance.server_status} after ${BOOT_TIMEOUT_MS / 60000} minutes`,
      );
    }

    console.log(
      `waiting: status ${instance.status}, server ${instance.server_status}`,
    );
    await Bun.sleep(BOOT_INTERVAL_MS);
  }
}

type SmokeResult = {
  host: string;
  version: string;
  runId: string;
  instructions: number;
  amount: number;
};

/**
 * The part that decides whether this run succeeded. /health is liveness and
 * says nothing about the database; /api/v1/run/current is the payload the
 * payment-run screen loads, so it only answers if Postgres, the engine and the
 * seeded company are all there.
 */
async function smoke(ip: string): Promise<SmokeResult> {
  const host = `api.${ip}.sslip.io`;
  const deadline = Date.now() + SMOKE_TIMEOUT_MS;
  let lastError = "no attempt yet";

  for (;;) {
    try {
      const health = await fetch(`https://${host}/health`, {
        signal: AbortSignal.timeout(10000),
      });

      if (health.ok) {
        const payload = (await health.json()) as {
          ok?: boolean;
          service?: string;
          version?: string;
        };

        if (payload.ok === true && payload.service === "api") {
          console.log(`GET https://${host}/health -> 200`);

          const run = await fetch(`https://${host}/api/v1/run/current`, {
            signal: AbortSignal.timeout(20000),
          });

          if (!run.ok) {
            throw new Error(`/api/v1/run/current answered ${run.status}`);
          }

          const body = (await run.json()) as {
            id?: string;
            totals?: { instructions?: number; amount?: number };
          };

          if (
            body.id === undefined ||
            body.totals?.instructions === undefined
          ) {
            throw new Error(
              "/api/v1/run/current did not answer a PaymentRun shape",
            );
          }

          console.log(`GET https://${host}/api/v1/run/current -> 200`);

          return {
            host,
            version: payload.version ?? "unknown",
            runId: body.id,
            instructions: body.totals.instructions,
            amount: body.totals.amount ?? 0,
          };
        }
      }

      lastError = `health answered ${health.status}`;
    } catch (cause) {
      lastError = cause instanceof Error ? cause.message : String(cause);
    }

    if (Date.now() > deadline) {
      throw new Error(
        `https://${host} never answered: ${lastError}. On the box: ssh root@${ip} then tail -50 /var/log/sentryone-cloud-init.log`,
      );
    }

    const remaining = Math.round((deadline - Date.now()) / 1000);
    console.log(`not up yet (${lastError}), ${remaining}s left`);
    await Bun.sleep(SMOKE_INTERVAL_MS);
  }
}

async function main(): Promise<number> {
  const argv = Bun.argv.slice(2);

  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(HELP);
    return 0;
  }

  const options = parseArgs(argv);
  const key = process.env.VULTR_API_KEY?.trim();

  if (key === undefined || key === "") {
    console.error("VULTR_API_KEY is not set.");
    console.error(
      "It lives in the deploy machine's .env only, never in the repo:",
    );
    console.error("  bun --env-file=.env run scripts/deploy-vultr.ts");
    return 1;
  }

  if (
    !options.smokeOnly &&
    (process.env.DATABASE_URL ?? "").trim() === "" &&
    !options.dryRun
  ) {
    console.error("DATABASE_URL is not set.");
    console.error(
      "A deployed API with no database boots on the in-memory fixture and would",
    );
    console.error(
      "serve a payment run nobody seeded. Set it to the Tiger Data connection",
    );
    console.error("string and run this again.");
    return 1;
  }

  try {
    const account = await vultr<{ account: { email: string } }>(
      key,
      "/account",
    );
    console.log(`vultr account: ${account.account.email}`);
  } catch (cause) {
    if (cause instanceof VultrError && [401, 403].includes(cause.status)) {
      await printIpRestrictionSteps();
      return 2;
    }
    throw cause;
  }

  let instance = await findInstance(key, options.label);

  if (instance !== undefined) {
    console.log(
      `reusing ${options.label}: ${instance.id} at ${instance.main_ip} (${instance.region}, ${instance.plan}, created ${instance.date_created})`,
    );
  }

  if (options.smokeOnly) {
    if (instance === undefined) {
      console.error(`no instance labelled ${options.label} to test`);
      return 1;
    }

    const result = await smoke(instance.main_ip);
    report(instance, result);
    return 0;
  }

  const sshKey = await readSshKey(options.sshPublicKey);
  const header = buildUserData(options, sshKey);
  const body = await Bun.file(`${ROOT}/deploy/cloud-init.sh`).text();
  const userData = `${header}${body}`;

  if (options.dryRun) {
    console.log("");
    console.log(redactUserData(userData));
    console.log("");
    console.log(
      instance === undefined
        ? `would create ${options.label} in ${options.region ?? DEFAULTS.regions.join(" or ")}, plan ${options.plan}`
        : `would ${options.reinstall ? "REINSTALL" : "leave untouched"} ${instance.id}`,
    );
    return 0;
  }

  const encoded = Buffer.from(userData, "utf8").toString("base64");

  if (instance === undefined) {
    const [osId, region, sshkeyIds] = await Promise.all([
      resolveOsId(key, DEFAULTS.os),
      resolveRegion(key, options.plan, options.region),
      accountSshKeyIds(key),
    ]);

    console.log(`creating ${options.label} in ${region}, ${options.plan}`);

    const created = await vultr<{ instance: Instance }>(key, "/instances", {
      method: "POST",
      body: JSON.stringify({
        region,
        plan: options.plan,
        os_id: osId,
        label: options.label,
        hostname: options.label,
        user_data: encoded,
        sshkey_id: sshkeyIds,
        backups: "disabled",
        enable_ipv6: false,
        ddos_protection: false,
        activation_email: false,
        tags: ["sentryone"],
      }),
    });

    instance = created.instance;
    console.log(`created ${instance.id}`);
  } else if (options.reinstall) {
    /**
     * Vultr only runs cloud-init on a fresh install, so repointing an existing
     * box at new user data means reinstalling it. It keeps the subscription and
     * the IP address, which is the whole reason to do it this way rather than
     * destroying and creating: the address is in README.md and in the Vercel
     * rewrite, and changing it costs two deploys and a doc edit.
     */
    console.log(`updating user data and reinstalling ${instance.id}`);
    console.log("this WIPES the instance. Ctrl-C now if that is not the plan.");
    await Bun.sleep(5000);

    await vultr(key, `/instances/${instance.id}`, {
      method: "PATCH",
      body: JSON.stringify({ user_data: encoded }),
    });

    await vultr(key, `/instances/${instance.id}/reinstall`, {
      method: "POST",
      body: JSON.stringify({ hostname: options.label }),
    });
  } else {
    console.log(
      "the instance exists and was left alone. Pass --reinstall to wipe and",
    );
    console.log("provision it again, or --smoke-only to just test it.");
  }

  instance = await waitForBoot(key, instance.id);
  console.log(`instance ${instance.id} is up at ${instance.main_ip}`);
  console.log(
    "cloud-init is installing Docker and building the image, which takes a few minutes",
  );

  const result = await smoke(instance.main_ip);
  report(instance, result);

  return 0;
}

function report(instance: Instance, result: SmokeResult): void {
  const base = `https://${result.host}`;

  console.log("");
  console.log("API is live.");
  console.log(`  base url     ${base}`);
  console.log(
    `  instance     ${instance.id} (${instance.region}, ${instance.plan})`,
  );
  console.log(`  version      ${result.version}`);
  console.log(
    `  run/current  ${result.runId}, ${result.instructions} instructions, ${result.amount.toFixed(2)} MXN`,
  );
  console.log("");
  console.log("Next, so the deployed web talks to it:");
  console.log("  1. vercel.json rewrites /api and /health to this host");
  console.log("  2. vercel env rm PUBLIC_API_URL production");
  console.log(
    `  3. printf '${base}' | vercel env add PUBLIC_API_URL production`,
  );
  console.log("  4. vercel --prod --yes");
  console.log("");
  console.log("If something looks wrong on the box:");
  console.log(`  ssh -i ~/.ssh/sentryone_vultr root@${instance.main_ip}`);
  console.log("  tail -50 /var/log/sentryone-cloud-init.log");
  console.log("  cd /srv/sentryone/repo/deploy && docker compose ps");
  console.log(
    "  /srv/sentryone/refresh.sh dev   # repoint at a branch, rebuild",
  );
}

try {
  process.exit(await main());
} catch (cause) {
  console.error("");
  console.error(cause instanceof Error ? cause.message : String(cause));

  if (cause instanceof VultrError) {
    console.error(cause.body.slice(0, 500));
  }

  process.exit(1);
}
