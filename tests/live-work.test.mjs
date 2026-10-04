import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";

const source = await readFile(new URL("../src/lib/live-work.ts", import.meta.url), "utf8");
const { code } = await transform(source, { loader: "ts", format: "esm" });
const { isWorkingStatus, toLiveTicket } = await import(`data:text/javascript,${encodeURIComponent(code)}`);

test("only current in-progress tickets count as work", () => {
  assert.equal(isWorkingStatus("In Progress"), true);
  assert.equal(isWorkingStatus("in_progress"), true);
  assert.equal(isWorkingStatus("In Review"), false);
  assert.equal(
    toLiveTicket({
      id: "1",
      title: "Review",
      status: "In Review",
      assignee: { name: "Ada" },
    }),
    null,
  );
});

test("running timers are shown separately from completed logged time", () => {
  const ticket = toLiveTicket({
    id: "ticket-1",
    title: "Implement login",
    status: "In Progress",
    assignee: { id: "dev-1", name: "Ada" },
    timeEntries: {
      data: [
        {
          id: "running",
          running: true,
          startedAt: "2026-09-25T10:00:00Z",
          durationSecs: 9999,
          user: { name: "Ada" },
        },
        {
          id: "logged",
          running: false,
          startedAt: "2026-09-24T10:00:00Z",
          durationSecs: 1800,
          user: { name: "Ada" },
        },
        {
          id: "logged",
          running: false,
          startedAt: "2026-09-24T10:00:00Z",
          durationSecs: 1800,
          user: { name: "Ada" },
        },
      ],
    },
  });
  assert.equal(ticket?.runningTimers.length, 1);
  assert.equal(ticket?.runningTimers[0].userName, "Ada");
  assert.equal(ticket?.loggedSeconds, 1800);
  assert.equal(ticket?.timerAvailable, true);
});

test("accepts ticketId when the API omits id", () => {
  const ticket = toLiveTicket({
    ticketId: "ticket-2",
    title: "Implement reporting",
    status: "in_progress",
    assignee: { name: "Ada" },
  });

  assert.equal(ticket?.id, "ticket-2");
});
