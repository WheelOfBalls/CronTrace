import test from 'node:test';
import assert from 'node:assert/strict';
import { collectEvidence } from '../src/github.ts';

const base = Date.parse('2026-01-01T00:00:00Z');
const options = { repository: 'owner/repo', workflow: 'daily.yml', fromMs: base + 1, toMs: base + 1999, maxLatenessMs: 1 };
const yaml = 'on:\n  schedule:\n    - cron: "0 0 * * *"\n';
const sha = 'a'.repeat(40);
const run = (id: number, extra: Record<string, unknown> = {}) => ({ id, repository: { id: 10 }, workflow_id: 20, event: 'schedule', created_at: new Date(base).toISOString(), run_attempt: 1, run_started_at: new Date(base + 500).toISOString(), conclusion: 'cancelled', ...extra });
const json = (value: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(value), { status, headers });
function fixture(handler: (url: URL, index: number) => Response | Promise<Response>, definition = yaml) {
  const calls: { url: URL; init: RequestInit | undefined }[] = [];
  let listIndex = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (url.pathname === '/repos/owner/repo') return json({ id: 10, full_name: 'owner/repo', default_branch: 'main' });
    if (url.pathname === '/repos/owner/repo/actions/workflows/daily.yml') return json({ id: 20, path: '.github/workflows/daily.yml', state: 'active' });
    if (url.pathname === '/repos/owner/repo/commits/main') return json({ sha });
    if (url.pathname === '/repos/owner/repo/contents/.github/workflows/daily.yml') return json({ type: 'file', path: '.github/workflows/daily.yml', encoding: 'base64', content: Buffer.from(definition).toString('base64'), size: Buffer.byteLength(definition) });
    return handler(url, listIndex++);
  };
  return { calls, deps: { fetch: fetcher, now: () => base + 10_000, sleep: async (_ms: number) => {} } };
}

test('collects projected scheduled observations, pins definition, keeps cancellation and a frozen cutoff', async () => {
  const f = fixture(() => json({ total_count: 3, workflow_runs: [run(1), run(2, { event: 'workflow_dispatch' }), run(3, { created_at: new Date(base + 20_000).toISOString(), run_started_at: null })] }));
  const bundle = await collectEvidence({ ...options, token: 'secret-test-token' }, f.deps);
  assert.equal(bundle.runs.length, 1);
  assert.equal(bundle.runs[0].conclusion, 'cancelled');
  assert.equal(bundle.runs[0].definitionId, bundle.workflow.definitionSha256);
  assert.equal(bundle.observedUntilMs, base + 10_000);
  assert.deepEqual(bundle.collection.coverage, [{ fromMs: base, throughMs: base + 2000 }]);
  assert.match(bundle.collection.diagnostics.join(' '), /historical.*not verified/i);
  assert.ok(!JSON.stringify(bundle).includes('secret-test-token'));
  for (const call of f.calls) {
    assert.equal(call.url.origin, 'https://api.github.com');
    assert.equal(call.init?.method, 'GET');
    assert.equal(call.init?.redirect, 'manual');
    assert.equal(new Headers(call.init?.headers).get('X-GitHub-Api-Version'), '2026-03-10');
  }
});

test('walks full pages even without Link and does one complete stability recheck', async () => {
  const first = Array.from({ length: 100 }, (_, i) => run(i + 1));
  const f = fixture(url => json({ total_count: 101, workflow_runs: url.searchParams.get('page') === '1' ? first : [run(101)] }));
  const bundle = await collectEvidence(options, f.deps);
  assert.equal(bundle.runs.length, 101);
  assert.equal(bundle.collection.coverage.length, 1);
  assert.equal(f.calls.filter(c => c.url.pathname.endsWith('/runs')).length, 4);
});

test('rejects foreign Link without forwarding credentials', async () => {
  const f = fixture(() => json({ total_count: 0, workflow_runs: [] }, 200, { link: '<https://evil.example/steal>; rel="next"' }));
  const bundle = await collectEvidence({ ...options, token: 'hidden-value' }, f.deps);
  assert.deepEqual(bundle.collection.coverage, []);
  assert.ok(bundle.collection.diagnostics.some(x => x.includes('unsafe_pagination')));
  assert.ok(f.calls.every(c => c.url.hostname === 'api.github.com'));
});

test('redirects and permanent list errors produce partial evidence, never empty coverage', async () => {
  for (const status of [301, 401, 403, 404]) {
    const f = fixture(() => json({ message: 'do-not-echo' }, status, { location: 'https://evil.example/' }));
    const bundle = await collectEvidence(options, f.deps);
    assert.equal(bundle.collection.coverage.length, 0);
    assert.ok(!JSON.stringify(bundle).includes('do-not-echo'));
  }
});

test('transient requests retry with bounded backoff; long retry-after preserves partial evidence', async () => {
  const sleeps: number[] = [];
  const f = fixture((_url, i) => i === 0 ? json({}, 503) : json({ total_count: 0, workflow_runs: [] }));
  const bundle = await collectEvidence(options, { ...f.deps, sleep: async ms => { sleeps.push(ms); } });
  assert.equal(bundle.collection.coverage.length, 1);
  assert.deepEqual(sleeps, [250]);
  const limited = fixture(() => json({ message: 'sensitive' }, 429, { 'retry-after': '600' }));
  const partial = await collectEvidence(options, limited.deps);
  assert.equal(partial.collection.coverage.length, 0);
  assert.equal(partial.collection.requests, 5);
});

test('splits capped partitions and marks a saturated single second incomplete', async () => {
  const f = fixture(url => {
    const [lo, hi] = url.searchParams.get('created')!.split('..').map(Date.parse);
    return json({ total_count: lo < hi ? 1000 : 0, workflow_runs: [] });
  });
  const bundle = await collectEvidence(options, f.deps);
  assert.equal(bundle.collection.coverage.length, 3);
  const saturated = fixture(() => json({ total_count: 1000, workflow_runs: [] }));
  const partial = await collectEvidence({ ...options, toMs: base + 2 }, saturated.deps);
  assert.equal(partial.collection.coverage.length, 0);
  assert.match(partial.collection.diagnostics.join(' '), /saturated/);
});

test('budget exhaustion retains observed runs without asserting coverage', async () => {
  const f = fixture(() => json({ total_count: 1, workflow_runs: [run(1)] }));
  const bundle = await collectEvidence({ ...options, requestBudget: 5 }, f.deps);
  assert.equal(bundle.runs.length, 1);
  assert.equal(bundle.collection.requests, 5);
  assert.equal(bundle.collection.coverage.length, 0);
  assert.match(bundle.collection.diagnostics.join(' '), /budget/);
});

test('changing IDs or duplicate pages cannot claim stable traversal', async () => {
  const f = fixture((_url, i) => json({ total_count: 1, workflow_runs: [run(i + 1)] }));
  const bundle = await collectEvidence(options, f.deps);
  assert.equal(bundle.collection.coverage.length, 0);
  assert.equal(bundle.runs.length, 2);
  const duplicate = fixture(() => json({ total_count: 101, workflow_runs: Array.from({ length: 100 }, (_, i) => run(i + 1)) }));
  const partial = await collectEvidence(options, duplicate.deps);
  assert.equal(partial.collection.coverage.length, 0);
});

test('invalid run shapes and unsafe IDs fail the partition safely', async () => {
  for (const invalid of [null, {}, run(Number.MAX_SAFE_INTEGER + 1), run(1, { workflow_id: 21 }), run(1, { created_at: 'bad' }), run(1, { run_attempt: 0 })]) {
    const f = fixture(() => json({ total_count: 1, workflow_runs: [invalid] }));
    const bundle = await collectEvidence(options, f.deps);
    assert.equal(bundle.collection.coverage.length, 0);
  }
});

test('retrieves attempt one separately; unavailable original start stays unavailable', async () => {
  for (const available of [true, false]) {
    const f = fixture(url => url.pathname.endsWith('/attempts/1')
      ? available ? json(run(1)) : json({}, 404)
      : json({ total_count: 1, workflow_runs: [run(1, { run_attempt: 2 })] }));
    const bundle = await collectEvidence(options, f.deps);
    assert.deepEqual(bundle.runs.map(r => r.attempt).sort(), available ? [1, 2] : [2]);
    assert.equal(bundle.collection.coverage.length, 1);
    if (!available) assert.match(bundle.collection.diagnostics.join(' '), /original_start_unavailable/);
  }
});

test('initial failures and credentials echoed in source fail without exposing content', async () => {
  await assert.rejects(collectEvidence(options, { fetch: async () => json({ message: 'secret-value' }, 401) }), e => e instanceof Error && !e.message.includes('secret-value'));
  const f = fixture(() => json({ total_count: 0, workflow_runs: [] }), 'secret-test-token');
  await assert.rejects(collectEvidence({ ...options, token: 'secret-test-token' }, f.deps), e => e instanceof Error && !e.message.includes('secret-test-token'));
});

test('rejects endpoints masquerading as repository or workflow identifiers before HTTP', async () => {
  for (const patch of [{ repository: 'https://evil.example/repo' }, { workflow: '../daily.yml' }, { workflow: 'https://evil.example/x' }]) {
    let requested = false;
    await assert.rejects(collectEvidence({ ...options, ...patch }, { fetch: async () => { requested = true; return json({}); } }));
    assert.equal(requested, false);
  }
});

test('Unicode-escaped credentials in API strings cannot reach evidence', async () => {
  const token = 'dummy-secret-value';
  const payload = JSON.stringify({ total_count: 1, workflow_runs: [run(1, { conclusion: token })] });
  const escaped = token.split('').map(c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join('');
  const f = fixture(() => new Response(payload.replace(token, escaped)));
  const bundle = await collectEvidence({ ...options, token }, f.deps);
  assert.equal(bundle.collection.coverage.length, 0);
  assert.ok(!JSON.stringify(bundle).includes(token));
});

test('bare secondary limits and long cooldowns stop all later collection requests', async () => {
  const bare = fixture(() => json({}, 429));
  const partial = await collectEvidence(options, bare.deps);
  assert.equal(partial.collection.requests, 5);
  const split = fixture((_url, i) => i === 0 ? json({ total_count: 1000, workflow_runs: [] })
    : json({}, 429, { 'retry-after': '600' }));
  const stopped = await collectEvidence(options, split.deps);
  assert.equal(stopped.collection.requests, 6);
  assert.equal(stopped.collection.coverage.length, 0);
});

test('secondary limits do not use unrelated primary reset headers or probe forbidden partitions', async () => {
  for (const response of [json({}, 429, { 'x-ratelimit-remaining': '200', 'x-ratelimit-reset': String((base + 10_000) / 1000) }), json({}, 403)]) {
    const f = fixture((_url, i) => i === 0 ? json({ total_count: 1000, workflow_runs: [] }) : response.clone());
    const bundle = await collectEvidence(options, f.deps);
    assert.equal(bundle.collection.requests, 6);
    assert.equal(bundle.collection.coverage.length, 0);
  }
});

test('API calendar normalization cannot turn an impossible timestamp into evidence', async () => {
  const f = fixture(() => json({ total_count: 1, workflow_runs: [run(1, { created_at: '2026-02-30T00:00:00Z' })] }));
  assert.equal((await collectEvidence(options, f.deps)).collection.coverage.length, 0);
});
