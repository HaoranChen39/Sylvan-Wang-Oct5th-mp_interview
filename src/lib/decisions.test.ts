import { describe, expect, it } from "vitest";
import {
  appendDecision,
  type DecisionLog,
  firstDecisions,
  patterns,
  ruleCandidateStatus,
  formatDuration,
  latestDecisions,
  outcomeFor,
  summarize,
} from "./decisions";

const base = {
  tags: ["Insurance broker"],
  reviewer: "cs.reviewer",
  machine: { verdict: "review" as const, reasonCode: "ambiguous_broker" as const },
};

describe("decision log", () => {
  it("appends without mutating the previous log", () => {
    const empty: DecisionLog = [];
    const one = appendDecision(empty, {
      ...base,
      profileId: "bp_10",
      decision: "allowed",
      note: "Insurance broker, not securities",
    });
    expect(empty).toHaveLength(0);
    expect(one).toHaveLength(1);
    expect(Object.isFrozen(one)).toBe(true);
    expect(Object.isFrozen(one[0])).toBe(true);
    expect(one[0]!.machineVerdict).toBe("review");
  });

  it("requires a note", () => {
    expect(() =>
      appendDecision([], { ...base, profileId: "bp_10", decision: "allowed", note: "   " })
    ).toThrow(/required/);
    expect(() =>
      appendDecision([], { ...base, profileId: "bp_10", decision: "allowed", note: "ok" })
    ).toThrow();
  });

  it("keeps every decision and lets the latest one win", () => {
    let log: DecisionLog = [];
    log = appendDecision(log, { ...base, profileId: "bp_04", decision: "blocked", note: "Looks like forex" });
    log = appendDecision(log, { ...base, profileId: "bp_04", decision: "allowed", note: "Checked: rates viewer only" });
    expect(log.map((e) => e.seq)).toEqual([1, 2]);
    expect(latestDecisions(log).get("bp_04")?.decision).toBe("allowed");
  });
});

describe("outcome and summary", () => {
  it("lets the machine verdict stand until a human decides a review", () => {
    expect(outcomeFor("allow")).toBe("allowed");
    expect(outcomeFor("block")).toBe("blocked");
    expect(outcomeFor("review")).toBe("awaiting");
  });

  it("reflects human decisions in the counts", () => {
    const rows = [
      { profileId: "a", verdict: "allow" as const },
      { profileId: "b", verdict: "review" as const },
      { profileId: "c", verdict: "review" as const },
      { profileId: "d", verdict: "block" as const },
    ];
    const log = appendDecision([], { ...base, profileId: "b", decision: "blocked", note: "Unlicensed forex" });
    const s = summarize(rows, log);
    expect(s.machine).toEqual({ allow: 1, review: 2, block: 1 });
    expect(s.outcome).toEqual({ allowed: 1, blocked: 2, awaiting: 1 });
    expect(s.decidedByHuman).toBe(1);
    expect(s.overturned).toBe(0);
  });
});

describe("formatDuration", () => {
  it("is coarse and readable", () => {
    expect(formatDuration(12 * 60_000)).toBe("12m");
    expect(formatDuration((5 * 60 + 3) * 60_000)).toBe("5h 3m");
    expect(formatDuration((2 * 1440 + 4 * 60 + 30) * 60_000)).toBe("2d 4h");
    expect(formatDuration(-1)).toBe("0m");
  });
});

describe("tags, first decision and patterns", () => {
  it("requires at least one tag", () => {
    expect(() =>
      appendDecision([], { ...base, tags: [], profileId: "x", decision: "allowed", note: "Checked the site" })
    ).toThrow(/Pick/);
  });

  it("measures time to the first decision, not the latest", () => {
    let log: DecisionLog = [];
    log = appendDecision(log, { ...base, profileId: "a", decision: "allowed", note: "First look" }, new Date("2026-10-01T00:00:00Z"));
    log = appendDecision(log, { ...base, profileId: "a", decision: "blocked", note: "Second look" }, new Date("2026-10-05T00:00:00Z"));
    expect(firstDecisions(log).get("a")?.decidedAt).toBe("2026-10-01T00:00:00.000Z");
  });

  it("groups current decisions by reason code and tag", () => {
    let log: DecisionLog = [];
    log = appendDecision(log, { ...base, profileId: "a", decision: "allowed", note: "Home insurance only" });
    log = appendDecision(log, { ...base, reviewer: "second.reviewer", profileId: "b", decision: "allowed", note: "Auto insurance only" });
    log = appendDecision(log, { ...base, tags: ["Forex or crypto broker"], profileId: "c", decision: "blocked", note: "Sells FX accounts" });
    const p = patterns(log);
    expect(p[0]).toEqual({ reasonCode: "ambiguous_broker", tag: "Insurance broker", allowed: 2, blocked: 0, reviewers: 2 });
    expect(p).toHaveLength(2);
  });

  it("counts only the latest decision per business", () => {
    let log: DecisionLog = [];
    log = appendDecision(log, { ...base, profileId: "a", decision: "allowed", note: "First look" });
    log = appendDecision(log, { ...base, profileId: "a", decision: "blocked", note: "Changed my mind" });
    expect(patterns(log)[0]).toMatchObject({ allowed: 0, blocked: 1 });
  });
});

describe("rule candidates", () => {
  const p = (allowed: number, blocked: number, reviewers: number) => ({
    reasonCode: "ambiguous_broker" as const, tag: "Insurance broker", allowed, blocked, reviewers,
  });
  it("needs volume, agreement and more than one reviewer", () => {
    expect(ruleCandidateStatus(p(20, 0, 2))).toBe("candidate");
    expect(ruleCandidateStatus(p(20, 0, 1))).toBe("building");
    expect(ruleCandidateStatus(p(3, 0, 2))).toBe("building");
    expect(ruleCandidateStatus(p(19, 1, 3))).toBe("split");
  });
});
