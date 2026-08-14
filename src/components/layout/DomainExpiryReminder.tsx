import {
  CalendarBlank,
  ClockCountdown,
  GlobeHemisphereWest,
  LockKey,
  WarningOctagon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

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
import { listDomainMonitors } from "@/lib/domain-monitor.functions";
import { daysUntil, type DomainMonitor } from "@/lib/domain-monitor";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "project-pal:domain-expiry-reminders:v1";
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

type ReminderKind = "ssl" | "domain";

type ExpiryReminder = {
  deliveryKey: string;
  domain: DomainMonitor;
  kind: ReminderKind;
  expiresAt: number;
  days: number;
  cadence: "daily" | "weekly";
};

export function DomainExpiryReminder() {
  const [reminders, setReminders] = useState<ExpiryReminder[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const domains = await listDomainMonitors();
        if (cancelled) return;

        const history = readReminderHistory();
        const now = Date.now();
        const due = buildReminders(domains).filter((reminder) => {
          const lastShown = history[reminder.deliveryKey] ?? 0;
          const interval = reminder.cadence === "daily" ? DAY_MS : WEEK_MS;
          return now - lastShown >= interval;
        });

        if (due.length === 0) return;

        for (const reminder of due) history[reminder.deliveryKey] = now;
        writeReminderHistory(history);
        setReminders(due);
        setOpen(true);
      } catch (error) {
        console.error("Failed to check domain expiry reminders", error);
      }
    };

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (reminders.length === 0) return null;

  const hasCritical = reminders.some((reminder) => reminder.days <= 7);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent className="max-w-2xl overflow-hidden rounded-[1.7rem] border-border/75 p-0 shadow-[var(--shadow-elevated)]">
        <div
          className={cn(
            "border-b px-6 py-5",
            hasCritical
              ? "border-destructive/20 bg-destructive/8"
              : "border-warning/25 bg-warning/10",
          )}
        >
          <AlertDialogHeader className="text-left">
            <div
              className={cn(
                "mb-2 flex h-10 w-10 items-center justify-center rounded-xl border",
                hasCritical
                  ? "border-destructive/20 bg-destructive/10 text-destructive"
                  : "border-warning/30 bg-warning/15 text-warning-foreground",
              )}
            >
              {hasCritical ? (
                <WarningOctagon className="h-5 w-5" weight="duotone" />
              ) : (
                <ClockCountdown className="h-5 w-5" weight="duotone" />
              )}
            </div>
            <AlertDialogTitle className="text-xl tracking-[-0.025em]">
              {hasCritical ? "Expiry action required" : "Renewal window approaching"}
            </AlertDialogTitle>
            <AlertDialogDescription className="max-w-xl leading-6">
              {hasCritical
                ? "One or more domain services have seven days or less remaining. This reminder will appear daily until the expiry moves outside the alert window."
                : "These domain services have entered the 15-day renewal window. This reminder will appear once every seven days."}
            </AlertDialogDescription>
          </AlertDialogHeader>
        </div>

        <div className="max-h-[48vh] divide-y divide-border/70 overflow-y-auto">
          {reminders.map((reminder) => (
            <ReminderRow key={reminder.deliveryKey} reminder={reminder} />
          ))}
        </div>

        <AlertDialogFooter className="border-t border-border/70 bg-muted/30 px-6 py-4 sm:items-center sm:justify-between">
          <p className="text-left text-[11px] leading-4 text-muted-foreground">
            Reminders appear when OpsDesk is open.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <AlertDialogCancel className="mt-0">Dismiss</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Link to="/domains">Review Domain Watch</Link>
            </AlertDialogAction>
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReminderRow({ reminder }: { reminder: ExpiryReminder }) {
  const expired = reminder.days < 0;
  const critical = reminder.days <= 7;

  return (
    <div className="grid gap-3 px-6 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
            critical
              ? "border-destructive/20 bg-destructive/8 text-destructive"
              : "border-warning/25 bg-warning/10 text-warning-foreground",
          )}
        >
          {reminder.kind === "ssl" ? (
            <LockKey className="h-4 w-4" weight="duotone" />
          ) : (
            <GlobeHemisphereWest className="h-4 w-4" weight="duotone" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">
              {reminder.domain.hostname}
            </span>
            <Badge className="rounded-full text-[9px]" variant="outline">
              {reminder.kind === "ssl" ? "SSL certificate" : "Domain registration"}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CalendarBlank className="h-3.5 w-3.5" />
              {formatDate(reminder.expiresAt)}
            </span>
            <span>{reminder.cadence === "daily" ? "Daily reminder" : "Weekly reminder"}</span>
          </div>
        </div>
      </div>
      <div
        className={cn(
          "app-mono text-sm font-semibold sm:text-right",
          critical ? "text-destructive" : "text-warning-foreground",
        )}
      >
        {expired
          ? `${Math.abs(reminder.days)}d expired`
          : reminder.days === 0
            ? "Expires today"
            : `${reminder.days}d left`}
      </div>
    </div>
  );
}

function buildReminders(domains: DomainMonitor[]) {
  const reminders: ExpiryReminder[] = [];

  for (const domain of domains) {
    for (const [kind, expiresAt] of [
      ["ssl", domain.sslExpiresAt],
      ["domain", domain.domainExpiresAt],
    ] as const) {
      const days = daysUntil(expiresAt);
      if (!expiresAt || days === null || days > 15) continue;
      const cadence = days <= 7 ? "daily" : "weekly";
      reminders.push({
        deliveryKey: `${domain.id}:${kind}:${cadence}`,
        domain,
        kind,
        expiresAt,
        days,
        cadence,
      });
    }
  }

  return reminders.sort((left, right) => left.expiresAt - right.expiresAt);
}

function readReminderHistory() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function writeReminderHistory(history: Record<string, number>) {
  const cutoff = Date.now() - 180 * DAY_MS;
  const recent = Object.fromEntries(
    Object.entries(history).filter(([, lastShown]) => lastShown >= cutoff),
  );
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recent));
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp));
}
