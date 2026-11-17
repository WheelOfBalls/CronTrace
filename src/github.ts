import { sealBundle, sha256 } from './evidence.ts';
import type { EvidenceBundle } from './evidence-types.ts';
import type { Interval, RunObservation } from './domain.ts';

export interface CollectOptions {
  repository: string;
  workflow: string;
  fromMs: number;
  toMs: number;
  maxLatenessMs?: number;
  requestBudget?: number;
  token?: string;
}
export interface CollectDependencies {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

// Verified against https://docs.github.com/en/rest/about-the-rest-api/api-versions.
const API_VERSION = '2026-03-10';
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_FILE_BYTES = 1024 * 1024;
class CollectionError extends Error {
  constructor(code: string) { super(code); this.name = 'CollectionError'; }
}
function fail(code = 'invalid_payload'): never { throw new CollectionError(code); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === 'string' && /^[1-9]\d{0,19}$/.test(value)) return value;
  return fail();
}
function safeText(value: unknown, max = 256): string {
  if (typeof value !== 'string' || !value || value.length > max || /[\x00-\x1f\x7f]/.test(value)) return fail();
  return value;
}
function timestamp(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)) return fail();
  const result = Date.parse(value);
  if (!Number.isSafeInteger(result) || result < 0) return fail();
  return result;
}
function workflowPath(value: unknown): string {
  const path = safeText(value);
  if (!/^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/.test(path)) return fail('invalid_workflow_path');
  return path;
}
function safeCode(error: unknown): string {
  return error instanceof CollectionError ? error.message : 'request_failed';
}
async function bodyJson(response: Response, token: string | undefined): Promise<unknown> {
  if (Number(response.headers.get('content-length')) > MAX_BODY_BYTES) return fail('response_too_large');
  if (!response.body) return fail();
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) return fail('response_too_large');
      chunks.push(value);
    }
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
  const text = Buffer.concat(chunks).toString('utf8');
  if (token && text.includes(token)) return fail('credential_in_response');
  let parsed: unknown;
  try { parsed = JSON.parse(text) as unknown; } catch { return fail(); }
  // Parse/re-encode to catch credentials hidden behind JSON Unicode escapes too.
  if (token && JSON.stringify(parsed).includes(token)) return fail('credential_in_response');
  return parsed;
}

/** Collects API traversal evidence only; neither retention nor historical definition is established. */
export async function collectEvidence(options: CollectOptions, deps: CollectDependencies = {}): Promise<EvidenceBundle> {
  const now = deps.now ?? Date.now;
  const fetcher = deps.fetch ?? globalThis.fetch;
  const sleep = deps.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const startedAtMs = now();
  const observedUntilMs = startedAtMs;
  const maxLatenessMs = options.maxLatenessMs ?? 86_400_000;
  const requestBudget = options.requestBudget ?? 200;
  const validMs = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= 8_640_000_000_000_000;
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(options.repository)
    || options.repository.split('/')[1] === '.' || options.repository.split('/')[1] === '..'
    || !validMs(options.fromMs) || !validMs(options.toMs) || options.fromMs >= options.toMs
    || options.toMs - options.fromMs > 90 * 86_400_000 || !validMs(maxLatenessMs) || maxLatenessMs > 90 * 86_400_000
    || maxLatenessMs < 1 || options.toMs > startedAtMs || !validMs(startedAtMs) || !Number.isSafeInteger(requestBudget) || requestBudget < 1 || requestBudget > 200
    || (options.token !== undefined && (typeof options.token !== 'string' || !options.token || /[^\x21-\x7e]/.test(options.token)))) fail('invalid_collection_options');
  let selector = options.workflow;
  if (/^\.github\/workflows\//.test(selector)) selector = workflowPath(selector).split('/').at(-1)!;
  if (!/^(?:[1-9]\d{0,19}|[A-Za-z0-9_.-]+\.ya?ml)$/.test(selector)) fail('invalid_workflow_selector');
  const base = `/repos/${options.repository.split('/').map(encodeURIComponent).join('/')}`;
  const allowed = new Set<string>([base, `${base}/actions/workflows/${encodeURIComponent(selector)}`]);
  let requests = 0;
  let sleptMs = 0;
  let stoppedForRateLimit = false;
  // A monotonic deadline bounds collection even if injected observation clocks stay frozen.
  const deadline = performance.now() + 60_000;
  async function request(path: string, params: Record<string, string> = {}): Promise<{ value: unknown; headers: Headers; observedAtMs: number }> {
    if (!allowed.has(path)) return fail('disallowed_endpoint');
    const url = new URL(path, 'https://api.github.com');
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    for (let attempt = 0; attempt < 3; attempt++) {
      if (stoppedForRateLimit) return fail('rate_limited');
      if (requests >= requestBudget) return fail('request_budget_exhausted');
      const remaining = deadline - performance.now();
      if (remaining <= 0) return fail('time_budget_exhausted');
      requests++;
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let retryDelay: number | null = null;
      try {
        const pending = (async () => {
          const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': API_VERSION, 'User-Agent': 'crontrace/0.1.0' };
          if (options.token) headers.Authorization = `Bearer ${options.token}`;
          const response = await fetcher(url, { method: 'GET', headers, redirect: 'manual', signal: controller.signal });
          if (response.redirected || (response.url && response.url !== url.href)) return fail('unsafe_redirect');
          if (response.status >= 300 && response.status < 400) return fail('unsafe_redirect');
          if (!response.ok) {
            void response.body?.cancel().catch(() => {});
            const rateLimited = response.status === 429 || (response.status === 403 && (response.headers.has('retry-after') || response.headers.get('x-ratelimit-remaining') === '0'));
            if (rateLimited || response.status >= 500) {
              retryDelay = 250 * 2 ** attempt;
              const retryAfter = response.headers.get('retry-after');
              const reset = response.headers.get('x-ratelimit-reset');
              if (retryAfter !== null) {
                const seconds = /^\d+(?:\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - now();
                retryDelay = Number.isFinite(seconds) ? Math.max(retryDelay, seconds) : Infinity;
              } else if (rateLimited && reset !== null) {
                const resetDelay = Number(reset) * 1000 - now();
                retryDelay = Number.isFinite(resetDelay) ? Math.max(retryDelay, resetDelay) : Infinity;
              } else if (rateLimited) retryDelay = Infinity;
              if (rateLimited && (attempt === 2 || retryDelay > 2000 || sleptMs + retryDelay > 5000)) stoppedForRateLimit = true;
              return fail(rateLimited ? 'rate_limited' : 'server_error');
            }
            return fail(response.status === 401 ? 'authentication_failed' : response.status === 403 ? 'access_denied' : response.status === 404 ? 'not_found_or_denied' : 'http_error');
          }
          const value = await bodyJson(response, options.token);
          return { value, headers: response.headers, observedAtMs: Math.max(startedAtMs, now()) };
        })();
        return await Promise.race([pending, new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new CollectionError('request_timeout')); }, Math.min(10_000, remaining));
        })]);
      } catch (error) {
        const code = safeCode(error);
        if (code === 'request_failed' || code === 'request_timeout') retryDelay = 250 * 2 ** attempt;
        const delay = retryDelay as number | null;
        if (attempt === 2 || delay === null || delay > 2000 || sleptMs + delay > 5000 || performance.now() + delay >= deadline) throw new CollectionError(code);
        sleptMs += delay;
        await sleep(delay);
      } finally { if (timer) clearTimeout(timer); controller.abort(); }
    }
    return fail('request_failed');
  }

  let repository: EvidenceBundle['repository'];
  let workflow: EvidenceBundle['workflow'];
  try {
    const repo = object((await request(base)).value);
    const fullName = safeText(repo.full_name);
    if (fullName.toLowerCase() !== options.repository.toLowerCase()) fail('identity_mismatch');
    const defaultBranch = safeText(repo.default_branch);
    repository = { id: id(repo.id), fullName, defaultBranch };
    const wf = object((await request(`${base}/actions/workflows/${encodeURIComponent(selector)}`)).value);
    const path = workflowPath(wf.path);
    const workflowId = id(wf.id);
    if (/^\d+$/.test(selector) ? workflowId !== selector : path !== `.github/workflows/${selector}`) fail('identity_mismatch');
    const commitPath = `${base}/commits/${encodeURIComponent(defaultBranch)}`;
    allowed.add(commitPath);
    const commit = object((await request(commitPath)).value);
    if (typeof commit.sha !== 'string' || !/^[0-9a-f]{40}$/i.test(commit.sha)) fail('invalid_commit');
    const contentsPath = `${base}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
    allowed.add(contentsPath);
    const content = object((await request(contentsPath, { ref: commit.sha })).value);
    if (content.type !== 'file' || content.path !== path || content.encoding !== 'base64' || typeof content.content !== 'string') fail('invalid_workflow_content');
    const encoded = content.content.replace(/[\r\n]/g, '');
    if (encoded.length > Math.ceil(MAX_FILE_BYTES / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) fail('invalid_workflow_content');
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length > MAX_FILE_BYTES || content.size !== bytes.length || bytes.toString('base64') !== encoded) fail('invalid_workflow_content');
    const definitionText = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (options.token && definitionText.includes(options.token)) fail('credential_in_response');
    workflow = { id: workflowId, path, state: safeText(wf.state), definitionRef: commit.sha, definitionText, definitionSha256: sha256(definitionText) };
  } catch { throw new Error('GitHub identity or workflow definition could not be collected safely.'); }

  const diagnostics = new Set<string>([
    'API coverage means two bounded stable traversals only; historical retention is not verified.',
    'Run definition compatibility uses the pinned current YAML; historical compatibility is not verified.',
  ]);
  const coverage: Interval[] = [];
  const observations = new Map<string, RunObservation>();
  const lower = Math.max(0, options.fromMs - maxLatenessMs);
  const upper = Math.min(observedUntilMs, options.toMs + maxLatenessMs);
  const runsPath = `${base}/actions/workflows/${workflow.id}/runs`;
  allowed.add(runsPath);
  function project(raw: unknown, observedAtMs: number): RunObservation {
    const r = object(raw);
    const repositoryId = id(object(r.repository).id);
    const workflowId = id(r.workflow_id);
    if (repositoryId !== repository.id || workflowId !== workflow.id) return fail('identity_mismatch');
    const attempt = r.run_attempt;
    if (typeof attempt !== 'number' || !Number.isSafeInteger(attempt) || attempt < 1) return fail();
    const createdAtMs = timestamp(r.created_at);
    const startedAtMs = r.run_started_at === null ? null : timestamp(r.run_started_at);
    if (startedAtMs !== null && (startedAtMs < createdAtMs || startedAtMs > observedAtMs)) return fail('invalid_run_timestamp');
    return { repositoryId, workflowId, runId: id(r.id), event: safeText(r.event, 100), createdAtMs,
      definitionId: workflow.definitionSha256, attempt, startedAtMs,
      conclusion: r.conclusion === null ? null : safeText(r.conclusion, 100), observedAtMs };
  }
  function fingerprint(run: RunObservation): string {
    const { observedAtMs: _observed, ...fields } = run;
    return JSON.stringify(fields);
  }
  function retain(run: RunObservation) {
    if (run.event === 'schedule' && run.createdAtMs >= lower && run.createdAtMs <= upper && run.createdAtMs <= run.observedAtMs) observations.set(fingerprint(run), run);
  }
  function validateLinks(link: string | null, current: URL): boolean {
    if (!link) return false;
    if (link.length > 8192) return fail('unsafe_pagination');
    let next = false;
    for (const part of link.split(',')) {
      const match = /^\s*<([^>]+)>;\s*rel="(next|prev|first|last)"\s*$/.exec(part);
      if (!match) return fail('unsafe_pagination');
      let url: URL;
      try { url = new URL(match[1]); } catch { return fail('unsafe_pagination'); }
      if (url.origin !== current.origin || url.username || url.password || url.hash || url.pathname !== current.pathname) return fail('unsafe_pagination');
      for (const key of url.searchParams.keys()) if (!['page', 'per_page', 'event', 'created'].includes(key) || url.searchParams.getAll(key).length !== 1) return fail('unsafe_pagination');
      for (const key of ['per_page', 'event', 'created']) if (url.searchParams.get(key) !== current.searchParams.get(key)) return fail('unsafe_pagination');
      if (!/^[1-9]\d*$/.test(url.searchParams.get('page') ?? '')) return fail('unsafe_pagination');
      if (match[2] === 'next') {
        if (Number(url.searchParams.get('page')) !== Number(current.searchParams.get('page')) + 1) return fail('unsafe_pagination');
        next = true;
      }
    }
    return next;
  }
  async function traverse(lo: number, hi: number): Promise<string[] | null> {
    const signatures: string[] = [];
    const seen = new Set<string>();
    let expected: number | undefined;
    for (let page = 1; page <= 11; page++) {
      const params = { event: 'schedule', per_page: '100', page: String(page), created: `${new Date(lo * 1000).toISOString().replace('.000Z', 'Z')}..${new Date(hi * 1000).toISOString().replace('.000Z', 'Z')}` };
      const response = await request(runsPath, params);
      const value = object(response.value);
      if (typeof value.total_count !== 'number' || !Number.isSafeInteger(value.total_count) || value.total_count < 0 || !Array.isArray(value.workflow_runs) || value.workflow_runs.length > 100) return fail();
      const current = new URL(runsPath, 'https://api.github.com');
      current.search = new URLSearchParams(params).toString();
      const next = validateLinks(response.headers.get('link'), current);
      if (expected !== undefined && expected !== value.total_count) return fail('unstable_partition');
      expected = value.total_count;
      for (const raw of value.workflow_runs) {
        const run = project(raw, response.observedAtMs);
        retain(run);
        if (seen.has(run.runId)) return fail('duplicate_page_or_run');
        seen.add(run.runId);
        signatures.push(fingerprint(run));
      }
      if (value.total_count >= 1000) return null;
      if (value.workflow_runs.length < 100 && !next) {
        if (seen.size !== expected) return fail('inconsistent_count');
        return signatures.sort();
      }
      if (value.workflow_runs.length === 0) return fail('inconsistent_pagination');
    }
    return null;
  }
  async function partition(lo: number, hi: number): Promise<void> {
    try {
      const first = await traverse(lo, hi);
      if (first === null) {
        if (lo === hi) { diagnostics.add('saturated_second: API traversal incomplete.'); return; }
        const mid = Math.floor((lo + hi) / 2);
        await partition(lo, mid);
        await partition(mid + 1, hi);
        return;
      }
      const second = await traverse(lo, hi);
      if (second === null || JSON.stringify(first) !== JSON.stringify(second)) return fail('unstable_partition');
      coverage.push({ fromMs: Math.max(lower, lo * 1000), throughMs: Math.min(upper, hi * 1000 + 999) });
    } catch (error) { diagnostics.add(`${safeCode(error)}: API traversal incomplete.`); }
  }
  if (lower <= upper) await partition(Math.floor(lower / 1000), Math.floor(upper / 1000));
  const latest = new Map<string, RunObservation>();
  for (const r of observations.values()) if (!latest.has(r.runId) || latest.get(r.runId)!.attempt < r.attempt) latest.set(r.runId, r);
  for (const r of latest.values()) {
    if (r.attempt === 1 || [...observations.values()].some(x => x.runId === r.runId && x.attempt === 1)) continue;
    const path = `${base}/actions/runs/${r.runId}/attempts/1`;
    allowed.add(path);
    try {
      const response = await request(path);
      const original = project(response.value, response.observedAtMs);
      if (original.runId !== r.runId || original.attempt !== 1 || original.createdAtMs !== r.createdAtMs || original.event !== r.event) fail('identity_mismatch');
      retain(original);
    } catch (error) { diagnostics.add(`original_start_unavailable (${safeCode(error)}).`); }
  }
  return sealBundle({ schemaVersion: 1, toolVersion: '0.1.0', repository, workflow,
    interval: { fromMs: options.fromMs, toMs: options.toMs }, observedUntilMs, maxLatenessMs,
    collection: { startedAtMs, finishedAtMs: Math.max(startedAtMs, now()), apiVersion: API_VERSION, coverage,
      diagnostics: [...diagnostics].sort(), requests }, runs: [...observations.values()].sort((a, b) => a.createdAtMs - b.createdAtMs || a.runId.localeCompare(b.runId) || a.attempt - b.attempt) });
}
