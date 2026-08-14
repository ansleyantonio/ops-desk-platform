export const APP_ROLES = ["admin", "manager", "viewer"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const APP_PERMISSIONS = [
  "projects:view",
  "projects:manage",
  "teams:view",
  "teams:manage",
  "domains:view",
  "domains:manage",
  "users:manage",
] as const;
export type AppPermission = (typeof APP_PERMISSIONS)[number];

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  status: "active" | "suspended";
  permissions: AppPermission[];
  lastLoginAt?: number;
  createdAt: number;
};

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrator",
  manager: "Project manager",
  viewer: "Viewer",
};

export const ROLE_PERMISSIONS: Record<AppRole, AppPermission[]> = {
  admin: [...APP_PERMISSIONS],
  manager: [
    "projects:view",
    "projects:manage",
    "teams:view",
    "teams:manage",
    "domains:view",
    "domains:manage",
  ],
  viewer: ["projects:view", "teams:view", "domains:view"],
};

export function hasPermission(user: AuthUser | null | undefined, permission: AppPermission) {
  return Boolean(user?.permissions.includes(permission));
}
