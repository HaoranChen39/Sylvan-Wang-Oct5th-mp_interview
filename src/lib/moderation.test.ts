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

describe("rule fixes (Task 2)", () => {
  const review = (id: string) => {
    const profile = byId(id);
    return reviewBusinessProfile(profile, profile.onboardingState);
  };

  // False block: "stake" is an English word, not proof of the Stake.com brand.
  it("does not block a BBQ restaurant called Stake House", () => {
    const result = review("bp_02");
    expect(result.verdict).toBe("allow");
    expect(result.reasonCode).toBe("no_risk_signals");
  });

  it("still blocks the Stake brand when it shows up as a brand", () => {
    for (const description of [
      "Affiliate offers for Stake casino",
      "Bonus codes for stake.com",
      "Daily picks and Stake sportsbook promos",
    ]) {
      const result = reviewBusinessProfile(
        { businessName: "Promo Hub", description },
        "START"
      );
      expect(result.verdict, description).toBe("block");
      expect(result.reasonCode).toBe("explicit_gambling");
    }
    const byHost = reviewBusinessProfile(
      { businessName: "Anything", websiteUrl: "https://stake.com" },
      "START"
    );
    expect(byHost.verdict).toBe("block");
  });

  // False allow: a payday lender that never says "payday".
  it("blocks an instant, no-credit-check lender", () => {
    const result = review("bp_09");
    expect(result.verdict).toBe("block");
    expect(result.reasonCode).toBe("explicit_payday_loans");
    expect(result.category).toBe("payday-loans");
  });

  it("sends an ordinary loan product to a human instead of blocking it", () => {
    const result = reviewBusinessProfile(
      {
        businessName: "Cornerstone Mortgage",
        industry: "Financial services",
        description: "Independent mortgage broker for first-time buyers.",
      },
      "IDENTIFY"
    );
    expect(result.verdict).toBe("review");
  });

  // Noise: ambiguous finance words used in their everyday sense.
  it("allows a furniture shop that sells desks", () => {
    const result = review("bp_03");
    expect(result.verdict).toBe("allow");
    expect(result.reasonCode).toBe("ambiguous_term_no_finance_context");
    expect(result.evidence.join(" ")).toContain("Desk");
  });

  it("allows a boat-parts exchange", () => {
    const result = review("bp_12");
    expect(result.verdict).toBe("allow");
    expect(result.reasonCode).toBe("ambiguous_term_no_finance_context");
  });

  it("keeps a currency-exchange app in review: that is genuinely ambiguous", () => {
    const result = review("bp_04");
    expect(result.verdict).toBe("review");
    expect(result.reasonCode).toBe("ambiguous_exchange");
  });

  it("keeps an ambiguous term in review when there is no description to judge", () => {
    const result = reviewBusinessProfile(
      { businessName: "Apex Exchange", websiteUrl: "https://apex.exchange" },
      "START"
    );
    expect(result.verdict).toBe("review");
  });

  it("still reviews an exchange that talks about crypto", () => {
    const result = reviewBusinessProfile(
      {
        businessName: "Apex Exchange",
        description: "Swap tokens with the lowest fees.",
      },
      "START"
    );
    expect(result.verdict).toBe("review");
  });

  it("produces the expected verdict for every queued profile", () => {
    const verdicts = Object.fromEntries(
      profiles.map((p) => [p.id, reviewBusinessProfile(p, p.onboardingState).verdict])
    );
    expect(verdicts).toEqual({
      bp_01: "allow",
      bp_02: "allow",
      bp_03: "allow",
      bp_04: "review",
      bp_05: "block",
      bp_06: "allow",
      bp_07: "block",
      bp_08: "allow",
      bp_09: "block",
      bp_10: "review",
      bp_11: "block",
      bp_12: "allow",
    });
  });
});

describe("alcohol rule: 'bar' is not alcohol on its own", () => {
  const verdictFor = (description: string) =>
    reviewBusinessProfile({ businessName: "Test Co", description }, "START");

  it("does not block businesses where 'bar' means something else", () => {
    for (const description of [
      "High-protein snack bars with no added sugar",
      "Fresh salad bar and smoothies for office lunches",
      "Online bar exam prep courses for law graduates",
    ]) {
      expect(verdictFor(description).verdict, description).toBe("allow");
    }
  });

  it("still blocks bars and pubs that serve alcohol", () => {
    for (const description of [
      "Rooftop cocktail bar with live DJs",
      "Neighbourhood wine bar and small plates",
      "Traditional Irish pub with live music",
      "Sports bar showing every game",
      "Family bar & grill downtown",
    ]) {
      const result = verdictFor(description);
      expect(result.verdict, description).toBe("block");
      expect(result.reasonCode).toBe("explicit_alcohol");
    }
  });
});
