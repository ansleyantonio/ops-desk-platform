export type ModuleStatus = "not_started" | "in_progress" | "completed" | "blocked";
export type UATStatus = "pending" | "in_progress" | "passed" | "failed";
export type ProjectStatus = "planning" | "active" | "on_hold" | "completed";
export type ProjectPhase =
  | "discovery"
  | "build"
  | "uat"
  | "go_live"
  | "hypercare"
  | "complete"
  | "paused";
export type RiskSeverity = "low" | "medium" | "high";
export type TeamRole = "pm" | "dev" | "qa";
export type ProjectTag = "education" | "internal_tools" | "b2c" | "websites";

export const PROJECT_TAGS: ProjectTag[] = ["education", "internal_tools", "b2c", "websites"];

export const projectTagLabel: Record<ProjectTag, string> = {
  education: "Education",
  internal_tools: "Internal tools",
  b2c: "B2C",
  websites: "Websites",
};

export interface TeamMember {
  id: string;
  name: string;
  role: TeamRole;
  title?: string;
  managerId?: string;
  createdAt: number;
}

export interface ProjectTeam {
  id: string;
  name: string;
  description?: string;
  pmId?: string;
  devIds: string[];
  qaIds: string[];
  createdAt: number;
}

export interface Module {
  id: string;
  name: string;
  moduleGroup?: string;
  sprintGroup?: string;
  assignee?: string;
  effortDays?: number;
  status: ModuleStatus;
  plannedStart?: string;
  plannedEnd?: string;
  // UAT
  uat: UATStatus;
  uatPlannedStart?: string;
  uatPlannedEnd?: string;
  uatActualStart?: string;
  uatActualEnd?: string;
  notes?: string;
}

export interface Risk {
  id: string;
  title: string;
  severity: RiskSeverity;
  mitigation?: string;
  resolved?: boolean;
  createdAt: number;
}

export interface ProjectStage {
  id: string;
  label: string;
  color?: string;
  startDate?: string;
  endDate?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  notionUrl?: string;
  owner: string;
  pmId?: string;
  teamId?: string;
  memberIds: string[];
  phase: ProjectPhase;
  startDate: string;
  targetDate: string;
  uatStartDate?: string;
  uatEndDate?: string;
  currentStageId?: string;
  stages?: ProjectStage[];
  priority: "low" | "medium" | "high";
  status: ProjectStatus;
  isDraft?: boolean;
  tags: ProjectTag[];
  modules: Module[];
  risks: Risk[];
  createdAt: number;
}

const KEY = "ppt:projects:v1";

function normalizePhase(phase?: string, status?: ProjectStatus): ProjectPhase {
  if (
    phase === "discovery" ||
    phase === "build" ||
    phase === "uat" ||
    phase === "go_live" ||
    phase === "hypercare" ||
    phase === "complete" ||
    phase === "paused"
  ) {
    return phase;
  }

  if (status === "planning") return "discovery";
  if (status === "on_hold") return "paused";
  if (status === "completed") return "complete";
  return "build";
}

export function loadProjects(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Project[];
    // back-compat defaults
    return arr.map((p) => ({
      ...p,
      notionUrl: p.notionUrl || undefined,
      tags: p.tags ?? [],
      memberIds: p.memberIds ?? [],
      phase: normalizePhase((p as Project & { phase?: string }).phase, p.status ?? "active"),
      status: p.status ?? "active",
      isDraft: p.isDraft ?? false,
      risks: p.risks ?? [],
      modules: (p.modules ?? []).map((m) => ({ ...m })),
    }));
  } catch {
    return [];
  }
}

export function saveProjects(p: Project[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function phaseLabel(phase: ProjectPhase) {
  return phase
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function projectProgress(p: Project) {
  if (!p.modules.length) return { modulePct: 0, uatPct: 0, overall: 0 };
  const mDone = p.modules.filter((m) => m.status === "completed").length;
  const mPartial = p.modules.filter((m) => m.status === "in_progress").length;
  const modulePct = Math.round(((mDone + mPartial * 0.5) / p.modules.length) * 100);
  const uatPassed = p.modules.filter((m) => m.uat === "passed").length;
  const uatPartial = p.modules.filter((m) => m.uat === "in_progress").length;
  const uatPct = Math.round(((uatPassed + uatPartial * 0.5) / p.modules.length) * 100);
  const overall = Math.round(modulePct * 0.6 + uatPct * 0.4);
  return { modulePct, uatPct, overall };
}

export type Health = "on_track" | "at_risk" | "delayed" | "completed" | "unknown";

export function projectHealth(p: Project): Health {
  const { overall } = projectProgress(p);
  if (overall === 100 || p.status === "completed") return "completed";
  if (hasReviewRegressionRisk(p) || hasReviewFailurePressure(p)) return "at_risk";
  if (!p.targetDate) return "unknown";
  const total = new Date(p.targetDate).getTime() - new Date(p.startDate || p.createdAt).getTime();
  const elapsed = Date.now() - new Date(p.startDate || p.createdAt).getTime();
  if (total <= 0) return "unknown";
  const timePct = Math.min(100, Math.max(0, (elapsed / total) * 100));
  const overdue = Date.now() > new Date(p.targetDate).getTime();
  if (overdue) return "delayed";
  if (timePct - overall > 20) return "at_risk";
  return "on_track";
}

export function hasReviewRegressionRisk(p: Project) {
  return p.risks.some((risk) => {
    if (risk.resolved) return false;
    const title = risk.title.toLowerCase();
    const mitigation = risk.mitigation?.toLowerCase() ?? "";
    return (
      title.includes("review regression") ||
      title.includes("testing churn") ||
      title.includes("failed at testing") ||
      mitigation.includes("review regression") ||
      mitigation.includes("testing churn") ||
      mitigation.includes("failed at testing")
    );
  });
}

export function hasReviewFailurePressure(p: Project) {
  if (p.modules.length === 0) return false;
  const failedReviews = p.modules.filter((module) => module.uat === "failed").length;
  return failedReviews >= 3 && failedReviews / p.modules.length >= 0.15;
}

export function remainingEffortDays(p: Project): number {
  return p.modules
    .filter((m) => m.status !== "completed")
    .reduce((sum, m) => sum + (m.effortDays ?? 5), 0);
}

export interface OwnerLoad {
  owner: string;
  activeProjects: number;
  remainingDays: number;
  openRisks: number;
  health: Health;
  projects: Project[];
}

export type TicketInsightSeverity = "success" | "info" | "warning" | "critical";

export interface TicketDecisionInsight {
  id: string;
  title: string;
  value: string;
  detail: string;
  severity: TicketInsightSeverity;
  action?: string;
}

export interface TicketFlowStats {
  total: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  blocked: number;
  open: number;
  completionPct: number;
  modulePct: number;
  reviewPct: number;
  overallPct: number;
  reviewPending: number;
  reviewInProgress: number;
  reviewPassed: number;
  reviewFailed: number;
  movedBackCount: number;
  movedBackByStage: Array<{ stage: string; count: number }>;
  movedBackByFlow: Array<{ from: string; to: string; count: number }>;
  movedBackExamples: string[];
  hasStatusHistory: boolean;
}

const DAY_MS = 86400000;
const PENDING_AGE_LIMIT_DAYS = 7;
const BLOCKED_AGE_LIMIT_DAYS = 3;
const REVIEW_AGE_LIMIT_DAYS = 3;

function parseDateTime(value?: string) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function ageInDaysSince(value: string | undefined, now: number) {
  const parsed = parseDateTime(value);
  if (!parsed) return null;
  return Math.max(0, Math.floor((now - parsed) / DAY_MS));
}

function overdueByDays(value: string | undefined, now: number) {
  const parsed = parseDateTime(value);
  if (!parsed || parsed > now) return null;
  return Math.floor((now - parsed) / DAY_MS);
}

function pct(count: number, total: number) {
  if (total === 0) return 0;
  return Math.round((count / total) * 100);
}

function ticketRef(module: Module) {
  return module.name.replace(/^#/, "").slice(0, 72);
}

function statusHistoryRecords(module: Module) {
  const notes = module.notes ?? "";
  const markerIndex = notes.indexOf("Status history:");
  if (markerIndex === -1) return [];

  return notes
    .slice(markerIndex + "Status history:".length)
    .split("|")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const timestampMatch = entry.match(/^(\d{4}-\d{2}-\d{2}(?:T\S+)?)\s+(.+)$/);
      return {
        at: timestampMatch?.[1],
        status: (timestampMatch?.[2] ?? entry).trim().toLowerCase(),
      };
    });
}

function statusHistoryEntries(module: Module) {
  return statusHistoryRecords(module).map((entry) => entry.status);
}

function reviewRegressionCount(modules: Module[]) {
  const examples: string[] = [];
  const destinationCounts = new Map<string, number>();
  const flowCounts = new Map<string, { from: string; to: string; count: number }>();
  let count = 0;

  for (const module of modules) {
    const history = statusHistoryRecords(module);
    for (let index = 1; index < history.length; index += 1) {
      const previousEntry = history[index - 1];
      const currentEntry = history[index];
      const previous = previousEntry.status;
      const current = currentEntry.status;
      const wasReview =
        previous === "in review" ||
        previous === "testing" ||
        previous === "qa" ||
        previous === "review";
      const movedBack =
        current === "in progress" ||
        current === "to do" ||
        current === "not started" ||
        current === "blocked" ||
        current === "stuck" ||
        current === "backlog";
      if (wasReview && movedBack) {
        count += 1;
        destinationCounts.set(current, (destinationCounts.get(current) ?? 0) + 1);
        const flowKey = `${previous}\u0000${current}`;
        const flow = flowCounts.get(flowKey);
        flowCounts.set(flowKey, {
          from: previous,
          to: current,
          count: (flow?.count ?? 0) + 1,
        });
        if (examples.length < 5) {
          examples.push(
            `${ticketRef(module)} · ${statusStageLabel(previous)} (${historyDateLabel(previousEntry.at)}) → ${statusStageLabel(current)} (${historyDateLabel(currentEntry.at)}) · ${module.assignee || "Unassigned"}`,
          );
        }
      }
    }
  }

  const byStage = [...destinationCounts.entries()]
    .map(([stage, stageCount]) => ({ stage, count: stageCount }))
    .sort((left, right) => right.count - left.count || left.stage.localeCompare(right.stage));
  const byFlow = [...flowCounts.values()].sort(
    (left, right) =>
      right.count - left.count ||
      left.from.localeCompare(right.from) ||
      left.to.localeCompare(right.to),
  );

  return { count, examples, byStage, byFlow };
}

function statusStageLabel(status: string) {
  return status.replace(/\b\w/g, (character) => character.toUpperCase());
}

function historyDateLabel(value?: string) {
  if (!value) return "date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date unavailable";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ticketFlowStats(project: Project): TicketFlowStats {
  const { modulePct, uatPct, overall } = projectProgress(project);
  const total = project.modules.length;
  const completed = project.modules.filter((module) => module.status === "completed").length;
  const inProgress = project.modules.filter((module) => module.status === "in_progress").length;
  const notStarted = project.modules.filter((module) => module.status === "not_started").length;
  const blocked = project.modules.filter((module) => module.status === "blocked").length;
  const reviewPending = project.modules.filter((module) => module.uat === "pending").length;
  const reviewInProgress = project.modules.filter((module) => module.uat === "in_progress").length;
  const reviewPassed = project.modules.filter((module) => module.uat === "passed").length;
  const reviewFailed = project.modules.filter((module) => module.uat === "failed").length;
  const regressions = reviewRegressionCount(project.modules);

  return {
    total,
    completed,
    inProgress,
    notStarted,
    blocked,
    open: total - completed,
    completionPct: pct(completed, total),
    modulePct,
    reviewPct: uatPct,
    overallPct: overall,
    reviewPending,
    reviewInProgress,
    reviewPassed,
    reviewFailed,
    movedBackCount: regressions.count,
    movedBackByStage: regressions.byStage,
    movedBackByFlow: regressions.byFlow,
    movedBackExamples: regressions.examples,
    hasStatusHistory: project.modules.some((module) => statusHistoryEntries(module).length > 0),
  };
}

export function ticketDecisionInsights(
  project: Project,
  now = Date.now(),
): TicketDecisionInsight[] {
  const total = project.modules.length;
  const openTickets = project.modules.filter((module) => module.status !== "completed");
  const pendingTickets = project.modules.filter((module) => module.status === "not_started");
  const pendingTooLong = pendingTickets
    .map((module) => ({ module, age: ageInDaysSince(module.plannedStart, now) }))
    .filter((item): item is { module: Module; age: number } => item.age !== null)
    .filter((item) => item.age > PENDING_AGE_LIMIT_DAYS);
  const pendingWithoutDates = pendingTickets.filter((module) => !module.plannedStart);

  const blockedTickets = project.modules.filter((module) => module.status === "blocked");
  const staleBlocked = blockedTickets
    .map((module) => ({
      module,
      age: ageInDaysSince(module.plannedStart ?? module.plannedEnd, now),
    }))
    .filter((item): item is { module: Module; age: number } => item.age !== null)
    .filter((item) => item.age > BLOCKED_AGE_LIMIT_DAYS);

  const reviewInProgress = project.modules.filter((module) => module.uat === "in_progress");
  const reviewOverdue = reviewInProgress
    .map((module) => ({
      module,
      overdue: overdueByDays(module.uatPlannedEnd ?? module.plannedEnd, now),
    }))
    .filter((item): item is { module: Module; overdue: number } => item.overdue !== null)
    .filter((item) => item.overdue > 0);
  const reviewAging = reviewInProgress
    .map((module) => ({
      module,
      age: ageInDaysSince(module.uatPlannedStart ?? module.plannedStart, now),
    }))
    .filter((item): item is { module: Module; age: number } => item.age !== null)
    .filter((item) => item.age > REVIEW_AGE_LIMIT_DAYS);

  const failedReview = project.modules.filter((module) => module.uat === "failed");
  const regressions = reviewRegressionCount(project.modules);
  const hasHistory = project.modules.some((module) => statusHistoryEntries(module).length > 0);
  const completed = project.modules.filter((module) => module.status === "completed").length;
  const insights: TicketDecisionInsight[] = [];

  insights.push({
    id: "flow-health",
    title: "Ticket flow health",
    value: total ? `${pct(completed, total)}% complete` : "No tickets",
    detail: total
      ? `${openTickets.length} open out of ${total}. ${blockedTickets.length} blocked, ${reviewInProgress.length} in review/testing.`
      : "Add tickets or sync from Notion to begin tracking delivery flow.",
    severity:
      failedReview.length > 0 || blockedTickets.length / Math.max(1, total) >= 0.15
        ? "critical"
        : openTickets.length > 0
          ? "info"
          : "success",
    action:
      blockedTickets.length > 0
        ? "Clear blockers before pulling more tickets into dev."
        : undefined,
  });

  insights.push({
    id: "pending-age",
    title: "Pending age",
    value: `${pendingTooLong.length} stale`,
    detail:
      pendingTooLong.length > 0
        ? `${pendingTooLong.length}/${pendingTickets.length} not-started tickets are older than ${PENDING_AGE_LIMIT_DAYS} days. Oldest: ${pendingTooLong
            .slice()
            .sort((a, b) => b.age - a.age)
            .slice(0, 3)
            .map((item) => `${ticketRef(item.module)} (${item.age}d)`)
            .join("; ")}.`
        : pendingTickets.length > 0
          ? `${pendingTickets.length} tickets are pending; none with dates are older than ${PENDING_AGE_LIMIT_DAYS} days. ${pendingWithoutDates.length} pending ticket(s) need planned start dates.`
          : "No pending tickets waiting to start.",
    severity:
      pendingTooLong.length >= 3 ||
      pendingTooLong.length / Math.max(1, pendingTickets.length) >= 0.25
        ? "warning"
        : pendingTickets.length > 0
          ? "info"
          : "success",
    action:
      pendingTooLong.length > 0
        ? "Confirm whether these should start, be descoped, or be moved behind current priorities."
        : pendingWithoutDates.length > 0
          ? "Add planned start dates so aging can be measured reliably."
          : undefined,
  });

  insights.push({
    id: "review-quality",
    title: "Review quality",
    value: `${failedReview.length} failed`,
    detail:
      failedReview.length > 0
        ? `${failedReview.length} ticket(s) failed review: ${failedReview.slice(0, 3).map(ticketRef).join("; ")}.`
        : reviewOverdue.length > 0
          ? `${reviewOverdue.length} ticket(s) are overdue in review/testing.`
          : reviewAging.length > 0
            ? `${reviewAging.length} ticket(s) have been in review/testing for more than ${REVIEW_AGE_LIMIT_DAYS} days.`
            : "No failed review pressure detected from the current ticket states.",
    severity:
      failedReview.length >= 3 || failedReview.length / Math.max(1, total) >= 0.15
        ? "critical"
        : failedReview.length > 0 || reviewOverdue.length > 0 || reviewAging.length > 0
          ? "warning"
          : "success",
    action:
      failedReview.length > 0
        ? "Run a defect triage before accepting more tickets into review."
        : reviewOverdue.length > 0
          ? "Pull QA and dev together on the overdue review queue."
          : undefined,
  });

  insights.push({
    id: "review-regression",
    title: "Moved back to dev",
    value: hasHistory ? `${regressions.count} event(s)` : "Needs history",
    detail: hasHistory
      ? regressions.count > 0
        ? `Detected review/testing to dev regressions. Examples: ${regressions.examples.join("; ")}.`
        : "No review-to-dev regressions found in stored status history."
      : "Current import stores ticket state, but not full Notion status-history yet. Cron sync should persist status changes to unlock this metric.",
    severity:
      regressions.count >= 3 || regressions.count / Math.max(1, total) >= 0.15
        ? "critical"
        : regressions.count > 0
          ? "warning"
          : hasHistory
            ? "success"
            : "info",
    action: hasHistory
      ? regressions.count > 0
        ? "Review acceptance criteria and test notes for tickets bouncing out of review."
        : undefined
      : "Capture Notion status transitions during scheduled sync.",
  });

  if (staleBlocked.length > 0) {
    insights.push({
      id: "blocked-age",
      title: "Blocked aging",
      value: `${staleBlocked.length} stale`,
      detail: `Blocked tickets older than ${BLOCKED_AGE_LIMIT_DAYS} days: ${staleBlocked
        .slice()
        .sort((a, b) => b.age - a.age)
        .slice(0, 3)
        .map((item) => `${ticketRef(item.module)} (${item.age}d)`)
        .join("; ")}.`,
      severity: "critical",
      action: "Escalate dependency owners and record an unblock date per ticket.",
    });
  }

  return insights;
}

export function normalizeModule(module: Partial<Module>): Module {
  return {
    id: module.id ?? uid(),
    name: module.name ?? "",
    moduleGroup: module.moduleGroup?.trim() || undefined,
    sprintGroup: module.sprintGroup?.trim() || undefined,
    assignee: module.assignee || undefined,
    effortDays: module.effortDays ?? undefined,
    status: module.status ?? "not_started",
    plannedStart: module.plannedStart || undefined,
    plannedEnd: module.plannedEnd || undefined,
    uat: module.uat ?? "pending",
    uatPlannedStart: module.uatPlannedStart || undefined,
    uatPlannedEnd: module.uatPlannedEnd || undefined,
    uatActualStart: module.uatActualStart || undefined,
    uatActualEnd: module.uatActualEnd || undefined,
    notes: module.notes || undefined,
  };
}

export function normalizeRisk(risk: Partial<Risk>): Risk {
  return {
    id: risk.id ?? uid(),
    title: risk.title ?? "",
    severity: risk.severity ?? "medium",
    mitigation: risk.mitigation || undefined,
    resolved: risk.resolved ?? false,
    createdAt: risk.createdAt ?? Date.now(),
  };
}

export function normalizeTeamMember(member: Partial<TeamMember>): TeamMember {
  return {
    id: member.id ?? uid(),
    name: member.name ?? "",
    role: member.role ?? "dev",
    title: member.title || undefined,
    managerId: member.managerId || undefined,
    createdAt: member.createdAt ?? Date.now(),
  };
}

export function normalizeProjectTeam(team: Partial<ProjectTeam>): ProjectTeam {
  return {
    id: team.id ?? uid(),
    name: team.name ?? "",
    description: team.description || undefined,
    pmId: team.pmId || undefined,
    devIds: team.devIds ?? [],
    qaIds: team.qaIds ?? [],
    createdAt: team.createdAt ?? Date.now(),
  };
}

export function normalizeProject(project: Partial<Project> & { phase?: string }): Project {
  return {
    id: project.id ?? uid(),
    name: project.name ?? "",
    description: project.description ?? "",
    notionUrl: project.notionUrl || undefined,
    owner: project.owner ?? "",
    pmId: project.pmId || undefined,
    teamId: project.teamId || undefined,
    memberIds: project.memberIds ?? [],
    phase: normalizePhase(project.phase, project.status ?? "active"),
    startDate: project.startDate ?? "",
    targetDate: project.targetDate ?? "",
    uatStartDate: project.uatStartDate || undefined,
    uatEndDate: project.uatEndDate || undefined,
    currentStageId: project.currentStageId || undefined,
    stages: (project.stages ?? []).map((stage) => ({
      id: stage.id,
      label: stage.label,
      color: stage.color || undefined,
      startDate: stage.startDate || undefined,
      endDate: stage.endDate || undefined,
    })),
    priority: project.priority ?? "medium",
    status: project.status ?? "active",
    isDraft: project.isDraft ?? false,
    tags: project.tags ?? [],
    modules: (project.modules ?? []).map((module) => normalizeModule(module)),
    risks: (project.risks ?? []).map((risk) => normalizeRisk(risk)),
    createdAt: project.createdAt ?? Date.now(),
  };
}

export function normalizeProjects(
  projects: Array<Partial<Project> & { phase?: string }>,
): Project[] {
  return projects.map((project) => normalizeProject(project));
}

// Heuristic: a PM is "available" if active projects <= 2 and remaining effort <= 40d and no delayed projects.
export function ownerCapacity(load: OwnerLoad): { canTakeMore: boolean; reason: string } {
  if (load.activeProjects === 0) return { canTakeMore: true, reason: "No active projects" };
  if (load.health === "delayed") return { canTakeMore: false, reason: "Has delayed projects" };
  if (load.activeProjects >= 4) return { canTakeMore: false, reason: "4+ active projects" };
  if (load.remainingDays > 60)
    return { canTakeMore: false, reason: `${load.remainingDays}d backlog` };
  if (load.activeProjects <= 2 && load.remainingDays <= 30 && load.openRisks <= 1)
    return { canTakeMore: true, reason: "Light workload" };
  return { canTakeMore: true, reason: "Moderate workload — can take small project" };
}

export function summarizeOwners(projects: Project[]): OwnerLoad[] {
  const map = new Map<string, OwnerLoad>();
  for (const p of projects) {
    const owner = p.owner?.trim() || "Unassigned";
    if (!map.has(owner)) {
      map.set(owner, {
        owner,
        activeProjects: 0,
        remainingDays: 0,
        openRisks: 0,
        health: "on_track",
        projects: [],
      });
    }
    const o = map.get(owner)!;
    o.projects.push(p);
    const h = projectHealth(p);
    if (h !== "completed") {
      o.activeProjects += 1;
      o.remainingDays += remainingEffortDays(p);
    }
    o.openRisks += p.risks.filter((r) => !r.resolved).length;
    // worst health wins
    const rank: Record<Health, number> = {
      completed: 0,
      unknown: 1,
      on_track: 2,
      at_risk: 3,
      delayed: 4,
    };
    if (rank[h] > rank[o.health]) o.health = h;
  }
  return Array.from(map.values()).sort((a, b) => b.activeProjects - a.activeProjects);
}

const LEGACY_KEY = "ppt:projects:v1";

export function loadLegacyProjects(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Array<Partial<Project> & { phase?: string }>;
    return normalizeProjects(arr).map((project) => ({
      ...project,
      phase: normalizePhase(project.phase, project.status),
      status: project.status ?? "active",
      tags: project.tags ?? [],
      memberIds: project.memberIds ?? [],
      risks: project.risks ?? [],
      modules: project.modules ?? [],
    }));
  } catch {
    return [];
  }
}
