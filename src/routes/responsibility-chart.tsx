import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Code2,
  FolderKanban,
  Network,
  Search,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { useMemo, useState, type ComponentType } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Owner = "PM" | "Tech Lead" | "QA" | "Developer" | "Engineering Manager";

type Responsibility = {
  activity: string;
  owner: string;
  ownerGroup: Owner;
  supportingRoles: string;
  output: string;
};

const responsibilities: Responsibility[] = [
  {
    activity: "Project roadmap and priorities",
    owner: "PM",
    ownerGroup: "PM",
    supportingRoles: "Stakeholders, Engineering Manager",
    output: "Prioritised roadmap",
  },
  {
    activity: "New feature/requirement tickets",
    owner: "PM",
    ownerGroup: "PM",
    supportingRoles: "Stakeholder, QA, Tech Lead",
    output: "Clear outcome, scope and acceptance criteria",
  },
  {
    activity: "Enhancement/change tickets",
    owner: "PM",
    ownerGroup: "PM",
    supportingRoles: "Stakeholder, QA, Tech Lead",
    output: "Approved change and priority",
  },
  {
    activity: "Bug/regression tickets",
    owner: "QA",
    ownerGroup: "QA",
    supportingRoles: "Developer, Tech Lead",
    output: "Reproduction steps, evidence, expected vs actual result",
  },
  {
    activity: "Technical tasks/refactoring tickets",
    owner: "Tech Lead",
    ownerGroup: "Tech Lead",
    supportingRoles: "Developers",
    output: "Technical scope and justification",
  },
  {
    activity: "Technical design and subtasks",
    owner: "Tech Lead",
    ownerGroup: "Tech Lead",
    supportingRoles: "Relevant developers",
    output: "Agreed implementation approach",
  },
  {
    activity: "Estimates and capacity",
    owner: "Tech Lead",
    ownerGroup: "Tech Lead",
    supportingRoles: "Developers, PM",
    output: "Evidence-based estimate",
  },
  {
    activity: "Sprint scope and deadline",
    owner: "PM",
    ownerGroup: "PM",
    supportingRoles: "Tech Lead confirms capacity",
    output: "Committed sprint plan",
  },
  {
    activity: "Backlog priority",
    owner: "PM",
    ownerGroup: "PM",
    supportingRoles: "QA, Tech Lead, stakeholder",
    output: "Ordered backlog",
  },
  {
    activity: "Work allocation",
    owner: "Tech Lead",
    ownerGroup: "Tech Lead",
    supportingRoles: "PM confirms delivery priority",
    output: "Named developer and technical expectations",
  },
  {
    activity: "Individual daily progress",
    owner: "Developer",
    ownerGroup: "Developer",
    supportingRoles: "Tech Lead validates",
    output: "Ticket update, PR, tests or demonstration",
  },
  {
    activity: "Consolidated project progress",
    owner: "Tech Lead",
    ownerGroup: "Tech Lead",
    supportingRoles: "Developers supply evidence",
    output: "Daily update to PM",
  },
  {
    activity: "Technical blockers",
    owner: "Tech Lead",
    ownerGroup: "Tech Lead",
    supportingRoles: "Relevant developer",
    output: "Decision, solution or escalation",
  },
  {
    activity: "Delivery risks/dependencies",
    owner: "PM",
    ownerGroup: "PM",
    supportingRoles: "Tech Lead where relevant",
    output: "Action owner and resolution date",
  },
  {
    activity: "AI-assisted implementation",
    owner: "Developer",
    ownerGroup: "Developer",
    supportingRoles: "Tech Lead sets standards",
    output: "Understood, tested and maintainable solution",
  },
  {
    activity: "PR and AI-output verification",
    owner: "Tech Lead",
    ownerGroup: "Tech Lead",
    supportingRoles: "Technical Owner/Senior may assist",
    output: "Reviewed code, tests and security checks",
  },
  {
    activity: "Functional and regression testing",
    owner: "QA",
    ownerGroup: "QA",
    supportingRoles: "Developer fixes defects",
    output: "Test evidence and result",
  },
  {
    activity: "Product demonstration",
    owner: "PM facilitates",
    ownerGroup: "PM",
    supportingRoles: "Developer presents; QA confirms testing",
    output: "Recorded feedback and actions",
  },
  {
    activity: "UAT coordination",
    owner: "PM",
    ownerGroup: "PM",
    supportingRoles: "QA, stakeholder, developers",
    output: "UAT results and assigned actions",
  },
  {
    activity: "Technical release readiness",
    owner: "Tech Lead",
    ownerGroup: "Tech Lead",
    supportingRoles: "QA, developers",
    output: "Deployment, migration and rollback checks",
  },
  {
    activity: "Release coordination",
    owner: "PM",
    ownerGroup: "PM",
    supportingRoles: "Tech Lead, QA",
    output: "Release plan and communication",
  },
  {
    activity: "Delivery-performance evidence",
    owner: "PM",
    ownerGroup: "PM",
    supportingRoles: "Tech Lead, QA",
    output: "Deadlines, ownership and rework data",
  },
  {
    activity: "Technical-performance evidence",
    owner: "Tech Lead",
    ownerGroup: "Tech Lead",
    supportingRoles: "QA where relevant",
    output: "Quality, independence and AI-use evidence",
  },
  {
    activity: "Capability/performance decisions",
    owner: "Engineering Manager",
    ownerGroup: "Engineering Manager",
    supportingRoles: "HR, PM, Tech Lead",
    output: "Training, improvement plan or formal action",
  },
  {
    activity: "AI training and assessment",
    owner: "Engineering Manager",
    ownerGroup: "Engineering Manager",
    supportingRoles: "HR, Tech Lead, PM",
    output: "Practical assessment after training",
  },
];

const owners: Array<{
  owner: Owner;
  shortLabel: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  tone: string;
}> = [
  {
    owner: "PM",
    shortLabel: "PM",
    description: "Priority, scope, coordination and delivery evidence",
    icon: BriefcaseBusiness,
    tone: "border-[#2e6fb0]/30 bg-[#2e6fb0]/10 text-[#2e6fb0]",
  },
  {
    owner: "Tech Lead",
    shortLabel: "Tech Lead",
    description: "Technical direction, capacity, allocation and quality",
    icon: Code2,
    tone: "border-[#12385f]/30 bg-[#12385f]/10 text-[#12385f] dark:text-[#9cc4e8]",
  },
  {
    owner: "QA",
    shortLabel: "QA",
    description: "Defect evidence, functional testing and regression confidence",
    icon: ShieldCheck,
    tone: "border-[#c9a227]/40 bg-[#c9a227]/12 text-[#7c641a] dark:text-[#e5c85b]",
  },
  {
    owner: "Developer",
    shortLabel: "Developer",
    description: "Implementation evidence, tests and daily progress",
    icon: ClipboardCheck,
    tone: "border-slate-400/30 bg-slate-400/10 text-slate-700 dark:text-slate-200",
  },
  {
    owner: "Engineering Manager",
    shortLabel: "Eng. Manager",
    description: "Capability, performance decisions and technical standards",
    icon: UsersRound,
    tone: "border-[#7a4e9e]/30 bg-[#7a4e9e]/10 text-[#7a4e9e] dark:text-[#c5a7dc]",
  },
];

export const Route = createFileRoute("/responsibility-chart")({
  head: () => ({
    meta: [
      { title: "Responsibility Chart | OpsDesk" },
      {
        name: "description",
        content: "PM and Tech Lead accountability matrix across the delivery lifecycle.",
      },
    ],
  }),
  component: ResponsibilityChartPage,
});

function ResponsibilityChartPage() {
  const [selectedOwner, setSelectedOwner] = useState<Owner | "All">("All");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return responsibilities.filter((item) => {
      const ownerMatches = selectedOwner === "All" || item.ownerGroup === selectedOwner;
      const queryMatches =
        !normalizedQuery ||
        [item.activity, item.owner, item.supportingRoles, item.output].some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        );
      return ownerMatches && queryMatches;
    });
  }, [query, selectedOwner]);
  const ownerColumns = useMemo(
    () =>
      owners
        .map((owner) => ({
          ...owner,
          items: filtered.filter((item) => item.ownerGroup === owner.owner),
        }))
        .filter((owner) => owner.items.length > 0),
    [filtered],
  );

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <header className="relative overflow-hidden rounded-xl bg-gradient-to-r from-[#12385f] to-[#1f5488] px-5 py-4 text-white shadow-[0_8px_22px_rgba(18,56,95,0.2)] sm:px-7">
        <div className="absolute inset-y-0 right-0 w-1 bg-[#c9a227]" />
        <div className="flex items-center justify-between gap-5">
          <div className="flex items-center gap-3">
            <PenMark />
            <div>
              <div className="text-[15px] font-bold tracking-[0.01em]">Responsibility Chart</div>
              <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-white/65">
                Delivery accountability
              </div>
            </div>
          </div>
          <span className="hidden text-[10px] font-semibold uppercase tracking-[0.17em] text-white/65 sm:block">
            Internal working guide
          </span>
        </div>
      </header>

      <section className="flex flex-col gap-4 px-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#2e6fb0]">
            Delivery governance
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-[-0.035em] text-[#12385f] dark:text-[#d8e9f7] sm:text-[1.8rem]">
            Who owns what
          </h1>
          <div className="mt-2 h-0.5 w-11 bg-[#c9a227]" />
          <p className="mt-3 max-w-[72ch] text-sm leading-6 text-muted-foreground">
            One accountable owner for every delivery activity, with supporting roles and the
            evidence required for completion.
          </p>
        </div>
        <Button asChild variant="outline" className="self-start active:scale-[0.98]">
          <Link to="/">
            <FolderKanban className="h-4 w-4" />
            Dashboard
          </Link>
        </Button>
      </section>

      <ResponsibilityTree />

      <section className="overflow-hidden rounded-xl border border-[#dce6ee] bg-white shadow-[0_6px_18px_rgba(18,56,95,0.08)] dark:border-border dark:bg-card/60">
        <div className="flex flex-col gap-4 border-t-[3px] border-t-[#c9a227] bg-gradient-to-r from-[#12385f] to-[#1f5488] px-4 py-4 text-white sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-bold">Accountability matrix</h2>
            <p className="mt-1 text-xs leading-5 text-white/65">
              {filtered.length} of {responsibilities.length} responsibilities shown · Select an
              activity to reveal its support and required output
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search activity, role or output"
                className="h-9 w-full border-white/20 bg-white/95 pl-9 text-xs text-[#12385f] placeholder:text-slate-400 sm:w-72"
                aria-label="Search responsibilities"
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="bg-white/10 text-white hover:bg-white/20 hover:text-white"
              onClick={() => {
                setQuery("");
                setSelectedOwner("All");
              }}
            >
              Reset
            </Button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto border-b border-[#dce6ee] bg-[#f4f7fa] px-4 py-3 dark:border-border dark:bg-muted/20 sm:px-5">
          <OwnerFilter
            active={selectedOwner === "All"}
            count={responsibilities.length}
            label="All"
            onClick={() => setSelectedOwner("All")}
          />
          {owners.map((item) => (
            <OwnerFilter
              key={item.owner}
              active={selectedOwner === item.owner}
              count={
                responsibilities.filter(
                  (responsibility) => responsibility.ownerGroup === item.owner,
                ).length
              }
              label={item.shortLabel}
              onClick={() => setSelectedOwner(item.owner)}
            />
          ))}
        </div>

        {filtered.length ? (
          <div className="overflow-x-auto bg-[#f4f7fa] p-5 dark:bg-background/40">
            <div
              className={cn(
                "grid items-start gap-5 transition-[grid-template-columns] duration-300",
                selectedOwner === "All" ? "min-w-max" : "min-w-0",
              )}
              style={{
                gridTemplateColumns:
                  selectedOwner === "All"
                    ? `repeat(${ownerColumns.length}, minmax(228px, 252px))`
                    : "minmax(0, 1fr)",
              }}
            >
              {ownerColumns.map((owner) => (
                <ResponsibilityOwnerColumn
                  key={owner.owner}
                  owner={owner}
                  expanded={selectedOwner !== "All"}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-[1rem] bg-muted text-muted-foreground">
              <Network className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-sm font-semibold text-foreground">
              No matching responsibilities
            </h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Clear the filters or search for another activity, role or output.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function ResponsibilityTree() {
  return (
    <section className="overflow-x-auto rounded-xl border border-[#dce6ee] bg-[#f4f7fa] px-4 py-5 shadow-[0_6px_18px_rgba(18,56,95,0.08)] dark:border-border dark:bg-card/60 sm:px-6">
      <div className="mx-auto min-w-[880px] max-w-[1120px]">
        <div className="mb-5 rounded-[10px] border-t-[3px] border-[#c9a227] bg-gradient-to-r from-[#12385f] to-[#1f5488] px-5 py-3.5 text-white shadow-[0_5px_14px_rgba(18,56,95,0.18)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/60">
                Delivery governance
              </div>
              <div className="mt-1 text-sm font-bold">Accountability structure</div>
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/65">
              One owner per activity
            </div>
          </div>
        </div>
        <div className="flex justify-center">
          <div className="min-w-[210px] rounded-[9px] border border-[#684187] bg-gradient-to-b from-[#8459a5] to-[#704590] px-6 py-3 text-center text-white shadow-[0_5px_12px_rgba(18,56,95,0.17)]">
            <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/65">
              Governance
            </div>
            <div className="mt-1 text-sm font-bold">Engineering Manager</div>
          </div>
        </div>
        <div className="mx-auto h-7 w-px bg-[#b7c4d0]" />
        <div className="flex justify-center">
          <RoleNode owner="PM" tone="blue" />
        </div>
        <div className="mx-auto h-7 w-px bg-[#b7c4d0]" />
        <div className="mx-auto h-px w-[48%] bg-[#b7c4d0]" />
        <div className="mx-auto grid max-w-[760px] grid-cols-2">
          <div className="flex flex-col items-center">
            <div className="h-7 w-px bg-[#b7c4d0]" />
            <RoleNode owner="Tech Lead" tone="navy" />

            <div className="h-7 w-px bg-[#b7c4d0]" />
            <div className="flex flex-col items-center">
              <RoleNode owner="Developer" tone="green" compact />
            </div>
          </div>

          <div className="flex flex-col items-center">
            <div className="h-7 w-px bg-[#b7c4d0]" />
            <RoleNode owner="QA" tone="gold" />
          </div>
        </div>
        <div className="mt-5 flex items-center justify-center gap-2 rounded-lg border border-[#dce6ee] bg-white px-4 py-2.5 text-[11px] text-slate-500 dark:border-border dark:bg-background/50 dark:text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-[#4c9a54]" />
          One accountable owner per activity, with explicit supporting roles and evidence
        </div>
      </div>
    </section>
  );
}

function RoleNode({
  owner,
  tone,
  compact = false,
}: {
  owner: Owner;
  tone: "navy" | "blue" | "gold" | "green";
  compact?: boolean;
}) {
  const role = owners.find((item) => item.owner === owner);
  const Icon = role?.icon ?? BriefcaseBusiness;
  const toneClass = {
    navy: "border-[#0e2e4f] bg-gradient-to-b from-[#1d4a75] to-[#12385f]",
    blue: "border-[#245d94] bg-gradient-to-b from-[#3979b8] to-[#2e6fb0]",
    gold: "border-[#a8871f] bg-gradient-to-b from-[#d1ad32] to-[#b8921d]",
    green: "border-[#3d8145] bg-gradient-to-b from-[#58a860] to-[#438b4b]",
  }[tone];

  return (
    <div
      className={cn(
        "rounded-[9px] border px-4 py-3 text-white shadow-[0_5px_12px_rgba(18,56,95,0.16)]",
        compact ? "w-[160px]" : "w-[220px]",
        toneClass,
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" />
        <div className="text-sm font-bold">{owner}</div>
      </div>
      <p className="mt-2 text-[10px] leading-4 text-white/70">{role?.description}</p>
    </div>
  );
}

function OwnerFilter({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-[transform,background-color,border-color,color] active:scale-[0.98]",
        active
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border/80 bg-background/55 text-muted-foreground hover:border-primary/20 hover:text-foreground",
      )}
    >
      {label}
      <span className="app-mono text-[10px] opacity-70">{count}</span>
    </button>
  );
}

function ResponsibilityOwnerColumn({
  owner,
  expanded,
}: {
  owner: (typeof owners)[number] & { items: Responsibility[] };
  expanded: boolean;
}) {
  const Icon = owner.icon;

  return (
    <section aria-labelledby={`owner-${owner.owner}`} className="min-w-0">
      <div
        className={cn(
          "rounded-[9px] border border-[#c9d7e3] bg-[#e7eef5] shadow-[0_3px_8px_rgba(18,56,95,0.08)] transition-[padding,min-height] duration-300 dark:border-border dark:bg-muted/40",
          expanded ? "min-h-0 p-5" : "min-h-[112px] p-3.5",
        )}
      >
        <div
          className={cn("flex justify-between gap-3", expanded ? "items-center" : "items-start")}
        >
          <div
            className={cn(
              "flex shrink-0 items-center justify-center rounded-md bg-[#12385f] text-white",
              expanded ? "h-10 w-10" : "h-8 w-8",
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
          {expanded ? (
            <div className="min-w-0 flex-1">
              <h3
                id={`owner-${owner.owner}`}
                className="text-base font-bold text-[#12385f] dark:text-foreground"
              >
                {owner.owner}
              </h3>
              <p className="mt-1 text-xs leading-5 text-[#5d7183] dark:text-muted-foreground">
                {owner.description}
              </p>
            </div>
          ) : null}
          <Badge
            variant="outline"
            className={cn(
              "border-[#b7c4d0] bg-white/70 text-[#456078] dark:bg-background/60 dark:text-muted-foreground",
              expanded ? "px-2.5 py-1 text-[10px]" : "text-[9px]",
            )}
          >
            {owner.items.length} {owner.items.length === 1 ? "activity" : "activities"}
          </Badge>
        </div>
        {!expanded ? (
          <>
            <h3
              id={`owner-${owner.owner}`}
              className="mt-3 text-xs font-bold text-[#12385f] dark:text-foreground"
            >
              {owner.owner}
            </h3>
            <p className="mt-1 text-[10px] leading-4 text-[#5d7183] dark:text-muted-foreground">
              {owner.description}
            </p>
          </>
        ) : null}
      </div>

      <div
        className={cn(
          "relative mt-3 pb-1",
          expanded
            ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
            : "ml-2 space-y-2.5 border-l border-[#b7c4d0] pl-4",
        )}
      >
        {owner.items.map((item) => (
          <ResponsibilityActivityCard
            key={item.activity}
            item={item}
            index={responsibilities.indexOf(item)}
            expanded={expanded}
          />
        ))}
      </div>
    </section>
  );
}

function ResponsibilityActivityCard({
  item,
  index,
  expanded,
}: {
  item: Responsibility;
  index: number;
  expanded: boolean;
}) {
  return (
    <details
      className={cn(
        "group relative rounded-[8px] border border-[#d3dee7] bg-white shadow-[0_2px_6px_rgba(18,56,95,0.07)] transition-[border-color,box-shadow] open:border-[#9fb8ce] dark:border-border dark:bg-card",
        expanded && "open:shadow-[0_6px_16px_rgba(18,56,95,0.09)]",
      )}
    >
      {!expanded ? (
        <span className="absolute -left-[17px] top-5 h-px w-4 bg-[#b7c4d0]" aria-hidden="true" />
      ) : null}
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2e6fb0] [&::-webkit-details-marker]:hidden",
          expanded ? "min-h-16 px-4 py-3.5" : "min-h-12 px-3 py-2.5",
        )}
      >
        <span
          className={cn(
            "app-mono flex shrink-0 items-center justify-center rounded bg-[#e7eef5] font-bold text-[#456078] dark:bg-muted",
            expanded ? "h-7 w-8 text-[10px]" : "h-5 w-6 text-[9px]",
          )}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 font-semibold text-[#183e63] dark:text-foreground",
            expanded ? "text-[13px] leading-5" : "text-[11px] leading-4",
          )}
        >
          {item.activity}
        </span>
        <ChevronDown
          className={cn(
            "shrink-0 text-[#6b8194] transition-transform duration-200 group-open:rotate-180",
            expanded ? "h-4 w-4" : "h-3.5 w-3.5",
          )}
        />
      </summary>
      <div
        className={cn(
          "border-t border-[#e4ebf1] dark:border-border",
          expanded ? "px-4 pb-4 pt-3.5" : "px-3 pb-3 pt-2.5",
        )}
      >
        <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#6b8194]">
          Supporting roles
        </div>
        <p className="mt-1 text-[10px] leading-4 text-slate-600 dark:text-muted-foreground">
          {item.supportingRoles}
        </p>
        <div className="mt-2.5 rounded-md border-l-[3px] border-[#c9a227] bg-[#f8f5e9] px-2.5 py-2 dark:bg-[#c9a227]/10">
          <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#7c641a] dark:text-[#e5c85b]">
            Required output
          </div>
          <div className="mt-1 flex items-start gap-1.5 text-[10px] font-medium leading-4 text-[#304a61] dark:text-foreground">
            <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-[#c9a227]" />
            <span>{item.output}</span>
          </div>
        </div>
      </div>
    </details>
  );
}

function PenMark() {
  return (
    <svg viewBox="0 0 54 42" className="h-9 w-11 shrink-0" role="img" aria-label="PEN">
      <circle cx="13" cy="11" r="5.5" fill="#C9A227" />
      <circle cx="27" cy="7" r="5.5" fill="#ffffff" />
      <circle cx="41" cy="11" r="5.5" fill="#4C9A54" />
      <circle cx="13" cy="27" r="5.5" fill="#4C9A54" />
      <circle cx="27" cy="31" r="5.5" fill="#C9A227" />
      <circle cx="41" cy="27" r="5.5" fill="#ffffff" />
    </svg>
  );
}
