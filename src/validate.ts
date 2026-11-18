import type { ReconcileInput } from './domain.ts';

const maxSpanMs = 90 * 24 * 60 * 60 * 1000;

function requireValue(condition: boolean, message: string): void {
  if (!condition) throw new RangeError(message);
}

function timestamp(value: number): void {
  requireValue(Number.isSafeInteger(value) && Math.abs(value) <= 8_640_000_000_000_000,
    'Timestamps must be integer UTC epoch milliseconds within the supported date range');
}

function identifier(value: string): void {
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.length <= 1024,
    'Identifiers and labels must be nonempty strings of at most 1024 characters');
}

/** Preconditions for the small typed API; not a general JSON/bundle validator. */
export function validate(input: ReconcileInput): void {
  identifier(input.repositoryId);
  identifier(input.workflowId);
  for (const value of [input.fromMs, input.toMs, input.observedUntilMs]) timestamp(value);
  requireValue(input.fromMs < input.toMs && input.toMs <= input.observedUntilMs, 'Invalid target interval or cutoff');
  requireValue(input.toMs - input.fromMs <= maxSpanMs, 'Audit span limit is 90 days');
  requireValue(Number.isSafeInteger(input.maxLatenessMs) && input.maxLatenessMs > 0
    && input.maxLatenessMs <= maxSpanMs, 'Attribution horizon must be positive and at most 90 days');
  requireValue(Number.isSafeInteger(input.lateAfterMs) && input.lateAfterMs >= 0
    && input.lateAfterMs <= input.maxLatenessMs, 'Invalid late tolerance');
  requireValue(typeof input.semanticsSupported === 'boolean', 'Explicit semanticsSupported flag is required');
  requireValue(Array.isArray(input.opportunities) && input.opportunities.length <= 50_000, 'Opportunity limit is 50000');
  requireValue(Array.isArray(input.runs) && input.runs.length <= 50_000, 'Run observation limit is 50000');
  requireValue(Array.isArray(input.evidence) && input.evidence.length <= 10_000, 'Evidence interval limit is 10000');
  const ids = new Set<string>();
  for (const o of input.opportunities) {
    identifier(o.id);
    timestamp(o.expectedAtMs);
    requireValue(!ids.has(o.id), 'Duplicate opportunity ID');
    ids.add(o.id);
    if (o.definitionId !== null) identifier(o.definitionId);
    if (o.exclusionReason !== undefined) identifier(o.exclusionReason);
  }
  for (const r of input.runs) {
    for (const value of [r.repositoryId, r.workflowId, r.runId, r.event]) identifier(value);
    if (r.definitionId !== null) identifier(r.definitionId);
    if (r.conclusion !== null) identifier(r.conclusion);
    timestamp(r.createdAtMs);
    timestamp(r.observedAtMs);
    if (r.startedAtMs !== null) timestamp(r.startedAtMs);
    requireValue(r.observedAtMs >= r.createdAtMs, 'Run cannot be observed before its creation');
    requireValue(Number.isSafeInteger(r.attempt) && r.attempt > 0, 'Invalid attempt number');
  }
  for (const e of input.evidence) {
    requireValue(['api', 'history', 'definition', 'eligibility', 'context'].includes(e.kind), 'Unknown evidence kind');
    requireValue(e.basis === 'observed' || e.basis === 'operator_asserted', 'Unknown evidence basis');
    timestamp(e.fromMs);
    timestamp(e.throughMs);
    requireValue(e.fromMs <= e.throughMs, 'Invalid evidence interval');
  }
}
