import React, { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Broadcast as RadarIcon, GlobeHemisphereWest as DomainIcon } from "@phosphor-icons/react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  AppShellContext,
  DEFAULT_METRICS,
  type AppShellContextValue,
  type DensityMode,
  type ShellActions,
  type ShellMetrics,
  type ShellProject,
  type ThemeMode,
} from "./app-shell-context";
import { DomainExpiryReminder } from "./DomainExpiryReminder";
import { hasPermission, ROLE_LABELS, type AuthUser } from "@/lib/auth";
import { logout } from "@/lib/auth.functions";
import {
  Activity,
  AtSign,
  Bell,
  CheckSquare,
  ChevronDown,
  ChevronsUpDown,
  Clock3,
  FileBarChart2,
  Gauge,
  GitBranch,
  Grid3X3,
  Home,
  Inbox,
  Layers3,
  LogOut,
  Menu,
  MoonStar,
  Plus,
  Search,
  Settings,
  SunMedium,
  Target,
  TrendingUp,
  BriefcaseBusiness,
  UserRound,
  UsersRound,
  Zap,
} from "lucide-react";

function readTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem("ppt:theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readDensity(): DensityMode {
  if (typeof window === "undefined") return "comfortable";
  const stored = window.localStorage.getItem("ppt:density");
  return stored === "compact" ? "compact" : "comfortable";
}

function applyShellPreferences(theme: ThemeMode, density: DensityMode) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.density = density;
}

function scrollToId(id: string) {
  if (typeof document === "undefined") return;
  const el = document.getElementById(id);
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function AppShell({
  children,
  currentUser,
}: {
  children: ReactNode;
  currentUser: AuthUser;
}) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [theme, setThemeState] = useState<ThemeMode>(() => readTheme());
  const [density, setDensityState] = useState<DensityMode>(() => readDensity());
  const [shellActions, setShellActionsState] = useState<ShellActions>({
    openNewProject: null,
    focusSearch: null,
  });
  const [shellMetrics, setShellMetricsState] = useState<ShellMetrics>(DEFAULT_METRICS);

  useEffect(() => {
    applyShellPreferences(theme, density);
    window.localStorage.setItem("ppt:theme", theme);
    window.localStorage.setItem("ppt:density", density);
  }, [theme, density]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo<AppShellContextValue>(
    () => ({
      theme,
      setTheme: (next) => setThemeState(next),
      density,
      setDensity: (next) => setDensityState(next),
      setShellActions: (actions) =>
        setShellActionsState((current) => ({
          ...current,
          ...actions,
        })),
      setShellMetrics: (metrics) =>
        setShellMetricsState((current) => ({
          ...current,
          ...metrics,
        })),
    }),
    [theme, density],
  );
  const pageMeta = getPageMeta(location.pathname);

  const primaryNavItems = [
    {
      label: "Command",
      icon: Home,
      count: null,
      active: true,
      onClick: () => scrollToId("overview"),
    },
    {
      label: "Delivery",
      icon: CheckSquare,
      count: shellMetrics.inProgress,
      active: false,
      onClick: () => scrollToId("board"),
    },
    {
      label: "Timeline",
      icon: Clock3,
      count: null,
      active: false,
      onClick: () => scrollToId("week"),
    },
    {
      label: "Risk inbox",
      icon: Inbox,
      count: shellMetrics.overdue,
      active: false,
      onClick: () => scrollToId("health"),
    },
    {
      label: "Portfolio",
      icon: Layers3,
      count: shellMetrics.totalProjects,
      active: false,
      onClick: () => scrollToId("board"),
    },
    {
      label: "Signals",
      icon: AtSign,
      count: shellMetrics.openRisks,
      active: false,
      onClick: () => scrollToId("activity"),
    },
  ];

  const pageItems = [
    {
      label: "Dashboard",
      icon: Home,
      to: "/" as const,
    },
    {
      label: "Teams",
      icon: UsersRound,
      to: "/teams" as const,
    },
    {
      label: "Team map",
      icon: GitBranch,
      to: "/team-map" as const,
    },
    {
      label: "Team workflow",
      icon: UsersRound,
      to: "/team-workflow" as const,
    },
    {
      label: "Team performance",
      icon: TrendingUp,
      children: [
        { label: "Dev performance", icon: TrendingUp, to: "/dev-performance" as const },
        { label: "PM performance", icon: FileBarChart2, to: "/pm-performance" as const },
      ],
    },
    {
      label: "Recruitment",
      icon: BriefcaseBusiness,
      to: "/recruitment" as const,
    },
    {
      label: "Responsibility chart",
      icon: Target,
      to: "/responsibility-chart" as const,
    },
    {
      label: "Tech Radar",
      icon: RadarIcon,
      to: "/tech-radar" as const,
    },
    {
      label: "Domain Watch",
      icon: DomainIcon,
      to: "/domains" as const,
    },
    ...(hasPermission(currentUser, "users:manage")
      ? [{ label: "Users & access", icon: UserRound, to: "/users" as const }]
      : []),
  ];

  const viewItems = [
    { label: "Queue", icon: Grid3X3, onClick: () => scrollToId("board") },
    { label: "Roadmap", icon: Zap, onClick: () => scrollToId("health") },
    { label: "Capacity", icon: FileBarChart2, onClick: () => scrollToId("week") },
    { label: "Controls", icon: Settings, onClick: () => scrollToId("overview") },
  ];

  const openNewProject = () => {
    shellActions.openNewProject?.();
    setMobileOpen(false);
    setCommandOpen(false);
  };

  const focusSearch = () => {
    shellActions.focusSearch?.();
    setMobileOpen(false);
    setCommandOpen(false);
  };

  const toggleTheme = () => {
    setThemeState((current) => (current === "dark" ? "light" : "dark"));
    setCommandOpen(false);
  };

  const toggleDensity = () => {
    setDensityState((current) => (current === "compact" ? "comfortable" : "compact"));
    setCommandOpen(false);
  };

  const openCommand = () => {
    setCommandOpen(true);
    setMobileOpen(false);
  };

  const signOut = async () => {
    await logout();
    window.location.assign("/login");
  };

  return (
    <AppShellContext.Provider value={value}>
      <a
        href="#main-content"
        className="sr-only rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to content
      </a>
      <div className="min-h-screen">
        <DomainExpiryReminder />
        <aside className="app-shell-frame fixed inset-y-0 left-0 z-30 hidden w-[272px] border-r px-0 md:flex md:flex-col">
          <div className="flex h-full min-h-0 flex-col overflow-y-auto px-4 py-5">
            <SidebarContent
              density={density}
              metrics={shellMetrics}
              navItems={primaryNavItems}
              pageItems={pageItems}
              viewItems={viewItems}
              pathname={location.pathname}
              currentUser={currentUser}
              theme={theme}
              onCommand={openCommand}
              onDensity={toggleDensity}
              onLogout={() => void signOut()}
              onTheme={toggleTheme}
            />
          </div>
        </aside>

        <div className="min-h-screen md:pl-[272px]">
          <header className="app-shell-frame sticky top-0 z-20 border-b px-3 sm:px-5">
            <div className="flex min-h-[72px] items-center gap-3 py-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 md:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
              >
                <Menu className="h-4 w-4" />
              </Button>
              <div className="min-w-0 flex-1">
                <div className="app-kicker">Contextual top bar</div>
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                  <span className="truncate text-base font-semibold tracking-[-0.03em] text-foreground">
                    {pageMeta.title}
                  </span>
                  <span className="app-chip hidden sm:inline-flex">{pageMeta.description}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={openCommand}
                className="hidden h-10 items-center gap-2 rounded-full border border-border/80 bg-background/65 px-3 text-left text-xs text-muted-foreground transition-colors hover:border-primary/25 hover:text-foreground lg:inline-flex"
                aria-label="Open command palette"
              >
                <Search className="h-3.5 w-3.5" />
                <span>Command palette</span>
                <span className="app-mono rounded-full border border-border px-2 py-0.5 text-[10px]">
                  ⌘K
                </span>
              </button>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10"
                  onClick={toggleTheme}
                  aria-label="Toggle theme"
                >
                  {theme === "dark" ? (
                    <SunMedium className="h-3.5 w-3.5" />
                  ) : (
                    <MoonStar className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="hidden h-10 w-10 sm:inline-flex"
                  onClick={toggleDensity}
                  aria-label="Toggle density"
                >
                  <ChevronsUpDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="hidden h-10 w-10 sm:inline-flex"
                  aria-label="Notifications"
                >
                  <Bell className="h-3.5 w-3.5" />
                </Button>
                <Button
                  className="h-10 w-10 px-0 text-xs sm:w-auto sm:px-4"
                  onClick={openNewProject}
                  aria-label="Create project"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Create project</span>
                </Button>
                <UserAccountMenu currentUser={currentUser} onLogout={() => void signOut()} />
              </div>
            </div>
          </header>

          <main
            id="main-content"
            className={density === "compact" ? "px-3 py-4 sm:px-4" : "px-3 py-4 sm:px-5 sm:py-6"}
          >
            {children}
          </main>
        </div>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[min(19rem,calc(100vw-0.5rem))] border-0 bg-transparent p-2 shadow-none sm:p-4">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <div className="app-shell-frame flex h-full flex-col border border-border rounded-[1.6rem] px-3 py-4">
              <SidebarContent
                density={density}
                metrics={shellMetrics}
                navItems={primaryNavItems}
                pageItems={pageItems}
                viewItems={viewItems}
                pathname={location.pathname}
                currentUser={currentUser}
                theme={theme}
                onCommand={openCommand}
                onDensity={toggleDensity}
                onLogout={() => void signOut()}
                onNavigate={() => setMobileOpen(false)}
                onTheme={toggleTheme}
              />
            </div>
          </SheetContent>
        </Sheet>

        <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
          <CommandInput placeholder="Search projects, actions, and views..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Actions">
              <CommandItem onSelect={openNewProject}>
                <Plus className="h-4 w-4" />
                New project
                <CommandShortcut>⌘N</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={focusSearch}>
                <Search className="h-4 w-4" />
                Focus project search
                <CommandShortcut>⌘F</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Appearance">
              <CommandItem onSelect={toggleTheme}>
                {theme === "dark" ? (
                  <SunMedium className="h-4 w-4" />
                ) : (
                  <MoonStar className="h-4 w-4" />
                )}
                Toggle theme
              </CommandItem>
              <CommandItem onSelect={toggleDensity}>
                <ChevronsUpDown className="h-4 w-4" />
                Toggle density
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Navigation">
              <CommandItem onSelect={() => scrollToId("overview")}>
                <Home className="h-4 w-4" />
                Command
              </CommandItem>
              <CommandItem onSelect={() => scrollToId("board")}>
                <Target className="h-4 w-4" />
                Project queue
              </CommandItem>
              <CommandItem onSelect={() => scrollToId("health")}>
                <Gauge className="h-4 w-4" />
                Blocker signal
              </CommandItem>
              <CommandItem onSelect={() => scrollToId("activity")}>
                <Activity className="h-4 w-4" />
                Change log
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </CommandDialog>
      </div>
    </AppShellContext.Provider>
  );
}

function UserAccountMenu({
  currentUser,
  onLogout,
}: {
  currentUser: AuthUser;
  onLogout: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-10 items-center gap-2 rounded-full border border-border/80 bg-background/65 p-1 pr-1 text-left transition-[border-color,background-color,transform] duration-300 hover:border-primary/30 hover:bg-background active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:pr-2.5"
          aria-label="Open account menu"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-[10px] font-bold tracking-[-0.02em] text-background">
            {userInitials(currentUser.name)}
          </span>
          <span className="hidden max-w-28 truncate text-xs font-semibold text-foreground xl:block">
            {currentUser.name}
          </span>
          <ChevronDown className="mr-0.5 hidden h-3 w-3 text-muted-foreground sm:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-64 rounded-[1.1rem] border-border/80 p-1.5 shadow-[var(--shadow-elevated)]"
      >
        <DropdownMenuLabel className="px-3 py-2.5 font-normal">
          <div className="truncate text-sm font-semibold tracking-[-0.02em] text-foreground">
            {currentUser.name}
          </div>
          <div className="mt-1 truncate text-[11px] text-muted-foreground">{currentUser.email}</div>
          <div className="mt-2 inline-flex rounded-full border border-border bg-muted/55 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {ROLE_LABELS[currentUser.role]}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onLogout}
          className="rounded-xl px-3 py-2.5 text-xs font-medium text-destructive focus:bg-destructive/10 focus:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Sign out of OpsDesk
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarContent({
  density,
  metrics,
  navItems,
  pageItems,
  pathname,
  currentUser,
  viewItems,
  theme,
  onCommand,
  onDensity,
  onLogout,
  onNavigate,
  onTheme,
}: {
  density: DensityMode;
  metrics: ShellMetrics;
  navItems: Array<{
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count: number | null;
    active: boolean;
    onClick: () => void;
  }>;
  pageItems: Array<{
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    to?:
      | "/"
      | "/teams"
      | "/team-map"
      | "/team-workflow"
      | "/team-performance"
      | "/dev-performance"
      | "/pm-performance"
      | "/recruitment"
      | "/responsibility-chart"
      | "/tech-radar"
      | "/domains"
      | "/users";
    children?: Array<{
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      to: "/dev-performance" | "/pm-performance";
    }>;
  }>;
  pathname: string;
  currentUser: AuthUser;
  viewItems: Array<{
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    onClick: () => void;
  }>;
  theme: ThemeMode;
  onCommand: () => void;
  onDensity: () => void;
  onLogout: () => void;
  onNavigate?: () => void;
  onTheme: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-3 px-2">
        <BrandMark />
        <div className="leading-tight">
          <div className="text-xs font-bold uppercase tracking-[0.14em] text-foreground">
            OpsDesk
          </div>
          <div className="text-[11px] text-muted-foreground">Operations command layer</div>
        </div>
      </div>

      <button
        type="button"
        onClick={onCommand}
        className="mt-5 flex h-11 w-full items-center gap-2 rounded-full border border-border/80 bg-background/65 px-3 text-left text-xs text-muted-foreground transition-colors hover:border-primary/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1">Search workspace, people, actions...</span>
        <span className="app-mono rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
          ⌘K
        </span>
      </button>

      <nav className="mt-5 space-y-1" aria-label="Pages">
        {pageItems.map((item) => item.children ? (
          <details key={item.label} className="group/performance" open={item.children.some((child) => pathname === child.to)}>
            <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-full px-3 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/55 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <item.icon className="h-3.5 w-3.5" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-open/performance:rotate-180" />
            </summary>
            <div className="ml-4 mt-1 space-y-1 border-l border-border/70 pl-2">
              {item.children.map((child) => <SidebarRouteLink key={child.to} active={pathname === child.to} icon={child.icon} label={child.label} onNavigate={onNavigate} to={child.to} />)}
            </div>
          </details>
        ) : item.to ? (
          <SidebarRouteLink key={item.to} active={pathname === item.to} icon={item.icon} label={item.label} onNavigate={onNavigate} to={item.to} />
        ) : null)}
      </nav>

      <nav className="mt-3 space-y-1" aria-label="Primary">
        {navItems.map((item) => (
          <SidebarButton
            key={item.label}
            active={item.active}
            count={item.count}
            icon={item.icon}
            label={item.label}
            onClick={() => {
              item.onClick();
              onNavigate?.();
            }}
          />
        ))}
      </nav>

      <SidebarSection label="Portfolio">
        {metrics.projects.length > 0 ? (
          metrics.projects.slice(0, 4).map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => {
                scrollToId("board");
                onNavigate?.();
              }}
              className="flex h-8 w-full items-center gap-2 rounded-full px-3 text-left text-xs text-muted-foreground transition-colors hover:bg-accent/55 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className={cn("h-2 w-2 rounded-sm", projectTone[project.tone])} />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
              <span className="app-mono text-[11px]">{project.count}</span>
            </button>
          ))
        ) : (
          <div className="rounded-[1.25rem] border border-dashed border-border/80 bg-muted/30 px-3 py-3 text-xs leading-5 text-muted-foreground">
            Add projects to build your workspace.
          </div>
        )}
      </SidebarSection>

      <SidebarSection label="Command views">
        {viewItems.map((item) => (
          <SidebarButton
            key={item.label}
            icon={item.icon}
            label={item.label}
            onClick={() => {
              item.onClick();
              onNavigate?.();
            }}
          />
        ))}
      </SidebarSection>

      <div className="mt-auto space-y-3 pt-5">
        <Separator />
        <div className="rounded-[1.4rem] border border-border/80 bg-muted/32 px-3 py-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <UserRound className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-semibold tracking-[-0.02em] text-foreground">
              {currentUser.name}
            </div>
            <div className="truncate text-[11px] text-muted-foreground">
              {ROLE_LABELS[currentUser.role]}
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onLogout}
          className="w-full justify-start rounded-xl px-3 text-xs text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={onTheme}>
            {theme === "dark" ? (
              <SunMedium className="h-3.5 w-3.5" />
            ) : (
              <MoonStar className="h-3.5 w-3.5" />
            )}
            {theme === "dark" ? "Light" : "Dark"}
          </Button>
          <Button variant="outline" size="sm" onClick={onDensity}>
            <ChevronsUpDown className="h-3.5 w-3.5" />
            {density === "compact" ? "Comfy" : "Compact"}
          </Button>
        </div>
      </div>
    </>
  );
}

function userInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function SidebarSection({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="mt-5">
      <div className="mb-2 px-2 app-kicker">{label}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function SidebarRouteLink({
  active = false,
  icon: Icon,
  label,
  onNavigate,
  to,
}: {
  active?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onNavigate?: () => void;
  to:
    | "/"
    | "/teams"
    | "/team-map"
    | "/team-workflow"
    | "/team-performance"
    | "/dev-performance"
    | "/pm-performance"
    | "/recruitment"
    | "/responsibility-chart"
    | "/tech-radar"
    | "/domains"
    | "/users";
}) {
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-full px-3 text-left text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-primary/12 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          : "text-muted-foreground hover:bg-accent/55 hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Link>
  );
}

function SidebarButton({
  active = false,
  count,
  icon: Icon,
  label,
  onClick,
}: {
  active?: boolean;
  count?: number | null;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-full px-3 text-left text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-primary/12 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          : "text-muted-foreground hover:bg-accent/55 hover:text-foreground",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {typeof count === "number" && count > 0 && (
        <span className="text-[11px] font-normal text-muted-foreground tabular-nums">{count}</span>
      )}
    </button>
  );
}

function BrandMark() {
  return (
    <div
      className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-[1.15rem] bg-foreground text-background shadow-[var(--shadow-card)]"
      aria-hidden="true"
    >
      <span className="text-[11px] font-black tracking-[-0.08em]">OD</span>
      <span className="absolute bottom-0 left-0 h-1 w-full bg-primary/90" />
    </div>
  );
}

function getPageMeta(pathname: string) {
  if (pathname === "/teams") {
    return {
      title: "Teams",
      description: "People, reporting lines, and delivery team coverage",
    };
  }
  if (pathname === "/team-map") {
    return {
      title: "Team map",
      description: "Assignment relationships across projects and functional owners",
    };
  }
  if (pathname === "/team-workflow") {
    return {
      title: "Team workflow",
      description: "Leadership path, project managers, and delivery team structure",
    };
  }
  if (pathname === "/team-performance") {
    return {
      title: "Team performance",
      description: "Member-level delivery statistics across project tickets",
    };
  }
  if (pathname === "/dev-performance") {
    return { title: "Dev performance", description: "Developer and QA delivery statistics across project tickets" };
  }
  if (pathname === "/pm-performance") {
    return { title: "PM performance", description: "Project manager delivery statistics across project tickets" };
  }
  if (pathname === "/recruitment") {
    return {
      title: "Recruitment",
      description: "Candidate pipeline from initial recruitment through offer",
    };
  }
  if (pathname === "/responsibility-chart") {
    return {
      title: "Responsibility chart",
      description: "PM and Tech Lead accountability across the delivery lifecycle",
    };
  }
  if (pathname === "/tech-radar") {
    return {
      title: "PEN Tech Radar",
      description: "Official releases and patches across the PEN engineering stack",
    };
  }
  if (pathname === "/domains") {
    return {
      title: "Domain Watch",
      description: "SSL certificate and domain-registration renewal monitoring",
    };
  }
  if (pathname === "/users") {
    return {
      title: "Users & access",
      description: "Accounts, roles, permissions, and access status",
    };
  }
  return {
    title: "Dashboard",
    description: "Portfolio health, queue triage, and daily delivery context",
  };
}

const projectTone: Record<ShellProject["tone"], string> = {
  blue: "bg-primary",
  green: "bg-success",
  amber: "bg-warning",
  red: "bg-destructive",
};
