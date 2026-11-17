import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

let dir, binary;
const root = resolve(import.meta.dirname, '../..');
const evidence = join(root, 'examples/synthetic-evidence.json');
const policy = join(root, 'examples/synthetic-policy.json');
const env = { ...process.env, GH_TOKEN: '', GITHUB_TOKEN: '' };
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'crontrace-installed-'));
  const packed = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', dir], { cwd: root, encoding: 'utf8' }))[0];
  assert.ok(packed.files.some(f => f.path === 'dist/bin.js'));
  assert.ok(!packed.files.some(f => /^(test|src|node_modules|evidence)\//.test(f.path) || f.path.includes('.env')));
  execFileSync('npm', ['install', '--global', '--prefix', join(dir, 'install'), '--ignore-scripts', '--no-audit', '--no-fund', join(dir, packed.filename)],
    { encoding: 'utf8', timeout: 120_000, env });
  binary = join(dir, 'install/bin/crontrace');
  const block = join(dir, 'offline.mjs');
  await writeFile(block, "globalThis.fetch = () => { throw new Error('Offline audit attempted a network call'); };\n");
  env.NODE_OPTIONS = '--import=' + pathToFileURL(block).href;
});
after(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });
const run = (args, patch = {}) => spawnSync(binary, args, { encoding: 'utf8', timeout: 15_000, env: { ...env, ...patch } });

test('packed npm installation has a working executable, help and version', () => {
  const help = run(['--help']);
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /collect.*audit/s);
  const version = run(['--version']);
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), '0.1.0');
});
test('installed offline text matches the committed example; JSON replay ignores host timezone', async () => {
  const args = ['audit', evidence, '--policy', policy, '--late-after', '10m'];
  const text = run(args);
  assert.equal(text.status, 0, text.stderr);
  assert.equal(text.stdout, await readFile(join(root, 'examples/synthetic-report.txt'), 'utf8'));
  const a = run([...args, '--format', 'json'], { TZ: 'America/New_York' });
  const b = run([...args, '--format', 'json'], { TZ: 'Asia/Tokyo' });
  assert.equal(a.status, 0, a.stderr);
  assert.equal(b.status, 0, b.stderr);
  assert.equal(a.stdout, b.stdout);
  assert.deepEqual(JSON.parse(a.stdout).analysis.opportunities.map(o => o.classification), ['matched_on_time', 'matched_late', 'no_observed_run']);
});
test('installed exit codes distinguish findings, invalid evidence, and incomplete evidence', async () => {
  assert.equal(run(['audit', evidence, '--policy', policy, '--fail-on', 'gap']).status, 1);
  assert.equal(run(['audit', evidence]).status, 3);
  const corrupt = join(dir, 'corrupt.json');
  await writeFile(corrupt, '{"private-value": invalid}');
  const failed = run(['audit', corrupt]);
  assert.equal(failed.status, 2);
  assert.ok(!failed.stderr.includes('private-value'));
});
test('installed policy and report output commands are exclusive and usable', async () => {
  const path = join(dir, 'policy.json');
  assert.equal(run(['policy', evidence, '--out', path]).status, 0);
  assert.equal(run(['audit', evidence, '--policy', path]).status, 3);
  const output = join(dir, 'report.json');
  assert.equal(run(['audit', evidence, '--policy', policy, '--format', 'json', '--out', output]).status, 0);
  assert.equal(JSON.parse(await readFile(output, 'utf8')).schemaVersion, 1);
  const overwrite = run(['audit', evidence, '--out', output]);
  assert.equal(overwrite.status, 2);
});
