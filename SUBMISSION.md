# Onboarding review queue — submission

Sylvan Wang · Oct 9, 2026

## Run it

Code is on branch `sylvan/review-queue`.

```
npm install
npm run dev     # http://localhost:5173
npm test        # 40 tests, including the original 5
```

| File | What changed |
| --- | --- |
| `src/App.tsx` | The review queue page |
| `src/components/verdict-badge.tsx` | Badges for machine and human verdicts |
| `src/lib/moderation.ts` | The rule (Task 2 fixes) |
| `src/lib/explain.ts` | Reason codes in plain words; decision tags |
| `src/lib/decisions.ts` | Decision log, summary, patterns |
| `src/styles/theme.css` | One-line fix so cards turn dark inside `.zone-dark` |

## Task 1 · Make the queue readable

The CS team is not technical, so the page uses plain language and no raw codes. They come for two jobs: decide businesses the rule could not decide, and find one business when a customer asks why they were blocked.

| Requirement | Where |
| --- | --- |
| Business, verdict, why, waiting time | Every list row; full detail in the right-hand pane |
| Summary per verdict | Strip under the banner: needs decision / allowed / blocked, machine counts underneath |
| Filter to what needs attention | "Needs decision" filter, on by default, oldest first |
| Use the primitives | Card, Button, Eyebrow, InsightBar, Stat |

**Layout.** List on the left (search, filters, 50 at a time), detail on the right. The oldest waiting business opens on load, so nothing needs a click. The layout works the same at 12 or 2,000 businesses.

**Detail pane** is split into four sections, in the order a reviewer decides: 1 The business · 2 What the rule saw · 3 Decision · 4 Record.

**Where the words come from.** Business details come from `profiles.ts`; verdicts from the rule in `moderation.ts`. The explanations ("why it's here", "check before deciding") are fixed sentences in `explain.ts`, one per reason code. There is no AI.

**StatusBadge.** It knows campaign states, not verdicts. Reusing it would tag an allowed business as a "serving" campaign. I made a sibling, `VerdictBadge`: same look and colours, its own vocabulary. If a third badge type appears, I would extract a shared base.

**Brand rules.** Checked rule by rule: one accent, no hex, brand radii, mono numbers and labels. Inside `.zone-dark`, cards stayed white; the cause was in `theme.css`, fixed in a separate commit (`a699b28`).

## Task 2 · The rule is wrong for some of these

Two verdicts were wrong, two reviews were unnecessary, and one false block was waiting to happen.

| Business | Before | After | Why the rule missed |
| --- | --- | --- | --- |
| Stake House BBQ | block | allow | `\bstake\b` blocks the English word; a steakhouse pun is not the Stake.com brand |
| Loan in a Flash | allow | block | Says "instant loans, no credit check", never "payday"; the rule matched labels, not the product |
| Desk & Chair Co. | review | allow | "Desk" is only suspicious in finance; this is furniture |
| Harbor Parts Exchange | review | allow | Boat parts, no money vocabulary |

**Fixes**

1. "stake" is blocked only as a brand: next to `.com`, or next to casino, sportsbook, bets.
2. Payday lending is blocked by what it is: instant / same-day / fast loans, or "no credit check" with "loan". A plain "loan" goes to review.
3. Ambiguous words (desk, exchange, broker, trading) go to review only if the profile also talks about money. No description stays in review.
4. A bare "bar" no longer counts as alcohol (protein bar, salad bar, bar exam). Cocktail bar, sports bar and pub are still blocked.

**Kept on purpose.** Rateboard and Brightside stay in review: they are real grey areas. Peak Trading Academy stays allowed because an original test protects it. My question for the team: finished onboarding says who a business is, not what it sells today, so I would re-check when the description changes.

**Tests.** The 5 original tests are unchanged and pass. 12 new tests cover each fix, and one pins all 12 verdicts so any future change shows what moved.

**Trade-off.** A wrong block loses a real customer, so blocks need explicit evidence. A wrong review costs a few minutes, so inside finance I lean towards review. Outside finance I stopped reviewing, because noisy reviews teach people to approve without reading. The risk: a bad actor who avoids every money word passes the review step; the explicit rules and Google's own review still apply.

## Task 3 · Put a human in the loop

A reviewer resolves a `review` as allowed or blocked; the machine verdict and the human decision are always shown together.

| Requirement | Where |
| --- | --- |
| Allow or block, with a required note | Detail pane, section 3 |
| Machine verdict next to the human one | List row `REVIEW → ALLOWED`; pane sections 2 and 3; every log entry |
| Append-only log | Each decision adds an entry; nothing is edited or deleted; the latest decision counts |
| Outcome in the summary | Needs decision / allowed / blocked update at once |

**Tags as well as a note.** Notes cannot be counted, so the reviewer also picks what they found from a short list of tags for that reason code (for "broker": insurance broker, securities broker…). For an unexpected case they add their own tag, which is offered next time.

**Patterns.** Under the log, decisions are grouped by reason code and tag. A group becomes a rule candidate at 20 identical decisions from 2+ reviewers; a split group stays with people.

**Decision handling, sized for a team of two or three.** Every decision can be traced to who made it, on what evidence, against what the rule said at the time.

| Built | How it works |
| --- | --- |
| Required evidence | Allow or block needs at least one tag and a note, or it cannot be submitted |
| Log nobody can edit | Each decision is a new entry with reviewer, time, tags, note, and the machine verdict and reason code as shown |
| Changed decisions | A change adds a new entry; the latest is in effect; waiting time stops at the first decision |
| Rule changes | Human decisions stand; each entry keeps the machine verdict the reviewer saw |

| Light process for production | Instead of |
| --- | --- |
| On submit, warn "already decided by Anna" | Locking reviews to one reviewer |
| A 20-minute weekly calibration on changed or split decisions; the agreed cases become the first golden set | Blind double review of a sample |
| Record the rule's code version (git commit) with each decision | A separate rule-versioning system |
| A disputed machine block goes to the policy owner (PM or ops lead) | A formal escalation workflow |
| An insert-only table, so entries cannot be edited | In-memory state (fine for this exercise) |

Heavier process (assignment locks, sampled double review) comes only when the team or volume grows.

## Wrap-up

**Turning repeated human decisions into rules**

1. Capture decisions as tags, so they can be counted.
2. Group by reason code and tag (the patterns view).
3. A group with enough volume, full agreement and 2+ reviewers becomes a rule proposal.
4. The policy owner approves it; the test that pins all verdicts shows which businesses would change.
5. Run the new rule silently next to the old one, then switch.

A group where reviewers disagree stays human. A reviewer-added tag that keeps coming back means a category is missing.

**What to measure**

| Metric | Why |
| --- | --- |
| Allowed businesses later rejected by Google | Risk to Hellyeah's ad account; the most important number |
| Blocks overturned on appeal | Good customers lost |
| Share sent to review | Cost of human time |
| Human agreement per reason code | A review people almost always allow is noise |
| Time to first decision | Customer wait |

**Where an LLM fits**

- **Yes, as the reviewer's assistant:** read the business's website, summarise what it sells, suggest a tag. The reviewer confirms or corrects.
- **No, as the decision-maker:** a block must be explainable, repeatable and testable, and the model would be reading the very site it judges.

The tagged decisions make an LLM measurable before anyone relies on it:

| Set | Contents | Use |
| --- | --- | --- |
| Golden set | Decisions confirmed by two reviewers, every reason code | Scoring only, never tuning |
| Development set | Other tagged decisions | Tuning prompts and tags |
| Regression set | Past mistakes: escapes, wrong blocks, changed decisions | Every new rule or prompt must pass |
| Adversarial set | Pages that try to manipulate the model; lenders avoiding flagged words | Robustness |

Rollout: offline on the golden set → shadow on live reviews → suggestions shown to reviewers. It is used only where it agrees with people as often as people agree with each other.
