export const RECOVERY_STATUSES = ["green", "amber", "red"] as const;
export type RecoveryStatus = (typeof RECOVERY_STATUSES)[number];

export const ROOT_CAUSES = [
  { value: "developer_performance", label: "Developer performance" },
  { value: "estimate_incorrect", label: "Estimate incorrect" },
  { value: "requirement_changed", label: "Requirement changed" },
  { value: "technical_complexity", label: "Technical complexity" },
  { value: "dependency_blocker", label: "Dependency/blocker" },
  { value: "resource_reassignment", label: "Resource reassignment" },
  { value: "qa_issue", label: "QA issue" },
  { value: "pm_planning", label: "PM planning" },
  { value: "stakeholder_delay", label: "Stakeholder delay" },
  { value: "infrastructure", label: "Infrastructure" },
  { value: "other", label: "Other" },
] as const;

export type RecoveryRootCause = (typeof ROOT_CAUSES)[number]["value"];

export const ROOT_CAUSE_VALUES = ROOT_CAUSES.map((cause) => cause.value) as [
  RecoveryRootCause,
  ...RecoveryRootCause[],
];

export const ROOT_CAUSE_LABELS = Object.fromEntries(
  ROOT_CAUSES.map((cause) => [cause.value, cause.label]),
) as Record<RecoveryRootCause, string>;

export interface RecoveryTask {
  id: string;
  projectId: string;
  taskId: string;
  ownerId?: string;
  pmId?: string;
  techLeadId?: string;
  originalEstimateDays?: number;
  committedCompletionDate?: string;
  actualCompletionDate?: string;
  qaRejectionCount: number;
  scopeChanged: boolean;
  blockerRaisedDate?: string;
  resourceReassigned: boolean;
  rootCause?: RecoveryRootCause;
  status: RecoveryStatus;
  createdAt: number;
  updatedAt: number;
}

export function recoveryCommitmentNewestFirst(
  left: RecoveryTask,
  right: RecoveryTask,
) {
  return (
    right.updatedAt - left.updatedAt ||
    (right.committedCompletionDate ?? "").localeCompare(
      left.committedCompletionDate ?? "",
    ) ||
    right.createdAt - left.createdAt ||
    left.id.localeCompare(right.id)
  );
}

export interface RecoveryProjectMode {
  projectId: string;
  active: boolean;
  reason?: string;
  enabledBy?: string;
  enabledAt: number;
  disabledBy?: string;
  disabledAt?: number;
  updatedAt: number;
}

export interface RecoveryEvent {
  id: string;
  projectId: string;
  taskId?: string;
  eventType: string;
  actorId?: string;
  actorName?: string;
  details?: string;
  createdAt: number;
}

export type RecoverySummary = {
  totalCommitted: number;
  missingDeadlines: number;
  completedOnTime: number;
  missedDeadlines: number;
  qaRejectedTasks: number;
  qaRejectionRate: number;
  scopeChanges: number;
  resourceReassignments: number;
  rootCauseCounts: Record<RecoveryRootCause, number>;
};

export function recoverySummary(
  tasks: RecoveryTask[],
  today = new Date().toISOString().slice(0, 10),
): RecoverySummary {
  const rootCauseCounts = Object.fromEntries(
    ROOT_CAUSES.map((cause) => [cause.value, 0]),
  ) as Record<RecoveryRootCause, number>;

  for (const task of tasks) {
    if (task.rootCause) rootCauseCounts[task.rootCause] += 1;
  }

  const completedOnTime = tasks.filter(
    (task) =>
      Boolean(task.committedCompletionDate) &&
      Boolean(task.actualCompletionDate) &&
      task.actualCompletionDate! <= task.committedCompletionDate!,
  ).length;
  const missedDeadlines = tasks.filter(
    (task) =>
      Boolean(task.committedCompletionDate) &&
      ((Boolean(task.actualCompletionDate) &&
        task.actualCompletionDate! > task.committedCompletionDate!) ||
        (!task.actualCompletionDate && task.committedCompletionDate! < today)),
  ).length;
  const qaRejectedTasks = tasks.filter(
    (task) => task.qaRejectionCount > 0,
  ).length;

  return {
    totalCommitted: tasks.length,
    missingDeadlines: tasks.filter((task) => !task.committedCompletionDate)
      .length,
    completedOnTime,
    missedDeadlines,
    qaRejectedTasks,
    qaRejectionRate: tasks.length
      ? Math.round((qaRejectedTasks / tasks.length) * 100)
      : 0,
    scopeChanges: tasks.filter((task) => task.scopeChanged).length,
    resourceReassignments: tasks.filter((task) => task.resourceReassigned)
      .length,
    rootCauseCounts,
  };
}
