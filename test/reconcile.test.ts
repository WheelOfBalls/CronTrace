import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reconcile } from '../src/reconcile.ts';
import type { ReconcileInput } from '../src/domain.ts';
import { at, fixture, minute, opportunity, run } from './fixtures.ts';

const outcomes = (input: ReconcileInput) => reconcile(input).opportunities.map(row => [row.id, row.classification]);

test('isolated creation lag includes exact tolerance and preserves original start lag', () => {
  const result = reconcile(fixture({ runs: [run('r', 90)] }));
  assert.deepEqual(result.opportunities, [{
    id: 'slot', expectedAtMs: at(60), definitionId: 'synthetic-definition', exclusionReason: null,
    classification: 'matched_on_time', reasonCodes: ['isolated_candidate'], candidateRunIds: ['r'],
    matchedRunId: 'r', creationLagMs: 1_800_000, originalStartLagMs: 1_860_000,
  }]);
});

test('creation lag after tolerance is late and horizon endpoint remains a candidate', () => {
  assert.deepEqual(outcomes(fixture({ runs: [run('r', 180)] })), [['slot', 'matched_late']]);
});

test('elapsed horizon without a record is conditional absence, never a confirmed miss', () => {
  const row = reconcile(fixture()).opportunities[0];
  assert.equal(row.classification, 'no_observed_run');
  assert.deepEqual(row.reasonCodes, ['no_record_in_horizon']);
  assert.equal(row.creationLagMs, null);
});

test('past tolerance is still pending until the attribution horizon closes', () => {
  assert.deepEqual(outcomes(fixture({ observedUntilMs: at(179), toMs: at(120) })), [['slot', 'pending']]);
  assert.deepEqual(outcomes(fixture({ observedUntilMs: at(180) })), [['slot', 'no_observed_run']]);
});

test('ambiguous delayed execution is not assigned to the nearest slot', () => {
  const result = reconcile(fixture({
    opportunities: [opportunity('10:00', 60), opportunity('11:00', 120)], runs: [run('late', 130)],
  }));
  assert.deepEqual(result.opportunities.map(row => row.classification), ['ambiguous', 'ambiguous']);
  assert.deepEqual(result.opportunities.map(row => row.candidateRunIds), [['late'], ['late']]);
  assert.ok(result.opportunities.every(row => row.matchedRunId === null && row.creationLagMs === null));
});

test('two runs for one opportunity are ambiguous, not arbitrarily selected', () => {
  assert.deepEqual(outcomes(fixture({ runs: [run('a', 65), run('b', 70)] })), [['slot', 'ambiguous']]);
});

test('a connected chain stays ambiguous even where global assignment could resolve it', () => {
  assert.deepEqual(outcomes(fixture({ opportunities: [opportunity('a', 60), opportunity('b', 120)],
    runs: [run('early', 65), run('late', 130)] })), [['a', 'ambiguous'], ['b', 'ambiguous']]);
});

test('reruns and duplicate pages count once and preserve original/latest conclusions', () => {
  const first = run('r', 65, { conclusion: 'failure', observedAtMs: at(80) });
  const retry = run('r', 65, { attempt: 2, startedAtMs: at(250), observedAtMs: at(300) });
  const result = reconcile(fixture({ runs: [retry, first, first] }));
  assert.deepEqual(result.opportunities.map(row => row.classification), ['matched_on_time']);
  assert.equal(result.runs.length, 1);
  assert.deepEqual(result.runs[0].attempts, [1, 2]);
  assert.equal(result.runs[0].observations.length, 2);
  assert.equal(result.runs[0].originalConclusion, 'failure');
  assert.equal(result.runs[0].latestConclusion, 'success');
  assert.equal(result.opportunities[0].originalStartLagMs, 360_000);
});

test('a rerun starting near another slot cannot fill that second opportunity', () => {
  assert.deepEqual(outcomes(fixture({ toMs: at(350), opportunities: [opportunity('a', 0), opportunity('b', 240)],
    runs: [run('r', 5), run('r', 5, { attempt: 2, startedAtMs: at(245) })] })),
  [['a', 'matched_on_time'], ['b', 'no_observed_run']]);
});

test('manual events and other workflows/repositories never fill a scheduled slot', () => {
  const result = reconcile(fixture({ runs: [run('manual', 65, { event: 'workflow_dispatch' }),
    run('other', 65, { workflowId: 'other' }), run('foreign', 65, { repositoryId: 'other' })] }));
  assert.equal(result.opportunities[0].classification, 'no_observed_run');
  assert.deepEqual(result.runs, []);
});

for (const conclusion of ['failure', 'cancelled', 'skipped', null]) {
  test(`recorded run with conclusion ${conclusion} still establishes existence`, () => {
    assert.deepEqual(outcomes(fixture({ runs: [run('r', 65, { conclusion })] })), [['slot', 'matched_on_time']]);
  });
}

test('unavailable original attempt start stays null rather than borrowing a rerun timestamp', () => {
  const result = reconcile(fixture({ runs: [run('r', 65, { attempt: 2, startedAtMs: at(250) })] }));
  assert.equal(result.opportunities[0].classification, 'matched_on_time');
  assert.equal(result.opportunities[0].originalStartLagMs, null);
  assert.ok(result.runs[0].reasonCodes.includes('original_start_unavailable'));
});

for (const kind of ['api', 'history', 'definition', 'eligibility', 'context'] as const) {
  test(`missing ${kind} evidence produces unknown even when a plausible run exists`, () => {
    const input = fixture({ runs: [run('r', 65)] });
    const result = reconcile({ ...input, evidence: input.evidence.filter(e => e.kind !== kind) });
    assert.equal(result.opportunities[0].classification, 'unknown');
    assert.ok(result.opportunities[0].reasonCodes.includes(kind === 'context' ? 'unknown_boundary' : `unknown_${kind}`));
    assert.deepEqual(result.opportunities[0].candidateRunIds, ['r']);
  });
}

test('empty history without a retention assertion is unknown, not a gap', () => {
  const input = fixture();
  assert.deepEqual(outcomes({ ...input, evidence: input.evidence.filter(e => e.kind !== 'history') }), [['slot', 'unknown']]);
});

test('coverage ending early is unknown even if the nominal horizon elapsed', () => {
  const input = fixture();
  assert.deepEqual(outcomes({ ...input, evidence: input.evidence.map(e => e.kind === 'api' ? { ...e, throughMs: at(179) } : e) }), [['slot', 'unknown']]);
});

test('runs after the target interval can match; target end itself is excluded', () => {
  const input = fixture({ fromMs: at(120), toMs: at(180),
    opportunities: [opportunity('late-day', 170), opportunity('next', 180)],
    runs: [run('r', 200)], maxLatenessMs: 120 * minute });
  assert.deepEqual(outcomes(input), [['late-day', 'ambiguous']]);
  assert.deepEqual(outcomes({ ...input, opportunities: [opportunity('late-day', 170)] }), [['late-day', 'matched_on_time']]);
});

test('pre-window opportunity competes with the target opportunity', () => {
  assert.deepEqual(outcomes(fixture({ fromMs: at(60), opportunities: [opportunity('before', 0), opportunity('target', 60)],
    runs: [run('r', 70)] })), [['target', 'ambiguous']]);
});

test('missing left context cannot create an isolated match', () => {
  const input = fixture({ runs: [run('r', 65)] });
  assert.deepEqual(outcomes({ ...input, evidence: input.evidence.map(e => e.kind === 'context' ? { ...e, fromMs: at(0) } : e) }), [['slot', 'unknown']]);
});

test('exclusions stay in the candidate graph and cannot donate a run', () => {
  const result = reconcile(fixture({ opportunities: [{ ...opportunity('excluded', 60), exclusionReason: 'known disabled interval' }, opportunity('active', 120)], runs: [run('r', 130)] }));
  assert.deepEqual(result.opportunities.map(row => row.classification), ['excluded', 'ambiguous']);
  assert.equal(result.opportunities[0].exclusionReason, 'known disabled interval');
});

test('unexplained run prevents an absence judgment, but a future record is outside the cutoff', () => {
  const result = reconcile(fixture({ runs: [run('early', 0), run('future', 401)] }));
  assert.deepEqual(result.unmatchedRunIds, ['early']);
  assert.equal(result.opportunities[0].classification, 'unknown');
  assert.ok(result.opportunities[0].reasonCodes.includes('unknown_unexplained_run'));
  assert.deepEqual(outcomes(fixture({ runs: [run('future', 401)] })), [['slot', 'no_observed_run']]);
});

test('incompatible or missing definitions are unknown, not successful attribution', () => {
  for (const definitionId of ['different', null]) {
    assert.deepEqual(outcomes(fixture({ runs: [run('r', 65, { definitionId })] })), [['slot', 'unknown']]);
  }
  assert.deepEqual(outcomes(fixture({ semanticsSupported: false })), [['slot', 'unknown']]);
});

test('contradictory creation times for the same identity cannot fabricate two runs', () => {
  const result = reconcile(fixture({ runs: [run('r', 65), run('r', 130)] }));
  assert.equal(result.runs.length, 1);
  assert.equal(result.opportunities[0].classification, 'unknown');
  assert.ok(result.diagnostics.includes('conflicting_run_observations'));
});

test('same-ID event/workflow conflicts cannot be hidden by filtering before normalization', () => {
  for (const patch of [{ event: 'workflow_dispatch' }, { workflowId: 'other' }]) {
    assert.deepEqual(outcomes(fixture({ runs: [run('r', 65), run('r', 65, patch)] })), [['slot', 'unknown']]);
  }
});

test('original start is unavailable for queued, inconsistent, or tied-conflicting observations', () => {
  for (const startedAtMs of [null, at(64), at(601)]) {
    const result = reconcile(fixture({ runs: [run('r', 65, { startedAtMs })] }));
    assert.equal(result.opportunities[0].classification, 'matched_on_time');
    assert.equal(result.opportunities[0].originalStartLagMs, null);
  }
  const result = reconcile(fixture({ runs: [run('r', 65), run('r', 65, { conclusion: 'failure' })] }));
  assert.equal(result.opportunities[0].classification, 'matched_on_time');
  assert.equal(result.runs[0].originalConclusion, null);
  assert.equal(result.opportunities[0].originalStartLagMs, null);
  assert.ok(result.runs[0].reasonCodes.includes('conflicting_attempt_observations'));
});

test('contradictory non-null start times within one attempt remain unknown across fetch times', () => {
  const input = fixture({ runs: [run('r', 65, { startedAtMs: at(66), observedAtMs: at(80) }),
    run('r', 65, { startedAtMs: at(100), observedAtMs: at(110) })] });
  const result = reconcile(input);
  assert.equal(result.opportunities[0].originalStartLagMs, null);
  assert.ok(result.runs[0].reasonCodes.includes('conflicting_attempt_observations'));
  assert.equal(result.opportunities[0].classification, 'matched_on_time');
});

test('a null start can become known in a later observation of the same attempt', () => {
  const result = reconcile(fixture({ runs: [run('r', 65, { startedAtMs: null, observedAtMs: at(65) }), run('r', 65)] }));
  assert.equal(result.opportunities[0].originalStartLagMs, 360_000);
});

test('post-cutoff start is a later observation; earlier attempt fetch does not erase a rerun', () => {
  const result = reconcile(fixture({ runs: [
    run('r', 65, { startedAtMs: at(410), observedAtMs: at(500), conclusion: 'failure' }),
    run('r', 65, { attempt: 2, startedAtMs: at(450), observedAtMs: at(460) }),
  ] }));
  assert.equal(result.opportunities[0].originalStartLagMs, 21_000_000);
  assert.equal(result.runs[0].latestConclusion, 'success');
  assert.ok(result.runs[0].observations.some(r => r.observedAtMs === at(500)));
});

test('an unknown contextual opportunity cannot be discarded to produce a target match', () => {
  const input = fixture({ fromMs: at(60), opportunities: [
    { ...opportunity('context', 0), definitionId: null }, opportunity('target', 60),
  ], runs: [run('r', 70)] });
  assert.deepEqual(outcomes(input), [['target', 'unknown']]);
});

test('a component reaching outside asserted context remains unknown rather than merely ambiguous', () => {
  const input = fixture({ opportunities: [opportunity('a', 60), opportunity('b', 120)], runs: [run('r', 130)] });
  assert.deepEqual(outcomes({ ...input, evidence: input.evidence.map(e => e.kind === 'context' ? { ...e, throughMs: at(180) } : e) }),
    [['a', 'unknown'], ['b', 'unknown']]);
});

test('adjacent evidence intervals cover the horizon, but a real millisecond hole does not', () => {
  const input = fixture();
  const others = input.evidence.filter(e => e.kind !== 'api');
  const first = { kind: 'api', basis: 'observed', fromMs: at(-60), throughMs: at(60) } as const;
  const second = { ...first, fromMs: at(60) + 1, throughMs: at(180) };
  assert.deepEqual(outcomes({ ...input, evidence: [...others, first, second] }), [['slot', 'no_observed_run']]);
  assert.deepEqual(outcomes({ ...input, evidence: [...others, first, { ...second, fromMs: at(60) + 2 }] }), [['slot', 'unknown']]);
});

test('zero target opportunities produce no invented row or certainty statistic', () => {
  assert.deepEqual(reconcile(fixture({ opportunities: [] })).opportunities, []);
});

test('larger horizon can turn isolated matches into ambiguity', () => {
  const input = fixture({ opportunities: [opportunity('a', 60), opportunity('b', 120)], runs: [run('r', 130)] });
  assert.deepEqual(outcomes({ ...input, maxLatenessMs: 30 * minute }), [['a', 'no_observed_run'], ['b', 'matched_on_time']]);
  assert.deepEqual(outcomes(input), [['a', 'ambiguous'], ['b', 'ambiguous']]);
});

test('repeated runs do not acquire a different result under input permutation or mutation', () => {
  const input = fixture({ opportunities: [opportunity('b', 120), opportunity('a', 60)],
    runs: [run('z', 130), run('a', 65), run('a', 65, { attempt: 2, startedAtMs: at(300) })] });
  const before = JSON.stringify(input);
  const expected = JSON.stringify(reconcile(input));
  for (const runs of [input.runs, [...input.runs].reverse(), [input.runs[1], input.runs[2], input.runs[0]]]) {
    const actual = reconcile({ ...input, runs, opportunities: [...input.opportunities].reverse(), evidence: [...input.evidence].reverse() });
    assert.equal(JSON.stringify(actual), expected);
    assert.deepEqual(JSON.parse(JSON.stringify(actual)), actual);
  }
  assert.equal(JSON.stringify(input), before);
});

test('deterministic grid checks assignment uniqueness, nonnegative lag, and evidence degradation', () => {
  for (const times of [[], [0], [60], [61], [130], [65, 130], [0, 240]]) {
    const input = fixture({ opportunities: [opportunity('a', 0), opportunity('b', 60), opportunity('c', 120)],
      runs: times.map((t, i) => run(`r${i}`, t)) });
    const result = reconcile(input);
    assert.equal(result.opportunities.length, 3);
    const matched = result.opportunities.flatMap(r => r.matchedRunId === null ? [] : [r.matchedRunId]);
    assert.equal(new Set(matched).size, matched.length);
    assert.ok(result.opportunities.every(r => r.creationLagMs === null || r.creationLagMs >= 0));
    for (const evidence of [[], input.evidence.filter(e => e.kind !== 'api'), input.evidence.filter(e => e.kind !== 'history')]) {
      assert.ok(reconcile({ ...input, evidence }).opportunities.every(r => r.classification === 'unknown'));
    }
  }
});

test('adversarial oracle rejects a deliberately wrong nearest-slot matcher', () => {
  const input = fixture({ opportunities: [opportunity('a', 60), opportunity('b', 120)], runs: [run('r', 130)] });
  // Intentionally wrong test-only implementation: attributes the delayed record
  // to the latest eligible slot, falsely leaving the earlier slot unobserved.
  const nearest = input.opportunities.reduce((a, b) => a.expectedAtMs > b.expectedAtMs ? a : b);
  const broken = input.opportunities.map(o => o.id === nearest.id ? 'matched_on_time' : 'no_observed_run');
  const expected = ['ambiguous', 'ambiguous']; // independently specified oracle
  assert.throws(() => assert.deepEqual(broken, expected), assert.AssertionError);
  assert.deepEqual(reconcile(input).opportunities.map(r => r.classification), expected);
});

for (const [name, patch] of [
  ['NaN cutoff', { observedUntilMs: NaN }],
  ['infinite horizon', { maxLatenessMs: Infinity }],
  ['zero horizon', { maxLatenessMs: 0 }],
  ['negative tolerance', { lateAfterMs: -1 }],
  ['tolerance above horizon', { lateAfterMs: 121 * minute }],
  ['fractional timestamp', { fromMs: at(0) + 0.5 }],
  ['empty interval', { toMs: at(0) }],
  ['future target interval', { toMs: at(401) }],
  ['excessive audit span', { fromMs: at(-200_000) }],
  ['empty identity', { repositoryId: '' }],
  ['unknown semantics flag', { semanticsSupported: undefined }],
] as const) {
  test(`rejects ${name} rather than serializing misleading results`, () => {
    assert.throws(() => reconcile(fixture(patch as Partial<ReconcileInput>)));
  });
}

test('rejects invalid observation identifiers, attempts, bounds, and non-finite times', () => {
  for (const patch of [{ runId: '' }, { attempt: 0 }, { attempt: 1.5 }, { createdAtMs: Infinity },
    { observedAtMs: at(60) }, { startedAtMs: NaN }]) {
    assert.throws(() => reconcile(fixture({ runs: [run('r', 65, patch)] })));
  }
  assert.throws(() => reconcile(fixture({ opportunities: [opportunity('a', 60), opportunity('a', 120)] })));
  assert.throws(() => reconcile(fixture({ opportunities: [{ ...opportunity('a', 60), exclusionReason: '' }] })));
  assert.throws(() => reconcile(fixture({ evidence: [{ kind: 'api', basis: 'observed', fromMs: at(60), throughMs: at(0) }] })));
  const malformed = fixture();
  (malformed.evidence[0] as unknown as { basis: string }).basis = 'unknown';
  assert.throws(() => reconcile(malformed));
});

test('resource limits reject excessive opportunities, observations, or candidate edges without sampling', () => {
  assert.throws(() => reconcile(fixture({ opportunities: Array.from({ length: 50_001 }, (_, i) => opportunity(`s${i}`, 60)) })), /limit/i);
  assert.throws(() => reconcile(fixture({ runs: Array.from({ length: 50_001 }, (_, i) => run(`r${i}`, 65)) })), /limit/i);
  assert.throws(() => reconcile(fixture({ opportunities: Array.from({ length: 501 }, (_, i) => opportunity(`s${i}`, 60)),
    runs: Array.from({ length: 500 }, (_, i) => run(`r${i}`, 65)) })), /limit/i);
});
