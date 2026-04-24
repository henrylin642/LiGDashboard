import { endOfDay, startOfDay } from "date-fns";
import type { DashboardData } from "../types";

function extractSceneId(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d+)/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

function extractSceneName(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const index = trimmed.indexOf("-");
  if (index === -1 || index === trimmed.length - 1) return null;
  return trimmed.slice(index + 1).trim();
}

function normalizeSceneName(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function addProjectOwner(
  map: Map<number, number[]>,
  sceneId: number | null,
  projectId: number
) {
  if (sceneId === null) return;
  if (!map.has(sceneId)) map.set(sceneId, []);
  const list = map.get(sceneId)!;
  if (!list.includes(projectId)) list.push(projectId);
}

function addProjectOwnerByName(
  map: Map<string, number[]>,
  sceneName: string | null,
  projectId: number
) {
  const key = normalizeSceneName(sceneName);
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  const list = map.get(key)!;
  if (!list.includes(projectId)) list.push(projectId);
}

export function scopeDashboardData(
  data: DashboardData,
  projectIds: Set<number>
): DashboardData {
  const scopedProjects = data.projects.filter((project) =>
    projectIds.has(project.projectId)
  );

  const MIN_DATE = startOfDay(new Date(-8640000000000000));
  const MAX_DATE = endOfDay(new Date(8640000000000000));
  const projectRangeMap = new Map<number, { start: Date; end: Date }>();
  for (const project of scopedProjects) {
    projectRangeMap.set(project.projectId, {
      start: project.startDate ? startOfDay(project.startDate) : MIN_DATE,
      end: project.endDate ? endOfDay(project.endDate) : MAX_DATE,
    });
  }

  const isWithinProjectRange = (projectId: number, timestamp: Date): boolean => {
    const range = projectRangeMap.get(projectId);
    if (!range) return false;
    return timestamp >= range.start && timestamp <= range.end;
  };

  const scopedProjectById = scopedProjects.reduce<
    Record<number, (typeof scopedProjects)[number]>
  >((acc, project) => {
    acc[project.projectId] = project;
    return acc;
  }, {});

  const scopedLightToProjectIds: Record<number, number[]> = {};
  for (const [lightIdRaw, ids] of Object.entries(data.lightToProjectIds)) {
    const lightId = Number(lightIdRaw);
    const matches = ids.filter((id) => projectIds.has(id));
    if (matches.length > 0) {
      scopedLightToProjectIds[lightId] = matches;
    }
  }

  const scopedScans = data.scans.filter((scan) => {
    const mapped = scopedLightToProjectIds[scan.ligId];
    if (!mapped || mapped.length === 0) return false;
    return mapped.some((projectId) => isWithinProjectRange(projectId, scan.time));
  });

  const lightIdsInScope = new Set<number>(
    Object.keys(scopedLightToProjectIds).map((id) => Number(id))
  );

  const scopedScanCoordinates = data.scanCoordinates.filter((coord) =>
    lightIdsInScope.has(coord.lightId)
  );

  const sceneToProjects = new Map<number, number[]>();
  const sceneNameToProjects = new Map<string, number[]>();

  // 1. Direct project.scenes
  for (const project of scopedProjects) {
    for (const sceneRaw of project.scenes || []) {
      const sceneId = extractSceneId(sceneRaw);
      addProjectOwner(sceneToProjects, sceneId, project.projectId);
      addProjectOwnerByName(
        sceneNameToProjects,
        extractSceneName(sceneRaw),
        project.projectId
      );
    }
  }

  // 2. Map via coordinate systems (scene -> lights -> project)
  for (const [sceneIdStr, lightIds] of Object.entries(data.sceneToLightIds || {})) {
    const sceneId = Number(sceneIdStr);
    for (const lightId of lightIds) {
      const projectIds = scopedLightToProjectIds[lightId] || [];
      for (const projectId of projectIds) {
        addProjectOwner(sceneToProjects, sceneId, projectId);
      }
    }
  }

  // 3. Map via lightConfigs
  for (const project of scopedProjects) {
    for (const config of project.lightConfigs || []) {
      for (const sceneRaw of config.scenes || []) {
        const sceneId = extractSceneId(sceneRaw);
        addProjectOwner(sceneToProjects, sceneId, project.projectId);
        addProjectOwnerByName(
          sceneNameToProjects,
          extractSceneName(sceneRaw),
          project.projectId
        );
      }
    }
  }

  // 4. Map via scene metadata directly when scene records already carry project ownership.
  for (const scene of data.scenes || []) {
    const projectId = scene.projectId ?? null;
    if (projectId === null || !projectIds.has(projectId)) continue;
    addProjectOwner(sceneToProjects, scene.id, projectId);
    addProjectOwnerByName(sceneNameToProjects, scene.name, projectId);
  }

  const relevantSceneIds = new Set(sceneToProjects.keys());
  const relevantSceneNames = new Set(sceneNameToProjects.keys());

  const scopedArObjects = data.arObjects.filter(
    (obj) =>
      (obj.sceneId !== null && relevantSceneIds.has(Number(obj.sceneId))) ||
      (obj.sceneName !== null &&
        relevantSceneNames.has(normalizeSceneName(obj.sceneName) ?? ""))
  );

  const arObjectProjectMap = new Map<number, Set<number>>();
  for (const obj of scopedArObjects) {
    const owners = new Set<number>();
    if (obj.sceneId !== null) {
      const byId = sceneToProjects.get(Number(obj.sceneId)) || [];
      byId.forEach((projectId) => owners.add(projectId));
    }
    if (obj.sceneName) {
      const byName = sceneNameToProjects.get(normalizeSceneName(obj.sceneName) ?? "") || [];
      byName.forEach((projectId) => owners.add(projectId));
    }
    if (owners.size === 0) continue;
    arObjectProjectMap.set(Number(obj.id), owners);
  }

  const scopedClicks = data.clicks.filter((click) => {
    const projectSet = arObjectProjectMap.get(Number(click.objId));
    if (!projectSet || projectSet.size === 0) return false;
    return Array.from(projectSet).some((projectId) =>
      isWithinProjectRange(projectId, click.time)
    );
  });

  const scopedRawClicks = data.rawClicks.filter((click) => {
    const projectSet = arObjectProjectMap.get(Number(click.objId));
    if (!projectSet || projectSet.size === 0) return false;
    return Array.from(projectSet).some((projectId) =>
      isWithinProjectRange(projectId, click.time)
    );
  });

  const sortedScopedClicks = [...scopedClicks]
    .filter((click) => Boolean(click.codeName))
    .sort((a, b) => a.time.getTime() - b.time.getTime());

  const sortedScopedRawClicks = [...scopedRawClicks]
    .filter((click) => Boolean(click.codeName))
    .sort((a, b) => a.time.getTime() - b.time.getTime());

  const scopedFirstClickByUser: Record<string, Date> = {};
  for (const click of sortedScopedClicks) {
    const userId = click.codeName!.trim();
    if (!userId) continue;
    if (!scopedFirstClickByUser[userId]) {
      scopedFirstClickByUser[userId] = click.time;
    }
  }

  const scopedRawFirstClickByUser: Record<string, Date> = {};
  for (const click of sortedScopedRawClicks) {
    const userId = click.codeName!.trim();
    if (!userId) continue;
    if (!scopedRawFirstClickByUser[userId]) {
      scopedRawFirstClickByUser[userId] = click.time;
    }
  }

  return {
    ...data,
    projects: scopedProjects,
    projectById: scopedProjectById,
    lightToProjectIds: scopedLightToProjectIds,
    scans: scopedScans,
    scanCoordinates: scopedScanCoordinates,
    arObjects: scopedArObjects,
    clicks: scopedClicks,
    rawClicks: scopedRawClicks,
    firstClickByUser: scopedFirstClickByUser,
    rawFirstClickByUser: scopedRawFirstClickByUser,
  };
}
