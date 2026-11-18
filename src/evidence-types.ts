import type { Interval, RunObservation } from './domain.ts';

export interface EvidenceBundle {
  schemaVersion: 1;
  toolVersion: string;
  repository: { id: string; fullName: string; defaultBranch: string };
  workflow: {
    id: string; path: string; state: string;
    definitionRef: string; definitionText: string; definitionSha256: string;
  };
  interval: { fromMs: number; toMs: number };
  observedUntilMs: number;
  maxLatenessMs: number;
  collection: {
    startedAtMs: number; finishedAtMs: number; apiVersion: string;
    coverage: Interval[]; diagnostics: string[]; requests: number;
  };
  runs: RunObservation[];
  digest: string;
}

/** Assertions apply to their explicit closed interval, including required context. */
export interface AuditPolicy {
  schemaVersion: 1;
  definitionSha256: string;
  assertions: {
    fromMs: number; throughMs: number;
    historyAvailable: boolean; definitionStable: boolean; workflowEligible: boolean;
    note: string;
  };
}

export type UnsealedBundle = Omit<EvidenceBundle, 'digest'>;
