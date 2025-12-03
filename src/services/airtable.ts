const FIELD_PROJECT_ID =
  import.meta.env.VITE_AIRTABLE_EVENTS_FIELD_EVENT_ID?.trim() || "ProjectID";
const FIELD_NAME =
  import.meta.env.VITE_AIRTABLE_EVENTS_FIELD_NAME?.trim() || "Project Name";
const FIELD_START =
  import.meta.env.VITE_AIRTABLE_EVENTS_FIELD_START?.trim() || "Start Date";
const FIELD_END =
  import.meta.env.VITE_AIRTABLE_EVENTS_FIELD_END?.trim() || "End Date";
const FIELD_COORDINATES =
  import.meta.env.VITE_AIRTABLE_PROJECT_FIELD_COORDINATES?.trim() || "Coordinates";
const FIELD_LIGHT_IDS =
  import.meta.env.VITE_AIRTABLE_PROJECT_FIELD_LIGHT_IDS?.trim() || "Light ID";
const FIELD_SCENES =
  import.meta.env.VITE_AIRTABLE_PROJECT_FIELD_SCENES?.trim() || "Scenes";
const FIELD_ACTIVE =
  import.meta.env.VITE_AIRTABLE_PROJECT_FIELD_ACTIVE?.trim() || "Is Active";
const FIELD_LAT_LON =
  import.meta.env.VITE_AIRTABLE_PROJECT_FIELD_LAT_LON?.trim() || "Latitude and Longitude";
const FIELD_OWNER_EMAIL =
  import.meta.env.VITE_AIRTABLE_PROJECT_FIELD_OWNER_EMAIL?.trim() || "Owner Email";

export interface AirtableProject {
  id: string;
  projectId: string;
  projectName: string;
  startDate: string | null;
  endDate: string | null;
  coordinates: string[];
  lightIds: string[];
  scenes: string[];
  isActive: boolean;
  latLon: string | null;
  ownerEmails: string[];
  createdTime: string;
}

interface AirtableRecord<T> {
  id: string;
  createdTime: string;
  fields: T;
}

interface ProjectFields {
  [key: string]: string | number | boolean | null | undefined;
}

function coerceString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function coerceBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  if (typeof value === "number") return value !== 0;
  return false;
}

function parseList(value: unknown): string[] {
  const str = coerceString(value);
  if (!str) return [];
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch (error) {
    // fall back to comma-separated parsing
  }
  return str
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringifyList(list: string[] | null | undefined): string {
  if (!list || list.length === 0) return "[]";
  return JSON.stringify(list);
}

function mapRecord(record: AirtableRecord<ProjectFields>): AirtableProject {
  return {
    id: record.id,
    projectId: coerceString(record.fields[FIELD_PROJECT_ID]) ?? "",
    projectName: coerceString(record.fields[FIELD_NAME]) ?? "",
    startDate: coerceString(record.fields[FIELD_START]),
    endDate: coerceString(record.fields[FIELD_END]),
    coordinates: parseList(record.fields[FIELD_COORDINATES]),
    lightIds: parseList(record.fields[FIELD_LIGHT_IDS]),
    scenes: parseList(record.fields[FIELD_SCENES]),
    isActive: coerceBoolean(record.fields[FIELD_ACTIVE]),
    latLon: coerceString(record.fields[FIELD_LAT_LON]),
    ownerEmails: parseList(record.fields[FIELD_OWNER_EMAIL]),
    createdTime: record.createdTime,
  };
}

export async function fetchProjects(): Promise<AirtableProject[]> {
  const response = await fetch("/api/projects");

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`讀取專案資料失敗：${response.status} ${text}`);
  }

  const json = await response.json();
  // Backend already maps the data for GET /api/projects
  return json as AirtableProject[];
}

export interface SaveProjectPayload {
  projectId: string;
  projectName: string;
  startDate: string | null;
  endDate: string | null;
  coordinates: string[];
  lightIds: string[];
  scenes: string[];
  isActive: boolean;
  latLon: string | null;
  ownerEmails: string[];
}

function toFields(payload: SaveProjectPayload): ProjectFields {
  const fields: ProjectFields = {};
  if (payload.projectId.trim() !== "") {
    const numericId = Number(payload.projectId);
    fields[FIELD_PROJECT_ID] = Number.isFinite(numericId)
      ? numericId
      : payload.projectId.trim();
  }
  fields[FIELD_NAME] = payload.projectName;

  fields[FIELD_START] = payload.startDate || null;
  fields[FIELD_END] = payload.endDate || null;
  fields[FIELD_COORDINATES] = stringifyList(payload.coordinates);
  fields[FIELD_LIGHT_IDS] = stringifyList(payload.lightIds);
  fields[FIELD_SCENES] = stringifyList(payload.scenes);
  fields[FIELD_ACTIVE] = payload.isActive;
  fields[FIELD_LAT_LON] = payload.latLon || null;
  fields[FIELD_OWNER_EMAIL] = stringifyList(payload.ownerEmails);
  return fields;
}

export async function createProject(
  payload: SaveProjectPayload
): Promise<AirtableProject> {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: toFields(payload) }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`建立專案失敗：${response.status} ${text}`);
  }

  const json = (await response.json()) as AirtableRecord<ProjectFields>;
  return mapRecord(json);
}

export async function updateProject(
  id: string,
  payload: SaveProjectPayload
): Promise<AirtableProject> {
  const response = await fetch(`/api/projects/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: toFields(payload) }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`更新專案失敗：${response.status} ${text}`);
  }

  const json = (await response.json()) as AirtableRecord<ProjectFields>;
  return mapRecord(json);
}

export async function deleteProject(id: string): Promise<void> {
  const response = await fetch(`/api/projects/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`刪除專案失敗：${response.status} ${text}`);
  }
}
