const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const vm = require('node:vm');

const result = buildSync({ entryPoints: ['src/lib/performance-email-report.ts'], bundle: true, platform: 'node', format: 'cjs', write: false });
const sandbox = { module: { exports: {} }, exports: {}, require };
vm.runInNewContext(result.outputFiles[0].text, sandbox);
const { buildPerformanceReport, formatPerformanceEmail } = sandbox.module.exports;
const date = '2026-09-21';
const members = [{ id: 'm1', name: 'Alex', role: 'dev' }, { id: 'm2', name: 'Blair', role: 'qa' }, { id: 'm3', name: 'Manager', role: 'pm' }];
const entry = (id, name, hours, startedAt = '2026-09-21T12:00:00Z') => ({ id, user: { name }, startedAt, durationSecs: hours * 3600, running: false });
const project = (entries) => ({ id: 'p1', modules: [{ id: 't1', timeEntries: entries }] });

test('reports 8 hour target from completed entries by work date and person', () => {
  const rows = buildPerformanceReport(date, 8, [project([
    entry('1', 'Alex', 5), entry('2', 'Alex', 3), entry('2', 'Alex', 3),
    { ...entry('3', 'Alex', 9), running: true },
    entry('4', 'Alex', 4, '2026-09-22T00:00:00Z'),
    entry('5', 'Manager', 10), entry('6', 'Blair', 2),
  ])], members);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].seconds, 28800);
  assert.equal(rows[0].ticketCount, 1);
  assert.equal(rows[0].status, 'met');
  assert.equal(rows[1].status, 'below');
  const mail = formatPerformanceEmail(date, 8, rows, true);
  assert.match(mail.subject, /^\[TEST\]/);
  assert.match(mail.text, /Alex \(DEV\): 8\.00h/);
});

test('distinguishes unavailable ticket time data from zero logged hours', () => {
  const unavailable = buildPerformanceReport(date, 8, [{ id: 'p1', modules: [{ id: 't1' }] }], members);
  assert.equal(unavailable[0].status, 'unavailable');
  const empty = buildPerformanceReport(date, 8, [project([])], members);
  assert.equal(empty[0].status, 'below');
  assert.equal(empty[0].seconds, 0);
});
