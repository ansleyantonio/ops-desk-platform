import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import {
  PROJECT_TAGS,
  phaseLabel,
  projectTagLabel,
  uid,
  type Project,
  type ProjectTag,
  type ProjectPhase,
  type ProjectStatus,
  type TeamMember,
} from "@/lib/tracker-types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (p: Project) => void;
  initial?: Project | null;
  members: TeamMember[];
}

export function ProjectDialog({ open, onOpenChange, onSave, initial, members }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [notionUrl, setNotionUrl] = useState("");
  const [owner, setOwner] = useState("");
  const [pmId, setPmId] = useState("none");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [phase, setPhase] = useState<ProjectPhase>("build");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [uatStartDate, setUatStartDate] = useState("");
  const [uatEndDate, setUatEndDate] = useState("");
  const [priority, setPriority] = useState<Project["priority"]>("medium");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [tags, setTags] = useState<ProjectTag[]>([]);
  const [modulesText, setModulesText] = useState<string[]>([]);
  const [moduleInput, setModuleInput] = useState("");

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setDescription(initial?.description ?? "");
      setNotionUrl(initial?.notionUrl ?? "");
      setOwner(initial?.owner ?? "");
      setPmId(initial?.pmId ?? "none");
      setMemberIds(initial?.memberIds ?? []);
      setPhase(initial?.phase ?? "build");
      setStartDate(initial?.startDate ?? new Date().toISOString().slice(0, 10));
      setTargetDate(initial?.targetDate ?? "");
      setUatStartDate(initial?.uatStartDate ?? "");
      setUatEndDate(initial?.uatEndDate ?? "");
      setPriority(initial?.priority ?? "medium");
      setStatus(initial?.status ?? "active");
      setTags(initial?.tags ?? []);
      setModulesText(initial?.modules.map((m) => m.name) ?? []);
      setModuleInput("");
    }
  }, [open, initial]);

  const addModule = () => {
    const v = moduleInput.trim();
    if (!v) return;
    setModulesText((m) => [...m, v]);
    setModuleInput("");
  };

  const handleSave = () => {
    if (!name.trim()) return;
    const selectedPm = pmId === "none" ? undefined : members.find((member) => member.id === pmId);
    const existing = initial?.modules ?? [];
    const modules = modulesText.map((nm, i) => {
      const ex = existing[i];
      return ex && ex.name === nm
        ? ex
        : { id: uid(), name: nm, status: "not_started" as const, uat: "pending" as const };
    });
    const project: Project = {
      id: initial?.id ?? uid(),
      name: name.trim(),
      description: description.trim(),
      notionUrl: notionUrl.trim() || undefined,
      owner: selectedPm?.name ?? owner.trim(),
      pmId: pmId === "none" ? undefined : pmId,
      teamId: undefined,
      memberIds,
      phase,
      startDate,
      targetDate,
      uatStartDate: uatStartDate || undefined,
      uatEndDate: uatEndDate || undefined,
      priority,
      status,
      tags,
      modules,
      risks: initial?.risks ?? [],
      createdAt: initial?.createdAt ?? Date.now(),
    };
    onSave(project);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{initial ? "Edit project" : "New project"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="name">Project name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Website relaunch"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desc">Description</Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notionUrl">Notion project URL</Label>
            <Input
              id="notionUrl"
              type="url"
              value={notionUrl}
              onChange={(e) => setNotionUrl(e.target.value)}
              placeholder="https://app.notion.com/p/..."
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Used later for scheduled ticket syncs from Notion.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="owner">Project manager</Label>
              {members.some((member) => member.role === "pm") ? (
                <Select
                  value={pmId}
                  onValueChange={(value) => {
                    setPmId(value);
                    const selected = members.find((member) => member.id === value);
                    if (selected) setOwner(selected.name);
                  }}
                >
                  <SelectTrigger id="owner">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {members
                      .filter((member) => member.role === "pm")
                      .map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="owner"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  placeholder="Jane Doe"
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>Current phase</Label>
              <Select value={phase} onValueChange={(v) => setPhase(v as ProjectPhase)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="discovery">{phaseLabel("discovery")}</SelectItem>
                  <SelectItem value="build">{phaseLabel("build")}</SelectItem>
                  <SelectItem value="uat">{phaseLabel("uat")}</SelectItem>
                  <SelectItem value="go_live">{phaseLabel("go_live")}</SelectItem>
                  <SelectItem value="hypercare">{phaseLabel("hypercare")}</SelectItem>
                  <SelectItem value="complete">{phaseLabel("complete")}</SelectItem>
                  <SelectItem value="paused">{phaseLabel("paused")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Assigned individuals</Label>
            <div className="grid max-h-44 grid-cols-1 gap-2 overflow-y-auto rounded-lg border border-border/70 bg-muted/20 p-2 sm:grid-cols-2">
              {members
                .filter((member) => member.role !== "pm")
                .map((member) => {
                  const selected = memberIds.includes(member.id);
                  return (
                    <Button
                      key={member.id}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      size="sm"
                      aria-pressed={selected}
                      className="justify-between"
                      onClick={() =>
                        setMemberIds((current) =>
                          current.includes(member.id)
                            ? current.filter((id) => id !== member.id)
                            : [...current, member.id],
                        )
                      }
                    >
                      <span className="truncate">{member.name}</span>
                      <span className="text-[10px] uppercase opacity-70">{member.role}</span>
                    </Button>
                  );
                })}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Assign contributors directly to this project. Project teams are managed separately.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Project tags</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PROJECT_TAGS.map((tag) => {
                const selected = tags.includes(tag);
                return (
                  <Button
                    key={tag}
                    type="button"
                    variant={selected ? "default" : "outline"}
                    size="sm"
                    aria-pressed={selected}
                    className="justify-center"
                    onClick={() =>
                      setTags((current) =>
                        current.includes(tag)
                          ? current.filter((item) => item !== tag)
                          : [...current, tag],
                      )
                    }
                  >
                    {projectTagLabel[tag]}
                  </Button>
                );
              })}
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Select every area this project belongs to. Team Map can filter by these tags.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as Project["priority"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="planning">Planning</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="on_hold">On hold</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="start">Start date</Label>
              <Input
                id="start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="target">Target date</Label>
              <Input
                id="target"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="uatStart">Review start</Label>
              <Input
                id="uatStart"
                type="date"
                value={uatStartDate}
                onChange={(e) => setUatStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="uatEnd">Review end</Label>
              <Input
                id="uatEnd"
                type="date"
                value={uatEndDate}
                onChange={(e) => setUatEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Tickets</Label>
            <div className="flex gap-2">
              <Input
                value={moduleInput}
                onChange={(e) => setModuleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addModule();
                  }
                }}
                placeholder="e.g. Authentication"
              />
              <Button type="button" variant="secondary" onClick={addModule}>
                Add
              </Button>
            </div>
            {modulesText.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {modulesText.map((m, i) => (
                  <Badge key={i} variant="secondary" className="gap-1 pr-1">
                    {m}
                    <button
                      onClick={() => setModulesText((arr) => arr.filter((_, idx) => idx !== i))}
                      className="ml-1 rounded-full hover:bg-background/50 p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs leading-5 text-muted-foreground">
              Open the project to set per-ticket dates, assignees, effort and review state.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            {initial ? "Save changes" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
