const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const vm = require('node:vm');
const result = buildSync({ entryPoints: ['src/lib/activity-member-scope.ts'], bundle: true, platform: 'node', format: 'cjs', write: false });
const sandbox = { module: { exports: {} }, exports: {}, require };
vm.runInNewContext(result.outputFiles[0].text, sandbox);
const { addActivityMemberForProject, mergeActivityMembers } = sandbox.module.exports;

test('keeps each project row and adds a scoped row for work outside existing assignments', () => {
  const rows = [
    { key: 'wahidul alam', groupKey: 'cls', scopeProjectIds: ['cls'] },
    { key: 'wahidul alam', groupKey: 'moodle', scopeProjectIds: ['moodle'] },
    { key: 'wahidul alam', groupKey: 'univive', scopeProjectIds: ['univive'] },
  ];
  addActivityMemberForProject(rows, 'wahidul alam', 'univive', () => { throw new Error('existing row should be used'); });
  assert.equal(rows.length, 3);
  addActivityMemberForProject(rows, 'wahidul alam', 'other-project', () => ({ key: 'wahidul alam', groupKey: 'other', scopeProjectIds: ['other-project'] }));
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((row) => row.groupKey), ['cls', 'moodle', 'univive', 'other']);
  addActivityMemberForProject(rows, 'wahidul alam', 'another-project', () => ({ key: 'wahidul alam', groupKey: 'other', scopeProjectIds: ['another-project'] }));
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[3].scopeProjectIds, ['other-project', 'another-project']);
});

test('shows one person total across assigned teams and a worked project', () => {
  const rows = [
    { key: 'wahidul alam', groupKey: 'cls', teamName: 'CLS', pmName: 'PM A', scopeProjectIds: ['cls'] },
    { key: 'wahidul alam', groupKey: 'moodle', teamName: 'MOODLE', pmName: 'PM B', scopeProjectIds: ['moodle'] },
    { key: 'wahidul alam', groupKey: 'univive', teamName: 'Univive', pmName: 'PM C', scopeProjectIds: ['univive'] },
  ];
  const merged = mergeActivityMembers(rows);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].teamName, 'Across teams');
  assert.deepEqual(Array.from(merged[0].scopeProjectIds), ['cls', 'moodle', 'univive']);
  assert.deepEqual(rows[0].scopeProjectIds, ['cls']);
});
