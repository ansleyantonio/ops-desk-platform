import { Fragment, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { activityWindow, ticketActivity } from "@/lib/dev-activity";
import type { Project } from "@/lib/tracker-types";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  UserRound,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SortKey =
  | "name"
  | "started"
  | "reviewed"
  | "moved"
  | "missing"
  | "loggedSeconds"
  | "eventCount";
type Member = {
  key: string;
  name: string;
  groupKey?: string;
  teamName?: string;
  pmName?: string;
  scopeProjectIds?: string[];
};
const today = () => new Date().toISOString().slice(0, 10);

export function DevActivityPanel({
  projects,
  members,
  projectFilter,
  statusFilter,
}: {
  projects: Project[];
  members: Member[];
  projectFilter: string;
  statusFilter: string;
}) {
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [onlyActive, setOnlyActive] = useState(false);
  const [search, setSearch] = useState("");
  const [activityFilter, setActivityFilter] = useState("all");
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean }>({
    key: "name",
    ascending: true,
  });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const window = activityWindow(start, end);
  const rows = useMemo(() => {
    const range = activityWindow(start, end);
    if (!range) return [];
    const now = Date.now();
    return members
      .map((member) => {
        const tickets = projects
          .filter(
            (project) =>
              (projectFilter === "all" || project.id === projectFilter) &&
              (!member.scopeProjectIds?.length ||
                member.scopeProjectIds.includes(project.id)),
          )
          .flatMap((project) =>
            project.modules
              .filter(
                (ticket) =>
                  statusFilter === "all" ||
                  (statusFilter === "review_failed"
                    ? ticket.uat === "failed"
                    : ticket.status === statusFilter),
              )
              .map((ticket) => ({
                ...ticketActivity(
                  ticket,
                  range.from,
                  range.to,
                  now,
                  member.key,
                ),
                ticket,
                project,
              })),
          );
        const active = tickets.filter(
          (ticket) =>
            ticket.started || ticket.movements.length || ticket.timeline.length,
        );
        return {
          ...member,
          rowKey: `${member.groupKey ?? "unassigned:no-team"}:${member.key}`,
          tickets: active,
          started: active.filter((ticket) => ticket.started).length,
          reviewed: active.filter((ticket) => ticket.reviewed).length,
          moved: active.filter((ticket) => ticket.movements.length).length,
          missing: tickets.filter(
            (item) =>
              !item.recorded &&
              item.ticket.assignee?.trim().toLocaleLowerCase() === member.key,
          ).length,
          loggedSeconds: active.reduce(
            (sum, item) => sum + item.loggedSeconds,
            0,
          ),
          eventCount: active.reduce((sum, item) => sum + item.eventCount, 0),
          timeAvailable: tickets.some((item) => item.timeAvailable),
        };
      })
      .filter((row) => !onlyActive || row.tickets.length > 0);
  }, [projects, members, projectFilter, statusFilter, start, end, onlyActive]);
  const displayed = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return rows
      .filter((row) => {
        const matchesSearch =
          !needle ||
          row.name.toLocaleLowerCase().includes(needle) ||
          row.teamName?.toLocaleLowerCase().includes(needle) ||
          row.pmName?.toLocaleLowerCase().includes(needle) ||
          row.tickets.some((item) =>
            `${item.project.name} ${item.ticket.name}`
              .toLocaleLowerCase()
              .includes(needle),
          );
        const matchesActivity =
          activityFilter === "all" ||
          (activityFilter === "started" && row.started > 0) ||
          (activityFilter === "moved" && row.moved > 0) ||
          (activityFilter === "reviewed" && row.reviewed > 0) ||
          (activityFilter === "none" && !row.tickets.length) ||
          (activityFilter === "missing" && row.missing > 0) ||
          (activityFilter === "time" && row.loggedSeconds > 0) ||
          (activityFilter === "events" && row.eventCount > 0);
        return matchesSearch && matchesActivity;
      })
      .sort((a, b) => {
        const comparison =
          sort.key === "name"
            ? a.name.localeCompare(b.name)
            : a[sort.key] - b[sort.key];
        return (
          (sort.ascending ? comparison : -comparison) ||
          a.name.localeCompare(b.name)
        );
      });
  }, [rows, search, activityFilter, sort]);
  const displayedGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        teamName: string;
        pmName: string;
        rows: typeof displayed;
        active: number;
        events: number;
        loggedSeconds: number;
        timeAvailable: boolean;
      }
    >();
    for (const row of displayed) {
      const key = row.groupKey ?? "unassigned:no-team";
      const group = groups.get(key) ?? {
        key,
        teamName: row.teamName ?? "No team assigned",
        pmName: row.pmName ?? "Unassigned",
        rows: [],
        active: 0,
        events: 0,
        loggedSeconds: 0,
        timeAvailable: false,
      };
      group.rows.push(row);
      group.active += row.tickets.length > 0 ? 1 : 0;
      group.events += row.eventCount;
      group.loggedSeconds += row.loggedSeconds;
      group.timeAvailable ||= row.timeAvailable;
      groups.set(key, group);
    }
    return [...groups.values()].sort(
      (a, b) =>
        Number(a.pmName === "Unassigned") -
          Number(b.pmName === "Unassigned") ||
        a.pmName.localeCompare(b.pmName) ||
        a.teamName.localeCompare(b.teamName),
    );
  }, [displayed]);
  const summary = useMemo(
    () => ({
      active: displayed.filter((row) => row.tickets.length > 0).length,
      events: displayed.reduce((sum, row) => sum + row.eventCount, 0),
      hours: displayed.reduce((sum, row) => sum + row.loggedSeconds, 0) / 3600,
      timeAvailable: displayed.some((row) => row.timeAvailable),
    }),
    [displayed],
  );
  const presets = [
    { label: "Today", days: 1, offset: 0 },
    { label: "Yesterday", days: 1, offset: 1 },
    { label: "Last 7 days", days: 7, offset: 0 },
    { label: "Last 30 days", days: 30, offset: 0 },
  ];
  const presetRange = (days: number, offset: number) => {
    const last = new Date(`${today()}T00:00:00Z`);
    last.setUTCDate(last.getUTCDate() - offset);
    const first = new Date(last);
    first.setUTCDate(first.getUTCDate() - days + 1);
    return {
      start: first.toISOString().slice(0, 10),
      end: last.toISOString().slice(0, 10),
    };
  };
  const sortHeading = (key: SortKey, label: string) => (
    <TableHead
      scope="col"
      aria-sort={
        sort.key === key
          ? sort.ascending
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <button
        type="button"
        className="inline-flex items-center gap-2 whitespace-nowrap rounded px-2 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() =>
          setSort((previous) => ({
            key,
            ascending:
              previous.key === key ? !previous.ascending : key === "name",
          }))
        }
      >
        {label}
        {sort.key !== key ? (
          <ArrowUpDown className="h-3.5 w-3.5" />
        ) : sort.ascending ? (
          <ArrowUp className="h-3.5 w-3.5" />
        ) : (
          <ArrowDown className="h-3.5 w-3.5" />
        )}
      </button>
    </TableHead>
  );
  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-card/55">
      <div className="space-y-3 border-b border-border/70 p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-semibold">Activity by date</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Explore ticket movement, recorded activity and logged time by
              team and project manager.
            </p>
          </div>
        </div>
        <div
          className="flex flex-wrap gap-1.5"
          aria-label="Activity date shortcuts"
        >
          {presets.map((preset) => {
            const range = presetRange(preset.days, preset.offset);
            const selected = start === range.start && end === range.end;
            return (
              <Button
                key={preset.label}
                size="sm"
                variant={selected ? "secondary" : "ghost"}
                aria-pressed={selected}
                onClick={() => {
                  setStart(range.start);
                  setEnd(range.end);
                }}
              >
                {preset.label}
              </Button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 flex-1 space-y-1.5 text-xs sm:flex-none">
            From (UTC)
            <Input
              type="date"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </label>
          <label className="min-w-0 flex-1 space-y-1.5 text-xs sm:flex-none">
            Through (UTC)
            <Input
              type="date"
              min={start}
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={(event) => {
                setOnlyActive(event.target.checked);
                if (event.target.checked && activityFilter === "none")
                  setActivityFilter("all");
              }}
            />
            Only members with activity
          </label>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-0 w-full flex-1 space-y-1.5 text-xs sm:min-w-60">
            Search activity table
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Member, active ticket or project"
            />
          </label>
          <label className="text-xs">
            Activity filter
            <select
              value={activityFilter}
              onChange={(event) => {
                setActivityFilter(event.target.value);
                if (event.target.value === "none") setOnlyActive(false);
              }}
              className="mt-1 block h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All activity</option>
              <option value="started">To do → In progress</option>
              <option value="reviewed">In progress → In review</option>
              <option value="moved">Any developer transition</option>
              <option value="time">Logged time</option>
              <option value="events">Ticket activities</option>
              <option value="none">No recorded activity</option>
              <option value="missing">Missing dated history</option>
            </select>
          </label>
          <Button
            variant="ghost"
            onClick={() => {
              setSearch("");
              setActivityFilter("all");
              setOnlyActive(false);
              setSort({ key: "name", ascending: true });
            }}
          >
            Reset table
          </Button>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Uses the existing member, project, current-status and completion
          filters. Capacity: {window?.capacity ?? "—"} hours per person (8 hours
          per weekday, Monday–Friday). Dates include both endpoints in UTC.
        </p>
        <details className="text-xs leading-5 text-muted-foreground">
          <summary className="cursor-pointer rounded py-1 font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            How activity and hours are calculated
          </summary>
          <p className="mt-2 max-w-4xl">
            Hours use completed time entries on their start date (UTC), credited
            to the worker, including tickets assigned to someone else. Running
            timers are shown but excluded from hours. Utilization is logged
            hours divided by weekday capacity. Activity uses the recorded actor
            and event date. Developer transitions include To do → In progress
            and In progress → In review / Pull request. Expand a member to see
            all ticket activities and time entries grouped by date. Older
            tickets without imported events use observed status history
            attributed to the current assignee.
          </p>
        </details>
      </div>
      {!window ? (
        <p role="alert" className="p-5 text-sm text-destructive">
          Choose a valid start and end date.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 border-b border-border/70 bg-muted/15 p-5 lg:grid-cols-4">
            {[
              {
                label: "Members with activity",
                value: `${summary.active} / ${displayed.length}`,
              },
              {
                label: "Recorded activities",
                value: summary.events.toLocaleString(),
              },
              {
                label: "Logged time",
                value: summary.timeAvailable
                  ? `${summary.hours.toFixed(2)}h`
                  : "Unavailable",
              },
              { label: "Capacity per person", value: `${window.capacity}h` },
            ].map((metric) => (
              <div key={metric.label}>
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                <p className="mt-1.5 text-xl font-semibold tracking-tight tabular-nums">
                  {metric.value}
                </p>
              </div>
            ))}
          </div>
          <p className="px-5 py-3 text-xs text-muted-foreground" role="status">
            {displayed.length} of {rows.length} member rows in {displayedGroups.length}{" "}
            {displayedGroups.length === 1 ? "group" : "groups"} · Click column
            headings to sort within each group. Transition columns count
            distinct tickets; a ticket can appear in both. Expand a member for
            ticket details.
          </p>
          <Table
            className="min-w-[900px]"
            aria-label="Member activity grouped by team and project manager for the selected date range"
          >
            <TableHeader className="bg-muted/30">
              <TableRow>
                {sortHeading("name", "Team member")}
                {sortHeading("started", "Started")}
                {sortHeading("reviewed", "Sent to review")}
                {sortHeading("moved", "Tickets moved")}
                {sortHeading("missing", "Missing history")}
                {sortHeading("eventCount", "Activities")}
                {sortHeading("loggedSeconds", "Logged time")}
                <TableHead scope="col">Utilization</TableHead>
                <TableHead scope="col">Capacity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!displayed.length && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="p-8 text-center text-muted-foreground"
                  >
                    No members match these filters. Try another search, activity
                    filter or date range.
                  </TableCell>
                </TableRow>
              )}
              {displayedGroups.map((group) => (
                <Fragment key={group.key}>
                  <TableRow className="border-y border-border/70 bg-muted/45 hover:bg-muted/45">
                    <TableCell colSpan={9} className="px-5 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-foreground">
                            {group.teamName}
                          </p>
                          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <UserRound className="h-3.5 w-3.5" />
                            PM: {group.pmName}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <Badge variant="secondary">
                            {group.rows.length} member
                            {group.rows.length === 1 ? "" : "s"}
                          </Badge>
                          <Badge variant="outline">
                            {group.active} active
                          </Badge>
                          <Badge variant="outline">
                            {group.events.toLocaleString()} activities
                          </Badge>
                          <Badge variant="outline">
                            {group.timeAvailable
                              ? `${(group.loggedSeconds / 3600).toFixed(2)}h logged`
                              : "Time unavailable"}
                          </Badge>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                  {group.rows.map((row) => (
                    <Fragment key={row.rowKey}>
                  <TableRow
                    className={
                      expanded.has(row.rowKey) ? "bg-primary/5" : undefined
                    }
                  >
                    <TableCell>
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded px-2 py-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-expanded={expanded.has(row.rowKey)}
                        onClick={() =>
                          setExpanded((previous) => {
                            const next = new Set(previous);
                            if (next.has(row.rowKey)) next.delete(row.rowKey);
                            else next.add(row.rowKey);
                            return next;
                          })
                        }
                      >
                        {expanded.has(row.rowKey) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        {row.name}
                      </button>
                    </TableCell>
                    <TableCell className="px-4 tabular-nums">
                      {row.started}
                    </TableCell>
                    <TableCell className="px-4 tabular-nums">
                      {row.reviewed}
                    </TableCell>
                    <TableCell className="px-4 tabular-nums">
                      {row.moved}
                    </TableCell>
                    <TableCell className="px-4 tabular-nums">
                      {row.missing}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.eventCount}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.timeAvailable
                        ? `${(row.loggedSeconds / 3600).toFixed(2)}h`
                        : "Unavailable"}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.timeAvailable && window.capacity > 0
                        ? `${((row.loggedSeconds / 3600 / window.capacity) * 100).toFixed(1)}%`
                        : "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {window.capacity}h
                    </TableCell>
                  </TableRow>
                  {expanded.has(row.rowKey) && (
                    <TableRow
                      className={
                        expanded.has(row.rowKey) ? "bg-primary/5" : undefined
                      }
                    >
                      <TableCell colSpan={9} className="bg-muted/20 px-6 py-4">
                        {row.missing > 0 && (
                          <p className="mb-3 text-xs text-muted-foreground">
                            {row.missing} assigned tickets have no dated
                            history; activity cannot be determined.
                          </p>
                        )}
                        {!row.tickets.length ? (
                          <p className="text-xs text-muted-foreground">
                            No recorded activity in this date range.
                          </p>
                        ) : (
                          <ul className="space-y-3">
                            {row.tickets.map((item) => (
                              <li
                                key={`${item.project.id}:${item.ticket.id}`}
                                className="rounded-lg border border-border/60 p-3 text-xs"
                              >
                                <Link
                                  to="/projects/$projectId"
                                  params={{ projectId: item.project.id }}
                                  className="font-medium underline"
                                >
                                  {item.project.name} · {item.ticket.name}
                                </Link>
                                <p className="mt-1">
                                  {item.started
                                    ? "To do → In progress"
                                    : "No To do → In progress transition"}{" "}
                                  ·{" "}
                                  {item.movements.length
                                    ? `${item.movements.length} developer transitions`
                                    : "No recorded movement"}
                                </p>
                                {Array.from(
                                  new Set(
                                    item.timeline.map((event) =>
                                      event.at.slice(0, 10),
                                    ),
                                  ),
                                ).map((date) => (
                                  <div key={date} className="mt-3">
                                    <p className="font-medium">{date} (UTC)</p>
                                    {item.timeline
                                      .filter((event) =>
                                        event.at.startsWith(date),
                                      )
                                      .map((event) => (
                                        <p
                                          key={event.id}
                                          className="mt-1 text-muted-foreground"
                                        >
                                          {event.at.slice(11, 19)} ·{" "}
                                          {event.text}
                                        </p>
                                      ))}
                                  </div>
                                ))}
                                {!item.timeline.length &&
                                  item.movements.map((movement, index) => (
                                    <p
                                      key={index}
                                      className="mt-1 text-muted-foreground"
                                    >
                                      {movement}
                                    </p>
                                  ))}
                              </li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </section>
  );
}
