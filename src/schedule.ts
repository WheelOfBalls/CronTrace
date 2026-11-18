import { createHash } from 'node:crypto';
import { CronExpressionParser } from 'cron-parser';
import { isAlias, isNode, parseDocument, visit } from 'yaml';
import type { Opportunity } from './domain.ts';

export interface ScheduleSpec {
  supported: boolean;
  cron: string | null;
  timezone: string | null;
  reasonCodes: string[];
}

const DAY_MS = 86_400_000;
const MAX_OPPORTUNITIES = 50_000;
const IMPOSSIBLE_DATE = 'Invalid explicit day of month definition';
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const LIMITS = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]] as const;

function unsupported(reason: string, cron: string | null = null, timezone: string | null = null): ScheduleSpec {
  return { supported: false, cron, timezone, reasonCodes: [reason] };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Allow only five POSIX fields: numbers, three-letter month/day names, lists,
 * ascending ranges, wildcard, and positive integer steps. Weekdays are 0–6.
 * This gate excludes cron-parser extensions; the dependency expands/evaluates
 * the accepted fields. Both restricted DOM and DOW retain POSIX OR semantics.
 */
function validateCron(cron: string): string | null {
  if (cron.length > 256 || /[^\x20-\x7e\t]/.test(cron)) return 'unsupported_cron';
  const fields = cron.trim().split(/[ \t]+/);
  if (fields.length !== 5) return 'unsupported_cron';
  for (const [index, field] of fields.entries()) {
    const [minimum, maximum] = LIMITS[index];
    const names = index === 3 ? MONTHS : index === 4 ? WEEKDAYS : [];
    const value = (token: string): number => {
      if (/^\d{1,2}$/.test(token)) return Number(token);
      const namedIndex = names.indexOf(token.toUpperCase());
      return namedIndex < 0 ? NaN : namedIndex + (index === 3 ? 1 : 0);
    };
    const entries = field.split(',');
    for (const entry of entries) {
      const match = /^(\*|[A-Za-z]{3}|\d{1,2})(?:-([A-Za-z]{3}|\d{1,2}))?(?:\/(\d{1,6}))?$/.exec(entry);
      if (!match) return 'unsupported_cron';
      const [, start, end, step] = match;
      if (step !== undefined && Number(step) === 0) return 'unsupported_cron';
      if (start === '*') {
        if (end !== undefined || entries.length !== 1) return 'unsupported_cron';
      } else {
        const lower = value(start);
        const upper = end === undefined ? lower : value(end);
        if (!Number.isInteger(lower) || !Number.isInteger(upper)
          || lower < minimum || upper > maximum || lower > upper) return 'unsupported_cron';
      }
    }
  }
  try {
    // Calendar masks cannot make a sub-five-minute cyclic time-of-day gap safe
    // under this conservative policy. This deliberately over-rejects some masks.
    const daily = CronExpressionParser.parse(`${fields[0]} ${fields[1]} * * *`, { currentDate: 0, tz: 'UTC' });
    const minutes = daily.fields.hour.values.flatMap(hour => daily.fields.minute.values.map(minute => hour * 60 + minute));
    for (let index = 0; index < minutes.length; index++) {
      const next = index + 1 === minutes.length ? minutes[0] + 1440 : minutes[index + 1];
      if (next - minutes[index] < 5) return 'unsupported_frequency';
    }
    try {
      CronExpressionParser.parse(cron, { currentDate: 0, tz: 'UTC' });
    } catch (error) {
      // A well-formed expression can name dates that never occur. This is an
      // empty calendar, not unsupported semantics or evidence of a missing run.
      if (!(error instanceof Error) || error.message !== IMPOSSIBLE_DATE) return 'unsupported_cron';
    }
  } catch {
    return 'unsupported_cron';
  }
  return null;
}

/** Safely extract exactly one supported schedule; never execute workflow YAML. */
export function readSchedule(workflowText: string): ScheduleSpec {
  if (Buffer.byteLength(workflowText, 'utf8') > 1_048_576) return unsupported('workflow_too_large');
  let workflow: unknown;
  try {
    const document = parseDocument(workflowText, {
      version: '1.2', schema: 'core', customTags: [], uniqueKeys: true, strict: true,
    });
    if (document.errors.length || document.warnings.length || document.directives?.yaml.version !== '1.2') {
      return unsupported('invalid_workflow_yaml');
    }
    let nodes = 0;
    visit(document, (_key, node, path) => {
      if (++nodes > 50_000 || path.length > 100 || isAlias(node)
        || (isNode(node) && node.tag !== undefined && ![
          'tag:yaml.org,2002:str', 'tag:yaml.org,2002:int', 'tag:yaml.org,2002:float',
          'tag:yaml.org,2002:bool', 'tag:yaml.org,2002:null', 'tag:yaml.org,2002:map', 'tag:yaml.org,2002:seq',
        ].includes(node.tag))) throw new Error('Unsafe YAML');
    });
    workflow = document.toJS({ maxAliasCount: 0 });
  } catch {
    return unsupported('invalid_workflow_yaml');
  }
  if (!record(workflow) || !record(workflow.on) || !Object.hasOwn(workflow.on, 'schedule')) {
    return unsupported('no_schedule');
  }
  const entries = workflow.on.schedule;
  if (!Array.isArray(entries)) return unsupported('invalid_schedule');
  if (entries.length === 0) return unsupported('no_schedule');
  if (entries.length !== 1) return unsupported('unsupported_multiple_schedules');
  const entry: unknown = entries[0];
  if (!record(entry) || typeof entry.cron !== 'string'
    || Object.keys(entry).some(key => key !== 'cron' && key !== 'timezone')) return unsupported('invalid_schedule');
  const cron = entry.cron.trim();
  if (Object.hasOwn(entry, 'timezone') && entry.timezone !== 'UTC' && entry.timezone !== 'Etc/UTC') {
    return unsupported('unsupported_timezone', cron, typeof entry.timezone === 'string' ? entry.timezone : null);
  }
  const reason = validateCron(cron);
  return reason === null ? { supported: true, cron, timezone: 'UTC', reasonCodes: [] } : unsupported(reason, cron, 'UTC');
}

/**
 * Enumerate the CLOSED interval [fromMs, throughMs] in increasing UTC order.
 * Callers choose half-open target windows separately from this context buffer.
 * Limits fail atomically: no partial occurrence list is returned.
 */
export function enumerateOpportunities(schedule: ScheduleSpec, definitionId: string, fromMs: number, throughMs: number): Opportunity[] {
  if (!schedule.supported || typeof schedule.cron !== 'string'
    || (schedule.timezone !== 'UTC' && schedule.timezone !== 'Etc/UTC') || validateCron(schedule.cron) !== null) {
    throw new Error('Cannot enumerate an unsupported schedule');
  }
  if (typeof definitionId !== 'string' || definitionId.trim().length === 0 || definitionId.length > 1024) {
    throw new Error('Invalid schedule definition identity');
  }
  if (!Number.isSafeInteger(fromMs) || !Number.isSafeInteger(throughMs) || fromMs > throughMs
    || Math.abs(fromMs) >= 8_640_000_000_000_000 || Math.abs(throughMs) >= 8_640_000_000_000_000) {
    throw new Error('Invalid enumeration interval bounds');
  }
  if (throughMs - fromMs > 450 * DAY_MS) throw new Error('Enumeration span exceeds 450 days');
  let iterator;
  try {
    // next() is exclusive of currentDate, so subtract one millisecond to include
    // a matching lower bound. UTC and both dates are explicit: no clock access.
    iterator = CronExpressionParser.parse(schedule.cron, { currentDate: fromMs - 1, endDate: throughMs, tz: 'UTC' });
  } catch (error) {
    if (error instanceof Error && error.message === IMPOSSIBLE_DATE) return [];
    throw new Error('Could not initialize UTC schedule enumeration', { cause: error });
  }
  const opportunities: Opportunity[] = [];
  for (;;) {
    let expectedAtMs: number;
    try {
      expectedAtMs = iterator.next().getTime();
    } catch (error) {
      // Do not use hasNext()/take(): those APIs swallow all parser errors and
      // would silently turn a resource/parser failure into an empty calendar.
      if (error instanceof Error && error.message === 'Out of the time span range') break;
      throw new Error('UTC schedule enumeration failed', { cause: error });
    }
    if (expectedAtMs > throughMs) break;
    if (opportunities.length >= MAX_OPPORTUNITIES) throw new Error('Opportunity enumeration limit exceeded (50000)');
    const id = createHash('sha256').update(JSON.stringify([definitionId, expectedAtMs])).digest('hex');
    opportunities.push({ id, expectedAtMs, definitionId });
  }
  return opportunities;
}
