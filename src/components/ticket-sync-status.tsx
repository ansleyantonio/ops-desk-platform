import { useEffect, useState } from "react";
import { getTicketSyncStatus } from "@/lib/ticket-sync.functions";

export function TicketSyncStatus() {
  const [status, setStatus] = useState<Awaited<
    ReturnType<typeof getTicketSyncStatus>
  > | null>(null);
  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      void getTicketSyncStatus()
        .then((result) => {
          if (!cancelled) setStatus(result);
        })
        .catch(() => {
          if (!cancelled) setStatus({ state: "unknown", syncedAt: null });
        });
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  return (
    <div
      role="status"
      className="rounded-xl border border-border/70 bg-card/55 px-4 py-3 text-sm"
    >
      <span className="font-medium">Ticketing sync · Daily at 06:00 UTC</span>
      <p
        className={`mt-1 text-xs ${status?.state === "overdue" ? "text-warning" : "text-muted-foreground"}`}
      >
        {!status ? (
          "Checking latest sync…"
        ) : status.state === "unknown" ? (
          "Unable to confirm the latest sync."
        ) : (
          <>
            {status.state === "current"
              ? "Latest scheduled sync confirmed."
              : "The expected daily sync has no confirmed completion yet."}{" "}
            Last successful sync:{" "}
            {status.syncedAt!.replace("T", " ").replace(/\.\d+Z$/, " UTC")}.
          </>
        )}
      </p>
    </div>
  );
}
