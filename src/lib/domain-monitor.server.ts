import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { createConnection, isIP } from "node:net";
import tls from "node:tls";
import { domainToASCII } from "node:url";

import mysql from "mysql2/promise";

import type { DomainMonitor } from "./domain-monitor";
import {
  DATABASE_HOST,
  DATABASE_NAME,
  DATABASE_PORT,
  DATABASE_USER,
  ensureSchema,
} from "./project-db.server";

type DomainMonitorRow = {
  id: string;
  hostname: string;
  ssl_expires_at: number | null;
  domain_expires_at: number | null;
  ssl_issuer: string | null;
  registrar: string | null;
  checked_at: number | null;
  ssl_error: string | null;
  domain_error: string | null;
  created_at: number;
  updated_at: number;
};

type RdapBootstrap = {
  services?: Array<[string[], string[]]>;
};

type RdapEvent = {
  eventAction?: string;
  eventDate?: string;
};

type RdapEntity = {
  roles?: string[];
  vcardArray?: [string, Array<[string, Record<string, unknown>, string, unknown]>];
};

type RdapDomain = {
  events?: RdapEvent[];
  entities?: RdapEntity[];
};

const pool = mysql.createPool({
  host: DATABASE_HOST,
  port: DATABASE_PORT,
  user: DATABASE_USER,
  password: process.env.MYSQL_PASSWORD || undefined,
  database: DATABASE_NAME,
  charset: "utf8mb4",
});

let bootstrapCache: { data: RdapBootstrap; expiresAt: number } | null = null;

function toDomainMonitor(row: DomainMonitorRow): DomainMonitor {
  return {
    id: row.id,
    hostname: row.hostname,
    sslExpiresAt: row.ssl_expires_at ?? undefined,
    domainExpiresAt: row.domain_expires_at ?? undefined,
    sslIssuer: row.ssl_issuer ?? undefined,
    registrar: row.registrar ?? undefined,
    checkedAt: row.checked_at ?? undefined,
    sslError: row.ssl_error ?? undefined,
    domainError: row.domain_error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeHostname(input: string) {
  const value = input.trim();
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let hostname: string;

  try {
    hostname = new URL(candidate).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    throw new Error("Enter a valid domain name, such as example.com.");
  }

  const ascii = domainToASCII(hostname);
  if (!ascii || ascii.length > 253 || !ascii.includes(".") || isIP(ascii)) {
    throw new Error("Enter a public domain name, not an IP address or local hostname.");
  }

  const labels = ascii.split(".");
  if (
    labels.some(
      (label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
    )
  ) {
    throw new Error("The domain name contains an invalid label.");
  }

  if (/\.(?:local|localhost|internal|invalid|test|example)$/i.test(ascii)) {
    throw new Error("Only public registered domains can be monitored.");
  }

  return ascii;
}

function isPrivateAddress(address: string) {
  const mappedIpv4 = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return isPrivateAddress(mappedIpv4);

  if (address.includes(".")) {
    const parts = address.split(".").map(Number);
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("2001:db8:")
  );
}

async function resolvePublicAddress(hostname: string) {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  const publicAddress = addresses.find((entry) => !isPrivateAddress(entry.address));
  if (!publicAddress) throw new Error("The domain does not resolve to a public address.");
  return publicAddress.address;
}

async function inspectCertificate(hostname: string) {
  const address = await resolvePublicAddress(hostname);

  return new Promise<{ expiresAt: number; issuer?: string }>((resolve, reject) => {
    const socket = tls.connect({
      host: address,
      port: 443,
      servername: hostname,
      rejectUnauthorized: false,
      timeout: 10_000,
    });

    const finishWithError = (error: Error) => {
      socket.destroy();
      reject(error);
    };

    socket.once("secureConnect", () => {
      const certificate = socket.getPeerCertificate();
      const expiresAt = Date.parse(certificate.valid_to);
      socket.end();

      if (!certificate.valid_to || Number.isNaN(expiresAt)) {
        reject(new Error("No readable SSL certificate was presented on port 443."));
        return;
      }

      resolve({
        expiresAt,
        issuer: certificate.issuer?.O || certificate.issuer?.CN || undefined,
      });
    });
    socket.once("timeout", () => finishWithError(new Error("SSL connection timed out.")));
    socket.once("error", finishWithError);
  });
}

async function loadRdapBootstrap() {
  if (bootstrapCache && bootstrapCache.expiresAt > Date.now()) return bootstrapCache.data;

  const response = await fetch("https://data.iana.org/rdap/dns.json", {
    headers: { Accept: "application/json", "User-Agent": "OpsDesk-Domain-Monitor/1.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`IANA RDAP registry returned HTTP ${response.status}.`);

  const data = (await response.json()) as RdapBootstrap;
  bootstrapCache = { data, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
  return data;
}

function registeredUkDomain(hostname: string) {
  const labels = hostname.split(".");
  const secondLevelNamespaces = new Set([
    "ac.uk",
    "co.uk",
    "gov.uk",
    "ltd.uk",
    "me.uk",
    "net.uk",
    "org.uk",
    "plc.uk",
    "sch.uk",
  ]);
  const suffix = labels.slice(-2).join(".");
  return labels.slice(secondLevelNamespaces.has(suffix) ? -3 : -2).join(".");
}

async function inspectUkRegistration(hostname: string) {
  const registeredDomain = registeredUkDomain(hostname);

  return new Promise<{ expiresAt: number; registrar?: string }>((resolve, reject) => {
    const socket = createConnection({ host: "whois.nic.uk", port: 43, timeout: 12_000 });
    let response = "";

    const finishWithError = (error: Error) => {
      socket.destroy();
      reject(error);
    };

    socket.once("connect", () => socket.write(`${registeredDomain}\r\n`));
    socket.on("data", (chunk: Buffer) => {
      response += chunk.toString("utf8");
      if (response.length > 1_000_000)
        finishWithError(new Error("The registry response was too large."));
    });
    socket.once("timeout", () => finishWithError(new Error("The .uk registry lookup timed out.")));
    socket.once("error", finishWithError);
    socket.once("end", () => {
      const expiryText = response.match(
        /(?:Expiry|Renewal) date:\s*(\d{2}-[A-Za-z]{3}-\d{4})/i,
      )?.[1];
      const expiresAt = expiryText ? Date.parse(`${expiryText} 23:59:59 UTC`) : Number.NaN;
      if (Number.isNaN(expiresAt)) {
        if (/Registered on:\s*before Aug-1996/i.test(response)) {
          reject(
            new Error("Nominet lists this legacy .ac.uk registration with no set expiry date."),
          );
          return;
        }
        reject(new Error("The .uk registry did not publish an expiry date."));
        return;
      }

      const registrar = response.match(/^\s*Registrar:\s*\r?\n\s*(.+)$/im)?.[1]?.trim();
      resolve({ expiresAt, registrar });
    });
  });
}

function registrarName(entities: RdapEntity[] = []) {
  const registrar = entities.find((entity) => entity.roles?.includes("registrar"));
  const properties = registrar?.vcardArray?.[1] ?? [];
  const name = properties.find(([property]) => property === "fn")?.[3];
  return typeof name === "string" ? name : undefined;
}

async function inspectRegistration(hostname: string) {
  const tld = hostname.split(".").at(-1)?.toLowerCase();
  if (!tld) throw new Error("The domain does not have a recognised top-level domain.");
  if (tld === "uk") return inspectUkRegistration(hostname);

  const bootstrap = await loadRdapBootstrap();
  const service = bootstrap.services?.find(([tlds]) =>
    tlds.some((candidate) => candidate.toLowerCase() === tld),
  );
  const baseUrl = service?.[1]?.[0];
  if (!baseUrl) throw new Error(`No RDAP service is published for .${tld}.`);

  const labels = hostname.split(".");
  const candidates = labels.slice(0, -1).map((_, index) => labels.slice(index).join("."));
  let data: RdapDomain | null = null;

  for (const candidate of candidates) {
    const endpoint = `${baseUrl.replace(/\/?$/, "/")}domain/${encodeURIComponent(candidate)}`;
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/rdap+json, application/json",
        "User-Agent": "OpsDesk-Domain-Monitor/1.0",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });

    if (response.status === 404) continue;
    if (!response.ok) throw new Error(`The domain registry returned HTTP ${response.status}.`);
    data = (await response.json()) as RdapDomain;
    break;
  }

  if (!data) throw new Error("The registry did not return the registered parent domain.");

  const events = data.events ?? [];
  const expiry =
    events.find((event) => event.eventAction === "registrar expiration") ??
    events.find((event) => event.eventAction === "expiration");
  const expiresAt = expiry?.eventDate ? Date.parse(expiry.eventDate) : Number.NaN;
  if (Number.isNaN(expiresAt)) throw new Error("The registry did not publish an expiry date.");

  return { expiresAt, registrar: registrarName(data.entities) };
}

function readableError(reason: unknown) {
  return reason instanceof Error ? reason.message.slice(0, 500) : "The check failed unexpectedly.";
}

export async function listDomainMonitors() {
  await ensureSchema();
  const [rows] = await pool.query<DomainMonitorRow[]>(
    "SELECT * FROM domain_monitors ORDER BY updated_at DESC, hostname ASC",
  );
  return rows.map(toDomainMonitor);
}

export async function addDomainMonitor(input: string) {
  await ensureSchema();
  const hostname = normalizeHostname(input);
  const [existing] = await pool.query<DomainMonitorRow[]>(
    "SELECT * FROM domain_monitors WHERE hostname = ? LIMIT 1",
    [hostname],
  );
  if (existing[0]) return refreshDomainMonitor(existing[0].id);

  const now = Date.now();
  const id = randomUUID();
  await pool.execute(
    "INSERT INTO domain_monitors (id, hostname, created_at, updated_at) VALUES (?, ?, ?, ?)",
    [id, hostname, now, now],
  );
  return refreshDomainMonitor(id);
}

export async function refreshDomainMonitor(id: string) {
  await ensureSchema();
  const [rows] = await pool.query<DomainMonitorRow[]>(
    "SELECT * FROM domain_monitors WHERE id = ? LIMIT 1",
    [id],
  );
  const current = rows[0];
  if (!current) throw new Error("Domain monitor not found.");

  const [sslResult, domainResult] = await Promise.allSettled([
    inspectCertificate(current.hostname),
    inspectRegistration(current.hostname),
  ]);
  const now = Date.now();

  await pool.execute(
    `
      UPDATE domain_monitors
      SET ssl_expires_at = ?, domain_expires_at = ?, ssl_issuer = ?, registrar = ?,
          checked_at = ?, ssl_error = ?, domain_error = ?, updated_at = ?
      WHERE id = ?
    `,
    [
      sslResult.status === "fulfilled" ? sslResult.value.expiresAt : null,
      domainResult.status === "fulfilled" ? domainResult.value.expiresAt : null,
      sslResult.status === "fulfilled" ? (sslResult.value.issuer ?? null) : null,
      domainResult.status === "fulfilled" ? (domainResult.value.registrar ?? null) : null,
      now,
      sslResult.status === "rejected" ? readableError(sslResult.reason) : null,
      domainResult.status === "rejected" ? readableError(domainResult.reason) : null,
      now,
      id,
    ],
  );

  const [updated] = await pool.query<DomainMonitorRow[]>(
    "SELECT * FROM domain_monitors WHERE id = ? LIMIT 1",
    [id],
  );
  return toDomainMonitor(updated[0]);
}

export async function deleteDomainMonitor(id: string) {
  await ensureSchema();
  const [result] = await pool.execute("DELETE FROM domain_monitors WHERE id = ?", [id]);
  return { deleted: (result as mysql.ResultSetHeader).affectedRows > 0 };
}
