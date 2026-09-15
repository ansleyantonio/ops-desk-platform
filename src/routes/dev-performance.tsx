import { createFileRoute } from "@tanstack/react-router";
import { TeamPerformancePage } from "./team-performance";

export const Route = createFileRoute("/dev-performance")({
  head: () => ({ meta: [{ title: "Dev performance | OpsDesk" }, { name: "description", content: "Developer and QA ticket performance grouped by team and project manager." }] }),
  component: () => <TeamPerformancePage mode="dev" />,
});
