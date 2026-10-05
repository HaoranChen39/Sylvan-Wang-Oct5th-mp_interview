# Notes · Sylvan Wang

What I built, what I decided, and why. Talking points for the call.

## Task 1 · The queue

- **Default view is "Needs attention"**, not "All". CS opens this page to make
  decisions; the other eight rows are context, one click away.
- **Sort:** unresolved reviews first, then longest-waiting. The oldest wait is
  also named in the banner, because SLA breaches are what CS gets asked about.
- **One accent:** Spark Orange is only the "N profiles need a decision" banner.
  When nothing waits, it turns mint. Verdicts use the data palette
  (mint allow, amber review, danger block). No hex values anywhere.
- **Waiting** counts from `submittedAt`. Once a human decides, it freezes and
  reads "until decided", which doubles as time-to-decision.
- **Summary** shows two rows on purpose: what the machine said, and what
  actually happens after humans. The gap between them is the human workload.

### StatusBadge

I did **not** reuse `StatusBadge`. Faking it (`status="rejected" label="Block"`)
would store a moderation verdict as a campaign state (`data-status="serving"`
on an allowed profile is false), and any future change to what "serving" looks
like would leak into the queue. Widening its union mixes two domains in a
shared primitive.

So `VerdictBadge` / `DecisionBadge` are siblings: same visual motif, same
palette meaning, their own typed vocabulary. The human badge adds a person
glyph so "Allowed" by a human never reads as the machine's "Allow". If a third
domain needs a badge, that's when I'd extract a tone-only `Badge` both wrap.

## Task 2 · Where the rule misfires

| Profile | Before | After | Why it was wrong |
| --- | --- | --- | --- |
| bp_02 Stake House BBQ | **block** (gambling) | allow | Brand rule `\bstake\b` matches the English word. A steakhouse pun is not Stake.com. |
| bp_09 Loan in a Flash | **allow** | block (payday) | Payday lenders describe the product, not the label: "instant loans", "no credit check", "money within the hour". Nothing said "payday". |
| bp_03 Desk & Chair Co. | review | allow | "Desk" is ambiguous only in finance. This is furniture. |
| bp_12 Harbor Parts Exchange | review | allow | Same: boat parts, no money vocabulary. |

The first two are the real errors (one false block of a good customer, one
false allow of a restricted business). The last two are noise: they cost CS
time and make "review" mean nothing.

**Fixes**

1. `stake` only matches as a brand: next to `.com`/`.us` or gambling words
   (casino, sportsbook, bets). Hostname `stake.com` is still blocked.
2. Payday pattern now covers the product description: instant / same-day /
   fast / emergency loans, and "no credit check" near "loan" in the same
   sentence. A bare "loan" (mortgage broker, SBA lender) goes to **review**
   under a new `ambiguous_lending` code, not block.
3. Ambiguous terms only escalate when the profile also has **finance context**
   (insurance, stocks, forex, currency, crypto, loans…). Without it, and with a
   real description, the result is `allow` with code
   `ambiguous_term_no_finance_context`, and the evidence keeps what was
   ignored, so CS and future-us can audit it. No description → still review.

**Deliberately not changed**

- **bp_04 Rateboard** stays in review. "Currency exchange" is forex vocabulary;
  a 30-second human look is cheaper than letting an FX shop through. This is
  exactly what review is for.
- **bp_07 Vinoteca** (wine) stays blocked. That's policy, not a bug, though a
  real product would probably route alcohol by country to "restricted, needs
  certification" rather than a hard block.
- **Known latent false positive:** `bars?` / `pubs?` in the alcohol list will
  block "protein bars", "salad bar", "bar exam prep". None in this queue, so I
  left it and flagged it here rather than widening the change.

**Trade-off said out loud:** I'm spending false positives on lending and
saving them on furniture. Blocks must be high precision because a wrong block
loses a paying customer with no recourse; misses are partly caught by
downstream Google review. Review is cheap but not free: every noisy review
trains CS to click "allow" without reading. So: block narrowly on explicit
phrases, review broadly *inside* finance, and stop reviewing outside it. The
cost: a disguised bad actor who avoids every money word now gets through the
ambiguous check. I accept that because the explicit patterns, the domain list
and Google's own review still stand behind it.

Tests: 10 new cases in `moderation.test.ts`, including a snapshot of all twelve
verdicts so any future rule change shows its blast radius on real fixtures.

## Task 3 · Human in the loop

- `src/lib/decisions.ts` is pure and tested. The log is a frozen array; the
  only operation is `appendDecision`, which returns a new array. Changing a
  decision appends a new entry; the latest per profile wins.
- Each entry snapshots the machine verdict and reason code the human saw, so
  later rule changes don't rewrite history.
- Note is required (min 5 chars). The UI only offers decisions on `review`
  rows. Overriding a machine `block` is the next thing I'd add, gated harder
  (second reviewer), since bp_02 shows the machine can be wrong there too.

## Wrap-up talking points

**Decisions → rules.** Group the log by (reason code, matched evidence,
industry). When the same pattern gets the same human answer N times with no
disagreement (e.g. `ambiguous_broker` + industry "Insurance" → allowed 20/20),
propose a rule: an allow-context or a new explicit pattern. Propose, don't
auto-apply: a human approves the PR, and the snapshot test shows what else it
changes. Disagreement between reviewers on a pattern is the signal it should
stay human.

**What to measure.**
- Precision of `block` (share later overturned or appealed) — the most
  expensive error.
- Escape rate: allowed profiles later flagged or disapproved by Google.
- Review rate and human-agreement rate per reason code. A code humans allow
  99% of the time is noise; one they split on is doing its job.
- Time in queue (p50/p90) and SLA breaches.
- Per-pattern hit counts, to spot words like "stake" firing far more than the
  category should.

**Where an LLM belongs.**
- Yes: the `review` branch. Read the actual website and produce a structured
  summary for the human ("sells currency conversion tool, no trading
  accounts, no deposits"), with citations. Also: proposing candidate rules
  from the decision log, and drafting the denial message.
- No: as the sole decider on block or allow. The explicit path stays
  deterministic, explainable, testable, and cheap. An LLM verdict can't be
  regression-tested the same way, can be prompt-injected by the very site
  it's judging, and "the model said so" is not a reason we can give a
  customer we just turned away.
