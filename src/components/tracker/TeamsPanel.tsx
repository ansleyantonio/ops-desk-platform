import { useEffect, useMemo, useState, type DragEvent } from "react";
import { Pencil, Plus, Search, Trash2, UsersRound, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  enumParam,
  stringParam,
  useUrlParam,
  useUrlSearchUpdater,
} from "@/hooks/use-url-state";
import {
  normalizeProjectTeam,
  normalizeTeamMember,
  uid,
  type ProjectTeam,
  type TeamMember,
  type TeamRole,
} from "@/lib/tracker-types";

const roleLabel: Record<TeamRole, string> = {
  pm: "PM",
  dev: "Dev",
  qa: "QA",
};

const roleTone: Record<TeamRole, string> = {
  pm: "bg-primary/10 text-primary border-primary/20",
  dev: "bg-info/15 text-info border-info/20",
  qa: "bg-success/15 text-success border-success/20",
};

const PEN_TICKETING_TITLE = "PEN ticketing assignee";

interface Props {
  embedded?: boolean;
  mode?: "all" | "people" | "teams";
  members: TeamMember[];
  teams: ProjectTeam[];
  onSaveMember: (member: TeamMember) => void;
  onDeleteMember: (id: string) => void;
  onSaveTeam: (team: ProjectTeam) => void;
  onDeleteTeam: (id: string) => void;
}

function displayMemberTitle(member: TeamMember) {
  if (member.title && member.title !== PEN_TICKETING_TITLE) {
    return member.title;
  }
  return "Team member";
}

export function TeamsPanel({
  embedded = false,
  mode = "all",
  members,
  onDeleteMember,
  onDeleteTeam,
  onSaveMember,
  onSaveTeam,
  teams,
}: Props) {
  const [memberName, setMemberName] = useState("");
  const [memberTitle, setMemberTitle] = useState("");
  const [memberRole, setMemberRole] = useState<TeamRole>("dev");
  const [managerId, setManagerId] = useState("none");
  const [peopleQuery, setPeopleQuery] = useUrlParam("peopleQ", stringParam());
  const [peopleRole, setPeopleRole] = useUrlParam(
    "peopleRole",
    enumParam<"all" | TeamRole>(["all", "pm", "dev", "qa"], "all"),
  );
  const [draggedMemberId, setDraggedMemberId] = useState<string | null>(null);
  const [dropRole, setDropRole] = useState<TeamRole | null>(null);

  const [teamName, setTeamName] = useState("");
  const [teamDescription, setTeamDescription] = useState("");
  const [teamPmId, setTeamPmId] = useState("none");
  const [teamDevIds, setTeamDevIds] = useState<string[]>([]);
  const [teamQaIds, setTeamQaIds] = useState<string[]>([]);
  const [editingTeamId, setEditingTeamId] = useUrlParam(
    "editTeam",
    stringParam("", "push"),
  );
  const updateUrl = useUrlSearchUpdater();

  const membersById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members],
  );
  const pms = members.filter((member) => member.role === "pm");
  const devs = members.filter((member) => member.role === "dev");
  const qa = members.filter((member) => member.role === "qa");
  const visibleMembers = useMemo(() => {
    const query = peopleQuery.trim().toLowerCase();
    return members
      .filter((member) => peopleRole === "all" || member.role === peopleRole)
      .filter((member) => {
        if (!query) return true;
        const manager = member.managerId ? membersById.get(member.managerId)?.name : "";
        return [member.name, member.title, manager]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(query));
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [members, membersById, peopleQuery, peopleRole]);

  const resetTeamForm = () => {
    setEditingTeamId("");
    setTeamName("");
    setTeamDescription("");
    setTeamPmId("none");
    setTeamDevIds([]);
    setTeamQaIds([]);
  };

  useEffect(() => {
    if (!editingTeamId) {
      setTeamName("");
      setTeamDescription("");
      setTeamPmId("none");
      setTeamDevIds([]);
      setTeamQaIds([]);
      return;
    }
    const team = teams.find((item) => item.id === editingTeamId);
    if (!team) {
      updateUrl({ editTeam: undefined }, "replace");
      setTeamName("");
      setTeamDescription("");
      setTeamPmId("none");
      setTeamDevIds([]);
      setTeamQaIds([]);
      return;
    }
    setTeamName(team.name);
    setTeamDescription(team.description ?? "");
    setTeamPmId(team.pmId ?? "none");
    setTeamDevIds(team.devIds);
    setTeamQaIds(team.qaIds);
  }, [editingTeamId, teams, updateUrl]);

  const addMember = () => {
    const name = memberName.trim();
    if (!name) return;
    onSaveMember(
      normalizeTeamMember({
        id: uid(),
        name,
        role: memberRole,
        title: memberTitle.trim() || undefined,
        managerId: managerId === "none" ? undefined : managerId,
      }),
    );
    setMemberName("");
    setMemberTitle("");
    setManagerId("none");
  };

  const moveMemberToRole = (role: TeamRole) => {
    const member = draggedMemberId ? membersById.get(draggedMemberId) : undefined;
    setDraggedMemberId(null);
    setDropRole(null);
    if (!member || member.role === role) return;
    onSaveMember({ ...member, role });
  };

  const addTeam = () => {
    const name = teamName.trim();
    if (!name) return;
    onSaveTeam(
      normalizeProjectTeam({
        id: editingTeamId || uid(),
        name,
        description: teamDescription.trim() || undefined,
        pmId: teamPmId === "none" ? undefined : teamPmId,
        devIds: teamDevIds,
        qaIds: teamQaIds,
        createdAt: teams.find((team) => team.id === editingTeamId)?.createdAt,
      }),
    );
    resetTeamForm();
  };

  const startEditTeam = (team: ProjectTeam) => {
    setEditingTeamId(team.id);
    setTeamName(team.name);
    setTeamDescription(team.description ?? "");
    setTeamPmId(team.pmId ?? "none");
    setTeamDevIds(team.devIds);
    setTeamQaIds(team.qaIds);
  };

  return (
    <section
      id="teams"
      className={cn(embedded ? "px-5 py-5" : "app-workspace rounded-[2rem] px-5 py-5")}
      aria-labelledby="teams-heading"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 id="teams-heading" className="text-sm font-semibold text-foreground">
            {mode === "people"
              ? "People directory"
              : mode === "teams"
                ? "Organisation teams"
                : "Teams"}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {mode === "people"
              ? `${members.length} people across PM, development, and QA`
              : mode === "teams"
                ? `${teams.length} teams built from the people directory`
                : `${members.length} people · ${teams.length} organisation teams`}
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UsersRound className="h-4 w-4" />
        </div>
      </div>

      <div className="grid gap-3">
        {mode !== "teams" ? (
          <>
            <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
              <div className="app-panel-muted h-fit rounded-[1.35rem] px-4 py-4">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-foreground">Add person</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Create the person first, then assign them directly to projects or organisation
                    teams.
                  </p>
                </div>
                <div className="grid gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="memberName" className="text-xs">
                      Full name
                    </Label>
                    <Input
                      id="memberName"
                      value={memberName}
                      onChange={(event) => setMemberName(event.target.value)}
                      placeholder="Person’s name"
                      className="h-10"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Role</Label>
                      <Select
                        value={memberRole}
                        onValueChange={(value) => setMemberRole(value as TeamRole)}
                      >
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pm">Project manager</SelectItem>
                          <SelectItem value="dev">Developer</SelectItem>
                          <SelectItem value="qa">QA</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Reports to</Label>
                      <Select value={managerId} onValueChange={setManagerId}>
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No manager</SelectItem>
                          {members.map((member) => (
                            <SelectItem key={member.id} value={member.id}>
                              {member.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="memberTitle" className="text-xs">
                      Job title
                    </Label>
                    <Input
                      id="memberTitle"
                      value={memberTitle}
                      onChange={(event) => setMemberTitle(event.target.value)}
                      placeholder="Optional job title"
                      className="h-10"
                    />
                  </div>
                  <Button
                    className="mt-1 h-10 w-full"
                    onClick={addMember}
                    disabled={!memberName.trim()}
                  >
                    <Plus className="h-4 w-4" />
                    Add person
                  </Button>
                </div>
              </div>

              <div className="min-w-0">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={peopleQuery}
                      onChange={(event) => setPeopleQuery(event.target.value)}
                      placeholder="Search name, title, or manager"
                      className="h-10 pl-9"
                    />
                  </div>
                  <Select
                    value={peopleRole}
                    onValueChange={(value) => setPeopleRole(value as "all" | TeamRole)}
                  >
                    <SelectTrigger className="h-10 sm:w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All roles</SelectItem>
                      <SelectItem value="pm">Project managers</SelectItem>
                      <SelectItem value="dev">Developers</SelectItem>
                      <SelectItem value="qa">QA</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  {(peopleRole === "all" ? (["pm", "dev", "qa"] as TeamRole[]) : [peopleRole]).map(
                    (role) => {
                      const roleMembers = visibleMembers.filter((member) => member.role === role);
                      return (
                        <section
                          key={role}
                          className={cn(
                            "overflow-hidden rounded-[1.2rem] border bg-background transition-[border-color,background-color,transform] duration-200",
                            dropRole === role
                              ? "scale-[1.01] border-primary bg-primary/5"
                              : "border-border/70",
                            role === "dev" && "lg:row-span-2",
                          )}
                          onDragOver={(event) => {
                            if (!draggedMemberId) return;
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            if (dropRole !== role) setDropRole(role);
                          }}
                          onDragLeave={(event) => {
                            if (event.currentTarget.contains(event.relatedTarget as Node | null))
                              return;
                            if (dropRole === role) setDropRole(null);
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            moveMemberToRole(role);
                          }}
                        >
                          <div className="flex items-center justify-between border-b border-border/70 bg-muted/35 px-3 py-2.5">
                            <div>
                              <div className="text-xs font-semibold text-foreground">
                                {role === "pm"
                                  ? "Project managers"
                                  : role === "dev"
                                    ? "Developers"
                                    : "Quality Assurance"}
                              </div>
                              <div className="mt-0.5 text-[10px] text-muted-foreground">
                                {dropRole === role ? "Release to change role" : "Drop people here"}
                              </div>
                            </div>
                            <Badge variant="outline" className={roleTone[role]}>
                              {roleMembers.length}
                            </Badge>
                          </div>
                          <div className="divide-y divide-border/70">
                            {roleMembers.length ? (
                              roleMembers.map((member) => (
                                <PersonDirectoryRow
                                  key={member.id}
                                  member={member}
                                  manager={
                                    member.managerId ? membersById.get(member.managerId) : undefined
                                  }
                                  dragging={draggedMemberId === member.id}
                                  onDragStart={(event) => {
                                    event.dataTransfer.effectAllowed = "move";
                                    event.dataTransfer.setData("text/plain", member.id);
                                    setDraggedMemberId(member.id);
                                  }}
                                  onDragEnd={() => {
                                    setDraggedMemberId(null);
                                    setDropRole(null);
                                  }}
                                  onDelete={() => onDeleteMember(member.id)}
                                />
                              ))
                            ) : (
                              <div className="px-4 py-7 text-center">
                                <p className="text-xs font-medium text-foreground">
                                  {peopleQuery.trim()
                                    ? "No matching people"
                                    : role === "qa"
                                      ? "No Quality Assurance people yet"
                                      : `No ${role === "pm" ? "project managers" : "developers"} yet`}
                                </p>
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                  {peopleQuery.trim()
                                    ? "Try a different search."
                                    : "Use the Add person form to create one."}
                                </p>
                              </div>
                            )}
                          </div>
                        </section>
                      );
                    },
                  )}
                </div>
              </div>
            </div>
          </>
        ) : null}

        {mode !== "people" ? (
          <>
            <div className="app-panel-muted rounded-[1.35rem] px-3 py-3">
              <div className="grid gap-2">
                <Input
                  value={teamName}
                  onChange={(event) => setTeamName(event.target.value)}
                  placeholder="Team name"
                  className="h-9"
                />
                <Textarea
                  value={teamDescription}
                  onChange={(event) => setTeamDescription(event.target.value)}
                  placeholder="Team focus"
                  rows={2}
                  className="min-h-[60px] text-xs"
                />
                <Select value={teamPmId} onValueChange={setTeamPmId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="PM lead" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No PM lead</SelectItem>
                    {pms.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <MemberPicker
                  label="Developers"
                  members={devs}
                  selectedIds={teamDevIds}
                  onToggle={(id) => toggleId(id, teamDevIds, setTeamDevIds)}
                />
                <MemberPicker
                  label="QA"
                  members={qa}
                  selectedIds={teamQaIds}
                  onToggle={(id) => toggleId(id, teamQaIds, setTeamQaIds)}
                />
                <Button
                  onClick={addTeam}
                  disabled={!teamName.trim()}
                  className="h-9 justify-self-start"
                >
                  {editingTeamId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {editingTeamId ? "Save team" : "Create team"}
                </Button>
                {editingTeamId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={resetTeamForm}
                    className="h-9 justify-self-start"
                  >
                    <X className="h-4 w-4" />
                    Cancel edit
                  </Button>
                ) : null}
              </div>
            </div>

            {teams.length > 0 && (
              <div className="space-y-2">
                {teams.map((team) => {
                  const pm = team.pmId ? membersById.get(team.pmId) : undefined;
                  const devNames = team.devIds
                    .map((id) => membersById.get(id)?.name)
                    .filter(Boolean);
                  const qaNames = team.qaIds.map((id) => membersById.get(id)?.name).filter(Boolean);
                  return (
                    <div key={team.id} className="app-panel-muted rounded-[1.2rem] px-3 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-medium text-foreground">
                            {team.name}
                          </h3>
                          {team.description && (
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                              {team.description}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => startEditTeam(team)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => onDeleteTeam(team.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <p>PM: {pm?.name ?? "Unassigned"}</p>
                        <p>Dev: {devNames.length ? devNames.join(", ") : "Unassigned"}</p>
                        <p>QA: {qaNames.length ? qaNames.join(", ") : "Unassigned"}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : null}
      </div>
    </section>
  );
}

function MemberPicker({
  label,
  members,
  onToggle,
  selectedIds,
}: {
  label: string;
  members: TeamMember[];
  onToggle: (id: string) => void;
  selectedIds: string[];
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex min-h-9 flex-wrap gap-1.5 rounded-[1rem] border border-input bg-background/75 px-2 py-1.5">
        {members.length === 0 ? (
          <span className="py-1 text-xs text-muted-foreground">None created</span>
        ) : (
          members.map((member) => {
            const selected = selectedIds.includes(member.id);
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => onToggle(member.id)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  selected
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {member.name}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function PersonDirectoryRow({
  dragging,
  manager,
  member,
  onDelete,
  onDragEnd,
  onDragStart,
}: {
  dragging: boolean;
  manager?: TeamMember;
  member: TeamMember;
  onDelete: () => void;
  onDragEnd: () => void;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "flex cursor-grab items-center justify-between gap-3 px-3 py-3 transition-[background-color,opacity,transform] hover:bg-muted/25 active:cursor-grabbing",
        dragging && "scale-[0.99] opacity-40",
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-foreground">{member.name}</div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {displayMemberTitle(member)}
          {manager ? ` · reports to ${manager.name}` : ""}
        </p>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
        aria-label={`Remove ${member.name}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function toggleId(id: string, selectedIds: string[], setSelectedIds: (ids: string[]) => void) {
  setSelectedIds(
    selectedIds.includes(id)
      ? selectedIds.filter((selectedId) => selectedId !== id)
      : [...selectedIds, id],
  );
}
