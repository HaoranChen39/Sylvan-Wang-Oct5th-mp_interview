import { ChevronRight, CircleCheck, ExternalLink, Hourglass, ScrollText, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Eyebrow } from "./components/ui/eyebrow";
import { InsightBar } from "./components/ui/insight-bar";
import { Stat } from "./components/ui/stat";
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
import { type Explanation, explain, highlight } from "./lib/explain";
import { extractHostname, type ReviewResult, reviewBusinessProfile } from "./lib/moderation";

/** Stand-in for the signed-in CS user. */
const REVIEWER = "cs.reviewer";

interface Row {
  profile: QueuedProfile;
  result: ReviewResult;
  explanation: Explanation;
  human?: DecisionEntry;
  outcome: Outcome;
  /** Time in queue; stops counting once a human decides. */
  waitingMs: number;
}

type Filter = "all" | "awaiting" | "allowed" | "blocked" | "human";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "awaiting", label: "Needs decision" },
  { id: "allowed", label: "Allowed" },
  { id: "blocked", label: "Blocked" },
  { id: "human", label: "Decided by a person" },
];

function matchesFilter(row: Row, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "human") return row.human !== undefined;
  return row.outcome === filter;
}

// The rule is deterministic and profiles do not change while the page is open.
const MACHINE = profiles.map((profile) => {
  const result = reviewBusinessProfile(profile, profile.onboardingState);
  return { profile, result, explanation: explain(result, profile) };
});

export function App() {
  const [log, setLog] = useState<DecisionLog>([]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const rows = useMemo<Row[]>(() => {
    const latest = latestDecisions(log);
    return MACHINE.map((m) => {
      const human = latest.get(m.profile.id);
      const end = human ? Date.parse(human.decidedAt) : now;
      return {
        ...m,
        human,
        outcome: outcomeFor(m.result.verdict, human),
        waitingMs: end - Date.parse(m.profile.submittedAt),
      };
    });
  }, [log, now]);

  const summary = useMemo(
    () => summarize(rows.map((r) => ({ profileId: r.profile.id, verdict: r.result.verdict })), log),
    [rows, log]
  );

  const awaiting = rows.filter((r) => r.outcome === "awaiting").sort((a, b) => b.waitingMs - a.waitingMs);

  const decide = (row: Row, decision: HumanDecision, note: string) =>
    setLog((prev) =>
      appendDecision(prev, {
        profileId: row.profile.id,
        decision,
        note,
        reviewer: REVIEWER,
        machine: row.result,
      })
    );

  return (
    <main className="mx-auto flex max-w-[var(--content-max)] flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <Eyebrow>Onboarding</Eyebrow>
        <h1 className="text-cream text-heading-32">Review queue</h1>
        <p className="text-copy-14 text-muted-foreground">
          New businesses checked against Google Ads restricted categories.
        </p>
      </header>

      {/* The one accent on the page: is there anything for me to do? */}
      {awaiting.length > 0 ? (
        <InsightBar icon={<Hourglass />} tone="spark">
          <span className="font-medium">
            {awaiting.length} {awaiting.length === 1 ? "business needs" : "businesses need"} your decision.
          </span>{" "}
          <span className="text-muted-foreground">
            Oldest has waited <span className="font-data">{formatDuration(awaiting[0]!.waitingMs)}</span>.
          </span>
        </InsightBar>
      ) : (
        <InsightBar icon={<CircleCheck />} tone="mint">
          Nothing waiting. Every flagged business has a decision.
        </InsightBar>
      )}

      <SummaryStrip summary={summary} />

      {awaiting.length > 0 ? (
        <section aria-labelledby="needs" className="flex flex-col gap-3">
          <h2 className="text-foreground text-heading-20" id="needs">
            Needs your decision
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {awaiting.map((row) => (
              <ReviewCard key={row.profile.id} onDecide={decide} row={row} />
            ))}
          </div>
        </section>
      ) : null}

      <AllProfiles onDecide={decide} rows={rows} />

      <DecisionLogCard log={log} />
    </main>
  );
}

// ---------------------------------------------------------------------------
// Summary

function SummaryStrip({ summary }: { summary: ReturnType<typeof summarize> }) {
  return (
    <Card className="py-4">
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid grid-cols-3 gap-8">
          <Stat label="Needs decision" size="sm" value={summary.outcome.awaiting} />
          <Stat label="Allowed" size="sm" value={summary.outcome.allowed} />
          <Stat label="Blocked" size="sm" value={summary.outcome.blocked} />
        </div>
        <p className="text-label-12 text-muted-foreground sm:text-right">
          Machine verdicts:{" "}
          <span className="font-data">
            {summary.machine.allow} allow · {summary.machine.review} review · {summary.machine.block} block
          </span>
          <br />
          <span className="font-data">{summary.decidedByHuman}</span> decided by a person
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Review card: everything needed to decide, without leaving the page

function ReviewCard({
  row,
  onDecide,
}: {
  row: Row;
  onDecide: (row: Row, decision: HumanDecision, note: string) => void;
}) {
  const { profile, explanation } = row;
  const [draft, setDraft] = useState<HumanDecision | null>(null);

  return (
    <Card className="gap-4">
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className="text-foreground text-heading-16">
              <Highlighted terms={explanation.terms} text={profile.businessName} />
            </h3>
            <WebsiteLink url={profile.websiteUrl} />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="font-data text-foreground text-label-13-mono">
              {formatDuration(row.waitingMs)}
            </span>
            <span className="text-label-12 text-muted2">waiting</span>
          </div>
        </div>

        <blockquote className="border-l-2 border-line2 pl-3 text-copy-14 text-foreground">
          <Highlighted terms={explanation.terms} text={profile.description} />
          <span className="mt-1 block text-label-12 text-muted-foreground">{profile.industry}</span>
        </blockquote>

        <dl className="grid gap-3 text-copy-13">
          <div className="flex flex-col gap-0.5">
            <dt className="text-label-12 font-medium text-muted-foreground">Why it’s here</dt>
            <dd className="text-foreground">{explanation.why}</dd>
          </div>
          {explanation.check ? (
            <div className="flex flex-col gap-0.5">
              <dt className="text-label-12 font-medium text-muted-foreground">Check</dt>
              <dd className="font-medium text-foreground">{explanation.check}</dd>
            </div>
          ) : null}
        </dl>

        {draft ? (
          <DecisionForm
            decision={draft}
            id={profile.id}
            onCancel={() => setDraft(null)}
            onChangeDecision={setDraft}
            onSubmit={(note) => {
              onDecide(row, draft, note);
              setDraft(null);
            }}
          />
        ) : (
          <div className="flex gap-2 border-t pt-4">
            <Button onClick={() => setDraft("allowed")} size="sm" variant="ghost">
              Allow
            </Button>
            <Button onClick={() => setDraft("blocked")} size="sm" variant="destructive">
              Block
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// All profiles: find a business fast, see what happened and why

function AllProfiles({
  rows,
  onDecide,
}: {
  rows: Row[];
  onDecide: (row: Row, decision: HumanDecision, note: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const q = query.trim().toLowerCase();
  const searched = rows.filter(
    (r) =>
      !q ||
      r.profile.businessName.toLowerCase().includes(q) ||
      r.profile.websiteUrl.toLowerCase().includes(q)
  );
  const visible = searched
    .filter((r) => matchesFilter(r, filter))
    .sort((a, b) => a.profile.businessName.localeCompare(b.profile.businessName));

  return (
    <section aria-labelledby="all" className="flex flex-col gap-3">
      <h2 className="text-foreground text-heading-20" id="all">
        All businesses
      </h2>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <label className="relative flex md:w-72">
          <span className="sr-only">Search by business name or website</span>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="h-9 w-full rounded-control border border-input bg-card pr-3 pl-9 text-label-14 text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or website"
            type="search"
            value={query}
          />
        </label>
        <div className="flex flex-wrap gap-1" role="toolbar" aria-label="Filter">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            const count = searched.filter((r) => matchesFilter(r, f.id)).length;
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
      </div>

      <Card className="gap-0 py-0">
        {visible.length === 0 ? (
          <p className="px-5 py-10 text-center text-copy-14 text-muted-foreground">
            {q ? `No business matches “${query.trim()}”.` : "No businesses in this view."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            <li
              aria-hidden
              className="hidden grid-cols-[minmax(0,14rem)_minmax(0,13rem)_minmax(0,1fr)_4.5rem_1rem] gap-x-4 px-5 py-2.5 md:grid"
            >
              <Eyebrow>Business</Eyebrow>
              <Eyebrow>Verdict</Eyebrow>
              <Eyebrow>Reason</Eyebrow>
              <Eyebrow className="justify-end">In queue</Eyebrow>
              <span />
            </li>
            {visible.map((row) => (
              <ProfileRow key={row.profile.id} onDecide={onDecide} row={row} />
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

function ProfileRow({
  row,
  onDecide,
}: {
  row: Row;
  onDecide: (row: Row, decision: HumanDecision, note: string) => void;
}) {
  const { profile, result, explanation, human } = row;
  const [draft, setDraft] = useState<HumanDecision | null>(null);
  const canDecide = result.verdict === "review";

  return (
    <li>
      <details className="group">
        <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] items-start gap-x-4 gap-y-2 px-5 py-3.5 hover:bg-accent/50 md:grid-cols-[minmax(0,14rem)_minmax(0,13rem)_minmax(0,1fr)_4.5rem_1rem] md:items-center [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-foreground text-label-14">{profile.businessName}</span>
            <span className="truncate text-label-12-mono text-muted-foreground">
              {extractHostname(profile.websiteUrl)}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-1.5 justify-self-end md:justify-self-start">
            <VerdictBadge verdict={result.verdict} />
            {human ? (
              <>
                <span aria-hidden className="text-muted2">→</span>
                <DecisionBadge decision={human.decision} />
              </>
            ) : null}
          </span>
          <span className="col-span-2 text-copy-13 text-muted-foreground md:col-span-1">
            {human ? `“${human.note}”` : explanation.why}
          </span>
          <span className="hidden text-right font-data text-label-12-mono text-muted-foreground md:block">
            {formatDuration(row.waitingMs)}
          </span>
          <ChevronRight aria-hidden className="hidden size-4 text-muted2 transition-transform group-open:rotate-90 md:block" />
        </summary>

        <div className="flex flex-col gap-4 border-t bg-background px-5 py-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex flex-col gap-2">
              <p className="text-copy-14 text-foreground">
                <Highlighted terms={explanation.terms} text={profile.description} />
              </p>
              <span className="text-label-12 text-muted-foreground">{profile.industry}</span>
              <WebsiteLink url={profile.websiteUrl} />
            </div>
            <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-label-12">
              <dt className="text-muted-foreground">Machine reason</dt>
              <dd className="text-foreground">{explanation.why}</dd>
              <dt className="text-muted-foreground">Reason code</dt>
              <dd className="font-mono text-muted2">{result.reasonCode}</dd>
              <dt className="text-muted-foreground">Submitted</dt>
              <dd className="font-data text-muted2">
                <time dateTime={profile.submittedAt}>{new Date(profile.submittedAt).toLocaleString()}</time>
              </dd>
              {human ? (
                <>
                  <dt className="text-muted-foreground">Decided by</dt>
                  <dd className="font-data text-muted2">
                    {human.reviewer} · {new Date(human.decidedAt).toLocaleString()}
                  </dd>
                </>
              ) : null}
            </dl>
          </div>

          {canDecide && human ? (
            draft ? (
              <DecisionForm
                decision={draft}
                id={`${profile.id}-change`}
                onCancel={() => setDraft(null)}
                onChangeDecision={setDraft}
                onSubmit={(note) => {
                  onDecide(row, draft, note);
                  setDraft(null);
                }}
              />
            ) : (
              <div>
                <Button
                  onClick={() => setDraft(human.decision === "allowed" ? "blocked" : "allowed")}
                  size="sm"
                  variant="subtle"
                >
                  Change decision
                </Button>
              </div>
            )
          ) : null}
        </div>
      </details>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {highlight(text, terms).map((s, i) =>
        s.hit ? (
          <mark className="rounded-[3px] bg-amber-fill/25 px-0.5 text-inherit" key={i}>
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        )
      )}
    </>
  );
}

function WebsiteLink({ url }: { url: string }) {
  return (
    <a
      className="inline-flex w-fit items-center gap-1 text-label-12-mono text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      href={url}
      rel="noreferrer noopener"
      target="_blank"
    >
      {extractHostname(url)}
      <ExternalLink aria-hidden className="size-3" />
    </a>
  );
}

function DecisionForm({
  id,
  decision,
  onSubmit,
  onCancel,
  onChangeDecision,
}: {
  id: string;
  decision: HumanDecision;
  onSubmit: (note: string) => void;
  onCancel: () => void;
  onChangeDecision: (d: HumanDecision) => void;
}) {
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const error = validateNote(note);
  const noteId = `note-${id}`;

  return (
    <form
      className="flex flex-col gap-3 border-t pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!error) onSubmit(note);
      }}
    >
      <div aria-label="Decision" className="flex gap-1" role="radiogroup">
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
      </div>
      <label className="flex flex-col gap-1.5" htmlFor={noteId}>
        <span className="text-label-12 font-medium text-muted-foreground">
          Note (required) — what did you check?
        </span>
        <textarea
          aria-describedby={`${noteId}-err`}
          aria-invalid={touched && error ? true : undefined}
          autoFocus
          className="min-h-16 rounded-control border border-input bg-card px-3 py-2 text-copy-14 text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-danger"
          id={noteId}
          onBlur={() => setTouched(true)}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            decision === "allowed"
              ? "e.g. Site only sells home and auto insurance, no investment products"
              : "e.g. Site offers forex trading accounts"
          }
          value={note}
        />
        <span className="min-h-4 text-label-12 text-danger" id={`${noteId}-err`}>
          {touched ? error : null}
        </span>
      </label>
      <div className="flex gap-2">
        <Button
          disabled={Boolean(error)}
          size="sm"
          type="submit"
          variant={decision === "blocked" ? "destructive" : "default"}
        >
          {decision === "allowed" ? "Confirm allow" : "Confirm block"}
        </Button>
        <Button onClick={onCancel} size="sm" variant="subtle">
          Cancel
        </Button>
      </div>
    </form>
  );
}

function DecisionLogCard({ log }: { log: DecisionLog }) {
  const names = new Map(profiles.map((p) => [p.id, p.businessName]));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 [&_svg]:size-4">
          <ScrollText aria-hidden /> Decision log
        </CardTitle>
        <CardDescription>
          Every human decision, newest first. Entries are never edited; a changed decision adds a new one.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {log.length === 0 ? (
          <p className="text-copy-13 text-muted-foreground">No decisions yet.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-border">
            {[...log].reverse().map((e) => (
              <li className="grid gap-2 py-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:items-start" key={e.seq}>
                <span className="font-data text-label-12-mono text-muted2">#{e.seq}</span>
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-foreground text-label-14">{names.get(e.profileId)}</span>
                    <VerdictBadge verdict={e.machineVerdict} />
                    <span aria-hidden className="text-muted2">→</span>
                    <DecisionBadge decision={e.decision} />
                  </div>
                  <p className="text-copy-13 text-muted-foreground">“{e.note}”</p>
                </div>
                <span className="font-data text-label-12-mono text-muted2 sm:text-right">
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
