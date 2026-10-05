import { CircleCheck, Hourglass, ScrollText } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Chip } from "./components/ui/chip";
import { Eyebrow } from "./components/ui/eyebrow";
import { InsightBar } from "./components/ui/insight-bar";
import { Stat } from "./components/ui/stat";
import { cn } from "./components/ui/utils";
import { DecisionBadge, VerdictBadge } from "./components/verdict-badge";
import { type QueuedProfile, profiles } from "./data/profiles";
import {
  appendDecision,
  type DecisionEntry,
  type DecisionLog,
  formatDuration,
  type HumanDecision,
  latestDecisions,
  type Outcome,
  outcomeFor,
  summarize,
  validateNote,
} from "./lib/decisions";
import {
  CATEGORY_LABELS,
  extractHostname,
  type ReviewResult,
  reviewBusinessProfile,
} from "./lib/moderation";

/** Stand-in for the signed-in CS user. */
const REVIEWER = "cs.reviewer";

type Filter = "attention" | "all" | "allow" | "review" | "block" | "human";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "attention", label: "Needs attention" },
  { id: "all", label: "All" },
  { id: "allow", label: "Allow" },
  { id: "review", label: "Review" },
  { id: "block", label: "Block" },
  { id: "human", label: "Decided by human" },
];

interface Row {
  profile: QueuedProfile;
  result: ReviewResult;
  human?: DecisionEntry;
  outcome: Outcome;
  needsAttention: boolean;
  /** Time in queue; stops counting once a human decides. */
  waitingMs: number;
}

function matches(row: Row, filter: Filter): boolean {
  switch (filter) {
    case "attention":
      return row.needsAttention;
    case "all":
      return true;
    case "human":
      return row.human !== undefined;
    default:
      return row.result.verdict === filter;
  }
}

// Machine verdicts are computed once: the rule is deterministic and the
// profiles do not change while the page is open.
const MACHINE = profiles.map((profile) => ({
  profile,
  result: reviewBusinessProfile(profile, profile.onboardingState),
}));

export function App() {
  const [log, setLog] = useState<DecisionLog>([]);
  const [filter, setFilter] = useState<Filter>("attention");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const rows = useMemo<Row[]>(() => {
    const latest = latestDecisions(log);
    return MACHINE.map(({ profile, result }) => {
      const human = latest.get(profile.id);
      const outcome = outcomeFor(result.verdict, human);
      const submitted = Date.parse(profile.submittedAt);
      const end = human ? Date.parse(human.decidedAt) : now;
      return {
        profile,
        result,
        human,
        outcome,
        needsAttention: outcome === "awaiting",
        waitingMs: end - submitted,
      };
    }).sort(
      (a, b) =>
        Number(b.needsAttention) - Number(a.needsAttention) ||
        b.waitingMs - a.waitingMs
    );
  }, [log, now]);

  const summary = useMemo(
    () =>
      summarize(
        rows.map((r) => ({ profileId: r.profile.id, verdict: r.result.verdict })),
        log
      ),
    [rows, log]
  );

  const attention = rows.filter((r) => r.needsAttention);
  const oldest = attention[0];
  const visible = rows.filter((r) => matches(r, filter));

  const decide = (row: Row, decision: HumanDecision, note: string) => {
    setLog((prev) =>
      appendDecision(prev, {
        profileId: row.profile.id,
        decision,
        note,
        reviewer: REVIEWER,
        machine: row.result,
      })
    );
  };

  return (
    <main className="mx-auto flex max-w-[var(--content-max)] flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <Eyebrow>Onboarding</Eyebrow>
        <h1 className="text-cream text-heading-32">Review queue</h1>
        <p className="text-copy-14 text-muted-foreground">
          {rows.length} profiles checked against the restricted-industry policy.
        </p>
      </header>

      {/* The one accent on the page: what CS should do next. */}
      {oldest ? (
        <InsightBar
          action={
            filter === "attention" ? null : (
              <Button onClick={() => setFilter("attention")} size="sm">
                Show them
              </Button>
            )
          }
          icon={<Hourglass />}
          tone="spark"
        >
          <span className="font-medium">
            {attention.length} {attention.length === 1 ? "profile needs" : "profiles need"} a decision.
          </span>{" "}
          <span className="text-muted-foreground">
            Oldest is {oldest.profile.businessName}, waiting{" "}
            <span className="font-data">{formatDuration(oldest.waitingMs)}</span>.
          </span>
        </InsightBar>
      ) : (
        <InsightBar icon={<CircleCheck />} tone="mint">
          Nothing waiting. Every review has a human decision.
        </InsightBar>
      )}

      <SummaryCard summary={summary} />

      <section aria-label="Queue" className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5" role="toolbar">
          {FILTERS.map((f) => {
            const count = rows.filter((r) => matches(r, f.id)).length;
            const active = filter === f.id;
            return (
              <Button
                aria-pressed={active}
                key={f.id}
                onClick={() => setFilter(f.id)}
                size="sm"
                variant={active ? "ghost" : "subtle"}
              >
                {f.label}
                <span className="font-data text-muted-foreground">{count}</span>
              </Button>
            );
          })}
        </div>

        <Card className="gap-0 py-0">
          <div
            className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.7fr)_5.5rem_minmax(0,1.5fr)] gap-4 border-b px-5 py-3 lg:grid"
            role="presentation"
          >
            {["Business", "Machine verdict · why", "Waiting", "Human decision"].map((h) => (
              <Eyebrow key={h}>{h}</Eyebrow>
            ))}
          </div>
          {visible.length === 0 ? (
            <p className="px-5 py-10 text-center text-copy-14 text-muted-foreground">
              {filter === "attention" ? "Nothing needs a decision right now." : "No profiles match this filter."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((row) => (
                <QueueRow key={row.profile.id} onDecide={decide} row={row} />
              ))}
            </ul>
          )}
        </Card>
      </section>

      <DecisionLogCard log={log} />
    </main>
  );
}

// ---------------------------------------------------------------------------

const OUTCOME_DOT: Record<Outcome | "allow" | "review" | "block", string> = {
  allow: "bg-mint",
  allowed: "bg-mint",
  review: "bg-amber",
  awaiting: "bg-amber",
  block: "bg-danger",
  blocked: "bg-danger",
};

function DotLabel({ tone, children }: { tone: keyof typeof OUTCOME_DOT; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn("size-1.5 rounded-full", OUTCOME_DOT[tone])} />
      {children}
    </span>
  );
}

function SummaryCard({ summary }: { summary: ReturnType<typeof summarize> }) {
  return (
    <Card>
      <CardContent className="grid gap-8 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Eyebrow>Machine verdict</Eyebrow>
          <div className="grid grid-cols-3 gap-4">
            <Stat label={<DotLabel tone="allow">Allow</DotLabel>} size="sm" value={summary.machine.allow} />
            <Stat label={<DotLabel tone="review">Review</DotLabel>} size="sm" value={summary.machine.review} />
            <Stat label={<DotLabel tone="block">Block</DotLabel>} size="sm" value={summary.machine.block} />
          </div>
        </div>
        <div className="flex flex-col gap-4 md:border-l md:pl-8">
          <Eyebrow>Outcome after human review</Eyebrow>
          <div className="grid grid-cols-3 gap-4">
            <Stat label={<DotLabel tone="allowed">Allowed</DotLabel>} size="sm" value={summary.outcome.allowed} />
            <Stat label={<DotLabel tone="blocked">Blocked</DotLabel>} size="sm" value={summary.outcome.blocked} />
            <Stat label={<DotLabel tone="awaiting">Awaiting</DotLabel>} size="sm" value={summary.outcome.awaiting} />
          </div>
          <p className="text-label-12-mono text-muted2">
            {summary.decidedByHuman} decided by a human
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function QueueRow({
  row,
  onDecide,
}: {
  row: Row;
  onDecide: (row: Row, decision: HumanDecision, note: string) => void;
}) {
  const { profile, result, human } = row;
  const [draft, setDraft] = useState<HumanDecision | null>(null);
  const canDecide = result.verdict === "review";
  const host = extractHostname(profile.websiteUrl);

  return (
    <li className="flex flex-col gap-4 px-5 py-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.7fr)_5.5rem_minmax(0,1.5fr)] lg:gap-4">
        {/* Business */}
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex items-center gap-2 text-foreground text-label-14 font-medium">
            {row.needsAttention ? (
              <span aria-label="Needs attention" className="size-1.5 shrink-0 rounded-full bg-amber" />
            ) : null}
            <span className="truncate">{profile.businessName}</span>
          </span>
          <span className="truncate text-label-12-mono text-muted-foreground">{host}</span>
          <span className="text-label-12 text-muted2">
            {profile.industry} · <span className="font-mono uppercase">{profile.onboardingState}</span>
          </span>
        </div>

        {/* Machine verdict + why */}
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <VerdictBadge verdict={result.verdict} />
            <span className="text-label-12-mono text-foreground">{result.reasonCode}</span>
          </div>
          {result.category ? (
            <span className="text-label-12 text-muted-foreground">
              {CATEGORY_LABELS[result.category]}
            </span>
          ) : null}
          <div className="flex flex-wrap gap-1">
            {result.evidence.map((e) => (
              <Chip key={e} size="sm" variant="outline">
                {e}
              </Chip>
            ))}
          </div>
        </div>

        {/* Waiting */}
        <div className="flex flex-col gap-0.5">
          <span className={cn("font-data text-label-13-mono", row.needsAttention ? "text-foreground" : "text-muted-foreground")}>
            {formatDuration(row.waitingMs)}
          </span>
          <span className="text-label-12 text-muted2">
            {human ? "until decided" : row.needsAttention ? "in queue" : "since submit"}
          </span>
        </div>

        {/* Human decision */}
        <div className="flex min-w-0 flex-col gap-1.5">
          {human ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <DecisionBadge decision={human.decision} />
                {canDecide && draft === null ? (
                  <Button onClick={() => setDraft(human.decision === "allowed" ? "blocked" : "allowed")} size="sm" variant="subtle">
                    Change
                  </Button>
                ) : null}
              </div>
              <p className="text-copy-13 text-foreground">“{human.note}”</p>
              <span className="text-label-12-mono text-muted2">
                {human.reviewer} · <time dateTime={human.decidedAt}>{new Date(human.decidedAt).toLocaleString()}</time>
              </span>
            </>
          ) : canDecide ? (
            draft === null ? (
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setDraft("allowed")} size="sm" variant="ghost">
                  Allow…
                </Button>
                <Button onClick={() => setDraft("blocked")} size="sm" variant="destructive">
                  Block…
                </Button>
              </div>
            ) : null
          ) : (
            <span className="text-label-12 text-muted2">
              Machine decision
            </span>
          )}
        </div>
      </div>

      {draft ? (
        <DecisionForm
          decision={draft}
          onCancel={() => setDraft(null)}
          onChangeDecision={setDraft}
          onSubmit={(note) => {
            onDecide(row, draft, note);
            setDraft(null);
          }}
          profileName={profile.businessName}
        />
      ) : null}
    </li>
  );
}

function DecisionForm({
  decision,
  profileName,
  onSubmit,
  onCancel,
  onChangeDecision,
}: {
  decision: HumanDecision;
  profileName: string;
  onSubmit: (note: string) => void;
  onCancel: () => void;
  onChangeDecision: (d: HumanDecision) => void;
}) {
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const error = validateNote(note);
  const id = `note-${profileName.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <form
      className="flex flex-col gap-3 rounded-control border bg-background p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!error) {
          onSubmit(note);
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Decision">
        {(["allowed", "blocked"] as const).map((d) => (
          <Button
            aria-checked={decision === d}
            key={d}
            onClick={() => onChangeDecision(d)}
            role="radio"
            size="sm"
            variant={decision === d ? "ghost" : "subtle"}
          >
            {d === "allowed" ? "Allow" : "Block"}
          </Button>
        ))}
        <span className="text-label-13 text-muted-foreground">{profileName}</span>
      </div>
      <label className="flex flex-col gap-1.5" htmlFor={id}>
        <span className="text-label-12-mono uppercase tracking-eyebrow text-muted-foreground">
          Why (required)
        </span>
        <textarea
          aria-describedby={`${id}-err`}
          aria-invalid={touched && error ? true : undefined}
          autoFocus
          className="min-h-16 rounded-control border border-input bg-card px-3 py-2 text-copy-14 text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-danger"
          id={id}
          onBlur={() => setTouched(true)}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            decision === "allowed"
              ? "e.g. Insurance broker, not a securities or crypto broker"
              : "e.g. Offers forex trading accounts on the site"
          }
          value={note}
        />
        <span className="min-h-4 text-label-12 text-danger" id={`${id}-err`}>
          {touched ? error : null}
        </span>
      </label>
      <div className="flex gap-2">
        <Button disabled={Boolean(error)} size="sm" type="submit" variant={decision === "blocked" ? "destructive" : "default"}>
          {decision === "allowed" ? "Confirm allow" : "Confirm block"}
        </Button>
        <Button onClick={onCancel} size="sm" variant="subtle">
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

function DecisionLogCard({ log }: { log: DecisionLog }) {
  const byId = new Map(profiles.map((p) => [p.id, p.businessName]));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 [&_svg]:size-4">
          <ScrollText aria-hidden /> Decision log
        </CardTitle>
        <CardDescription>
          Append-only. Changing a decision adds a new entry; nothing is edited or removed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {log.length === 0 ? (
          <p className="text-copy-13 text-muted-foreground">No decisions yet.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-border">
            {[...log].reverse().map((e) => (
              <li className="grid gap-2 py-3 sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:items-start" key={e.seq}>
                <span className="font-data text-label-12-mono text-muted2">#{e.seq}</span>
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-foreground text-label-14">{byId.get(e.profileId)}</span>
                    <VerdictBadge verdict={e.machineVerdict} />
                    <span aria-hidden className="text-muted2">→</span>
                    <DecisionBadge decision={e.decision} />
                  </div>
                  <p className="text-copy-13 text-muted-foreground">“{e.note}”</p>
                </div>
                <span className="text-label-12-mono text-muted2 sm:text-right">
                  {e.reviewer}
                  <br />
                  <time dateTime={e.decidedAt}>{new Date(e.decidedAt).toLocaleString()}</time>
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
