import type { Evidence, EvidenceKind, OpportunityResult, Reason, ReconcileInput, ReconcileResult } from './domain.ts';
import { normalizeRuns } from './normalize.ts';
import { validate } from './validate.ts';

const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

function mergeIntervals(evidence: readonly Evidence[], kind: EvidenceKind): { fromMs: number; throughMs: number }[] {
  const intervals = evidence.filter(e => e.kind === kind).sort((a, b) => a.fromMs - b.fromMs);
  const merged: { fromMs: number; throughMs: number }[] = [];
  for (const interval of intervals) {
    const last = merged.at(-1);
    if (last && interval.fromMs <= last.throughMs + 1) last.throughMs = Math.max(last.throughMs, interval.throughMs);
    else merged.push({ fromMs: interval.fromMs, throughMs: interval.throughMs });
  }
  return merged;
}

function covers(intervals: { fromMs: number; throughMs: number }[], from: number, through: number): boolean {
  let low = 0;
  let high = intervals.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (intervals[mid].throughMs < from) low = mid + 1;
    else high = mid;
  }
  return low < intervals.length && intervals[low].fromMs <= from && intervals[low].throughMs >= through;
}

export function reconcile(input: ReconcileInput): ReconcileResult {
  validate(input);
  const opportunities = [...input.opportunities].sort((a, b) => a.expectedAtMs - b.expectedAtMs || compare(a.id, b.id));
  const runs = normalizeRuns(input);
  const candidates = opportunities.map(() => [] as number[]);
  const reverse = runs.map(() => [] as number[]);
  const parent = Array.from({ length: opportunities.length + runs.length }, (_, i) => i);
  const root = (node: number): number => {
    while (node !== parent[node]) {
      parent[node] = parent[parent[node]];
      node = parent[node];
    }
    return node;
  };
  const timedRuns = runs.map((run, ri) => ({ run, ri })).filter(r => r.run.createdAtMs !== null)
    .sort((a, b) => a.run.createdAtMs! - b.run.createdAtMs! || compare(a.run.runId, b.run.runId));
  let edges = 0;
  // Include provisional time candidates with uncertain definitions: they must
  // undermine certainty, not disappear and create a false absence/isolated pair.
  for (let oi = 0; oi < opportunities.length; oi++) {
    const s = opportunities[oi].expectedAtMs;
    let low = 0;
    let high = timedRuns.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (timedRuns[mid].run.createdAtMs! < s) low = mid + 1;
      else high = mid;
    }
    for (let ti = low; ti < timedRuns.length; ti++) {
      const { run, ri } = timedRuns[ti];
      if (run.createdAtMs! - s > input.maxLatenessMs) break;
      if (++edges > 250_000) throw new RangeError('Candidate edge limit is 250000');
      candidates[oi].push(ri);
      reverse[ri].push(oi);
      parent[root(oi)] = root(opportunities.length + ri);
    }
  }
  const components = new Map<number, { opportunities: number[]; runs: number[] }>();
  for (let oi = 0; oi < opportunities.length; oi++) {
    const key = root(oi);
    const component = components.get(key) ?? { opportunities: [], runs: [] };
    component.opportunities.push(oi);
    components.set(key, component);
  }
  for (let ri = 0; ri < runs.length; ri++) {
    if (reverse[ri].length) components.get(root(opportunities.length + ri))!.runs.push(ri);
  }
  const unmatchedRunIds = runs.filter((_, ri) => reverse[ri].length === 0).map(r => r.runId);
  const conflict = runs.some(r => r.reasonCodes.includes('conflicting_run_observations'));
  const kinds = ['api', 'history', 'definition', 'eligibility', 'context'] as const;
  const coverage = new Map(kinds.map(kind => [kind, mergeIntervals(input.evidence, kind)]));
  const componentReasons = new Map<number, Reason[]>();
  for (const [key, component] of components) {
    const componentSlots = component.opportunities.map(i => opportunities[i]);
    const from = Math.min(...componentSlots.map(s => s.expectedAtMs)) - input.maxLatenessMs;
    const through = Math.min(input.observedUntilMs, Math.max(...componentSlots.map(s => s.expectedAtMs)) + input.maxLatenessMs);
    const reasons: Reason[] = [];
    if (!input.semanticsSupported) reasons.push('unsupported_semantics');
    for (const kind of kinds) {
      if (!covers(coverage.get(kind)!, from, through)) reasons.push(kind === 'context' ? 'unknown_boundary' : `unknown_${kind}`);
    }
    if (conflict) reasons.push('conflicting_run_observations');
    if (componentSlots.some(s => s.definitionId === null)
      || component.runs.some(ri => runs[ri].definitionId === null
        || reverse[ri].some(i => opportunities[i].definitionId !== runs[ri].definitionId))) {
      reasons.push('unknown_definition');
    }
    componentReasons.set(key, [...new Set(reasons)].sort());
  }
  const rows: OpportunityResult[] = [];
  for (let oi = 0; oi < opportunities.length; oi++) {
    const o = opportunities[oi];
    if (o.expectedAtMs < input.fromMs || o.expectedAtMs >= input.toMs) continue;
    const component = components.get(root(oi))!;
    const reasons = componentReasons.get(root(oi))!;
    const row: OpportunityResult = {
      id: o.id, expectedAtMs: o.expectedAtMs, definitionId: o.definitionId,
      exclusionReason: o.exclusionReason ?? null, classification: 'unknown', reasonCodes: [],
      candidateRunIds: candidates[oi].map(ri => runs[ri].runId).sort(),
      matchedRunId: null, creationLagMs: null, originalStartLagMs: null,
    };
    if (o.exclusionReason !== undefined) {
      row.classification = 'excluded';
      row.reasonCodes = ['explicit_exclusion'];
    } else if (reasons.length) {
      row.reasonCodes = [...reasons];
    } else if (component.opportunities.length > 1 || component.runs.length > 1) {
      row.classification = 'ambiguous';
      row.reasonCodes = ['competing_candidates'];
    } else if (candidates[oi].length === 1) {
      const run = runs[candidates[oi][0]];
      row.creationLagMs = run.createdAtMs! - o.expectedAtMs;
      row.classification = row.creationLagMs <= input.lateAfterMs ? 'matched_on_time' : 'matched_late';
      row.reasonCodes = ['isolated_candidate'];
      row.matchedRunId = run.runId;
      row.originalStartLagMs = run.originalStartedAtMs === null ? null : run.originalStartedAtMs - o.expectedAtMs;
    } else if (o.expectedAtMs + input.maxLatenessMs > input.observedUntilMs) {
      row.classification = 'pending';
      row.reasonCodes = ['horizon_open'];
    } else if (unmatchedRunIds.length) {
      row.reasonCodes = ['unknown_unexplained_run'];
    } else {
      row.classification = 'no_observed_run';
      row.reasonCodes = ['no_record_in_horizon'];
    }
    rows.push(row);
  }
  return {
    analysisVersion: 'm1', repositoryId: input.repositoryId, workflowId: input.workflowId,
    fromMs: input.fromMs, toMs: input.toMs, observedUntilMs: input.observedUntilMs,
    lateAfterMs: input.lateAfterMs, maxLatenessMs: input.maxLatenessMs,
    semanticsSupported: input.semanticsSupported,
    evidence: input.evidence.map(e => ({ kind: e.kind, basis: e.basis, fromMs: e.fromMs, throughMs: e.throughMs }))
      .sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b))),
    opportunities: rows, runs, unmatchedRunIds,
    diagnostics: [...new Set<Reason>([
      ...runs.flatMap(r => r.reasonCodes), ...(unmatchedRunIds.length ? ['unknown_unexplained_run' as const] : []),
    ])].sort(),
  };
}
