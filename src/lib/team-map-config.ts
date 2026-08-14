import type { ProjectTag } from "@/lib/tracker-types";

export type TreeCategory = ProjectTag | "untagged";
export type TreePersonRole = "dev" | "qa" | "support" | "web";
export type TreePersonStatus = "existing" | "new_joinee";
export type TreeOrgNodeTone = "candidate" | "vacancy";

export interface TreeProjectPerson {
  id: string;
  name: string;
  role: TreePersonRole;
  status: TreePersonStatus;
  offerSent?: boolean;
}

export interface TreeRequirements {
  dev: number;
  qa: number;
  support: number;
}

export interface TeamMapTreeProject {
  id: string;
  sourceProjectId?: string;
  name: string;
  category: TreeCategory;
  hidden: boolean;
  people: TreeProjectPerson[];
  requirements: TreeRequirements;
}

export interface TreeOrgNode {
  id: string;
  name: string;
  role: string;
  status?: string;
  tone: TreeOrgNodeTone;
}

export interface TeamMapTreeConfig {
  version: 1;
  projects: TeamMapTreeProject[];
  pmVacancies: TreeOrgNode[];
  qualityLead: TreeOrgNode;
  qualityReports: TreeOrgNode[];
  updatedAt: number;
}

export interface TeamMapTreeProjectSeed {
  id: string;
  name: string;
  category: TreeCategory;
  people: Array<{
    id: string;
    name: string;
    role: "dev" | "qa";
  }>;
}

export function makeTreeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyTreeRequirements(): TreeRequirements {
  return { dev: 0, qa: 0, support: 0 };
}

function nameKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function existingPerson(id: string, name: string, role: TreePersonRole): TreeProjectPerson {
  return { id, name, role, status: "existing" };
}

function newJoinee(id: string, offerSent = false): TreeProjectPerson {
  return {
    id,
    name: "New joinee",
    role: "dev",
    status: "new_joinee",
    offerSent,
  };
}

const requirementDefaults: Record<string, TreeRequirements> = {
  moodle: { dev: 1, qa: 0, support: 2 },
  novapathways: { dev: 3, qa: 3, support: 1 },
  univive: { dev: 1, qa: 1, support: 0 },
  educateu: { dev: 1, qa: 1, support: 0 },
  sims: { dev: 1, qa: 0, support: 2 },
  aiqqa: { dev: 4, qa: 0, support: 0 },
  qualityqualificationawards: { dev: 4, qa: 0, support: 0 },
  hr: { dev: 0, qa: 1, support: 1 },
  procurement: { dev: 0, qa: 1, support: 1 },
  ticketingsystem: { dev: 0, qa: 0, support: 0 },
  pma: { dev: 0, qa: 0, support: 0 },
  accounts: { dev: 0, qa: 1, support: 1 },
  flighteye: { dev: 0, qa: 0, support: 0 },
  cortexgrip: { dev: 0, qa: 0, support: 0 },
  jobhunger: { dev: 0, qa: 0, support: 0 },
  propertyscanner: { dev: 0, qa: 1, support: 1 },
};

function makeProjectFromSeed(seed: TeamMapTreeProjectSeed): TeamMapTreeProject {
  const key = nameKey(seed.name);
  return {
    id: `source-${seed.id}`,
    sourceProjectId: seed.id,
    name: seed.name,
    category: seed.category,
    hidden: key === "novabuddy",
    people: seed.people.map((person) => existingPerson(person.id, person.name, person.role)),
    requirements: requirementDefaults[key] ?? emptyTreeRequirements(),
  };
}

function ensurePerson(
  project: TeamMapTreeProject,
  person: Omit<TreeProjectPerson, "id"> & { id?: string },
) {
  const key = nameKey(person.name);
  if (project.people.some((candidate) => nameKey(candidate.name) === key)) return;
  project.people.push({ ...person, id: person.id ?? makeTreeId("person") });
}

export function createInitialTeamMapTreeConfig(seeds: TeamMapTreeProjectSeed[]): TeamMapTreeConfig {
  const projects = seeds.map(makeProjectFromSeed);

  const find = (...names: string[]) => {
    const keys = new Set(names.map(nameKey));
    return projects.find((project) => keys.has(nameKey(project.name)));
  };

  const addCustom = (
    name: string,
    category: TreeCategory,
    people: TreeProjectPerson[] = [],
    requirements: TreeRequirements = emptyTreeRequirements(),
  ) => {
    const existing = find(name);
    if (existing) return existing;
    const project: TeamMapTreeProject = {
      id: makeTreeId("custom-project"),
      name,
      category,
      hidden: false,
      people,
      requirements,
    };
    projects.push(project);
    return project;
  };

  const aiqqa =
    find("AIQQA", "Quality Qualification Awards") ??
    addCustom("AIQQA", "education", [], { dev: 4, qa: 0, support: 0 });
  aiqqa.name = "AIQQA";
  aiqqa.category = "education";
  aiqqa.requirements = { dev: 4, qa: 0, support: 0 };

  const educateU = find("EducateU", "Educate U");
  if (educateU) {
    ensurePerson(educateU, {
      name: "Ainul Hussain",
      role: "dev",
      status: "existing",
    });
  }

  const procurement = find("Procurement");
  if (procurement) {
    procurement.people = procurement.people.filter((person) => nameKey(person.name) !== "abdul");
    ensurePerson(procurement, {
      name: "Mahin Tazuar",
      role: "dev",
      status: "existing",
    });
    procurement.requirements = { dev: 0, qa: 1, support: 1 };
  }

  const cortexGrip = find("CortexGrip") ?? addCustom("CortexGrip", "b2c");
  cortexGrip.people.push(
    newJoinee(makeTreeId("cortex-joinee"), true),
    newJoinee(makeTreeId("cortex-joinee"), true),
  );
  cortexGrip.requirements = emptyTreeRequirements();

  const jobHunger = find("Job Hunger") ?? addCustom("Job Hunger", "b2c");
  jobHunger.people.push(
    newJoinee(makeTreeId("job-joinee"), true),
    newJoinee(makeTreeId("job-joinee"), true),
  );
  jobHunger.requirements = emptyTreeRequirements();

  const propertyScanner = find("Property Scanner") ?? addCustom("Property Scanner", "b2c");
  propertyScanner.people.push(
    newJoinee(makeTreeId("property-joinee")),
    newJoinee(makeTreeId("property-joinee")),
  );
  propertyScanner.requirements = { dev: 0, qa: 1, support: 1 };

  const neloEducation = addCustom("Nelo Education", "education");
  neloEducation.people.push(
    newJoinee(makeTreeId("nelo-joinee")),
    newJoinee(makeTreeId("nelo-joinee")),
  );

  addCustom(
    "Vcad Chatbot",
    "education",
    [existingPerson(makeTreeId("vcad-person"), "Abdul Alim", "dev")],
    emptyTreeRequirements(),
  );

  const novaPathways = find("Nova Pathways", "Novapathways");
  if (novaPathways) novaPathways.requirements = { dev: 3, qa: 3, support: 1 };

  const hr = find("HR");
  if (hr) hr.requirements = { dev: 0, qa: 1, support: 1 };

  return {
    version: 1,
    projects,
    pmVacancies: [
      {
        id: "pm-new-hire-1",
        name: "New hire 1",
        role: "Project Manager",
        status: "Interview On-going",
        tone: "vacancy",
      },
      {
        id: "pm-new-hire-2",
        name: "New hire 2",
        role: "Project Manager",
        status: "Interview On-going",
        tone: "vacancy",
      },
    ],
    qualityLead: {
      id: "quality-lead",
      name: "Showmita",
      role: "System Admin · QA · Support",
      tone: "candidate",
    },
    qualityReports: [
      {
        id: "quality-timmy-kayode",
        name: "Timmy Kayode",
        role: "System Admin · QA · Support",
        tone: "candidate",
      },
      {
        id: "quality-new-hire",
        name: "New hire",
        role: "System Admin · QA · Support",
        tone: "vacancy",
      },
    ],
    updatedAt: Date.now(),
  };
}

export function cloneTeamMapTreeConfig(config: TeamMapTreeConfig): TeamMapTreeConfig {
  return JSON.parse(JSON.stringify(config)) as TeamMapTreeConfig;
}

export function mergeLiveProjectsIntoTreeConfig(
  config: TeamMapTreeConfig,
  seeds: TeamMapTreeProjectSeed[],
) {
  const next = cloneTeamMapTreeConfig(config);
  const configuredIds = new Set(
    next.projects.map((project) => project.sourceProjectId).filter(Boolean),
  );
  for (const seed of seeds) {
    if (!configuredIds.has(seed.id)) next.projects.push(makeProjectFromSeed(seed));
  }
  return next;
}
