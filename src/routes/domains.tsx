import {
  ArrowClockwise,
  ArrowSquareOut,
  CalendarBlank,
  GlobeHemisphereWest,
  LockKey,
  Plus,
  ShieldWarning,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  addDomainMonitor,
  deleteDomainMonitor,
  listDomainMonitors,
  refreshDomainMonitor,
} from "@/lib/domain-monitor.functions";
import {
  daysUntil,
  domainHealth,
  expiryHealth,
  type DomainHealth,
  type DomainMonitor,
} from "@/lib/domain-monitor";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/domains")({
  head: () => ({
    meta: [
      { title: "Domain Watch | OpsDesk" },
      {
        name: "description",
        content: "Track SSL certificate and domain-registration expiry dates.",
      },
    ],
  }),
  component: DomainsPage,
});

const healthLabel: Record<DomainHealth, string> = {
  healthy: "Healthy",
  attention: "Renew soon",
  critical: "Action required",
  unknown: "Check incomplete",
};

const healthTone: Record<DomainHealth, string> = {
  healthy: "border-success/25 bg-success/10 text-success",
  attention: "border-warning/35 bg-warning/15 text-warning-foreground",
  critical: "border-destructive/25 bg-destructive/10 text-destructive",
  unknown: "border-border bg-muted/70 text-muted-foreground",
};

function DomainsPage() {
  const [domains, setDomains] = useState<DomainMonitor[]>([]);
  const [hostname, setHostname] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());
  const [pageError, setPageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DomainMonitor | null>(null);

  const load = async () => {
    setLoading(true);
    setPageError(null);
    try {
      setDomains(await listDomainMonitors());
    } catch (error) {
      console.error("Failed to load domain monitors", error);
      setPageError(errorMessage(error, "Domain records could not be loaded."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const sortedDomains = useMemo(
    () =>
      [...domains].sort((left, right) => {
        const leftExpiry = Math.min(
          left.sslExpiresAt ?? Number.MAX_SAFE_INTEGER,
          left.domainExpiresAt ?? Number.MAX_SAFE_INTEGER,
        );
        const rightExpiry = Math.min(
          right.sslExpiresAt ?? Number.MAX_SAFE_INTEGER,
          right.domainExpiresAt ?? Number.MAX_SAFE_INTEGER,
        );
        return leftExpiry - rightExpiry || left.hostname.localeCompare(right.hostname);
      }),
    [domains],
  );

  const counts = useMemo(() => {
    const result: Record<DomainHealth, number> = {
      healthy: 0,
      attention: 0,
      critical: 0,
      unknown: 0,
    };
    for (const domain of domains) result[domainHealth(domain)] += 1;
    return result;
  }, [domains]);

  const addDomain = async (event: FormEvent) => {
    event.preventDefault();
    if (!hostname.trim()) return;
    setAdding(true);
    setFormError(null);
    try {
      const domain = await addDomainMonitor({ data: { hostname } });
      setDomains((current) => [domain, ...current.filter((item) => item.id !== domain.id)]);
      setHostname("");
    } catch (error) {
      console.error("Failed to add domain monitor", error);
      setFormError(errorMessage(error, "The domain could not be checked."));
    } finally {
      setAdding(false);
    }
  };

  const refreshOne = async (id: string) => {
    setRefreshing((current) => new Set(current).add(id));
    try {
      const domain = await refreshDomainMonitor({ data: { id } });
      setDomains((current) => current.map((item) => (item.id === id ? domain : item)));
    } catch (error) {
      console.error("Failed to refresh domain monitor", error);
      setPageError(errorMessage(error, "The domain check could not be refreshed."));
    } finally {
      setRefreshing((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  };

  const refreshAll = async () => {
    setPageError(null);
    await Promise.all(domains.map((domain) => refreshOne(domain.id)));
  };

  const removeDomain = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteDomainMonitor({ data: { id: target.id } });
      setDomains((current) => current.filter((domain) => domain.id !== target.id));
    } catch (error) {
      console.error("Failed to remove domain monitor", error);
      setPageError(errorMessage(error, "The domain could not be removed."));
    }
  };

  const refreshingAll = domains.length > 0 && refreshing.size === domains.length;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-card/80 shadow-[var(--shadow-surface)]">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[48%] bg-[radial-gradient(circle_at_65%_35%,color-mix(in_oklab,var(--color-primary)_17%,transparent),transparent_62%)] lg:block" />
        <div className="relative grid gap-8 px-5 py-7 sm:px-7 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)] lg:px-9 lg:py-9">
          <div className="max-w-3xl">
            <div className="app-kicker flex items-center gap-2 text-primary">
              <GlobeHemisphereWest className="h-4 w-4" weight="duotone" />
              Infrastructure watch
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-foreground sm:text-4xl">
              Domain Watch
            </h1>
            <p className="mt-3 max-w-[62ch] text-sm leading-6 text-muted-foreground sm:text-base">
              Keep renewals visible before they become incidents. Each check reads the certificate
              presented on port 443 and the registration expiry published by the domain registry.
            </p>

            <form className="mt-7 max-w-2xl" onSubmit={(event) => void addDomain(event)}>
              <label className="text-xs font-semibold text-foreground" htmlFor="domain-hostname">
                Domain name
              </label>
              <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Input
                  id="domain-hostname"
                  autoCapitalize="none"
                  autoComplete="url"
                  className="h-11 rounded-xl bg-background/80 px-4"
                  disabled={adding}
                  onChange={(event) => setHostname(event.target.value)}
                  placeholder="example.com"
                  spellCheck={false}
                  value={hostname}
                />
                <Button className="h-11 px-5" disabled={adding || !hostname.trim()} type="submit">
                  {adding ? <ArrowClockwise className="animate-spin" /> : <Plus weight="bold" />}
                  {adding ? "Checking domain" : "Add domain"}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Paste a domain or full URL. The hostname is normalised before it is saved.
              </p>
              {formError ? (
                <p
                  className="mt-2 flex items-center gap-2 text-xs font-medium text-destructive"
                  role="alert"
                >
                  <WarningCircle className="h-4 w-4" weight="fill" />
                  {formError}
                </p>
              ) : null}
            </form>
          </div>

          <div className="self-end rounded-[1.5rem] border border-border/75 bg-background/72 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="app-kicker">Renewal posture</div>
                <div className="mt-2 text-base font-semibold text-foreground">
                  {loading
                    ? "Loading watch list"
                    : domains.length === 0
                      ? "Ready for your first domain"
                      : counts.critical > 0
                        ? `${counts.critical} require immediate action`
                        : counts.attention > 0
                          ? `${counts.attention} approaching renewal`
                          : "No urgent renewals"}
                </div>
              </div>
              <span
                className={cn(
                  "relative mt-1 flex h-3 w-3 rounded-full",
                  counts.critical > 0
                    ? "bg-destructive"
                    : counts.attention > 0
                      ? "bg-warning"
                      : "bg-success",
                )}
              >
                {!loading && counts.critical === 0 ? (
                  <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-30" />
                ) : null}
              </span>
            </div>
            <div className="mt-5 grid grid-cols-3 divide-x divide-border/70 border-t border-border/70 pt-5">
              <HeroMetric label="Tracked" value={loading ? "—" : domains.length} />
              <HeroMetric label="Renew soon" value={loading ? "—" : counts.attention} />
              <HeroMetric label="Critical" value={loading ? "—" : counts.critical} />
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-border/70 bg-card/82 shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-3 border-b border-border/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Monitored domains</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Nearest expiry first. Renew-soon begins at 45 days; critical begins at 14 days.
            </p>
          </div>
          <Button
            className="w-fit"
            disabled={loading || domains.length === 0 || refreshing.size > 0}
            onClick={() => void refreshAll()}
            size="sm"
            variant="outline"
          >
            <ArrowClockwise className={cn(refreshingAll && "animate-spin")} />
            Refresh all
          </Button>
        </div>

        {pageError ? (
          <div
            className="flex items-start gap-3 border-b border-destructive/15 bg-destructive/6 px-5 py-3 text-sm text-destructive"
            role="alert"
          >
            <WarningCircle className="mt-0.5 h-4 w-4 shrink-0" weight="fill" />
            <span>{pageError}</span>
          </div>
        ) : null}

        {loading ? (
          <DomainListSkeleton />
        ) : sortedDomains.length === 0 ? (
          <DomainEmptyState />
        ) : (
          <div className="divide-y divide-border/70">
            <div className="hidden grid-cols-[minmax(220px,1.2fr)_minmax(220px,0.9fr)_minmax(220px,0.9fr)_150px_88px] gap-5 bg-muted/35 px-6 py-2.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground lg:grid">
              <span>Domain</span>
              <span>SSL certificate</span>
              <span>Registration</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>
            {sortedDomains.map((domain) => (
              <DomainRow
                domain={domain}
                key={domain.id}
                onDelete={() => setDeleteTarget(domain)}
                onRefresh={() => void refreshOne(domain.id)}
                refreshing={refreshing.has(domain.id)}
              />
            ))}
          </div>
        )}
      </section>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent className="rounded-[1.5rem] border-border/80">
          <AlertDialogHeader>
            <AlertDialogTitle>Stop monitoring this domain?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.hostname} will be removed from Domain Watch. This does not change the
              domain, DNS, certificate, or registration itself.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep domain</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => void removeDomain()}
            >
              Remove monitor
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DomainRow({
  domain,
  onDelete,
  onRefresh,
  refreshing,
}: {
  domain: DomainMonitor;
  onDelete: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const health = domainHealth(domain);

  return (
    <article className="grid gap-5 px-5 py-5 transition-colors hover:bg-muted/24 sm:px-6 lg:grid-cols-[minmax(220px,1.2fr)_minmax(220px,0.9fr)_minmax(220px,0.9fr)_150px_88px] lg:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/75 bg-background text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <GlobeHemisphereWest className="h-5 w-5" weight="duotone" />
          </div>
          <div className="min-w-0">
            <a
              className="group flex w-fit max-w-full items-center gap-1.5 font-semibold text-foreground hover:text-primary"
              href={`https://${domain.hostname}`}
              rel="noreferrer"
              target="_blank"
            >
              <span className="truncate">{domain.hostname}</span>
              <ArrowSquareOut className="h-3.5 w-3.5 shrink-0 opacity-45 transition-opacity group-hover:opacity-100" />
            </a>
            <p className="mt-1 text-xs text-muted-foreground">
              {domain.checkedAt ? `Checked ${relativeTime(domain.checkedAt)}` : "Not checked yet"}
            </p>
          </div>
        </div>
      </div>

      <ExpiryCell
        error={domain.sslError}
        icon={<LockKey className="h-4 w-4" weight="duotone" />}
        meta={domain.sslIssuer}
        timestamp={domain.sslExpiresAt}
      />
      <ExpiryCell
        error={domain.domainError}
        icon={<CalendarBlank className="h-4 w-4" weight="duotone" />}
        meta={domain.registrar}
        timestamp={domain.domainExpiresAt}
      />

      <div>
        <Badge
          className={cn("rounded-full px-2.5 py-1 text-[10px]", healthTone[health])}
          variant="outline"
        >
          {healthLabel[health]}
        </Badge>
      </div>

      <div className="flex items-center gap-1 lg:justify-end">
        <Button
          aria-label={`Refresh ${domain.hostname}`}
          disabled={refreshing}
          onClick={onRefresh}
          size="icon"
          variant="ghost"
        >
          <ArrowClockwise className={cn(refreshing && "animate-spin")} />
        </Button>
        <Button
          aria-label={`Remove ${domain.hostname}`}
          onClick={onDelete}
          size="icon"
          variant="ghost"
        >
          <Trash className="text-muted-foreground" />
        </Button>
      </div>
    </article>
  );
}

function ExpiryCell({
  error,
  icon,
  meta,
  timestamp,
}: {
  error?: string;
  icon: ReactNode;
  meta?: string;
  timestamp?: number;
}) {
  if (!timestamp) {
    return (
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <ShieldWarning className="h-4 w-4 text-warning-foreground" weight="duotone" />
          Date unavailable
        </div>
        <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground" title={error}>
          {error || "Run the check again."}
        </p>
      </div>
    );
  }

  const health = expiryHealth(timestamp);
  const days = daysUntil(timestamp);

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <span
          className={cn(
            health === "critical"
              ? "text-destructive"
              : health === "attention"
                ? "text-warning-foreground"
                : "text-success",
          )}
        >
          {icon}
        </span>
        {formatDate(timestamp)}
      </div>
      <p className="mt-1 truncate text-[11px] text-muted-foreground" title={meta}>
        {days !== null && days < 0 ? `${Math.abs(days)} days expired` : `${days} days remaining`}
        {meta ? ` · ${meta}` : ""}
      </p>
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="px-3 first:pl-0 last:pr-0">
      <div className="app-mono text-lg font-semibold text-foreground">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function DomainListSkeleton() {
  return (
    <div className="divide-y divide-border/70">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          className="grid gap-5 px-6 py-5 lg:grid-cols-[minmax(220px,1.2fr)_minmax(220px,0.9fr)_minmax(220px,0.9fr)_150px_88px]"
          key={index}
        >
          <Skeleton className="h-10 w-48 rounded-xl" />
          <Skeleton className="h-9 w-40 rounded-lg" />
          <Skeleton className="h-9 w-40 rounded-lg" />
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-9 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function DomainEmptyState() {
  return (
    <div className="flex flex-col items-start px-6 py-14 sm:px-10 sm:py-16">
      <div className="flex h-14 w-14 items-center justify-center rounded-[1.2rem] border border-primary/15 bg-primary/8 text-primary">
        <GlobeHemisphereWest className="h-7 w-7" weight="duotone" />
      </div>
      <h3 className="mt-5 text-lg font-semibold tracking-tight text-foreground">
        No domains monitored yet
      </h3>
      <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
        Add the first production domain above. Domain Watch will save it, inspect its SSL
        certificate, and query the responsible registry for its renewal date.
      </p>
    </div>
  );
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}

function relativeTime(timestamp: number) {
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
