import { sha256 } from '../src/evidence.ts';
import type { AuditPolicy, UnsealedBundle } from '../src/evidence-types.ts';

// Entirely synthetic; these records are not observations of a real repository.
export function syntheticBundle(): UnsealedBundle {
  const definitionText = 'on:\n  schedule:\n    - cron: "17 6 * * *"\n';
  return {
    schemaVersion: 1, toolVersion: '0.0.0',
    repository: { id: '101', fullName: 'synthetic/example', defaultBranch: 'main' },
    workflow: { id: '202', path: '.github/workflows/synthetic.yml', state: 'active',
      definitionRef: 'a'.repeat(40), definitionText, definitionSha256: sha256(definitionText) },
    interval: { fromMs: 1_767_225_600_000, toMs: 1_767_312_000_000 },
    observedUntilMs: 1_767_398_400_000, maxLatenessMs: 86_400_000,
    collection: { startedAtMs: 1_767_398_400_000, finishedAtMs: 1_767_398_405_000,
      apiVersion: '2026-03-10', coverage: [{ fromMs: 1_767_139_200_000, throughMs: 1_767_398_400_000 }],
      diagnostics: [], requests: 6 },
    runs: [{ repositoryId: '101', workflowId: '202', runId: '303', event: 'schedule',
      createdAtMs: 1_767_248_520_000, definitionId: null, attempt: 1,
      startedAtMs: 1_767_248_580_000, conclusion: 'success', observedAtMs: 1_767_398_403_000 }],
  };
}

export function syntheticPolicy(): AuditPolicy {
  return { schemaVersion: 1, definitionSha256: syntheticBundle().workflow.definitionSha256,
    assertions: { fromMs: 1_767_139_200_000, throughMs: 1_767_398_400_000,
      historyAvailable: true, definitionStable: true, workflowEligible: true, note: 'Synthetic reviewed assertions.' } };
}
