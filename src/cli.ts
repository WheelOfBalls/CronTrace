import { parseArgs } from 'node:util';
import { auditEvidence } from './audit.ts';
import { canonicalJson, readBundle, readPolicy, writeArtifact, writeBundle } from './evidence.ts';
import { collectEvidence } from './github.ts';
import { exitCodeForReport, formatReport } from './report.ts';
import type { FailureThreshold } from './report.ts';
import { VERSION } from './version.ts';

const HELP = `CronTrace ${VERSION} — evidence-first GitHub Actions schedule audits

Usage:
  crontrace collect OWNER/REPO --workflow ID_OR_FILENAME --from ISO --to ISO --out FILE
                    [--max-lateness 24h] [--request-budget 200]
  crontrace audit BUNDLE [--policy FILE] [--format text|json] [--out FILE]
                  [--late-after 30m] [--max-lateness DURATION]
                  [--fail-on none|late|gap|uncertain]
  crontrace policy BUNDLE --out FILE
  crontrace --help
  crontrace --version

collect: GitHub.com GET-only; optional GH_TOKEN or GITHUB_TOKEN environment variable.
Dates require an explicit UTC/offset timezone; interval is [from, to), at most 90 days.
Durations use integer ms, s, m, h or d. Attribution horizon is an assumption, not a SLA.
policy: creates a template with ALL historical assertions false. Review before editing.
audit: offline; missing assertions produce unknowns. Text is default; JSON is canonical.
Outputs require new files in existing directories; existing files are never overwritten.
Exit: 0 completed, 1 selected findings, 2 invalid input/operation failed, 3 incomplete evidence.
No result proves a scheduled event was dropped. See README and docs/METHODOLOGY.md.
`;
interface CliIO { out: (text: string) => void; err: (text: string) => void; env: NodeJS.ProcessEnv }
interface CliDependencies { collect?: typeof collectEvidence }
const controls = (text: string) => text.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,
  c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
function duration(value: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(value);
  if (!match) throw new Error('Duration must be an integer followed by ms, s, m, h or d');
  const ms = Number(match[1]) * ({ ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]]!);
  if (!Number.isSafeInteger(ms) || ms > 90 * 86_400_000) throw new Error('Duration exceeds the 90 day limit');
  return ms;
}
function instant(value: string): number {
  const m = /^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d):(\d\d)(\.\d{1,3})?(Z|[+-]\d\d:\d\d)$/.exec(value);
  if (!m || Number(m[2]) > 23 || Number(m[3]) > 59 || Number(m[4]) > 59
    || (m[6] !== 'Z' && (Number(m[6].slice(1, 3)) > 23 || Number(m[6].slice(4)) > 59))) {
    throw new Error('Date requires a valid ISO timestamp with an explicit timezone');
  }
  const calendar = new Date(`${m[1]}T00:00:00Z`);
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || !Number.isFinite(calendar.valueOf()) || calendar.toISOString().slice(0, 10) !== m[1]) {
    throw new Error('Invalid calendar date');
  }
  return ms;
}

export async function runCli(args: string[], io: CliIO = {
  out: text => { process.stdout.write(text); }, err: text => { process.stderr.write(text); }, env: process.env,
}, deps: CliDependencies = {}): Promise<number> {
  try {
    if (args.length === 0 || (args.length === 1 && ['--help', '-h'].includes(args[0]))) { io.out(HELP); return 0; }
    if (args.length === 1 && args[0] === '--version') { io.out(VERSION + '\n'); return 0; }
    const [command, ...rest] = args;
    const allowed = command === 'collect' ? ['workflow', 'from', 'to', 'out', 'max-lateness', 'request-budget']
      : command === 'audit' ? ['policy', 'format', 'out', 'late-after', 'max-lateness', 'fail-on']
        : command === 'policy' ? ['out'] : null;
    if (!allowed) throw new Error('Unknown command; use crontrace --help');
    let parsed;
    try {
      parsed = parseArgs({ args: rest, allowPositionals: true, strict: true,
        options: { ...Object.fromEntries(allowed.map(key => [key, { type: 'string' as const }])), help: { type: 'boolean', short: 'h' } }, tokens: true });
    } catch { throw new Error('Invalid or unknown option; use crontrace --help'); }
    const seen = new Set<string>();
    for (const t of parsed.tokens) if (t.kind === 'option') {
      if (seen.has(t.name)) throw new Error('Repeated options are not allowed');
      seen.add(t.name);
    }
    const v: Record<string, string | boolean | undefined> = parsed.values;
    if (v.help) { io.out(HELP); return 0; }
    if (parsed.positionals.length !== 1) throw new Error('Expected exactly one repository or evidence bundle argument');
    const input = parsed.positionals[0];
    const value = (name: string): string | undefined => typeof v[name] === 'string' ? v[name] as string : undefined;
    const required = (name: string): string => {
      const result = value(name);
      if (!result) throw new Error(`Missing required --${name}`);
      return result;
    };
    if (command === 'collect') {
      const workflow = required('workflow'), fromMs = instant(required('from')), toMs = instant(required('to'));
      const path = required('out');
      const budget = value('request-budget');
      if (budget && !/^\d+$/.test(budget)) throw new Error('Request budget must be an integer from 1 to 200');
      const bundle = await (deps.collect ?? collectEvidence)({ repository: input, workflow, fromMs, toMs,
        maxLatenessMs: value('max-lateness') ? duration(value('max-lateness')!) : undefined,
        requestBudget: budget ? Number(budget) : undefined, token: io.env.GH_TOKEN || io.env.GITHUB_TOKEN || undefined });
      await writeBundle(path, bundle);
      io.out(`Saved evidence ${bundle.digest}; ${bundle.runs.length} run observations, ${bundle.collection.requests} GET requests.\n`);
      // Partial collection is useful evidence, but is not a successful complete traversal.
      const coverage = [...bundle.collection.coverage].sort((a, b) => a.fromMs - b.fromMs);
      let end = Math.max(0, fromMs - bundle.maxLatenessMs) - 1;
      for (const range of coverage) {
        if (range.fromMs > end + 1) break;
        end = Math.max(end, range.throughMs);
      }
      const partial = end < Math.min(bundle.observedUntilMs, toMs + bundle.maxLatenessMs);
      io.out(partial ? 'Collection incomplete; saved partial evidence. Audit will report uncertainty.\n'
        : 'API traversal completed; historical retention and eligibility remain unverified.\n');
      return partial ? 3 : 0;
    }
    if (command === 'policy') {
      const path = required('out');
      const bundle = await readBundle(input);
      await writeArtifact(path, JSON.stringify({ schemaVersion: 1, definitionSha256: bundle.workflow.definitionSha256,
        assertions: { fromMs: bundle.interval.fromMs - 3 * bundle.maxLatenessMs,
          throughMs: Math.min(bundle.observedUntilMs, bundle.interval.toMs + 2 * bundle.maxLatenessMs),
          historyAvailable: false, definitionStable: false, workflowEligible: false,
          note: 'REVIEW REQUIRED: document the basis for each assertion and its time interval. Leave unsupported assertions false.' } }, null, 2) + '\n');
      io.out('Created policy template with all assertions false. Review the historical evidence before editing.\n');
      return 0;
    }
    const format = value('format') ?? 'text';
    const threshold = value('fail-on') ?? 'none';
    if (!['text', 'json'].includes(format) || !['none', 'late', 'gap', 'uncertain'].includes(threshold)) throw new Error('Invalid report format or failure threshold');
    const lateAfterMs = value('late-after') ? duration(value('late-after')!) : undefined;
    const maxLatenessMs = value('max-lateness') ? duration(value('max-lateness')!) : undefined;
    const bundle = await readBundle(input);
    const policy = value('policy') ? await readPolicy(value('policy')!) : null;
    const report = auditEvidence(bundle, policy, { lateAfterMs, maxLatenessMs });
    const content = format === 'json' ? canonicalJson(report) + '\n' : formatReport(report);
    if (value('out')) await writeArtifact(value('out')!, content); else io.out(content);
    return exitCodeForReport(report, threshold as FailureThreshold);
  } catch (error) {
    let message = error instanceof Error ? error.message : 'Operation failed';
    for (const token of [io.env.GH_TOKEN, io.env.GITHUB_TOKEN]) if (token) message = message.split(token).join('[REDACTED]');
    io.err(`crontrace: ${controls(message)}\n`);
    return 2;
  }
}

