import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  cloneTeamMapTreeConfig,
  emptyTreeRequirements,
  makeTreeId,
  type TeamMapTreeConfig,
  type TeamMapTreeProject,
  type TreeCategory,
  type TreeOrgNode,
  type TreePersonRole,
  type TreePersonStatus,
} from "@/lib/team-map-config";
import { projectTagLabel } from "@/lib/tracker-types";
import { cn } from "@/lib/utils";
import { booleanParam, enumParam, stringParam, useUrlParam } from "@/hooks/use-url-state";

const categoryOptions: Array<{ value: TreeCategory; label: string }> = [
  { value: "education", label: projectTagLabel.education },
  { value: "internal_tools", label: projectTagLabel.internal_tools },
  { value: "b2c", label: projectTagLabel.b2c },
  { value: "websites", label: projectTagLabel.websites },
  { value: "untagged", label: "Untagged" },
];

const personRoleLabels: Record<TreePersonRole, string> = {
  dev: "Developer",
  qa: "QA",
  support: "Support",
  web: "Web developer",
};

export function TreeCustomizer({
  config,
  onSave,
}: {
  config: TeamMapTreeConfig;
  onSave: (config: TeamMapTreeConfig) => Promise<void>;
}) {
  const [open, setOpen] = useUrlParam("treeCustomize", booleanParam());
  const [draft, setDraft] = useState(() => cloneTeamMapTreeConfig(config));
  const [selectedProjectId, setSelectedProjectId] = useUrlParam(
    "treeProject",
    stringParam(config.projects[0]?.id ?? "", "push"),
  );
  const [section, setSection] = useUrlParam(
    "treeSection",
    enumParam(["projects", "organisation"] as const, "projects"),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const next = cloneTeamMapTreeConfig(config);
    setDraft(next);
    setSelectedProjectId((current) =>
      next.projects.some((project) => project.id === current)
        ? current
        : (next.projects[0]?.id ?? ""),
    );
    setSaveError(null);
  }, [config, open, setSelectedProjectId]);

  const selectedProject = useMemo(
    () => draft.projects.find((project) => project.id === selectedProjectId),
    [draft.projects, selectedProjectId],
  );

  const updateProject = (projectId: string, update: (project: TeamMapTreeProject) => void) => {
    setDraft((current) => {
      const next = cloneTeamMapTreeConfig(current);
      const project = next.projects.find((candidate) => candidate.id === projectId);
      if (project) update(project);
      return next;
    });
  };

  const addProject = () => {
    const project: TeamMapTreeProject = {
      id: makeTreeId("custom-project"),
      name: "New project",
      category: "education",
      hidden: false,
      people: [],
      requirements: emptyTreeRequirements(),
    };
    setDraft((current) => ({ ...current, projects: [...current.projects, project] }));
    setSelectedProjectId(project.id);
  };

  const removeProject = (project: TeamMapTreeProject) => {
    if (project.sourceProjectId) {
      updateProject(project.id, (candidate) => {
        candidate.hidden = true;
      });
      return;
    }
    setDraft((current) => ({
      ...current,
      projects: current.projects.filter((candidate) => candidate.id !== project.id),
    }));
    setSelectedProjectId((current) => {
      if (current !== project.id) return current;
      return draft.projects.find((candidate) => candidate.id !== project.id)?.id ?? "";
    });
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave({ ...draft, updatedAt: Date.now() });
      setOpen(false);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "The tree configuration could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Customize tree
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[92dvh] max-w-[1080px] flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-6 pb-4 pt-6">
          <DialogTitle>Customize organisation tree</DialogTitle>
          <DialogDescription>
            Edit custom tree details without changing teams, team members, ticket assignments, or
            project records. Linked developers continue to refresh from live data.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={section}
          onValueChange={(value) => setSection(value as typeof section)}
          className="flex min-h-0 flex-1 flex-col px-6"
        >
          <TabsList className="mt-4 grid w-full max-w-[360px] grid-cols-2">
            <TabsTrigger value="projects">Delivery projects</TabsTrigger>
            <TabsTrigger value="organisation">Organisation roles</TabsTrigger>
          </TabsList>

          <TabsContent value="projects" className="min-h-0 flex-1 overflow-hidden pb-4">
            <div className="grid h-[62dvh] min-h-[430px] grid-cols-1 overflow-hidden rounded-lg border border-border lg:grid-cols-[280px_minmax(0,1fr)]">
              <aside className="flex min-h-0 flex-col border-b border-border bg-muted/25 lg:border-b-0 lg:border-r">
                <div className="flex items-center justify-between border-b border-border px-3 py-3">
                  <div>
                    <div className="text-xs font-semibold text-foreground">Projects</div>
                    <div className="text-[10px] text-muted-foreground">
                      {draft.projects.filter((project) => !project.hidden).length} visible
                    </div>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={addProject}>
                    Add project
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-2">
                  {draft.projects
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((project) => (
                      <button
                        type="button"
                        key={project.id}
                        onClick={() => setSelectedProjectId(project.id)}
                        className={cn(
                          "mb-1 w-full rounded-md border px-3 py-2.5 text-left transition-colors last:mb-0",
                          selectedProjectId === project.id
                            ? "border-primary/30 bg-primary/10"
                            : "border-transparent hover:border-border hover:bg-background",
                          project.hidden && "opacity-55",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-medium text-foreground">
                            {project.name}
                          </span>
                          {project.hidden ? (
                            <Badge variant="outline" className="text-[8px]">
                              Hidden
                            </Badge>
                          ) : null}
                        </div>
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          {
                            categoryOptions.find((option) => option.value === project.category)
                              ?.label
                          }
                          {` · ${project.people.length} people`}
                        </div>
                      </button>
                    ))}
                </div>
              </aside>

              <div className="min-h-0 overflow-y-auto bg-background p-4 sm:p-5">
                {selectedProject ? (
                  <ProjectEditor
                    project={selectedProject}
                    onChange={(update) => updateProject(selectedProject.id, update)}
                    onRemove={() => removeProject(selectedProject)}
                  />
                ) : (
                  <div className="flex min-h-[320px] items-center justify-center text-sm text-muted-foreground">
                    Select a project or add a new one.
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="organisation" className="min-h-0 flex-1 overflow-y-auto pb-4">
            <OrganisationEditor draft={draft} setDraft={setDraft} />
          </TabsContent>
        </Tabs>

        <DialogFooter className="border-t border-border px-6 py-4">
          <div className="mr-auto min-h-5 text-xs text-destructive">{saveError}</div>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save tree"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectEditor({
  project,
  onChange,
  onRemove,
}: {
  project: TeamMapTreeProject;
  onChange: (update: (project: TeamMapTreeProject) => void) => void;
  onRemove: () => void;
}) {
  const addPerson = () => {
    onChange((next) => {
      next.people.push({
        id: makeTreeId("tree-person"),
        name: "New joinee",
        role: "dev",
        status: "new_joinee",
      });
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Project settings</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            These values control only the organisation tree presentation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`visible-${project.id}`} className="text-xs">
            Visible
          </Label>
          <Switch
            id={`visible-${project.id}`}
            checked={!project.hidden}
            onCheckedChange={(checked) => onChange((next) => void (next.hidden = !checked))}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Project name">
          <Input
            value={project.name}
            onChange={(event) => onChange((next) => void (next.name = event.target.value))}
          />
        </Field>
        <Field label="Tree category">
          <Select
            value={project.category}
            onValueChange={(value) =>
              onChange((next) => void (next.category = value as TreeCategory))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div>
        <div className="mb-3">
          <h4 className="text-sm font-semibold text-foreground">More needed</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Planned vacancies shown beneath the assigned people.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {(["dev", "qa", "support"] as const).map((role) => (
            <Field
              key={role}
              label={role === "dev" ? "Developers" : role === "qa" ? "QA" : "Support"}
            >
              <Input
                type="number"
                min={0}
                value={project.requirements[role]}
                onChange={(event) =>
                  onChange((next) => {
                    next.requirements[role] = Math.max(0, Number(event.target.value) || 0);
                  })
                }
              />
            </Field>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-foreground">People and joinees</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Add named colleagues or hiring placeholders, including offer status.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addPerson}>
            Add person
          </Button>
        </div>
        <div className="space-y-2">
          {project.people.length ? (
            project.people.map((person) => (
              <div
                key={person.id}
                className="grid gap-2 rounded-lg border border-border bg-card p-3 sm:grid-cols-[minmax(150px,1fr)_140px_150px_auto]"
              >
                <Input
                  aria-label="Person name"
                  value={person.name}
                  onChange={(event) =>
                    onChange((next) => {
                      const target = next.people.find((candidate) => candidate.id === person.id);
                      if (target) target.name = event.target.value;
                    })
                  }
                />
                <Select
                  value={person.role}
                  onValueChange={(value) =>
                    onChange((next) => {
                      const target = next.people.find((candidate) => candidate.id === person.id);
                      if (target) target.role = value as TreePersonRole;
                    })
                  }
                >
                  <SelectTrigger aria-label="Person role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(personRoleLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={person.status}
                  onValueChange={(value) =>
                    onChange((next) => {
                      const target = next.people.find((candidate) => candidate.id === person.id);
                      if (target) {
                        target.status = value as TreePersonStatus;
                        if (target.status === "existing") target.offerSent = false;
                      }
                    })
                  }
                >
                  <SelectTrigger aria-label="Person status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="existing">Existing team</SelectItem>
                    <SelectItem value="new_joinee">New joinee</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onChange((next) => {
                      next.people = next.people.filter((candidate) => candidate.id !== person.id);
                    })
                  }
                >
                  Remove
                </Button>
                {person.status === "new_joinee" ? (
                  <div className="flex items-center gap-2 sm:col-span-4">
                    <Switch
                      id={`offer-${person.id}`}
                      checked={Boolean(person.offerSent)}
                      onCheckedChange={(checked) =>
                        onChange((next) => {
                          const target = next.people.find(
                            (candidate) => candidate.id === person.id,
                          );
                          if (target) target.offerSent = checked;
                        })
                      }
                    />
                    <Label htmlFor={`offer-${person.id}`} className="text-xs">
                      Offer sent
                    </Label>
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
              No people are displayed for this project.
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onRemove}>
          {project.sourceProjectId ? "Hide project from tree" : "Remove custom project"}
        </Button>
      </div>
    </div>
  );
}

function OrganisationEditor({
  draft,
  setDraft,
}: {
  draft: TeamMapTreeConfig;
  setDraft: Dispatch<SetStateAction<TeamMapTreeConfig>>;
}) {
  const mutate = (update: (next: TeamMapTreeConfig) => void) => {
    setDraft((current) => {
      const next = cloneTeamMapTreeConfig(current);
      update(next);
      return next;
    });
  };

  return (
    <div className="mt-4 space-y-5 pb-4">
      <OrgSection
        title="Project manager vacancies"
        description="Project manager coverage and vacancy labels shown beneath the UK engineering lead."
        nodes={draft.pmVacancies}
        onAdd={() =>
          mutate((next) =>
            next.pmVacancies.push({
              id: makeTreeId("pm-vacancy"),
              name: "New hire",
              role: "Project Manager",
              status: "Interview On-going",
              tone: "vacancy",
            }),
          )
        }
        allowTone
        onChange={(id, update) =>
          mutate((next) => {
            const node = next.pmVacancies.find((candidate) => candidate.id === id);
            if (node) update(node);
          })
        }
        onRemove={(id) =>
          mutate((next) => {
            next.pmVacancies = next.pmVacancies.filter((node) => node.id !== id);
          })
        }
      />

      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-foreground">System Admin & QA lead</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            The parent node for the quality branch.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input
              value={draft.qualityLead.name}
              onChange={(event) =>
                mutate((next) => void (next.qualityLead.name = event.target.value))
              }
            />
          </Field>
          <Field label="Role">
            <Input
              value={draft.qualityLead.role}
              onChange={(event) =>
                mutate((next) => void (next.qualityLead.role = event.target.value))
              }
            />
          </Field>
        </div>
      </section>

      <OrgSection
        title="System Admin & QA reports"
        description="Candidates and vacancies shown beneath the quality lead."
        nodes={draft.qualityReports}
        allowTone
        onAdd={() =>
          mutate((next) =>
            next.qualityReports.push({
              id: makeTreeId("quality-report"),
              name: "New hire",
              role: "System Admin · QA · Support",
              tone: "vacancy",
            }),
          )
        }
        onChange={(id, update) =>
          mutate((next) => {
            const node = next.qualityReports.find((candidate) => candidate.id === id);
            if (node) update(node);
          })
        }
        onRemove={(id) =>
          mutate((next) => {
            next.qualityReports = next.qualityReports.filter((node) => node.id !== id);
          })
        }
      />
    </div>
  );
}

function OrgSection({
  title,
  description,
  nodes,
  allowTone = false,
  onAdd,
  onChange,
  onRemove,
}: {
  title: string;
  description: string;
  nodes: TreeOrgNode[];
  allowTone?: boolean;
  onAdd: () => void;
  onChange: (id: string, update: (node: TreeOrgNode) => void) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          Add position
        </Button>
      </div>
      <div className="space-y-3">
        {nodes.map((node) => (
          <div
            key={node.id}
            className="grid gap-3 rounded-lg border border-border bg-background p-3 sm:grid-cols-2"
          >
            <Field label="Name">
              <Input
                value={node.name}
                onChange={(event) =>
                  onChange(node.id, (next) => void (next.name = event.target.value))
                }
              />
            </Field>
            <Field label="Role">
              <Input
                value={node.role}
                onChange={(event) =>
                  onChange(node.id, (next) => void (next.role = event.target.value))
                }
              />
            </Field>
            <Field label="Status">
              <Input
                value={node.status ?? ""}
                placeholder="Optional status"
                onChange={(event) =>
                  onChange(node.id, (next) => void (next.status = event.target.value || undefined))
                }
              />
            </Field>
            {allowTone ? (
              <Field label="Box style">
                <Select
                  value={node.tone}
                  onValueChange={(value) =>
                    onChange(node.id, (next) => void (next.tone = value as TreeOrgNode["tone"]))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="candidate">Candidate</SelectItem>
                    <SelectItem value="manager">Project manager</SelectItem>
                    <SelectItem value="vacancy">Vacancy</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            ) : (
              <div />
            )}
            <div className="sm:col-span-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(node.id)}>
                Remove position
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
