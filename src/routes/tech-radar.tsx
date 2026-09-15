import {
  ArrowClockwise,
  ArrowSquareOut,
  CalendarBlank,
  CheckCircle,
  Clock,
  Broadcast as Radar,
  GithubLogo,
  NewspaperClipping,
  ShieldCheckered,
} from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { enumParam, useUrlParam } from "@/hooks/use-url-state";
import { getTechRadar } from "@/lib/tech-radar.functions";
import type {
  TechRadarData,
  TechRadarSource,
  TechRadarSourceId,
  TechRadarUpdate,
  TechUpdateKind,
} from "@/lib/tech-radar";
import { cn } from "@/lib/utils";

type WindowMode = "today" | "week";

const sourceTone: Record<TechRadarSourceId, string> = {
  typescript: "border-[#3178c6]/25 bg-[#3178c6]/10 text-[#245f9d] dark:text-[#77afe6]",
  nextjs: "border-foreground/20 bg-foreground/8 text-foreground",
  php: "border-[#777bb4]/25 bg-[#777bb4]/10 text-[#595d93] dark:text-[#aeb1dd]",
  blade: "border-[#d95852]/25 bg-[#d95852]/10 text-[#a43c37] dark:text-[#ec8d88]",
  javascript: "border-[#c7a600]/25 bg-[#c7a600]/10 text-[#765f00] dark:text-[#e6cc55]",
  python: "border-[#3979a9]/25 bg-[#3979a9]/10 text-[#2d648d] dark:text-[#82b6dc]",
};

const kindLabel: Record<TechUpdateKind, string> = {
  major: "Major release",
  minor: "Minor release",
  patch: "Patch",
  prerelease: "Pre-release",
  release: "Release",
};

export const Route = createFileRoute("/tech-radar")({
  head: () => ({
    meta: [
      { title: "PEN Tech Radar | OpsDesk" },
      {
        name: "description",
        content: "Daily and weekly official release intelligence for the PEN engineering stack.",
      },
    ],
  }),
  component: TechRadarPage,
});

function TechRadarPage() {
  const [data, setData] = useState<TechRadarData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [windowMode, setWindowMode] = useUrlParam(
    "window",
    enumParam<WindowMode>(["today", "week"], "week"),
  );
  const [sourceFilter, setSourceFilter] = useUrlParam(
    "source",
    enumParam<"all" | TechRadarSourceId>(["all", ...Object.keys(sourceTone) as TechRadarSourceId[]], "all"),
  );

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getTechRadar());
    } catch (loadError) {
      console.error("Failed to load tech radar", loadError);
      setError("Official release feeds could not be reached. Try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const recentUpdates = useMemo(() => {
    if (!data) return [];
    const elapsedLimit = windowMode === "today" ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - elapsedLimit;
    return data.updates.filter(
      (update) =>
        new Date(update.publishedAt).getTime() >= cutoff &&
        (sourceFilter === "all" || update.sourceId === sourceFilter),
    );
  }, [data, sourceFilter, windowMode]);

  const latestBySource = useMemo(() => {
    if (!data) return new Map<TechRadarSourceId, TechRadarUpdate>();
    const latest = new Map<TechRadarSourceId, TechRadarUpdate>();
    for (const update of data.updates) {
      if (!latest.has(update.sourceId)) latest.set(update.sourceId, update);
    }
    return latest;
  }, [data]);

  const patchCount = recentUpdates.filter((update) => update.kind === "patch").length;
  const stableCount = recentUpdates.filter((update) => !update.prerelease).length;

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <section className="relative overflow-hidden rounded-[1.8rem] border border-border/70 bg-card/75 shadow-[var(--shadow-surface)]">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[42%] bg-[radial-gradient(circle_at_70%_35%,color-mix(in_oklab,var(--color-primary)_18%,transparent),transparent_60%)] lg:block" />
        <div className="relative grid gap-7 px-5 py-7 sm:px-7 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.7fr)] lg:px-9 lg:py-9">
          <div className="max-w-3xl">
            <div className="app-kicker flex items-center gap-2 text-primary">
              <Radar className="h-4 w-4" weight="duotone" />
              Engineering intelligence
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-foreground sm:text-4xl">
              PEN Tech Radar
            </h1>
            <p className="mt-3 max-w-[62ch] text-sm leading-6 text-muted-foreground sm:text-base">
              Official releases, patches, and security destinations for the technologies powering
              PEN products. Scan the week, then open the source notes before planning an upgrade.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <WindowButton
                active={windowMode === "today"}
                icon={<Clock className="h-4 w-4" />}
                label="Today"
                onClick={() => setWindowMode("today")}
              />
              <WindowButton
                active={windowMode === "week"}
                icon={<CalendarBlank className="h-4 w-4" />}
                label="This week"
                onClick={() => setWindowMode("week")}
              />
            </div>
          </div>

          <div className="self-end rounded-[1.4rem] border border-border/75 bg-background/72 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="app-kicker">Feed status</div>
                <div className="mt-2 text-sm font-semibold text-foreground">
                  {loading
                    ? "Checking official sources"
                    : error
                      ? "Feed interrupted"
                      : "Radar online"}
                </div>
              </div>
              <span
                className={cn(
                  "relative flex h-3 w-3 rounded-full",
                  error ? "bg-destructive" : "bg-success",
                )}
              >
                {!error && !loading ? (
                  <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-35" />
                ) : null}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 divide-x divide-border/70 border-t border-border/70 pt-4">
              <RadarMetric label="Updates" value={loading ? "—" : String(recentUpdates.length)} />
              <RadarMetric label="Patches" value={loading ? "—" : String(patchCount)} />
              <RadarMetric label="Stable" value={loading ? "—" : String(stableCount)} />
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
              <span>
                {data ? `Checked ${relativeTime(data.fetchedAt)}` : "Waiting for release feeds"}
              </span>
              <Button
                aria-label="Refresh tech radar"
                className="h-8 w-8 active:scale-[0.98]"
                disabled={loading}
                onClick={() => void load()}
                size="icon"
                variant="ghost"
              >
                <ArrowClockwise className={cn("h-4 w-4", loading && "animate-spin")} />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {loading ? (
        <TechRadarSkeleton />
      ) : error || !data ? (
        <TechRadarError message={error ?? "No release data was returned."} onRetry={load} />
      ) : (
        <>
          <StackSourceRail data={data} latestBySource={latestBySource} />

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.7fr)]">
            <section className="overflow-hidden rounded-[1.6rem] border border-border/70 bg-card/70">
              <div className="border-b border-border/70 px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="app-kicker">Release stream</div>
                    <h2 className="mt-2 text-xl font-semibold tracking-[-0.035em] text-foreground">
                      {windowMode === "today" ? "Today’s official updates" : "This week’s updates"}
                    </h2>
                  </div>
                  <div className="flex max-w-full gap-1 overflow-x-auto rounded-full border border-border/70 bg-background/65 p-1">
                    <SourceFilterButton
                      active={sourceFilter === "all"}
                      label="All"
                      onClick={() => setSourceFilter("all")}
                    />
                    {data.sources.map((source) => (
                      <SourceFilterButton
                        active={sourceFilter === source.id}
                        key={source.id}
                        label={source.label}
                        onClick={() => setSourceFilter(source.id)}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {recentUpdates.length ? (
                <div className="divide-y divide-border/70">
                  {recentUpdates.map((update, index) => (
                    <ReleaseRow
                      index={index}
                      key={update.id}
                      source={data.sources.find((source) => source.id === update.sourceId)!}
                      update={update}
                    />
                  ))}
                </div>
              ) : (
                <RadarEmptyState mode={windowMode} sourceFilter={sourceFilter} />
              )}
            </section>

            <aside className="space-y-5">
              <SecurityWatch sources={data.sources} />
              <RadarMethod fetchedAt={data.fetchedAt} unavailable={data.unavailableSourceIds} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function WindowButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-xs font-semibold transition-[transform,color,background-color,border-color] duration-300 active:scale-[0.98]",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border/80 bg-background/70 text-muted-foreground hover:border-primary/30 hover:text-foreground",
      )}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

function RadarMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 first:pl-0 last:pr-0">
      <div className="app-mono text-lg font-semibold tabular-nums text-foreground">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function StackSourceRail({
  data,
  latestBySource,
}: {
  data: TechRadarData;
  latestBySource: Map<TechRadarSourceId, TechRadarUpdate>;
}) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-4 px-1">
        <div>
          <div className="app-kicker">PEN stack</div>
          <h2 className="mt-1.5 text-base font-semibold text-foreground">
            Repositories and latest versions
          </h2>
        </div>
        <span className="hidden text-[11px] text-muted-foreground sm:block">
          Open a language to view PEN repositories
        </span>
      </div>
      <div className="flex snap-x gap-3 overflow-x-auto pb-2">
        {data.sources.map((source) => {
          const latest = latestBySource.get(source.id);
          const unavailable = data.unavailableSourceIds.includes(source.id);
          return (
            <a
              className="group min-w-[220px] flex-1 snap-start rounded-[1.25rem] border border-border/70 bg-card/72 p-4 transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[var(--shadow-card)] active:scale-[0.99]"
              href={source.penRepositoriesUrl}
              key={source.id}
              rel="noreferrer"
              target="_blank"
            >
              <div className="flex items-start justify-between gap-3">
                <Badge className={cn("border", sourceTone[source.id])} variant="outline">
                  {source.label}
                </Badge>
                <GithubLogo className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
              </div>
              <div className="mt-5 app-mono text-sm font-semibold text-foreground">
                {unavailable ? "Feed unavailable" : latest?.version || "No release found"}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {latest ? `Released ${formatDate(latest.publishedAt)}` : source.ecosystem}
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}

function SourceFilterButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "h-7 shrink-0 rounded-full px-3 text-[11px] font-semibold transition-colors active:scale-[0.98]",
        active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function ReleaseRow({
  index,
  source,
  update,
}: {
  index: number;
  source: TechRadarSource;
  update: TechRadarUpdate;
}) {
  return (
    <article
      className="group grid gap-3 px-4 py-5 transition-colors duration-300 hover:bg-muted/28 sm:grid-cols-[112px_minmax(0,1fr)_auto] sm:px-5"
      style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}
    >
      <div>
        <Badge className={cn("border", sourceTone[source.id])} variant="outline">
          {source.label}
        </Badge>
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <CalendarBlank className="h-3.5 w-3.5" />
          {formatDate(update.publishedAt)}
        </div>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold leading-5 text-foreground">{update.title}</h3>
          <span className="app-mono rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
            {kindLabel[update.kind]}
          </span>
        </div>
        <p className="mt-2 line-clamp-2 max-w-[76ch] text-xs leading-5 text-muted-foreground">
          {update.summary}
        </p>
      </div>
      <a
        aria-label={`Open ${source.label} ${update.version} release notes`}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition-[transform,color,border-color] duration-300 hover:-translate-y-0.5 hover:border-primary/35 hover:text-primary active:scale-[0.96]"
        href={update.url}
        rel="noreferrer"
        target="_blank"
      >
        <ArrowSquareOut className="h-4 w-4" />
      </a>
    </article>
  );
}

function SecurityWatch({ sources }: { sources: TechRadarSource[] }) {
  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-border/70 bg-card/70">
      <div className="border-b border-border/70 px-4 py-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <ShieldCheckered className="h-4 w-4 text-primary" weight="duotone" />
          Security watch
        </div>
        <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
          Official security and release channels for upgrade checks.
        </p>
      </div>
      <div className="divide-y divide-border/70">
        {sources.map((source) => (
          <a
            className="group flex items-center gap-3 px-4 py-3 text-xs transition-colors hover:bg-muted/30"
            href={source.securityUrl}
            key={source.id}
            rel="noreferrer"
            target="_blank"
          >
            <span className={cn("h-2 w-2 rounded-full border", sourceTone[source.id])} />
            <span className="flex-1 font-medium text-foreground">{source.label}</span>
            <ArrowSquareOut className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-primary" />
          </a>
        ))}
      </div>
    </section>
  );
}

function RadarMethod({
  fetchedAt,
  unavailable,
}: {
  fetchedAt: string;
  unavailable: TechRadarSourceId[];
}) {
  return (
    <section className="rounded-[1.5rem] border border-border/70 bg-foreground p-5 text-background shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <CheckCircle className="h-4 w-4 text-success" weight="fill" />
        Source policy
      </div>
      <p className="mt-3 text-xs leading-5 text-background/70">
        Radar entries come from official GitHub release feeds. Open the linked notes and test in a
        non-production environment before upgrading.
      </p>
      <div className="mt-4 border-t border-background/15 pt-3 app-mono text-[10px] text-background/55">
        Last checked {formatDateTime(fetchedAt)}
      </div>
      {unavailable.length > 0 ? (
        <div className="mt-2 text-[10px] text-warning">
          {unavailable.length} source {unavailable.length === 1 ? "is" : "are"} temporarily
          unavailable.
        </div>
      ) : null}
    </section>
  );
}

function RadarEmptyState({
  mode,
  sourceFilter,
}: {
  mode: WindowMode;
  sourceFilter: "all" | TechRadarSourceId;
}) {
  return (
    <div className="px-5 py-14 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[1.1rem] border border-border bg-muted/45 text-muted-foreground">
        <NewspaperClipping className="h-5 w-5" weight="duotone" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-foreground">No official releases detected</h3>
      <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-muted-foreground">
        There were no {sourceFilter === "all" ? "stack" : sourceFilter} releases in the selected{" "}
        {mode === "today" ? "24-hour" : "seven-day"} window. The latest known versions remain
        available above.
      </p>
    </div>
  );
}

function TechRadarError({ message, onRetry }: { message: string; onRetry: () => Promise<void> }) {
  return (
    <section className="rounded-[1.6rem] border border-destructive/25 bg-destructive/5 px-5 py-10 text-center">
      <Radar className="mx-auto h-7 w-7 text-destructive" weight="duotone" />
      <h2 className="mt-3 text-base font-semibold text-foreground">Release feeds unavailable</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{message}</p>
      <Button className="mt-5 active:scale-[0.98]" onClick={() => void onRetry()} variant="outline">
        <ArrowClockwise className="h-4 w-4" />
        Try again
      </Button>
    </section>
  );
}

function TechRadarSkeleton() {
  return (
    <div className="space-y-5" aria-label="Loading tech radar">
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton className="h-28 min-w-[220px] flex-1 rounded-[1.25rem]" key={index} />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.7fr)]">
        <Skeleton className="h-[480px] rounded-[1.6rem]" />
        <div className="space-y-5">
          <Skeleton className="h-72 rounded-[1.5rem]" />
          <Skeleton className="h-48 rounded-[1.5rem]" />
        </div>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}
