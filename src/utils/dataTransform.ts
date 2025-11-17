import { endOfDay, startOfDay } from "date-fns";
import type { DashboardData } from "../types";

function extractSceneId(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d+)/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
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
  for (const project of scopedProjects) {
    for (const sceneRaw of project.scenes) {
      const sceneId = extractSceneId(sceneRaw);
      if (sceneId === null) continue;
      if (!sceneToProjects.has(sceneId)) {
        sceneToProjects.set(sceneId, []);
      }
      const list = sceneToProjects.get(sceneId)!;
      if (!list.includes(project.projectId)) {
        list.push(project.projectId);
      }
    }
  }

  const relevantSceneIds = new Set(sceneToProjects.keys());

  const scopedArObjects = data.arObjects.filter(
    (obj) => obj.sceneId !== null && relevantSceneIds.has(obj.sceneId)
  );

  const arObjectProjectMap = new Map<number, Set<number>>();
  for (const obj of scopedArObjects) {
    if (obj.sceneId === null) continue;
    const owners = sceneToProjects.get(obj.sceneId);
    if (!owners || owners.length === 0) continue;
    arObjectProjectMap.set(obj.id, new Set(owners));
  }

  const scopedClicks = data.clicks.filter((click) => {
    const projectSet = arObjectProjectMap.get(click.objId);
    if (!projectSet || projectSet.size === 0) return false;
    return Array.from(projectSet).some((projectId) =>
      isWithinProjectRange(projectId, click.time)
    );
  });

  const sortedScopedClicks = [...scopedClicks]
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

  return {
    ...data,
    projects: scopedProjects,
    projectById: scopedProjectById,
    lightToProjectIds: scopedLightToProjectIds,
    scans: scopedScans,
    scanCoordinates: scopedScanCoordinates,
    arObjects: scopedArObjects,
    clicks: scopedClicks,
    firstClickByUser: scopedFirstClickByUser,
  };
}
