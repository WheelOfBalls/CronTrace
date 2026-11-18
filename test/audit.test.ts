import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditEvidence, formatReport, exitCodeForReport } from '../src/audit.ts';
import { sealBundle, canonicalJson, sha256 } from '../src/evidence.ts';
import { productFixture } from './product-fixture.ts';
import { at, minute } from './fixtures.ts';

test('enumeration, reconciliation and qualified metrics agree on the synthetic timeline', () => {
  const { bundle, policy } = productFixture();
  const report = auditEvidence(bundle, policy, { lateAfterMs: 10 * minute });
  assert.deepEqual(report.analysis.opportunities.map(r => r.classification), ['matched_on_time', 'matched_late', 'no_observed_run']);
  assert.equal(report.summary.targetOpportunities, 3);
  assert.equal(report.summary.matchedSampleSize, 2);
  assert.deepEqual(report.summary.creationLag, { medianMs: 1_050_000, p95Ms: 1_800_000, maxMs: 1_800_000 });
  assert.equal(report.summary.executionConclusions.failure, 1);
  assert.equal(exitCodeForReport(report, 'none'), 0);
  assert.equal(exitCodeForReport(report, 'gap'), 1);
  assert.equal(exitCodeForReport(report, 'late'), 1);
  const text = formatReport(report);
  assert.match(text, /potential gap/i);
  assert.match(text, /not.*proof/i);
  assert.match(text, /example\/crontrace-synthetic/);
  assert.match(text, /https:\/\/github.com\/example\/crontrace-synthetic\/actions\/runs\/100/);
});

test('missing policy and partial API coverage never produce a healthy exit', () => {
  const { bundle, policy } = productFixture();
  const unknown = auditEvidence(bundle, null);
  assert.ok(unknown.analysis.opportunities.every(r => r.classification === 'unknown'));
  assert.equal(exitCodeForReport(unknown, 'none'), 3);
  const partial = sealBundle({ ...bundle, collection: { ...bundle.collection, coverage: [], diagnostics: ['request_budget_exhausted'] } });
  assert.equal(exitCodeForReport(auditEvidence(partial, policy), 'none'), 3);
});

test('mismatched policy definition is rejected rather than applied to another workflow', () => {
  const { bundle, policy } = productFixture();
  assert.throws(() => auditEvidence(bundle, { ...policy, definitionSha256: '0'.repeat(64) }));
});

test('unsupported named-zone and multi-entry schedules are explicit incomplete reports', () => {
  const { bundle } = productFixture();
  for (const definitionText of [
    'on:\n  schedule:\n    - cron: "0 2 * * *"\n      timezone: America/Toronto\n',
    'on:\n  schedule:\n    - cron: "0 2 * * *"\n    - cron: "0 3 * * *"\n',
  ]) {
    const changed = sealBundle({ ...bundle, runs: [], workflow: { ...bundle.workflow, definitionText, definitionSha256: sha256(definitionText) } });
    const report = auditEvidence(changed, null);
    assert.equal(report.schedule.supported, false);
    assert.deepEqual(report.analysis.opportunities, []);
    assert.equal(exitCodeForReport(report, 'none'), 3);
  }
});

test('JSON replay of the same evidence and policy is byte-identical', () => {
  const { bundle, policy } = productFixture();
  const a = canonicalJson(auditEvidence(bundle, policy));
  assert.equal(canonicalJson(auditEvidence(JSON.parse(JSON.stringify(bundle)), policy)), a);
});

test('zero opportunities cannot hide absent or narrowly scoped historical assertions', () => {
  const { bundle, policy } = productFixture();
  const empty = sealBundle({ ...bundle, runs: [], interval: { fromMs: at(10), toMs: at(20) } });
  for (const assertions of [
    { ...policy.assertions, historyAvailable: false, definitionStable: false, workflowEligible: false },
    { ...policy.assertions, fromMs: at(10), throughMs: at(20) },
  ]) {
    const report = auditEvidence(empty, { ...policy, assertions });
    assert.equal(report.summary.targetOpportunities, 0);
    assert.equal(exitCodeForReport(report, 'none'), 3);
    assert.ok(report.warnings.some(w => w.includes('entire requested context')));
  }
});

test('text rendering rejects expansion beyond the report size ceiling', () => {
  const { bundle, policy } = productFixture();
  const report = auditEvidence(bundle, policy);
  report.analysis.opportunities[0].candidateRunIds = Array.from({ length: 11_000 }, () => '1'.repeat(1024));
  assert.throws(() => formatReport(report), /10 MiB/);
});

test('narrower reanalysis excludes outer collection context without hiding identity conflicts', () => {
  const { bundle, policy } = productFixture();
  const outer = { ...bundle.runs[0], runId: '99', createdAtMs: at(-40), startedAtMs: at(-39) };
  const changed = sealBundle({ ...bundle, runs: [bundle.runs[0], outer] });
  const report = auditEvidence(changed, policy, { maxLatenessMs: 10 * minute, lateAfterMs: 5 * minute });
  assert.deepEqual(report.analysis.opportunities.map(r => r.classification), ['matched_on_time', 'no_observed_run', 'no_observed_run']);
  assert.equal(report.summary.excludedContextObservations, 1);
  assert.equal(report.summary.recordedScheduledRunsInContext, 1);
  assert.deepEqual(report.analysis.unmatchedRunIds, []);
  const conflict = sealBundle({ ...changed, runs: [...changed.runs, { ...outer, runId: bundle.runs[0].runId }] });
  const unknown = auditEvidence(conflict, policy, { maxLatenessMs: 10 * minute, lateAfterMs: 5 * minute });
  assert.ok(unknown.analysis.opportunities.every(r => r.classification === 'unknown'));
});

test('current disabled metadata is a warning, not an invented historical exclusion', () => {
  const { bundle, policy } = productFixture();
  const changed = sealBundle({ ...bundle, workflow: { ...bundle.workflow, state: 'disabled_inactivity' } });
  const report = auditEvidence(changed, policy);
  assert.ok(report.warnings.some(w => w.includes('disabled_inactivity')));
  assert.ok(report.analysis.opportunities.every(r => r.classification !== 'excluded'));
});

test('unexplained runs suppress aggregate delay summaries and gaps', () => {
  const { bundle, policy } = productFixture();
  const changed = sealBundle({ ...bundle, runs: [...bundle.runs, { ...bundle.runs[0], runId: '102', createdAtMs: at(55), startedAtMs: at(56) }] });
  const report = auditEvidence(changed, policy);
  assert.equal(report.summary.creationLag, null);
  assert.ok(report.analysis.opportunities.some(r => r.reasonCodes.includes('unknown_unexplained_run')));
  assert.equal(exitCodeForReport(report, 'none'), 3);
});

test('report escapes control characters in operator notes', () => {
  const { bundle, policy } = productFixture();
  policy.assertions.note = '\u001b[31m\nforged result';
  const text = formatReport(auditEvidence(bundle, policy));
  assert.ok(!text.includes('\u001b'));
  assert.match(text, /\\u001b/);
});
