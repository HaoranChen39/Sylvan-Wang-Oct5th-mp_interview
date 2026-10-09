/**
 * Plain-language explanations for CS reviewers.
 *
 * The moderation rule speaks in reason codes (`ambiguous_broker`) and raw
 * matches (`"Brokers"`). That is right for engineers and logs, and wrong for
 * the CS team, who need to know three things per profile:
 *
 *   why    — what the machine saw, in a sentence they could repeat to a customer
 *   check  — for a review, the one question that settles it
 *   where  — the matched word, highlighted in the business's own words
 *
 * Kept pure (no React) so the wording is unit-tested like the rule itself.
 */
import {
  CATEGORY_LABELS,
  extractHostname,
  type BusinessProfileInput,
  type OnboardingState,
  type ReasonCode,
  type ReviewResult,
} from "./moderation";

export interface Explanation {
  /** One sentence: what the machine decided and on what basis. */
  why: string;
  /** For review verdicts: the question that settles the case. */
  check?: string;
  /** Words to highlight in the business name and description. */
  terms: string[];
}

/**
 * What each ambiguous reason code is worried about, and how a reviewer can
 * tell. One entry per code: this is the reviewer playbook, written once.
 */
const REVIEW_PLAYBOOK: Partial<Record<ReasonCode, { worry: string; check: string }>> = {
  ambiguous_broker: {
    worry: "can mean a securities, forex or crypto broker",
    check: "Does the site offer investment, trading or crypto accounts?",
  },
  ambiguous_exchange: {
    worry: "can mean a currency or crypto trading exchange",
    check: "Can users trade or hold currency, or only view rates or swap goods?",
  },
  ambiguous_trading: {
    worry: "can mean securities, forex or crypto trading",
    check: "Do they execute trades or hold customer money, or only teach or sell goods?",
  },
  ambiguous_desk: {
    worry: "can mean a trading desk",
    check: "Is this a financial trading business, or something else with a desk?",
  },
  ambiguous_lending: {
    worry: "can mean a payday, title or cash-advance loan",
    check: "Is it short-term consumer credit? Mortgages, business and student loans are fine.",
  },
};

export function explain(
  result: ReviewResult,
  profile: BusinessProfileInput
): Explanation {
  switch (result.reasonCode) {
    case "no_risk_signals":
      return { why: "No restricted terms found.", terms: [] };

    case "user_already_verified": {
      const term = quoted(result.evidence[0]);
      return {
        why: `Mentions “${term}”, allowed because onboarding is already complete.`,
        terms: term ? [term] : [],
      };
    }

    case "ambiguous_term_no_finance_context": {
      const terms = result.evidence.map(quoted).filter(Boolean);
      return {
        why: `Mentions ${list(terms)}, but nothing else in the profile is about finance.`,
        terms,
      };
    }

    default:
      break;
  }

  if (result.verdict === "block") {
    const match = result.evidence[0] ?? "";
    const category = result.category ? CATEGORY_LABELS[result.category] : "restricted";
    return {
      why: `Blocked as ${category}: the ${whereFound(match, profile)} contains “${match}”.`,
      terms: [match],
    };
  }

  // review
  const play = REVIEW_PLAYBOOK[result.reasonCode];
  const term = result.evidence[0] ?? "";
  return {
    why: play
      ? `“${term}” ${play.worry}.`
      : `“${term}” is ambiguous and needs a human look.`,
    check: play?.check,
    terms: result.evidence,
  };
}

/** Which field the match came from, in words CS would use. */
export function whereFound(match: string, profile: BusinessProfileInput): string {
  const m = match.toLowerCase();
  const host = profile.websiteUrl ? extractHostname(profile.websiteUrl) : null;
  if (host && host === m) {
    return "website address";
  }
  if (profile.businessName?.toLowerCase().includes(m)) {
    return "business name";
  }
  if (profile.industry?.toLowerCase().includes(m)) {
    return "industry";
  }
  return "description";
}

export interface Segment {
  text: string;
  hit: boolean;
}

/**
 * Split text into plain and highlighted segments. Matching is by word stem so
 * the evidence "Brokers" (from the name) also lights up "broker" in the
 * description, and "Desk" lights up "desks".
 */
export function highlight(text: string, terms: string[]): Segment[] {
  const stems = terms
    .map((t) => t.trim().toLowerCase().replace(/(?:es|s)$/, ""))
    .filter((t) => t.length > 1 && !t.includes("."));
  if (stems.length === 0 || !text) {
    return [{ text, hit: false }];
  }
  const pattern = new RegExp(
    `\\b(?:${stems.map(escapeRe).join("|")})(?:s|es)?\\b`,
    "gi"
  );
  const out: Segment[] = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const i = m.index ?? 0;
    if (i > last) {
      out.push({ text: text.slice(last, i), hit: false });
    }
    out.push({ text: m[0], hit: true });
    last = i + m[0].length;
  }
  if (last < text.length) {
    out.push({ text: text.slice(last), hit: false });
  }
  return out;
}

function quoted(s?: string): string {
  return s?.match(/"([^"]+)"/)?.[1] ?? "";
}

function list(terms: string[]): string {
  const q = terms.map((t) => `“${t}”`);
  return q.length <= 1 ? (q[0] ?? "an ambiguous term") : `${q.slice(0, -1).join(", ")} and ${q.at(-1)}`;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Every reason code in words CS can read. Typed as a full Record, so adding a
 * reason code to the rule without a label here fails the type check.
 */
export const REASON_LABELS: Record<ReasonCode, string> = {
  explicit_gambling: "Gambling or betting",
  explicit_adult: "Adult content",
  explicit_weapons: "Weapons",
  explicit_tobacco: "Tobacco or vaping",
  explicit_alcohol: "Alcohol",
  explicit_drugs: "Cannabis or drugs",
  explicit_crypto_exchange: "Crypto or forex trading",
  explicit_payday_loans: "Payday or predatory lending",
  explicit_illegal: "Illegal activity",
  ambiguous_trading: "Possible finance term: trading",
  ambiguous_exchange: "Possible finance term: exchange",
  ambiguous_broker: "Possible finance term: broker",
  ambiguous_desk: "Possible finance term: desk",
  ambiguous_lending: "Possible lending product",
  no_risk_signals: "Nothing restricted found",
  ambiguous_term_no_finance_context: "Finance-like word, not a finance business",
  user_already_verified: "Business already verified",
};

export const ONBOARDING_LABELS: Record<OnboardingState, string> = {
  NOT_STARTED: "Not started",
  START: "Just signed up",
  IDENTIFY: "Identifying the business",
  ENRICHMENT: "Gathering business details",
  MANUAL: "Manual onboarding",
  COMPLETE: "Onboarding complete",
};

/** "Sep 30, 10:00 AM". Short and unambiguous for a person scanning. */
export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
