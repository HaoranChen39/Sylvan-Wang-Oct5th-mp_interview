import { describe, expect, it } from "vitest";
import { profiles } from "../data/profiles";
import { explain, highlight } from "./explain";
import { reviewBusinessProfile } from "./moderation";

const run = (id: string) => {
  const p = profiles.find((x) => x.id === id)!;
  return { p, e: explain(reviewBusinessProfile(p, p.onboardingState), p) };
};

describe("explain", () => {
  it("says where a block came from, in CS language", () => {
    expect(run("bp_05").e.why).toBe(
      "Blocked as gambling and sports betting: the website address contains “lucky7.bet”."
    );
    expect(run("bp_07").e.why).toBe(
      "Blocked as alcohol and liquor retail: the description contains “wine”."
    );
  });

  it("gives every review a question to settle it", () => {
    for (const id of ["bp_04", "bp_10"]) {
      const { e } = run(id);
      expect(e.check, id).toBeTruthy();
    }
    expect(run("bp_10").e.why).toBe("“Brokers” can mean a securities, forex or crypto broker.");
  });

  it("explains why an ambiguous word was let through", () => {
    expect(run("bp_03").e.why).toBe(
      "Mentions “Desk”, but nothing else in the profile is about finance."
    );
    expect(run("bp_06").e.why).toContain("onboarding is already complete");
  });

  it("has a plain sentence for every queued profile", () => {
    for (const p of profiles) {
      const e = explain(reviewBusinessProfile(p, p.onboardingState), p);
      expect(e.why, p.id).not.toMatch(/_/); // no raw reason codes
    }
  });
});

describe("highlight", () => {
  it("matches the word stem across name and description", () => {
    const parts = highlight("Independent broker comparing quotes", ["Brokers"]);
    expect(parts.filter((s) => s.hit).map((s) => s.text)).toEqual(["broker"]);
  });

  it("does not highlight inside other words", () => {
    const parts = highlight("Stakeholders and steaks", ["stake"]);
    expect(parts.some((s) => s.hit)).toBe(false);
  });

  it("returns the text untouched when there is nothing to mark", () => {
    expect(highlight("Family dentistry", [])).toEqual([{ text: "Family dentistry", hit: false }]);
  });
});
