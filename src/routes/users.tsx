import {
  Check,
  FolderSimple,
  Key,
  LockKey,
  Plus,
  ShieldCheck,
  UserCircle,
  UsersThree,
} from "@phosphor-icons/react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { stringParam, useUrlParam } from "@/hooks/use-url-state";
import {
  APP_ROLES,
  hasPermission,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  type AppRole,
  type AuthUser,
} from "@/lib/auth";
import {
  createAppUser,
  listAppUsers,
  resetAppUserPassword,
  updateAppUser,
  updateAppUserProjects,
} from "@/lib/auth.functions";
import { listProjects } from "@/lib/project.functions";
import type { Project } from "@/lib/tracker-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/users")({
  beforeLoad: ({ context }) => {
    if (!hasPermission(context.currentUser, "users:manage")) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      { title: "Users & access | OpsDesk" },
      { name: "description", content: "Manage OpsDesk accounts and role-based access." },
    ],
  }),
  component: UsersPage,
});

const permissionLabels = {
  "projects:view": "View projects",
  "projects:manage": "Manage projects",
  "teams:view": "View teams",
  "teams:manage": "Manage teams",
  "domains:view": "View domains",
  "domains:manage": "Manage domains",
  "users:manage": "Manage users",
} as const;

function UsersPage() {
  const { currentUser } = Route.useRouteContext();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [userDialog, setUserDialog] = useUrlParam("user", stringParam("", "push"));
  const createOpen = userDialog === "new";
  const resetTarget = userDialog.startsWith("reset:")
    ? users.find((user) => user.id === userDialog.slice(6)) ?? null
    : null;
  const accessTarget = userDialog.startsWith("access:")
    ? users.find((user) => user.id === userDialog.slice(7)) ?? null
    : null;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [userData, projectData] = await Promise.all([listAppUsers(), listProjects()]);
      setUsers(userData);
      setProjects(projectData.filter((project) => !project.isDraft));
    } catch (cause) {
      console.error("Failed to load users", cause);
      setError("User accounts could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const counts = useMemo(
    () => ({
      active: users.filter((user) => user.status === "active").length,
      admins: users.filter((user) => user.role === "admin" && user.status === "active").length,
    }),
    [users],
  );

  const update = async (user: AuthUser, changes: Partial<Pick<AuthUser, "role" | "status">>) => {
    setSavingId(user.id);
    setError(null);
    try {
      const updated = await updateAppUser({
        data: {
          id: user.id,
          role: changes.role ?? user.role,
          status: changes.status ?? user.status,
        },
      });
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (cause) {
      console.error("Failed to update user", cause);
      setError(cause instanceof Error ? cause.message : "The account could not be updated.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <section className="app-workspace overflow-hidden rounded-[1.8rem]">
        <div className="grid gap-8 px-6 py-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:px-8">
          <div>
            <div className="app-kicker">Identity & access</div>
            <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.045em] text-foreground sm:text-4xl">
              Give every person the access their role requires.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Administrators control accounts. Project managers can operate delivery data, while
              viewers have read-only workspace access.
            </p>
          </div>
          <div className="flex items-end">
            <Button
              onClick={() => setUserDialog("new")}
              className="h-11 rounded-xl px-5 active:translate-y-px"
            >
              <Plus size={16} weight="bold" />
              Add user
            </Button>
          </div>
        </div>
        <div className="grid border-t border-border/80 sm:grid-cols-3 sm:divide-x sm:divide-border/80">
          <Metric label="Total accounts" value={users.length} icon={<UsersThree size={17} />} />
          <Metric label="Active accounts" value={counts.active} icon={<Check size={17} />} />
          <Metric label="Administrators" value={counts.admins} icon={<ShieldCheck size={17} />} />
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,.75fr)]">
        <section className="app-workspace overflow-hidden rounded-[1.8rem]">
          <div className="flex items-center justify-between border-b border-border/80 px-6 py-5">
            <div>
              <h2 className="text-base font-semibold tracking-[-0.025em]">Workspace users</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Changes to roles apply immediately.
              </p>
            </div>
            <Badge variant="outline" className="rounded-full font-normal">
              {counts.active} active
            </Badge>
          </div>

          {loading ? (
            <div className="space-y-0 divide-y divide-border/70 px-6">
              {[0, 1, 2].map((item) => (
                <div key={item} className="flex items-center gap-4 py-5">
                  <Skeleton className="h-11 w-11 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                  <Skeleton className="h-9 w-32 rounded-lg" />
                </div>
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <UserCircle size={36} className="mx-auto text-muted-foreground" />
              <h3 className="mt-4 text-sm font-semibold">No accounts yet</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Add the first OpsDesk user to begin.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/70">
              {users.map((user) => {
                const isSelf = user.id === currentUser?.id;
                const busy = savingId === user.id;
                return (
                  <div
                    key={user.id}
                    className={cn("px-5 py-5 transition-opacity sm:px-6", busy && "opacity-60")}
                  >
                    <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_150px_120px_auto_auto]">
                      <div className="flex min-w-0 items-center gap-3.5">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                          {initials(user.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold tracking-[-0.02em]">
                              {user.name}
                            </span>
                            {isSelf && (
                              <Badge className="rounded-full bg-primary/10 text-[10px] text-primary hover:bg-primary/10">
                                You
                              </Badge>
                            )}
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {user.email}
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {user.lastLoginAt
                              ? `Last sign-in ${formatDate(user.lastLoginAt)}`
                              : "Has not signed in"}
                          </div>
                        </div>
                      </div>
                      <select
                        value={user.role}
                        disabled={busy}
                        onChange={(event) =>
                          void update(user, { role: event.target.value as AppRole })
                        }
                        className="h-9 rounded-lg border border-input bg-background px-3 text-xs outline-none focus:ring-2 focus:ring-ring"
                        aria-label={`Role for ${user.name}`}
                      >
                        {APP_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busy || isSelf}
                        onClick={() =>
                          void update(user, {
                            status: user.status === "active" ? "suspended" : "active",
                          })
                        }
                        className={cn(
                          "h-9 rounded-lg border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                          user.status === "active"
                            ? "border-success/25 bg-success/8 text-success"
                            : "border-border bg-muted text-muted-foreground",
                        )}
                      >
                        {user.status === "active" ? "Active" : "Suspended"}
                      </button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setUserDialog(`access:${user.id}`)}
                        disabled={busy}
                        title={user.role === "admin" ? "Administrators can view every project" : undefined}
                      >
                        <FolderSimple size={14} />
                        {user.role === "admin" ? "All projects" : `${user.projectIds.length} projects`}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setUserDialog(`reset:${user.id}`)}
                        disabled={busy}
                      >
                        <Key size={14} />
                        Reset
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="app-workspace overflow-hidden rounded-[1.8rem]">
          <div className="border-b border-border/80 px-6 py-5">
            <h2 className="text-base font-semibold tracking-[-0.025em]">Role permissions</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              A clear view of the current RBAC policy.
            </p>
          </div>
          <div className="divide-y divide-border/70">
            {APP_ROLES.map((role) => (
              <div key={role} className="px-6 py-5">
                <div className="flex items-center gap-2">
                  <LockKey size={16} className="text-primary" weight="duotone" />
                  <h3 className="text-sm font-semibold">{ROLE_LABELS[role]}</h3>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {ROLE_PERMISSIONS[role].map((permission) => (
                    <span
                      key={permission}
                      className="rounded-full border border-border bg-muted/55 px-2.5 py-1 text-[10px] font-medium text-muted-foreground"
                    >
                      {permissionLabels[permission]}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={(open) => { if (!open) setUserDialog(""); }}
        onCreated={(user) =>
          setUsers((current) => [...current, user].sort((a, b) => a.name.localeCompare(b.name)))
        }
      />
      <ResetPasswordDialog
        target={resetTarget}
        onOpenChange={(open) => !open && setUserDialog("")}
      />
      <ProjectAccessDialog
        target={accessTarget}
        projects={projects}
        onOpenChange={(open) => !open && setUserDialog("")}
        onUpdated={(updated) => {
          setUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)));
        }}
      />
    </div>
  );
}

function ProjectAccessDialog({
  target,
  projects,
  onOpenChange,
  onUpdated,
}: {
  target: AuthUser | null;
  projects: Project[];
  onOpenChange: (open: boolean) => void;
  onUpdated: (user: AuthUser) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelected(target?.projectIds ?? []);
    setError(null);
  }, [target]);

  const save = async () => {
    if (!target || target.role === "admin") return;
    setSaving(true);
    setError(null);
    try {
      onUpdated(await updateAppUserProjects({ data: { id: target.id, projectIds: selected } }));
      onOpenChange(false);
    } catch (cause) {
      console.error("Failed to update project access", cause);
      setError(cause instanceof Error ? cause.message : "Project access could not be updated.");
    } finally {
      setSaving(false);
    }
  };

  const isAdmin = target?.role === "admin";
  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[1.5rem] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Project access</DialogTitle>
          <DialogDescription>
            {isAdmin
              ? `${target?.name} is an administrator and can view every project.`
              : `Choose the projects ${target?.name ?? "this user"} can view. Their project and team statistics will use the same scope.`}
          </DialogDescription>
        </DialogHeader>
        {!isAdmin && (
          <>
            <div className="flex items-center justify-between border-b border-border/70 pb-3 text-xs">
              <span className="text-muted-foreground">{selected.length} of {projects.length} selected</span>
              <div className="flex gap-3">
                <button type="button" className="font-medium text-primary" onClick={() => setSelected(projects.map((project) => project.id))}>Select all</button>
                <button type="button" className="font-medium text-muted-foreground" onClick={() => setSelected([])}>Clear</button>
              </div>
            </div>
            <div className="max-h-[45vh] space-y-1 overflow-y-auto pr-1">
              {projects.map((project) => {
                const checked = selected.includes(project.id);
                return (
                  <label key={project.id} className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-muted/60">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setSelected((current) => checked ? current.filter((id) => id !== project.id) : [...current, project.id])}
                      className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{project.name}</span>
                      <span className="mt-0.5 block text-[11px] capitalize text-muted-foreground">{project.status.replace("_", " ")} · {project.phase.replace("_", " ")}</span>
                    </span>
                  </label>
                );
              })}
              {projects.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No projects are available.</p>}
            </div>
          </>
        )}
        {error && <div role="alert" className="text-sm text-destructive">{error}</div>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {!isAdmin && <Button type="button" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save access"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-6 py-4">
      <span className="text-primary">{icon}</span>
      <div>
        <div className="app-mono text-lg font-semibold">{value}</div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (user: AuthUser) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("viewer");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const user = await createAppUser({ data: { name, email, password, role } });
      onCreated(user);
      setName("");
      setEmail("");
      setPassword("");
      setRole("viewer");
      onOpenChange(false);
    } catch (cause) {
      console.error("Failed to create user", cause);
      setError("The account could not be created. Check that the email is unique.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[1.5rem] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add an OpsDesk user</DialogTitle>
          <DialogDescription>
            Create credentials and select the person’s starting role.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Full name" id="new-name">
            <Input
              id="new-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              required
            />
          </Field>
          <Field label="Email address" id="new-email">
            <Input
              id="new-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Field>
          <Field label="Temporary password" id="new-password" helper="At least 12 characters.">
            <Input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={12}
              required
            />
          </Field>
          <Field label="Role" id="new-role">
            <select
              id="new-role"
              value={role}
              onChange={(e) => setRole(e.target.value as AppRole)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {APP_ROLES.map((item) => (
                <option key={item} value={item}>
                  {ROLE_LABELS[item]}
                </option>
              ))}
            </select>
          </Field>
          {error && (
            <div role="alert" className="text-sm text-destructive">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  target,
  onOpenChange,
}: {
  target: AuthUser | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target) {
      setPassword("");
      setComplete(false);
      setError(null);
    }
  }, [target]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!target) return;
    setSaving(true);
    setError(null);
    try {
      await resetAppUserPassword({ data: { id: target.id, password } });
      setComplete(true);
      setPassword("");
    } catch (cause) {
      console.error("Failed to reset password", cause);
      setError("The password could not be reset.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(target)} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[1.5rem] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for {target?.name}. Other sessions will be signed out.
          </DialogDescription>
        </DialogHeader>
        {complete ? (
          <div className="rounded-xl border border-success/25 bg-success/8 px-4 py-4 text-sm text-success">
            Password updated successfully.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="New password" id="reset-password" helper="At least 12 characters.">
              <Input
                id="reset-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={12}
                required
                autoFocus
              />
            </Field>
            {error && (
              <div role="alert" className="text-sm text-destructive">
                {error}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Updating…" : "Update password"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  id,
  helper,
  children,
}: {
  label: string;
  id: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {helper && <p className="text-[11px] text-muted-foreground">{helper}</p>}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
function formatDate(value: number) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
