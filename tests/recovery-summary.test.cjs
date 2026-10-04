const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildSync } = require("esbuild");
const vm = require("node:vm");

const result = buildSync({
  entryPoints: ["src/lib/recovery-types.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
});
const sandbox = { module: { exports: {} }, exports: {}, require };
vm.runInNewContext(result.outputFiles[0].text, sandbox);
const { recoveryCommitmentNewestFirst, recoverySummary } =
  sandbox.module.exports;

function task(overrides) {
  return {
    id: "recovery-1",
    projectId: "project-1",
    taskId: "task-1",
    committedCompletionDate: "2026-09-10",
    qaRejectionCount: 0,
    scopeChanged: false,
    resourceReassigned: false,
    status: "green",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

test("summarises on-time and missed commitments using actual and current dates", () => {
  const summary = recoverySummary(
    [
      task({ id: "on-time", actualCompletionDate: "2026-09-10" }),
      task({ id: "late", actualCompletionDate: "2026-09-11" }),
      task({ id: "overdue", committedCompletionDate: "2026-09-19" }),
      task({ id: "future", committedCompletionDate: "2026-09-21" }),
    ],
    "2026-09-20",
  );

  assert.equal(summary.totalCommitted, 4);
  assert.equal(summary.completedOnTime, 1);
  assert.equal(summary.missedDeadlines, 2);
});

test("calculates task-level QA rate and recovery impact breakdowns", () => {
  const summary = recoverySummary([
    task({
      id: "quality",
      qaRejectionCount: 3,
      scopeChanged: true,
      rootCause: "qa_issue",
    }),
    task({
      id: "resources",
      taskId: "task-2",
      qaRejectionCount: 1,
      resourceReassigned: true,
      rootCause: "resource_reassignment",
    }),
    task({ id: "clear", taskId: "task-3" }),
  ]);

  assert.equal(summary.qaRejectedTasks, 2);
  assert.equal(summary.qaRejectionRate, 67);
  assert.equal(summary.scopeChanges, 1);
  assert.equal(summary.resourceReassignments, 1);
  assert.equal(summary.rootCauseCounts.qa_issue, 1);
  assert.equal(summary.rootCauseCounts.resource_reassignment, 1);
});

test("surfaces missing deadlines without counting them as missed", () => {
  const summary = recoverySummary(
    [
      task({ id: "missing", committedCompletionDate: undefined }),
      task({ id: "overdue", committedCompletionDate: "2026-09-19" }),
    ],
    "2026-09-20",
  );

  assert.equal(summary.missingDeadlines, 1);
  assert.equal(summary.missedDeadlines, 1);
});

test("sorts recovery commitments by latest update first", () => {
  const commitments = [
    task({ id: "older", updatedAt: 10, committedCompletionDate: "2026-10-30" }),
    task({ id: "newer", updatedAt: 20, committedCompletionDate: "2026-09-30" }),
    task({
      id: "newer-later-date",
      updatedAt: 20,
      committedCompletionDate: "2026-10-15",
    }),
  ];

  commitments.sort(recoveryCommitmentNewestFirst);

  assert.deepEqual(
    commitments.map((commitment) => commitment.id),
    ["newer-later-date", "newer", "older"],
  );
});
