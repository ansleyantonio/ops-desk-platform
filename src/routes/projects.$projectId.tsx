import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FolderKanban } from "lucide-react";
import { useEffect, useState } from "react";

import { ProjectDetail } from "@/components/tracker/ProjectDetail";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { listProjects, listTeamData, saveProject } from "@/lib/project.functions";
import type { Project, ProjectTeam, TeamMember } from "@/lib/tracker-types";

export const Route = createFileRoute("/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Project details | OpsDesk" },
      {
        name: "description",
        content: "Review project delivery, contributors, tickets, risks, and timeline.",
      },
    ],
  }),
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { projectId } = Route.useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [teams, setTeams] = useState<ProjectTeam[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [projects, teamData] = await Promise.all([listProjects(), listTeamData()]);
        if (cancelled) return;
        setProject(projects.find((item) => item.id === projectId) ?? null);
        setMembers(teamData.members);
        setTeams(teamData.teams);
      } catch (error) {
        console.error("Failed to load project details", error);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const updateProject = (next: Project) => {
    setProject(next);
    void saveProject({ data: next }).catch((error) => {
      console.error("Failed to save project", error);
    });
  };

  return (
    <div className="mx-auto max-w-[1420px] space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2 active:scale-[0.98]">
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
            Back to projects
          </Link>
        </Button>
        {project && (
          <div className="app-mono hidden text-[11px] uppercase tracking-[0.14em] text-muted-foreground sm:block">
            Project workspace
          </div>
        )}
      </div>

      {!loaded ? (
        <ProjectDetailSkeleton />
      ) : project ? (
        <ProjectDetail project={project} onUpdate={updateProject} members={members} teams={teams} />
      ) : (
        <div className="flex min-h-[420px] flex-col items-center justify-center rounded-[1.8rem] border border-border/70 bg-card/55 px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-[1.2rem] bg-muted text-muted-foreground">
            <FolderKanban className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-foreground">Project not found</h1>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            This project may have been removed or is no longer available.
          </p>
          <Button asChild className="mt-5 active:scale-[0.98]">
            <Link to="/">Return to projects</Link>
          </Button>
        </div>
      )}
    </div>
  );
}

function ProjectDetailSkeleton() {
  return (
    <div className="overflow-hidden rounded-[1.8rem] border border-border/70 bg-card/55">
      <div className="space-y-5 border-b border-border/70 p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-24" />
        </div>
        <Skeleton className="h-4 w-full max-w-xl" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="space-y-5 p-6 sm:p-8">
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    </div>
  );
}
