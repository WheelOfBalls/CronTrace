import type { NormalizedRun, Reason, ReconcileInput, RunObservation } from './domain.ts';

/** Fixed field projection makes JSON independent of caller property insertion order. */
function project(r: RunObservation): RunObservation {
  return {
    repositoryId: r.repositoryId, workflowId: r.workflowId, runId: r.runId,
    event: r.event, createdAtMs: r.createdAtMs, definitionId: r.definitionId,
    attempt: r.attempt, startedAtMs: r.startedAtMs, conclusion: r.conclusion,
    observedAtMs: r.observedAtMs,
  };
}

function latestObservation(rows: RunObservation[]): { row: RunObservation | null; conflict: boolean } {
  if (rows.length === 0) return { row: null, conflict: false };
  const newest = rows.reduce((a, b) => a.observedAtMs > b.observedAtMs ? a : b);
  const tied = rows.filter(r => r.observedAtMs === newest.observedAtMs);
  const conflict = tied.some(r => r.startedAtMs !== newest.startedAtMs || r.conclusion !== newest.conclusion);
  return { row: conflict ? null : newest, conflict };
}

/** Deduplication is by repository/run identity, never attempt or workflow run number. */
export function normalizeRuns(input: ReconcileInput): NormalizedRun[] {
  const groups = new Map<string, Map<string, RunObservation>>();
  for (const r of input.runs) {
    if (r.repositoryId !== input.repositoryId) continue;
    const row = project(r);
    const observations = groups.get(r.runId) ?? new Map<string, RunObservation>();
    observations.set(JSON.stringify(row), row);
    groups.set(r.runId, observations);
  }
  const result: NormalizedRun[] = [];
  for (const runId of [...groups.keys()].sort()) {
    const unique = groups.get(runId)!;
    const observations = [...unique.keys()].sort().map(key => unique.get(key)!);
    if (!observations.some(r => r.workflowId === input.workflowId && r.event === 'schedule'
      && r.createdAtMs <= input.observedUntilMs)) continue;
    const first = observations[0];
    const invariantConflict = observations.some(r => r.workflowId !== first.workflowId
      || r.event !== first.event || r.createdAtMs !== first.createdAtMs || r.definitionId !== first.definitionId);
    const attempts = [...new Set(observations.map(r => r.attempt))].sort((a, b) => a - b);
    const original = latestObservation(observations.filter(r => r.attempt === 1));
    const latest = latestObservation(observations.filter(r => r.attempt === attempts.at(-1)));
    const start = original.row?.startedAtMs ?? null;
    const validStart = start !== null && start >= first.createdAtMs && start <= original.row!.observedAtMs;
    const reasons: Reason[] = [];
    if (invariantConflict) reasons.push('conflicting_run_observations');
    if (original.conflict || latest.conflict) reasons.push('conflicting_attempt_observations');
    if (!validStart) reasons.push('original_start_unavailable');
    result.push({
      runId, createdAtMs: invariantConflict ? null : first.createdAtMs,
      definitionId: invariantConflict ? null : first.definitionId, attempts,
      originalStartedAtMs: validStart ? start : null,
      originalConclusion: original.row?.conclusion ?? null,
      latestConclusion: latest.row?.conclusion ?? null,
      reasonCodes: reasons.sort(), observations,
    });
  }
  return result;
}
