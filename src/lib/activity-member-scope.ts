export function addActivityMemberForProject<T extends {
  key: string;
  groupKey?: string;
  scopeProjectIds?: string[];
}>(rows: T[], key: string, projectId: string, create: () => T) {
  if (rows.some((row) => row.key === key && (!row.scopeProjectIds?.length || row.scopeProjectIds.includes(projectId)))) return;
  const candidate = create();
  const existingGroupRow = rows.find((row) => row.key === key && row.groupKey === candidate.groupKey);
  if (existingGroupRow) {
    existingGroupRow.scopeProjectIds ??= [];
    existingGroupRow.scopeProjectIds.push(projectId);
    return;
  }
  rows.push(candidate);
}

export function mergeActivityMembers<T extends {
  key: string;
  groupKey?: string;
  teamName?: string;
  pmName?: string;
  scopeProjectIds?: string[];
}>(rows: T[]): T[] {
  const people = new Map<string, T>();
  for (const row of rows) {
    const existing = people.get(row.key);
    if (!existing) {
      people.set(row.key, { ...row, scopeProjectIds: row.scopeProjectIds && [...row.scopeProjectIds] });
      continue;
    }
    if (existing.scopeProjectIds && row.scopeProjectIds) {
      existing.scopeProjectIds = [...new Set([...existing.scopeProjectIds, ...row.scopeProjectIds])];
    } else {
      existing.scopeProjectIds = undefined;
    }
    if (existing.groupKey !== row.groupKey) {
      existing.groupKey = "activity:across-teams";
      existing.teamName = "Across teams";
    }
    if (existing.pmName !== row.pmName) existing.pmName = "Across project managers";
  }
  return [...people.values()];
}
