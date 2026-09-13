/**
 * The address the QR code carries.
 *
 * The judge scans the payment run screen with their own phone, so the link has
 * to be absolute and it has to be reachable from a device that is not this
 * laptop. Three rules, and every one of them exists because of a way this
 * breaks at a booth.
 *
 * - **It is derived, never written down.** The origin comes from the page the
 *   run screen is already served from, so the QR is correct on the deployed
 *   host, on a preview URL and on a laptop on the venue wifi, without a build
 *   variable anybody has to remember to set.
 * - **It says when it cannot work.** `localhost` and `127.0.0.1` resolve to the
 *   phone itself, so a QR built from them sends the judge to their own device.
 *   `intakeLink` reports that rather than rendering a code that fails in front
 *   of the room, and the screen prints the address instead.
 * - **The hash route travels intact.** The app is a static build with a hash
 *   router precisely so a deep link needs no rewrite rule on the host, which is
 *   what makes `#/intake` safe to put in a QR at all.
 */

export const INTAKE_PATH = "#/intake";

/** Hosts that are this device, whatever device is reading them. */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", ""]);

export type IntakeLink =
  | { reachable: true; url: string }
  | { reachable: false; url: string; reason: string };

/**
 * Builds the intake address from an origin.
 *
 * @param origin `window.location.origin`, or whatever a test hands it.
 */
export function intakeLink(origin: string): IntakeLink {
  const url = `${trimSlash(origin)}/${INTAKE_PATH}`;
  const host = hostOf(origin);

  if (LOOPBACK.has(host)) {
    return {
      reachable: false,
      url,
      reason:
        "En localhost el QR apunta al telefono que lo escanea. Usa la IP de esta maquina en la red del evento.",
    };
  }

  return { reachable: true, url };
}

function trimSlash(origin: string): string {
  return origin.endsWith("/") ? origin.slice(0, -1) : origin;
}

/** The hostname, without a scheme or a port. Empty when there is none to read. */
export function hostOf(origin: string): string {
  const withoutScheme = origin.replace(/^[a-z]+:\/\//i, "");
  const host = withoutScheme.split("/")[0] ?? "";
  const bracketed = /^\[([^\]]+)\]/.exec(host);

  if (bracketed !== null) {
    return bracketed[1] as string;
  }

  return (host.split(":")[0] ?? "").toLowerCase();
}
