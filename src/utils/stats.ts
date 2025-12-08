import {
  addMonths,
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";
import type {
  ClickRecord, DashboardData, Project, ScanRecord, UserBehaviorStats,
  LightConfig,
} from "../types";

export interface ScanSummary {
  totalProjects: number;
  activeProjects: number;
  totalScans: number;
  scansToday: number;
  scansYesterday: number;
  scansThisWeek: number;
  scansLastWeek: number;
  scansThisMonth: number;
  scansLastMonth: number;
  uniqueUsers: number;
}

export interface ProjectRankRow {
  projectId: number;
  name: string;
  lastMonth: number;
  thisMonth: number;
  lastWeek: number;
  thisWeek: number;
  yesterday: number;
  today: number;
  total: number;
}

export interface DailyScanPoint {
  date: Date;
  total: number;
  projects: Record<number, number>;
  orphans: number;
}

export interface DailyClickPoint {
  date: Date;
  total: number;
}

export interface ScanVolumePoint {
  date: Date;
  total: number;
}

export interface ScanVolumeMonthlyPoint {
  month: Date;
  total: number;
}

const MIN_RANGE_DATE = startOfDay(new Date(-8640000000000000));
const MAX_RANGE_DATE = endOfDay(new Date(8640000000000000));

function isWithinProjectRange(
  project: Project | undefined,
  timestamp: Date
): boolean {
  if (!project) return false;
  const start = project.startDate ? startOfDay(project.startDate) : MIN_RANGE_DATE;
  const end = project.endDate ? endOfDay(project.endDate) : MAX_RANGE_DATE;
  return timestamp >= start && timestamp <= end;
}

export interface HeatmapPoint {
  projectId: number;
  name: string;
  lat: number;
  lon: number;
  scans: number;
}

export interface ClickRankingRow {
  objId: number;
  name: string;
  sceneName: string | null;
  count: number;
}

export interface UserAcquisitionPoint {
  date: Date;
  newUsers: number;
  returningUsers: number;
  cumulativeUsers: number;
  projectBreakdown?: {
    projectId: number;
    projectName: string;
    newUsers: number;
    returningUsers: number;
  }[];
}

export interface ProjectUserAcquisitionRow {
  projectId: number;
  name: string;
  newUsers: number;
  activeUsers: number;
  topSceneName: string | null;
  topSceneNewUsers: number;
}

export interface SceneUserStatRow {
  sceneId: number;
  sceneName: string;
  newUsers: number;
  activeUsers: number;
  projectNames: string[];
}

export interface ClickSessionStep {
  objId: number;
  name: string;
  sceneId: number | null;
  sceneName: string | null;
  timestamp: Date;
}

export interface ClickSessionRecord {
  id: string;
  userId: string;
  date: Date;
  start: Date;
  end: Date;
  durationSeconds: number;
  clickCount: number;
  firstStep: ClickSessionStep | null;
  lastStep: ClickSessionStep | null;
  steps: ClickSessionStep[];
  sceneIds: number[];
}

export interface SessionPathStat {
  path: string[];
  count: number;
}

export interface ClickSessionAnalytics {
  sessions: ClickSessionRecord[];
  insights: ClickSessionInsights;
}

export interface ObjectMarketingMetric {
  objId: number;
  name: string;
  sceneName: string | null;
  projectNames: string[];
  totalClicks: number;
  clicks30d: number;
  clicks12m: number;
  ctrTotal: number | null;
  ctr30d: number | null;
  ctr12m: number | null;
  avgDwellSeconds: number | null;
}

export interface SceneObjectShare {
  objId: number;
  name: string;
  clicks: number;
  share: number;
}

export interface SceneMarketingStat {
  sceneId: number;
  sceneName: string;
  projectNames: string[];
  totalClicks: number;
  uniqueUsers: number;
  sessionCount: number;
  avgSessionsPerUser: number;
  objectShares: SceneObjectShare[];
}

export interface UserBehaviorStats {
  windowDays: number;
  totalSessions: number;
  totalUsers: number;
  newUsers: number;
  returningUsers: number;
  avgSessionsPerUser: number;
  avgRevisitDays: number | null;
  frequencyBuckets: {
    heavy: number;
    medium: number;
    light: number;
  };
}

export interface ProjectFunnelRow {
  projectId: number;
  projectName: string;
  scans: number;
  clicks: number;
  newUsers: number;
  activeUsers: number;
  clickThroughRate: number | null;
  activationRate: number | null;
}

export interface ClickDaypartStats {
  windowDays: number;
  hourly: Array<{ hour: number; clicks: number }>;
  weekdayHourMatrix: number[][];
  weekdayLabels: string[];
  totalClicks: number;
}

export interface ProjectObjectAttributionRow {
  projectId: number;
  projectName: string;
  objId: number;
  objName: string;
  sceneName: string | null;
  clicks: number;
  shareWithinProject: number;
}

export function computeScanSummary(
  data: DashboardData,
  referenceDate: Date = new Date()
): ScanSummary {
  const { projectScans } = buildProjectScanIndex(data);
  const todayStart = startOfDay(referenceDate);
  const todayEnd = endOfDay(referenceDate);
  const yesterdayStart = startOfDay(subDays(referenceDate, 1));
  const yesterdayEnd = endOfDay(subDays(referenceDate, 1));
  const thisWeekStart = startOfWeek(referenceDate, { weekStartsOn: 1 });
  const thisWeekEnd = endOfWeek(referenceDate, { weekStartsOn: 1 });
  const lastWeekStart = startOfWeek(subDays(thisWeekStart, 1), { weekStartsOn: 1 });
  const lastWeekEnd = endOfWeek(subDays(thisWeekStart, 1), { weekStartsOn: 1 });
  const thisMonthStart = startOfMonth(referenceDate);
  const thisMonthEnd = endOfMonth(referenceDate);
  const lastMonthStart = startOfMonth(subMonths(referenceDate, 1));
  const lastMonthEnd = endOfMonth(subMonths(referenceDate, 1));

  let scansToday = 0;
  let scansYesterday = 0;
  let scansThisWeek = 0;
  let scansLastWeek = 0;
  let scansThisMonth = 0;
  let scansLastMonth = 0;
  const scans = data.scans;
  const totalScans = scans.length;

  for (const scan of scans) {
    if (scan.time >= todayStart && scan.time <= todayEnd) {
      scansToday += 1;
    } else if (scan.time >= yesterdayStart && scan.time <= yesterdayEnd) {
      scansYesterday += 1;
    }
    if (scan.time >= thisWeekStart && scan.time <= thisWeekEnd) {
      scansThisWeek += 1;
    }
    if (scan.time >= lastWeekStart && scan.time <= lastWeekEnd) {
      scansLastWeek += 1;
    }
    if (scan.time >= thisMonthStart && scan.time <= thisMonthEnd) {
      scansThisMonth += 1;
    }
    if (scan.time >= lastMonthStart && scan.time <= lastMonthEnd) {
      scansLastMonth += 1;
    }
  }

  const activeProjects = Object.entries(projectScans).filter(
    ([, scans]) => scans.length > 0
  ).length;

  const uniqueUsers = new Set<string>();
  for (const click of data.clicks) {
    if (click.codeName) {
      uniqueUsers.add(click.codeName.trim());
    }
  }

  return {
    totalProjects: data.projects.length,
    activeProjects,
    totalScans,
    scansToday,
    scansYesterday,
    scansThisWeek,
    scansLastWeek,
    scansThisMonth,
    scansLastMonth,
    uniqueUsers: uniqueUsers.size,
  };
}

export function computeProjectRankRows(
  data: DashboardData,
  referenceDate: Date = new Date()
): ProjectRankRow[] {
  const { projectScans } = buildProjectScanIndex(data);
  const boundaries = createBoundaries(referenceDate);

  return data.projects.map<ProjectRankRow>((project) => {
    const scans = projectScans[project.projectId] ?? [];
    const counters = {
      lastMonth: countScans(scans, boundaries.lastMonth.start, boundaries.lastMonth.end),
      thisMonth: countScans(scans, boundaries.thisMonth.start, boundaries.thisMonth.end),
      lastWeek: countScans(scans, boundaries.lastWeek.start, boundaries.lastWeek.end),
      thisWeek: countScans(scans, boundaries.thisWeek.start, boundaries.thisWeek.end),
      yesterday: countScans(scans, boundaries.yesterday.start, boundaries.yesterday.end),
      today: countScans(scans, boundaries.today.start, boundaries.today.end),
    };

    return {
      projectId: project.projectId,
      name: project.name,
      ...counters,
      total: scans.length,
    };
  });
}

export function computeDailyScanSeries(
  data: DashboardData,
  start: Date,
  end: Date
): DailyScanPoint[] {
  const { projectScans, orphanScans } = buildProjectScanIndex(data);
  if (start > end) return [];
  const days = eachDayOfInterval({ start: startOfDay(start), end: endOfDay(end) });

  return days.map((day) => {
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);
    const projects: Record<number, number> = {};
    let total = 0;
    let orphans = 0;

    for (const project of data.projects) {
      const scans = projectScans[project.projectId] ?? [];
      let count = 0;
      for (const scan of scans) {
        if (scan.time >= dayStart && scan.time <= dayEnd) {
          count += 1;
        }
      }
      if (count > 0) {
        projects[project.projectId] = count;
        total += count;
      }
    }

    for (const scan of orphanScans) {
      if (scan.time >= dayStart && scan.time <= dayEnd) {
        orphans += 1;
      }
    }

    total += orphans;

    return { date: dayStart, total, projects, orphans };
  });
}

export function computeDailyClickSeries(
  data: DashboardData,
  start: Date,
  end: Date
): DailyClickPoint[] {
  const rangeStart = startOfDay(start);
  const rangeEnd = endOfDay(end);
  if (rangeStart > rangeEnd) return [];
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  if (days.length === 0) return [];

  const counts = new Map<number, number>();
  for (const day of days) {
    const key = startOfDay(day).getTime();
    counts.set(key, 0);
  }

  for (const click of data.clicks) {
    if (click.time < rangeStart || click.time > rangeEnd) continue;
    const key = startOfDay(click.time).getTime();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return days.map((day) => {
    const key = startOfDay(day).getTime();
    return {
      date: startOfDay(day),
      total: counts.get(key) ?? 0,
    };
  });
}

export function computeScanVolumeSeries(
  data: DashboardData,
  windowDays = 30,
  referenceDate: Date = new Date()
): ScanVolumePoint[] {
  if (windowDays <= 0) return [];
  const end = endOfDay(referenceDate);
  const start = startOfDay(subDays(end, windowDays - 1));
  if (start > end) return [];
  const days = eachDayOfInterval({ start, end });

  if (days.length === 0) return [];

  const counts = new Map<number, number>();
  for (const day of days) {
    const key = startOfDay(day).getTime();
    counts.set(key, 0);
  }

  for (const scan of data.scans) {
    if (scan.time < start || scan.time > end) continue;
    const key = startOfDay(scan.time).getTime();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return days.map((day) => {
    const key = startOfDay(day).getTime();
    return {
      date: startOfDay(day),
      total: counts.get(key) ?? 0,
    };
  });
}

export function computeScanVolumeMonthly(
  data: DashboardData,
  months = 12,
  referenceDate: Date = new Date()
): ScanVolumeMonthlyPoint[] {
  if (months <= 0) return [];
  const rangeEnd = endOfMonth(referenceDate);
  const rangeStart = startOfMonth(subMonths(referenceDate, months - 1));
  const monthsList = eachMonthOfInterval({ start: rangeStart, end: rangeEnd });
  if (monthsList.length === 0) return [];

  const counts = new Map<number, number>();
  for (const month of monthsList) {
    const key = startOfMonth(month).getTime();
    counts.set(key, 0);
  }

  for (const scan of data.scans) {
    if (scan.time < rangeStart || scan.time > rangeEnd) continue;
    const monthStart = startOfMonth(scan.time);
    const key = monthStart.getTime();
    if (!counts.has(key)) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return monthsList.map((month) => {
    const key = startOfMonth(month).getTime();
    return {
      month: startOfMonth(month),
      total: counts.get(key) ?? 0,
    };
  });
}

export function computeClickVolumeSeries(
  data: DashboardData,
  windowDays = 30,
  referenceDate: Date = new Date()
): ScanVolumePoint[] {
  if (windowDays <= 0) return [];
  const end = endOfDay(referenceDate);
  const start = startOfDay(subDays(end, windowDays - 1));
  if (start > end) return [];
  const days = eachDayOfInterval({ start, end });
  if (days.length === 0) return [];

  const counts = new Map<number, number>();
  for (const day of days) {
    counts.set(startOfDay(day).getTime(), 0);
  }

  for (const click of data.clicks) {
    if (click.time < start || click.time > end) continue;
    const key = startOfDay(click.time).getTime();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return days.map((day) => {
    const key = startOfDay(day).getTime();
    return {
      date: startOfDay(day),
      total: counts.get(key) ?? 0,
    };
  });
}

export function computeClickVolumeMonthly(
  data: DashboardData,
  months = 12,
  referenceDate: Date = new Date()
): ScanVolumeMonthlyPoint[] {
  if (months <= 0) return [];
  const rangeEnd = endOfMonth(referenceDate);
  const rangeStart = startOfMonth(subMonths(referenceDate, months - 1));
  const monthsList = eachMonthOfInterval({ start: rangeStart, end: rangeEnd });
  if (monthsList.length === 0) return [];

  const counts = new Map<number, number>();
  for (const month of monthsList) {
    counts.set(startOfMonth(month).getTime(), 0);
  }

  for (const click of data.clicks) {
    if (click.time < rangeStart || click.time > rangeEnd) continue;
    const key = startOfMonth(click.time).getTime();
    if (!counts.has(key)) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return monthsList.map((month) => {
    const key = startOfMonth(month).getTime();
    return {
      month: startOfMonth(month),
      total: counts.get(key) ?? 0,
    };
  });
}

export interface ClickSessionInsights {
  totalSessions: number;
  avgDurationSeconds: number;
  medianDurationSeconds: number;
  topEntryObjects: Array<{ objId: number; name: string; count: number }>;
  topExitObjects: Array<{ objId: number; name: string; count: number }>;
  topTransitions: Array<{ fromId: number; toId: number; fromName: string; toName: string; count: number }>;
  topPaths: SessionPathStat[];
}

export function buildClickSessionAnalytics(
  data: DashboardData,
  sessionGapMinutes = 10
): ClickSessionAnalytics {
  const sessions = buildClickSessions(data, sessionGapMinutes);
  const insights = summarizeClickSessions(sessions);
  return { sessions, insights };
}

export function computeClickSessionInsights(
  data: DashboardData,
  sessionGapMinutes = 10
): ClickSessionInsights {
  return buildClickSessionAnalytics(data, sessionGapMinutes).insights;
}

function buildClickSessions(
  data: DashboardData,
  sessionGapMinutes: number
): ClickSessionRecord[] {
  if (data.clicks.length === 0) return [];
  const gapMs = Math.max(1, sessionGapMinutes) * 60 * 1000;
  const objectMeta = new Map<
    number,
    { name: string; sceneId: number | null; sceneName: string | null }
  >();
  data.arObjects.forEach((obj) => {
    objectMeta.set(obj.id, {
      name: obj.name || `#${obj.id}`,
      sceneId: obj.sceneId ?? null,
      sceneName: obj.sceneName ?? null,
    });
  });

  const grouped = new Map<string, ClickRecord[]>();
  for (const click of data.clicks) {
    if (!click.codeName) continue;
    const userId = click.codeName.trim();
    if (!userId) continue;
    const dayKey = startOfDay(click.time).getTime();
    const key = `${userId}__${dayKey}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(click);
  }

  const sessions: ClickSessionRecord[] = [];
  let sequence = 0;

  const finalizeSession = (
    clicks: ClickRecord[],
    userId: string,
    dayKey: number
  ) => {
    if (clicks.length === 0) return;
    const steps: ClickSessionStep[] = clicks.map((click) => {
      const meta = objectMeta.get(click.objId);
      return {
        objId: click.objId,
        name: meta?.name ?? `#${click.objId}`,
        sceneId: meta?.sceneId ?? null,
        sceneName: meta?.sceneName ?? null,
        timestamp: click.time,
      };
    });
    const start = steps[0].timestamp;
    const end = steps[steps.length - 1].timestamp;
    const durationSeconds = Math.max(
      0,
      (end.getTime() - start.getTime()) / 1000
    );
    const sceneSet = new Set<number>();
    steps.forEach((step) => {
      if (step.sceneId !== null) {
        sceneSet.add(step.sceneId);
      }
    });
    const sceneIds = Array.from(sceneSet);
    const date =
      Number.isFinite(dayKey) && dayKey > 0 ? new Date(dayKey) : startOfDay(start);
    sequence += 1;
    sessions.push({
      id: `S${sequence}`,
      userId,
      date,
      start,
      end,
      durationSeconds,
      clickCount: steps.length,
      firstStep: steps[0] ?? null,
      lastStep: steps[steps.length - 1] ?? null,
      steps,
      sceneIds,
    });
  };

  grouped.forEach((clicks, key) => {
    const [userId, dayKeyRaw] = key.split("__");
    const dayKey = Number(dayKeyRaw);
    const sorted = [...clicks].sort(
      (a, b) => a.time.getTime() - b.time.getTime()
    );
    let current: ClickRecord[] = [];
    sorted.forEach((click) => {
      if (current.length === 0) {
        current.push(click);
        return;
      }
      const prev = current[current.length - 1];
      if (click.time.getTime() - prev.time.getTime() > gapMs) {
        finalizeSession(current, userId, dayKey);
        current = [click];
      } else {
        current.push(click);
      }
    });
    finalizeSession(current, userId, dayKey);
  });

  return sessions.sort((a, b) => b.start.getTime() - a.start.getTime());
}

function summarizeClickSessions(sessions: ClickSessionRecord[]): ClickSessionInsights {
  if (sessions.length === 0) {
    return {
      totalSessions: 0,
      avgDurationSeconds: 0,
      medianDurationSeconds: 0,
      topEntryObjects: [],
      topExitObjects: [],
      topTransitions: [],
      topPaths: [],
    };
  }

  const entryCounts = new Map<number, number>();
  const exitCounts = new Map<number, number>();
  const objectNames = new Map<number, string>();
  const transitionCounts = new Map<string, number>();
  const transitionNames = new Map<
    string,
    { fromId: number; toId: number; fromName: string; toName: string }
  >();
  const pathCounts = new Map<string, { labels: string[]; count: number }>();
  const durations: number[] = [];

  sessions.forEach((session) => {
    if (session.firstStep) {
      entryCounts.set(
        session.firstStep.objId,
        (entryCounts.get(session.firstStep.objId) ?? 0) + 1
      );
      objectNames.set(session.firstStep.objId, session.firstStep.name);
    }
    if (session.lastStep) {
      exitCounts.set(
        session.lastStep.objId,
        (exitCounts.get(session.lastStep.objId) ?? 0) + 1
      );
      objectNames.set(session.lastStep.objId, session.lastStep.name);
    }

    const steps = session.steps;
    for (let i = 0; i < steps.length - 1; i += 1) {
      const from = steps[i];
      const to = steps[i + 1];
      const key = `${from.objId}->${to.objId}`;
      transitionCounts.set(key, (transitionCounts.get(key) ?? 0) + 1);
      if (!transitionNames.has(key)) {
        transitionNames.set(key, {
          fromId: from.objId,
          toId: to.objId,
          fromName: from.name,
          toName: to.name,
        });
      }
    }

    const pathLabels = steps.map((step) => step.name).slice(0, 5);
    if (pathLabels.length > 0) {
      const key = pathLabels.join("→");
      const existing = pathCounts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        pathCounts.set(key, { labels: pathLabels, count: 1 });
      }
    }

    durations.push(session.durationSeconds);
  });

  const totalSessions = sessions.length;
  const totalDuration = durations.reduce((sum, value) => sum + value, 0);
  durations.sort((a, b) => a - b);
  const medianDurationSeconds =
    durations.length % 2 === 1
      ? durations[(durations.length - 1) / 2]
      : (durations[durations.length / 2 - 1] +
        durations[durations.length / 2]) /
      2;
  const avgDurationSeconds =
    totalSessions > 0 ? totalDuration / totalSessions : 0;

  const buildRanked = (source: Map<number, number>) =>
    Array.from(source.entries())
      .map(([objId, count]) => ({
        objId,
        count,
        name: objectNames.get(objId) ?? `#${objId}`,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

  const topTransitions = Array.from(transitionCounts.entries())
    .map(([key, count]) => ({ ...transitionNames.get(key)!, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const topPaths = Array.from(pathCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((item) => ({ path: item.labels, count: item.count }));

  return {
    totalSessions,
    avgDurationSeconds,
    medianDurationSeconds,
    topEntryObjects: buildRanked(entryCounts),
    topExitObjects: buildRanked(exitCounts),
    topTransitions,
    topPaths,
  };
}

export function computeHeatmapPoints(
  data: DashboardData,
  start?: Date,
  end?: Date
): HeatmapPoint[] {
  const { projectScans } = buildProjectScanIndex(data);
  return data.projects
    .map((project) => {
      const location = project.latLon;
      if (!location) return null;
      const scans = projectScans[project.projectId] ?? [];
      const filtered =
        start && end
          ? scans.filter((scan) => scan.time >= start && scan.time <= end)
          : scans;
      return {
        projectId: project.projectId,
        name: project.name,
        lat: location.lat,
        lon: location.lon,
        scans: filtered.length,
      };
    })
    .filter((item): item is HeatmapPoint => Boolean(item));
}

export function computeClickRanking(
  data: DashboardData,
  start: Date,
  end: Date,
  limit = 10
): ClickRankingRow[] {
  const arObjectById = data.arObjects.reduce<Record<number, typeof data.arObjects[number]>>((acc, obj) => {
    acc[obj.id] = obj;
    return acc;
  }, {});

  const counter = new Map<number, number>();
  for (const click of data.clicks) {
    if (click.time >= start && click.time <= end) {
      counter.set(click.objId, (counter.get(click.objId) ?? 0) + 1);
    }
  }

  const ranking = Array.from(counter.entries())
    .map(([objId, count]) => {
      const obj = arObjectById[objId];
      return {
        objId,
        count,
        name: obj?.name ?? String(objId),
        sceneName: obj?.sceneName ?? null,
      };
    })
    .sort((a, b) => b.count - a.count);

  return ranking.slice(0, limit);
}

export function computeUserAcquisitionSeries(
  data: DashboardData,
  windowDays = 30,
  referenceDate: Date = new Date()
): UserAcquisitionPoint[] {
  const end = endOfDay(referenceDate);
  const start = startOfDay(subDays(end, windowDays - 1));
  const days = eachDayOfInterval({ start, end });

  const newUserSets = new Map<number, Set<string>>();
  const returningUserSets = new Map<number, Set<string>>();
  const projectNewUsers = new Map<number, Map<number, Set<string>>>();
  const projectReturningUsers = new Map<number, Map<number, Set<string>>>();

  for (const day of days) {
    const ts = day.getTime();
    newUserSets.set(ts, new Set());
    returningUserSets.set(ts, new Set());
    projectNewUsers.set(ts, new Map());
    projectReturningUsers.set(ts, new Map());
  }

  const firstClickNormalized = new Map<string, number>();
  const firstDates: number[] = [];
  for (const [userId, firstDate] of Object.entries(data.firstClickByUser)) {
    const normalized = startOfDay(firstDate).getTime();
    firstClickNormalized.set(userId, normalized);
    firstDates.push(normalized);
  }
  firstDates.sort((a, b) => a - b);

  const objectProjectMap = buildObjectProjectIndex(data);

  for (const click of data.clicks) {
    if (!click.codeName) continue;
    if (click.time < start || click.time > end) continue;
    const dayTs = startOfDay(click.time).getTime();
    const firstTs =
      firstClickNormalized.get(click.codeName) ??
      startOfDay(click.time).getTime();

    const projectIds = objectProjectMap.get(click.objId) ?? [];

    if (dayTs === firstTs) {
      newUserSets.get(dayTs)?.add(click.codeName);
      const pMap = projectNewUsers.get(dayTs);
      if (pMap) {
        for (const pid of projectIds) {
          if (!pMap.has(pid)) pMap.set(pid, new Set());
          pMap.get(pid)!.add(click.codeName);
        }
      }
    } else if (dayTs > firstTs) {
      returningUserSets.get(dayTs)?.add(click.codeName);
      const pMap = projectReturningUsers.get(dayTs);
      if (pMap) {
        for (const pid of projectIds) {
          if (!pMap.has(pid)) pMap.set(pid, new Set());
          pMap.get(pid)!.add(click.codeName);
        }
      }
    }
  }

  const result: UserAcquisitionPoint[] = [];
  let cumulative = 0;
  let cursor = 0;

  for (const day of days) {
    const dayTs = day.getTime();
    while (cursor < firstDates.length && firstDates[cursor] <= dayTs) {
      cumulative += 1;
      cursor += 1;
    }

    const pNew = projectNewUsers.get(dayTs)!;
    const pRet = projectReturningUsers.get(dayTs)!;
    const allProjectIds = new Set([...pNew.keys(), ...pRet.keys()]);
    const projectBreakdown = Array.from(allProjectIds)
      .map((pid) => ({
        projectId: pid,
        projectName: data.projectById[pid]?.name ?? `Project ${pid}`,
        newUsers: pNew.get(pid)?.size ?? 0,
        returningUsers: pRet.get(pid)?.size ?? 0,
      }))
      .sort(
        (a, b) =>
          b.newUsers + b.returningUsers - (a.newUsers + a.returningUsers)
      );

    result.push({
      date: day,
      newUsers: newUserSets.get(dayTs)?.size ?? 0,
      returningUsers: returningUserSets.get(dayTs)?.size ?? 0,
      cumulativeUsers: cumulative,
      projectBreakdown,
    });
  }

  return result;
}

export function computeUserAcquisitionSeriesInRange(
  data: DashboardData,
  start: Date,
  end: Date
): UserAcquisitionPoint[] {
  const rangeStart = startOfDay(start);
  const rangeEnd = endOfDay(end);
  if (rangeStart > rangeEnd) return [];
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  if (days.length === 0) return [];

  const newUserSets = new Map<number, Set<string>>();
  const returningUserSets = new Map<number, Set<string>>();
  const projectNewUsers = new Map<number, Map<number, Set<string>>>();
  const projectReturningUsers = new Map<number, Map<number, Set<string>>>();

  for (const day of days) {
    const ts = day.getTime();
    newUserSets.set(ts, new Set());
    returningUserSets.set(ts, new Set());
    projectNewUsers.set(ts, new Map());
    projectReturningUsers.set(ts, new Map());
  }

  const firstClickNormalized = new Map<string, number>();
  const firstDates: number[] = [];
  for (const [userId, firstDate] of Object.entries(data.firstClickByUser)) {
    const normalized = startOfDay(firstDate).getTime();
    firstClickNormalized.set(userId, normalized);
    firstDates.push(normalized);
  }
  firstDates.sort((a, b) => a - b);

  const objectProjectMap = buildObjectProjectIndex(data);

  for (const click of data.clicks) {
    if (!click.codeName) continue;
    if (click.time < rangeStart || click.time > rangeEnd) continue;
    const dayTs = startOfDay(click.time).getTime();
    const firstTs = firstClickNormalized.get(click.codeName) ?? dayTs;
    const projectIds = objectProjectMap.get(click.objId) ?? [];

    if (dayTs === firstTs) {
      newUserSets.get(dayTs)?.add(click.codeName);
      const pMap = projectNewUsers.get(dayTs);
      if (pMap) {
        for (const pid of projectIds) {
          if (!pMap.has(pid)) pMap.set(pid, new Set());
          pMap.get(pid)!.add(click.codeName);
        }
      }
    } else if (dayTs > firstTs) {
      returningUserSets.get(dayTs)?.add(click.codeName);
      const pMap = projectReturningUsers.get(dayTs);
      if (pMap) {
        for (const pid of projectIds) {
          if (!pMap.has(pid)) pMap.set(pid, new Set());
          pMap.get(pid)!.add(click.codeName);
        }
      }
    }
  }

  const result: UserAcquisitionPoint[] = [];
  let cumulative = 0;

  for (const day of days) {
    const dayTs = day.getTime();
    const newUsersCount = newUserSets.get(dayTs)?.size ?? 0;
    cumulative += newUsersCount;

    const pNew = projectNewUsers.get(dayTs)!;
    const pRet = projectReturningUsers.get(dayTs)!;
    const allProjectIds = new Set([...pNew.keys(), ...pRet.keys()]);
    const projectBreakdown = Array.from(allProjectIds)
      .map((pid) => ({
        projectId: pid,
        projectName: data.projectById[pid]?.name ?? `Project ${pid}`,
        newUsers: pNew.get(pid)?.size ?? 0,
        returningUsers: pRet.get(pid)?.size ?? 0,
      }))
      .sort(
        (a, b) =>
          b.newUsers + b.returningUsers - (a.newUsers + a.returningUsers)
      );

    result.push({
      date: day,
      newUsers: newUserSets.get(dayTs)?.size ?? 0,
      returningUsers: returningUserSets.get(dayTs)?.size ?? 0,
      cumulativeUsers: cumulative,
      projectBreakdown,
    });
  }

  return result;
}

export function computeUserAcquisitionMonthly(
  data: DashboardData
): UserAcquisitionPoint[] {
  const firstClickEntries = Object.entries(data.firstClickByUser);
  if (firstClickEntries.length === 0 || data.clicks.length === 0) {
    return [];
  }

  let earliestMonth = startOfMonth(firstClickEntries[0][1]);
  for (const [, firstDate] of firstClickEntries) {
    const month = startOfMonth(firstDate);
    if (month < earliestMonth) {
      earliestMonth = month;
    }
  }

  let latestClick = data.clicks[0].time;
  for (const click of data.clicks) {
    if (click.time > latestClick) {
      latestClick = click.time;
    }
  }
  const latestMonth = startOfMonth(latestClick);

  const newUsersByMonth = new Map<number, Set<string>>();
  const returningUsersByMonth = new Map<number, Set<string>>();

  for (const [userId, firstDate] of firstClickEntries) {
    const monthTs = startOfMonth(firstDate).getTime();
    if (!newUsersByMonth.has(monthTs)) {
      newUsersByMonth.set(monthTs, new Set());
    }
    newUsersByMonth.get(monthTs)!.add(userId);
  }

  for (const click of data.clicks) {
    if (!click.codeName) continue;
    const clickMonth = startOfMonth(click.time);
    const firstDate = data.firstClickByUser[click.codeName];
    if (!firstDate) continue;
    const firstMonth = startOfMonth(firstDate);
    if (clickMonth <= firstMonth) continue;
    const monthTs = clickMonth.getTime();
    if (!returningUsersByMonth.has(monthTs)) {
      returningUsersByMonth.set(monthTs, new Set());
    }
    returningUsersByMonth.get(monthTs)!.add(click.codeName);
  }

  const result: UserAcquisitionPoint[] = [];
  let cursor = earliestMonth;
  let cumulative = 0;

  while (cursor <= latestMonth) {
    const monthTs = cursor.getTime();
    const newUsers = newUsersByMonth.get(monthTs)?.size ?? 0;
    const returningUsers = returningUsersByMonth.get(monthTs)?.size ?? 0;
    cumulative += newUsers;

    result.push({
      date: cursor,
      newUsers,
      returningUsers,
      cumulativeUsers: cumulative,
    });

    cursor = addMonths(cursor, 1);
  }

  return result;
}

export function computeProjectUserAcquisition(
  data: DashboardData,
  start: Date,
  end: Date
): ProjectUserAcquisitionRow[] {
  if (data.projects.length === 0 || data.clicks.length === 0) return [];

  const startAt = startOfDay(start);
  const endAt = endOfDay(end);
  if (startAt > endAt) return [];

  const sceneToProjects = buildSceneProjectIndex(data.projects);
  if (sceneToProjects.size === 0) return [];

  const projectIdSet = new Set(data.projects.map((project) => project.projectId));

  const arObjectById = new Map<number, (typeof data.arObjects)[number]>();
  const sceneNameById = new Map<number, string>();
  for (const obj of data.arObjects) {
    arObjectById.set(obj.id, obj);
    if (obj.sceneId !== null && obj.sceneName && !sceneNameById.has(obj.sceneId)) {
      sceneNameById.set(obj.sceneId, obj.sceneName);
    }
  }

  const activeUsersByProject = new Map<number, Set<string>>();
  const newUsersByProject = new Map<number, number>();
  const newUsersByScene = new Map<number, Map<number, number>>();
  for (const project of data.projects) {
    activeUsersByProject.set(project.projectId, new Set());
    newUsersByScene.set(project.projectId, new Map());
  }

  const sortedClicks = [...data.clicks]
    .filter((click) => Boolean(click.codeName))
    .sort((a, b) => a.time.getTime() - b.time.getTime());

  const firstClickInfo = new Map<
    string,
    { time: Date; projectId: number | null; sceneId: number | null }
  >();

  for (const click of sortedClicks) {
    const userId = click.codeName!.trim();
    if (!userId) continue;
    const obj = arObjectById.get(click.objId);
    const sceneId = obj?.sceneId ?? null;
    const sceneProjects = sceneId !== null ? sceneToProjects.get(sceneId) : undefined;
    let primaryProject: number | null = null;
    if (sceneProjects) {
      for (const candidate of sceneProjects) {
        if (!projectIdSet.has(candidate)) continue;
        if (!isWithinProjectRange(data.projectById?.[candidate], click.time)) {
          continue;
        }
        primaryProject = candidate;
        break;
      }
    }

    const existing = firstClickInfo.get(userId);
    if (!existing || click.time < existing.time) {
      firstClickInfo.set(userId, {
        time: click.time,
        projectId: primaryProject,
        sceneId,
      });
    }

    if (click.time < startAt || click.time > endAt) continue;
    if (!sceneProjects) continue;
    for (const projectId of sceneProjects) {
      if (!projectIdSet.has(projectId)) continue;
      if (!isWithinProjectRange(data.projectById?.[projectId], click.time)) {
        continue;
      }
      activeUsersByProject.get(projectId)?.add(userId);
    }
  }

  for (const [, info] of firstClickInfo) {
    const { time, projectId, sceneId } = info;
    if (projectId === null) continue;
    if (!projectIdSet.has(projectId)) continue;
    if (time < startAt || time > endAt) continue;
    newUsersByProject.set(
      projectId,
      (newUsersByProject.get(projectId) ?? 0) + 1
    );
    if (sceneId !== null) {
      const sceneCounter = newUsersByScene.get(projectId);
      if (sceneCounter) {
        sceneCounter.set(sceneId, (sceneCounter.get(sceneId) ?? 0) + 1);
      }
    }
  }

  const rows: ProjectUserAcquisitionRow[] = [];

  for (const project of data.projects) {
    const activeUsers = activeUsersByProject.get(project.projectId)?.size ?? 0;
    const newUsers = newUsersByProject.get(project.projectId) ?? 0;
    if (activeUsers === 0 && newUsers === 0) continue;

    const sceneCounter = newUsersByScene.get(project.projectId) ?? new Map();
    let topSceneId: number | null = null;
    let topSceneCount = 0;
    for (const [sceneId, count] of sceneCounter.entries()) {
      if (count > topSceneCount) {
        topSceneId = sceneId;
        topSceneCount = count;
      }
    }

    rows.push({
      projectId: project.projectId,
      name: project.name,
      newUsers,
      activeUsers,
      topSceneName:
        topSceneId !== null
          ? sceneNameById.get(topSceneId) ?? `Scene ${topSceneId}`
          : null,
      topSceneNewUsers: topSceneCount,
    });
  }

  rows.sort((a, b) => {
    if (b.newUsers !== a.newUsers) return b.newUsers - a.newUsers;
    return b.activeUsers - a.activeUsers;
  });

  return rows;
}

export function computeSceneUserStats(
  data: DashboardData,
  start: Date,
  end: Date
): SceneUserStatRow[] {
  if (data.projects.length === 0 || data.clicks.length === 0) return [];

  const startAt = startOfDay(start);
  const endAt = endOfDay(end);
  if (startAt > endAt) return [];

  const arObjectById = new Map<number, (typeof data.arObjects)[number]>();
  for (const obj of data.arObjects) {
    arObjectById.set(obj.id, obj);
  }

  if (arObjectById.size === 0) return [];

  const sceneInfo = buildSceneInfo(data.projects, data.arObjects);

  const sceneActiveUsers = new Map<number, Set<string>>();
  const sceneNewUsers = new Map<number, Set<string>>();

  const sortedClicks = [...data.clicks]
    .filter((click) => Boolean(click.codeName))
    .sort((a, b) => a.time.getTime() - b.time.getTime());

  const firstClickByUser = new Map<
    string,
    { time: Date; sceneId: number | null }
  >();

  for (const click of sortedClicks) {
    const userId = click.codeName!.trim();
    if (!userId) continue;
    const obj = arObjectById.get(click.objId);
    const sceneId = obj?.sceneId ?? null;
    if (sceneId === null) continue;

    const existing = firstClickByUser.get(userId);
    if (!existing || click.time < existing.time) {
      firstClickByUser.set(userId, { time: click.time, sceneId });
    }

    if (click.time < startAt || click.time > endAt) continue;
    if (!sceneActiveUsers.has(sceneId)) sceneActiveUsers.set(sceneId, new Set());
    sceneActiveUsers.get(sceneId)!.add(userId);
  }

  for (const [userId, info] of firstClickByUser.entries()) {
    const { time, sceneId } = info;
    if (sceneId === null) continue;
    if (time < startAt || time > endAt) continue;
    if (!sceneNewUsers.has(sceneId)) sceneNewUsers.set(sceneId, new Set());
    sceneNewUsers.get(sceneId)!.add(userId);
  }

  const rows: SceneUserStatRow[] = [];

  const sceneIds = new Set([
    ...sceneActiveUsers.keys(),
    ...sceneNewUsers.keys(),
  ]);

  for (const sceneId of sceneIds) {
    const activeUsers = sceneActiveUsers.get(sceneId)?.size ?? 0;
    const newUsers = sceneNewUsers.get(sceneId)?.size ?? 0;
    if (activeUsers === 0 && newUsers === 0) continue;

    const info = sceneInfo.get(sceneId);
    const sceneName =
      info?.name ?? `Scene ${sceneId.toLocaleString(undefined)}`;
    const projectNames = info
      ? Array.from(info.projectNames).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      )
      : [];

    rows.push({
      sceneId,
      sceneName,
      newUsers,
      activeUsers,
      projectNames,
    });
  }

  rows.sort((a, b) => {
    if (b.newUsers !== a.newUsers) return b.newUsers - a.newUsers;
    return b.activeUsers - a.activeUsers;
  });

  return rows;
}

export function computeObjectMarketingMetrics(
  data: DashboardData,
  sessions: ClickSessionRecord[],
  referenceDate: Date = new Date()
): ObjectMarketingMetric[] {
  if (data.clicks.length === 0) return [];
  const end = endOfDay(referenceDate);
  const start30 = startOfDay(subDays(end, 29));
  const start12 = startOfDay(subMonths(end, 11));
  const objectMeta = buildObjectMetaMap(data);
  const projectScanSummaries = buildProjectScanSummaries(data, referenceDate);
  const counters = new Map<
    number,
    { total: number; last30: number; last12: number }
  >();

  data.clicks.forEach((click) => {
    const counter =
      counters.get(click.objId) ?? { total: 0, last30: 0, last12: 0 };
    counter.total += 1;
    if (click.time >= start30 && click.time <= end) {
      counter.last30 += 1;
    }
    if (click.time >= start12 && click.time <= end) {
      counter.last12 += 1;
    }
    counters.set(click.objId, counter);
  });

  const dwellStats = new Map<number, { totalSeconds: number; count: number }>();
  sessions.forEach((session) => {
    for (let i = 0; i < session.steps.length - 1; i += 1) {
      const current = session.steps[i];
      const next = session.steps[i + 1];
      if (current.objId !== next.objId) continue;
      const diffSeconds = Math.max(
        0,
        (next.timestamp.getTime() - current.timestamp.getTime()) / 1000
      );
      if (!dwellStats.has(current.objId)) {
        dwellStats.set(current.objId, { totalSeconds: 0, count: 0 });
      }
      const stat = dwellStats.get(current.objId)!;
      stat.totalSeconds += diffSeconds;
      stat.count += 1;
    }
  });

  const rows: ObjectMarketingMetric[] = [];
  objectMeta.forEach((meta, objId) => {
    const counts = counters.get(objId);
    if (!counts || counts.total === 0) return;
    const coverage = meta.projectIds.reduce(
      (acc, projectId) => {
        const summary = projectScanSummaries.get(projectId);
        if (!summary) return acc;
        return {
          total: acc.total + summary.total,
          last30: acc.last30 + summary.last30,
          last12: acc.last12 + summary.last12m,
        };
      },
      { total: 0, last30: 0, last12: 0 }
    );
    const dwell = dwellStats.get(objId);
    const projectNames = meta.projectIds
      .map((id) => data.projectById[id]?.name)
      .filter((name): name is string => Boolean(name));
    rows.push({
      objId,
      name: meta.name,
      sceneName: meta.sceneName,
      projectNames,
      totalClicks: counts.total,
      clicks30d: counts.last30,
      clicks12m: counts.last12,
      ctrTotal: coverage.total > 0 ? counts.total / coverage.total : null,
      ctr30d: coverage.last30 > 0 ? counts.last30 / coverage.last30 : null,
      ctr12m: coverage.last12 > 0 ? counts.last12 / coverage.last12 : null,
      avgDwellSeconds:
        dwell && dwell.count > 0 ? dwell.totalSeconds / dwell.count : null,
    });
  });

  rows.sort((a, b) => {
    if (b.clicks30d !== a.clicks30d) return b.clicks30d - a.clicks30d;
    return b.totalClicks - a.totalClicks;
  });

  return rows;
}

export function computeSceneMarketingStats(
  data: DashboardData,
  sessions: ClickSessionRecord[]
): SceneMarketingStat[] {
  if (data.clicks.length === 0) return [];
  const objectMeta = buildObjectMetaMap(data);
  const sceneInfo = buildSceneInfo(data.projects, data.arObjects);
  const sceneStats = new Map<
    number,
    { total: number; users: Set<string>; objectCounts: Map<number, number> }
  >();

  data.clicks.forEach((click) => {
    const meta = objectMeta.get(click.objId);
    if (!meta || meta.sceneId === null) return;
    if (!sceneStats.has(meta.sceneId)) {
      sceneStats.set(meta.sceneId, {
        total: 0,
        users: new Set<string>(),
        objectCounts: new Map<number, number>(),
      });
    }
    const stat = sceneStats.get(meta.sceneId)!;
    stat.total += 1;
    if (click.codeName) {
      stat.users.add(click.codeName.trim());
    }
    stat.objectCounts.set(
      click.objId,
      (stat.objectCounts.get(click.objId) ?? 0) + 1
    );
  });

  const sceneSessionSets = new Map<number, Set<string>>();
  sessions.forEach((session) => {
    session.sceneIds.forEach((sceneId) => {
      if (!sceneSessionSets.has(sceneId)) {
        sceneSessionSets.set(sceneId, new Set());
      }
      sceneSessionSets.get(sceneId)!.add(session.id);
    });
  });

  const rows: SceneMarketingStat[] = [];
  sceneStats.forEach((stat, sceneId) => {
    const info = sceneInfo.get(sceneId);
    const projectNames = info
      ? Array.from(info.projectNames).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      )
      : [];
    const total = stat.total;
    const objectShares: SceneObjectShare[] =
      total === 0
        ? []
        : Array.from(stat.objectCounts.entries())
          .map(([objId, clicks]) => ({
            objId,
            name: objectMeta.get(objId)?.name ?? `Object ${objId}`,
            clicks,
            share: clicks / total,
          }))
          .sort((a, b) => b.clicks - a.clicks)
          .slice(0, 5);
    const sessionCount = sceneSessionSets.get(sceneId)?.size ?? 0;
    const uniqueUsers = stat.users.size;
    rows.push({
      sceneId,
      sceneName: info?.name ?? `Scene ${sceneId}`,
      projectNames,
      totalClicks: total,
      uniqueUsers,
      sessionCount,
      avgSessionsPerUser:
        uniqueUsers > 0 ? sessionCount / uniqueUsers : 0,
      objectShares,
    });
  });

  rows.sort((a, b) => b.totalClicks - a.totalClicks);
  return rows;
}

export function computeUserBehaviorStats(
  data: DashboardData,
  sessions: ClickSessionRecord[],
  windowDays = 30
): UserBehaviorStats | null {
  if (sessions.length === 0) return null;
  const end = endOfDay(new Date());
  const start = startOfDay(subDays(end, Math.max(1, windowDays) - 1));

  const sessionsInWindow = sessions.filter(
    (session) => session.start >= start && session.start <= end
  );
  if (sessionsInWindow.length === 0) return null;

  const sessionsByUser = new Map<string, number>();
  sessionsInWindow.forEach((session) => {
    sessionsByUser.set(
      session.userId,
      (sessionsByUser.get(session.userId) ?? 0) + 1
    );
  });

  let newUsers = 0;
  let returningUsers = 0;
  sessionsByUser.forEach((_, userId) => {
    const first = data.firstClickByUser[userId];
    if (first && first >= start && first <= end) {
      newUsers += 1;
    } else {
      returningUsers += 1;
    }
  });

  const freqBuckets = { heavy: 0, medium: 0, light: 0 };
  sessionsByUser.forEach((count) => {
    if (count >= 10) {
      freqBuckets.heavy += 1;
    } else if (count >= 4) {
      freqBuckets.medium += 1;
    } else {
      freqBuckets.light += 1;
    }
  });

  const sessionsByUserAll = new Map<string, ClickSessionRecord[]>();
  sessions.forEach((session) => {
    if (!sessionsByUserAll.has(session.userId)) {
      sessionsByUserAll.set(session.userId, []);
    }
    sessionsByUserAll.get(session.userId)!.push(session);
  });

  const revisitDiffs: number[] = [];
  sessionsByUserAll.forEach((list) => {
    if (list.length < 2) return;
    list.sort((a, b) => a.start.getTime() - b.start.getTime());
    for (let i = 1; i < list.length; i += 1) {
      const diffDays =
        (list[i].start.getTime() - list[i - 1].start.getTime()) /
        (1000 * 60 * 60 * 24);
      if (diffDays > 0) {
        revisitDiffs.push(diffDays);
      }
    }
  });

  const totalSessions = sessionsInWindow.length;
  const totalUsers = sessionsByUser.size;

  return {
    windowDays: Math.max(1, windowDays),
    totalSessions,
    totalUsers,
    newUsers,
    returningUsers,
    avgSessionsPerUser:
      totalUsers > 0 ? totalSessions / totalUsers : 0,
    avgRevisitDays:
      revisitDiffs.length > 0
        ? revisitDiffs.reduce((sum, value) => sum + value, 0) /
        revisitDiffs.length
        : null,
    frequencyBuckets: freqBuckets,
  };
}

export function computeProjectFunnelRows(
  data: DashboardData,
  start: Date,
  end: Date
): ProjectFunnelRow[] {
  if (data.projects.length === 0) return [];
  const startAt = startOfDay(start);
  const endAt = endOfDay(end);
  if (startAt > endAt) return [];

  const { projectScans } = buildProjectScanIndex(data);
  const objectProjectMap = buildObjectProjectIndex(data);

  const scanCounts = new Map<number, number>();
  Object.entries(projectScans).forEach(([projectIdRaw, scans]) => {
    const projectId = Number(projectIdRaw);
    const count = scans.filter(
      (scan) => scan.time >= startAt && scan.time <= endAt
    ).length;
    scanCounts.set(projectId, count);
  });

  const clickStats = new Map<number, { clicks: number; users: Set<string> }>();
  data.clicks.forEach((click) => {
    if (click.time < startAt || click.time > endAt) return;
    const owners = objectProjectMap.get(click.objId);
    if (!owners || owners.length === 0) return;
    owners.forEach((projectId) => {
      if (!clickStats.has(projectId)) {
        clickStats.set(projectId, { clicks: 0, users: new Set<string>() });
      }
      const entry = clickStats.get(projectId)!;
      entry.clicks += 1;
      if (click.codeName) {
        entry.users.add(click.codeName.trim());
      }
    });
  });

  const sortedClicks = [...data.clicks]
    .filter((click) => Boolean(click.codeName))
    .sort((a, b) => a.time.getTime() - b.time.getTime());
  const newUsersByProject = new Map<number, number>();
  const seenPerProject = new Map<number, Set<string>>();

  sortedClicks.forEach((click) => {
    const owners = objectProjectMap.get(click.objId);
    if (!owners || owners.length === 0) return;
    const userId = click.codeName!.trim();
    if (!userId) return;
    owners.forEach((projectId) => {
      if (!seenPerProject.has(projectId)) {
        seenPerProject.set(projectId, new Set<string>());
      }
      const seen = seenPerProject.get(projectId)!;
      if (seen.has(userId)) return;
      seen.add(userId);
      if (click.time >= startAt && click.time <= endAt) {
        newUsersByProject.set(
          projectId,
          (newUsersByProject.get(projectId) ?? 0) + 1
        );
      }
    });
  });

  const rows: ProjectFunnelRow[] = data.projects
    .map((project) => {
      const scans = scanCounts.get(project.projectId) ?? 0;
      const clickInfo = clickStats.get(project.projectId);
      const clicks = clickInfo?.clicks ?? 0;
      const activeUsers = clickInfo?.users.size ?? 0;
      const newUsers = newUsersByProject.get(project.projectId) ?? 0;
      if (scans === 0 && clicks === 0 && newUsers === 0 && activeUsers === 0) {
        return null;
      }
      return {
        projectId: project.projectId,
        projectName: project.name,
        scans,
        clicks,
        newUsers,
        activeUsers,
        clickThroughRate: scans > 0 ? clicks / scans : null,
        activationRate: newUsers > 0 ? activeUsers / newUsers : null,
      };
    })
    .filter((row): row is ProjectFunnelRow => Boolean(row));

  rows.sort((a, b) => {
    if (b.clicks !== a.clicks) return b.clicks - a.clicks;
    return b.scans - a.scans;
  });

  return rows;
}

export function computeClickDaypartStats(
  data: DashboardData,
  windowDays = 30
): ClickDaypartStats | null {
  if (data.clicks.length === 0) return null;
  const end = endOfDay(new Date());
  const start = startOfDay(subDays(end, Math.max(1, windowDays) - 1));
  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    clicks: 0,
  }));
  const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const matrix = Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => 0)
  );
  let totalClicks = 0;

  const toWeekdayIndex = (date: Date) => {
    const jsDay = date.getDay(); // 0 (Sun) - 6 (Sat)
    return jsDay === 0 ? 6 : jsDay - 1; // Monday first
  };

  data.clicks.forEach((click) => {
    if (click.time < start || click.time > end) return;
    const hour = click.time.getHours();
    const weekdayIndex = toWeekdayIndex(click.time);
    hourly[hour].clicks += 1;
    matrix[weekdayIndex][hour] += 1;
    totalClicks += 1;
  });

  if (totalClicks === 0) return null;

  return {
    windowDays: Math.max(1, windowDays),
    hourly,
    weekdayHourMatrix: matrix,
    weekdayLabels,
    totalClicks,
  };
}

export function computeProjectObjectAttribution(
  data: DashboardData,
  windowDays = 30,
  limit = 10
): ProjectObjectAttributionRow[] {
  if (data.clicks.length === 0) return [];
  const end = endOfDay(new Date());
  const start = startOfDay(subDays(end, Math.max(1, windowDays) - 1));
  const objectProjectMap = buildObjectProjectIndex(data);
  const objectMeta = buildObjectMetaMap(data);
  const projectTotals = new Map<number, number>();
  const projectObjectCounts = new Map<number, Map<number, number>>();

  data.clicks.forEach((click) => {
    if (click.time < start || click.time > end) return;
    const owners = objectProjectMap.get(click.objId);
    if (!owners || owners.length === 0) return;
    owners.forEach((projectId) => {
      projectTotals.set(
        projectId,
        (projectTotals.get(projectId) ?? 0) + 1
      );
      if (!projectObjectCounts.has(projectId)) {
        projectObjectCounts.set(projectId, new Map<number, number>());
      }
      const objCounter = projectObjectCounts.get(projectId)!;
      objCounter.set(
        click.objId,
        (objCounter.get(click.objId) ?? 0) + 1
      );
    });
  });

  const rows: ProjectObjectAttributionRow[] = [];
  projectObjectCounts.forEach((objectCounts, projectId) => {
    const total = projectTotals.get(projectId) ?? 0;
    const project = data.projectById[projectId];
    if (!project || total === 0) return;
    objectCounts.forEach((clicks, objId) => {
      const meta = objectMeta.get(objId);
      rows.push({
        projectId,
        projectName: project.name,
        objId,
        objName: meta?.name ?? `Object ${objId}`,
        sceneName: meta?.sceneName ?? null,
        clicks,
        shareWithinProject: clicks / total,
      });
    });
  });

  rows.sort((a, b) => b.clicks - a.clicks);
  return rows.slice(0, limit);
}

export function buildProjectScanIndex(data: DashboardData): {
  projectScans: Record<number, ScanRecord[]>;
  orphanScans: ScanRecord[];
} {
  const projectScans: Record<number, ScanRecord[]> = {};
  const orphanScans: ScanRecord[] = [];

  for (const project of data.projects) {
    projectScans[project.projectId] = [];
  }

  for (const scan of data.scans) {
    const projectIds = data.lightToProjectIds[scan.ligId];
    if (!projectIds || projectIds.length === 0) {
      orphanScans.push(scan);
      continue;
    }

    let matched = false;
    for (const projectId of projectIds) {
      const project = data.projectById?.[projectId];
      if (!project) continue;
      if (!isWithinProjectRange(project, scan.time)) continue;
      if (!projectScans[projectId]) {
        projectScans[projectId] = [];
      }
      projectScans[projectId].push(scan);
      matched = true;
    }

    if (!matched) {
      orphanScans.push(scan);
    }
  }

  return { projectScans, orphanScans };
}

export function buildProjectClickIndex(data: DashboardData): {
  projectClicks: Record<number, ClickRecord[]>;
  orphanClicks: ClickRecord[];
} {
  const projectClicks: Record<number, ClickRecord[]> = {};
  const orphanClicks: ClickRecord[] = [];
  const objectProjectMap = buildObjectProjectIndex(data);

  for (const project of data.projects) {
    projectClicks[project.projectId] = [];
  }

  for (const click of data.clicks) {
    const projectIds = objectProjectMap.get(click.objId);
    if (!projectIds || projectIds.length === 0) {
      orphanClicks.push(click);
      continue;
    }

    let matched = false;
    for (const projectId of projectIds) {
      const project = data.projectById?.[projectId];
      if (!project) continue;
      if (!isWithinProjectRange(project, click.time)) continue;
      if (!projectClicks[projectId]) {
        projectClicks[projectId] = [];
      }
      projectClicks[projectId].push(click);
      matched = true;
    }

    if (!matched) {
      orphanClicks.push(click);
    }
  }

  return { projectClicks, orphanClicks };
}

function buildObjectProjectIndex(data: DashboardData): Map<number, number[]> {
  const map = new Map<number, number[]>();
  const sceneIndex = buildSceneProjectIndex(data.projects);
  data.arObjects.forEach((obj) => {
    if (obj.sceneId === null) return;
    const owners = sceneIndex.get(obj.sceneId);
    if (!owners || owners.length === 0) return;
    map.set(obj.id, owners);
  });
  return map;
}

function buildObjectMetaMap(
  data: DashboardData
): Map<
  number,
  { name: string; sceneId: number | null; sceneName: string | null; projectIds: number[] }
> {
  const map = new Map<
    number,
    { name: string; sceneId: number | null; sceneName: string | null; projectIds: number[] }
  >();
  const projectIndex = buildObjectProjectIndex(data);
  data.arObjects.forEach((obj) => {
    map.set(obj.id, {
      name: obj.name || `Object ${obj.id}`,
      sceneId: obj.sceneId ?? null,
      sceneName: obj.sceneName ?? null,
      projectIds: projectIndex.get(obj.id) ?? [],
    });
  });
  return map;
}

function buildProjectScanSummaries(
  data: DashboardData,
  referenceDate: Date
): Map<number, { total: number; last30: number; last12m: number }> {
  const { projectScans } = buildProjectScanIndex(data);
  const summaries = new Map<number, { total: number; last30: number; last12m: number }>();
  const end = endOfDay(referenceDate);
  const start30 = startOfDay(subDays(end, 29));
  const start12 = startOfDay(subMonths(end, 11));

  Object.entries(projectScans).forEach(([projectIdRaw, scans]) => {
    const projectId = Number(projectIdRaw);
    let last30 = 0;
    let last12m = 0;
    scans.forEach((scan) => {
      if (scan.time >= start30 && scan.time <= end) {
        last30 += 1;
      }
      if (scan.time >= start12 && scan.time <= end) {
        last12m += 1;
      }
    });
    summaries.set(projectId, {
      total: scans.length,
      last30,
      last12m,
    });
  });

  return summaries;
}

function buildSceneProjectIndex(projects: Project[]): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const project of projects) {
    for (const sceneRaw of project.scenes) {
      const sceneId = extractSceneId(sceneRaw);
      if (sceneId === null) continue;
      if (!map.has(sceneId)) {
        map.set(sceneId, []);
      }
      const list = map.get(sceneId)!;
      if (!list.includes(project.projectId)) {
        list.push(project.projectId);
      }
    }
  }
  return map;
}

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

function buildSceneInfo(
  projects: Project[],
  arObjects: DashboardData["arObjects"]
): Map<number, { name: string | null; projectNames: Set<string> }> {
  const map = new Map<number, { name: string | null; projectNames: Set<string> }>();

  for (const project of projects) {
    for (const sceneRaw of project.scenes) {
      const sceneId = extractSceneId(sceneRaw);
      if (sceneId === null) continue;
      if (!map.has(sceneId)) {
        map.set(sceneId, { name: extractSceneName(sceneRaw), projectNames: new Set() });
      }
      map.get(sceneId)!.projectNames.add(project.name);
    }
  }

  for (const obj of arObjects) {
    if (obj.sceneId === null) continue;
    if (!map.has(obj.sceneId)) {
      map.set(obj.sceneId, { name: obj.sceneName ?? null, projectNames: new Set() });
    } else if (obj.sceneName) {
      const info = map.get(obj.sceneId)!;
      if (!info.name) info.name = obj.sceneName;
    }
  }

  return map;
}

function countScans(scans: ScanRecord[], start: Date, end: Date): number {
  let count = 0;
  for (const scan of scans) {
    if (scan.time >= start && scan.time <= end) {
      count += 1;
    }
  }
  return count;
}

function createBoundaries(referenceDate: Date) {
  const todayStart = startOfDay(referenceDate);
  const todayEnd = endOfDay(referenceDate);
  const yesterdayStart = startOfDay(subDays(referenceDate, 1));
  const yesterdayEnd = endOfDay(subDays(referenceDate, 1));

  const thisWeekStart = startOfWeek(referenceDate, { weekStartsOn: 1 });
  const thisWeekEnd = endOfWeek(referenceDate, { weekStartsOn: 1 });
  const lastWeekStart = startOfWeek(subDays(thisWeekStart, 1), { weekStartsOn: 1 });
  const lastWeekEnd = endOfWeek(subDays(thisWeekStart, 1), { weekStartsOn: 1 });

  const thisMonthStart = startOfMonth(referenceDate);
  const thisMonthEnd = endOfMonth(referenceDate);
  const lastMonthRef = subMonths(referenceDate, 1);
  const lastMonthStart = startOfMonth(lastMonthRef);
  const lastMonthEnd = endOfMonth(lastMonthRef);

  return {
    today: { start: todayStart, end: todayEnd },
    yesterday: { start: yesterdayStart, end: yesterdayEnd },
    thisWeek: { start: thisWeekStart, end: thisWeekEnd },
    lastWeek: { start: lastWeekStart, end: lastWeekEnd },
    thisMonth: { start: thisMonthStart, end: thisMonthEnd },
    lastMonth: { start: lastMonthStart, end: lastMonthEnd },
  };
}
export interface SceneComparisonRow {
  sceneId: number;
  sceneName: string;
  scans: number;
  clicks: number;
  interactionRate: number;
  newUsers: number;
  returningUsers: number;
  activeUsers: number;
}

export function computeSceneComparisonStats(
  data: DashboardData,
  startDate: Date,
  endDate: Date
): SceneComparisonRow[] {
  const start = startOfDay(startDate);
  const end = endOfDay(endDate);

  // 0. Identify valid scenes from projects
  const validSceneIds = new Set<number>();
  for (const p of data.projects) {
    for (const s of p.scenes) {
      const match = s.match(/^(\d+)/);
      if (match) validSceneIds.add(Number(match[1]));
    }
  }

  // Map CoordinateSystemId -> Scene Info
  const csMap = new Map<number, { sceneId: number; sceneName: string }>();
  for (const cs of data.coordinateSystems) {
    if (cs.sceneId !== null && validSceneIds.has(cs.sceneId)) {
      csMap.set(cs.id, { sceneId: cs.sceneId, sceneName: cs.sceneName || `Scene ${cs.sceneId}` });
    }
  }

  // Map ArObjectId -> Scene Info
  const objMap = new Map<number, { sceneId: number; sceneName: string }>();
  for (const obj of data.arObjects) {
    if (obj.sceneId !== null && validSceneIds.has(obj.sceneId)) {
      objMap.set(obj.id, { sceneId: obj.sceneId, sceneName: obj.sceneName || `Scene ${obj.sceneId}` });
    }
  }

  // 1. Identify all users and their first seen date/scene (Project Level) based on CLICKS
  const userFirstSeen = new Map<string, { time: Date; sceneId: number | null }>();

  // Sort clicks to ensure we find the true first click
  const sortedClicks = [...data.clicks]
    .filter((c) => Boolean(c.codeName))
    .sort((a, b) => a.time.getTime() - b.time.getTime());

  for (const click of sortedClicks) {
    const userId = click.codeName!.trim();
    if (!userId) continue;

    const sceneInfo = objMap.get(click.objId);
    const sceneId = sceneInfo?.sceneId ?? null;

    if (!userFirstSeen.has(userId)) {
      userFirstSeen.set(userId, { time: click.time, sceneId });
    }
  }

  // 2. Filter scans in range
  const rangeScans = data.scans.filter(
    (s) => s.time >= start && s.time <= end
  );

  // 3. Filter clicks in range
  const rangeClicks = data.clicks.filter(
    (c) => c.time >= start && c.time <= end
  );

  // 4. Group by Scene
  const sceneStats = new Map<
    number,
    {
      sceneName: string;
      scans: number;
      clicks: number;
      activeUsersSet: Set<string>;
      newUsersSet: Set<string>;
    }
  >();

  // Unattributed Stats
  const unattributedStat = {
    sceneName: "Unattributed",
    scans: 0,
    clicks: 0,
    activeUsersSet: new Set<string>(),
    newUsersSet: new Set<string>(),
  };

  // Helper to get or create scene stat
  const getSceneStat = (sceneId: number, sceneName: string) => {
    let stat = sceneStats.get(sceneId);
    if (!stat) {
      stat = {
        sceneName,
        scans: 0,
        clicks: 0,
        activeUsersSet: new Set(),
        newUsersSet: new Set(),
      };
      sceneStats.set(sceneId, stat);
    }
    return stat;
  };

  // Process Scans
  for (const scan of rangeScans) {
    let stat = unattributedStat;
    if (scan.coordinateSystemId !== null) {
      const sceneInfo = csMap.get(scan.coordinateSystemId);
      if (sceneInfo) {
        stat = getSceneStat(sceneInfo.sceneId, sceneInfo.sceneName);
      }
    }
    stat.scans++;
  }

  // Process Clicks
  for (const click of rangeClicks) {
    let stat = unattributedStat;
    const sceneInfo = objMap.get(click.objId);
    if (sceneInfo) {
      stat = getSceneStat(sceneInfo.sceneId, sceneInfo.sceneName);
    }
    stat.clicks++;

    const userId = click.codeName?.trim();
    if (userId) {
      stat.activeUsersSet.add(userId);

      const firstSeen = userFirstSeen.get(userId);
      // If user first seen in this range AND (attributed to this scene OR (unattributed and first seen was unattributed))
      if (firstSeen && firstSeen.time >= start && firstSeen.time <= end) {
        if (sceneInfo) {
          // For attributed scene: check if first seen was in this scene
          if (firstSeen.sceneId === sceneInfo.sceneId) {
            stat.newUsersSet.add(userId);
          }
        } else {
          // For unattributed: check if first seen was also unattributed
          if (firstSeen.sceneId === null) {
            stat.newUsersSet.add(userId);
          }
        }
      }
    }
  }

  const rows: SceneComparisonRow[] = [];

  for (const [sceneId, stat] of sceneStats.entries()) {
    const newUsers = stat.newUsersSet.size;
    const activeUsers = stat.activeUsersSet.size;
    // This seems fair for a per-scene breakdown.
    const returningUsers = Math.max(0, activeUsers - newUsers);

    rows.push({
      sceneId,
      sceneName: stat.sceneName,
      scans: stat.scans,
      clicks: stat.clicks,
      interactionRate: stat.scans > 0 ? stat.clicks / stat.scans : 0,
      newUsers: newUsers,
      returningUsers: returningUsers,
      activeUsers: activeUsers,
    });
  }

  // Add Unattributed row if it has data
  if (
    unattributedStat.scans > 0 ||
    unattributedStat.clicks > 0 ||
    unattributedStat.activeUsersSet.size > 0
  ) {
    const newUsers = unattributedStat.newUsersSet.size;
    const activeUsers = unattributedStat.activeUsersSet.size;
    const returningUsers = activeUsers - newUsers;

    rows.push({
      sceneId: -1, // Special ID for Unattributed
      sceneName: "Unattributed",
      scans: unattributedStat.scans,
      clicks: unattributedStat.clicks,
      interactionRate:
        unattributedStat.scans > 0
          ? unattributedStat.clicks / unattributedStat.scans
          : 0,
      newUsers,
      returningUsers: Math.max(0, returningUsers),
      activeUsers,
    });
  }

  return rows.sort((a, b) => b.scans - a.scans);
}

export interface LightPerformanceRow {
  lightId: number;
  coordinateSystemNames: string[];
  sceneNames: string[];
  scans: number;
  clicks: number;
  newUsers: number;
  returningUsers: number;
}

export function computeLightPerformanceStats(
  data: DashboardData,
  startDate: Date,
  endDate: Date
): LightPerformanceRow[] {
  const start = startOfDay(startDate);
  const end = endOfDay(endDate);

  // 1. Identify valid scenes from projects (to filter relevant data)
  const validSceneIds = new Set<number>();
  for (const p of data.projects) {
    for (const s of p.scenes) {
      const match = s.match(/^(\d+)/);
      if (match) validSceneIds.add(Number(match[1]));
    }
  }

  // Map CoordinateSystemId -> Info
  const csMap = new Map<number, { name: string; sceneId: number | null; sceneName: string | null }>();
  for (const cs of data.coordinateSystems) {
    csMap.set(cs.id, {
      name: cs.name,
      sceneId: cs.sceneId,
      sceneName: cs.sceneName,
    });
  }

  // 2. Identify all users and their first seen date (Project Level)
  // We need this to determine if a user is "New" to the project at a specific LightID
  const userFirstSeenProject = new Map<string, Date>();
  const sortedAllScans = [...data.scans].sort((a, b) => a.time.getTime() - b.time.getTime());
  for (const scan of sortedAllScans) {
    const userId = scan.clientId;
    if (!userFirstSeenProject.has(userId)) {
      userFirstSeenProject.set(userId, scan.time);
    }
  }

  // 3. Filter data in range
  const rangeScans = data.scans.filter((s) => s.time >= start && s.time <= end);
  const rangeClicks = data.clicks.filter((c) => c.time >= start && c.time <= end);

  // 4. Initialize Stats Map by LightID
  const stats = new Map<
    number,
    {
      lightId: number;
      csNames: Set<string>;
      sceneNames: Set<string>;
      scans: number;
      clicks: number;
      activeUsers: Set<string>;
      newUsers: Set<string>;
    }
  >();

  const getStat = (lightId: number) => {
    let stat = stats.get(lightId);
    if (!stat) {
      stat = {
        lightId,
        csNames: new Set(),
        sceneNames: new Set(),
        scans: 0,
        clicks: 0,
        activeUsers: new Set(),
        newUsers: new Set(),
      };
      stats.set(lightId, stat);
    }
    return stat;
  };

  // 5. Process Scans
  // We also build a map of User -> Last Scan Time/LightID for Click attribution
  // Note: For click attribution, we need scans BEFORE the click, possibly outside the range.
  // So we might need to look at ALL scans for attribution, but only count stats for range scans.
  // Let's build a "User Scan History" first.
  const userScanHistory = new Map<string, { time: Date; lightId: number }[]>();
  for (const scan of sortedAllScans) {
    const userId = scan.clientId;
    if (!userScanHistory.has(userId)) {
      userScanHistory.set(userId, []);
    }
    userScanHistory.get(userId)!.push({ time: scan.time, lightId: scan.ligId });
  }

  for (const scan of rangeScans) {
    const stat = getStat(scan.ligId);
    stat.scans++;
    stat.activeUsers.add(scan.clientId);

    // Metadata
    if (scan.coordinateSystemId) {
      const cs = csMap.get(scan.coordinateSystemId);
      if (cs) {
        stat.csNames.add(cs.name);
        if (cs.sceneName) stat.sceneNames.add(cs.sceneName);
      }
    }

    // New User Check: Is this the first time we see this user in the PROJECT?
    // And is this scan the one that established them as new?
    // Or is "New User" defined as "First time seen at THIS LightID"?
    // The user request implies "New Users" in the context of the table.
    // Usually "New Users" means "New to the Project".
    // If a user visits Light A then Light B, they are New at Light A, Returning at Light B.
    // Let's stick to "New to Project" definition, attributed to the LightID where they first appeared.
    const firstSeen = userFirstSeenProject.get(scan.clientId);
    if (firstSeen && firstSeen.getTime() === scan.time.getTime()) {
      stat.newUsers.add(scan.clientId);
    }
  }

  // 6. Process Clicks (Attribute to LightID)
  for (const click of rangeClicks) {
    const userId = click.codeName?.trim();
    if (!userId) continue;

    // Find the latest scan before this click
    const history = userScanHistory.get(userId);
    if (!history) continue; // Should not happen if user scanned

    // Binary search or linear search (since sorted) for the scan just before click.time
    // Since history is sorted by time:
    let bestScan: { time: Date; lightId: number } | null = null;
    // Optimization: history is sorted. We want max(t) where t <= click.time
    // We can iterate backwards or use binary search. Linear backwards is fine for small history.
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].time <= click.time) {
        bestScan = history[i];
        break;
      }
    }

    // If we found a scan, and it's within a reasonable window (e.g. 1 hour? or just latest?)
    // Let's assume just latest for now, as sessions can be long.
    if (bestScan) {
      const stat = getStat(bestScan.lightId);
      stat.clicks++;
      stat.activeUsers.add(userId);
      // Note: We don't re-evaluate "New User" for clicks, as that's scan-based.
    }
  }

  // 7. Format Output
  const rows: LightPerformanceRow[] = [];
  for (const stat of stats.values()) {
    const newUsers = stat.newUsers.size;
    const activeUsers = stat.activeUsers.size;
    // Returning Users = Total Active Users - New Users
    const returningUsers = Math.max(0, activeUsers - newUsers);

    rows.push({
      lightId: stat.lightId,
      coordinateSystemNames: Array.from(stat.csNames).sort(),
      sceneNames: Array.from(stat.sceneNames).sort(),
      scans: stat.scans,
      clicks: stat.clicks,
      newUsers,
      returningUsers,
    });
  }

  return rows.sort((a, b) => b.scans - a.scans);
}

export interface SceneTimeComparisonRow {
  sceneId: number;
  sceneName: string;
  today: number;
  yesterday: number;
  thisWeek: number;
  lastWeek: number;
  thisMonth: number;
  lastMonth: number;
  total: number;
}

export function computeSceneTimeStats(data: DashboardData): SceneTimeComparisonRow[] {
  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = startOfDay(subDays(now, 1));
  const yesterdayEnd = endOfDay(subDays(now, 1));
  const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  const lastWeekStart = startOfWeek(subDays(now, 7), { weekStartsOn: 1 });
  const lastWeekEnd = endOfWeek(subDays(now, 7), { weekStartsOn: 1 });
  const thisMonthStart = startOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));

  // 0. Identify valid scenes from projects
  const validSceneIds = new Set<number>();
  for (const p of data.projects) {
    for (const s of p.scenes) {
      const match = s.match(/^(\d+)/);
      if (match) validSceneIds.add(Number(match[1]));
    }
  }

  // Map CoordinateSystemId -> Scene Info
  const csMap = new Map<number, { sceneId: number; sceneName: string }>();
  for (const cs of data.coordinateSystems) {
    if (cs.sceneId !== null && validSceneIds.has(cs.sceneId)) {
      csMap.set(cs.id, { sceneId: cs.sceneId, sceneName: cs.sceneName || `Scene ${cs.sceneId}` });
    }
  }

  const sceneStats = new Map<number, SceneTimeComparisonRow>();

  const getStat = (sceneId: number, sceneName: string) => {
    let stat = sceneStats.get(sceneId);
    if (!stat) {
      stat = {
        sceneId,
        sceneName,
        today: 0,
        yesterday: 0,
        thisWeek: 0,
        lastWeek: 0,
        thisMonth: 0,
        lastMonth: 0,
        total: 0,
      };
      sceneStats.set(sceneId, stat);
    }
    return stat;
  };

  for (const scan of data.scans) {
    if (scan.coordinateSystemId === null) continue;
    const sceneInfo = csMap.get(scan.coordinateSystemId);
    if (!sceneInfo) continue;

    const stat = getStat(sceneInfo.sceneId, sceneInfo.sceneName);
    stat.total++;

    if (scan.time >= todayStart) stat.today++;
    if (scan.time >= yesterdayStart && scan.time <= yesterdayEnd) stat.yesterday++;
    if (scan.time >= thisWeekStart) stat.thisWeek++;
    if (scan.time >= lastWeekStart && scan.time <= lastWeekEnd) stat.lastWeek++;
    if (scan.time >= thisMonthStart) stat.thisMonth++;
    if (scan.time >= lastMonthStart && scan.time <= lastMonthEnd) stat.lastMonth++;
  }

  return Array.from(sceneStats.values()).sort((a, b) => b.total - a.total);
}

export interface MergedPerformanceRow {
  lightId: number;
  coordinateSystemNames: string[];
  sceneName: string;
  scans: number;
  clicks: number;
  intensity: number;
  newUsers: number;
  returningUsers: number;
}

export function computeMergedPerformanceStats(
  data: DashboardData,
  lightConfigs: LightConfig[],
  startDate: Date,
  endDate: Date
): MergedPerformanceRow[] {
  const start = startOfDay(startDate);
  const end = endOfDay(endDate);

  // 1. Build Light ID -> Scans map
  const lightScans = new Map<number, number>();
  for (const scan of data.scans) {
    if (scan.time < start || scan.time > end) continue;
    lightScans.set(scan.ligId, (lightScans.get(scan.ligId) ?? 0) + 1);
  }

  // 2. Build Scene ID -> Stats map (Clicks, Users)
  const sceneStats = new Map<number, { clicks: number; activeUsers: Set<string>; newUsers: Set<string> }>();

  // Helper to get scene stat
  const getSceneStat = (sceneId: number) => {
    let stat = sceneStats.get(sceneId);
    if (!stat) {
      stat = { clicks: 0, activeUsers: new Set(), newUsers: new Set() };
      sceneStats.set(sceneId, stat);
    }
    return stat;
  };

  // Process clicks to populate scene stats
  const objectMeta = buildObjectMetaMap(data);
  const firstClickByUser = data.firstClickByUser;

  for (const click of data.clicks) {
    if (click.time < start || click.time > end) continue;

    const meta = objectMeta.get(click.objId);
    if (!meta || meta.sceneId === null) continue;

    const stat = getSceneStat(meta.sceneId);
    stat.clicks++;

    if (click.codeName) {
      stat.activeUsers.add(click.codeName);
      const firstTime = firstClickByUser[click.codeName];
      if (firstTime && firstTime >= start && firstTime <= end) {
        stat.newUsers.add(click.codeName);
      }
    }
  }

  // 3. Iterate LightConfigs to build rows
  const rows: MergedPerformanceRow[] = [];

  for (const config of lightConfigs) {
    const lightId = Number(config.lightId);
    if (!Number.isFinite(lightId)) continue;

    const scans = lightScans.get(lightId) ?? 0;

    // Parse Coordinate System Names
    // Keep full "ID-Name" format as requested
    const csNames = config.coordinates;

    // If no scenes, add a row with empty scene info
    if (config.scenes.length === 0) {
      rows.push({
        lightId,
        coordinateSystemNames: csNames,
        sceneName: "-",
        scans,
        clicks: 0,
        intensity: 0,
        newUsers: 0,
        returningUsers: 0
      });
      continue;
    }

    // For each scene, add a row
    for (const sceneStr of config.scenes) {
      // Parse Scene ID for stats lookup, but keep full name for display
      const match = sceneStr.match(/^(\d+)(?:-(.*))?$/);
      let sceneId = 0;

      if (match) {
        sceneId = Number(match[1]);
      }

      const stat = sceneStats.get(sceneId);
      const clicks = stat?.clicks ?? 0;
      const newUsers = stat?.newUsers.size ?? 0;
      const activeUsers = stat?.activeUsers.size ?? 0;
      const returningUsers = activeUsers - newUsers;
      const intensity = scans > 0 ? clicks / scans : 0;

      rows.push({
        lightId,
        coordinateSystemNames: csNames,
        sceneName: sceneStr, // Keep full "ID-Name"
        scans,
        clicks,
        intensity,
        newUsers,
        returningUsers
      });
    }
  }

  return rows;
}
