import { describe, expect, it } from "bun:test";
import { hostOf, INTAKE_PATH, intakeLink } from "./intake-link";

describe("hostOf", () => {
  it("drops the scheme and the port", () => {
    expect(hostOf("https://ceptinela.tech:8443")).toBe("ceptinela.tech");
  });

  it("reads a bracketed IPv6 host", () => {
    expect(hostOf("http://[::1]:5173")).toBe("::1");
  });

  it("answers empty for something with no host in it", () => {
    expect(hostOf("")).toBe("");
  });
});

describe("intakeLink", () => {
  it("builds an absolute link to the hash route", () => {
    const link = intakeLink("https://ceptinela.tech");

    expect(link.reachable).toBe(true);
    expect(link.url).toBe(`https://ceptinela.tech/${INTAKE_PATH}`);
  });

  it("does not double the slash when the origin carries one", () => {
    expect(intakeLink("https://ceptinela.tech/").url).toBe(
      "https://ceptinela.tech/#/intake",
    );
  });

  it("refuses localhost, because on the judge's phone that is their phone", () => {
    const link = intakeLink("http://localhost:5173");

    expect(link.reachable).toBe(false);
    expect(link.url).toContain("localhost");
  });

  it("refuses the loopback address for the same reason", () => {
    expect(intakeLink("http://127.0.0.1:5173").reachable).toBe(false);
    expect(intakeLink("http://[::1]:5173").reachable).toBe(false);
  });

  it("accepts a private address on the venue network", () => {
    // This is the fallback when nothing is deployed yet: the laptop's own
    // address on the event wifi, which a phone in the room can actually reach.
    const link = intakeLink("http://192.168.1.42:5173");

    expect(link.reachable).toBe(true);
    expect(link.url).toBe("http://192.168.1.42:5173/#/intake");
  });

  it("says why, in words a person at the booth can act on", () => {
    const link = intakeLink("http://localhost:5173");

    expect(link.reachable).toBe(false);
    if (!link.reachable) {
      expect(link.reason.length).toBeGreaterThan(40);
    }
  });
});
