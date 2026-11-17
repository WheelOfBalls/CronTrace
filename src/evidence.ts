import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { RunObservation } from './domain.ts';
import type { AuditPolicy, EvidenceBundle, UnsealedBundle } from './evidence-types.ts';

const maxBytes = 10 * 1024 * 1024;
const maxDefinitionBytes = 1024 * 1024;
const maxSpanMs = 90 * 86_400_000;
const dateLimit = 8_640_000_000_000_000;

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Canonical JSON: recursively sorted object keys; array order is significant. */
export function canonicalJson(value: unknown): string {
  const active = new Set<object>();
  const chunks: string[] = [];
  let bytes = 0;
  function emit(text: string): void {
    bytes += Buffer.byteLength(text, 'utf8');
    requireValue(bytes <= maxBytes, 'JSON exceeds the 10 MiB size limit');
    chunks.push(text);
  }
  function visit(input: unknown, depth: number): void {
    requireValue(depth <= 64, 'JSON nesting limit exceeded');
    if (input === null) return emit('null');
    if (typeof input === 'string' || typeof input === 'boolean') return emit(JSON.stringify(input));
    if (typeof input === 'number') {
      requireValue(Number.isFinite(input), 'JSON numbers must be finite');
      return emit(JSON.stringify(input));
    }
    requireValue(typeof input === 'object', 'Value is not JSON data');
    requireValue(!active.has(input), 'JSON cycles are not supported');
    requireValue(Array.isArray(input) || Object.getPrototypeOf(input) === Object.prototype
      || Object.getPrototypeOf(input) === null, 'JSON requires plain objects');
    active.add(input);
    const keys = Reflect.ownKeys(input);
    requireValue(keys.every(key => typeof key === 'string'), 'JSON symbol keys are not supported');
    const descriptors = Object.getOwnPropertyDescriptors(input);
    requireValue(Object.values(descriptors).every(descriptor => 'value' in descriptor), 'JSON accessors are not supported');
    if (Array.isArray(input)) {
      requireValue(input.length <= 100_000 && keys.length === input.length + 1
        && keys.every(key => key === 'length' || /^(0|[1-9][0-9]*)$/.test(String(key))), 'JSON requires dense arrays without extra fields');
      emit('[');
      input.forEach((item, index) => { if (index) emit(','); visit(item, depth + 1); });
      emit(']');
    } else {
      requireValue(Object.values(descriptors).every(descriptor => descriptor.enumerable), 'JSON hidden fields are not supported');
      const names = (keys as string[]).sort();
      emit('{');
      names.forEach((key, index) => {
        if (index) emit(',');
        emit(JSON.stringify(key)); emit(':'); visit(descriptors[key]!.value, depth + 1);
      });
      emit('}');
    }
    active.delete(input);
  }
  visit(value, 0);
  return chunks.join('');
}

export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

type RecordValue = Record<string, unknown>;
function record(value: unknown, keys: readonly string[]): RecordValue {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), 'Expected a JSON object');
  const object = value as RecordValue;
  requireValue(Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object, key)), 'Unexpected or missing schema fields');
  return object;
}
function string(value: unknown, max = 1024, allowEmpty = false): string {
  requireValue(typeof value === 'string' && value.length <= max && (allowEmpty || value.trim().length > 0), 'Invalid string field');
  return value;
}
function integer(value: unknown, min: number, max: number): number {
  requireValue(typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max, 'Invalid integer field or resource limit');
  return value;
}
function timestamp(value: unknown): number { return integer(value, -dateLimit, dateLimit); }
function digest(value: unknown): string {
  const result = string(value, 64);
  requireValue(/^[0-9a-f]{64}$/.test(result), 'Invalid SHA-256 digest');
  return result;
}
function array(value: unknown, max: number): unknown[] {
  requireValue(Array.isArray(value) && value.length <= max, 'Invalid array or resource limit');
  return value;
}
function boolean(value: unknown): boolean {
  requireValue(typeof value === 'boolean', 'Explicit boolean assertion is required');
  return value;
}
function closedInterval(value: unknown): { fromMs: number; throughMs: number } {
  const input = record(value, ['fromMs', 'throughMs']);
  const fromMs = timestamp(input.fromMs), throughMs = timestamp(input.throughMs);
  requireValue(fromMs <= throughMs, 'Invalid closed interval');
  return { fromMs, throughMs };
}

function validateCore(value: unknown): UnsealedBundle {
  const input = record(value, ['schemaVersion', 'toolVersion', 'repository', 'workflow', 'interval',
    'observedUntilMs', 'maxLatenessMs', 'collection', 'runs']);
  requireValue(input.schemaVersion === 1, 'Unsupported evidence schema version');
  const repo = record(input.repository, ['id', 'fullName', 'defaultBranch']);
  const repository = { id: string(repo.id), fullName: string(repo.fullName), defaultBranch: string(repo.defaultBranch) };
  requireValue(/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repository.fullName)
    && !['.', '..'].includes(repository.fullName.split('/')[1]!), 'Invalid repository full name');
  const workflowInput = record(input.workflow, ['id', 'path', 'state', 'definitionRef', 'definitionText', 'definitionSha256']);
  const workflow = { id: string(workflowInput.id), path: string(workflowInput.path), state: string(workflowInput.state),
    definitionRef: string(workflowInput.definitionRef), definitionText: string(workflowInput.definitionText, maxDefinitionBytes, true),
    definitionSha256: digest(workflowInput.definitionSha256) };
  requireValue(/^[0-9a-fA-F]{40}$/.test(workflow.definitionRef), 'Definition ref must be an immutable commit SHA');
  requireValue(workflow.path.startsWith('.github/workflows/') && !workflow.path.includes('\\')
    && workflow.path.split('/').every(part => part !== '' && part !== '.' && part !== '..'), 'Invalid workflow path');
  requireValue(Buffer.byteLength(workflow.definitionText, 'utf8') <= maxDefinitionBytes, 'Workflow definition exceeds 1 MiB limit');
  requireValue(sha256(workflow.definitionText) === workflow.definitionSha256, 'Workflow definition digest mismatch');
  const intervalInput = record(input.interval, ['fromMs', 'toMs']);
  const interval = { fromMs: timestamp(intervalInput.fromMs), toMs: timestamp(intervalInput.toMs) };
  const observedUntilMs = timestamp(input.observedUntilMs);
  requireValue(interval.fromMs < interval.toMs && interval.toMs <= observedUntilMs, 'Invalid target interval or observation cutoff');
  requireValue(interval.toMs - interval.fromMs <= maxSpanMs, 'Audit span limit is 90 days');
  const maxLatenessMs = integer(input.maxLatenessMs, 1, maxSpanMs);
  const collected = record(input.collection, ['startedAtMs', 'finishedAtMs', 'apiVersion', 'coverage', 'diagnostics', 'requests']);
  const collection = { startedAtMs: timestamp(collected.startedAtMs), finishedAtMs: timestamp(collected.finishedAtMs),
    apiVersion: string(collected.apiVersion), coverage: array(collected.coverage, 10_000).map(closedInterval),
    diagnostics: array(collected.diagnostics, 10_000).map(value => string(value)), requests: integer(collected.requests, 0, 10_000) };
  requireValue(collection.startedAtMs <= collection.finishedAtMs && observedUntilMs <= collection.finishedAtMs, 'Invalid collection timestamps');
  requireValue(collection.coverage.every(range => range.throughMs <= observedUntilMs), 'API coverage exceeds observation cutoff');
  const runs: RunObservation[] = array(input.runs, 50_000).map(value => {
    const run = record(value, ['repositoryId', 'workflowId', 'runId', 'event', 'createdAtMs', 'definitionId',
      'attempt', 'startedAtMs', 'conclusion', 'observedAtMs']);
    const projected: RunObservation = {
      repositoryId: string(run.repositoryId), workflowId: string(run.workflowId), runId: string(run.runId),
      event: string(run.event), createdAtMs: timestamp(run.createdAtMs),
      definitionId: run.definitionId === null ? null : string(run.definitionId), attempt: integer(run.attempt, 1, Number.MAX_SAFE_INTEGER),
      startedAtMs: run.startedAtMs === null ? null : timestamp(run.startedAtMs),
      conclusion: run.conclusion === null ? null : string(run.conclusion), observedAtMs: timestamp(run.observedAtMs),
    };
    requireValue(projected.repositoryId === repository.id && projected.workflowId === workflow.id, 'Conflicting run identity');
    requireValue(projected.createdAtMs <= observedUntilMs && projected.observedAtMs >= projected.createdAtMs
      && projected.observedAtMs >= collection.startedAtMs && projected.observedAtMs <= collection.finishedAtMs, 'Invalid run observation timestamps');
    // Preserve inconsistent start observations for normalization diagnostics.
    return projected;
  });
  return { schemaVersion: 1, toolVersion: string(input.toolVersion), repository, workflow, interval,
    observedUntilMs, maxLatenessMs, collection, runs };
}

/** Digests detect accidental changes; they do not authenticate a bundle's author. */
export function sealBundle(input: UnsealedBundle): EvidenceBundle {
  canonicalJson(input); // Reject non-JSON objects before reading any fields.
  // Resealing an edited bundle explicitly replaces its previous integrity digest.
  // Every other unknown field remains an error.
  const { digest: _previousDigest, ...unsealed } = input as UnsealedBundle & { digest?: unknown };
  const core = validateCore(unsealed);
  const result = { ...core, digest: sha256(canonicalJson(core)) };
  canonicalJson(result);
  return result;
}

export function validateBundle(value: unknown): EvidenceBundle {
  canonicalJson(value);
  const input = record(value, ['schemaVersion', 'toolVersion', 'repository', 'workflow', 'interval',
    'observedUntilMs', 'maxLatenessMs', 'collection', 'runs', 'digest']);
  const { digest: inputDigest, ...rawCore } = input;
  const core = validateCore(rawCore);
  requireValue(digest(inputDigest) === sha256(canonicalJson(core)), 'Evidence bundle digest mismatch');
  return { ...core, digest: inputDigest as string };
}

export function validatePolicy(value: unknown): AuditPolicy {
  canonicalJson(value);
  const input = record(value, ['schemaVersion', 'definitionSha256', 'assertions']);
  requireValue(input.schemaVersion === 1, 'Unsupported policy schema version');
  const assertions = record(input.assertions, ['fromMs', 'throughMs', 'historyAvailable', 'definitionStable', 'workflowEligible', 'note']);
  const fromMs = timestamp(assertions.fromMs), throughMs = timestamp(assertions.throughMs);
  requireValue(fromMs <= throughMs, 'Invalid policy assertion interval');
  return { schemaVersion: 1, definitionSha256: digest(input.definitionSha256), assertions: {
    fromMs, throughMs, historyAvailable: boolean(assertions.historyAvailable), definitionStable: boolean(assertions.definitionStable),
    workflowEligible: boolean(assertions.workflowEligible), note: string(assertions.note, 4096, true),
  } };
}

async function safePath(path: string, writing: boolean): Promise<string> {
  requireValue(typeof path === 'string' && path.length > 0 && !path.includes('\0'), 'Invalid evidence file path');
  const absolute = resolve(path);
  let current = writing ? dirname(absolute) : absolute;
  while (true) {
    const status = await lstat(current);
    requireValue(!status.isSymbolicLink(), 'Evidence paths must not contain symlinks');
    if (current !== absolute || writing) requireValue(status.isDirectory(), 'Evidence parent must be a directory');
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return absolute;
}

async function readJson(path: string): Promise<unknown> {
  let handle;
  try {
    const absolute = await safePath(path, false);
    handle = await open(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info = await handle.stat();
    requireValue(info.isFile(), 'Evidence input must be a regular file');
    requireValue(info.size <= maxBytes, 'Evidence input exceeds 10 MiB size limit');
    const data = Buffer.alloc(maxBytes + 1);
    let length = 0;
    while (length < data.length) {
      const result = await handle.read(data, length, data.length - length, null);
      if (result.bytesRead === 0) break;
      length += result.bytesRead;
    }
    requireValue(length <= maxBytes, 'Evidence input exceeds 10 MiB size limit');
    const source = new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(0, length));
    return JSON.parse(source) as unknown;
  } catch (error) {
    if (error instanceof Error && error.message === 'Evidence input exceeds 10 MiB size limit') throw error;
    // Omit the original cause: parser errors may contain private evidence or credentials.
    // eslint-disable-next-line preserve-caught-error
    throw new Error('Unable to read evidence JSON: require a regular, valid UTF-8 JSON file without symlink paths');
  } finally { await handle?.close(); }
}

export async function readBundle(path: string): Promise<EvidenceBundle> { return validateBundle(await readJson(path)); }
export async function readPolicy(path: string): Promise<AuditPolicy> { return validatePolicy(await readJson(path)); }

export async function writeBundle(path: string, bundle: EvidenceBundle): Promise<void> {
  const content = canonicalJson(validateBundle(bundle)) + '\n';
  await writeArtifact(path, content);
}

/** Exclusive, owner-readable output for evidence, policies and reports. */
export async function writeArtifact(path: string, content: string): Promise<void> {
  requireValue(Buffer.byteLength(content, 'utf8') <= maxBytes, 'Evidence output exceeds 10 MiB size limit');
  let handle;
  let createdPath: string | undefined;
  try {
    const absolute = await safePath(path, true);
    handle = await open(absolute, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    createdPath = absolute;
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } catch {
    if (createdPath) await unlink(createdPath).catch(() => undefined);
    throw new Error('Unable to create evidence file: require a new file in an existing directory without symlink paths');
  } finally { await handle?.close(); }
}
