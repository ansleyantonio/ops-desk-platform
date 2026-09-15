import { createFileRoute, Link } from "@tanstack/react-router";
import { FolderKanban, UserRound, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { TeamsPanel } from "@/components/tracker/TeamsPanel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { enumParam, useUrlParam } from "@/hooks/use-url-state";
import {
  deleteProjectTeam,
  deleteTeamMember,
  listProjects,
  listTeamData,
  saveProject,
  saveProjectTeam,
  saveTeamMember,
} from "@/lib/project.functions";
import { projectHealth, projectProgress } from "@/lib/tracker-types";
import type { Project, ProjectTeam, TeamMember, TeamRole } from "@/lib/tracker-types";
import { cn } from "@/lib/utils";

type DeleteTarget =
  | { type: "member"; id: string; name: string }
  | { type: "team"; id: string; name: string };

export const Route = createFileRoute("/teams")({
  head: () => ({
    meta: [
      { title: "Team Structure | OpsDesk" },
      {
        name: "description",
        content: "View PM, developer, and QA team structures across all project teams.",
      },
    ],
  }),
  component: TeamsHierarchyPage,
});

function TeamsHierarchyPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [teams, setTeams] = useState<ProjectTeam[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [savingProjectId, setSavingProjectId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [section, setSection] = useUrlParam(
    "section",
    enumParam(["people", "teams", "coverage"] as const, "people"),
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [teamData, projectData] = await Promise.all([listTeamData(), listProjects()]);
        if (cancelled) return;
        setMembers(teamData.members);
        setTeams(teamData.teams);
        setProjects(projectData);
      } catch (error) {
        console.error("Failed to load team hierarchy", error);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const pmOwnedProjects = useMemo(() => {
    const teamPmById = new Map(teams.map((team) => [team.id, team.pmId]));
    const map = new Map<string, Project[]>();

    for (const project of projects) {
      const effectivePmId =
        project.pmId ?? (project.teamId ? teamPmById.get(project.teamId) : undefined);
      if (!effectivePmId) continue;
      const list = map.get(effectivePmId) ?? [];
      list.push(project);
      map.set(effectivePmId, list);
    }

    return map;
  }, [projects, teams]);
  const managedTeamsByPm = useMemo(() => {
    const map = new Map<string, ProjectTeam[]>();
    for (const team of teams) {
      if (!team.pmId) continue;
      const list = map.get(team.pmId) ?? [];
      list.push(team);
      map.set(team.pmId, list);
    }
    return map;
  }, [teams]);

  const handleProjectPmChange = async (project: Project, nextPmId: string) => {
    const resolvedPmId = nextPmId === "none" ? undefined : nextPmId;
    const selectedPm = resolvedPmId
      ? members.find((member) => member.id === resolvedPmId && member.role === "pm")
      : undefined;
    const updatedProject: Project = {
      ...project,
      pmId: resolvedPmId,
      owner: selectedPm?.name ?? project.owner,
    };

    setSavingProjectId(project.id);
    setProjects((current) =>
      current.map((item) => (item.id === project.id ? updatedProject : item)),
    );

    try {
      await saveProject({ data: updatedProject });
    } catch (error) {
      console.error("Failed to update project PM", error);
      setProjects((current) => current.map((item) => (item.id === project.id ? project : item)));
    } finally {
      setSavingProjectId((current) => (current === project.id ? null : current));
    }
  };

  const upsertMember = (member: TeamMember) => {
    setMembers((arr) => [member, ...arr.filter((item) => item.id !== member.id)]);
    void saveTeamMember({ data: member }).catch((error) => {
      console.error("Failed to save team member", error);
    });
  };

  const removeMember = (id: string) => {
    setMembers((arr) =>
      arr
        .filter((member) => member.id !== id)
        .map((member) => (member.managerId === id ? { ...member, managerId: undefined } : member)),
    );
    setTeams((arr) =>
      arr.map((team) => ({
        ...team,
        pmId: team.pmId === id ? undefined : team.pmId,
        devIds: team.devIds.filter((memberId) => memberId !== id),
        qaIds: team.qaIds.filter((memberId) => memberId !== id),
      })),
    );
    setProjects((arr) =>
      arr.map((project) => (project.pmId === id ? { ...project, pmId: undefined } : project)),
    );
    void deleteTeamMember({ data: { id } }).catch((error) => {
      console.error("Failed to delete team member", error);
    });
  };

  const upsertTeam = (team: ProjectTeam) => {
    setTeams((arr) => [team, ...arr.filter((item) => item.id !== team.id)]);
    void saveProjectTeam({ data: team }).catch((error) => {
      console.error("Failed to save project team", error);
    });
  };

  const removeTeam = (id: string) => {
    setTeams((arr) => arr.filter((team) => team.id !== id));
    setProjects((arr) =>
      arr.map((project) => (project.teamId === id ? { ...project, teamId: undefined } : project)),
    );
    void deleteProjectTeam({ data: { id } }).catch((error) => {
      console.error("Failed to delete project team", error);
    });
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === "member") removeMember(deleteTarget.id);
    if (deleteTarget.type === "team") removeTeam(deleteTarget.id);
    setDeleteTarget(null);
  };

  return (
    <div className="mx-auto max-w-[1400px]">
      <section className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-[1.7rem]">
            People & organisation
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage people, organise internal teams, and review PM ownership in separate workspaces.
          </p>
        </div>
        <Button asChild variant="outline" className="self-start">
          <Link to="/">
            <FolderKanban className="h-4 w-4" />
            Dashboard
          </Link>
        </Button>
      </section>

      <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryTile label="Teams" value={teams.length} icon={<UsersRound className="h-4 w-4" />} />
        <SummaryTile
          label="People"
          value={members.length}
          icon={<UserRound className="h-4 w-4" />}
        />
        <SummaryTile
          label="Project managers"
          value={members.filter((member) => member.role === "pm").length}
          icon={<FolderKanban className="h-4 w-4" />}
        />
      </section>

      {!loaded ? (
        <HierarchySkeleton />
      ) : (
        <Tabs
          value={section}
          onValueChange={(value) => setSection(value as typeof section)}
          className="space-y-4"
        >
          <div className="rounded-lg border border-border bg-card p-2">
            <TabsList className="grid h-auto w-full grid-cols-1 gap-1 bg-transparent p-0 sm:grid-cols-3">
              <TabsTrigger
                value="people"
                className="min-h-11 justify-start rounded-md px-4 text-left"
              >
                <span>
                  <span className="block text-sm font-semibold">People</span>
                  <span className="block text-[10px] font-normal text-muted-foreground">
                    Add and manage individuals
                  </span>
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="teams"
                className="min-h-11 justify-start rounded-md px-4 text-left"
              >
                <span>
                  <span className="block text-sm font-semibold">Teams</span>
                  <span className="block text-[10px] font-normal text-muted-foreground">
                    Organise internal groups
                  </span>
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="coverage"
                className="min-h-11 justify-start rounded-md px-4 text-left"
              >
                <span>
                  <span className="block text-sm font-semibold">PM coverage</span>
                  <span className="block text-[10px] font-normal text-muted-foreground">
                    Review project ownership
                  </span>
                </span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="people" className="mt-0">
            <TeamsPanel
              mode="people"
              members={members}
              teams={teams}
              onSaveMember={upsertMember}
              onDeleteMember={(id) => {
                const member = members.find((item) => item.id === id);
                setDeleteTarget({
                  type: "member",
                  id,
                  name: member?.name ?? "this team member",
                });
              }}
              onSaveTeam={upsertTeam}
              onDeleteTeam={(id) => {
                const team = teams.find((item) => item.id === id);
                setDeleteTarget({ type: "team", id, name: team?.name ?? "this team" });
              }}
            />
          </TabsContent>

          <TabsContent value="teams" className="mt-0 space-y-4">
            <TeamsPanel
              mode="teams"
              members={members}
              teams={teams}
              onSaveMember={upsertMember}
              onDeleteMember={(id) => {
                const member = members.find((item) => item.id === id);
                setDeleteTarget({
                  type: "member",
                  id,
                  name: member?.name ?? "this team member",
                });
              }}
              onSaveTeam={upsertTeam}
              onDeleteTeam={(id) => {
                const team = teams.find((item) => item.id === id);
                setDeleteTarget({ type: "team", id, name: team?.name ?? "this team" });
              }}
            />
            {teams.length === 0 ? <EmptyHierarchy /> : null}
          </TabsContent>

          <TabsContent value="coverage" className="mt-0">
            <PmCoverage
              members={members}
              projectsByPm={pmOwnedProjects}
              teamsByPm={managedTeamsByPm}
              savingProjectId={savingProjectId}
              onProjectPmChange={handleProjectPmChange}
            />
          </TabsContent>
        </Tabs>
      )}
      <DeleteConfirmDialog
        target={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function DeleteConfirmDialog({
  onCancel,
  onConfirm,
  target,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  target: DeleteTarget | null;
}) {
  if (!target) return null;

  const title = target.type === "member" ? `Remove ${target.name}?` : `Delete ${target.name}?`;
  const description =
    target.type === "member"
      ? "This will remove the person and clear them from team assignments and PM ownership."
      : "This will delete the team and clear it from any linked projects.";

  return (
    <AlertDialog open onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent className="rounded-[1.6rem]">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PmCoverage({
  members,
  projectsByPm,
  teamsByPm,
  savingProjectId,
  onProjectPmChange,
}: {
  members: TeamMember[];
  projectsByPm: Map<string, Project[]>;
  teamsByPm: Map<string, ProjectTeam[]>;
  savingProjectId: string | null;
  onProjectPmChange: (project: Project, nextPmId: string) => void;
}) {
  const pms = members.filter((member) => member.role === "pm");
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [dropTargetPmId, setDropTargetPmId] = useState<string | null>(null);

  if (pms.length === 0) return null;

  const projects = [...projectsByPm.values()].flat();
  const draggedProject = draggedProjectId
    ? (projects.find((project) => project.id === draggedProjectId) ?? null)
    : null;

  return (
    <section className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">PM coverage</h2>
          <p className="text-xs text-muted-foreground">
            PMs can lead multiple teams; each card shows their current project load.
          </p>
        </div>
        <Badge variant="outline">{pms.length} PMs</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {pms.map((pm) => {
          const teams = teamsByPm.get(pm.id) ?? [];
          const assignedProjects = projectsByPm.get(pm.id) ?? [];
          const isDropTarget = dropTargetPmId === pm.id;
          return (
            <div
              key={pm.id}
              className={cn(
                "rounded-lg border border-border/70 bg-background px-3 py-3 transition-colors",
                isDropTarget && "border-primary bg-primary/5",
              )}
              onDragOver={(event) => {
                if (!draggedProject) return;
                event.preventDefault();
                if (dropTargetPmId !== pm.id) setDropTargetPmId(pm.id);
              }}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                if (dropTargetPmId === pm.id) setDropTargetPmId(null);
              }}
              onDrop={() => {
                if (!draggedProject) return;
                setDropTargetPmId(null);
                setDraggedProjectId(null);
                if (draggedProject.pmId === pm.id) return;
                onProjectPmChange(draggedProject, pm.id);
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{pm.name}</div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {pm.title ?? "Project manager"}
                  </div>
                </div>
                <Badge variant="outline" className={cn("shrink-0", roleTone.pm)}>
                  {teams.length} teams · {assignedProjects.length} projects
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {teams.length === 0 ? (
                  <span className="text-xs text-muted-foreground">No teams assigned</span>
                ) : (
                  teams.map((team) => (
                    <Badge key={team.id} variant="outline" className="bg-card">
                      {team.name}
                    </Badge>
                  ))
                )}
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <FolderKanban className="h-3.5 w-3.5" />
                  Assigned projects
                </div>
                {isDropTarget ? (
                  <div className="rounded-md border border-dashed border-primary/40 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary">
                    Drop here to assign to {pm.name}
                  </div>
                ) : null}
                {assignedProjects.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No projects assigned via these teams.
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {assignedProjects.map((project) => (
                      <ProjectProgressCard
                        key={project.id}
                        project={project}
                        saving={savingProjectId === project.id}
                        isDragging={draggedProjectId === project.id}
                        onDragStart={() => {
                          setDraggedProjectId(project.id);
                          setDropTargetPmId(null);
                        }}
                        onDragEnd={() => {
                          setDraggedProjectId(null);
                          setDropTargetPmId(null);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ProjectProgressCard({
  project,
  saving,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  project: Project;
  saving: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const progress = projectProgress(project);
  const health = projectHealth(project);

  return (
    <div
      draggable={!saving}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "cursor-grab rounded-lg border border-border/70 bg-card px-3 py-2 active:cursor-grabbing",
        saving && "cursor-progress opacity-70",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{project.name}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {project.status.replace("_", " ")} · {progress.modulePct}% ticket · {progress.uatPct}%
            review
          </div>
        </div>
        <Badge variant="outline" className={cn("shrink-0 capitalize", healthTone[health])}>
          {health.replace("_", " ")}
        </Badge>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", healthFill[health])}
          style={{ width: `${progress.overall}%` }}
        />
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground">
        {saving ? "Updating PM assignment..." : "Drag this card onto another PM"}
      </div>
      <div className="mt-1 text-right text-[11px] font-medium text-foreground tabular-nums">
        {progress.overall}% complete
      </div>
    </div>
  );
}

function SummaryTile({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {value}
          </div>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
      </div>
    </div>
  );
}

function EmptyHierarchy() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <UsersRound className="h-4 w-4" />
      </div>
      <h2 className="text-base font-semibold text-foreground">No teams created yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        Create PMs, developers, QA, and project teams from the dashboard Teams section, then this
        page will show the full tree.
      </p>
      <Button asChild className="mt-5">
        <Link to="/">Go to dashboard</Link>
      </Button>
    </div>
  );
}

function HierarchySkeleton() {
  return (
    <div className="space-y-5">
      {Array.from({ length: 2 }).map((_, index) => (
        <div key={index} className="rounded-lg border border-border bg-card p-4">
          <Skeleton className="h-5 w-48" />
          <div className="mt-5 flex justify-center">
            <Skeleton className="h-20 w-64" />
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

const roleLabel: Record<TeamRole, string> = {
  pm: "PM",
  dev: "Dev",
  qa: "QA",
};

const roleTone: Record<TeamRole, string> = {
  pm: "border-primary/20 bg-primary/10 text-primary",
  dev: "border-info/20 bg-info/10 text-info",
  qa: "border-success/20 bg-success/10 text-success",
};

const healthTone = {
  on_track: "border-success/20 bg-success/10 text-success",
  at_risk: "border-warning/30 bg-warning/15 text-warning-foreground",
  delayed: "border-destructive/20 bg-destructive/10 text-destructive",
  completed: "border-info/20 bg-info/10 text-info",
  unknown: "border-border bg-muted text-muted-foreground",
};

const healthFill = {
  on_track: "bg-success",
  at_risk: "bg-warning",
  delayed: "bg-destructive",
  completed: "bg-info",
  unknown: "bg-muted-foreground",
};
