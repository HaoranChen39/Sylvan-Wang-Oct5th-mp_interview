import { describe, expect, it } from "vitest";
import { profiles } from "../data/profiles";
import { reviewBusinessProfile } from "./moderation";

const byId = (id: string) => {
  const profile = profiles.find((p) => p.id === id);
  if (!profile) {
    throw new Error(`No fixture ${id}`);
  }
  return profile;
};

describe("reviewBusinessProfile", () => {
  it("blocks an explicit sportsbook", () => {
    const profile = byId("bp_05");
    const result = reviewBusinessProfile(profile, profile.onboardingState);
    expect(result.verdict).toBe("block");
    expect(result.reasonCode).toBe("explicit_gambling");
    expect(result.confidence).toBe("high");
  });

  it("blocks a restricted TLD even when the copy is clean", () => {
    const result = reviewBusinessProfile(
      {
        businessName: "Quiet Studio",
        websiteUrl: "https://quietstudio.casino",
        industry: "Design",
        description: "A small design studio.",
      },
      "START"
    );
    expect(result.verdict).toBe("block");
    expect(result.evidence).toEqual(["quietstudio.casino"]);
  });

  it("allows a profile with no risk signals", () => {
    const profile = byId("bp_01");
    const result = reviewBusinessProfile(profile, profile.onboardingState);
    expect(result.verdict).toBe("allow");
    expect(result.reasonCode).toBe("no_risk_signals");
  });

  it("defers ambiguous finance terms while onboarding is in progress", () => {
    const profile = byId("bp_10");
    const result = reviewBusinessProfile(profile, profile.onboardingState);
    expect(result.verdict).toBe("review");
    expect(result.reasonCode).toBe("ambiguous_broker");
    expect(result.confidence).toBe("low");
  });

  it("lets a verified user through on ambiguous terms", () => {
    const profile = byId("bp_06");
    const result = reviewBusinessProfile(profile, "COMPLETE");
    expect(result.verdict).toBe("allow");
    expect(result.reasonCode).toBe("user_already_verified");
  });
});
