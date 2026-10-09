/**
 * Restricted-industry review for Hellyeah onboarding.
 *
 * Extracted and trimmed from `packages/shared/src/restricted-industries.ts`.
 * Before a business can top up a wallet, generate creatives or launch a
 * campaign, we decide whether it is allowed to advertise on Google Ads at all.
 *
 * Three verdicts:
 *   allow  — no risk signals, continue the normal flow
 *   review — ambiguous signals, a human (or deeper research) decides
 *   block  — explicit violation, deny with a message
 *
 * Everything here is deterministic: no LLM calls, no network requests.
 */

export type RestrictedCategory =
  | "gambling"
  | "adult-content"
  | "weapons"
  | "tobacco"
  | "alcohol"
  | "recreational-drugs"
  | "cryptocurrency-trading"
  | "payday-loans"
  | "illegal-activity";

export type ReviewVerdict = "allow" | "review" | "block";

/** Where the business is in onboarding when the check runs. */
export type OnboardingState =
  | "NOT_STARTED"
  | "START"
  | "IDENTIFY"
  | "ENRICHMENT"
  | "MANUAL"
  | "COMPLETE";

export type ReasonCode =
  // block: explicit violations (high confidence)
  | "explicit_gambling"
  | "explicit_adult"
  | "explicit_weapons"
  | "explicit_tobacco"
  | "explicit_alcohol"
  | "explicit_drugs"
  | "explicit_crypto_exchange"
  | "explicit_payday_loans"
  | "explicit_illegal"
  // review: ambiguous signals (low confidence, needs context)
  | "ambiguous_trading"
  | "ambiguous_exchange"
  | "ambiguous_broker"
  | "ambiguous_desk"
  | "ambiguous_lending"
  // allow
  | "no_risk_signals"
  | "ambiguous_term_no_finance_context"
  | "user_already_verified";

export interface BusinessProfileInput {
  businessName?: string | null;
  websiteUrl?: string | null;
  industry?: string | null;
  description?: string | null;
}

export interface ReviewResult {
  verdict: ReviewVerdict;
  confidence: "high" | "low";
  reasonCode: ReasonCode;
  category?: RestrictedCategory;
  /** The matched strings that produced the verdict. */
  evidence: string[];
  suggestedAction:
    | "deny_with_message"
    | "proceed_to_research"
    | "continue_normal_flow";
}

export const CATEGORY_LABELS: Record<RestrictedCategory, string> = {
  gambling: "gambling and sports betting",
  "adult-content": "adult content and sexual products",
  weapons: "weapons and firearms",
  alcohol: "alcohol and liquor retail",
  tobacco: "tobacco and vaping products",
  "recreational-drugs": "recreational drugs and cannabis",
  "cryptocurrency-trading": "cryptocurrency trading and forex",
  "payday-loans": "payday loans and predatory lending",
  "illegal-activity": "illegal activity",
};

// ---------------------------------------------------------------------------
// Explicit patterns — block
// ---------------------------------------------------------------------------

/** Known restricted hostnames. Matched against the website hostname only. */
const RESTRICTED_DOMAINS: Array<{ domain: string; category: RestrictedCategory }> =
  [
    { domain: "bet365.com", category: "gambling" },
    { domain: "draftkings.com", category: "gambling" },
    { domain: "fanduel.com", category: "gambling" },
    { domain: "pokerstars.com", category: "gambling" },
    { domain: "stake.com", category: "gambling" },
    { domain: "1xbet.com", category: "gambling" },
    { domain: "onlyfans.com", category: "adult-content" },
    { domain: "lovense.com", category: "adult-content" },
  ];

const RESTRICTED_TLDS: Array<{ pattern: RegExp; category: RestrictedCategory }> =
  [
    { pattern: /\.bet$/i, category: "gambling" },
    { pattern: /\.casino$/i, category: "gambling" },
    { pattern: /\.poker$/i, category: "gambling" },
    { pattern: /\.xxx$/i, category: "adult-content" },
    { pattern: /\.adult$/i, category: "adult-content" },
  ];

/**
 * Restricted brand names in free text, e.g. "launch a campaign for bet 365".
 * Allows the spacing variations hostname matching cannot handle.
 */
const RESTRICTED_BRAND_TEXT_PATTERNS: Array<{
  pattern: RegExp;
  category: RestrictedCategory;
}> = [
  { pattern: /\bbet\s*365\b/i, category: "gambling" },
  { pattern: /\bdraftkings\b/i, category: "gambling" },
  { pattern: /\bfanduel\b/i, category: "gambling" },
  { pattern: /\bpoker\s*stars\b/i, category: "gambling" },
  // "stake" is an ordinary English word ("Stake House BBQ", "high stakes",
  // "stake a claim"). On its own it is not evidence of the Stake.com brand, so
  // only match it next to a domain suffix or gambling vocabulary. The hostname
  // check above still catches stake.com itself.
  {
    pattern:
      /\bstake(?:\s*\.\s*(?:com|us)\b|\s+(?:casino|sportsbook|poker|bets?|betting|originals)\b)/i,
    category: "gambling",
  },
  { pattern: /\b1xbet\b/i, category: "gambling" },
  { pattern: /\btotal\s*wine\b/i, category: "alcohol" },
  { pattern: /\bonlyfans\b/i, category: "adult-content" },
];

/** High-signal category vocabulary. A single hit is an explicit violation. */
const HIGH_SIGNAL_PATTERNS: Array<{
  pattern: RegExp;
  category: RestrictedCategory;
}> = [
  {
    pattern:
      /\b(?:gambl(?:e|ing|er)|casinos?|sports?[\W_]*bet(?:s|ting)?|sportsbooks?|bookmakers?|bookies|wager(?:ing)?|i[\W_]*gaming|online[\W_]*poker|poker[\W_]*rooms?|slot[\W_]*machines?|roulette)\b/iu,
    category: "gambling",
  },
  {
    pattern:
      /\b(?:porn(?:ography)?|xxx|onlyfans|adult[\W_]*(?:content|entertainment|store|shop|toys?|novelties)|sex[\W_]*toys?|vibrators?|dildos?|escort[\W_]*services?|erotic)\b/iu,
    category: "adult-content",
  },
  {
    pattern:
      /\b(?:guns?|fire[\W_]*arms?|weapons?|ammunition|ammo|gun[\W_]*(?:shop|store|dealer)s?|assault[\W_]*rifles?|silencers?|suppressors?)\b/iu,
    category: "weapons",
  },
  {
    pattern:
      /\b(?:tobacco|cigarettes?|vapes?|vaping|e[\W_]*cigarettes?|nicotine|cigars?|hookah)\b/iu,
    category: "tobacco",
  },
  {
    pattern:
      // A bare "bar" is not alcohol: protein bars, salad bars, bar exam prep.
      // Only block it next to a drinks word, or as "bar & grill". "pub"
      // stays: it almost always means a place that serves alcohol.
      /\b(?:liquor|alcohol(?:ic)?|beer|wine|brewery|breweries|distillery|distilleries|wineries|bottle[\W_]*shops?|(?:gastro)?pubs?|(?:cocktail|sports|whisk(?:e)?y|tiki|dive|tapas)[\W_]*bars?|bars?[\W_]*(?:&|and)[\W_]*grill)\b/iu,
    category: "alcohol",
  },
  {
    pattern:
      /\b(?:cannabis|marijuana|weed|dispensar(?:y|ies)|thc|cbd|recreational[\W_]*drugs?)\b/iu,
    category: "recreational-drugs",
  },
  {
    pattern:
      /\b(?:(?:crypto|cryptocurrency|bitcoin|forex)[\W_]*(?:exchange|trading|broker|brokers|platform)|(?:buy|sell|trade)[\W_]*(?:crypto|bitcoin)|binary[\W_]*options?)\b/iu,
    category: "cryptocurrency-trading",
  },
  {
    pattern:
      // Payday lenders rarely call themselves "payday", so "no credit check"
      // near "loan" (even across a sentence) also counts as explicit. Speed
      // alone ("fast personal loans") is NOT explicit evidence: it goes to
      // review through the ambiguous "loan" signal instead.
      /\b(?:payday[\W_]*loans?|payday[\W_]*lend(?:er|ing)|title[\W_]*loans?|cash[\W_]*advance[\W_]*loans?|predatory[\W_]*lend(?:er|ing)|no[\W_]*credit[\W_]*check[\W_]*(?:cash[\W_]*)?loans?|(?<=\bloans?\b[\s\S]{0,200})no[\W_]*credit[\W_]*check|no[\W_]*credit[\W_]*check(?=[\s\S]{0,200}\bloans?\b))\b/iu,
    category: "payday-loans",
  },
  {
    pattern:
      /\b(?:fake[\W_]*ids?|counterfeit|forged?[\W_]*documents?|money[\W_]*laundering|human[\W_]*trafficking|dark[\W_]*web|stolen[\W_]*(?:goods|merchandise)|drug[\W_]*(?:trafficking|dealing|dealer)|hacking[\W_]*(?:services?|tools?)|identity[\W_]*theft|pyramid[\W_]*schemes?|ponzi[\W_]*schemes?)\b/iu,
    category: "illegal-activity",
  },
];

// ---------------------------------------------------------------------------
// Ambiguous patterns — review
// ---------------------------------------------------------------------------

/**
 * Terms with a legitimate meaning in most businesses and a restricted one in
 * finance. They never block on their own; they ask for more context.
 */
const AMBIGUOUS_PATTERNS: Array<{ reasonCode: ReasonCode; patterns: RegExp[] }> =
  [
    {
      reasonCode: "ambiguous_trading",
      patterns: [/\btrading\b/i, /\btrader\b/i, /\bday[\s-]*trading\b/i],
    },
    { reasonCode: "ambiguous_exchange", patterns: [/\bexchanges?\b/i] },
    { reasonCode: "ambiguous_broker", patterns: [/\bbrokers?\b/i] },
    { reasonCode: "ambiguous_desk", patterns: [/\bdesk\b/i, /\btrading desk\b/i] },
    // Mortgage brokers, student-loan refinancing and SBA lenders are fine;
    // short-term consumer loans are not. A bare "loan" needs a human.
    { reasonCode: "ambiguous_lending", patterns: [/\bloans?\b/i, /\blending\b/i] },
  ];

/**
 * The ambiguous terms above only carry their restricted meaning in a finance
 * setting. A "desk" at a furniture shop or an "exchange" for boat parts is not
 * a trading desk or a crypto exchange. We only escalate an ambiguous term when
 * the profile also talks about money markets, investing or financial services.
 *
 * Deliberately broad: a false hit here costs one human look, a miss lets a
 * forex shop through. "trading", "exchange", "broker" and "desk" are not in
 * this list, so they cannot supply their own context ("trading card shop").
 * Lending words are, on purpose: any loan product goes to a human.
 */
const FINANCE_CONTEXT =
  /\b(?:financ(?:e|ial|ing)|insurance|invest(?:ing|ment|ments|or|ors)?|stocks?|equit(?:y|ies)|options|futures|securities|forex|fx|currenc(?:y|ies)|crypto(?:currency|currencies)?|bitcoin|ethereum|tokens?|coins?|portfolios?|wealth|brokerage|margin|leverage|commodit(?:y|ies)|credit|loans?|lending|mortgages?|money|cash|banking|fintech|payments?)\b/i;

export function hasFinanceContext(text: string): boolean {
  return FINANCE_CONTEXT.test(text);
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

export interface ExplicitViolation {
  category: RestrictedCategory;
  reasonCode: ReasonCode;
  evidence: string[];
}

export interface AmbiguousSignal {
  reasonCode: ReasonCode;
  signal: string;
}

/**
 * URL and text are checked separately so hostname patterns never match free
 * text (e.g. a domain rule for `stake.com` must not fire on "stakeholders").
 */
export function checkExplicitViolations(
  text?: string | null,
  url?: string | null
): ExplicitViolation | null {
  if (url) {
    const hostname = extractHostname(url);
    if (hostname) {
      for (const { domain, category } of RESTRICTED_DOMAINS) {
        if (hostname === domain || hostname.endsWith(`.${domain}`)) {
          return {
            category,
            reasonCode: categoryToReasonCode(category),
            evidence: [hostname],
          };
        }
      }
      for (const { pattern, category } of RESTRICTED_TLDS) {
        if (pattern.test(hostname)) {
          return {
            category,
            reasonCode: categoryToReasonCode(category),
            evidence: [hostname],
          };
        }
      }
    }
  }

  if (text) {
    for (const { pattern, category } of HIGH_SIGNAL_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        return {
          category,
          reasonCode: categoryToReasonCode(category),
          evidence: [match[0]],
        };
      }
    }
    for (const { pattern, category } of RESTRICTED_BRAND_TEXT_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        return {
          category,
          reasonCode: categoryToReasonCode(category),
          evidence: [match[0]],
        };
      }
    }
  }

  return null;
}

export function checkAmbiguousSignals(text: string): AmbiguousSignal[] {
  if (!text) {
    return [];
  }
  const signals: AmbiguousSignal[] = [];
  for (const { reasonCode, patterns } of AMBIGUOUS_PATTERNS) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        signals.push({ reasonCode, signal: match[0] });
        break; // one signal per reason code
      }
    }
  }
  return signals;
}

/**
 * State-aware review of a business profile.
 *
 * - explicit violation → block, whatever the onboarding state
 * - ambiguous signal, described business, no finance context → allow
 * - ambiguous signal during onboarding → review (defer to research / a human)
 * - ambiguous signal after onboarding is COMPLETE → allow (the user is verified)
 * - nothing → allow
 */
export function reviewBusinessProfile(
  profile: BusinessProfileInput,
  onboardingState: OnboardingState
): ReviewResult {
  const text = [profile.businessName, profile.industry, profile.description]
    .filter(Boolean)
    .join(" ");

  const explicit = checkExplicitViolations(text, profile.websiteUrl);
  if (explicit) {
    return {
      verdict: "block",
      confidence: "high",
      reasonCode: explicit.reasonCode,
      category: explicit.category,
      evidence: explicit.evidence,
      suggestedAction: "deny_with_message",
    };
  }

  const ambiguous = checkAmbiguousSignals(`${profile.websiteUrl ?? ""} ${text}`);
  if (ambiguous.length > 0) {
    const first = ambiguous[0]!;

    // A described business with no finance vocabulary at all: the term is
    // being used in its everyday sense. Keep the trace in evidence so CS can
    // see what was considered and discarded. A profile with no description
    // stays in review: we cannot tell, so a human should.
    const described = (profile.description ?? "").trim().length > 0;
    // Same text the ambiguous check read, URL included: a "crypto" in the
    // website address is financial context too.
    if (described && !hasFinanceContext(`${profile.websiteUrl ?? ""} ${text}`)) {
      return {
        verdict: "allow",
        confidence: "high",
        reasonCode: "ambiguous_term_no_finance_context",
        evidence: ambiguous.map(
          (s) => `"${s.signal}" ignored: no financial context`
        ),
        suggestedAction: "continue_normal_flow",
      };
    }

    if (onboardingState === "COMPLETE") {
      return {
        verdict: "allow",
        confidence: "high",
        reasonCode: "user_already_verified",
        evidence: [`ambiguous term "${first.signal}" but user already verified`],
        suggestedAction: "continue_normal_flow",
      };
    }
    // Every other state (onboarding in progress, or MANUAL) defers.
    return {
      verdict: "review",
      confidence: "low",
      reasonCode: first.reasonCode,
      evidence: ambiguous.map((s) => s.signal),
      suggestedAction: "proceed_to_research",
    };
  }

  return {
    verdict: "allow",
    confidence: "high",
    reasonCode: "no_risk_signals",
    evidence: ["no restricted keywords detected"],
    suggestedAction: "continue_normal_flow",
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function categoryToReasonCode(category: RestrictedCategory): ReasonCode {
  switch (category) {
    case "gambling":
      return "explicit_gambling";
    case "adult-content":
      return "explicit_adult";
    case "weapons":
      return "explicit_weapons";
    case "tobacco":
      return "explicit_tobacco";
    case "alcohol":
      return "explicit_alcohol";
    case "recreational-drugs":
      return "explicit_drugs";
    case "cryptocurrency-trading":
      return "explicit_crypto_exchange";
    case "payday-loans":
      return "explicit_payday_loans";
    case "illegal-activity":
      return "explicit_illegal";
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

const WWW_PREFIX_RE = /^www\./;

export function extractHostname(url: string): string | null {
  try {
    const normalized = url.startsWith("http") ? url : `https://${url}`;
    return new URL(normalized).hostname.replace(WWW_PREFIX_RE, "").toLowerCase();
  } catch {
    return (url.replace(WWW_PREFIX_RE, "").split("/")[0] ?? "").toLowerCase();
  }
}
