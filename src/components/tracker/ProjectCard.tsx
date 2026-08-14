import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Calendar, User, Layers } from "lucide-react";
import { ProgressBar } from "./ProgressBar";
import { phaseLabel, projectProgress, projectTagLabel, type Project } from "@/lib/tracker-types";

interface Props {
  project: Project;
  onEdit: () => void;
  onDelete: () => void;
  onOpen: () => void;
}

const priorityTone: Record<Project["priority"], string> = {
  low: "bg-info/15 text-info border-info/20",
  medium: "bg-warning/15 text-warning-foreground border-warning/30",
  high: "bg-destructive/15 text-destructive border-destructive/20",
};

export function ProjectCard({ project, onEdit, onDelete, onOpen }: Props) {
  const { modulePct, uatPct, overall } = projectProgress(project);
  const daysLeft = project.targetDate
    ? Math.ceil((new Date(project.targetDate).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <div
      className="group grid cursor-pointer gap-4 px-4 py-4 transition-colors hover:bg-accent/30 md:grid-cols-[minmax(0,1.5fr)_140px_220px_96px_80px] md:items-center"
      onClick={onOpen}
    >
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
            {project.name}
          </h3>
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge variant="outline" className="bg-muted/60 text-[10px] uppercase">
              {phaseLabel(project.phase)}
            </Badge>
            <Badge
              variant="outline"
              className={`text-[10px] uppercase ${priorityTone[project.priority]}`}
            >
              {project.priority}
            </Badge>
            {project.status !== "active" && (
              <Badge variant="outline" className="bg-muted/60 text-[10px] uppercase">
                {project.status.replace("_", " ")}
              </Badge>
            )}
          </div>
        </div>
        {project.description && (
          <p className="line-clamp-1 text-sm leading-6 text-muted-foreground">
            {project.description}
          </p>
        )}
        {project.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {project.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[10px]">
                {projectTagLabel[tag]}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-1 text-sm text-muted-foreground">
        {project.owner && (
          <span className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />
            {project.owner}
          </span>
        )}
        <span className="flex items-center gap-1.5 text-xs">
          <Layers className="h-3.5 w-3.5" />
          {project.modules.length} tickets
        </span>
      </div>

      <div className="space-y-2">
        <ProgressBar value={modulePct} label="Ticket completion" tone="primary" />
        <ProgressBar value={uatPct} label="Review pass rate" tone="success" />
      </div>

      <div className="flex items-center justify-between gap-3 md:block md:text-right">
        <div className="text-2xl font-semibold text-foreground tabular-nums">
          {overall}
          <span className="text-sm font-medium text-muted-foreground">%</span>
        </div>
        {daysLeft !== null && (
          <span
            className={`flex items-center gap-1 text-xs md:mt-1 md:justify-end ${daysLeft < 0 ? "text-destructive" : daysLeft < 7 ? "text-warning-foreground" : "text-muted-foreground"}`}
          >
            <Calendar className="h-3.5 w-3.5" />
            {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
          </span>
        )}
      </div>

      <div className="flex justify-end gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          aria-label={`Edit ${project.name}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Delete ${project.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
