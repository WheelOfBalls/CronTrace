import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { canonicalJson, readBundle, readPolicy, sealBundle, sha256, validateBundle, validatePolicy, writeBundle } from '../src/evidence.ts';
import type { AuditPolicy, UnsealedBundle } from '../src/evidence-types.ts';
import { syntheticBundle, syntheticPolicy } from './evidence-fixture.ts';

test('canonical JSON sorts object keys and hashes deterministic bytes', () => {
  assert.equal(canonicalJson({ z: [{ b: 2, a: 1 }], a: 'line\n' }), '{"a":"line\\n","z":[{"a":1,"b":2}]}');
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const first = syntheticBundle();
  const second = { ...first, repository: { defaultBranch: 'main', fullName: 'synthetic/example', id: '101' } };
  assert.equal(sealBundle(first).digest, sealBundle(second).digest);
  const sealed = sealBundle(first);
  assert.equal(sealBundle({ ...sealed, toolVersion: '0.0.1' }).digest,
    sealBundle({ ...first, toolVersion: '0.0.1' }).digest);
});

test('canonical JSON rejects unsafe and non-JSON inputs without evaluating getters', () => {
  const cycle: unknown[] = []; cycle.push(cycle);
  let accessed = false;
  const getter = { get secret() { accessed = true; return 'private'; } };
  for (const input of [undefined, NaN, Infinity, 1n, () => 1, new Date(), cycle,
    [undefined], new Array(1), { key: undefined }, getter, { [Symbol('key')]: 1 }]) {
    assert.throws(() => canonicalJson(input));
  }
  assert.equal(accessed, false);
});

test('bundle validates and rejects corruption, identity conflicts and unknown fields', () => {
  const bundle = sealBundle(syntheticBundle());
  assert.deepEqual(validateBundle(JSON.parse(canonicalJson(bundle))), bundle);
  assert.throws(() => validateBundle({ ...bundle, digest: '0'.repeat(64) }), /digest/i);
  assert.throws(() => sealBundle({ ...syntheticBundle(), workflow: { ...bundle.workflow, definitionSha256: '0'.repeat(64) } }), /definition/i);
  for (const mutate of [
    (v: UnsealedBundle) => { Object.assign(v, { schemaVersion: 2 }); },
    (v: UnsealedBundle) => { v.runs[0].repositoryId = 'other'; },
    (v: UnsealedBundle) => { v.runs[0].workflowId = 'other'; },
    (v: UnsealedBundle) => { Object.assign(v, { authorization: 'synthetic-secret' }); },
    (v: UnsealedBundle) => { Object.assign(v.runs[0], { logs: 'synthetic-secret' }); },
    (v: UnsealedBundle) => { Reflect.deleteProperty(v.workflow, 'definitionRef'); },
    (v: UnsealedBundle) => { v.workflow.definitionRef = 'main'; },
    (v: UnsealedBundle) => { v.repository.fullName = '../../synthetic'; },
    (v: UnsealedBundle) => { v.workflow.path = '.github/workflows/../outside.yml'; },
  ]) {
    const value = syntheticBundle(); mutate(value);
    assert.throws(() => sealBundle(value));
  }
});

test('timestamp and resource limits are enforced, partial coverage and later observations are valid', () => {
  const partial = syntheticBundle(); partial.collection.coverage = [];
  partial.runs[0]!.startedAtMs = partial.observedUntilMs + 100;
  assert.doesNotThrow(() => sealBundle(partial));
  partial.runs[0]!.startedAtMs = partial.runs[0]!.createdAtMs - 1;
  assert.doesNotThrow(() => sealBundle(partial));
  for (const mutate of [
    (v: UnsealedBundle) => { v.interval.fromMs = 0.5; },
    (v: UnsealedBundle) => { v.interval.fromMs = -8_640_000_000_000_001; },
    (v: UnsealedBundle) => { v.interval.toMs = v.interval.fromMs; },
    (v: UnsealedBundle) => { v.collection.finishedAtMs = v.collection.startedAtMs - 1; },
    (v: UnsealedBundle) => { v.collection.coverage[0].throughMs = v.observedUntilMs + 1; },
    (v: UnsealedBundle) => { v.runs[0].createdAtMs = v.observedUntilMs + 1; },
    (v: UnsealedBundle) => { v.runs[0].observedAtMs = v.runs[0].createdAtMs - 1; },
    (v: UnsealedBundle) => { v.runs[0].attempt = 0; },
    (v: UnsealedBundle) => { v.runs[0].startedAtMs = Infinity; },
    (v: UnsealedBundle) => { v.workflow.definitionText = 'x'.repeat(1_048_577); },
  ]) {
    const value = syntheticBundle(); mutate(value);
    assert.throws(() => sealBundle(value));
  }
});

test('policy requires bounded explicit assertions and allows unknown false flags', () => {
  const value = syntheticPolicy(); value.assertions.historyAvailable = false;
  assert.deepEqual(validatePolicy(value), value);
  for (const mutate of [
    (v: AuditPolicy) => { Reflect.deleteProperty(v.assertions, 'historyAvailable'); },
    (v: AuditPolicy) => { Object.assign(v.assertions, { definitionStable: 'yes' }); },
    (v: AuditPolicy) => { v.assertions.throughMs = v.assertions.fromMs - 1; },
    (v: AuditPolicy) => { v.assertions.note = 'x'.repeat(4097); },
    (v: AuditPolicy) => { Object.assign(v.assertions, { token: 'synthetic-secret' }); },
    (v: AuditPolicy) => { Object.assign(v, { schemaVersion: 2 }); },
  ]) {
    const input = syntheticPolicy(); mutate(input);
    assert.throws(() => validatePolicy(input));
  }
});

test('files roundtrip with private permissions and exclusive writes; symlinks and oversize reads fail', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'crontrace-evidence-'));
  try {
    const path = join(directory, 'bundle.json');
    const bundle = sealBundle(syntheticBundle());
    await writeBundle(path, bundle);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.deepEqual(await readBundle(path), bundle);
    const before = await readFile(path, 'utf8');
    await assert.rejects(writeBundle(path, bundle));
    assert.equal(await readFile(path, 'utf8'), before);
    const link = join(directory, 'link.json'); await symlink(path, link);
    await assert.rejects(readBundle(link));
    await assert.rejects(writeBundle(link, bundle));
    const parentLink = join(directory, 'linked'); await symlink(directory, parentLink);
    await assert.rejects(readBundle(join(parentLink, 'bundle.json')));
    await assert.rejects(writeBundle(join(parentLink, 'other.json'), bundle));
    const policyPath = join(directory, 'policy.json');
    await writeFile(policyPath, canonicalJson(syntheticPolicy()));
    assert.deepEqual(await readPolicy(policyPath), syntheticPolicy());
    await writeFile(policyPath, '{"synthetic-secret": invalid}');
    await assert.rejects(readPolicy(policyPath), error => error instanceof Error && !error.message.includes('synthetic-secret'));
    await writeFile(policyPath, Buffer.from([0xff, 0xfe]));
    await assert.rejects(readPolicy(policyPath));
    await writeFile(policyPath, ' '.repeat(10 * 1024 * 1024 + 1));
    await assert.rejects(readBundle(policyPath), /limit|large/i);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
