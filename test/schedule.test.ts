import assert from 'node:assert/strict';
import test from 'node:test';
import { enumerateOpportunities, readSchedule } from '../src/schedule.ts';

const yaml = (cron: string, zone?: string): string =>
  `on:\n  schedule:\n    - cron: '${cron}'\n${zone === undefined ? '' : `      timezone: ${zone}\n`}`;
const times = (cron: string, from: string, through: string): string[] =>
  enumerateOpportunities(readSchedule(yaml(cron)), 'definition-a', Date.parse(from), Date.parse(through))
    .map(item => new Date(item.expectedAtMs).toISOString());

// Literal UTC expectations deliberately do not use a second cron implementation.
test('bare on and quoted on preserve a single UTC schedule', () => {
  for (const zone of [undefined, 'UTC', 'Etc/UTC']) {
    for (const source of [yaml('17 6 * * *', zone), yaml('17 6 * * *', zone).replace('on:', '"on":')]) {
      assert.deepEqual(readSchedule(source), { supported: true, cron: '17 6 * * *', timezone: 'UTC', reasonCodes: [] });
    }
  }
});

test('closed bounds include UTC midnight and exclude fractional-minute starts', () => {
  assert.deepEqual(times('0,30 23,0 * * *', '2024-12-31T23:30:00Z', '2025-01-01T00:30:00Z'), [
    '2024-12-31T23:30:00.000Z', '2025-01-01T00:00:00.000Z', '2025-01-01T00:30:00.000Z',
  ]);
  assert.deepEqual(times('0 0 * * *', '2025-01-01T00:00:00.001Z', '2025-01-02T00:00:00Z'), ['2025-01-02T00:00:00.000Z']);
  assert.deepEqual(times('0 0 * * *', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'), ['2025-01-01T00:00:00.000Z']);
});

test('leap days and impossible calendar dates produce actual occurrences only', () => {
  assert.deepEqual(times('0 0 29 FEB *', '2024-02-28T00:00:00Z', '2024-03-01T00:00:00Z'), ['2024-02-29T00:00:00.000Z']);
  assert.deepEqual(times('0 0 29 FEB *', '2025-02-01T00:00:00Z', '2025-03-01T00:00:00Z'), []);
  for (const cron of ['0 0 31 FEB *', '0 0 31 APR,JUN *']) {
    assert.equal(readSchedule(yaml(cron)).supported, true);
    assert.deepEqual(times(cron, '2024-01-01T00:00:00Z', '2025-01-01T00:00:00Z'), []);
  }
});

test('named weekdays, months, ranges, lists, and step boundaries conform', () => {
  assert.deepEqual(times('5-25/10 8-10/2 * JAN MON-WED', '2025-01-06T07:59:00Z', '2025-01-06T10:30:00Z'), [
    '2025-01-06T08:05:00.000Z', '2025-01-06T08:15:00.000Z', '2025-01-06T08:25:00.000Z',
    '2025-01-06T10:05:00.000Z', '2025-01-06T10:15:00.000Z', '2025-01-06T10:25:00.000Z',
  ]);
  assert.deepEqual(times('20/15 0 * jan sun', '2025-01-04T23:59:00Z', '2025-01-05T01:00:00Z'), [
    '2025-01-05T00:20:00.000Z', '2025-01-05T00:35:00.000Z', '2025-01-05T00:50:00.000Z',
  ]);
  assert.deepEqual(times('0 0 * */2 *', '2025-02-28T23:59:00Z', '2025-03-01T00:00:00Z'), ['2025-03-01T00:00:00.000Z']);
});

test('restricted day-of-month and weekday use OR, including impossible month dates', () => {
  assert.deepEqual(times('0 0 1 JAN MON', '2025-01-01T00:00:00Z', '2025-01-07T00:00:00Z'), [
    '2025-01-01T00:00:00.000Z', '2025-01-06T00:00:00.000Z',
  ]);
  for (const cron of ['0 0 31 FEB MON', '0 0 30 2 MON']) {
    assert.deepEqual(times(cron, '2025-02-01T00:00:00Z', '2025-02-10T00:00:00Z'), [
      '2025-02-03T00:00:00.000Z', '2025-02-10T00:00:00.000Z',
    ]);
  }
});

test('unsupported syntax never reaches broader parser extensions', () => {
  for (const cron of ['@daily', '0 0 0 * * *', '0 0 * * * 2025', '0 0 ? * MON', '0 0 L * *', '0 0 1W * *', '0 0 * * MON#2', 'H * * * *', '0 0 * * 7', '0 0 * * 0-7', '0 0 * * FUNDAY', '0 0 * 13 *', '60 0 * * *', '0 24 * * *', '0 0 0 * *', '0 0 32 * *', '0 0 * 0 *', '*/0 * * * *', '0 0 * * FRI-MON', '0 0 * * 1.5']) {
    const result = readSchedule(yaml(cron));
    assert.equal(result.supported, false, cron);
    assert.deepEqual(result.reasonCodes, ['unsupported_cron'], cron);
  }
});

test('frequency validation checks cyclic minute/hour gaps without clamping', () => {
  for (const cron of ['* * * * *', '*/4 * * * *', '*/7 * * * *', '1,58 * * * *', '1,58 0,23 * * *', '1,58 0,23 1 JAN *']) {
    assert.deepEqual(readSchedule(yaml(cron)).reasonCodes, ['unsupported_frequency'], cron);
  }
  for (const cron of ['*/5 * * * *', '1,58 0 * * *', '0,5 * * * *']) assert.equal(readSchedule(yaml(cron)).supported, true, cron);
});

test('named DST zones, multiple entries, and absent schedules have explicit reasons', () => {
  for (const zone of ['America/New_York', 'Europe/London', 'Asia/Kolkata', 'GMT', 'null']) {
    assert.deepEqual(readSchedule(yaml('0 0 * * *', zone)).reasonCodes, ['unsupported_timezone']);
  }
  assert.deepEqual(readSchedule('on:\n  schedule:\n    - cron: "0 0 * * *"\n    - cron: "0 1 * * *"').reasonCodes, ['unsupported_multiple_schedules']);
  for (const source of ['', 'on: push', 'on: [push, workflow_dispatch]', 'on:\n  push:', 'on:\n  schedule: []']) {
    assert.deepEqual(readSchedule(source).reasonCodes, ['no_schedule']);
  }
  for (const source of ['on:\n  schedule: "0 0 * * *"', 'on:\n  schedule: [12]', 'on:\n  schedule: [{cron: 12}]']) {
    assert.deepEqual(readSchedule(source).reasonCodes, ['invalid_schedule']);
  }
});

test('unsafe YAML, duplicate keys, aliases, custom tags, and excess bytes are rejected', () => {
  for (const source of [
    'on: {schedule: [{cron: "0 0 * * *", cron: "0 1 * * *"}]}',
    'on: {}\non: {}', 'on: [',
    'x: &x [*x]\non: {schedule: [{cron: "0 0 * * *"}]}',
    'x: &x "0 0 * * *"\non: {schedule: [{cron: *x}]}',
    'on: {schedule: [{cron: !thing "0 0 * * *"}]}',
    '---\non: push\n---\non: push',
  ]) assert.deepEqual(readSchedule(source).reasonCodes, ['invalid_workflow_yaml']);
  assert.deepEqual(readSchedule('#' + 'é'.repeat(524288)).reasonCodes, ['workflow_too_large']);
});

test('opportunity identities are stable across overlapping windows and tied to definition', () => {
  const schedule = readSchedule(yaml('0 0 * * *'));
  const from = Date.parse('2025-01-01T00:00:00Z');
  const through = Date.parse('2025-01-02T00:00:00Z');
  const all = enumerateOpportunities(schedule, 'a', from, through);
  assert.deepEqual(all.slice(1), enumerateOpportunities(schedule, 'a', through, through));
  assert.notEqual(all[0].id, enumerateOpportunities(schedule, 'b', from, from)[0].id);
  assert.equal(all[0].definitionId, 'a');
  assert.equal(new Set(all.map(item => item.id)).size, all.length);
});

test('enumeration refuses unsupported schedules, invalid bounds, and resource overflow', () => {
  const schedule = readSchedule(yaml('*/5 * * * *'));
  const from = Date.parse('2025-01-01T00:00:00Z');
  assert.throws(() => enumerateOpportunities(readSchedule('on: push'), 'a', from, from), /unsupported/i);
  for (const [a, b] of [[NaN, from], [from, Infinity], [from, from - 1], [from, from + 0.5], [-8640000000000000, 0]]) {
    assert.throws(() => enumerateOpportunities(schedule, 'a', a, b), /interval|bound|span/i);
  }
  assert.throws(() => enumerateOpportunities(schedule, '', from, from), /definition/i);
  assert.throws(() => enumerateOpportunities(schedule, 'a', from, from + 451 * 86400000), /span/i);
  assert.throws(() => enumerateOpportunities(schedule, 'a', from, from + 180 * 86400000), /opportunit.*limit|limit.*opportunit/i);
});
