import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Download,
  FolderKanban,
  GitBranch,
  Maximize2,
  Minimize2,
  Printer,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { booleanParam, useUrlParam } from "@/hooks/use-url-state";
import { listProjects, listTeamData, saveProject } from "@/lib/project.functions";
import { phaseLabel } from "@/lib/tracker-types";
import type { Project, ProjectTeam, TeamMember } from "@/lib/tracker-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/team-workflow")({
  head: () => ({
    meta: [
      { title: "Team Workflow | OpsDesk" },
      {
        name: "description",
        content: "Workflow view of leadership, PMs, and delivery members across the system.",
      },
    ],
  }),
  component: TeamWorkflowPage,
});

type DeliveryStreamProjectConfig = {
  name: string;
  aliases?: string[];
};

type DeliveryStreamConfig = {
  leadLabel: string;
  name: string;
  projects: DeliveryStreamProjectConfig[];
};

const DELIVERY_STREAMS: DeliveryStreamConfig[] = [
  {
    leadLabel: "Rashed",
    name: "Education",
    projects: [
      { name: "MOODLE", aliases: ["Moodle"] },
      { name: "Nova Pathways", aliases: ["NovaPathways"] },
      { name: "Univive" },
      { name: "EducateU", aliases: ["Educatu", "EducateU - Business", "EducateU - HE Platform"] },
      { name: "SIMS" },
      { name: "CLS" },
      { name: "CEG - Ireland" },
    ],
  },
  {
    leadLabel: "Rintu",
    name: "Internal Tools",
    projects: [
      { name: "HR", aliases: ["PEN HRIS", "HRIS"] },
      { name: "Procurement", aliases: ["PEN Procurement System"] },
      { name: "Ticketing System", aliases: ["PEN Ticketing System", "PEN Ticketing"] },
      { name: "PMA" },
      {
        name: "Accounts",
        aliases: ["PEN - Accounting System", "PEN Accounting System", "Accounting System"],
      },
      { name: "Esate hub (PMA)", aliases: ["Estate Hub", "PEN - EstateHub", "EstateHub"] },
    ],
  },
  {
    leadLabel: "not yet confirmed",
    name: "B2C",
    projects: [
      { name: "Flight Eye" },
      { name: "CortexGrip", aliases: ["Cortex Grip"] },
      { name: "Job Hunger" },
      { name: "Property Scanner" },
    ],
  },
  {
    leadLabel: "to confirm",
    name: "Websites",
    projects: [],
  },
];

const WEBSITE_STREAM_NAME = "Websites";
const EXCLUDED_WORKFLOW_PROJECT_NAMES = new Set(
  ["miscellaneous", "products to add"].map(normalizeProjectName),
);
type StaffingNeed = { developers: number; qa: number; techSupport: number };
type ProjectPeopleTag = { name: string; tag: "DEV" | "WEB" | "QA" };
const STAFFING_NEED_OVERRIDES = new Map(
  [
    ["MOODLE", { developers: 1, qa: 0, techSupport: 2 }],
    ["Moodle", { developers: 1, qa: 0, techSupport: 2 }],
    ["Nova Pathways", { developers: 1, qa: 3, techSupport: 1 }],
    ["NovaPathways", { developers: 1, qa: 3, techSupport: 1 }],
    ["Univive", { developers: 1, qa: 1, techSupport: 0 }],
    ["EducateU", { developers: 2, qa: 1, techSupport: 0 }],
    ["Educate U", { developers: 2, qa: 1, techSupport: 0 }],
    ["Educatu", { developers: 2, qa: 1, techSupport: 0 }],
    ["EducateU - Business", { developers: 2, qa: 1, techSupport: 0 }],
    ["EducateU - HE Platform", { developers: 2, qa: 1, techSupport: 0 }],
    ["SIMS", { developers: 1, qa: 0, techSupport: 2 }],
    ["CLS", { developers: 0, qa: 0, techSupport: 2 }],
    ["HR", { developers: 2, qa: 1, techSupport: 1 }],
    ["PEN HRIS", { developers: 2, qa: 1, techSupport: 1 }],
    ["HRIS", { developers: 2, qa: 1, techSupport: 1 }],
    ["Procurement", { developers: 0, qa: 1, techSupport: 1 }],
    ["PEN Procurement System", { developers: 0, qa: 1, techSupport: 1 }],
    ["Accounts", { developers: 0, qa: 1, techSupport: 1 }],
    ["PEN - Accounting System", { developers: 0, qa: 1, techSupport: 1 }],
    ["PEN Accounting System", { developers: 0, qa: 1, techSupport: 1 }],
    ["Accounting System", { developers: 0, qa: 1, techSupport: 1 }],
    ["CortexGrip", { developers: 4, qa: 1, techSupport: 1 }],
    ["Cortex Grip", { developers: 4, qa: 1, techSupport: 1 }],
    ["Job Hunger", { developers: 5, qa: 2, techSupport: 0 }],
    ["Property Scanner", { developers: 2, qa: 1, techSupport: 1 }],
  ].map(([name, need]) => [normalizeProjectName(String(name)), need as StaffingNeed]),
);
const PROJECT_PEOPLE_OVERRIDES = new Map(
  [
    [
      "Nova Pathways",
      [
        { name: "Rasheduzzaman", tag: "DEV" },
        { name: "Faisal", tag: "DEV" },
        { name: "Anthokiya", tag: "WEB" },
        { name: "Abu Hena Chowdhury", tag: "DEV" },
        { name: "Ziaul Haque", tag: "DEV" },
        { name: "Sourav Saha", tag: "DEV" },
        { name: "Sidratul", tag: "QA" },
      ],
    ],
    [
      "NovaPathways",
      [
        { name: "Rasheduzzaman", tag: "DEV" },
        { name: "Faisal", tag: "DEV" },
        { name: "Anthokiya", tag: "WEB" },
        { name: "Abu Hena Chowdhury", tag: "DEV" },
        { name: "Ziaul Haque", tag: "DEV" },
        { name: "Sourav Saha", tag: "DEV" },
        { name: "Sidratul", tag: "QA" },
      ],
    ],
  ].map(([name, people]) => [normalizeProjectName(String(name)), people as ProjectPeopleTag[]]),
);

type DeliveryStreamMatch = {
  displayName: string;
  entryRank: number;
  streamName: string;
  streamRank: number;
};

const deliveryStreamAliasLookup = buildDeliveryStreamAliasLookup();
const deliveryStreamLeadLookup = new Map(
  DELIVERY_STREAMS.map((stream) => [stream.name, stream.leadLabel]),
);

function buildDeliveryStreamAliasLookup() {
  const lookup = new Map<string, DeliveryStreamMatch>();

  DELIVERY_STREAMS.forEach((stream, streamRank) => {
    stream.projects.forEach((project, entryRank) => {
      for (const value of [project.name, ...(project.aliases ?? [])]) {
        lookup.set(normalizeProjectName(value), {
          displayName: project.name,
          entryRank,
          streamName: stream.name,
          streamRank,
        });
      }
    });
  });

  return lookup;
}

function normalizeProjectName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function matchDeliveryStreamProject(projectName: string) {
  return deliveryStreamAliasLookup.get(normalizeProjectName(projectName));
}

function configuredProjectId(projectName: string) {
  return `workflow-${projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

function createDeliveryStreamProject(
  projectName: string,
  streamName: string,
  createdAt: number,
): Project {
  return {
    id: configuredProjectId(projectName),
    name: projectName,
    description: `Workflow entry for ${projectName} in ${streamName}.`,
    owner: "",
    phase: "discovery",
    startDate: "",
    targetDate: "",
    priority: "medium",
    status: "planning",
    modules: [],
    risks: [],
    createdAt,
  };
}

async function ensureDeliveryStreamProjects(projects: Project[]) {
  const existingNames = new Set(
    projects.flatMap((project) => {
      const match = matchDeliveryStreamProject(project.name);
      return match
        ? [normalizeProjectName(project.name), normalizeProjectName(match.displayName)]
        : [normalizeProjectName(project.name)];
    }),
  );
  const missing: Project[] = [];
  const now = Date.now();

  for (const stream of DELIVERY_STREAMS) {
    for (const project of stream.projects) {
      const knownNames = [project.name, ...(project.aliases ?? [])].map(normalizeProjectName);
      const exists = knownNames.some((name) => existingNames.has(name));
      if (!exists) {
        const entry = createDeliveryStreamProject(project.name, stream.name, now);
        missing.push(entry);
        existingNames.add(normalizeProjectName(project.name));
      }
    }
  }

  if (missing.length > 0) {
    await Promise.all(missing.map((project) => saveProject({ data: project })));
  }

  return [...projects, ...missing];
}

function TeamWorkflowPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [teams, setTeams] = useState<ProjectTeam[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useUrlParam("fullscreen", booleanParam());

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [teamData, projectData] = await Promise.all([listTeamData(), listProjects()]);
        const projectsWithStreamEntries = await ensureDeliveryStreamProjects(projectData);
        if (cancelled) return;
        setMembers(teamData.members);
        setTeams(teamData.teams);
        setProjects(projectsWithStreamEntries);
      } catch (error) {
        console.error("Failed to load team workflow", error);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const projectManagers = useMemo(
    () =>
      members.filter((member) => member.role === "pm").sort((a, b) => a.name.localeCompare(b.name)),
    [members],
  );
  const memberById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members],
  );
  const teamById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams]);

  const projectTree = useMemo(
    () =>
      projects
        .filter(
          (project) => !EXCLUDED_WORKFLOW_PROJECT_NAMES.has(normalizeProjectName(project.name)),
        )
        .map((project) => {
          const deliveryStreamMatch = matchDeliveryStreamProject(project.name);
          if (!deliveryStreamMatch) return null;

          const team = project.teamId ? teamById.get(project.teamId) : undefined;
          const pm =
            (project.pmId ? memberById.get(project.pmId) : undefined) ??
            (team?.pmId ? memberById.get(team.pmId) : undefined);
          const developers = (team?.devIds ?? [])
            .map((memberId) => memberById.get(memberId))
            .filter((member): member is TeamMember => Boolean(member))
            .sort((a, b) => a.name.localeCompare(b.name));
          const qaMembers = (team?.qaIds ?? [])
            .map((memberId) => memberById.get(memberId))
            .filter((member): member is TeamMember => Boolean(member))
            .sort((a, b) => a.name.localeCompare(b.name));

          return {
            deliveryStreamName: deliveryStreamMatch.streamName,
            displayName: deliveryStreamMatch.displayName,
            entryRank: deliveryStreamMatch.entryRank,
            project,
            qaMembers,
            streamRank: deliveryStreamMatch.streamRank,
            team,
            pm,
            developers,
          };
        })
        .filter((item): item is ProjectTreeItem => Boolean(item))
        .sort(
          (a, b) =>
            a.streamRank - b.streamRank ||
            a.entryRank - b.entryRank ||
            a.displayName.localeCompare(b.displayName),
        ),
    [memberById, projects, teamById],
  );

  const assignedDeveloperCount = useMemo(
    () => new Set(projectTree.flatMap((item) => item.developers.map((member) => member.id))).size,
    [projectTree],
  );
  const assignedQaCount = useMemo(
    () => new Set(projectTree.flatMap((item) => item.qaMembers.map((member) => member.id))).size,
    [projectTree],
  );

  const downloadWorkflowView = () => {
    const source = document.querySelector<HTMLElement>(".team-workflow-download-surface");
    if (!source) return;

    const stylesheets = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')]
      .map((link) => `<link rel="stylesheet" href="${link.href}">`)
      .join("\n");
    const inlineStyles = [...document.querySelectorAll<HTMLStyleElement>("style")]
      .map((style) => `<style>${style.textContent ?? ""}</style>`)
      .join("\n");
    const markup = source.outerHTML;
    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Team Workflow</title>
  ${stylesheets}
  ${inlineStyles}
  <style>
    body { margin: 0; padding: 24px; background: #f8fafc; color: #1f2937; }
    .team-workflow-download-surface { width: max-content; min-width: 100%; }
  </style>
</head>
<body>
  ${markup}
</body>
</html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "team-workflow.html";
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-[1400px]">
      <section className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-foreground sm:text-[1.7rem]">
            Team workflow
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Workflow view from AI Innovation leadership through PMs and the delivery team in the
            system.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" className="self-start">
            <Link to="/team-map">
              <GitBranch className="h-4 w-4" />
              Team map
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
        <SummaryTile
          label="Project managers"
          value={projectManagers.length}
          icon={<UserRound className="h-4 w-4" />}
        />
        <SummaryTile
          label="Projects"
          value={projects.length}
          icon={<FolderKanban className="h-4 w-4" />}
        />
        <SummaryTile
          label="Assigned devs"
          value={assignedDeveloperCount}
          icon={<UsersRound className="h-4 w-4" />}
        />
        <SummaryTile
          label="Assigned QA"
          value={assignedQaCount}
          icon={<ShieldCheck className="h-4 w-4" />}
        />
      </section>

      {!loaded ? (
        <WorkflowSkeleton />
      ) : (
        <div className="space-y-5">
          <section className="rounded-lg border border-border bg-card px-4 py-4">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Workflow structure</h2>
                <p className="text-xs text-muted-foreground">
                  Fixed leadership path with live project assignments from the system.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline">{projects.length} projects from system</Badge>
                <TooltipProvider delayDuration={120}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={downloadWorkflowView}
                        aria-label="Download workflow view"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Download view</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setFullscreenOpen(true)}
                        aria-label="Open workflow structure fullscreen"
                      >
                        <Maximize2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open fullscreen</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            <div className="team-workflow-download-surface">
              <WorkflowStructure
                projectManagersCount={projectManagers.length}
                projects={projectTree}
                projectsCount={projects.length}
              />
            </div>
          </section>

          <Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
            <DialogContent className="team-workflow-print-dialog h-[100dvh] max-h-[100dvh] w-screen max-w-none gap-0 overflow-hidden rounded-none border-0 bg-background p-0 shadow-none sm:rounded-none [&>button]:hidden">
              <DialogHeader className="sr-only">
                <DialogTitle>Workflow structure fullscreen</DialogTitle>
                <DialogDescription>
                  Fullscreen leadership workflow with project managers, developers, and QA
                  assignments.
                </DialogDescription>
              </DialogHeader>
              <div className="flex h-full flex-col">
                <div className="team-workflow-print-toolbar flex shrink-0 flex-col gap-3 border-b border-border bg-card/95 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-foreground">
                      Workflow structure
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Fullscreen leadership path with PM, dev, and QA reporting from the project
                      tree.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="shrink-0">
                      {projects.length} projects from system
                    </Badge>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => window.print()}
                    >
                      <Printer className="h-4 w-4" />
                      Print
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setFullscreenOpen(false)}
                    >
                      <Minimize2 className="h-4 w-4" />
                      Exit fullscreen
                    </Button>
                  </div>
                </div>
                <div className="team-workflow-print-scroll min-h-0 flex-1 overflow-auto bg-muted/20 p-4 sm:p-6">
                  <div className="team-workflow-print-surface">
                    <WorkflowStructure
                      projectManagersCount={projectManagers.length}
                      projects={projectTree}
                      projectsCount={projects.length}
                      variant="fullscreen"
                    />
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}

type ProjectTreeItem = {
  deliveryStreamName: string;
  displayName: string;
  entryRank: number;
  project: Project;
  streamRank: number;
  team?: ProjectTeam;
  pm?: TeamMember;
  developers: TeamMember[];
  qaMembers: TeamMember[];
};

function WorkflowStructure({
  projectManagersCount,
  projects,
  projectsCount,
  variant = "default",
}: {
  projectManagersCount: number;
  projects: ProjectTreeItem[];
  projectsCount: number;
  variant?: "default" | "fullscreen";
}) {
  return (
    <div
      className={cn(
        "overflow-x-auto",
        variant === "fullscreen" && "min-h-full rounded-lg bg-background",
      )}
    >
      <div
        className={cn(
          "min-w-[980px] px-6 py-3",
          variant === "fullscreen" && "min-w-[1120px] px-8 py-6",
        )}
      >
        <div className="flex justify-center">
          <WorkflowNode label="AI Innovation team" tone="lead" hideTopConnector />
        </div>

        <WorkflowBranch className="mt-10" count={1}>
          <WorkflowNode label="Ansley - UK" tone="lead" />
        </WorkflowBranch>

        <WorkflowBranch className="mt-10" count={1}>
          <WorkflowNode
            label="Project managers"
            sublabel={`${projectManagersCount} PMs · ${projectsCount} project assignments`}
            tone="group"
          />
        </WorkflowBranch>

        <div className="mt-10">
          <ProjectTreeGroup
            projectManagersCount={projectManagersCount}
            projects={projects}
            projectsCount={projectsCount}
            variant={variant}
          />
        </div>
      </div>
    </div>
  );
}

function ProjectTreeGroup({
  projectManagersCount,
  projects,
  projectsCount,
  variant = "default",
}: {
  projectManagersCount: number;
  projects: ProjectTreeItem[];
  projectsCount: number;
  variant?: "default" | "fullscreen";
}) {
  const groupedProjects = groupProjectsByDeliveryStream(projects);
  const visibleProjectsCount = groupedProjects.reduce(
    (sum, group) => sum + group.projects.length,
    0,
  );

  return (
    <section
      className={cn(
        "rounded-lg border border-border/70 bg-background px-4 py-4",
        variant === "fullscreen" && "min-h-full border-border bg-card px-4 py-4 sm:px-5",
      )}
    >
      <div className="mb-5 flex justify-center">
        <WorkflowNode
          label="Overseas IT director"
          sublabel={`${projectManagersCount} PMs · ${projectsCount} projects`}
          tone="director"
          hideTopConnector
        />
      </div>
      <div className="mb-3 flex items-center justify-end gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{visibleProjectsCount}</Badge>
        </div>
      </div>
      {projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">No projects in the system yet.</p>
      ) : (
        <>
          <div className="mb-3 mt-4 text-base font-semibold text-foreground">Delivery streams</div>
          <div
            className={cn(
              "grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3",
              variant === "fullscreen" && "gap-4 2xl:grid-cols-4",
            )}
          >
            {groupedProjects.map((group) => (
              <section
                key={group.id}
                className="overflow-hidden rounded-lg border border-border/70 bg-card"
              >
                <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border/70 bg-muted/40 px-3 py-3">
                  <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">
                    {group.name}
                  </h3>
                  <div className="shrink-0 text-xs text-muted-foreground">
                    Lead: <span className="font-medium text-foreground">{group.leadLabel}</span>
                  </div>
                </div>
                <div className="min-h-20 divide-y divide-border/70">
                  {group.projects.map((item) => (
                    <ProjectDeliveryRow key={item.project.id} item={item} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

type ProjectTreeGroupItem = {
  id: string;
  name: string;
  streamRank: number;
  leadLabel: string;
  projects: ProjectTreeItem[];
};

function groupProjectsByDeliveryStream(projects: ProjectTreeItem[]): ProjectTreeGroupItem[] {
  const groups = new Map<string, ProjectTreeGroupItem>(
    DELIVERY_STREAMS.map((stream, streamRank) => [
      stream.name,
      {
        id: stream.name,
        name: stream.name,
        streamRank,
        leadLabel: stream.leadLabel,
        projects: [],
      },
    ]),
  );

  for (const item of projects) {
    const id = item.deliveryStreamName;
    const current = groups.get(id) ?? {
      id,
      name: item.deliveryStreamName,
      streamRank: item.streamRank,
      leadLabel: deliveryStreamLeadLookup.get(item.deliveryStreamName) ?? "to confirm",
      projects: [],
    };

    current.projects.push(item);
    groups.set(id, current);
  }

  return [...groups.values()]
    .map((group) => {
      const leadNames = uniqueNames(
        group.projects.map((item) => item.pm?.name).filter((name): name is string => Boolean(name)),
      );

      return {
        ...group,
        leadLabel:
          deliveryStreamLeadLookup.get(group.name) ??
          (leadNames.length === 0
            ? "to confirm"
            : leadNames.length === 1
              ? leadNames[0]
              : leadNames.join(" / ")),
        projects: mergeProjectTreeItems(group.projects).sort(
          (a, b) =>
            a.entryRank - b.entryRank ||
            a.displayName.localeCompare(b.displayName) ||
            a.project.name.localeCompare(b.project.name),
        ),
      };
    })
    .sort((a, b) => {
      if (a.id === WEBSITE_STREAM_NAME) return 1;
      if (b.id === WEBSITE_STREAM_NAME) return -1;
      return a.streamRank - b.streamRank || a.name.localeCompare(b.name);
    });
}

function mergeProjectTreeItems(projects: ProjectTreeItem[]) {
  const merged = new Map<string, ProjectTreeItem>();

  for (const item of projects) {
    const key = `${item.deliveryStreamName}:${item.displayName}`;
    const current = merged.get(key);

    if (!current) {
      merged.set(key, item);
      continue;
    }

    merged.set(key, {
      ...current,
      developers: uniqueMembers([...current.developers, ...item.developers]),
      pm: current.pm ?? item.pm,
      project: {
        ...current.project,
        modules: [...current.project.modules, ...item.project.modules],
        risks: [...current.project.risks, ...item.project.risks],
        status: mergeProjectStatus(current.project.status, item.project.status),
      },
      qaMembers: uniqueMembers([...current.qaMembers, ...item.qaMembers]),
      team: current.team ?? item.team,
    });
  }

  return [...merged.values()];
}

function mergeProjectStatus(current: Project["status"], next: Project["status"]) {
  const rank: Record<Project["status"], number> = {
    planning: 0,
    completed: 1,
    on_hold: 2,
    active: 3,
  };

  return rank[next] > rank[current] ? next : current;
}

function uniqueMembers(members: TeamMember[]) {
  const byId = new Map<string, TeamMember>();
  for (const member of members) {
    byId.set(member.id, member);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function ProjectDeliveryRow({ item }: { item: ProjectTreeItem }) {
  const devNames = uniqueNames(item.developers.map((member) => member.name));
  const qaNames = uniqueNames(item.qaMembers.map((member) => member.name));
  const assignedNames = uniqueNames(
    item.project.modules
      .map((module) => module.assignee?.trim())
      .filter((name): name is string => Boolean(name)),
  ).filter((name) => !devNames.includes(name) && !qaNames.includes(name));
  const staffingNeed = calculateStaffingNeed(item, devNames, qaNames, assignedNames);
  const peopleOverride = getProjectPeopleOverride(item);
  const hasPeople = peopleOverride
    ? peopleOverride.length > 0
    : devNames.length > 0 || qaNames.length > 0 || assignedNames.length > 0;

  return (
    <article className="px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-foreground">{item.displayName}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {phaseLabel(item.project.phase)} · {item.project.modules.length} tickets
          </div>
        </div>
        <StaffingNeedLabel need={staffingNeed} />
      </div>

      {!hasPeople ? (
        <div className="mt-2 text-xs italic text-muted-foreground">to assign</div>
      ) : peopleOverride ? (
        <ProjectTaggedPeopleInline people={peopleOverride} />
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
          <ProjectPeopleInline names={devNames} label="DEV" />
          <ProjectPeopleInline names={qaNames} label="QA" />
          {assignedNames.length > 0 ? (
            <span className="text-foreground/75">{assignedNames.join(" · ")}</span>
          ) : null}
        </div>
      )}
    </article>
  );
}

function getProjectPeopleOverride(item: ProjectTreeItem) {
  return (
    PROJECT_PEOPLE_OVERRIDES.get(normalizeProjectName(item.displayName)) ??
    PROJECT_PEOPLE_OVERRIDES.get(normalizeProjectName(item.project.name))
  );
}

function calculateStaffingNeed(
  item: ProjectTreeItem,
  _devNames: string[],
  _qaNames: string[],
  _assignedNames: string[],
) {
  const override =
    STAFFING_NEED_OVERRIDES.get(normalizeProjectName(item.displayName)) ??
    STAFFING_NEED_OVERRIDES.get(normalizeProjectName(item.project.name));

  if (override) return override;

  return {
    developers: 0,
    qa: 0,
    techSupport: 0,
  };
}

function StaffingNeedLabel({ need }: { need: StaffingNeed }) {
  const items = [
    { label: "Dev", value: need.developers },
    { label: "QA", value: need.qa },
    { label: "Tech", value: need.techSupport },
  ];

  return (
    <div
      aria-label={`More needed: ${need.developers} developers, ${need.qa} QA, ${need.techSupport} tech support`}
      className="flex shrink-0 overflow-hidden rounded-md border border-amber-300/80 bg-amber-50 text-[10px] font-semibold text-amber-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]"
      title="Expected staffing needed by department"
    >
      {items.map((item) => (
        <span
          key={item.label}
          className="flex items-center gap-1 border-l border-amber-300/70 px-1.5 py-1 first:border-l-0"
        >
          <span className="uppercase tracking-[0.12em] text-amber-700">{item.label}</span>
          <span className="font-mono text-[11px] tabular-nums text-amber-950">{item.value}</span>
        </span>
      ))}
    </div>
  );
}

function ProjectPeopleInline({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null;

  return (
    <>
      <span className="text-foreground/75">{names.join(" · ")}</span>
      <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-semibold uppercase">
        {label}
      </Badge>
    </>
  );
}

function ProjectTaggedPeopleInline({ people }: { people: ProjectPeopleTag[] }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
      {people.map((person, index) => (
        <span key={`${person.name}-${person.tag}`} className="inline-flex items-center gap-1">
          {index > 0 ? <span className="text-muted-foreground/70">·</span> : null}
          <span className="text-foreground/75">{person.name}</span>
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-semibold uppercase">
            {person.tag}
          </Badge>
        </span>
      ))}
    </div>
  );
}

function uniqueNames(names: string[]) {
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))];
}

function WorkflowBranch({
  children,
  className,
  count,
}: {
  children: React.ReactNode;
  className?: string;
  count: number;
}) {
  const gridTemplateColumns = `repeat(${count}, minmax(180px, 1fr))`;

  return (
    <div className={cn("relative px-8 pt-6", className)}>
      <div className="absolute left-[14%] right-[14%] top-0 h-px bg-foreground/70" />
      <div className="absolute left-1/2 top-[-28px] h-7 w-px bg-foreground/70" />
      <div className="grid gap-4" style={{ gridTemplateColumns }}>
        {children}
      </div>
    </div>
  );
}

function WorkflowNode({
  label,
  sublabel,
  tone,
  hideTopConnector = false,
}: {
  label: string;
  sublabel?: string;
  tone: "lead" | "group" | "director";
  hideTopConnector?: boolean;
}) {
  return (
    <div className="relative mx-auto flex justify-center">
      {!hideTopConnector ? (
        <div className="absolute left-1/2 top-[-24px] h-6 w-px bg-foreground/70" />
      ) : null}
      <div
        className={cn(
          "flex min-h-12 w-40 flex-col items-center justify-center border border-foreground/80 px-3 py-2 text-center text-xs leading-tight text-foreground",
          workflowTone[tone],
        )}
        title={sublabel ? `${label}: ${sublabel}` : label}
      >
        <span className="line-clamp-1 max-w-full font-medium">{label}</span>
        {sublabel ? (
          <span className="line-clamp-2 max-w-full text-[10px] text-foreground/75">{sublabel}</span>
        ) : null}
      </div>
    </div>
  );
}

function SummaryTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
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

function WorkflowSkeleton() {
  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border bg-card p-4">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="mt-3 h-80 w-full" />
      </div>
    </div>
  );
}

const workflowTone = {
  director: "bg-white",
  lead: "bg-[#ead5e8]",
  group: "bg-[#dce8f7]",
} as const;
