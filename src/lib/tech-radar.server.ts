import type {
  TechRadarData,
  TechRadarSource,
  TechRadarSourceId,
  TechRadarUpdate,
  TechUpdateKind,
} from "./tech-radar";

type GithubRelease = {
  id: number;
  name: string | null;
  tag_name: string;
  html_url: string;
  published_at: string | null;
  created_at: string;
  body: string | null;
  prerelease: boolean;
  draft: boolean;
};

const CACHE_TTL_MS = 15 * 60 * 1000;

export const TECH_RADAR_SOURCES: TechRadarSource[] = [
  {
    id: "typescript",
    label: "TypeScript",
    ecosystem: "Compiler and language tooling",
    repository: "microsoft/TypeScript",
    repositoryUrl: "https://github.com/microsoft/TypeScript/releases",
    penRepositoriesUrl:
      "https://github.com/orgs/PlanetEducationNetworks/repositories?language=typescript&type=all",
    securityUrl: "https://github.com/microsoft/TypeScript/security",
  },
  {
    id: "php",
    label: "PHP",
    ecosystem: "Runtime and core language",
    repository: "php/php-src",
    repositoryUrl: "https://github.com/php/php-src/releases",
    penRepositoriesUrl:
      "https://github.com/orgs/PlanetEducationNetworks/repositories?language=php&type=all",
    securityUrl: "https://www.php.net/releases/",
  },
  {
    id: "nextjs",
    label: "Next.js",
    ecosystem: "React application framework",
    repository: "vercel/next.js",
    repositoryUrl: "https://github.com/vercel/next.js/releases",
    penRepositoriesUrl:
      "https://github.com/orgs/PlanetEducationNetworks/repositories?q=next&type=all",
    securityUrl: "https://github.com/vercel/next.js/security/advisories",
  },
  {
    id: "blade",
    label: "Blade",
    ecosystem: "Laravel framework and templates",
    repository: "laravel/framework",
    repositoryUrl: "https://github.com/laravel/framework/releases",
    penRepositoriesUrl:
      "https://github.com/orgs/PlanetEducationNetworks/repositories?language=blade&type=all",
    securityUrl: "https://github.com/laravel/framework/security/policy",
  },
  {
    id: "javascript",
    label: "JavaScript",
    ecosystem: "Node.js runtime",
    repository: "nodejs/node",
    repositoryUrl: "https://github.com/nodejs/node/releases",
    penRepositoriesUrl:
      "https://github.com/orgs/PlanetEducationNetworks/repositories?language=javascript&type=all",
    securityUrl: "https://nodejs.org/en/security",
  },
  {
    id: "python",
    label: "Python",
    ecosystem: "CPython runtime",
    repository: "python/cpython",
    repositoryUrl: "https://github.com/python/cpython/releases",
    penRepositoriesUrl:
      "https://github.com/orgs/PlanetEducationNetworks/repositories?language=python&type=all",
    securityUrl: "https://www.python.org/dev/security/",
  },
];

let cachedRadar: TechRadarData | null = null;
let cachedAt = 0;

function releaseKind(version: string, prerelease: boolean): TechUpdateKind {
  if (prerelease) return "prerelease";
  const match = version.match(/(?:^|[^0-9])(\d+)\.(\d+)\.(\d+)(?:$|[^0-9])/);
  if (!match) return "release";
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (patch > 0) return "patch";
  if (minor > 0) return "minor";
  return "major";
}

function releaseSummary(body: string | null) {
  if (!body) return "Open the official release notes for the complete change list.";
  const cleaned = body
    .replace(/<!--[^]*?-->/g, " ")
    .replace(/```[^]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/^[#>*+-]+\s*/gm, "")
    .replace(/[`*_~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Open the official release notes for the complete change list.";
  return cleaned.length > 260 ? `${cleaned.slice(0, 257).trimEnd()}…` : cleaned;
}

async function loadSourceUpdates(source: TechRadarSource): Promise<TechRadarUpdate[]> {
  const releaseLimit = source.id === "nextjs" ? 50 : 8;
  const response = await fetch(
    `https://api.github.com/repos/${source.repository}/releases?per_page=${releaseLimit}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "PEN-Project-Portal-Tech-Radar",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!response.ok) {
    throw new Error(`${source.label} release feed returned HTTP ${response.status}`);
  }

  const releases = (await response.json()) as GithubRelease[];
  return releases
    .filter((release) => !release.draft && (source.id !== "nextjs" || !release.prerelease))
    .slice(0, 8)
    .map((release) => {
      const version = release.tag_name || release.name || "Release";
      return {
        id: `${source.id}-${release.id}`,
        sourceId: source.id,
        title: release.name?.trim() || version,
        version,
        url: release.html_url,
        publishedAt: release.published_at || release.created_at,
        summary: releaseSummary(release.body),
        kind: releaseKind(version, release.prerelease),
        prerelease: release.prerelease,
      };
    });
}

export async function loadTechRadar(): Promise<TechRadarData> {
  const now = Date.now();
  if (cachedRadar && now - cachedAt < CACHE_TTL_MS) return cachedRadar;

  const results = await Promise.allSettled(TECH_RADAR_SOURCES.map(loadSourceUpdates));
  const updates: TechRadarUpdate[] = [];
  const unavailableSourceIds: TechRadarSourceId[] = [];

  results.forEach((result, index) => {
    const source = TECH_RADAR_SOURCES[index];
    if (result.status === "fulfilled") updates.push(...result.value);
    else unavailableSourceIds.push(source.id);
  });

  if (updates.length === 0) {
    throw new Error("Official release feeds are temporarily unavailable.");
  }

  cachedRadar = {
    fetchedAt: new Date().toISOString(),
    sources: TECH_RADAR_SOURCES,
    updates: updates.sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
    ),
    unavailableSourceIds,
  };
  cachedAt = now;
  return cachedRadar;
}
