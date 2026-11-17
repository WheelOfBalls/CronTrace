/** Experimental M1 in-memory contract, not a persisted bundle schema. */
export interface Interval { fromMs: number; throughMs: number }
export type EvidenceKind = 'api' | 'history' | 'definition' | 'eligibility' | 'context';
export interface Evidence extends Interval {
  kind: EvidenceKind;
  basis: 'observed' | 'operator_asserted';
}
export interface Opportunity {
  id: string;
  expectedAtMs: number;
  definitionId: string | null;
  exclusionReason?: string;
}
export interface RunObservation {
  repositoryId: string;
  workflowId: string;
  runId: string;
  event: string;
  createdAtMs: number;
  definitionId: string | null;
  attempt: number;
  startedAtMs: number | null;
  conclusion: string | null;
  observedAtMs: number;
}
export interface ReconcileInput {
  repositoryId: string;
  workflowId: string;
  fromMs: number;
  toMs: number;
  observedUntilMs: number;
  lateAfterMs: number;
  maxLatenessMs: number;
  semanticsSupported: boolean;
  opportunities: readonly Opportunity[];
  runs: readonly RunObservation[];
  evidence: readonly Evidence[];
}
export type Classification = 'matched_on_time' | 'matched_late' | 'ambiguous'
  | 'pending' | 'no_observed_run' | 'unknown' | 'excluded';
export type Reason = 'isolated_candidate' | 'competing_candidates' | 'horizon_open'
  | 'no_record_in_horizon' | 'explicit_exclusion' | 'unknown_api' | 'unknown_history'
  | 'unknown_definition' | 'unknown_eligibility' | 'unknown_boundary'
  | 'unsupported_semantics' | 'conflicting_run_observations' | 'unknown_unexplained_run'
  | 'original_start_unavailable' | 'conflicting_attempt_observations';
export interface OpportunityResult {
  id: string;
  expectedAtMs: number;
  definitionId: string | null;
  exclusionReason: string | null;
  classification: Classification;
  reasonCodes: Reason[];
  candidateRunIds: string[];
  matchedRunId: string | null;
  creationLagMs: number | null;
  originalStartLagMs: number | null;
}
export interface NormalizedRun {
  runId: string;
  createdAtMs: number | null;
  definitionId: string | null;
  attempts: number[];
  originalStartedAtMs: number | null;
  originalConclusion: string | null;
  latestConclusion: string | null;
  reasonCodes: Reason[];
  observations: RunObservation[];
}
export interface ReconcileResult {
  analysisVersion: 'm1';
  repositoryId: string;
  workflowId: string;
  fromMs: number;
  toMs: number;
  observedUntilMs: number;
  lateAfterMs: number;
  maxLatenessMs: number;
  semanticsSupported: boolean;
  evidence: Evidence[];
  opportunities: OpportunityResult[];
  runs: NormalizedRun[];
  unmatchedRunIds: string[];
  diagnostics: Reason[];
}
