/**
 * A hash router in one file, with no dependency.
 *
 * Hash and not path on purpose. The app ships as a static build, so a path
 * router would need a rewrite rule on the host for every deep link, and the
 * QR code on the intake page would break the first time a deploy target
 * changed. `#/intake` is a plain anchor that works on any static host, in any
 * browser, offline, and inside a QR code.
 *
 * Navigation is anchors, so every route is keyboard reachable and a middle
 * click still opens a new tab without any handler.
 */

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { useMemo, useSyncExternalStore } from "react";

export type Route =
  | { name: "run" }
  | { name: "payments" }
  | { name: "instruction"; id: string }
  | { name: "intake" }
  | { name: "sat" }
  | { name: "cep" }
  | { name: "verifyCall" }
  | { name: "metrics" }
  /* The token sheet. A reference page, deliberately not in the navigation. */
  | { name: "design" }
  | { name: "notFound"; path: string };

export type RouteName = Route["name"];

export const PATHS = {
  run: "/run",
  payments: "/payments",
  intake: "/intake",
  sat: "/sat",
  cep: "/cep",
  verifyCall: "/verify-call",
  metrics: "/metrics",
  design: "/design",
} as const;

export const DEFAULT_PATH = PATHS.run;

export function instructionPath(id: string): string {
  return `/instructions/${encodeURIComponent(id)}`;
}

/** The verification call page, carrying the instruction it is about. */
export function verifyCallPath(instructionId: string): string {
  return `${PATHS.verifyCall}?instruction=${encodeURIComponent(instructionId)}`;
}

/**
 * The 69-B screen with the lookup box prefilled. Never runs the lookup itself:
 * ADR-0002 puts the official list behind a button a person presses, so a link
 * may carry the RFC but may not ask the SAT anything on arrival.
 */
export function satPath(rfc: string): string {
  return `${PATHS.sat}?rfc=${encodeURIComponent(rfc)}`;
}

/** The CEP screen with the supplier prefilled in the verification form. */
export function cepPath(rfc: string): string {
  return `${PATHS.cep}?rfc=${encodeURIComponent(rfc)}`;
}

/**
 * The CEP page with one instruction already selected, so the one-cent
 * verification is one click from the instruction detail and nobody retypes a
 * folio in front of a judge.
 *
 * A second query key on the same screen rather than a second screen: `rfc` fills
 * the form a person verifies a beneficiary in, `instruction` picks the payment
 * the cent is about, and the CEP page answers both because they are the same
 * page a judge lands on from two different findings.
 */
export function verifyAccountPath(instructionId: string): string {
  return `${PATHS.cep}?instruction=${encodeURIComponent(instructionId)}`;
}

/** `/run` becomes `#/run`, the value that goes in an href. */
export function href(path: string): string {
  return `#${path}`;
}

/** Everything before the query string, always starting with a slash. */
export function pathOf(target: string): string {
  const path = target.split("?")[0] ?? "";

  if (path === "" || path === "/") {
    return DEFAULT_PATH;
  }

  return path.startsWith("/") ? path : `/${path}`;
}

export function queryOf(target: string): URLSearchParams {
  const [, query = ""] = target.split("?");

  return new URLSearchParams(query);
}

/** `#/intake?rfc=X` becomes `/intake?rfc=X`. */
export function targetFromHash(hash: string): string {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;

  return raw === "" ? DEFAULT_PATH : raw;
}

export function parsePath(target: string): Route {
  const path = pathOf(target);
  const segments = path.split("/").filter(Boolean);

  if (segments.length === 1) {
    switch (segments[0]) {
      case "run":
        return { name: "run" };
      case "payments":
        return { name: "payments" };
      case "intake":
        return { name: "intake" };
      case "sat":
        return { name: "sat" };
      case "cep":
        return { name: "cep" };
      case "verify-call":
        return { name: "verifyCall" };
      case "metrics":
        return { name: "metrics" };
      case "design":
        return { name: "design" };
      default:
        return { name: "notFound", path };
    }
  }

  if (segments.length === 2 && segments[0] === "instructions") {
    return { name: "instruction", id: decodeURIComponent(segments[1] ?? "") };
  }

  return { name: "notFound", path };
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);

  return () => window.removeEventListener("hashchange", onChange);
}

function readHash(): string {
  return window.location.hash;
}

/** Empty on the server, where there is no location to read. */
function readHashOnServer(): string {
  return "";
}

/** The current hash, as a string, kept in sync with the address bar. */
export function useHashTarget(): string {
  const hash = useSyncExternalStore(subscribe, readHash, readHashOnServer);

  return targetFromHash(hash);
}

export function useRoute(): Route {
  const target = useHashTarget();

  return useMemo(() => parsePath(target), [target]);
}

/** Query parameters of the current route, for links a QR code carries. */
export function useRouteQuery(): URLSearchParams {
  const target = useHashTarget();

  return useMemo(() => queryOf(target), [target]);
}

export function navigate(path: string, options: { replace?: boolean } = {}) {
  if (options.replace) {
    window.history.replaceState(null, "", href(path));
    window.dispatchEvent(new HashChangeEvent("hashchange"));

    return;
  }

  window.location.hash = path;
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  children: ReactNode;
};

/**
 * A real anchor. No click handler, no preventDefault: the browser changes the
 * hash and every subscriber re-renders.
 */
export function Link({ to, children, ...rest }: LinkProps) {
  return (
    <a href={href(to)} {...rest}>
      {children}
    </a>
  );
}
