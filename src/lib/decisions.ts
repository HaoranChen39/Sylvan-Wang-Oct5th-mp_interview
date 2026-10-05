/**
 * Human decisions on top of machine verdicts.
 *
 * The machine verdict is never overwritten. A reviewer's decision is a
 * separate fact appended to a log; the current human decision for a profile is
 * simply the latest entry for it. Changing your mind appends another entry, so
 * the log always tells the full story.
 */
import type { ReasonCode, ReviewResult, ReviewVerdict } from "./moderation";

export type HumanDecision = "allowed" | "blocked";

/** What actually happens to the business once machine and human are combined. */
export type Outcome = "allowed" | "blocked" | "awaiting";

export interface DecisionEntry {
  readonly seq: number;
  readonly profileId: string;
  readonly decision: HumanDecision;
  readonly note: string;
  readonly reviewer: string;
  /** ISO timestamp. */
  readonly decidedAt: string;
  /** Snapshot of the machine verdict the human was looking at. */
  readonly machineVerdict: ReviewVerdict;
  readonly machineReasonCode: ReasonCode;
}

export type DecisionLog = readonly DecisionEntry[];

export const MIN_NOTE_LENGTH = 5;

export interface DecisionInput {
  profileId: string;
  decision: HumanDecision;
  note: string;
  reviewer: string;
  machine: Pick<ReviewResult, "verdict" | "reasonCode">;
}

export function validateNote(note: string): string | null {
  const trimmed = note.trim();
  if (trimmed.length === 0) {
    return "A note is required.";
  }
  if (trimmed.length < MIN_NOTE_LENGTH) {
    return `Say a little more (at least ${MIN_NOTE_LENGTH} characters).`;
  }
  return null;
}

/** Returns a new, frozen log with the entry appended. Never mutates `log`. */
export function appendDecision(
  log: DecisionLog,
  input: DecisionInput,
  now: Date = new Date()
): DecisionLog {
  const error = validateNote(input.note);
  if (error) {
    throw new Error(error);
  }
  const entry: DecisionEntry = Object.freeze({
    seq: log.length + 1,
    profileId: input.profileId,
    decision: input.decision,
    note: input.note.trim(),
    reviewer: input.reviewer,
    decidedAt: now.toISOString(),
    machineVerdict: input.machine.verdict,
    machineReasonCode: input.machine.reasonCode,
  });
  return Object.freeze([...log, entry]);
}

export function latestDecisions(log: DecisionLog): Map<string, DecisionEntry> {
  const latest = new Map<string, DecisionEntry>();
  for (const entry of log) {
    latest.set(entry.profileId, entry);
  }
  return latest;
}

/** Human decision wins; otherwise the machine verdict stands, and review waits. */
export function outcomeFor(
  machineVerdict: ReviewVerdict,
  human?: DecisionEntry
): Outcome {
  if (human) {
    return human.decision;
  }
  if (machineVerdict === "allow") {
    return "allowed";
  }
  if (machineVerdict === "block") {
    return "blocked";
  }
  return "awaiting";
}

export interface QueueSummary {
  machine: Record<ReviewVerdict, number>;
  outcome: Record<Outcome, number>;
  decidedByHuman: number;
  /** Human decision disagrees with what the machine would have defaulted to. */
  overturned: number;
}

export function summarize(
  rows: ReadonlyArray<{ profileId: string; verdict: ReviewVerdict }>,
  log: DecisionLog
): QueueSummary {
  const latest = latestDecisions(log);
  const summary: QueueSummary = {
    machine: { allow: 0, review: 0, block: 0 },
    outcome: { allowed: 0, blocked: 0, awaiting: 0 },
    decidedByHuman: 0,
    overturned: 0,
  };
  for (const row of rows) {
    const human = latest.get(row.profileId);
    summary.machine[row.verdict] += 1;
    summary.outcome[outcomeFor(row.verdict, human)] += 1;
    if (human) {
      summary.decidedByHuman += 1;
      const machineDefault = outcomeFor(row.verdict);
      if (machineDefault !== "awaiting" && machineDefault !== human.decision) {
        summary.overturned += 1;
      }
    }
  }
  return summary;
}

/** "3d 4h", "5h 12m", "12m". Coarse on purpose: CS scans, it does not audit. */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}
