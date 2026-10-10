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
  firstDecisions,
  type DecisionLog,
  formatDuration,
  type HumanDecision,
  latestDecisions,
  type Outcome,
  outcomeFor,
  patterns,
  RULE_CANDIDATE,
  ruleCandidateStatus,
  summarize,
  validateNote,
  validateTags,
} from "./lib/decisions";
import {
  decisionTags,
  type Explanation,
  explain,
  formatWhen,
  highlight,
  isPresetTag,
  MAX_TAG_LENGTH,
  normalizeTag,
  ONBOARDING_LABELS,
  REASON_LABELS,
} from "./lib/explain";
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
    const first = firstDecisions(log);
    return MACHINE.map((m) => {
      const human = latest.get(m.profile.id);
      // Time to decision stops at the FIRST decision; a later correction
      // must not make the business look like it waited longer.
      const firstDecision = first.get(m.profile.id);
      const end = firstDecision ? Date.parse(firstDecision.decidedAt) : now;
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
  // The pane only ever shows a business that is in the current list (search +
  // filter). If the chosen one drops out, the first visible one takes its
  // place, so the reviewer can never act on a business they cannot see.
  const selected = shown.find((r) => r.profile.id === selectedId) ?? shown[0];

  const select = useCallback((id: string) => {
    setSelectedId(id);
    setDraft(null);
    setLastSaved(null);
  }, []);

  const decide = (row: Row, decision: HumanDecision, tags: string[], note: string) => {
    setLog((prev) =>
      appendDecision(prev, {
        profileId: row.profile.id,
        decision,
        tags,
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
              log={log}
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
            setDraft(null);
            setLastSaved(null);
          }}
          onSelect={select}
          query={query}
          searched={searched}
          selectedId={selected?.profile.id}
          shown={shown}
          total={visible.length}
        />
      </div>
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
                  {/* Why: the rule's reason and its evidence, kept even after a
                      person decides, so machine and human stay side by side. */}
                  <span className="text-label-12 text-foreground">{REASON_LABELS[row.result.reasonCode]}</span>
                  <span className="line-clamp-2 text-copy-13 text-muted-foreground">{row.explanation.why}</span>
                  {row.human ? (
                    <span className="line-clamp-1 text-copy-13 text-foreground">
                      Decided: {row.human.tags.join(" · ")}
                    </span>
                  ) : null}
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
  log,
  draft,
  saved,
  onDraft,
  onDecide,
}: {
  row: Row;
  log: DecisionLog;
  draft: HumanDecision | null;
  saved?: string | null;
  onDraft: (d: HumanDecision | null) => void;
  onDecide: (row: Row, decision: HumanDecision, tags: string[], note: string) => void;
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
            <p className="text-copy-14 font-medium text-foreground">{human.tags.join(" · ")}</p>
            <p className="text-copy-14 text-foreground">“{human.note}”</p>
            <span className="font-data text-label-12-mono text-muted2">
              {human.reviewer} · {formatWhen(human.decidedAt)}
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
              learned={learnedTags(log, result.reasonCode, draft)}
              onSubmit={(tags, note) => onDecide(row, draft, tags, note)}
              reasonCode={result.reasonCode}
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
        <dl className="grid grid-cols-[8rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2 text-label-13">
          <dt><Eyebrow>Rule</Eyebrow></dt>
          <dd className="flex flex-col gap-0.5 text-foreground">
            {REASON_LABELS[result.reasonCode]}
            <span className="font-mono text-label-12-mono text-muted-foreground">{result.reasonCode}</span>
          </dd>
          <dt><Eyebrow>Evidence</Eyebrow></dt>
          <dd className="flex flex-col gap-0.5 font-mono text-label-12-mono text-muted-foreground">
            {result.evidence.map((e) => (
              <span key={e}>{e}</span>
            ))}
          </dd>
          <dt><Eyebrow>Onboarding</Eyebrow></dt>
          <dd className="text-foreground">{ONBOARDING_LABELS[profile.onboardingState]}</dd>
          <dt><Eyebrow>Submitted</Eyebrow></dt>
          <dd className="text-foreground">
            <time className="font-data" dateTime={profile.submittedAt}>{formatWhen(profile.submittedAt)}</time>
            <span className="text-muted-foreground">
              {" "}· <span className="font-data">{formatDuration(Date.now() - Date.parse(profile.submittedAt))}</span> ago
            </span>
          </dd>
          {history.length > 1 ? (
            <>
              <dt><Eyebrow>History</Eyebrow></dt>
              <dd className="flex flex-col gap-1">
                {history.map((e) => (
                  <span className="text-foreground" key={e.seq}>
                    {e.decision === "allowed" ? "Allowed" : "Blocked"} by {e.reviewer},{" "}
                    <span className="font-data">{formatWhen(e.decidedAt)}</span>
                    <span className="block text-muted-foreground">
                      {e.tags.join(" · ")}: “{e.note}”
                    </span>
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

/**
 * Tags reviewers added themselves for the same kind of case and decision.
 * Offered as one-click options, so the second reviewer never retypes them.
 */
function learnedTags(log: DecisionLog, reasonCode: ReviewResult["reasonCode"], decision: HumanDecision): string[] {
  const seen = new Set<string>();
  for (const e of log) {
    if (e.machineReasonCode !== reasonCode || e.decision !== decision) continue;
    for (const t of e.tags) if (!isPresetTag(reasonCode, t)) seen.add(t);
  }
  return [...seen];
}

function DecisionForm({
  id,
  decision,
  reasonCode,
  learned,
  onSubmit,
  onCancel,
  onChangeDecision,
}: {
  id: string;
  decision: HumanDecision;
  reasonCode: ReviewResult["reasonCode"];
  learned: string[];
  onSubmit: (tags: string[], note: string) => void;
  onCancel: () => void;
  onChangeDecision: (d: HumanDecision) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [added, setAdded] = useState<string[]>([]);
  const [draftTag, setDraftTag] = useState("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const preset = decisionTags(reasonCode, decision);
  const options = [...new Set([...preset, ...learned, ...added])];
  // Switching Allow/Block changes the options; drop tags that no longer apply.
  const tags = picked.filter((t) => options.includes(t));
  const tagError = validateTags(tags);
  const noteError = validateNote(note);
  const error = tagError ?? noteError;
  const noteId = `note-${id}`;
  const toggle = (t: string) =>
    setPicked((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  const addTag = () => {
    const t = normalizeTag(draftTag);
    if (!t) return;
    const existing = options.find((o) => o.toLowerCase() === t.toLowerCase());
    const tag = existing ?? t;
    if (!existing) setAdded((cur) => [...cur, tag]);
    setPicked((cur) => (cur.includes(tag) ? cur : [...cur, tag]));
    setDraftTag("");
  };

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (!error) onSubmit(tags, note);
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
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5">
          <Eyebrow>What did you find? (pick at least one)</Eyebrow>
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {options.map((t) => {
            const on = tags.includes(t);
            return (
              <Button
                aria-pressed={on}
                key={t}
                onClick={() => toggle(t)}
                size="sm"
                variant={on ? "ghost" : "outline"}
                className={on ? "border-foreground" : undefined}
              >
                {t}
                {!preset.includes(t) ? <span className="text-muted2">· added</span> : null}
              </Button>
            );
          })}
        </div>
        {/* A case nobody foresaw (say, "protein bar") gets its own tag. */}
        <div className="flex gap-2">
          <input
            aria-label="Add your own tag"
            className="h-8 min-w-0 flex-1 rounded-control border border-input bg-background px-3 text-label-13 text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
            maxLength={MAX_TAG_LENGTH}
            onChange={(e) => setDraftTag(e.target.value)}
            onKeyDown={(e) => {
              // Enter here adds the tag instead of submitting the decision.
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="Not listed? Add your own tag"
            value={draftTag}
          />
          <Button disabled={!normalizeTag(draftTag)} onClick={addTag} size="sm" variant="outline">
            Add
          </Button>
        </div>
      </fieldset>
      <label className="flex flex-col gap-1.5" htmlFor={noteId}>
        <Eyebrow>Note (required): what exactly did you see?</Eyebrow>
        <textarea
          aria-describedby={`${noteId}-err`}
          aria-invalid={touched && noteError ? true : undefined}
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
      <CardContent className="flex flex-col gap-5">
        {log.length > 0 ? <PatternList log={log} /> : null}
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
                  <p className="text-copy-13 text-foreground">{e.tags.join(" · ")}</p>
                  <p className="text-copy-13 text-muted-foreground">“{e.note}”</p>
                </div>
                <span className="font-data text-label-12-mono text-muted2 sm:text-right">
                  {e.reviewer}
                  <br />
                  <time dateTime={e.decidedAt}>{formatWhen(e.decidedAt)}</time>
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Human decisions grouped by rule reason and what the reviewer found. This is
 * the bridge back to rules: a large, unanimous pattern from several reviewers
 * becomes a proposed rule change; a split one stays with people.
 */
function PatternList({ log }: { log: DecisionLog }) {
  const rows = patterns(log);
  const STATUS = {
    candidate: { label: "Rule candidate", cls: "text-mint" },
    building: { label: "Collecting evidence", cls: "text-muted-foreground" },
    split: { label: "Reviewers disagree, keep human", cls: "text-amber" },
  } as const;
  return (
    <div className="flex flex-col gap-2 rounded-control border p-3">
      <Eyebrow>Patterns in human decisions</Eyebrow>
      <ul className="flex flex-col gap-1.5">
        {rows.map((p) => {
          const status = STATUS[ruleCandidateStatus(p)];
          const total = p.allowed + p.blocked;
          return (
            <li
              className="grid gap-1 text-label-13 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline sm:gap-4"
              key={`${p.reasonCode}|${p.tag}`}
            >
              <span className="text-foreground">
                {REASON_LABELS[p.reasonCode]} <span className="text-muted2">→</span> {p.tag}
                {!isPresetTag(p.reasonCode, p.tag) ? (
                  <span className="text-muted-foreground"> (new tag, added by a reviewer)</span>
                ) : null}
              </span>
              <span className="text-muted-foreground">
                <span className="font-data">{p.allowed}</span> allowed ·{" "}
                <span className="font-data">{p.blocked}</span> blocked ·{" "}
                <span className="font-data">{p.reviewers}</span> {p.reviewers === 1 ? "reviewer" : "reviewers"}
                {" · "}
                <span className={status.cls}>
                  {status.label}
                  {status.label === "Collecting evidence" ? (
                    <span className="font-data"> ({total}/{RULE_CANDIDATE.minDecisions})</span>
                  ) : null}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
