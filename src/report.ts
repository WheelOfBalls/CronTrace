import type { AuditReport } from './audit.ts';

export type FailureThreshold = 'none' | 'late' | 'gap' | 'uncertain';

export function exitCodeForReport(report: AuditReport, threshold: FailureThreshold): number {
  if (report.incomplete) return 3;
  const c = report.summary.counts;
  if ((threshold === 'late' && c.matched_late > 0)
    || (threshold === 'gap' && c.no_observed_run > 0)
    || (threshold === 'uncertain' && (c.ambiguous > 0 || c.pending > 0))) return 1;
  return 0;
}

const safe = (value: string): string => value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,
  c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const time = (ms: number): string => new Date(ms).toISOString();
const delay = (ms: number | null): string => ms === null ? 'unknown' : `${(ms / 60_000).toFixed(2)} min`;

export function formatReport(report: AuditReport): string {
  const a = report.analysis;
  const s = report.summary;
  const lines = [
    `CronTrace ${report.toolVersion} — historical schedule audit`,
    `Repository: ${safe(report.repository.fullName)}`,
    `Workflow: ${safe(report.workflow.path)} (ID ${safe(report.workflow.id)})`,
    `Target interval: [${time(a.fromMs)}, ${time(a.toMs)})`,
    `Creation cutoff: ${time(a.observedUntilMs)}`,
    `Schedule: ${safe(report.schedule.cron ?? 'unavailable')} (${safe(report.schedule.timezone ?? 'unsupported')})`,
    `Late tolerance: ${delay(a.lateAfterMs)}; attribution horizon: ${delay(a.maxLatenessMs)}`,
    `Evidence: ${report.bundleDigest}`,
    `Historical policy: ${report.policyDigest ?? 'not supplied'}`,
    `Assertions: ${report.policy ? safe(report.policy.assertions.note) : 'unknown'}`,
    '', 'Coverage and outcomes',
    `API traversal: ${s.coverage.apiTraversalMs}/${s.coverage.requestedContextMs} milliseconds of requested context (not retention completeness)`,
    `Target opportunities: ${s.targetOpportunities}; recorded scheduled runs including context: ${s.recordedScheduledRunsInContext}`,
    `Within tolerance: ${s.counts.matched_on_time}; late: ${s.counts.matched_late}; potential gaps: ${s.counts.no_observed_run}`,
    `Ambiguous: ${s.counts.ambiguous}; pending: ${s.counts.pending}; unknown: ${s.counts.unknown}; excluded: ${s.counts.excluded}`,
    `Runs with rerun evidence: ${s.runsWithReruns}`,
    `Latest execution conclusions (including context): ${Object.entries(s.executionConclusions).map(([k, v]) => `${safe(k)}=${v}`).join(', ') || 'none'}`,
    s.creationLag ? `Conditional creation lag (n=${s.matchedSampleSize}): median ${delay(s.creationLag.medianMs)}, p95 ${delay(s.creationLag.p95Ms)}, max ${delay(s.creationLag.maxMs)}`
      : `Conditional creation lag: unavailable or suppressed (matched n=${s.matchedSampleSize})`,
    '', 'Opportunity evidence',
  ];
  let bytes = Buffer.byteLength(lines.join('\n')) + 1;
  const append = (...items: string[]) => {
    for (const item of items) {
      bytes += Buffer.byteLength(item) + 1;
      if (bytes > 10 * 1024 * 1024) throw new Error('Text report exceeds 10 MiB limit; use a smaller analysis interval');
      lines.push(item);
    }
  };
  for (const row of a.opportunities) {
    append(`${time(row.expectedAtMs)}  ${row.classification === 'no_observed_run' ? 'potential gap (no_observed_run)' : row.classification}  creation lag=${delay(row.creationLagMs)}  original start lag=${delay(row.originalStartLagMs)}`);
    append(`  Reasons: ${row.reasonCodes.join(', ')}`);
    for (const id of row.candidateRunIds) append(`  Candidate: https://github.com/${report.repository.fullName}/actions/runs/${encodeURIComponent(id)}`);
  }
  if (a.unmatchedRunIds.length) append(`Unexplained run IDs: ${a.unmatchedRunIds.map(safe).join(', ')}`);
  append('', 'Warnings and assumptions', ...report.warnings.map(w => `- ${safe(w)}`),
    '- Isolated matches remain conditional associations; none is a verified original scheduler event ID.',
    'Method: https://github.com/WheelOfBalls/CronTrace/blob/main/docs/METHODOLOGY.md',
    'GitHub: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule',
    '', report.incomplete ? 'Result: incomplete evidence (exit 3)' : 'Result: analysis completed under stated assumptions; see selected failure threshold.');
  return lines.join('\n') + '\n';
}
