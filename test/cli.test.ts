import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCli } from '../src/cli.ts';
import { writeBundle } from '../src/evidence.ts';
import { productFixture } from './product-fixture.ts';

async function workspace(fn: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'crontrace-cli-'));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
function output() {
  const stdout: string[] = [], stderr: string[] = [];
  return { stdout, stderr, io: { out: (s: string) => { stdout.push(s); }, err: (s: string) => { stderr.push(s); }, env: {} } };
}
test('help/version work and unknown commands or options fail clearly', async () => {
  const o = output();
  assert.equal(await runCli(['--help'], o.io), 0);
  assert.match(o.stdout.join(''), /collect.*audit/s);
  assert.equal(await runCli(['--version'], o.io), 0);
  for (const args of [['wat'], ['audit'], ['audit', 'x', '--wat'], ['--token', 'secret']]) {
    assert.equal(await runCli(args, o.io), 2);
  }
  assert.ok(!o.stderr.join('').includes('secret'));
});
test('offline text and canonical JSON reports reproduce and honor findings exit codes', async () => workspace(async dir => {
  const { bundle, policy } = productFixture();
  const evidence = join(dir, 'evidence.json'), policyPath = join(dir, 'policy.json');
  await writeBundle(evidence, bundle);
  await writeFile(policyPath, JSON.stringify(policy));
  const args = ['audit', evidence, '--policy', policyPath, '--late-after', '10m'];
  const o = output();
  assert.equal(await runCli([...args, '--fail-on', 'gap'], o.io), 1);
  assert.match(o.stdout.join(''), /potential gap/);
  const a = output(), b = output();
  assert.equal(await runCli([...args, '--format', 'json'], a.io), 0);
  assert.equal(await runCli([...args, '--format', 'json'], b.io), 0);
  assert.deepEqual(a.stdout, b.stdout);
  assert.equal(JSON.parse(a.stdout[0]).summary.targetOpportunities, 3);
  assert.equal(await runCli(['audit', evidence], output().io), 3);
}));
test('policy templates default to explicit unknowns and output never overwrites', async () => workspace(async dir => {
  const { bundle } = productFixture();
  const path = join(dir, 'bundle.json'), template = join(dir, 'policy.json');
  await writeBundle(path, bundle);
  assert.equal(await runCli(['policy', path, '--out', template], output().io), 0);
  const value = JSON.parse(await readFile(template, 'utf8'));
  assert.equal(value.assertions.definitionStable, false);
  assert.equal(value.assertions.historyAvailable, false);
  assert.equal(value.assertions.workflowEligible, false);
  assert.equal(value.definitionSha256, bundle.workflow.definitionSha256);
  assert.equal((await stat(template)).mode & 0o777, 0o600);
  assert.equal(await runCli(['policy', path, '--out', template], output().io), 2);
  assert.equal(await runCli(['audit', path, '--out', path], output().io), 2);
  assert.equal(JSON.parse(await readFile(path, 'utf8')).digest, bundle.digest);
}));
test('collect uses read-only collector and env token, writes a replayable bundle', async () => workspace(async dir => {
  const { bundle } = productFixture();
  const target = join(dir, 'bundle.json');
  const o = output();
  const code = await runCli(['collect', 'example/crontrace-synthetic', '--workflow', '42',
    '--from', '2026-01-01T00:00:00Z', '--to', '2026-01-01T03:00:00Z', '--out', target],
  { ...o.io, env: { GH_TOKEN: 'test-secret' } }, { collect: async options => {
    assert.equal(options.token, 'test-secret');
    assert.equal(options.fromMs, bundle.interval.fromMs);
    return bundle;
  } });
  assert.equal(code, 0);
  assert.ok(!o.stdout.join('').includes('test-secret'));
  assert.equal(JSON.parse(await readFile(target, 'utf8')).digest, bundle.digest);
}));
test('invalid dates/durations/flags are rejected before network or filesystem output', async () => {
  let requested = false;
  const base = ['collect', 'owner/repo', '--workflow', 'daily.yml', '--to', '2026-03-04T00:00:00Z', '--out', '/nonexistent'];
  for (const value of ['2026-02-30T00:00:00Z', '2026-01-01', '2026-01-01T25:00:00Z', '2026-01-01T00:00:00', '2026-01-01T00:00:00+99:00']) {
    assert.equal(await runCli([...base, '--from', value], output().io, { collect: async () => { requested = true; throw new Error(); } }), 2);
  }
  assert.equal(requested, false);
  for (const args of [['audit', 'x', '--late-after', '-1m'], ['audit', 'x', '--format', 'html'], ['audit', 'x', '--fail-on', 'anything'], ['audit', 'x', '--from', 'ignored']]) {
    assert.equal(await runCli(args, output().io), 2);
  }
});
test('exceptions cannot print credentials or terminal control sequences', async () => {
  const o = output();
  assert.equal(await runCli(['collect', 'owner/repo', '--workflow', 'a.yml', '--from', '2026-01-01T00:00:00Z',
    '--to', '2026-01-02T00:00:00Z', '--out', 'unused'], { ...o.io, env: { GH_TOKEN: 'dont-print-me' } },
  { collect: async () => { throw new Error('dont-print-me\u001b[31m'); } }), 2);
  assert.ok(!o.stderr.join('').includes('dont-print-me'));
  assert.ok(!o.stderr.join('').includes('\u001b'));
});
