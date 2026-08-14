export interface DomainMonitor {
  id: string;
  hostname: string;
  sslExpiresAt?: number;
  domainExpiresAt?: number;
  sslIssuer?: string;
  registrar?: string;
  checkedAt?: number;
  sslError?: string;
  domainError?: string;
  createdAt: number;
  updatedAt: number;
}

export type DomainHealth = "healthy" | "attention" | "critical" | "unknown";

export function daysUntil(timestamp?: number) {
  if (!timestamp) return null;
  return Math.ceil((timestamp - Date.now()) / 86_400_000);
}

export function expiryHealth(timestamp?: number): DomainHealth {
  const days = daysUntil(timestamp);
  if (days === null) return "unknown";
  if (days <= 14) return "critical";
  if (days <= 45) return "attention";
  return "healthy";
}

export function domainHealth(domain: DomainMonitor): DomainHealth {
  const states = [expiryHealth(domain.sslExpiresAt), expiryHealth(domain.domainExpiresAt)];
  if (states.includes("critical")) return "critical";
  if (states.includes("attention")) return "attention";
  if (states.every((state) => state === "healthy")) return "healthy";
  return "unknown";
}
