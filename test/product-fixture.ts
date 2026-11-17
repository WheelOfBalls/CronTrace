import type { AuditPolicy, EvidenceBundle } from '../src/evidence-types.ts';
import { sealBundle, sha256 } from '../src/evidence.ts';
import { at, minute } from './fixtures.ts';

/** Synthetic integration fixture. No real repository or observed workload. */
export function productFixture(): { bundle: EvidenceBundle; policy: AuditPolicy } {
  const definitionText = 'name: Synthetic fixture\non:\n  schedule:\n    - cron: "0 * * * *"\njobs: {}\n';
  const definitionSha256 = sha256(definitionText);
  const bundle = sealBundle({
    schemaVersion: 1, toolVersion: '0.1.0',
    repository: { id: '1', fullName: 'example/crontrace-synthetic', defaultBranch: 'main' },
    workflow: { id: '42', path: '.github/workflows/synthetic.yml', state: 'active', definitionRef: 'a'.repeat(40), definitionText, definitionSha256 },
    interval: { fromMs: at(0), toMs: at(180) }, observedUntilMs: at(400), maxLatenessMs: 50 * minute,
    collection: { startedAtMs: at(400), finishedAtMs: at(600), apiVersion: '2026-03-10',
      coverage: [{ fromMs: at(-50), throughMs: at(230) }], diagnostics: [], requests: 6 },
    runs: [5, 90].map((t, i) => ({ repositoryId: '1', workflowId: '42', runId: String(100 + i),
      event: 'schedule', createdAtMs: at(t), definitionId: definitionSha256, attempt: 1,
      startedAtMs: at(t + 1), conclusion: i ? 'failure' : 'success', observedAtMs: at(600) })),
  });
  return { bundle, policy: { schemaVersion: 1, definitionSha256, assertions: {
    fromMs: at(-500), throughMs: at(1000), historyAvailable: true, definitionStable: true,
    workflowEligible: true, note: 'Synthetic assertions for automated tests; not real history.',
  } } };
}
