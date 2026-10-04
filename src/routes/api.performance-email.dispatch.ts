import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

export const Route = createFileRoute("/api/performance-email/dispatch")({
  server: { handlers: { POST: async ({ request }) => {
    const configured = process.env.PERFORMANCE_CRON_TOKEN;
    const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const valid = configured && supplied.length === configured.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(configured));
    if (!valid) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const date = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6) return Response.json({ sent: false, reason: "Weekend report skipped." });
    try {
      const { sendPerformanceEmail } = await import("@/lib/performance-email.server");
      return Response.json(await sendPerformanceEmail({ date }));
    } catch (error) {
      console.error("Daily performance email failed", error);
      return Response.json({ error: "Daily performance email failed" }, { status: 500 });
    }
  } } },
});
