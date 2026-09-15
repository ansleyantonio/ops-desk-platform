import { createFileRoute, Link } from "@tanstack/react-router";
import {
  FolderKanban,
  GitBranch,
  GripVertical,
  LayoutGrid,
  ShieldCheck,
  UserPlus,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TreeCustomizer } from "@/components/team-map/TreeCustomizer";
import { enumParam, stringListParam, useUrlParam } from "@/hooks/use-url-state";
import { hasPermission } from "@/lib/auth";
import {
  assignDeveloperToProject,
  listProjects,
  listTeamData,
} from "@/lib/project.functions";
import {
  createInitialTeamMapTreeConfig,
  mergeLiveProjectsIntoTreeConfig,
  type TeamMapTreeConfig,
  type TeamMapTreeProject,
  type TreeCategory,
  type TreeProjectPerson,
} from "@/lib/team-map-config";
import { getTeamMapTreeConfig, saveTeamMapTreeConfig } from "@/lib/team-map-config.functions";
import { PROJECT_TAGS, phaseLabel, projectTagLabel } from "@/lib/tracker-types";
import type { Project, ProjectTag, ProjectTeam, TeamMember, TeamRole } from "@/lib/tracker-types";
import { cn } from "@/lib/utils";

const PEN_TICKETING_TITLE = "PEN ticketing assignee";

export const Route = createFileRoute("/team-map")({
  head: () => ({
    meta: [
      { title: "Team Map | OpsDesk" },
      {
        name: "description",
        content: "See who reports to each PM and which delivery teams and projects they cover.",
      },
    ],
  }),
  component: TeamMapPage,
});

function displayMemberSubtitle(member: TeamMember) {
  if (member.title && member.title !== PEN_TICKETING_TITLE) {
    return member.title;
  }
  return roleLabel[member.role];
}

function TeamMapPage() {
  const { currentUser } = Route.useRouteContext();
  const canAssignDevelopers = hasPermission(currentUser, "projects:manage");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [teams, setTeams] = useState<ProjectTeam[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [savedTreeConfig, setSavedTreeConfig] = useState<TeamMapTreeConfig | null>(null);
  const [mapMode, setMapMode] = useUrlParam(
    "mode",
    enumParam(["pm", "projects"] as const, "pm"),
  );
  const [tagParams, setTagParams] = useUrlParam("tags", stringListParam());
  const selectedProjectTags = tagParams.filter((tag): tag is ProjectTag =>
    PROJECT_TAGS.includes(tag as ProjectTag),
  );
  const setSelectedProjectTags = (tags: ProjectTag[]) => setTagParams(tags);
  const [viewMode, setViewMode] = useUrlParam(
    "view",
    enumParam(["cards", "tree"] as const, "cards"),
  );
  const [draggedDeveloperId, setDraggedDeveloperId] = useState<string | null>(null);
  const [dropProjectId, setDropProjectId] = useState<string | null>(null);
  const [savingProjectId, setSavingProjectId] = useState<string | null>(null);
  const [assignmentNotice, setAssignmentNotice] = useState<{
    tone: "error" | "success";
    message: string;
  } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [teamData, projectData, treeConfig] = await Promise.all([
          listTeamData(),
          listProjects(),
          getTeamMapTreeConfig(),
        ]);
        if (cancelled) return;
        setMembers(teamData.members);
        setTeams(teamData.teams);
        setProjects(projectData);
        setSavedTreeConfig(treeConfig);
      } catch (error) {
        console.error("Failed to load team map", error);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const memberById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members],
  );
  const pms = useMemo(() => members.filter((member) => member.role === "pm"), [members]);
  const developers = useMemo(
    () =>
      members
        .filter((member) => member.role === "dev")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [members],
  );
  const projectCards = useMemo(
    () => buildProjectMapCards(projects, members, teams),
    [members, projects, teams],
  );

  const pmCards = useMemo(() => {
    return pms.map((pm) => {
      const directReports = members.filter(
        (member) => member.role !== "pm" && member.managerId === pm.id,
      );
      const pmTeams = teams.filter((team) => team.pmId === pm.id);
      const teamMemberMap = new Map<string, TeamMember>();

      for (const team of pmTeams) {
        for (const memberId of [...team.devIds, ...team.qaIds]) {
          const member = memberById.get(memberId);
          if (member) teamMemberMap.set(member.id, member);
        }
      }

      const teamMembers = [...teamMemberMap.values()].sort((a, b) => a.name.localeCompare(b.name));
      const assignedProjects = projectCards.filter((card) => card.pm?.id === pm.id);

      return {
        pm,
        directReports,
        pmTeams,
        teamMembers,
        assignedProjects,
      };
    });
  }, [memberById, members, pms, projectCards, teams]);

  const treeProjectSeeds = useMemo(
    () =>
      projectCards.map(({ project, developers, qaMembers }) => ({
        id: project.id,
        name: project.name,
        category: (project.tags[0] ?? "untagged") as TreeCategory,
        people: [...developers, ...qaMembers].map((member) => ({
          id: member.id,
          name: member.name,
          role: member.role as "dev" | "qa",
        })),
      })),
    [projectCards],
  );
  const treeConfig = useMemo(() => {
    const base = savedTreeConfig ?? createInitialTeamMapTreeConfig(treeProjectSeeds);
    return mergeLiveProjectsIntoTreeConfig(base, treeProjectSeeds);
  }, [savedTreeConfig, treeProjectSeeds]);

  const persistTreeConfig = async (nextConfig: TeamMapTreeConfig) => {
    const saved = await saveTeamMapTreeConfig({ data: nextConfig });
    setSavedTreeConfig(saved);
  };

  const filteredProjectCards = useMemo(
    () =>
      selectedProjectTags.length === 0
        ? projectCards
        : projectCards.filter(({ project }) =>
            selectedProjectTags.some((tag) => project.tags.includes(tag)),
          ),
    [projectCards, selectedProjectTags],
  );

  const unassignedMembers = useMemo(() => {
    const coveredMemberIds = new Set<string>();
    for (const card of pmCards) {
      for (const member of [...card.directReports, ...card.teamMembers]) {
        coveredMemberIds.add(member.id);
      }
    }

    return members
      .filter((member) => member.role !== "pm" && !coveredMemberIds.has(member.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [members, pmCards]);

  const draggedDeveloper = draggedDeveloperId
    ? memberById.get(draggedDeveloperId)
    : undefined;

  const startDeveloperDrag = (event: DragEvent<HTMLButtonElement>, member: TeamMember) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-opsdesk-developer", member.id);
    event.dataTransfer.setData("text/plain", member.id);
    setDraggedDeveloperId(member.id);
    setDropProjectId(null);
    setAssignmentNotice(null);
  };

  const finishDeveloperDrag = () => {
    setDraggedDeveloperId(null);
    setDropProjectId(null);
  };

  const assignDeveloper = async (projectId: string, memberId: string) => {
    const project = projects.find((candidate) => candidate.id === projectId);
    const developer = memberById.get(memberId);
    if (!project || developer?.role !== "dev" || savingProjectId) return;

    if (project.memberIds.includes(memberId)) {
      setAssignmentNotice({
        tone: "success",
        message: `${developer.name} is already directly assigned to ${project.name}.`,
      });
      return;
    }

    setSavingProjectId(projectId);
    setAssignmentNotice(null);
    try {
      await assignDeveloperToProject({ data: { projectId, memberId } });
      setProjects((current) =>
        current.map((candidate) =>
          candidate.id === projectId
            ? { ...candidate, memberIds: [...candidate.memberIds, memberId] }
            : candidate,
        ),
      );
      setAssignmentNotice({
        tone: "success",
        message: `${developer.name} was assigned to ${project.name}.`,
      });
    } catch (error) {
      setAssignmentNotice({
        tone: "error",
        message:
          error instanceof Error ? error.message : "The developer could not be assigned.",
      });
    } finally {
      setSavingProjectId(null);
    }
  };

  const projectAssignment: ProjectAssignmentDnD | undefined = canAssignDevelopers
    ? {
        developerName: draggedDeveloper?.name,
        dropProjectId,
        savingProjectId,
        onDragOver: (event, projectId) => {
          if (!draggedDeveloperId || savingProjectId) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          if (dropProjectId !== projectId) setDropProjectId(projectId);
        },
        onDragLeave: (event, projectId) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          if (dropProjectId === projectId) setDropProjectId(null);
        },
        onDrop: (event, projectId) => {
          event.preventDefault();
          const memberId =
            event.dataTransfer.getData("application/x-opsdesk-developer") ||
            draggedDeveloperId;
          finishDeveloperDrag();
          if (memberId) void assignDeveloper(projectId, memberId);
        },
      }
    : undefined;

  return (
    <div className="mx-auto max-w-[1400px]">
      <section className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-[1.7rem]">
            Team map
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Clear reporting view of who sits under each PM across direct reports, teams, and
            projects.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="self-start">
            <Link to="/teams">
              <UsersRound className="h-4 w-4" />
              Teams
            </Link>
          </Button>
          <Button asChild variant="outline" className="self-start">
            <Link to="/">
              <FolderKanban className="h-4 w-4" />
              Dashboard
            </Link>
          </Button>
        </div>
      </section>

      <section className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <SummaryTile label="PMs" value={pms.length} icon={<UserRound className="h-4 w-4" />} />
        <SummaryTile
          label="Delivery People"
          value={members.filter((member) => member.role !== "pm").length}
          icon={<UsersRound className="h-4 w-4" />}
        />
        <SummaryTile label="Teams" value={teams.length} icon={<GitBranch className="h-4 w-4" />} />
        <SummaryTile
          label="Projects"
          value={projects.length}
          icon={<FolderKanban className="h-4 w-4" />}
        />
      </section>

      {!loaded ? (
        <TeamMapSkeleton />
      ) : (
        <div className="space-y-5">
          <section className="rounded-lg border border-border bg-card px-4 py-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  {mapMode === "pm" ? "PM ownership map" : "Project delivery map"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {mapMode === "pm"
                    ? "Switch between card summaries and a hierarchy tree for PM ownership."
                    : "See every project with contributors linked from project teams and tickets."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {mapMode === "pm"
                    ? `${pmCards.length} PMs mapped`
                    : selectedProjectTags.length
                      ? `${filteredProjectCards.length} of ${projectCards.length} projects`
                      : `${projectCards.length} projects`}
                </Badge>
                <ToggleGroup
                  type="single"
                  value={mapMode}
                  onValueChange={(value) => {
                    if (value === "pm" || value === "projects") setMapMode(value);
                  }}
                  variant="outline"
                  size="sm"
                  className="rounded-lg border border-border bg-background p-1"
                >
                  <ToggleGroupItem value="pm" aria-label="PM map" className="gap-1.5 px-2">
                    <UsersRound className="h-3.5 w-3.5" />
                    PMs
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="projects"
                    aria-label="Project map"
                    className="gap-1.5 px-2"
                  >
                    <FolderKanban className="h-3.5 w-3.5" />
                    Projects
                  </ToggleGroupItem>
                </ToggleGroup>
                {mapMode === "pm" ? (
                  <ToggleGroup
                    type="single"
                    value={viewMode}
                    onValueChange={(value) => {
                      if (value === "cards" || value === "tree") setViewMode(value);
                    }}
                    variant="outline"
                    size="sm"
                    className="rounded-lg border border-border bg-background p-1"
                  >
                    <ToggleGroupItem value="cards" aria-label="Card view" className="gap-1.5 px-2">
                      <LayoutGrid className="h-3.5 w-3.5" />
                      Cards
                    </ToggleGroupItem>
                    <ToggleGroupItem value="tree" aria-label="Tree view" className="gap-1.5 px-2">
                      <GitBranch className="h-3.5 w-3.5" />
                      Tree
                    </ToggleGroupItem>
                  </ToggleGroup>
                ) : null}
              </div>
            </div>
            {canAssignDevelopers ? (
              <DeveloperAssignmentTray
                developers={developers}
                draggedDeveloperId={draggedDeveloperId}
                notice={assignmentNotice}
                onDragEnd={finishDeveloperDrag}
                onDragStart={startDeveloperDrag}
              />
            ) : null}
            {mapMode === "projects" ? (
              <div className="mb-4 flex flex-col gap-2 border-y border-border/70 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Filter by project tag
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Select one or more tags. Projects matching any selected tag are shown.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ToggleGroup
                    type="multiple"
                    value={selectedProjectTags}
                    onValueChange={(values) => setSelectedProjectTags(values as ProjectTag[])}
                    variant="outline"
                    size="sm"
                    className="flex-wrap justify-start rounded-lg border border-border bg-background p-1"
                  >
                    {PROJECT_TAGS.map((tag) => (
                      <ToggleGroupItem
                        key={tag}
                        value={tag}
                        aria-label={`Filter by ${projectTagLabel[tag]}`}
                        className="px-2.5"
                      >
                        {projectTagLabel[tag]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  {selectedProjectTags.length ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedProjectTags([])}
                    >
                      Clear
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {mapMode === "pm" ? (
              viewMode === "cards" ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {pmCards.map(({ pm, directReports, pmTeams, teamMembers, assignedProjects }) => (
                    <div
                      key={pm.id}
                      className="rounded-lg border border-border/70 bg-background px-4 py-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground">{pm.name}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {pm.title ?? "Project manager"}
                          </div>
                        </div>
                        <Badge variant="outline" className={cn("shrink-0", roleTone.pm)}>
                          {assignedProjects.length} projects
                        </Badge>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <MetricPill label="Direct" value={directReports.length} />
                        <MetricPill label="Team" value={teamMembers.length} />
                        <MetricPill label="Teams" value={pmTeams.length} />
                      </div>

                      <MapSection
                        title="Direct reports"
                        emptyLabel="No one reports directly yet"
                        items={directReports.map((member) => ({
                          id: member.id,
                          label: member.name,
                          sublabel: displayMemberSubtitle(member),
                          role: member.role,
                        }))}
                      />

                      <MapSection
                        title="Delivery team members"
                        emptyLabel="No delivery members assigned through PM teams"
                        items={teamMembers.map((member) => ({
                          id: member.id,
                          label: member.name,
                          sublabel: displayMemberSubtitle(member),
                          role: member.role,
                        }))}
                      />

                      <MapSection
                        title="PM teams"
                        emptyLabel="No teams assigned"
                        items={pmTeams.map((team) => ({
                          id: team.id,
                          label: team.name,
                          sublabel: `${team.devIds.length} dev · ${team.qaIds.length} QA`,
                        }))}
                      />

                      <ProjectCoverageSection
                        assignment={projectAssignment}
                        projects={assignedProjects}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-col gap-2 rounded-lg border border-border bg-background px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-xs font-semibold text-foreground">
                        Tree configuration
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        Project layout, joinees, vacancies, and staffing needs are editable here.
                        Linked developers refresh from Teams and ticket assignments.
                      </div>
                    </div>
                    <TreeCustomizer config={treeConfig} onSave={persistTreeConfig} />
                  </div>
                  <FullPenOrgChart
                    assignment={projectAssignment}
                    config={treeConfig}
                    members={members}
                    pms={pms}
                    projectCards={projectCards}
                    teams={teams}
                  />
                </div>
              )
            ) : (
              <>
                {filteredProjectCards.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border px-5 py-10 text-center">
                    <p className="text-sm font-semibold text-foreground">
                      No projects match these tags
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Clear the filters or add the selected tags from a project’s edit dialog.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-4"
                      onClick={() => setSelectedProjectTags([])}
                    >
                      Clear filters
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {filteredProjectCards.map(({ project, pm, developers, qaMembers }) => (
                      <ProjectDropZone
                        assignment={projectAssignment}
                        key={project.id}
                        projectId={project.id}
                        className="rounded-lg border border-border/70 bg-background px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <Link
                              to="/projects/$projectId"
                              params={{ projectId: project.id }}
                              className="text-sm font-semibold text-foreground hover:text-primary hover:underline"
                            >
                              {project.name}
                            </Link>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {phaseLabel(project.phase)} · {project.status.replace("_", " ")}
                            </div>
                          </div>
                        </div>

                        {project.tags.length ? (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {project.tags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-[10px]">
                                {projectTagLabel[tag]}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-3 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
                            Untagged
                          </div>
                        )}

                        <MapSection
                          title="PM owner"
                          emptyLabel="No PM assigned"
                          items={
                            pm
                              ? [
                                  {
                                    id: pm.id,
                                    label: pm.name,
                                    sublabel: displayMemberSubtitle(pm),
                                    role: pm.role,
                                  },
                                ]
                              : []
                          }
                        />

                        <ContributorSection
                          title="Developers"
                          emptyLabel="No developers linked through the project, team, or tickets"
                          contributors={developers}
                        />

                        <ContributorSection
                          title="QA"
                          emptyLabel="No QA linked through the project, team, or tickets"
                          contributors={qaMembers}
                        />
                      </ProjectDropZone>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card px-4 py-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Unmapped people</h2>
                <p className="text-xs text-muted-foreground">
                  Delivery members who are not currently tied to a PM by reporting line or team.
                </p>
              </div>
              <Badge variant="outline">{unassignedMembers.length}</Badge>
            </div>
            {unassignedMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground">Everyone is currently mapped to a PM.</p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {unassignedMembers.map((member) => (
                  <div
                    key={member.id}
                    className="rounded-lg border border-border/70 bg-background px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {member.name}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {displayMemberSubtitle(member)}
                        </div>
                      </div>
                      <Badge variant="outline" className={cn("shrink-0", roleTone[member.role])}>
                        {roleLabel[member.role]}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

type ContributorSource = "project" | "team" | "ticket";

type ProjectContributor = {
  id: string;
  name: string;
  role: "dev" | "qa";
  title?: string;
  sources: ContributorSource[];
  teamNames: string[];
};

type ProjectMapCard = {
  project: Project;
  pm?: TeamMember;
  developers: ProjectContributor[];
  qaMembers: ProjectContributor[];
  teamNames: string[];
};

type ProjectAssignmentDnD = {
  developerName?: string;
  dropProjectId: string | null;
  savingProjectId: string | null;
  onDragOver: (event: DragEvent<HTMLDivElement>, projectId: string) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>, projectId: string) => void;
  onDrop: (event: DragEvent<HTMLDivElement>, projectId: string) => void;
};

type MutableProjectContributor = Omit<ProjectContributor, "sources" | "teamNames"> & {
  sources: Set<ContributorSource>;
  teamNames: Set<string>;
};

function normalizePersonName(value: string) {
  return value.trim().toLocaleLowerCase();
}

function ticketAssigneeId(projectId: string, name: string) {
  const key = normalizePersonName(name).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `ticket-assignee-${projectId}-${key || "unknown"}`;
}

function buildProjectMapCards(
  projects: Project[],
  members: TeamMember[],
  teams: ProjectTeam[],
): ProjectMapCard[] {
  const memberById = new Map(members.map((member) => [member.id, member]));
  const memberByName = new Map(
    members.map((member) => [normalizePersonName(member.name), member]),
  );
  const pmByName = new Map(
    members
      .filter((member) => member.role === "pm")
      .map((member) => [normalizePersonName(member.name), member]),
  );
  const teamById = new Map(teams.map((team) => [team.id, team]));

  return projects
    .map((project) => {
      const selectedTeam = project.teamId ? teamById.get(project.teamId) : undefined;
      const pmId =
        project.pmId ??
        selectedTeam?.pmId ??
        pmByName.get(normalizePersonName(project.owner || ""))?.id;
      const pm = pmId ? memberById.get(pmId) : undefined;
      const relatedTeams = selectedTeam
        ? [selectedTeam]
        : pmId
          ? teams.filter((team) => team.pmId === pmId)
          : [];
      const contributors = new Map<string, MutableProjectContributor>();

      const ensureContributor = ({
        member,
        name,
        role,
        source,
        teamName,
      }: {
        member?: TeamMember;
        name?: string;
        role?: "dev" | "qa";
        source: ContributorSource;
        teamName?: string;
      }) => {
        const displayName = member?.name ?? name?.trim();
        const resolvedRole =
          member?.role === "dev" || member?.role === "qa" ? member.role : role;
        if (!displayName || !resolvedRole) return undefined;

        const key = normalizePersonName(displayName);
        const existing = contributors.get(key);
        if (existing) {
          existing.sources.add(source);
          if (teamName) existing.teamNames.add(teamName);
          return existing;
        }

        const contributor: MutableProjectContributor = {
          id: member?.id ?? ticketAssigneeId(project.id, displayName),
          name: displayName,
          role: resolvedRole,
          title: member?.title,
          sources: new Set([source]),
          teamNames: new Set(teamName ? [teamName] : []),
        };
        contributors.set(key, contributor);
        return contributor;
      };

      for (const memberId of project.memberIds) {
        const member = memberById.get(memberId);
        if (member?.role === "dev" || member?.role === "qa") {
          ensureContributor({ member, source: "project" });
        }
      }

      for (const team of relatedTeams) {
        for (const memberId of team.devIds) {
          ensureContributor({
            member: memberById.get(memberId),
            role: "dev",
            source: "team",
            teamName: team.name,
          });
        }
        for (const memberId of team.qaIds) {
          ensureContributor({
            member: memberById.get(memberId),
            role: "qa",
            source: "team",
            teamName: team.name,
          });
        }
      }

      for (const ticket of project.modules) {
        const assigneeName = ticket.assignee?.trim();
        if (!assigneeName) continue;
        const member = memberByName.get(normalizePersonName(assigneeName));
        if (member?.role === "pm") continue;
        const contributor = ensureContributor({
          member,
          name: assigneeName,
          role: member?.role === "qa" ? "qa" : "dev",
          source: "ticket",
        });
        if (!contributor) continue;
      }

      const resolvedContributors = [...contributors.values()]
        .map((contributor): ProjectContributor => ({
          ...contributor,
          sources: [...contributor.sources],
          teamNames: [...contributor.teamNames].sort((a, b) => a.localeCompare(b)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return {
        project,
        pm,
        developers: resolvedContributors.filter((contributor) => contributor.role === "dev"),
        qaMembers: resolvedContributors.filter((contributor) => contributor.role === "qa"),
        teamNames: relatedTeams.map((team) => team.name).sort((a, b) => a.localeCompare(b)),
      };
    })
    .sort((a, b) => a.project.name.localeCompare(b.project.name));
}

function FullPenOrgChart({
  assignment,
  config,
  members,
  pms,
  projectCards,
  teams,
}: {
  assignment?: ProjectAssignmentDnD;
  config: TeamMapTreeConfig;
  members: TeamMember[];
  pms: TeamMember[];
  projectCards: ProjectMapCard[];
  teams: ProjectTeam[];
}) {
  const sourceById = new Map(projectCards.map((card) => [card.project.id, card]));
  const configuredProjects: ConfiguredTreeProject[] = config.projects
    .filter((project) => !project.hidden)
    .map((treeProject) => ({
      treeProject,
      source: treeProject.sourceProjectId ? sourceById.get(treeProject.sourceProjectId) : undefined,
    }));
  const categoryColumns = PROJECT_TAGS.map((tag) => {
    const taggedProjects = configuredProjects.filter((card) => card.treeProject.category === tag);
    return {
      id: tag,
      name: projectTagLabel[tag],
      leadNames: [
        ...new Set(
          taggedProjects
            .map((card) => card.source?.pm?.name)
            .filter((name): name is string => Boolean(name)),
        ),
      ],
      projects: taggedProjects,
    };
  });
  const untaggedProjects = configuredProjects.filter(
    (card) => card.treeProject.category === "untagged",
  );
  const deliveryColumns = [
    ...categoryColumns,
    ...(untaggedProjects.length
      ? [
          {
            id: "untagged-projects",
            name: "Untagged",
            leadNames: [],
            projects: untaggedProjects,
          },
        ]
      : []),
  ];
  const chartWidth = Math.max(1320, deliveryColumns.length * 236);
  const roleCounts = {
    pm: pms.length,
    dev: members.filter((member) => member.role === "dev").length,
    qa: members.filter((member) => member.role === "qa").length,
  };
  const newJoineeCount = configuredProjects.reduce(
    (sum, card) =>
      sum + card.treeProject.people.filter((person) => person.status === "new_joinee").length,
    0,
  );
  const moreNeededCount = configuredProjects.reduce(
    (sum, card) =>
      sum +
      card.treeProject.requirements.dev +
      card.treeProject.requirements.qa +
      card.treeProject.requirements.support,
    0,
  );

  return (
    <div className="rounded-[14px] border border-[#dce6ee] bg-[#f4f7fa] text-[#1b2c3e]">
      <div className="flex flex-col gap-4 rounded-t-[13px] bg-[linear-gradient(105deg,#12385f,#1f5488)] px-5 py-5 text-white shadow-[0_6px_20px_rgba(18,56,95,0.18)] sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div className="flex items-center gap-3.5">
          <PenMark />
          <div className="border-l border-white/30 pl-3.5 leading-none">
            <div className="text-lg font-bold tracking-[0.08em]">PEN</div>
            <div className="mt-1 text-lg font-semibold tracking-[0.08em] text-[#dce6f0]">GROUP</div>
          </div>
        </div>
        <div className="sm:text-right">
          <div className="text-lg font-semibold">Software Engineering</div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#d4b63e]">
            Live organisation structure
          </div>
        </div>
      </div>

      <div className="px-4 pb-8 pt-6 sm:px-6">
        <div>
          <h3 className="text-xl font-semibold text-[#12385f]">Organisation Structure</h3>
          <div className="mt-2 h-[3px] w-12 rounded-full bg-[#c9a227]" />
          <p className="mt-3 max-w-[760px] text-xs leading-5 text-[#607080]">
            Live reporting and delivery coverage from OpsDesk. Project ownership, delivery teams,
            assigned people, and ticket status are updated from the dashboard data.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-[#dce6ee] pt-3">
          <ChartLegend color="bg-[#7a4e9e]" label="AI Innovation" />
          <ChartLegend color="bg-[#2e6fb0]" label="Project management" />
          <ChartLegend color="bg-[#12385f]" label="Delivery organisation" />
          <ChartLegend color="border border-[#cbdbe8] bg-[#e7eef5]" label="Project category" />
          <ChartLegend color="bg-[#e4e9ee]" label="Developer" />
          <ChartLegend color="bg-[rgba(201,162,39,0.22)]" label="QA" />
        </div>

        <div className="mt-5 overflow-x-auto pb-4">
          <div style={{ minWidth: chartWidth }}>
            <AiInnovationLayer />

            <div className="my-7 h-px bg-[#dae4ec]" />

            <ChartBand
              eyebrow="UK"
              meta={`${roleCounts.pm} project managers`}
              title="Software Engineering & Quality"
              tone="blue"
            />
            <ChartStem />

            <UkEngineeringQualityLayer
              config={config}
              pms={pms}
              projectCards={projectCards}
              teams={teams}
            />

            <div className="my-7 h-px bg-[#dae4ec]" />

            <ChartBand
              eyebrow="Delivery"
              meta={`${teams.length} teams · ${configuredProjects.length} projects`}
              title="Software Engineering Delivery"
              tone="navy"
            />
            <ChartStem />

            <div
              className="relative grid items-start gap-4 px-2 pt-6"
              style={{
                gridTemplateColumns: `repeat(${deliveryColumns.length}, minmax(220px, 1fr))`,
              }}
            >
              <div className="absolute left-[118px] right-[118px] top-0 h-0.5 bg-[#b7c4d0]" />
              {deliveryColumns.map((column) => (
                <DeliveryColumn assignment={assignment} key={column.id} column={column} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-2 rounded-[10px] border border-[#dce6ee] bg-white px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#607080]">
              Role key
            </span>
            <ChartLegend color="bg-[#e4e9ee]" label="Developer" />
            <ChartLegend color="bg-[rgba(201,162,39,0.22)]" label="QA" />
            <span className="text-[10px] italic text-[#607080]">
              People and assignments combine Projects, Teams, and synced ticket assignees.
            </span>
          </div>
        </div>

        <LiveChartTotals
          moreNeededCount={moreNeededCount}
          newJoineeCount={newJoineeCount}
          projectCount={configuredProjects.length}
          roleCounts={roleCounts}
          teamCount={teams.length}
          untaggedProjectCount={untaggedProjects.length}
        />
      </div>
    </div>
  );
}

function PenMark() {
  return (
    <svg aria-label="PEN Group" className="h-11 w-11 shrink-0" viewBox="0 0 100 100">
      <circle cx="50" cy="24" fill="#2E6FB0" r="15" />
      <circle cx="73" cy="38" fill="#4C9A54" r="15" />
      <circle cx="73" cy="64" fill="#C9A227" r="15" />
      <circle cx="50" cy="78" fill="#7A4E9E" r="15" />
      <circle cx="27" cy="64" fill="#D24B3E" r="15" />
      <circle cx="27" cy="38" fill="#2E6FB0" r="15" />
      <circle cx="50" cy="51" fill="#F4F7FA" r="13" />
    </svg>
  );
}

function AiInnovationLayer() {
  const teamMembers = ["Richard", "Doncho", "Chinmoy"];

  return (
    <>
      <ChartBand
        eyebrow="AI Innovation Team"
        meta="Research & innovation"
        title="AI Innovation"
        tone="ai"
      />
      <ChartStem />

      <div className="mx-auto max-w-[620px]">
        <div className="flex justify-center">
          <div className="w-[158px] rounded-[10px] bg-[#5e3b82] px-3 py-3 text-left text-white shadow-[0_3px_8px_rgba(18,56,95,0.16)]">
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.1em]">
              AI
            </span>
            <div className="mt-1.5 text-sm font-semibold">Moshfiqur</div>
            <div className="mt-0.5 text-[10px] text-white/80">Lead</div>
          </div>
        </div>

        <div className="mx-auto h-[22px] w-0.5 bg-[#b7c4d0]" />
        <div className="relative grid grid-cols-3 gap-6 px-5 pt-[22px]">
          <div className="absolute left-[calc(16.667%+10px)] right-[calc(16.667%+10px)] top-0 h-0.5 bg-[#b7c4d0]" />
          {teamMembers.map((member) => (
            <div className="relative flex justify-center" key={member}>
              <div className="absolute left-1/2 top-[-22px] h-[22px] w-0.5 bg-[#b7c4d0]" />
              <div className="w-[158px] rounded-[10px] bg-[#7a4e9e] px-3 py-3 text-left text-white shadow-[0_3px_8px_rgba(18,56,95,0.16)]">
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.1em]">
                  AI
                </span>
                <div className="mt-1.5 text-sm font-semibold">{member}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function UkEngineeringQualityLayer({
  config,
  pms,
  projectCards,
  teams,
}: {
  config: TeamMapTreeConfig;
  pms: TeamMember[];
  projectCards: ProjectMapCard[];
  teams: ProjectTeam[];
}) {
  const engineeringReportCount = pms.length + config.pmVacancies.length;

  return (
    <div className="mx-auto w-full">
      <div className="relative grid grid-cols-[minmax(820px,2fr)_minmax(360px,1fr)] gap-12 px-8 pt-6">
        <div className="absolute left-[32%] right-[14%] top-0 h-0.5 bg-[#b7c4d0]" />

        <UkOrganisationBranch label="Software Engineering · UK">
          <UkOrganisationNode
            badge="UK"
            name="Ansley"
            role="Software Engineering UK"
            sublabel="Management & research"
            tone="engineering"
          />

          <div
            className="relative grid gap-3 pt-[22px]"
            style={{
              gridTemplateColumns: `repeat(${engineeringReportCount}, minmax(116px, 1fr))`,
            }}
          >
            <div
              className="absolute top-0 h-0.5 bg-[#b7c4d0]"
              style={{
                left: `${50 / engineeringReportCount}%`,
                right: `${50 / engineeringReportCount}%`,
              }}
            />
            {pms.map((pm) => {
              const ownedProjects = projectCards.filter((card) => card.pm?.id === pm.id).length;
              const ownedTeams = teams.filter((team) => team.pmId === pm.id).length;

              return (
                <div className="relative flex justify-center" key={pm.id}>
                  <div className="absolute left-1/2 top-[-22px] h-[22px] w-0.5 bg-[#b7c4d0]" />
                  <UkOrganisationNode
                    badge="UK"
                    name={pm.name}
                    role="Project Manager"
                    sublabel={`${ownedTeams} teams · ${ownedProjects} projects`}
                    tone="manager"
                  />
                </div>
              );
            })}
            {config.pmVacancies.map((node) => (
              <div className="relative flex justify-center" key={node.id}>
                <div className="absolute left-1/2 top-[-22px] h-[22px] w-0.5 bg-[#b7c4d0]" />
                <UkOrganisationNode
                  badge="UK"
                  name={node.name}
                  role={node.role}
                  sublabel={node.status}
                  tone="vacancy"
                />
              </div>
            ))}
          </div>
        </UkOrganisationBranch>

        <UkOrganisationBranch label="System Admin & QA">
          <UkOrganisationNode
            badge="UK"
            name={config.qualityLead.name}
            role={config.qualityLead.role}
            tone="quality"
          />
          {config.qualityReports.length ? (
            <div
              className="relative grid w-full gap-3 pt-[22px]"
              style={{
                gridTemplateColumns: `repeat(${config.qualityReports.length}, minmax(132px, 1fr))`,
              }}
            >
              <div
                className="absolute top-0 h-0.5 bg-[#b7c4d0]"
                style={{
                  left: `${50 / config.qualityReports.length}%`,
                  right: `${50 / config.qualityReports.length}%`,
                }}
              />
              {config.qualityReports.map((node) => (
                <div className="relative flex justify-center" key={node.id}>
                  <div className="absolute left-1/2 top-[-22px] h-[22px] w-0.5 bg-[#b7c4d0]" />
                  <UkOrganisationNode
                    badge="UK"
                    name={node.name}
                    role={node.role}
                    sublabel={node.status}
                    tone={node.tone === "candidate" ? "candidate" : "vacancy"}
                  />
                </div>
              ))}
            </div>
          ) : null}
        </UkOrganisationBranch>
      </div>
    </div>
  );
}

function UkOrganisationBranch({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="relative flex min-w-0 flex-col items-center">
      <div className="absolute left-1/2 top-[-24px] h-6 w-0.5 bg-[#b7c4d0]" />
      <div className="mb-3 w-full rounded-md bg-[#e7eef5] px-3 py-1.5 text-center text-[9px] font-bold uppercase tracking-[0.1em] text-[#12385f]">
        {label}
      </div>
      {children}
    </div>
  );
}

function UkOrganisationNode({
  badge,
  name,
  role,
  sublabel,
  tone,
}: {
  badge: string;
  name: string;
  role: string;
  sublabel?: string;
  tone: "candidate" | "engineering" | "manager" | "quality" | "vacancy";
}) {
  return (
    <div
      className={cn(
        "w-full max-w-[174px] rounded-[10px] border px-3 py-3 text-left shadow-[0_3px_8px_rgba(18,56,95,0.12)]",
        tone === "engineering" && "border-[#255f97] bg-[#255f97] text-white",
        tone === "manager" && "border-[#2e6fb0] bg-[#2e6fb0] text-white",
        tone === "quality" && "border-[#c9a227] bg-[#c9a227] text-[#273747]",
        tone === "candidate" && "border-[#659e6c] bg-[#86bd8c] text-[#173b21]",
        tone === "vacancy" && "border-dashed border-[#afc0ce] bg-white text-[#607080]",
      )}
    >
      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.1em]",
          tone === "vacancy" ? "bg-[#e7eef5] text-[#607080]" : "bg-white/25",
        )}
      >
        {badge}
      </span>
      <div className="mt-1.5 text-sm font-semibold">{name}</div>
      <div className={cn("mt-0.5 text-[10px]", tone !== "vacancy" && "opacity-85")}>{role}</div>
      {sublabel ? (
        <div className={cn("mt-0.5 text-[9px]", tone !== "vacancy" && "opacity-70")}>
          {sublabel}
        </div>
      ) : null}
    </div>
  );
}

function ChartBand({
  eyebrow,
  meta,
  title,
  tone,
}: {
  eyebrow: string;
  meta: string;
  title: string;
  tone: "ai" | "blue" | "navy";
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-center gap-3 rounded-[11px] border-t-[3px] border-[#c9a227] px-6 py-3 text-center text-white shadow-[0_3px_12px_rgba(18,56,95,0.16)]",
        tone === "ai"
          ? "bg-[linear-gradient(105deg,#6c4593,#8a5cac)]"
          : tone === "blue"
            ? "bg-[linear-gradient(105deg,#255f97,#2e6fb0)]"
            : "bg-[#12385f]",
      )}
    >
      <span className="rounded-full bg-white/20 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em]">
        {eyebrow}
      </span>
      <span className="text-base font-semibold">{title}</span>
      <span className="text-[11px] text-white/75">{meta}</span>
    </div>
  );
}

function ChartStem() {
  return <div className="mx-auto h-[22px] w-0.5 bg-[#b7c4d0]" />;
}

function EmptyChartNode({ label }: { label: string }) {
  return (
    <div className="mx-auto w-[190px] rounded-[10px] border-2 border-dashed border-[#afc0ce] bg-white px-3 py-4 text-center text-xs italic text-[#8496a5]">
      {label}
    </div>
  );
}

type ConfiguredTreeProject = {
  treeProject: TeamMapTreeProject;
  source?: ProjectMapCard;
};

type ProjectBoxPerson =
  | { kind: "linked"; contributor: ProjectContributor }
  | { kind: "configured"; person: TreeProjectPerson };

function projectBoxPeople(card: ConfiguredTreeProject): ProjectBoxPerson[] {
  if (!card.source) {
    return card.treeProject.people.map((person) => ({ kind: "configured", person }));
  }

  const linkedContributors = [...card.source.developers, ...card.source.qaMembers];
  const linkedNames = new Set(
    linkedContributors.map((contributor) => normalizePersonName(contributor.name)),
  );
  const configuredPeople = card.treeProject.people.filter((person) => {
    if (linkedNames.has(normalizePersonName(person.name))) return false;
    return (
      person.status === "new_joinee" ||
      person.role === "support" ||
      person.role === "web" ||
      person.id.startsWith("tree-person-") ||
      person.id.startsWith("person-")
    );
  });

  return [
    ...linkedContributors.map(
      (contributor): ProjectBoxPerson => ({ kind: "linked", contributor }),
    ),
    ...configuredPeople.map(
      (person): ProjectBoxPerson => ({ kind: "configured", person }),
    ),
  ];
}

type DeliveryColumnData = {
  id: string;
  name: string;
  leadNames: string[];
  projects: ConfiguredTreeProject[];
};

function DeliveryColumn({
  assignment,
  column,
}: {
  assignment?: ProjectAssignmentDnD;
  column: DeliveryColumnData;
}) {
  const peopleByName = new Map<string, ProjectBoxPerson>();
  for (const card of column.projects) {
    for (const person of projectBoxPeople(card)) {
      const name = person.kind === "linked" ? person.contributor.name : person.person.name;
      peopleByName.set(normalizePersonName(name), person);
    }
  }

  return (
    <div className="relative flex flex-col items-center">
      <div className="absolute left-1/2 top-[-24px] h-6 w-0.5 bg-[#b7c4d0]" />
      <div
        className={cn(
          "w-full overflow-hidden rounded-[10px] border shadow-[0_2px_6px_rgba(18,56,95,0.07)]",
          column.id === "untagged-projects"
            ? "border-dashed border-[#afc0ce] bg-[#eef3f8]"
            : "border-[#cbdbe8] bg-[#e7eef5]",
        )}
      >
        <div className="px-3 pb-2.5 pt-2.5">
          <div className="text-sm font-semibold text-[#12385f]">{column.name}</div>
          <div
            className={cn(
              "mt-0.5 text-[10px]",
              column.leadNames.length ? "text-[#1f5488]" : "italic text-[#8496a5]",
            )}
          >
            {column.leadNames.length
              ? `PM: ${column.leadNames.join(", ")}`
              : column.id === "untagged-projects"
                ? "Add a project tag to classify"
                : "No PM assigned"}
          </div>
          <div className="mt-1 text-[9px] text-[#607080]">
            {peopleByName.size} people · {column.projects.length} projects
          </div>
        </div>
      </div>

      <div className="relative w-[calc(100%-12px)] pl-[18px] pt-3">
        <div className="absolute bottom-5 left-2 top-0 w-0.5 bg-[#b7c4d0]" />
        {column.projects.length ? (
          column.projects.map((card) => (
            <LiveProjectBox
              assignment={assignment}
              card={card}
              key={card.treeProject.id}
            />
          ))
        ) : (
          <div className="relative">
            <div className="absolute -left-2.5 top-[18px] h-0.5 w-2.5 bg-[#b7c4d0]" />
            <div className="rounded-lg border border-dashed border-[#d9e4ec] bg-white px-3 py-3 text-[10px] italic text-[#93a2b0]">
              No projects assigned
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LiveProjectBox({
  assignment,
  card,
}: {
  assignment?: ProjectAssignmentDnD;
  card: ConfiguredTreeProject;
}) {
  const people = projectBoxPeople(card);

  return (
    <div className="relative mb-3 last:mb-0">
      <div className="absolute -left-2.5 top-[18px] h-0.5 w-2.5 bg-[#b7c4d0]" />
      <ProjectDropZone
        assignment={card.source ? assignment : undefined}
        className="overflow-hidden rounded-lg border border-[#d9e4ec] bg-white shadow-[0_1px_4px_rgba(18,56,95,0.05)]"
        projectId={card.source?.project.id ?? card.treeProject.id}
      >
        <div className="bg-[#eaf1f7] px-2.5 py-2">
          <span className="text-[11px] font-semibold leading-4 text-[#12385f]">
            {card.treeProject.name}
          </span>
        </div>

        <div className="grid gap-1.5 px-2.5 py-2">
          {people.length ? (
            people.map((item) =>
              item.kind === "linked" ? (
                <ContributorBox
                  compact
                  contributor={item.contributor}
                  key={`linked-${item.contributor.id}`}
                />
              ) : (
                <ConfiguredPersonBox person={item.person} key={`configured-${item.person.id}`} />
              ),
            )
          ) : (
            <span className="text-[9px] italic text-[#93a2b0]">No individuals assigned</span>
          )}
        </div>
      </ProjectDropZone>
    </div>
  );
}

function ConfiguredPersonBox({ person }: { person: TreeProjectPerson }) {
  return (
    <div
      className={cn(
        "rounded-md border px-2 py-1.5",
        person.status === "new_joinee"
          ? "border-[#bdd2e4] bg-[#d8e7f4] text-[#24577e]"
          : person.role === "qa"
            ? "border-[#ddca80] bg-[rgba(201,162,39,0.12)] text-[#856616]"
            : person.role === "support"
              ? "border-[#b9d6bc] bg-[rgba(76,154,84,0.1)] text-[#2f6b36]"
              : person.role === "web"
                ? "border-[#bfd2e4] bg-[rgba(46,111,176,0.09)] text-[#1f5488]"
                : "border-[#d3dce4] bg-[#f0f3f6] text-[#42536a]",
      )}
      title={`${personRoleLabel[person.role]}${person.offerSent ? " · Offer sent" : ""}`}
    >
      <div className="flex items-start justify-between gap-1.5">
        <span className="text-[9px] font-semibold leading-3">{person.name}</span>
        <span className="shrink-0 rounded-full border border-current/20 px-1 py-0.5 text-[6px] font-semibold uppercase tracking-wide">
          {personRoleLabel[person.role]}
        </span>
      </div>
      <div className="mt-1 text-[7px] opacity-75">
        {person.status === "new_joinee"
          ? person.offerSent
            ? "New joinee · offer sent"
            : "New joinee"
          : "Custom tree assignment"}
      </div>
    </div>
  );
}

const personRoleLabel: Record<TreeProjectPerson["role"], string> = {
  dev: "Developer",
  qa: "QA",
  support: "Support",
  web: "Web developer",
};

function ChartLegend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-[#607080]">
      <i aria-hidden="true" className={cn("h-3 w-3 rounded-[3px]", color)} />
      {label}
    </span>
  );
}

function LiveChartTotals({
  moreNeededCount,
  newJoineeCount,
  projectCount,
  roleCounts,
  teamCount,
  untaggedProjectCount,
}: {
  moreNeededCount: number;
  newJoineeCount: number;
  projectCount: number;
  roleCounts: { pm: number; dev: number; qa: number };
  teamCount: number;
  untaggedProjectCount: number;
}) {
  const rows = [
    ["Project managers", roleCounts.pm],
    ["Developers", roleCounts.dev],
    ["QA", roleCounts.qa],
    ["New joinees", newJoineeCount],
    ["More people needed", moreNeededCount],
    ["Organisation teams", teamCount],
    ["Projects", projectCount],
    ["Untagged projects", untaggedProjectCount],
  ] as const;

  return (
    <div className="mt-7">
      <h3 className="text-base font-semibold text-[#12385f]">Live structure totals</h3>
      <div className="mb-3 mt-1.5 h-[3px] w-10 rounded-full bg-[#c9a227]" />
      <div className="overflow-hidden rounded-[10px] border border-[#dce6ee] bg-white">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-[#dce6ee] bg-[#eef3f8] text-left text-[9px] font-semibold uppercase tracking-[0.07em] text-[#607080]">
              <th className="px-3.5 py-2.5">Structure item</th>
              <th className="px-3.5 py-2.5 text-right">Current total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, value]) => (
              <tr className="border-b border-[#eaf0f6] last:border-0" key={label}>
                <td className="px-3.5 py-2.5 font-medium">{label}</td>
                <td className="px-3.5 py-2.5 text-right font-mono font-semibold tabular-nums text-[#12385f]">
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] italic text-[#607080]">
        This chart reads the same projects, teams, and people shown elsewhere in OpsDesk.
      </p>
    </div>
  );
}

const contributorSourceLabel: Record<ContributorSource, string> = {
  project: "Project",
  team: "Team",
  ticket: "Tickets",
};

function ContributorBox({
  compact = false,
  contributor,
}: {
  compact?: boolean;
  contributor: ProjectContributor;
}) {
  const title =
    contributor.title && contributor.title !== PEN_TICKETING_TITLE
      ? contributor.title
      : undefined;

  return (
    <div
      className={cn(
        "rounded-md border bg-card",
        contributor.role === "qa"
          ? "border-success/25 bg-success/[0.04]"
          : "border-info/25 bg-info/[0.04]",
        compact ? "px-2 py-1.5" : "px-3 py-2.5",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div
            className={cn(
              "font-semibold text-foreground",
              compact ? "text-[9px] leading-3" : "truncate text-sm",
            )}
          >
            {contributor.name}
          </div>
          {title ? (
            <div
              className={cn(
                "truncate text-muted-foreground",
                compact ? "mt-0.5 text-[7px]" : "mt-0.5 text-[11px]",
              )}
            >
              {title}
            </div>
          ) : null}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border font-semibold uppercase tracking-wide",
            contributor.role === "qa" ? roleTone.qa : roleTone.dev,
            compact ? "px-1 py-0.5 text-[6px]" : "px-1.5 py-0.5 text-[8px]",
          )}
        >
          {roleLabel[contributor.role]}
        </span>
      </div>

      {!compact ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {contributor.sources.map((source) => (
            <span
              key={source}
              className="rounded-full border border-border/70 bg-background px-1.5 py-0.5 text-[8px] font-medium text-muted-foreground"
            >
              {contributorSourceLabel[source]}
            </span>
          ))}
          {contributor.teamNames.map((teamName) => (
            <span
              key={teamName}
              className="max-w-full truncate rounded-full border border-border/70 bg-background px-1.5 py-0.5 text-[8px] font-medium text-muted-foreground"
              title={teamName}
            >
              {teamName}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ContributorSection({
  contributors,
  emptyLabel,
  title,
}: {
  contributors: ProjectContributor[];
  emptyLabel: string;
  title: string;
}) {
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        {title}
      </div>
      {contributors.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {contributors.map((contributor) => (
            <ContributorBox key={contributor.id} contributor={contributor} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      )}
    </div>
  );
}

function DeveloperAssignmentTray({
  developers,
  draggedDeveloperId,
  notice,
  onDragEnd,
  onDragStart,
}: {
  developers: TeamMember[];
  draggedDeveloperId: string | null;
  notice: { tone: "error" | "success"; message: string } | null;
  onDragEnd: () => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, member: TeamMember) => void;
}) {
  return (
    <div className="mb-4 rounded-lg border border-dashed border-primary/30 bg-primary/[0.03] px-3 py-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <UserPlus className="h-4 w-4 text-primary" />
          Assign developers
        </div>
        <p className="text-[10px] text-muted-foreground">
          Drag a developer into any project box. The direct assignment is saved automatically.
        </p>
      </div>

      {developers.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {developers.map((developer) => (
            <button
              key={developer.id}
              type="button"
              draggable
              aria-grabbed={draggedDeveloperId === developer.id}
              onDragStart={(event) => onDragStart(event, developer)}
              onDragEnd={onDragEnd}
              className={cn(
                "inline-flex cursor-grab items-center gap-2 rounded-md border border-info/25 bg-card px-2.5 py-2 text-left shadow-sm transition active:cursor-grabbing",
                "hover:border-info/50 hover:bg-info/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                draggedDeveloperId === developer.id && "border-primary opacity-60 ring-2 ring-primary/25",
              )}
              title={`Drag ${developer.name} into a project`}
            >
              <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block max-w-40 truncate text-xs font-semibold text-foreground">
                  {developer.name}
                </span>
                {developer.title && developer.title !== PEN_TICKETING_TITLE ? (
                  <span className="block max-w-40 truncate text-[9px] text-muted-foreground">
                    {developer.title}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Add developers to the People directory before assigning them.
        </p>
      )}

      <div aria-live="polite" className="min-h-4 pt-2 text-[10px]">
        {notice ? (
          <span className={notice.tone === "error" ? "text-destructive" : "text-success"}>
            {notice.message}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ProjectDropZone({
  assignment,
  children,
  className,
  projectId,
}: {
  assignment?: ProjectAssignmentDnD;
  children: ReactNode;
  className?: string;
  projectId: string;
}) {
  const isDropTarget = assignment?.dropProjectId === projectId;
  const isSaving = assignment?.savingProjectId === projectId;

  return (
    <div
      aria-busy={isSaving}
      className={cn(
        "relative transition-[border-color,box-shadow,background-color]",
        className,
        isDropTarget && "border-primary bg-primary/[0.06] ring-2 ring-primary/30",
        isSaving && "pointer-events-none opacity-70",
      )}
      onDragOver={assignment ? (event) => assignment.onDragOver(event, projectId) : undefined}
      onDragLeave={
        assignment ? (event) => assignment.onDragLeave(event, projectId) : undefined
      }
      onDrop={assignment ? (event) => assignment.onDrop(event, projectId) : undefined}
    >
      {children}
      {isDropTarget ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] border-2 border-dashed border-primary bg-primary/10 p-3 text-center text-xs font-semibold text-primary backdrop-blur-[1px]">
          Drop {assignment?.developerName ?? "developer"} here
        </div>
      ) : null}
      {isSaving ? (
        <div className="pointer-events-none absolute bottom-2 right-2 z-10 rounded-full border border-border bg-card px-2 py-1 text-[9px] font-medium text-muted-foreground shadow-sm">
          Saving assignment…
        </div>
      ) : null}
    </div>
  );
}

function ProjectCoverageSection({
  assignment,
  projects,
}: {
  assignment?: ProjectAssignmentDnD;
  projects: ProjectMapCard[];
}) {
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <FolderKanban className="h-3.5 w-3.5" />
        Owned projects
      </div>
      {projects.length ? (
        <div className="space-y-3">
          {projects.map((card) => (
            <ProjectDropZone
              assignment={assignment}
              key={card.project.id}
              projectId={card.project.id}
              className="rounded-lg border border-border/70 bg-card px-3 py-3"
            >
              <div>
                <div className="min-w-0">
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: card.project.id }}
                    className="text-sm font-semibold text-foreground hover:text-primary hover:underline"
                  >
                    {card.project.name}
                  </Link>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {phaseLabel(card.project.phase)} · {card.project.status.replace("_", " ")}
                  </div>
                </div>
              </div>

              {card.teamNames.length ? (
                <div className="mt-2 truncate text-[9px] font-medium text-muted-foreground">
                  {card.teamNames.join(" · ")}
                </div>
              ) : null}

              <div className="mt-3">
                <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Developers
                </div>
                {card.developers.length ? (
                  <div className="grid gap-2">
                    {card.developers.map((contributor) => (
                      <ContributorBox key={contributor.id} contributor={contributor} />
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground">
                    No developer linked through the project, team, or tickets.
                  </p>
                )}
              </div>

              {card.qaMembers.length ? (
                <div className="mt-3">
                  <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    QA
                  </div>
                  <div className="grid gap-2">
                    {card.qaMembers.map((contributor) => (
                      <ContributorBox key={contributor.id} contributor={contributor} />
                    ))}
                  </div>
                </div>
              ) : null}
            </ProjectDropZone>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No projects assigned</p>
      )}
    </div>
  );
}

function MapSection({
  title,
  emptyLabel,
  items,
}: {
  title: string;
  emptyLabel: string;
  items: Array<{ id: string; label: string; sublabel: string; role?: TeamRole }>;
}) {
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        {title}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-card px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{item.label}</div>
                <div className="truncate text-xs text-muted-foreground">{item.sublabel}</div>
              </div>
              {item.role ? (
                <Badge variant="outline" className={cn("shrink-0", roleTone[item.role])}>
                  {roleLabel[item.role]}
                </Badge>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border/70 bg-card px-2 py-2 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-base font-semibold text-foreground tabular-nums">{value}</div>
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

function TeamMapSkeleton() {
  return (
    <div className="space-y-5">
      {Array.from({ length: 2 }).map((_, index) => (
        <div key={index} className="rounded-lg border border-border bg-card p-4">
          <Skeleton className="h-5 w-48" />
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((__, innerIndex) => (
              <Skeleton key={innerIndex} className="h-64 w-full" />
            ))}
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
