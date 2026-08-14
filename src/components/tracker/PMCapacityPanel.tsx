import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ownerCapacity, summarizeOwners, type Project, type Health } from "@/lib/tracker-types";
import { CheckCircle2, AlertTriangle, Users } from "lucide-react";

interface Props {
  projects: Project[];
  onPickOwner?: (owner: string) => void;
}

const healthDot: Record<Health, string> = {
  on_track: "bg-success",
  at_risk: "bg-warning",
  delayed: "bg-destructive",
  completed: "bg-info",
  unknown: "bg-muted-foreground/40",
};

export function PMCapacityPanel({ projects, onPickOwner }: Props) {
  const owners = summarizeOwners(projects);
  if (owners.length === 0) return null;

  const available = owners.filter((o) => ownerCapacity(o).canTakeMore);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users className="h-4 w-4" />
          </div>
          <div>
            <h2 className="font-semibold leading-tight text-foreground">
              Project manager capacity
            </h2>
            <p className="text-xs text-muted-foreground">
              {available.length} of {owners.length} can take on more work
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {owners.map((o) => {
          const cap = ownerCapacity(o);
          return (
            <div
              key={o.owner}
              className="cursor-pointer rounded-lg border border-border/60 bg-background/50 p-3 transition-colors hover:bg-accent/40"
              onClick={() => onPickOwner?.(o.owner)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex min-w-0 items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${healthDot[o.health]}`} />
                  <span className="truncate text-sm font-medium">{o.owner}</span>
                </div>
                {cap.canTakeMore ? (
                  <Badge
                    variant="outline"
                    className="bg-success/10 text-success border-success/20 text-[10px]"
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Available
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]"
                  >
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    At capacity
                  </Badge>
                )}
              </div>
              <div className="mb-2 grid grid-cols-3 gap-2 text-center">
                <Stat label="Active" value={o.activeProjects} />
                <Stat label="Backlog" value={`${o.remainingDays}d`} />
                <Stat
                  label="Risks"
                  value={o.openRisks}
                  tone={o.openRisks ? "text-destructive" : undefined}
                />
              </div>
              <p className="mt-3 text-[11px] leading-5 text-muted-foreground">{cap.reason}</p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div>
      <div className={`text-lg font-semibold tabular-nums ${tone ?? ""}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  );
}
