import { CircleCheck, ExternalLink, Hourglass, ScrollText, Search } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
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
import { type Explanation, explain, highlight } from "./lib/explain";
import { extractHostname, type ReviewResult, reviewBusinessProfile } from "./lib/moderation";

/** Stand-in for the signed-in CS user. */
const REVIEWER = "cs.reviewer";

/**
 * The list renders in pages so the panel stays fast when the queue holds
 * thousands of businesses. In production this becomes server-side paging.
 */
const PAGE_SIZE = 50;

interface Row {
  profile: QueuedProfile;
  result: ReviewResult;
  explanation: Explanation;
  human?: DecisionEntry;
  history: DecisionEntry[];
  outcome: Outcome;
  /** Time in queue; stops counting once a human decides. */
  waitingMs: number;
}

type Filter = "awaiting" | "all" | "allowed" | "blocked" | "human";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "awaiting", label: "Needs decision" },
  { id: "all", label: "All" },
  { id: "allowed", label: "Allowed" },
  { id: "blocked", label: "Blocked" },
  { id: "human", label: "By a person" },
];

function matchesFilter(row: Row, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "human") return row.human !== undefined;
  return row.outcome === filter;
}

/** Work queue: oldest first, so nothing silently ages. Look-up views: A–Z. */
function sortFor(filter: Filter) {
  return filter === "awaiting"
    ? (a: Row, b: Row) => b.waitingMs - a.waitingMs
    : (a: Row, b: Row) => a.profile.businessName.localeCompare(b.profile.businessName);
}

// The rule is deterministic and profiles do not change while the page is open.
const MACHINE = profiles.map((profile) => {
  const result = reviewBusinessProfile(profile, profile.onboardingState);
  return { profile, result, explanation: explain(result, profile) };
});

export function App() {
  const [log, setLog] = useState<DecisionLog>([]);
  const [now, setNow] = useState(() => Date.now());
  const [filter, setFilter] = useState<Filter>("awaiting");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<HumanDecision | null>(null);
  const [lastSaved, setLastSaved] = useState<{ name: string; decision: HumanDecision } | null>(null);

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
        history: log.filter((e) => e.profileId === m.profile.id),
        outcome: outcomeFor(m.result.verdict, human),
        waitingMs: end - Date.parse(m.profile.submittedAt),
      };
    });
  }, [log, now]);

  const summary = useMemo(
    () => summarize(rows.map((r) => ({ profileId: r.profile.id, verdict: r.result.verdict })), log),
    [rows, log]
  );

  const awaiting = rows.filter((r) => r.outcome === "awaiting");
  const oldestWait = Math.max(0, ...awaiting.map((r) => r.waitingMs));

  const q = query.trim().toLowerCase();
  const searched = rows.filter(
    (r) =>
      !q ||
      r.profile.businessName.toLowerCase().includes(q) ||
      r.profile.websiteUrl.toLowerCase().includes(q)
  );
  const visible = searched.filter((r) => matchesFilter(r, filter)).sort(sortFor(filter));
  const shown = visible.slice(0, limit);

  // The pane always shows something: the chosen row if it is still in view,
  // otherwise the first row. That is also what moves the reviewer on to the
  // next business after a decision takes the current one out of the queue.
  const selected =
    shown.find((r) => r.profile.id === selectedId) ??
    (selectedId ? rows.find((r) => r.profile.id === selectedId && filter !== "awaiting") : undefined) ??
    shown[0];

  const select = useCallback((id: string) => {
    setSelectedId(id);
    setDraft(null);
    setLastSaved(null);
  }, []);

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
    setDraft(null);
    setLastSaved({ name: row.profile.businessName, decision });
    if (filter === "awaiting") {
      setSelectedId(null); // falls through to the next oldest
    }
  };


  return (
    <main className="mx-auto flex max-w-[var(--content-max)] flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1">
        <Eyebrow>Onboarding</Eyebrow>
        <h1 className="text-cream text-heading-32">Review queue</h1>
      </header>

      {/* The one accent on the page: is there anything for me to do? */}
      {awaiting.length > 0 ? (
        <InsightBar icon={<Hourglass />} tone="spark">
          <span className="font-medium">
            <span className="font-data">{awaiting.length}</span>{" "}
            {awaiting.length === 1 ? "business needs" : "businesses need"} a decision.
          </span>{" "}
          <span className="text-muted-foreground">
            Oldest has waited <span className="font-data">{formatDuration(oldestWait)}</span>.
          </span>
        </InsightBar>
      ) : (
        <InsightBar icon={<CircleCheck />} tone="mint">
          Nothing waiting. Every flagged business has a decision.
        </InsightBar>
      )}

      <SummaryStrip summary={summary} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)] lg:items-start">
        {/* Detail first on small screens: the decision is the point. */}
        <div className="order-1 lg:order-2 lg:sticky lg:top-6">
          {selected ? (
            <DetailPane
              draft={draft}
              key={selected.profile.id}
              onDecide={decide}
              onDraft={setDraft}
              row={selected}
              saved={
                lastSaved && lastSaved.name !== selected.profile.businessName
                  ? `Saved: ${lastSaved.name} ${lastSaved.decision}. Next up: ${selected.profile.businessName}.`
                  : null
              }
            />
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-copy-14 text-muted-foreground">
                {filter === "awaiting" ? "Queue is clear. Nothing needs a decision." : "Nothing matches this view."}
              </CardContent>
            </Card>
          )}
        </div>

        <QueueList
          filter={filter}
          limit={limit}
          onFilter={(f) => {
            setFilter(f);
            setLimit(PAGE_SIZE);
            setSelectedId(null);
            setDraft(null);
            setLastSaved(null);
          }}
          onMore={() => setLimit((n) => n + PAGE_SIZE)}
          onQuery={(v) => {
            setQuery(v);
            setLimit(PAGE_SIZE);
          }}
          onSelect={select}
          query={query}
          searched={searched}
          selectedId={selected?.profile.id}
          shown={shown}
          total={visible.length}
        />
      </div>

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
          {summary.overturned > 0 ? (
            <>
              {" "}· <span className="font-data">{summary.overturned}</span> overturned
            </>
          ) : null}
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Left: the queue

function QueueList({
  filter,
  query,
  searched,
  shown,
  total,
  limit,
  selectedId,
  onFilter,
  onQuery,
  onSelect,
  onMore,
}: {
  filter: Filter;
  query: string;
  searched: Row[];
  shown: Row[];
  total: number;
  limit: number;
  selectedId?: string;
  onFilter: (f: Filter) => void;
  onQuery: (q: string) => void;
  onSelect: (id: string) => void;
  onMore: () => void;
}) {
  return (
    <Card className="order-2 gap-0 py-0 lg:order-1">
      <div className="flex flex-col gap-3 border-b p-4">
        <label className="relative flex">
          <span className="sr-only">Search by business name or website</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            className="h-9 w-full rounded-control border border-input bg-background pr-3 pl-9 text-label-14 text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search name or website"
            type="search"
            value={query}
          />
        </label>
        <div aria-label="Filter" className="flex flex-wrap gap-0.5" role="toolbar">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <Button
                aria-pressed={active}
                key={f.id}
                className="px-2"
                onClick={() => onFilter(f.id)}
                size="sm"
                variant={active ? "ghost" : "subtle"}
              >
                {f.label}
                <span className="font-data text-muted-foreground">
                  {searched.filter((r) => matchesFilter(r, f.id)).length}
                </span>
              </Button>
            );
          })}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="px-4 py-10 text-center text-copy-14 text-muted-foreground">
          {query.trim() ? `No business matches “${query.trim()}”.` : "Nothing in this view."}
        </p>
      ) : (
        <ul className="max-h-[36rem] divide-y divide-border overflow-y-auto">
          {shown.map((row) => {
            const active = row.profile.id === selectedId;
            return (
              <li key={row.profile.id}>
                <button
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex w-full cursor-pointer flex-col gap-1.5 border-l-2 px-4 py-3 text-left outline-none transition-colors focus-visible:bg-accent",
                    active ? "border-l-foreground bg-accent" : "border-l-transparent hover:bg-accent/50"
                  )}
                  onClick={() => onSelect(row.profile.id)}
                  type="button"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-foreground text-label-14">{row.profile.businessName}</span>
                    <span className="shrink-0 font-data text-label-12-mono text-muted-foreground">
                      {formatDuration(row.waitingMs)}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    <VerdictBadge verdict={row.result.verdict} />
                    {row.human ? (
                      <>
                        <span aria-hidden className="text-muted2">→</span>
                        <DecisionBadge decision={row.human.decision} />
                      </>
                    ) : null}
                  </span>
                  <span className="line-clamp-1 text-copy-13 text-muted-foreground">
                    {row.human ? `“${row.human.note}”` : row.explanation.why}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
        <span className="font-data text-label-12-mono text-muted-foreground">
          {shown.length} of {total}
        </span>
        {total > limit ? (
          <Button onClick={onMore} size="sm" variant="subtle">
            Show {Math.min(PAGE_SIZE, total - limit)} more
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Right: everything needed to decide, open by default

function DetailPane({
  row,
  draft,
  saved,
  onDraft,
  onDecide,
}: {
  row: Row;
  draft: HumanDecision | null;
  saved?: string | null;
  onDraft: (d: HumanDecision | null) => void;
  onDecide: (row: Row, decision: HumanDecision, note: string) => void;
}) {
  const { profile, result, explanation, human, history } = row;
  const isReview = result.verdict === "review";

  // Four chunks, in the order a reviewer reasons: who is this, what did the
  // rule see, what do I decide, what is on record.
  return (
    <Card className="gap-0 py-0">
      {saved ? (
        <p aria-live="polite" className="border-b px-5 py-2.5 text-label-12 text-mint">
          {saved}
        </p>
      ) : null}

      <Chunk n={1} title="The business">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="text-foreground text-heading-20">
              <Highlighted terms={explanation.terms} text={profile.businessName} />
            </h2>
            <WebsiteLink url={profile.websiteUrl} />
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="font-data text-foreground text-label-13-mono">{formatDuration(row.waitingMs)}</span>
            <Eyebrow className="text-muted2">{human ? "until decided" : isReview ? "in queue" : "since submitted"}</Eyebrow>
          </div>
        </div>
        <blockquote className="border-l-2 border-line2 pl-3 text-copy-14 text-foreground">
          <Highlighted terms={explanation.terms} text={profile.description} />
          <span className="mt-1 block text-label-12 text-muted-foreground">{profile.industry}</span>
        </blockquote>
      </Chunk>

      <Chunk n={2} title="What the rule saw" aside={<VerdictBadge verdict={result.verdict} />}>
        <p className="text-copy-14 text-foreground">{explanation.why}</p>
        {explanation.check ? (
          <div className="flex flex-col gap-1 rounded-control bg-amber-fill/10 px-3 py-2.5">
            <Eyebrow className="text-amber">Check before deciding</Eyebrow>
            <span className="text-copy-14 font-medium text-foreground">{explanation.check}</span>
          </div>
        ) : null}
      </Chunk>

      <Chunk
        n={3}
        title="Decision"
        aside={human ? <DecisionBadge decision={human.decision} /> : null}
      >
        {human ? (
          <div className="flex flex-col gap-1">
            <p className="text-copy-14 text-foreground">“{human.note}”</p>
            <span className="font-data text-label-12-mono text-muted2">
              {human.reviewer} · {new Date(human.decidedAt).toLocaleString()}
            </span>
          </div>
        ) : null}

        {isReview ? (
          draft ? (
            <DecisionForm
              decision={draft}
              id={profile.id}
              onCancel={() => onDraft(null)}
              onChangeDecision={onDraft}
              onSubmit={(note) => onDecide(row, draft, note)}
            />
          ) : (
            <div className="flex items-center gap-2">
              {human?.decision !== "allowed" ? (
                <Button onClick={() => onDraft("allowed")} size="sm" variant="ghost">
                  {human ? "Change to allow" : "Allow"}
                </Button>
              ) : null}
              {human?.decision !== "blocked" ? (
                <Button onClick={() => onDraft("blocked")} size="sm" variant="destructive">
                  {human ? "Change to block" : "Block"}
                </Button>
              ) : null}
            </div>
          )
        ) : (
          <p className="text-copy-13 text-muted-foreground">Decided by the rule. No review needed.</p>
        )}
      </Chunk>

      <Chunk n={4} title="Record">
        <dl className="grid grid-cols-[8rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2 text-label-12">
          <dt><Eyebrow>Reason code</Eyebrow></dt>
          <dd className="font-mono text-muted2">{result.reasonCode}</dd>
          <dt><Eyebrow>Onboarding</Eyebrow></dt>
          <dd className="font-mono text-muted2">{profile.onboardingState}</dd>
          <dt><Eyebrow>Submitted</Eyebrow></dt>
          <dd className="font-data text-muted2">
            <time dateTime={profile.submittedAt}>{new Date(profile.submittedAt).toLocaleString()}</time>
          </dd>
          {history.length > 0 ? (
            <>
              <dt><Eyebrow>History</Eyebrow></dt>
              <dd className="flex flex-col gap-1">
                {history.map((e) => (
                  <span className="text-muted2" key={e.seq}>
                    <span className="font-data">#{e.seq}</span> {e.decision} · “{e.note}”
                  </span>
                ))}
              </dd>
            </>
          ) : null}
        </dl>
      </Chunk>
    </Card>
  );
}

function Chunk({
  n,
  title,
  aside,
  children,
}: {
  n: number;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 border-b px-5 py-4 last:border-b-0">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>
          <span className="mr-2 text-muted2">{n}</span>
          {title}
        </Eyebrow>
        {aside}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {highlight(text, terms).map((s, i) =>
        s.hit ? (
          <mark className="rounded-badge bg-amber-fill/25 px-0.5 text-inherit" key={i}>
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
      className="flex flex-col gap-3"
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
        <Eyebrow>Note (required): what did you check?</Eyebrow>
        <textarea
          aria-describedby={`${noteId}-err`}
          aria-invalid={touched && error ? true : undefined}
          autoFocus
          className="min-h-16 rounded-control border border-input bg-background px-3 py-2 text-copy-14 text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-danger"
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
      <div className="flex items-center gap-2">
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
