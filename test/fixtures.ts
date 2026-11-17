import type { Opportunity, ReconcileInput, RunObservation } from '../src/domain.ts';

// Entirely synthetic. Times are UTC epoch milliseconds on 2026-01-01.
export const minute = 60_000;
export const epoch = 1_767_225_600_000;
export const at = (minutes: number): number => epoch + minutes * minute;
export const opportunity = (id: string, minutes: number): Opportunity => ({
  id, expectedAtMs: at(minutes), definitionId: 'synthetic-definition',
});
export const run = (runId: string, minutes: number, patch: Partial<RunObservation> = {}): RunObservation => ({
  repositoryId: 'repo', workflowId: 'workflow', runId, event: 'schedule',
  createdAtMs: at(minutes), definitionId: 'synthetic-definition',
  attempt: 1, startedAtMs: at(minutes + 1), conclusion: 'success', observedAtMs: at(600), ...patch,
});
export const fixture = (patch: Partial<ReconcileInput> = {}): ReconcileInput => ({
  repositoryId: 'repo', workflowId: 'workflow', fromMs: at(0), toMs: at(180),
  observedUntilMs: at(400), lateAfterMs: 30 * minute, maxLatenessMs: 120 * minute,
  semanticsSupported: true, opportunities: [opportunity('slot', 60)], runs: [],
  evidence: (['api', 'history', 'definition', 'eligibility', 'context'] as const).map(kind => ({
    kind, basis: kind === 'api' ? 'observed' : 'operator_asserted', fromMs: at(-500), throughMs: at(1000),
  })), ...patch,
});
