const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const vm = require('node:vm');
const result = buildSync({ entryPoints: ['src/lib/dev-activity.ts'], bundle: true, platform: 'node', format: 'cjs', write: false });
const sandbox = { module: { exports: {} }, exports: {}, require };
vm.runInNewContext(result.outputFiles[0].text, sandbox);
const { activityWindow, ticketActivity } = sandbox.module.exports;
const range = activityWindow('2026-09-09', '2026-09-09');
const now = Date.parse('2026-09-10T12:00:00Z');
const person = { id: 'worker', name: 'Worker' };
const event = { id: 'e1', action: 'STATUS_CHANGED', metadata: { from: 'To Do', to: 'In Progress' }, actor: person, createdAt: '2026-09-09T10:00:00Z' };
const entry = { id: 't1', user: person, loggedBy: { id: 'manager', name: 'Manager' }, startedAt: '2026-09-09T00:00:00Z', durationSecs: 3600, kind: 'DEVELOPMENT', running: false };
const calculate = (ticket, member = 'worker') => ticketActivity(ticket, range.from, range.to, now, member);
test('credits worker and event actor independently of assignee and logger', () => {
 const ticket = { assignee: 'Someone else', activities: [event], timeEntries: [entry] };
 const actual = calculate(ticket);
 assert.equal(actual.loggedSeconds, 3600); assert.equal(actual.started, true); assert.equal(actual.eventCount, 1);
 assert.equal(calculate(ticket, 'manager').loggedSeconds, 0);
 assert.equal(calculate(ticket, 'someone else').eventCount, 0);
});
test('uses work date, excludes future/end boundary, running and invalid durations, deduplicates IDs', () => {
 const entries = [entry, entry, { ...entry, id: 'running', running: true, durationSecs: 9000 },
  { ...entry, id: 'next', startedAt: '2026-09-10T00:00:00Z' },
  { ...entry, id: 'old', startedAt: '2026-09-08T23:59:59Z', loggedAt: event.createdAt },
  { ...entry, id: 'invalid', durationSecs: -1 }];
 const actual = calculate({ activities: [event, event], timeEntries: entries });
 assert.equal(actual.loggedSeconds, 3600); assert.equal(actual.eventCount, 1);
 assert.equal(actual.timeEntryCount, 3);
 assert.equal(ticketActivity({ timeEntries: [entry], activities: [] }, range.from, range.to, range.from - 1, 'worker').loggedSeconds, 0);
});
test('counts actual review transitions and shows other activities without inflating developer movements', () => {
 const actual = calculate({ activities: [event, { ...event, id: 'e2', metadata: { from: 'In Progress', to: 'Pull Request' } },
  { ...event, id: 'e3', metadata: { from: 'Testing', to: 'Done' } }], timeEntries: [] });
 assert.equal(actual.started, true); assert.equal(actual.reviewed, true); assert.equal(actual.movements.length, 2); assert.equal(actual.eventCount, 3);
});
test('authoritative empty API history does not infer movements from notes', () => {
 const ticket = { assignee: 'Worker', activities: [], timeEntries: [], notes: 'Status history: 2026-09-08T10:00:00Z To Do | 2026-09-09T10:00:00Z In Progress' };
 assert.equal(calculate(ticket).started, false); assert.equal(calculate(ticket).recorded, true);
 delete ticket.activities;
 assert.equal(calculate(ticket).started, true);
});
test('weekday capacity and invalid ranges', () => {
 assert.equal(range.capacity, 8);
 assert.equal(activityWindow('2026-09-12', '2026-09-13').capacity, 0);
 assert.equal(activityWindow('2026-09-10', '2026-09-09'), null);
});
