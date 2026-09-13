import { describe, expect, it } from "bun:test";
import {
  ACTOR_NAME_MAX_LENGTH,
  ACTOR_ROLE_LABEL,
  ACTOR_ROLES,
  decideRequirement,
  describeActor,
  isActorRole,
  mayDecide,
  roleSatisfies,
} from "./actor";
import type { Finding, Severity } from "./domain";

function finding(severity: Severity, over: Partial<Finding> = {}): Finding {
  return {
    id: `${severity}:1`,
    detector: "clabe_forensics",
    severity,
    state: "comprobable",
    subject: { kind: "instruction", id: "INS-1" },
    amountAtRisk: 1000,
    explanation: "La cuenta cambio respecto de la que se ha pagado antes.",
    evidence: {},
    createdAt: "2026-09-12T03:00:00.000Z",
    ...over,
  };
}

describe("the two roles", () => {
  it("knows both and nothing else", () => {
    expect([...ACTOR_ROLES]).toEqual(["clerk", "owner"]);
    expect(isActorRole("clerk")).toBe(true);
    expect(isActorRole("owner")).toBe(true);
    expect(isActorRole("admin")).toBe(false);
    expect(isActorRole("")).toBe(false);
  });

  it("lets an owner do a clerk's work and never the other way round", () => {
    expect(roleSatisfies("clerk", "clerk")).toBe(true);
    expect(roleSatisfies("owner", "clerk")).toBe(true);
    expect(roleSatisfies("owner", "owner")).toBe(true);
    expect(roleSatisfies("clerk", "owner")).toBe(false);
  });

  it("prints a name and a role the way a document reads them", () => {
    expect(describeActor({ name: "Lupita Elizondo", role: "clerk" })).toBe(
      "Lupita Elizondo (capturista)",
    );
    expect(describeActor({ name: "Gerardo Villarreal", role: "owner" })).toBe(
      "Gerardo Villarreal (dueño)",
    );
    expect(ACTOR_ROLE_LABEL.clerk).toBe("capturista");
  });

  it("caps a name at a length both ends of the contract agree on", () => {
    expect(ACTOR_NAME_MAX_LENGTH).toBe(120);
  });
});

describe("decideRequirement", () => {
  it("asks nothing of a hold, a verification or a clean release", () => {
    for (const action of ["hold", "verify"] as const) {
      expect(
        decideRequirement({ action, findings: [finding("critical")] }),
      ).toEqual({
        rule: "ordinary",
        requiresRole: "clerk",
        requiresReason: false,
      });
    }

    expect(decideRequirement({ action: "release", findings: [] })).toEqual({
      rule: "ordinary",
      requiresRole: "clerk",
      requiresReason: false,
    });
  });

  it("treats an info finding as nothing to override", () => {
    /* A supplier who was listed and cleared their name leaves a row that stops
       nothing. `confidenceOf` answers `confiable` for it and so does this. */
    const requirement = decideRequirement({
      action: "release",
      findings: [finding("info", { amountAtRisk: 0 })],
    });

    expect(requirement.rule).toBe("ordinary");
    expect(requirement.requiresRole).toBe("clerk");
  });

  it("asks for the owner and a reason on a release over a critical finding", () => {
    expect(
      decideRequirement({
        action: "release",
        findings: [finding("critical")],
      }),
    ).toEqual({
      rule: "override_release",
      requiresRole: "owner",
      requiresReason: true,
    });
  });

  it("asks for the owner on a release over a warning, which is precaucion", () => {
    const requirement = decideRequirement({
      action: "release",
      findings: [finding("warning", { state: "requiere_verificacion" })],
    });

    expect(requirement.rule).toBe("override_release");
    expect(requirement.requiresRole).toBe("owner");
  });

  it("asks for the owner on a release over a line the engine was holding", () => {
    /* No findings on the object at all, and the standing decision is the hold.
       The evidence may be thin and the override is still an override. */
    const requirement = decideRequirement({
      action: "release",
      findings: [],
      standing: { action: "hold" },
    });

    expect(requirement.rule).toBe("override_release");
    expect(requirement.requiresRole).toBe("owner");
    expect(requirement.requiresReason).toBe(true);
  });

  it("asks for the owner on a release over a pending verification", () => {
    const requirement = decideRequirement({
      action: "release",
      findings: [],
      standing: { action: "verify" },
    });

    expect(requirement.rule).toBe("override_release");
  });

  it("asks for the owner and a reason to reopen a cancelled line, whatever the action", () => {
    for (const action of ["hold", "verify", "release"] as const) {
      expect(
        decideRequirement({ action, cancelled: true, findings: [] }),
      ).toEqual({
        rule: "reopen_cancelled",
        requiresRole: "owner",
        requiresReason: true,
      });
    }
  });

  it("reports the cancelled rule rather than the override when both apply", () => {
    /* Both are the owner's and both need prose, so the only thing at stake is
       which sentence the clerk reads. A dropped line is the more specific fact. */
    expect(
      decideRequirement({
        action: "release",
        cancelled: true,
        findings: [finding("critical")],
      }).rule,
    ).toBe("reopen_cancelled");
  });
});

describe("mayDecide", () => {
  const clerk = { name: "Lupita Elizondo", role: "clerk" } as const;
  const owner = { name: "Gerardo Villarreal", role: "owner" } as const;

  it("lets the clerk run the ordinary week", () => {
    expect(
      mayDecide(clerk, { action: "hold", findings: [finding("critical")] }),
    ).toBe(true);
    expect(mayDecide(clerk, { action: "release", findings: [] })).toBe(true);
  });

  it("refuses the clerk the two exceptions and allows the owner both", () => {
    const override = {
      action: "release",
      findings: [finding("critical")],
    } as const;
    const reopen = { action: "hold", cancelled: true } as const;

    expect(mayDecide(clerk, override)).toBe(false);
    expect(mayDecide(owner, override)).toBe(true);
    expect(mayDecide(clerk, reopen)).toBe(false);
    expect(mayDecide(owner, reopen)).toBe(true);
  });
});
