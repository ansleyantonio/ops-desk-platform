import React from "react";

export type ThemeMode = "light" | "dark";
export type DensityMode = "comfortable" | "compact";

export type ShellActions = {
  openNewProject: (() => void) | null;
  focusSearch: (() => void) | null;
};

export type ShellProject = {
  id: string;
  name: string;
  count: number;
  tone: "blue" | "green" | "amber" | "red";
};

export type ShellMetrics = {
  totalProjects: number;
  inProgress: number;
  overdue: number;
  completed: number;
  openRisks: number;
  projects: ShellProject[];
};

export type AppShellContextValue = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  density: DensityMode;
  setDensity: (density: DensityMode) => void;
  setShellActions: (actions: Partial<ShellActions>) => void;
  setShellMetrics: (metrics: Partial<ShellMetrics>) => void;
};

export const DEFAULT_METRICS: ShellMetrics = {
  totalProjects: 0,
  inProgress: 0,
  overdue: 0,
  completed: 0,
  openRisks: 0,
  projects: [],
};

export const AppShellContext = React.createContext<AppShellContextValue | null>(null);

export function useAppShell() {
  const context = React.useContext(AppShellContext);
  if (!context) {
    throw new Error("useAppShell must be used within AppShell.");
  }
  return context;
}
