import type { Evidence, ReconcileResult } from './domain.ts';
import type { AuditPolicy, EvidenceBundle } from './evidence-types.ts';
import { canonicalJson, sha256, validateBundle, validatePolicy } from './evidence.ts';
import { enumerateOpportunities, readSchedule } from './schedule.ts';
import type { ScheduleSpec } from './schedule.ts';
import { reconcile } from './reconcile.ts';
import { VERSION } from './version.ts';

export interface AuditReport {
  schemaVersion: 1;
  toolVersion: string;
  bundleDigest: string;
  policyDigest: string | null;
  repository: EvidenceBundle['repository'];
  workflow: Omit<EvidenceBundle['workflow'], 'definitionText'>;
  schedule: ScheduleSpec;
  policy: AuditPolicy | null;
  analysis: ReconcileResult;
  summary: {
    targetOpportunities: number;
    counts: Record<string, number>;
    matchedSampleSize: number;
    creationLag: { medianMs: number; p95Ms: number; maxMs: number } | null;
    recordedScheduledRunsInContext: number;
    excludedContextObservations: number;
    runsWithReruns: number;
    executionConclusions: Record<string, number>;
    coverage: { apiTraversalMs: number; requestedContextMs: number };
  };
  incomplete: boolean;
  warnings: string[];
}

function coveredMilliseconds(evidence: Evidence[], fromMs: number, throughMs: number): number {
  const intervals = evidence.filter(e => e.kind === 'api').map(e => ({
    fromMs: Math.max(e.fromMs, fromMs), throughMs: Math.min(e.throughMs, throughMs),
  })).filter(e => e.fromMs <= e.throughMs).sort((a, b) => a.fromMs - b.fromMs);
  let end = fromMs - 1;
  let total = 0;
  for (const e of intervals) {
    total += Math.max(0, e.throughMs - Math.max(e.fromMs, end + 1) + 1);
    end = Math.max(end, e.throughMs);
  }
  return total;
}

/** Pure offline orchestration: no filesystem, network, credentials or clock. */
export function auditEvidence(rawBundle: EvidenceBundle, rawPolicy: AuditPolicy | null,
  options: { lateAfterMs?: number; maxLatenessMs?: number } = {}): AuditReport {
  const bundle = validateBundle(rawBundle);
  const policy = rawPolicy === null ? null : validatePolicy(rawPolicy);
  if (policy && policy.definitionSha256 !== bundle.workflow.definitionSha256) throw new Error('Policy does not match the pinned workflow definition');
  const maxLatenessMs = options.maxLatenessMs ?? bundle.maxLatenessMs;
  const lateAfterMs = options.lateAfterMs ?? 30 * 60_000;
  if (!Number.isSafeInteger(maxLatenessMs) || maxLatenessMs <= 0 || maxLatenessMs > 90 * 86_400_000
    || !Number.isSafeInteger(lateAfterMs) || lateAfterMs < 0 || lateAfterMs > maxLatenessMs) throw new Error('Invalid attribution horizon or late tolerance');
  const schedule = readSchedule(bundle.workflow.definitionText);
  const from = bundle.interval.fromMs - 2 * maxLatenessMs;
  const through = Math.min(bundle.observedUntilMs, bundle.interval.toMs + maxLatenessMs);
  const contextFrom = bundle.interval.fromMs - maxLatenessMs;
  // Keep whole identities when any observation is in scope, so conflicting
  // creation times cannot disappear through filtering before normalization.
  const selectedIds = new Set(bundle.runs.filter(r => r.createdAtMs >= contextFrom && r.createdAtMs <= through).map(r => r.runId));
  const runs = bundle.runs.filter(r => selectedIds.has(r.runId));
  const excludedContextObservations = bundle.runs.length - runs.length;
  const opportunities = schedule.supported
    ? enumerateOpportunities(schedule, bundle.workflow.definitionSha256, from, through) : [];
  const evidence: Evidence[] = bundle.collection.coverage.map(e => ({ ...e, kind: 'api', basis: 'observed' }));
  if (schedule.supported) evidence.push({ kind: 'context', basis: 'observed', fromMs: from, throughMs: through });
  if (policy) {
    const a = policy.assertions;
    for (const [kind, enabled] of [['history', a.historyAvailable], ['definition', a.definitionStable], ['eligibility', a.workflowEligible]] as const) {
      if (enabled) evidence.push({ kind, basis: 'operator_asserted', fromMs: a.fromMs, throughMs: a.throughMs });
    }
  }
  const analysis = reconcile({ repositoryId: bundle.repository.id, workflowId: bundle.workflow.id,
    ...bundle.interval, observedUntilMs: bundle.observedUntilMs, lateAfterMs, maxLatenessMs,
    semanticsSupported: schedule.supported, opportunities, runs, evidence });
  const counts: Record<string, number> = Object.fromEntries([
    'matched_on_time', 'matched_late', 'no_observed_run', 'ambiguous', 'pending', 'unknown', 'excluded',
  ].map(key => [key, 0]));
  const lags: number[] = [];
  for (const row of analysis.opportunities) {
    counts[row.classification]++;
    if (row.creationLagMs !== null) lags.push(row.creationLagMs);
  }
  lags.sort((a, b) => a - b);
  const suspect = analysis.diagnostics.includes('unknown_unexplained_run');
  const n = lags.length;
  const creationLag = !n || suspect ? null : {
    medianMs: n % 2 ? lags[Math.floor(n / 2)] : (lags[n / 2 - 1] + lags[n / 2]) / 2,
    p95Ms: lags[Math.ceil(0.95 * n) - 1], maxMs: lags[n - 1],
  };
  const conclusions = new Map<string, number>();
  for (const run of analysis.runs) {
    const key = run.latestConclusion ?? 'not_completed_or_unknown';
    conclusions.set(key, (conclusions.get(key) ?? 0) + 1);
  }
  const executionConclusions = Object.fromEntries([...conclusions].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  const apiTraversalMs = coveredMilliseconds(evidence, contextFrom, through);
  const requestedContextMs = through - contextFrom + 1;
  const assertionsCoverContext = policy !== null && policy.assertions.historyAvailable
    && policy.assertions.definitionStable && policy.assertions.workflowEligible
    && policy.assertions.fromMs <= contextFrom && policy.assertions.throughMs >= through;
  const warnings = [
    'Matching is conditional on the supplied history assertions and attribution horizon; a gap is not proof of a dropped event.',
    'API traversal coverage does not establish historical record availability; retention and deletion may remove runs.',
    'Run conclusions are observations during collection, not an atomic snapshot at the creation cutoff.',
    ...bundle.collection.diagnostics,
  ];
  if (!policy) warnings.push('No historical assertions supplied; expected opportunities cannot be treated as verified eligibility.');
  else if (!assertionsCoverContext) warnings.push('Historical assertions do not cover the entire requested context; current YAML may omit historical opportunities.');
  if (bundle.workflow.state !== 'active') warnings.push(`Current workflow state is ${bundle.workflow.state}; historical enablement is not reconstructed.`);
  if (!schedule.supported) warnings.push(...schedule.reasonCodes);
  if (suspect) warnings.push('Unexplained runs suppress aggregate lag summaries and absence judgments.');
  if (excludedContextObservations) warnings.push(`${excludedContextObservations} observations lie outside the selected attribution context and are excluded from this analysis; the original bundle is unchanged.`);
  if (n && (counts.unknown || counts.ambiguous || counts.pending)) warnings.push('Lag statistics describe only isolated matched records; they are not overall scheduler reliability.');
  const { definitionText: _definitionText, ...workflow } = bundle.workflow;
  return { schemaVersion: 1, toolVersion: VERSION, bundleDigest: bundle.digest,
    policyDigest: policy ? sha256(canonicalJson(policy)) : null,
    repository: bundle.repository, workflow, schedule, policy, analysis,
    summary: { targetOpportunities: analysis.opportunities.length, counts, matchedSampleSize: n,
      creationLag, recordedScheduledRunsInContext: analysis.runs.length, excludedContextObservations,
      runsWithReruns: analysis.runs.filter(r => r.attempts.some(a => a > 1)).length, executionConclusions,
      coverage: { apiTraversalMs, requestedContextMs } },
    incomplete: !schedule.supported || !assertionsCoverContext || counts.unknown > 0 || suspect || apiTraversalMs < requestedContextMs,
    warnings,
  };
}

export { formatReport, exitCodeForReport } from './report.ts';
