# Hellyeah · Onboarding review queue

A 40-minute build exercise. You get a slice of the real Hellyeah codebase: the
brand design tokens, a handful of UI primitives, and the business rule that
decides whether a newly onboarded business may advertise on Google Ads.

Use whatever tools you normally use, including AI coding assistants. We are
interested in how you think, what you decide, and how you direct the tools, not
in how fast you type.

## Setup (do this before the call)

Node 20 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 5 passing tests
```

## Context

Hellyeah runs ad campaigns for small businesses. Before a business can top up
its wallet, generate creatives or launch a campaign, we check whether it falls
into a category Google Ads restricts (gambling, adult content, weapons,
alcohol, tobacco, cannabis, crypto trading, payday loans, illegal activity).

The check lives in `src/lib/moderation.ts`. It is deterministic, no LLM
involved, and returns one of three verdicts:

| Verdict | Meaning | What happens today |
| --- | --- | --- |
| `allow` | No risk signals | Onboarding continues |
| `review` | Ambiguous signal, low confidence | Deferred to research or a human |
| `block` | Explicit violation, high confidence | Denied with a message |

Right now the customer success team only sees these results as JSON in a log.
`src/App.tsx` renders exactly that dump. Twelve profiles are waiting in
`src/data/profiles.ts`.

## The exercise

### Task 1 · Make the queue readable (about 12 min)

Replace the JSON dump with a review queue the CS team can scan in seconds.
Each row needs the business, its verdict, why (reason code and evidence), and
how long it has been waiting. Add a summary of how many profiles sit in each
verdict and a way to filter to the ones that need attention.

Use the primitives in `src/components/ui`. Note that `StatusBadge` knows
campaign states, not review verdicts. Decide how to handle that and be ready
to explain the choice.

### Task 2 · The rule is wrong for some of these (about 10 min)

Look at the twelve verdicts. At least two are wrong. Find them, explain why the
rule misfires, fix the rule without breaking the existing tests, and add tests
that lock in your fix. Say out loud what trade-off you are making between
catching bad actors and annoying good ones.

### Task 3 · Put a human in the loop (about 10 min)

A `review` verdict is not a decision. Let a CS reviewer resolve a row as
allowed or blocked, with a short required note. Keep the machine verdict
visible next to the human one, record every decision in an append-only log,
and reflect the outcome in the summary. In-memory state is fine.

### Wrap-up (about 5 min)

We will talk through how you would turn repeated human decisions back into
rules, what you would measure to know the check is working, and where an LLM
would and would not belong in this flow.

## Brand rules you must respect

The styles mirror the production design system (`@hellyeah/ui`). The rules:

- **One accent.** Spark Orange (`bg-spark`, `text-spark`) is the only brand
  color. Use it for the single most important thing on screen, nothing else.
- **Never hardcode a hex.** Use semantic classes (`bg-background`,
  `text-foreground`, `border-border`, `bg-card`, `text-muted-foreground`) and
  brand utilities (`text-mint`, `text-amber`, `text-danger`, `text-peri`,
  `text-cream`, `border-line`). The data palette carries meaning:
  mint is good, amber needs attention, danger is stopped, peri is done.
- **Radii** are `rounded-card` (14px), `rounded-control` (10px),
  `rounded-badge` (6px, squared badges and chips), `rounded-pill`.
- **Numbers, IDs and timestamps** are `font-mono tabular-nums` or the
  `.font-data` helper. Labels and eyebrows are mono uppercase.
- **Type roles** come from `src/styles/type.css`: `text-heading-24`,
  `text-copy-14`, `text-label-13` and so on. Prefer them over one-off sizes.
- **Light is default.** Wrap a block in `.zone-dark` to invert every token.
  Anything you build should still read correctly inside one.
- Hairlines over shadows. Content visible before any animation.

The full token set is in `src/styles/tokens.css`. The bridge that exposes
tokens to Tailwind is `src/styles/theme.css`.

## Layout

```
src/
  App.tsx                 starter screen (the JSON dump)
  data/profiles.ts        the twelve queued profiles
  lib/moderation.ts       the business rule
  lib/moderation.test.ts  baseline tests (keep them green)
  components/ui/          Button, Card, Chip, Eyebrow, InsightBar, Stat, StatusBadge
  styles/                 tokens, theme bridge, base, type roles, utilities
```
