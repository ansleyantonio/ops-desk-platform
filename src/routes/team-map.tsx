import { createFileRoute, Link } from "@tanstack/react-router";
import {
  FolderKanban,
  GitBranch,
  LayoutGrid,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { TreeCustomizer } from "@/components/team-map/TreeCustomizer";
import { listProjects, listTeamData } from "@/lib/project.functions";
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
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [teams, setTeams] = useState<ProjectTeam[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [savedTreeConfig, setSavedTreeConfig] = useState<TeamMapTreeConfig | null>(null);
  const [mapMode, setMapMode] = useState<"pm" | "projects">("pm");
  const [selectedProjectTags, setSelectedProjectTags] = useState<ProjectTag[]>([]);
  const [viewMode, setViewMode] = useState<"cards" | "tree">(() =>
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("view") === "tree"
      ? "tree"
      : "cards",
  );
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
  const effectivePmByProjectId = useMemo(() => {
    const map = new Map<string, string>();

    for (const project of projects) {
      if (project.pmId) map.set(project.id, project.pmId);
    }

    return map;
  }, [projects]);

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
      const assignedProjects = projects.filter(
        (project) => effectivePmByProjectId.get(project.id) === pm.id,
      );

      return {
        pm,
        directReports,
        pmTeams,
        teamMembers,
        assignedProjects,
      };
    });
  }, [effectivePmByProjectId, memberById, members, pms, projects, teams]);

  const projectCards = useMemo(() => {
    return projects
      .map((project) => {
        const pm = project.pmId ? memberById.get(project.pmId) : undefined;
        const assignedMembers = project.memberIds
          .map((memberId) => memberById.get(memberId))
          .filter((member): member is TeamMember => Boolean(member))
          .sort((a, b) => a.name.localeCompare(b.name));
        const developers = assignedMembers.filter((member) => member.role === "dev");
        const qaMembers = assignedMembers.filter((member) => member.role === "qa");

        return {
          project,
          pm,
          developers,
          qaMembers,
        };
      })
      .sort((a, b) => a.project.name.localeCompare(b.project.name));
  }, [memberById, projects]);

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
                    : "See every project with its PM and directly assigned contributors."}
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

                      <MapSection
                        title="Owned projects"
                        emptyLabel="No projects assigned"
                        items={assignedProjects.map((project) => ({
                          id: project.id,
                          label: project.name,
                          sublabel: project.status.replace("_", " "),
                        }))}
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
                        Project boxes, people, joinees, vacancies, and staffing needs are editable
                        here and are not overwritten by sync.
                      </div>
                    </div>
                    <TreeCustomizer config={treeConfig} onSave={persistTreeConfig} />
                  </div>
                  <FullPenOrgChart
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
                      <div
                        key={project.id}
                        className="rounded-lg border border-border/70 bg-background px-4 py-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-foreground">
                              {project.name}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {phaseLabel(project.phase)} · {project.status.replace("_", " ")}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1.5">
                            <Badge variant="outline">{project.modules.length} tickets</Badge>
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

                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <MetricPill label="Dev" value={developers.length} />
                          <MetricPill label="QA" value={qaMembers.length} />
                          <MetricPill
                            label="Open"
                            value={
                              project.modules.filter((module) => module.status !== "completed")
                                .length
                            }
                          />
                        </div>

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

                        <MapSection
                          title="Developers"
                          emptyLabel="No developers assigned"
                          items={developers.map((member) => ({
                            id: member.id,
                            label: member.name,
                            sublabel: displayMemberSubtitle(member),
                            role: member.role,
                          }))}
                        />

                        <MapSection
                          title="QA"
                          emptyLabel="No QA assigned"
                          items={qaMembers.map((member) => ({
                            id: member.id,
                            label: member.name,
                            sublabel: displayMemberSubtitle(member),
                            role: member.role,
                          }))}
                        />
                      </div>
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

type ProjectMapCard = {
  project: Project;
  pm?: TeamMember;
  developers: TeamMember[];
  qaMembers: TeamMember[];
};

function FullPenOrgChart({
  config,
  members,
  pms,
  projectCards,
  teams,
}: {
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
                <DeliveryColumn key={column.id} column={column} />
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
              People and assignments come from the Teams dashboard.
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

type DeliveryColumnData = {
  id: string;
  name: string;
  leadNames: string[];
  projects: ConfiguredTreeProject[];
};

function DeliveryColumn({ column }: { column: DeliveryColumnData }) {
  const peopleById = new Map<string, TreeProjectPerson>();
  for (const card of column.projects) {
    for (const member of card.treeProject.people) {
      peopleById.set(member.id, member);
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
            {peopleById.size} people · {column.projects.length} projects
          </div>
        </div>
      </div>

      <div className="relative w-[calc(100%-12px)] pl-[18px] pt-3">
        <div className="absolute bottom-5 left-2 top-0 w-0.5 bg-[#b7c4d0]" />
        {column.projects.length ? (
          column.projects.map((card) => <LiveProjectBox card={card} key={card.treeProject.id} />)
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

function LiveProjectBox({ card }: { card: ConfiguredTreeProject }) {
  const modules = card.source?.project.modules ?? [];
  const openTickets = modules.filter((module) => module.status !== "completed").length;
  const blockedTickets = modules.filter((module) => module.status === "blocked").length;

  return (
    <div className="relative mb-3 last:mb-0">
      <div className="absolute -left-2.5 top-[18px] h-0.5 w-2.5 bg-[#b7c4d0]" />
      <div className="overflow-hidden rounded-lg border border-[#d9e4ec] bg-white shadow-[0_1px_4px_rgba(18,56,95,0.05)]">
        <div className="flex items-start justify-between gap-2 bg-[#eaf1f7] px-2.5 py-2">
          <span className="text-[11px] font-semibold leading-4 text-[#12385f]">
            {card.treeProject.name}
          </span>
          {card.source ? (
            <span className="shrink-0 rounded-full bg-[#12385f]/10 px-1.5 py-0.5 text-[7px] font-bold text-[#12385f]">
              {modules.length}
            </span>
          ) : (
            <span className="shrink-0 rounded-full border border-[#c7d3dd] px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-[0.04em] text-[#8496a5]">
              Custom
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-1 px-2.5 py-2">
          {card.treeProject.people.length ? (
            card.treeProject.people.map((member) => (
              <span
                className={cn(
                  "rounded-[5px] px-1.5 py-0.5 text-[9px] font-medium leading-[1.35]",
                  member.status === "new_joinee"
                    ? "bg-[#d8e7f4] text-[#24577e] shadow-[inset_0_0_0_1px_#bdd2e4]"
                    : member.role === "qa"
                      ? "bg-[rgba(201,162,39,0.22)] text-[#856616]"
                      : member.role === "support"
                        ? "bg-[rgba(76,154,84,0.18)] text-[#2f6b36]"
                        : member.role === "web"
                          ? "bg-[rgba(46,111,176,0.16)] text-[#1f5488]"
                          : "bg-[#e4e9ee] text-[#42536a]",
                )}
                key={member.id}
                title={`${personRoleLabel[member.role]}${member.offerSent ? " · Offer sent" : ""}`}
              >
                {member.name}
                {member.offerSent ? (
                  <span className="ml-1 border-l border-[#9ebed7] pl-1 text-[7px] font-bold uppercase tracking-[0.03em] text-[#2f6b36]">
                    Offer sent
                  </span>
                ) : null}
              </span>
            ))
          ) : (
            <span className="text-[9px] italic text-[#93a2b0]">No individuals assigned</span>
          )}
        </div>

        <div className="border-t border-dashed border-[#e4eaf0] px-2.5 py-2">
          <span className="block text-[7px] font-semibold uppercase tracking-[0.09em] text-[#9aa7b3]">
            More needed
          </span>
          <div className="mt-1 flex flex-wrap gap-1">
            <RequirementChip label="Dev" value={card.treeProject.requirements.dev} />
            <RequirementChip label="QA" value={card.treeProject.requirements.qa} />
            <RequirementChip label="Support" value={card.treeProject.requirements.support} />
          </div>
        </div>

        {card.source ? (
          <div className="border-t border-dashed border-[#e4eaf0] px-2.5 py-2">
            <span className="block text-[7px] font-semibold uppercase tracking-[0.09em] text-[#9aa7b3]">
              Ticket position
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              <TicketChip label="Open" value={openTickets} />
              <TicketChip label="Blocked" tone="blocked" value={blockedTickets} />
              <TicketChip label="Done" value={modules.length - openTickets} />
            </div>
          </div>
        ) : null}
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

function RequirementChip({ label, value }: { label: string; value: number }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8px]",
        value === 0 ? "border-[#d6dee6] text-[#aeb8c2]" : "border-[#d6dee6] text-[#5a6b7c]",
      )}
    >
      <b className="font-bold">{value}</b> {label}
    </span>
  );
}

function TicketChip({
  label,
  tone = "default",
  value,
}: {
  label: string;
  tone?: "blocked" | "default";
  value: number;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8px]",
        value === 0
          ? "border-[#d6dee6] text-[#aeb8c2]"
          : tone === "blocked"
            ? "border-[#e7c4c1] bg-[#f8e9e7] text-[#9f4038]"
            : "border-[#d6dee6] text-[#5a6b7c]",
      )}
    >
      <b className="font-bold">{value}</b> {label}
    </span>
  );
}

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
