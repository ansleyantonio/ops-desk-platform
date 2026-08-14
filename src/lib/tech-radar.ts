export type TechRadarSourceId = "typescript" | "nextjs" | "php" | "blade" | "javascript" | "python";

export type TechUpdateKind = "major" | "minor" | "patch" | "prerelease" | "release";

export interface TechRadarSource {
  id: TechRadarSourceId;
  label: string;
  ecosystem: string;
  repository: string;
  repositoryUrl: string;
  penRepositoriesUrl: string;
  securityUrl: string;
}

export interface TechRadarUpdate {
  id: string;
  sourceId: TechRadarSourceId;
  title: string;
  version: string;
  url: string;
  publishedAt: string;
  summary: string;
  kind: TechUpdateKind;
  prerelease: boolean;
}

export interface TechRadarData {
  fetchedAt: string;
  sources: TechRadarSource[];
  updates: TechRadarUpdate[];
  unavailableSourceIds: TechRadarSourceId[];
}
