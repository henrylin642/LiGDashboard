import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  fetchCsv,
  parseDate,
  parseNumber,
} from "../utils/csv";
import {
  fetchArObjectsWithMeta,
  fetchLights,
  fetchCoordinateSystemsWithMeta
} from "../services/ligApi";
import { fetchProjects as fetchAirtableProjects } from "../services/airtable";
import type {
  ArObjectRecord,
  ClickRecord,
  CoordinateSystemRecord,
  DashboardData,
  DashboardDataState,
  LightRecord,
  Project,
  ScanCoordinateRecord,
  ScanRecord,
  LightConfig,
} from "../types";

const DashboardDataContext = createContext<DashboardDataState>({
  status: "loading",
});

export function useDashboardData(): DashboardDataState {
  return useContext(DashboardDataContext);
}

export function DashboardDataProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, setState] = useState<DashboardDataState>({ status: "loading" });
  const [ligToken, setLigToken] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("lig_token") ?? "";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: StorageEvent) => {
      if (event.key === "lig_token") {
        setLigToken(event.newValue ?? "");
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        setState({ status: "loading" });
        const [
          projects,
          scans,
          lights,
          coordinateSystems,
          clicks,
          scanCoordinates,
        ] = await Promise.all([
          loadProjects(),
          loadScans(),
          loadLights(ligToken),
          loadCoordinateSystems(ligToken),
          loadClicks(),
          loadScanCoordinates(),
        ]);

        const allLightIds = new Set<number>();
        projects.forEach((p) => p.lightIds.forEach((id) => allLightIds.add(id)));
        lights.forEach((l) => allLightIds.add(l.ligId));

        // Initial load: DO NOT load AR objects for all lights to avoid 404 storm.
        // We will lazy load them when needed.
        const arObjects: ArObjectRecord[] = [];

        if (!isMounted) return;

        const projectById: Record<number, Project> = {};
        const lightToProjectIds: Record<number, number[]> = {};

        for (const project of projects) {
          projectById[project.projectId] = project;
          for (const lightId of project.lightIds) {
            if (!lightToProjectIds[lightId]) {
              lightToProjectIds[lightId] = [];
            }
            lightToProjectIds[lightId].push(project.projectId);
          }
        }

        const firstClickByUser = buildFirstClickByUser(clicks);

        const data: DashboardData = {
          projects,
          scans,
          lights,
          coordinateSystems,
          clicks,
          arObjects,
          scanCoordinates,
          projectById,
          lightToProjectIds,
          firstClickByUser,
        };

        setState({ status: "ready", data });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown data loading error";

        // Check for specific upstream error indicating expired session/signature
        if (message.includes("Signature has expired")) {
          console.warn("[DashboardData] Session/Signature expired, clearing token and reloading...");
          if (typeof window !== "undefined") {
            window.localStorage.removeItem("lig_token");
            // Small delay to ensure storage is cleared before reload
            setTimeout(() => window.location.reload(), 100);
            return;
          }
        }

        if (isMounted) {
          setState({ status: "error", error: message });
        }
      }
    }

    load();
    return () => {
      isMounted = false;
    };
  }, [ligToken]);

  // Track which light IDs have been loaded to avoid duplicate fetches
  const [loadedLightIds, setLoadedLightIds] = useState<Set<number>>(new Set());

  const loadArObjectsForLights = async (lightIds: number[]) => {
    if (!ligToken) return;

    // Filter out already loaded IDs
    const newIds = lightIds.filter(id => !loadedLightIds.has(id));
    if (newIds.length === 0) return;

    // Mark as loaded immediately to prevent race conditions
    setLoadedLightIds(prev => {
      const next = new Set(prev);
      newIds.forEach(id => next.add(id));
      return next;
    });

    try {
      const newArObjects = await loadArObjects(ligToken, newIds);

      setState(prev => {
        if (prev.status !== "ready" || !prev.data) return prev;

        // Merge new AR objects, avoiding duplicates
        const existingIds = new Set(prev.data.arObjects.map(o => o.id));
        const uniqueNewObjects = newArObjects.filter(o => !existingIds.has(o.id));

        if (uniqueNewObjects.length === 0) return prev;

        return {
          ...prev,
          data: {
            ...prev.data,
            arObjects: [...prev.data.arObjects, ...uniqueNewObjects]
          }
        };
      });
    } catch (e) {
      console.error("Failed to lazy load AR objects", e);
    }
  };

  const reloadProjects = async () => {
    try {
      const projects = await loadProjects();

      setState((prev) => {
        if (prev.status !== "ready" || !prev.data) return prev;

        const projectById: Record<number, Project> = {};
        const lightToProjectIds: Record<number, number[]> = {};

        for (const project of projects) {
          projectById[project.projectId] = project;
          for (const lightId of project.lightIds) {
            if (!lightToProjectIds[lightId]) {
              lightToProjectIds[lightId] = [];
            }
            lightToProjectIds[lightId].push(project.projectId);
          }
        }

        return {
          ...prev,
          data: {
            ...prev.data,
            projects,
            projectById,
            lightToProjectIds,
          },
        };
      });
    } catch (error) {
      console.error("[DashboardData] Failed to reload projects", error);
    }
  };

  return (
    <DashboardDataContext.Provider value={{ ...state, loadArObjectsForLights, reloadProjects }}>
      {children}
    </DashboardDataContext.Provider>
  );
}

async function loadProjects(): Promise<Project[]> {
  try {
    const airtableProjects = await fetchAirtableProjects();
    if (airtableProjects.length > 0) {
      const projects: Project[] = [];
      for (const item of airtableProjects) {
        const parsedId = parseNumber(item.projectId);
        if (parsedId === null) continue;
        const startDate = item.startDate ? parseDate(item.startDate) : null;
        const endDate = item.endDate ? parseDate(item.endDate) : null;
        let latLon: { lat: number; lon: number } | null = null;
        if (item.latLon) {
          const [latStr, lonStr] = item.latLon.split(",").map((part) => part.trim());
          const lat = Number(latStr);
          const lon = Number(lonStr);
          if (Number.isFinite(lat) && Number.isFinite(lon)) {
            latLon = { lat, lon };
          }
        }
        let lightConfigs: LightConfig[] = [];
        if (item.lightConfigs) {
          try {
            const parsed = JSON.parse(item.lightConfigs);
            if (Array.isArray(parsed)) {
              lightConfigs = parsed;
            }
          } catch (e) {
            console.warn("[DashboardData] Failed to parse lightConfigs", e);
          }
        }
        projects.push({
          projectId: parsedId,
          name: item.projectName.trim() || `Project ${parsedId}`,
          startDate,
          endDate,
          coordinates: item.coordinates ?? [],
          lightIds: (Array.isArray(item.lightIds) ? item.lightIds : [])
            .map((value) => parseNumber(value))
            .filter((value): value is number => value !== null),
          scenes: item.scenes ?? [],
          isActive: item.isActive,
          latLon,
          ownerEmails: [...(item.ownerEmails ?? [])].sort(),
          lightConfigs,
        });
      }
      if (projects.length > 0) {
        return projects;
      }
    }
  } catch (error) {
    console.error("[DashboardData] 讀取 Airtable projects 失敗", error);
    throw error; // Re-throw to let the main load function handle it
  }

  // Fallback to CSV is disabled per user request "Unless local backup is performed, forbid using local Data"
  // const rows = await fetchCsv<Project>("/api/data/projects.csv", ...);
  return [];
}

async function loadScans(): Promise<ScanRecord[]> {
  return fetchCsv<ScanRecord>("/api/data/scandata.csv", (row) => {
    const ligId = parseNumber(row["ligtag_id"]);
    if (ligId === null) return null;
    const time = parseDate(row["time"]);
    if (!time) return null;
    return {
      time,
      ligId,
      clientId: row["client_id"]?.trim() ?? "",
      coordinateSystemId: parseNumber(row["coordinate_system_id"]),
    };
  });
}

async function loadLights(token?: string): Promise<LightRecord[]> {
  if (!token) return [];
  const lights = await fetchLights(token);
  return lights.map(l => {
    const ligId = Number(l.id);
    if (!Number.isFinite(ligId)) return null;
    return {
      ligId,
      latitude: l.latitude ?? 0,
      longitude: l.longitude ?? 0,
      fieldId: l.fieldId ?? 0,
      coordinateSystemId: l.coordinateSystemId ?? 0,
      coordinateSystemName: l.coordinateSystemName,
      updatedAt: l.updatedAt ? new Date(l.updatedAt) : null
    } as LightRecord;
  }).filter(Boolean) as LightRecord[];
}

async function loadCoordinateSystems(token?: string): Promise<CoordinateSystemRecord[]> {
  if (!token) return [];
  const systems = await fetchCoordinateSystemsWithMeta(token);
  return systems.map(s => {
    const id = Number(s.id);
    if (!Number.isFinite(id)) return null;
    return {
      id,
      name: s.name,
      sceneId: null, // API doesn't return bound scene ID directly in this endpoint usually, or it needs mapping
      sceneName: null,
      createdAt: null,
      updatedAt: null
    } as CoordinateSystemRecord;
  }).filter(Boolean) as CoordinateSystemRecord[];
}

async function loadClicks(): Promise<ClickRecord[]> {
  return fetchCsv<ClickRecord>("/api/data/obj_click_log.csv", (row) => {
    const objId = parseNumber(row["obj_id"]);
    const time = parseDate(row["time"]);
    if (objId === null || !time) return null;
    return {
      objId,
      time,
      codeName: row["code_name"]?.trim() ?? "",
    };
  });
}

function buildFirstClickByUser(clicks: ClickRecord[]): Record<string, Date> {
  const result: Record<string, Date> = {};
  for (const click of clicks) {
    const userId = click.codeName;
    if (!userId) continue;
    const existing = result[userId];
    if (!existing || click.time < existing) {
      result[userId] = click.time;
    }
  }
  return result;
}

async function loadArObjects(
  token?: string,
  lightIds: number[] = []
): Promise<ArObjectRecord[]> {
  if (token) {
    try {
      const list = await fetchArObjectsWithMeta(token, lightIds);
      if (list.length > 0) {
        return list.map((item) => {
          const idNum = Number(item.id);
          if (!Number.isFinite(idNum)) return null;
          return {
            id: idNum,
            name: item.name,
            sceneId: item.sceneId,
            sceneName: item.sceneName,
            locationX: item.location?.x ?? null,
            locationY: item.location?.y ?? null,
            locationZ: item.location?.z ?? null,
          } as ArObjectRecord;
        }).filter(Boolean) as ArObjectRecord[];
      }
    } catch (error) {
      console.warn("[DashboardData] 無法從 API 載入 AR objects", error);
    }
  }

  return [];
}

async function loadScanCoordinates(): Promise<ScanCoordinateRecord[]> {
  // No API available for scan coordinates yet
  return [];
}
