import { useEffect, useMemo, useState } from "react";
import Plot from "react-plotly.js";
import type { Data, Layout } from "plotly.js";
import {
  eachMonthOfInterval,
  endOfDay,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import "./App.css";
import { useDashboardData } from "./context/DashboardDataContext";
import {
  computeClickRanking,
  buildClickSessionAnalytics,
  computeClickVolumeMonthly,
  computeClickVolumeSeries,
  computeDailyClickSeries,
  computeDailyScanSeries,
  computeHeatmapPoints,
  computeProjectRankRows,
  computeScanSummary,
  computeScanVolumeMonthly,
  computeScanVolumeSeries,
  computeUserAcquisitionMonthly,
  computeUserAcquisitionSeries,
  computeUserAcquisitionSeriesInRange,
  computeProjectUserAcquisition,
  computeSceneUserStats,
  computeObjectMarketingMetrics,
  computeSceneMarketingStats,
  computeUserBehaviorStats,
  computeProjectFunnelRows,
  computeClickDaypartStats,
  computeProjectObjectAttribution,
  type ClickRankingRow,
  type ClickSessionAnalytics,
  type ClickSessionRecord,
  type ProjectUserAcquisitionRow,
  type ProjectRankRow,
  type SceneUserStatRow,
  type UserAcquisitionPoint,
  type ObjectMarketingMetric,
  type SceneMarketingStat,
  type UserBehaviorStats,
  type ProjectFunnelRow,
  type ClickDaypartStats,
  type ProjectObjectAttributionRow,
} from "./utils/stats";
import { scopeDashboardData } from "./utils/dataTransform";
import { generateProjectReportPdf } from "./utils/projectReport";
import type { DashboardData, Project } from "./types";
import {
  fetchProjects as fetchAirtableProjects,
  createProject as createAirtableProject,
  updateProject as updateAirtableProject,
  deleteProject as deleteAirtableProject,
  type AirtableProject,
} from "./services/airtable";
import {
  loginLigDashboard,
  fetchLightOptions,
  fetchCoordinatesForLight,
  fetchSceneOptions,
  fetchScenesWithMeta,
  fetchCoordinateSystemsWithMeta,
  type SceneDetail,
  type CoordinateSystemDetail,
} from "./services/ligApi";
import { triggerDataSync } from "./services/dataSync";

type PageKey = "all" | "project" | "wall" | "settings";

interface DateRange {
  start: Date;
  end: Date;
}

function App() {
const dataState = useDashboardData();
const [page, setPage] = useState<PageKey>("all");
const [selectedOwners, setSelectedOwners] = useState<string[]>([]);
const [currentTime, setCurrentTime] = useState(new Date());
const [dateRange, setDateRange] = useState<DateRange>(() => createDefaultRange());
const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  const readyData = dataState.status === "ready" ? dataState.data : null;

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const ownerOptions = useMemo(
    () => (readyData ? extractOwnerOptions(readyData.projects) : []),
    [readyData]
  );

  const allProjectOptions = useMemo(() => {
    if (!readyData) return [];
    return [...readyData.projects].sort((a, b) => {
      if (a.startDate && b.startDate) {
        return b.startDate.getTime() - a.startDate.getTime();
      }
      if (a.startDate) return -1;
      if (b.startDate) return 1;
      return b.projectId - a.projectId;
    });
  }, [readyData]);

  useEffect(() => {
    if (allProjectOptions.length === 0) {
      setSelectedProjectId(null);
      return;
    }
    if (
      selectedProjectId === null ||
      !allProjectOptions.some(
        (project) => project.projectId === selectedProjectId
      )
    ) {
      setSelectedProjectId(allProjectOptions[0].projectId);
    }
  }, [allProjectOptions, selectedProjectId]);

  const selectedProject = useMemo(
    () =>
      selectedProjectId !== null && readyData
        ? readyData.projectById[selectedProjectId] ?? null
        : null,
    [readyData, selectedProjectId]
  );

  const projectScopedData = useMemo(() => {
    if (!readyData || selectedProjectId === null) return null;
    return scopeDashboardData(readyData, new Set([selectedProjectId]));
  }, [readyData, selectedProjectId]);

  const scopedData = useMemo(() => {
    if (!readyData) return null;
    const projectIds = createProjectScope(readyData.projects, selectedOwners);
    return scopeDashboardData(readyData, projectIds);
  }, [readyData, selectedOwners]);

  const summary = useMemo(
    () => (scopedData ? computeScanSummary(scopedData) : null),
    [scopedData]
  );

  const projectRankRows = useMemo(() => {
    if (!scopedData) return [];
    const rows = computeProjectRankRows(scopedData)
      .filter(
        (row) =>
          row.total > 0 ||
          row.thisMonth > 0 ||
          row.lastMonth > 0 ||
          row.thisWeek > 0 ||
          row.lastWeek > 0 ||
          row.today > 0 ||
          row.yesterday > 0
      )
      .sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        if (b.thisMonth !== a.thisMonth) return b.thisMonth - a.thisMonth;
        if (b.thisWeek !== a.thisWeek) return b.thisWeek - a.thisWeek;
        return b.today - a.today;
      });
    return rows;
  }, [scopedData]);

  const activeProjectIds = useMemo(() => {
    if (!scopedData) return new Set<number>();
    return new Set(
      scopedData.projects
        .filter((project) => project.isActive)
        .map((project) => project.projectId)
    );
  }, [scopedData]);

  const monthlyTop = useMemo(
    () =>
      [...projectRankRows]
        .filter((row) => activeProjectIds.has(row.projectId))
        .sort((a, b) => b.lastMonth - a.lastMonth)
        .slice(0, 10),
    [projectRankRows, activeProjectIds]
  );

  const weeklyTop = useMemo(
    () =>
      [...projectRankRows]
        .filter((row) => activeProjectIds.has(row.projectId))
        .sort((a, b) => b.lastWeek - a.lastWeek)
        .slice(0, 10),
    [projectRankRows, activeProjectIds]
  );

  const projectUserAcquisition = useMemo(
    () =>
      scopedData
        ? computeProjectUserAcquisition(scopedData, dateRange.start, dateRange.end)
        : [],
    [scopedData, dateRange.start, dateRange.end]
  );

  const sceneUserStats = useMemo(
    () =>
      scopedData
        ? computeSceneUserStats(scopedData, dateRange.start, dateRange.end)
        : [],
    [scopedData, dateRange.start, dateRange.end]
  );

  const dailySeries = useMemo(
    () =>
      scopedData
        ? computeDailyScanSeries(scopedData, dateRange.start, dateRange.end)
        : [],
    [scopedData, dateRange]
  );

  const heatmapPoints = useMemo(
    () =>
      scopedData
        ? computeHeatmapPoints(scopedData, dateRange.start, dateRange.end).filter(
            (item) => item.scans > 0
          )
        : [],
    [scopedData, dateRange]
  );

  const clickRanking = useMemo(
    () =>
      scopedData
        ? computeClickRanking(scopedData, dateRange.start, dateRange.end, 10)
        : [],
    [scopedData, dateRange]
  );

  const userAcquisitionDaily = useMemo(
    () =>
      scopedData
        ? computeUserAcquisitionSeries(scopedData, 30)
        : [],
    [scopedData]
  );

  const userAcquisitionMonthly = useMemo(
    () =>
      scopedData ? computeUserAcquisitionMonthly(scopedData) : [],
    [scopedData]
  );

  const scanVolumeDaily = useMemo(
    () => (readyData ? computeScanVolumeSeries(readyData, 30) : []),
    [readyData]
  );

  const scanVolumeMonthly = useMemo(
    () => (readyData ? computeScanVolumeMonthly(readyData, 12) : []),
    [readyData]
  );

  const clickVolumeDaily = useMemo(
    () => (readyData ? computeClickVolumeSeries(readyData, 30) : []),
    [readyData]
  );

  const clickVolumeMonthly = useMemo(
    () => (readyData ? computeClickVolumeMonthly(readyData, 12) : []),
    [readyData]
  );

  const projectSummary = useMemo(
    () => (projectScopedData ? computeScanSummary(projectScopedData) : null),
    [projectScopedData]
  );

  const latestScanDate = useMemo(() => {
    if (!scopedData || scopedData.scans.length === 0) return null;
    let latest = scopedData.scans[0].time;
    for (const scan of scopedData.scans) {
      if (scan.time > latest) latest = scan.time;
    }
    return latest;
  }, [scopedData]);

  const projectDailySeries = useMemo(
    () =>
      projectScopedData
        ? computeDailyScanSeries(
            projectScopedData,
            dateRange.start,
            dateRange.end
          )
        : [],
    [projectScopedData, dateRange]
  );

  const projectDailyClickSeries = useMemo(
    () =>
      projectScopedData
        ? computeDailyClickSeries(
            projectScopedData,
            dateRange.start,
            dateRange.end
          )
        : [],
    [projectScopedData, dateRange]
  );

  const projectScanVolumeDaily = useMemo(
    () =>
      projectScopedData ? computeScanVolumeSeries(projectScopedData, 30) : [],
    [projectScopedData]
  );

  const projectScanVolumeMonthly = useMemo(
    () =>
      projectScopedData ? computeScanVolumeMonthly(projectScopedData, 12) : [],
    [projectScopedData]
  );

  const projectClickRanking = useMemo(
    () =>
      projectScopedData
        ? computeClickRanking(
            projectScopedData,
            dateRange.start,
            dateRange.end,
            20
          )
        : [],
    [projectScopedData, dateRange]
  );

  const projectSceneUserStats = useMemo(
    () =>
      projectScopedData
        ? computeSceneUserStats(
            projectScopedData,
            dateRange.start,
            dateRange.end
          )
        : [],
    [projectScopedData, dateRange]
  );

  const projectUserAcquisitionDaily = useMemo(
    () =>
      projectScopedData ? computeUserAcquisitionSeries(projectScopedData, 30) : [],
    [projectScopedData]
  );

  const projectUserAcquisitionRange = useMemo(
    () =>
      projectScopedData
        ? computeUserAcquisitionSeriesInRange(
            projectScopedData,
            dateRange.start,
            dateRange.end
          )
        : [],
    [projectScopedData, dateRange]
  );

  const projectUserAcquisitionMonthly = useMemo(
    () =>
      projectScopedData ? computeUserAcquisitionMonthly(projectScopedData) : [],
    [projectScopedData]
  );

  const projectUserSummary = useMemo(() => {
    if (!projectScopedData) return null;
    const rows = computeProjectUserAcquisition(
      projectScopedData,
      dateRange.start,
      dateRange.end
    );
    return rows.length > 0 ? rows[0] : null;
  }, [projectScopedData, dateRange]);

  const projectClickStats = useMemo(() => {
    if (!scopedData) return new Map<number, { clicks: number; users: number }>();
    return buildProjectClickStats(scopedData);
  }, [scopedData]);

  const sessionAnalytics = useMemo(
    () => (scopedData ? buildClickSessionAnalytics(scopedData) : null),
    [scopedData]
  );
  const projectSessionAnalytics = useMemo(
    () => (projectScopedData ? buildClickSessionAnalytics(projectScopedData) : null),
    [projectScopedData]
  );

  const objectMarketingMetrics = useMemo(
    () =>
      scopedData && sessionAnalytics
        ? computeObjectMarketingMetrics(
            scopedData,
            sessionAnalytics.sessions
          )
        : [],
    [scopedData, sessionAnalytics]
  );

  const sceneMarketingStats = useMemo(
    () =>
      scopedData && sessionAnalytics
        ? computeSceneMarketingStats(scopedData, sessionAnalytics.sessions)
        : [],
    [scopedData, sessionAnalytics]
  );

  const userBehaviorStats = useMemo(
    () =>
      scopedData && sessionAnalytics
        ? computeUserBehaviorStats(
            scopedData,
            sessionAnalytics.sessions,
            30
          )
        : null,
    [scopedData, sessionAnalytics]
  );

  const projectFunnelRows = useMemo(
    () =>
      scopedData
        ? computeProjectFunnelRows(scopedData, dateRange.start, dateRange.end)
        : [],
    [scopedData, dateRange.start, dateRange.end]
  );

  const daypartStats = useMemo(
    () => (scopedData ? computeClickDaypartStats(scopedData, 30) : null),
    [scopedData]
  );

  const projectObjectAttribution = useMemo(
    () =>
      scopedData ? computeProjectObjectAttribution(scopedData, 30, 15) : [],
    [scopedData]
  );

  const marketingGeoData = useMemo(
    () =>
      scopedData
        ? buildClickGeoData(scopedData, clickRanking)
        : { heatmapPoints: [], topObjectRows: [] },
    [scopedData, clickRanking]
  );

  const projectScansInRange = useMemo(
    () =>
      projectDailySeries.reduce((acc, point) => acc + point.total, 0),
    [projectDailySeries]
  );

  const projectClicksInRange = useMemo(() => {
    if (!projectScopedData) return 0;
    const start = dateRange.start;
    const end = dateRange.end;
    return projectScopedData.clicks.filter(
      (click) => click.time >= start && click.time <= end
    ).length;
  }, [projectScopedData, dateRange]);

  const projectUniqueUsersInRange = useMemo(() => {
    if (!projectScopedData) return 0;
    const start = dateRange.start;
    const end = dateRange.end;
    const users = new Set<string>();
    for (const click of projectScopedData.clicks) {
      if (click.time >= start && click.time <= end && click.codeName) {
        users.add(click.codeName);
      }
    }
    return users.size;
  }, [projectScopedData, dateRange]);

  const projectAllTimeStats = useMemo(() => {
    if (!projectScopedData) return { clicks: 0, users: 0 };
    const users = new Set<string>();
    for (const click of projectScopedData.clicks) {
      if (click.codeName) {
        users.add(click.codeName.trim());
      }
    }
    return {
      clicks: projectScopedData.clicks.length,
      users: users.size,
    };
  }, [projectScopedData]);

  if (dataState.status === "loading") {
    return (
      <div className="app app--centered">
        <div className="panel panel--surface">
          <p>資料載入中，請稍候…</p>
        </div>
      </div>
    );
  }

  if (dataState.status === "error" || !readyData || !summary || !scopedData) {
    return (
      <div className="app app--centered">
        <div className="panel panel--surface panel--error">
          <h2>載入失敗</h2>
          <p>{dataState.error ?? "發生未知錯誤"}</p>
        </div>
      </div>
    );
  }

  const monthlyDumbbell = buildDumbbellSeries(
    monthlyTop,
    "lastMonth",
    "thisMonth",
    "上月",
    "本月"
  );
  const weeklyDumbbell = buildDumbbellSeries(
    weeklyTop,
    "lastWeek",
    "thisWeek",
    "上週",
    "本週"
  );

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <div className="app__timestamp">
            Today:{" "}
            {currentTime.toLocaleString("zh-TW", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              hour12: false,
            })}
          </div>
        </div>
        <div className="app__title">LiG Taiwan Dashboard</div>
        <div className="app__actions">
          <nav className="app__nav" aria-label="主頁面切換">
            <button
              type="button"
              className={`app__nav-button${
                page === "all" ? " app__nav-button--active" : ""
              }`}
              onClick={() => setPage("all")}
            >
              總覽
            </button>
            <button
              type="button"
              className={`app__nav-button${
                page === "project" ? " app__nav-button--active" : ""
              }`}
              onClick={() => setPage("project")}
            >
              專案分析
            </button>
            <button
              type="button"
              className={`app__nav-button${
                page === "wall" ? " app__nav-button--active" : ""
              }`}
              onClick={() => setPage("wall")}
            >
              大屏
            </button>
          </nav>
          <button
            type="button"
            className={`app__settings-button${page === "settings" ? " app__settings-button--active" : ""}`}
            onClick={() => setPage("settings")}
            aria-label="前往設定"
            aria-pressed={page === "settings"}
            title="設定"
          >
            ⚙
          </button>
        </div>
      </header>

      <main className="app__main">
        {page === "all" && (
          <AllProjectsPage
            summary={summary}
            projectRankRows={projectRankRows}
            dailySeries={dailySeries}
            heatmapPoints={heatmapPoints}
            clickRanking={clickRanking}
            dateRange={dateRange}
            setDateRange={setDateRange}
            ownerOptions={ownerOptions}
            selectedOwners={selectedOwners}
            onOwnersChange={setSelectedOwners}
            monthlyDumbbell={monthlyDumbbell}
            weeklyDumbbell={weeklyDumbbell}
            userAcquisitionDaily={userAcquisitionDaily}
            userAcquisitionMonthly={userAcquisitionMonthly}
            scanVolumeDaily={scanVolumeDaily}
            scanVolumeMonthly={scanVolumeMonthly}
            projectClickStats={projectClickStats}
            clickVolumeDaily={clickVolumeDaily}
            clickVolumeMonthly={clickVolumeMonthly}
            projectUserAcquisition={projectUserAcquisition}
            sceneUserStats={sceneUserStats}
            latestScanDate={latestScanDate}
            sessionAnalytics={sessionAnalytics}
            objectMetrics={objectMarketingMetrics}
            sceneMarketingStats={sceneMarketingStats}
            userBehaviorStats={userBehaviorStats}
            projectFunnelRows={projectFunnelRows}
            daypartStats={daypartStats}
            projectObjectAttribution={projectObjectAttribution}
            clickHeatmapPoints={marketingGeoData.heatmapPoints}
          />
        )}
        {page === "project" && (
          <ProjectDetailPage
            project={selectedProject}
            projectOptions={allProjectOptions}
            selectedProjectId={selectedProjectId}
            onProjectChange={setSelectedProjectId}
            dateRange={dateRange}
            setDateRange={setDateRange}
            summary={projectSummary}
            scansInRange={projectScansInRange}
            clicksInRange={projectClicksInRange}
            uniqueUsersInRange={projectUniqueUsersInRange}
            totalClicksAllTime={projectAllTimeStats.clicks}
            totalUsersAllTime={projectAllTimeStats.users}
            dailySeries={projectDailySeries}
            dailyClickSeries={projectDailyClickSeries}
            scanVolumeDaily={projectScanVolumeDaily}
            scanVolumeMonthly={projectScanVolumeMonthly}
            userAcquisitionDaily={projectUserAcquisitionDaily}
            userAcquisitionRangeSeries={projectUserAcquisitionRange}
            userAcquisitionMonthly={projectUserAcquisitionMonthly}
            clickRanking={projectClickRanking}
            sceneUserStats={projectSceneUserStats}
            userSummary={projectUserSummary}
            sessionAnalytics={projectSessionAnalytics}
          />
        )}
        {page === "wall" && (
          <BigScreenPage
            scopedData={scopedData}
            summary={summary}
            projectRankRows={projectRankRows}
            userAcquisitionMonthly={userAcquisitionMonthly}
          />
        )}
        {page === "settings" && (
          <SettingsPage ownerOptions={ownerOptions} onNavigateHome={() => setPage("all")} />
        )}
      </main>
    </div>
  );
}

interface AllProjectsPageProps {
  summary: ReturnType<typeof computeScanSummary>;
  projectRankRows: ProjectRankRow[];
  dailySeries: ReturnType<typeof computeDailyScanSeries>;
  heatmapPoints: ReturnType<typeof computeHeatmapPoints>;
  clickRanking: ClickRankingRow[];
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  ownerOptions: string[];
  selectedOwners: string[];
  onOwnersChange: (owners: string[]) => void;
  monthlyDumbbell: DumbbellSeries | null;
  weeklyDumbbell: DumbbellSeries | null;
  userAcquisitionDaily: UserAcquisitionPoint[];
  userAcquisitionMonthly: UserAcquisitionPoint[];
  scanVolumeDaily: ReturnType<typeof computeScanVolumeSeries>;
  scanVolumeMonthly: ReturnType<typeof computeScanVolumeMonthly>;
  projectClickStats: Map<number, { clicks: number; users: number }>;
  clickVolumeDaily: ReturnType<typeof computeClickVolumeSeries>;
  clickVolumeMonthly: ReturnType<typeof computeClickVolumeMonthly>;
  projectUserAcquisition: ProjectUserAcquisitionRow[];
  sceneUserStats: SceneUserStatRow[];
  latestScanDate: Date | null;
  sessionAnalytics: ClickSessionAnalytics | null;
  objectMetrics: ObjectMarketingMetric[];
  sceneMarketingStats: SceneMarketingStat[];
  userBehaviorStats: UserBehaviorStats | null;
  projectFunnelRows: ProjectFunnelRow[];
  daypartStats: ClickDaypartStats | null;
  projectObjectAttribution: ProjectObjectAttributionRow[];
  clickHeatmapPoints: Array<{
    projectId: number;
    lat: number;
    lon: number;
    name: string;
    clicks: number;
  }>;
}

function AllProjectsPage({
  summary,
  projectRankRows,
  dailySeries,
  heatmapPoints,
  clickRanking,
  dateRange,
  setDateRange,
  ownerOptions,
  selectedOwners,
  onOwnersChange,
  monthlyDumbbell,
  weeklyDumbbell,
  userAcquisitionDaily,
  userAcquisitionMonthly,
  scanVolumeDaily,
  scanVolumeMonthly,
  projectClickStats,
  clickVolumeDaily,
  clickVolumeMonthly,
  projectUserAcquisition,
  sceneUserStats,
  latestScanDate,
  sessionAnalytics,
  objectMetrics,
  sceneMarketingStats,
  userBehaviorStats,
  projectFunnelRows,
  daypartStats,
  projectObjectAttribution,
  clickHeatmapPoints,
}: AllProjectsPageProps) {
  const dateRangeLabel = `${format(dateRange.start, "yyyy-MM-dd")} ~ ${format(
    dateRange.end,
    "yyyy-MM-dd"
  )}`;

  const totalCutoffLabel = latestScanDate
    ? format(latestScanDate, "yyyy-MM-dd")
    : null;
  const rankedProjects = projectRankRows.slice(0, 20);
  const formatPercent = (value: number | null, digits = 1) => {
    if (value === null || !Number.isFinite(value)) return "-";
    return `${(value * 100).toFixed(digits)}%`;
  };

  const dailyData: Partial<Data>[] = [
    {
      type: "scatter",
      mode: "lines+markers",
      x: dailySeries.map((point) => point.date.toISOString()),
      y: dailySeries.map((point) => point.total),
      name: "Total Scans",
      line: { color: "#1f77b4", width: 2 },
      marker: { size: 6 },
    },
  ];

  const heatmapData: Partial<Data>[] = [
    {
      type: "scattergeo",
      mode: "markers",
      lat: heatmapPoints.map((point) => point.lat),
      lon: heatmapPoints.map((point) => point.lon),
      text: heatmapPoints.map(
        (point) => `${point.name}<br />Scans: ${point.scans}`
      ),
      marker: {
        size: heatmapPoints.map((point) =>
          Math.max(8, Math.sqrt(point.scans) * 6)
        ),
        color: heatmapPoints.map((point) => point.scans),
        colorscale: "Blues",
        reversescale: false,
        sizemode: "area",
        showscale: true,
        colorbar: { title: { text: "Scans" } },
      },
    },
  ];

  const maxClickHeat = Math.max(
    ...clickHeatmapPoints.map((point) => point.clicks),
    1
  );
  const clickHeatmapData: Partial<Data>[] =
    clickHeatmapPoints.length === 0
      ? []
      : [
          {
            type: "scattergeo",
            mode: "markers",
            lat: clickHeatmapPoints.map((point) => point.lat),
            lon: clickHeatmapPoints.map((point) => point.lon),
            text: clickHeatmapPoints.map(
              (point) =>
                `${point.name}<br />Clicks: ${point.clicks.toLocaleString()}`
            ),
            marker: {
              size: clickHeatmapPoints.map((point) =>
                Math.max(6, (point.clicks / maxClickHeat) * 40)
              ),
              color: clickHeatmapPoints.map((point) => point.clicks),
              colorscale: "YlOrRd",
              showscale: true,
              colorbar: { title: { text: "Clicks" } },
              opacity: 0.85,
            },
          },
        ];

  const hourlyTrendData: Partial<Data>[] =
    daypartStats && daypartStats.hourly.length > 0
      ? [
          {
            type: "scatter",
            mode: "lines+markers" as any,
            name: "Clicks",
            x: daypartStats.hourly.map(
              (point) => `${point.hour.toString().padStart(2, "0")}:00`
            ),
            y: daypartStats.hourly.map((point) => point.clicks),
            line: { color: "#f97316", width: 3 },
            marker: { size: 6 },
          },
        ]
      : [];

  const daypartHeatmapData: Partial<Data>[] =
    daypartStats && daypartStats.weekdayHourMatrix.length > 0
      ? [
          {
            type: "heatmap",
            z: daypartStats.weekdayHourMatrix,
            x: Array.from({ length: 24 }, (_, hour) =>
              `${hour.toString().padStart(2, "0")}:00`
            ),
            y: daypartStats.weekdayLabels,
            colorscale: "YlGnBu",
            showscale: true,
          },
        ]
      : [];

  const acquisitionDailyData =
    userAcquisitionDaily.length > 0
      ? buildUserAcquisitionPlot(userAcquisitionDaily, {
          showRangeSlider: false,
          xTickFormat: "%m-%d",
        })
      : null;

  const acquisitionMonthlyData =
    userAcquisitionMonthly.length > 0
      ? buildUserAcquisitionPlot(userAcquisitionMonthly, {
          showRangeSlider: false,
          xTickFormat: "%Y-%m",
        })
      : null;

  const scanDailyStats = computeVolumeStats(scanVolumeDaily);
  const scanMonthlyStats = computeVolumeStats(
    scanVolumeMonthly.map((point) => ({
      total: point.total,
      date: point.month,
    }))
  );
  const clickDailyStats = computeVolumeStats(clickVolumeDaily);
  const clickMonthlyStats = computeVolumeStats(
    clickVolumeMonthly.map((point) => ({
      total: point.total,
      date: point.month,
    }))
  );

  return (
    <>
      <section>
        <SectionTitle title="Account Filter" />
        <div className="panel panel--surface panel--filters">
          <div>
            <label className="field-label">Owner Email</label>
            <select
              multiple
              size={Math.min(ownerOptions.length, 6) || 3}
              value={selectedOwners}
              onChange={(event) => {
                const values = Array.from(event.target.selectedOptions).map(
                  (option) => option.value
                );
                onOwnersChange(values);
              }}
            >
              {ownerOptions.map((owner) => (
                <option key={owner} value={owner}>
                  {owner}
                </option>
              ))}
            </select>
            <p className="field-hint">
              按住 <kbd>⌘</kbd>/<kbd>Ctrl</kbd> 可選擇多個帳號；不選代表顯示全部專案。
            </p>
          </div>
          <div>
            <label className="field-label">Start Date</label>
            <input
              type="date"
              value={format(dateRange.start, "yyyy-MM-dd")}
              max={format(dateRange.end, "yyyy-MM-dd")}
              onChange={(event) => {
                const next = new Date(`${event.target.value}T00:00:00`);
                if (!isNaN(next.getTime())) {
                  setDateRange({ ...dateRange, start: next });
                }
              }}
            />
          </div>
          <div>
            <label className="field-label">End Date</label>
            <input
              type="date"
              value={format(dateRange.end, "yyyy-MM-dd")}
              min={format(dateRange.start, "yyyy-MM-dd")}
              onChange={(event) => {
                const next = new Date(`${event.target.value}T23:59:59`);
                if (!isNaN(next.getTime())) {
                  setDateRange({ ...dateRange, end: next });
                }
              }}
            />
          </div>
        </div>
      </section>

      <section>
        <SectionTitle title="Key Metrics" />
        <div className="metric-grid">
          <MetricCard title="Total Projects" value={summary.totalProjects} />
          <MetricCard title="Active Projects" value={summary.activeProjects} />
          <MetricCard title="Total Scans" value={summary.totalScans} />
          <MetricCard title="Scans Today" value={summary.scansToday} />
          <MetricCard title="Scans Yesterday" value={summary.scansYesterday} />
          <MetricCard title="Unique Users" value={summary.uniqueUsers} />
        </div>
      </section>

      <section>
        <SectionTitle title="Project Query" />
        <div className="chart-grid chart-grid--two-thirds">
          <div className="panel panel--surface">
            <h3 className="panel__title">Daily Scan Trend ({dateRangeLabel})</h3>
            <Plot
              data={dailyData}
              layout={{
                autosize: true,
                margin: { l: 60, r: 20, t: 20, b: 50 },
                xaxis: {
                  title: { text: "Date" },
                  type: "date",
                  tickformat: "%Y-%m-%d",
                },
                yaxis: { title: { text: "Scans" } },
                paper_bgcolor: "transparent",
                plot_bgcolor: "transparent",
              }}
              style={{ width: "100%", height: "360px" }}
              useResizeHandler
              config={{ displayModeBar: false }}
            />
          </div>
          <div className="panel panel--surface">
            <h3 className="panel__title">Geo Heat Map ({dateRangeLabel})</h3>
            <Plot
              data={heatmapData}
              layout={{
                autosize: true,
                geo: {
                  scope: "asia",
                  projection: { type: "mercator" },
                  center: { lat: 23.6978, lon: 120.96 },
                  lonaxis: { range: [116, 123] },
                  lataxis: { range: [21, 26] },
                  showframe: false,
                  showcoastlines: true,
                },
                margin: { l: 0, r: 0, t: 0, b: 0 },
                paper_bgcolor: "transparent",
                plot_bgcolor: "transparent",
              }}
              style={{ width: "100%", height: "360px" }}
              useResizeHandler
              config={{ displayModeBar: false }}
            />
          </div>
        </div>
      </section>

      <section>
        <SectionTitle title="Growth Spotlight" />
        <div className="chart-grid">
          <div className="panel panel--surface">
            <h3 className="panel__title">Monthly Growth (Dumbbell)</h3>
            {monthlyDumbbell ? (
              <Plot
                data={monthlyDumbbell.data}
                layout={createDumbbellLayout(monthlyDumbbell.categories, "Scans")}
                style={{ width: "100%", height: "380px" }}
                config={{ displayModeBar: false }}
                useResizeHandler
              />
            ) : (
              <p>缺少足夠資料以計算月度成長。</p>
            )}
          </div>
          <div className="panel panel--surface">
            <h3 className="panel__title">Weekly Growth (Dumbbell)</h3>
            {weeklyDumbbell ? (
              <Plot
                data={weeklyDumbbell.data}
                layout={createDumbbellLayout(weeklyDumbbell.categories, "Scans")}
                style={{ width: "100%", height: "380px" }}
                config={{ displayModeBar: false }}
                useResizeHandler
              />
            ) : (
              <p>缺少足夠資料以計算週度成長。</p>
            )}
          </div>
        </div>
      </section>

      <section>
        <SectionTitle title="Scan & Click Volume" />
        <div className="chart-grid">
          <div className="panel panel--surface">
            <h3 className="panel__title">最近 30 天（日）</h3>
            {scanVolumeDaily.length > 0 && clickVolumeDaily.length > 0 ? (
              <Plot
                data={[
                  {
                    type: "scatter",
                    mode: "lines+markers" as any,
                    name: "Scans",
                    x: scanVolumeDaily.map((point) => point.date.toISOString()),
                    y: scanVolumeDaily.map((point) => point.total),
                    marker: { color: "#2ca02c", size: 6 },
                    line: { width: 3 },
                  },
                  {
                    type: "scatter",
                    mode: "lines+markers" as any,
                    name: "Clicks",
                    x: clickVolumeDaily.map((point) => point.date.toISOString()),
                    y: clickVolumeDaily.map((point) => point.total),
                    marker: { color: "#ff7f0e", size: 6 },
                    line: { width: 3 },
                  },
                ]}
                layout={{
                  autosize: true,
                  margin: { l: 60, r: 20, t: 20, b: 50 },
                  xaxis: { title: { text: "Date" }, type: "date", tickformat: "%m-%d" },
                  yaxis: { title: { text: "Volume" }, rangemode: "tozero" },
                  paper_bgcolor: "transparent",
                  plot_bgcolor: "transparent",
                  legend: { orientation: "h" },
                }}
                style={{ width: "100%", height: "420px" }}
                config={{ displayModeBar: false }}
                useResizeHandler
              />
            ) : (
              <p>沒有足夠的資料可用來繪製最近 30 天趨勢。</p>
            )}
            {scanDailyStats && clickDailyStats && (
              <div className="volume-summary">
                <div className="volume-summary__item">
                  <span>Scans Peak</span>
                  <strong>
                    {scanDailyStats.peakValue.toLocaleString()} (
                    {format(scanDailyStats.peakDate, "MM-dd")})
                  </strong>
                  <span>Avg {scanDailyStats.avg.toLocaleString()}</span>
                </div>
                <div className="volume-summary__item volume-summary__item--accent">
                  <span>Clicks Peak</span>
                  <strong>
                    {clickDailyStats.peakValue.toLocaleString()} (
                    {format(clickDailyStats.peakDate, "MM-dd")})
                  </strong>
                  <span>Avg {clickDailyStats.avg.toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>
          <div className="panel panel--surface">
            <h3 className="panel__title">近 12 個月（月）</h3>
            {scanVolumeMonthly.length > 0 && clickVolumeMonthly.length > 0 ? (
              <Plot
                data={[
                  {
                    type: "scatter",
                    mode: "lines+markers" as any,
                    name: "Scans",
                    x: scanVolumeMonthly.map((point) => point.month.toISOString()),
                    y: scanVolumeMonthly.map((point) => point.total),
                    marker: { color: "#17becf", size: 6 },
                    line: { width: 3 },
                  },
                  {
                    type: "scatter",
                    mode: "lines+markers" as any,
                    name: "Clicks",
                    x: clickVolumeMonthly.map((point) => point.month.toISOString()),
                    y: clickVolumeMonthly.map((point) => point.total),
                    marker: { color: "#f59e0b", size: 6 },
                    line: { width: 3 },
                  },
                ]}
                layout={{
                  autosize: true,
                  margin: { l: 60, r: 20, t: 20, b: 50 },
                  xaxis: { title: { text: "Month" }, type: "date", tickformat: "%Y-%m" },
                  yaxis: { title: { text: "Volume" }, rangemode: "tozero" },
                  paper_bgcolor: "transparent",
                  plot_bgcolor: "transparent",
                  legend: { orientation: "h" },
                }}
                style={{ width: "100%", height: "420px" }}
                config={{ displayModeBar: false }}
                useResizeHandler
              />
            ) : (
              <p>沒有足夠的資料可用來繪製月度趨勢。</p>
            )}
            {scanMonthlyStats && clickMonthlyStats && (
              <div className="volume-summary">
                <div className="volume-summary__item">
                  <span>Scans Peak</span>
                  <strong>
                    {scanMonthlyStats.peakValue.toLocaleString()} (
                    {format(scanMonthlyStats.peakDate, "yyyy-MM")})
                  </strong>
                  <span>Avg {scanMonthlyStats.avg.toLocaleString()}</span>
                </div>
                <div className="volume-summary__item volume-summary__item--accent">
                  <span>Clicks Peak</span>
                  <strong>
                    {clickMonthlyStats.peakValue.toLocaleString()} (
                    {format(clickMonthlyStats.peakDate, "yyyy-MM")})
                  </strong>
                  <span>Avg {clickMonthlyStats.avg.toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <SessionIntelligenceSection sessionAnalytics={sessionAnalytics} />

      <section>
        <SectionTitle title="Object Engagement & CTR" />
        <div className="chart-grid">
          <div className="panel panel--surface">
            <h3 className="panel__title">Top AR Objects（近 30 天）</h3>
            {objectMetrics.length === 0 ? (
              <p>暫無互動資料。</p>
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>AR Object</th>
                      <th>Project(s)</th>
                      <th>Scene</th>
                      <th>Total</th>
                      <th>30d</th>
                      <th>12m</th>
                      <th>CTR (All)</th>
                      <th>CTR (30d)</th>
                      <th>Avg Dwell</th>
                    </tr>
                  </thead>
                  <tbody>
                    {objectMetrics.slice(0, 10).map((row) => (
                      <tr key={row.objId}>
                        <td>{row.name}</td>
                        <td>{row.projectNames.join("、") || "-"}</td>
                        <td>{row.sceneName ?? "-"}</td>
                        <td>{row.totalClicks.toLocaleString()}</td>
                        <td>{row.clicks30d.toLocaleString()}</td>
                        <td>{row.clicks12m.toLocaleString()}</td>
                        <td>{formatPercent(row.ctrTotal)}</td>
                        <td>{formatPercent(row.ctr30d)}</td>
                        <td>
                          {row.avgDwellSeconds
                            ? `${row.avgDwellSeconds.toFixed(1)}s`
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="panel panel--surface">
            <h3 className="panel__title">Global Click Density</h3>
            {clickHeatmapPoints.length === 0 ? (
              <p>尚無地理資訊可顯示。</p>
            ) : (
              <Plot
                data={clickHeatmapData}
                layout={{
                  autosize: true,
                  geo: {
                    scope: "world",
                    projection: { type: "natural earth" },
                    showland: true,
                    landcolor: "#f5f5f5",
                    showcountries: true,
                    countrycolor: "#bcbcbc",
                  },
                  margin: { l: 0, r: 0, t: 0, b: 0 },
                  paper_bgcolor: "transparent",
                  plot_bgcolor: "transparent",
                }}
                style={{ width: "100%", height: "420px" }}
                config={{ displayModeBar: false }}
                useResizeHandler
              />
            )}
          </div>
        </div>
      </section>

      <section>
        <SectionTitle title="Scene Intelligence" />
        <div className="panel panel--surface">
          {sceneMarketingStats.length === 0 ? (
            <p>尚無場景互動資料。</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Scene</th>
                    <th>Project(s)</th>
                    <th>Clicks</th>
                    <th>Unique Users</th>
                    <th>Sessions</th>
                    <th>Sessions / User</th>
                    <th>Top Objects</th>
                  </tr>
                </thead>
                <tbody>
                  {sceneMarketingStats.slice(0, 12).map((row) => (
                    <tr key={row.sceneId}>
                      <td>{row.sceneName}</td>
                      <td>{row.projectNames.join("、") || "-"}</td>
                      <td>{row.totalClicks.toLocaleString()}</td>
                      <td>{row.uniqueUsers.toLocaleString()}</td>
                      <td>{row.sessionCount.toLocaleString()}</td>
                      <td>{row.avgSessionsPerUser.toFixed(2)}</td>
                      <td>
                        {row.objectShares.length === 0
                          ? "-"
                          : row.objectShares
                              .map((item) => `${item.name} (${formatPercent(item.share)})`)
                              .join("、")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionTitle title="User Behavior Segments" />
        <div className="panel panel--surface">
          {userBehaviorStats ? (
            <>
              <div className="metric-grid marketing-metrics marketing-metrics--compact">
                <div className="metric-card">
                  <div className="metric-card__title">New Users (30d)</div>
                  <div className="metric-card__value">
                    {userBehaviorStats.newUsers.toLocaleString()}
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-card__title">Returning Users</div>
                  <div className="metric-card__value">
                    {userBehaviorStats.returningUsers.toLocaleString()}
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-card__title">Avg Sessions / User</div>
                  <div className="metric-card__value">
                    {userBehaviorStats.avgSessionsPerUser.toFixed(2)}
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-card__title">Avg Revisit Gap</div>
                  <div className="metric-card__value">
                    {userBehaviorStats.avgRevisitDays
                      ? `${userBehaviorStats.avgRevisitDays.toFixed(1)} 天`
                      : "-"}
                  </div>
                </div>
              </div>
              <div className="frequency-bars">
                {(["heavy", "medium", "light"] as const).map((key) => {
                  const orderName =
                    key === "heavy" ? "Heavy (≥10)" : key === "medium" ? "Medium (4-9)" : "Light (1-3)";
                  const totalUsers =
                    userBehaviorStats.frequencyBuckets.heavy +
                    userBehaviorStats.frequencyBuckets.medium +
                    userBehaviorStats.frequencyBuckets.light;
                  const value = userBehaviorStats.frequencyBuckets[key];
                  const width =
                    totalUsers > 0 ? `${Math.round((value / totalUsers) * 100)}%` : "0%";
                  return (
                    <div key={key} className="frequency-bars__row">
                      <span>{orderName}</span>
                      <div className="frequency-bars__bar">
                        <div className="frequency-bars__bar-track">
                          <div className="frequency-bars__bar-fill" style={{ width }} />
                        </div>
                        <span>{value.toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p>暫無足夠資料可用於用戶分群分析。</p>
          )}
        </div>
      </section>

      <section>
        <SectionTitle title="Project Funnels" />
        <div className="panel panel--surface">
          {projectFunnelRows.length === 0 ? (
            <p>暫無符合條件的專案漏斗資料。</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Scans</th>
                    <th>Clicks</th>
                    <th>New Users</th>
                    <th>Active Users</th>
                    <th>CTR</th>
                    <th>Activation</th>
                  </tr>
                </thead>
                <tbody>
                  {projectFunnelRows.map((row) => (
                    <tr key={row.projectId}>
                      <td>{row.projectName}</td>
                      <td>{row.scans.toLocaleString()}</td>
                      <td>{row.clicks.toLocaleString()}</td>
                      <td>{row.newUsers.toLocaleString()}</td>
                      <td>{row.activeUsers.toLocaleString()}</td>
                      <td>{formatPercent(row.clickThroughRate)}</td>
                      <td>{formatPercent(row.activationRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionTitle title="Click Dayparting & Timing" />
        <div className="chart-grid">
          <div className="panel panel--surface">
            <h3 className="panel__title">Hourly Trend (Last 30 Days)</h3>
            {!daypartStats ? (
              <p>尚無足夠資料。</p>
            ) : (
              <Plot
                data={hourlyTrendData}
                layout={{
                  autosize: true,
                  margin: { l: 60, r: 20, t: 20, b: 50 },
                  xaxis: { title: { text: "Hour" } },
                  yaxis: { title: { text: "Clicks" }, rangemode: "tozero" },
                  paper_bgcolor: "transparent",
                  plot_bgcolor: "transparent",
                }}
                style={{ width: "100%", height: "360px" }}
                config={{ displayModeBar: false }}
                useResizeHandler
              />
            )}
          </div>
          <div className="panel panel--surface">
            <h3 className="panel__title">Weekday × Hour Heatmap</h3>
            {!daypartStats ? (
              <p>尚無足夠資料。</p>
            ) : (
              <Plot
                data={daypartHeatmapData}
                layout={{
                  autosize: true,
                  margin: { l: 60, r: 20, t: 20, b: 50 },
                  paper_bgcolor: "transparent",
                  plot_bgcolor: "transparent",
                  xaxis: { title: { text: "Hour" } },
                  yaxis: { title: { text: "Weekday" } },
                }}
                style={{ width: "100%", height: "360px" }}
                config={{ displayModeBar: false }}
                useResizeHandler
              />
            )}
          </div>
        </div>
      </section>

      <section>
        <SectionTitle title="Content Attribution — Top Objects by Project" />
        <div className="panel panel--surface">
          {projectObjectAttribution.length === 0 ? (
            <p>尚無可顯示的物件歸因資料。</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>AR Object</th>
                    <th>Scene</th>
                    <th>Clicks</th>
                    <th>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {projectObjectAttribution.map((row) => (
                    <tr key={`${row.projectId}-${row.objId}`}>
                      <td>{row.projectName}</td>
                      <td>{row.objName}</td>
                      <td>{row.sceneName ?? "-"}</td>
                      <td>{row.clicks.toLocaleString()}</td>
                      <td>{formatPercent(row.shareWithinProject)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionTitle title="User Acquisition" />
        <div className="chart-grid">
          <div className="panel panel--surface">
            <h3 className="panel__title">最近 30 天（日）</h3>
            {acquisitionDailyData ? (
              <Plot
                data={acquisitionDailyData.data}
                layout={acquisitionDailyData.layout}
                style={{ width: "100%", height: "420px" }}
                config={{ displayModeBar: true }}
                useResizeHandler
              />
            ) : (
              <p>沒有足夠的互動資料可用來繪製最近 30 天趨勢。</p>
            )}
          </div>
          <div className="panel panel--surface">
            <h3 className="panel__title">全期間（月）</h3>
            {acquisitionMonthlyData ? (
              <Plot
                data={acquisitionMonthlyData.data}
                layout={acquisitionMonthlyData.layout}
                style={{ width: "100%", height: "420px" }}
                config={{ displayModeBar: true }}
                useResizeHandler
              />
            ) : (
              <p>沒有足夠的互動資料可用來繪製月度趨勢。</p>
            )}
          </div>
        </div>
      </section>

      <section>
        <SectionTitle title="活動新增用戶" />
        <div className="panel panel--surface">
          <h3 className="panel__title">活動新增用戶 ({dateRangeLabel})</h3>
          {projectUserAcquisition.length === 0 ? (
            <p>選定期間內沒有可顯示的用戶互動。</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>新增用戶</th>
                    <th>互動用戶</th>
                    <th>主要場景</th>
                  </tr>
                </thead>
                <tbody>
                  {projectUserAcquisition.map((row) => (
                    <tr key={row.projectId}>
                      <td>{row.name}</td>
                      <td>{row.newUsers.toLocaleString()}</td>
                      <td>{row.activeUsers.toLocaleString()}</td>
                      <td>
                        {row.topSceneName
                          ? `${row.topSceneName} (${row.topSceneNewUsers})`
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionTitle title="場景用戶統計" />
        <div className="panel panel--surface">
          <h3 className="panel__title">場景用戶統計 ({dateRangeLabel})</h3>
          {sceneUserStats.length === 0 ? (
            <p>選定期間內沒有可顯示的場景互動。</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Scene</th>
                    <th>新增用戶</th>
                    <th>互動用戶</th>
                    <th>關聯活動</th>
                  </tr>
                </thead>
                <tbody>
                  {sceneUserStats.slice(0, 50).map((row) => (
                    <tr key={row.sceneId}>
                      <td>{row.sceneName}</td>
                      <td>{row.newUsers.toLocaleString()}</td>
                      <td>{row.activeUsers.toLocaleString()}</td>
                      <td>
                        {row.projectNames.length
                          ? row.projectNames.join("、")
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sceneUserStats.length > 50 && (
                <p className="table-footnote">
                  僅顯示前 50 筆，可縮小日期或篩選帳號以查看更多資料。
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      <section>
        <SectionTitle title="Project Ranking (by Scan Count)" />
        <div className="panel panel--surface">
          <div className="table-wrapper">
            {rankedProjects.length === 0 ? (
              <p>目前沒有掃描紀錄的專案。</p>
            ) : (
              <>
                <table>
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Total</th>
                      <th>This Month</th>
                      <th>Last Month</th>
                      <th>This Week</th>
                      <th>Last Week</th>
                      <th>Today</th>
                      <th>Yesterday</th>
                      <th>Clicks (Total)</th>
                      <th>Unique Users</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedProjects.map((row) => {
                      const clickStats = projectClickStats.get(row.projectId);
                      const clickTotal = clickStats?.clicks ?? 0;
                      const userTotal = clickStats?.users ?? 0;
                      return (
                        <tr key={row.projectId}>
                          <td>{row.name}</td>
                          <td>{row.total.toLocaleString()}</td>
                          <td>{row.thisMonth.toLocaleString()}</td>
                          <td>{row.lastMonth.toLocaleString()}</td>
                          <td>{row.thisWeek.toLocaleString()}</td>
                          <td>{row.lastWeek.toLocaleString()}</td>
                          <td>{row.today.toLocaleString()}</td>
                          <td>{row.yesterday.toLocaleString()}</td>
                          <td>{clickTotal.toLocaleString()}</td>
                          <td>{userTotal.toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {totalCutoffLabel && (
                  <p className="table-footnote">
                    Total 欄位為專案自啟用至 {totalCutoffLabel} 的累積掃描次數。
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <section>
        <SectionTitle title="Object Interaction Ranking" />
        <div className="panel panel--surface">
          <h3 className="panel__title">Object Interaction Ranking ({dateRangeLabel})</h3>
          {clickRanking.length === 0 ? (
            <p>選定期間內沒有物件互動紀錄。</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>AR Object</th>
                    <th>Scene</th>
                    <th>Clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {clickRanking.map((item) => (
                    <tr key={item.objId}>
                      <td>{item.name}</td>
                      <td>{item.sceneName ?? "-"}</td>
                      <td>{item.count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

interface ProjectDetailPageProps {
  project: Project | null;
  projectOptions: Project[];
  selectedProjectId: number | null;
  onProjectChange: (projectId: number) => void;
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  summary: ReturnType<typeof computeScanSummary> | null;
  scansInRange: number;
  clicksInRange: number;
  uniqueUsersInRange: number;
  totalClicksAllTime: number;
  totalUsersAllTime: number;
  dailySeries: ReturnType<typeof computeDailyScanSeries>;
  dailyClickSeries: ReturnType<typeof computeDailyClickSeries>;
  scanVolumeDaily: ReturnType<typeof computeScanVolumeSeries>;
  scanVolumeMonthly: ReturnType<typeof computeScanVolumeMonthly>;
  userAcquisitionDaily: UserAcquisitionPoint[];
  userAcquisitionRangeSeries: UserAcquisitionPoint[];
  userAcquisitionMonthly: UserAcquisitionPoint[];
  clickRanking: ReturnType<typeof computeClickRanking>;
  sceneUserStats: SceneUserStatRow[];
  userSummary: ProjectUserAcquisitionRow | null;
  sessionAnalytics: ClickSessionAnalytics | null;
}

function ProjectDetailPage({
  project,
  projectOptions,
  selectedProjectId,
  onProjectChange,
  dateRange,
  setDateRange,
  summary,
  scansInRange,
  clicksInRange,
  uniqueUsersInRange,
  totalClicksAllTime,
  totalUsersAllTime,
  dailySeries,
  dailyClickSeries,
  scanVolumeDaily,
  scanVolumeMonthly,
  userAcquisitionDaily,
  userAcquisitionRangeSeries,
  userAcquisitionMonthly,
  clickRanking,
  sceneUserStats,
  userSummary,
  sessionAnalytics,
}: ProjectDetailPageProps) {
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [projectSearchTerm, setProjectSearchTerm] = useState("");
  const dateRangeLabel = `${format(dateRange.start, "yyyy-MM-dd")} ~ ${format(
    dateRange.end,
    "yyyy-MM-dd"
  )}`;
  const selectedProjectValue =
    selectedProjectId !== null ? String(selectedProjectId) : "";
  const projectName = project?.name ?? "未選擇專案";

  const totalScansAllTime = summary?.totalScans ?? 0;
  const scansToday = summary?.scansToday ?? 0;
  const scansYesterday = summary?.scansYesterday ?? 0;
  const newUsersRange = userSummary?.newUsers ?? 0;
  const activeUsersRange = userSummary?.activeUsers ?? 0;

  const scenesCount = project?.scenes.length ?? 0;
  const lightsCount = project?.lightIds.length ?? 0;

  const dailyHistogramData: Partial<Data>[] = [
    {
      type: "bar",
      x: dailySeries.map((point) => point.date.toISOString()),
      y: dailySeries.map((point) => point.total),
      marker: { color: "#1f77b4" },
      name: "Scans",
    },
  ];

  const scanVolumeDailyData: Partial<Data>[] = [
    {
      type: "bar",
      x: scanVolumeDaily.map((point) => point.date.toISOString()),
      y: scanVolumeDaily.map((point) => point.total),
      marker: { color: "#2ca02c" },
      name: "Scans",
    },
  ];

  const scanVolumeMonthlyData: Partial<Data>[] = [
    {
      type: "bar",
      x: scanVolumeMonthly.map((point) => point.month.toISOString()),
      y: scanVolumeMonthly.map((point) => point.total),
      marker: { color: "#17becf" },
      name: "Scans",
    },
  ];

  const acquisitionDailyData =
    userAcquisitionDaily.length > 0
      ? buildUserAcquisitionPlot(userAcquisitionDaily, {
          showRangeSlider: false,
          xTickFormat: "%m-%d",
        })
      : null;

  const acquisitionMonthlyData =
    userAcquisitionMonthly.length > 0
      ? buildUserAcquisitionPlot(userAcquisitionMonthly, {
          showRangeSlider: false,
          xTickFormat: "%Y-%m",
        })
      : null;

  const formatDateSafe = (value: Date | null) =>
    value ? format(value, "yyyy-MM-dd") : "-";

  const coordinatesText =
    project && project.coordinates.length > 0
      ? project.coordinates.join("、")
      : "-";
  const scenesText =
    project && project.scenes.length > 0 ? project.scenes.join("、") : "-";
  const lightText =
    project && project.lightIds.length > 0
      ? project.lightIds.map((id) => id.toString()).join("、")
      : "-";
  const latLonText =
    project && project.latLon
      ? `${project.latLon.lat.toFixed(6)}, ${project.latLon.lon.toFixed(6)}`
      : "-";

  const projectSelectOptions = useMemo(() => {
    const keyword = projectSearchTerm.trim().toLowerCase();
    let filtered = projectOptions;
    if (keyword) {
      filtered = projectOptions.filter((option) => {
        const idMatch = option.projectId.toString().includes(keyword);
        const nameMatch = option.name.toLowerCase().includes(keyword);
        return idMatch || nameMatch;
      });
    }
    if (
      selectedProjectId !== null &&
      !filtered.some((option) => option.projectId === selectedProjectId)
    ) {
      const current = projectOptions.find((option) => option.projectId === selectedProjectId);
      if (current) {
        return [current, ...filtered];
      }
    }
    return filtered;
  }, [projectOptions, projectSearchTerm, selectedProjectId]);

  const filterSection = (
    <section>
      <SectionTitle title="Project Filters" />
      <div className="panel panel--filters">
        <div>
          <label className="field-label">Project</label>
          <div className="project-filter__search">
            <input
              type="search"
              value={projectSearchTerm}
              onChange={(event) => setProjectSearchTerm(event.target.value)}
              placeholder="搜尋專案名稱或 ID"
            />
            {projectSearchTerm && (
              <button
                type="button"
                onClick={() => setProjectSearchTerm("")}
                aria-label="清除搜尋"
              >
                清除
              </button>
            )}
          </div>
          <select
            value={selectedProjectValue}
            onChange={(event) => {
              const nextId = Number(event.target.value);
              if (!Number.isNaN(nextId)) {
                onProjectChange(nextId);
              }
            }}
            disabled={projectOptions.length === 0}
          >
            {projectSelectOptions.map((option) => {
              const label = option.name || `Project ${option.projectId}`;
              return (
                <option key={option.projectId} value={option.projectId}>
                  {`(#${option.projectId}) ${label}`}
                </option>
              );
            })}
          </select>
          {projectOptions.length === 0 && (
            <p className="field-hint">無符合條件的專案。</p>
          )}
        </div>
        <div>
          <label className="field-label">Start Date</label>
          <input
            type="date"
            value={format(dateRange.start, "yyyy-MM-dd")}
            max={format(dateRange.end, "yyyy-MM-dd")}
            onChange={(event) => {
              const next = new Date(`${event.target.value}T00:00:00`);
              if (!isNaN(next.getTime())) {
                setDateRange({ ...dateRange, start: next });
              }
            }}
          />
        </div>
        <div>
          <label className="field-label">End Date</label>
          <input
            type="date"
            value={format(dateRange.end, "yyyy-MM-dd")}
            min={format(dateRange.start, "yyyy-MM-dd")}
            onChange={(event) => {
              const next = new Date(`${event.target.value}T23:59:59`);
              if (!isNaN(next.getTime())) {
                setDateRange({ ...dateRange, end: next });
              }
            }}
          />
        </div>
      </div>
    </section>
  );

  const projectDetailsSection = (
    <section>
      <SectionTitle title="Project Details" />
      <div className="panel panel--surface">
        {project ? (
          <div className="project-meta">
            <div className="project-meta__item">
              <span className="project-meta__label">Project ID</span>
              <span className="project-meta__value">
                {project.projectId}
              </span>
            </div>
            <div className="project-meta__item">
              <span className="project-meta__label">Start Date</span>
              <span className="project-meta__value">
                {formatDateSafe(project.startDate)}
              </span>
            </div>
            <div className="project-meta__item">
              <span className="project-meta__label">End Date</span>
              <span className="project-meta__value">
                {formatDateSafe(project.endDate)}
              </span>
            </div>
            <div className="project-meta__item">
              <span className="project-meta__label">Scenes</span>
              <span className="project-meta__value">
                {scenesCount.toLocaleString()}
              </span>
            </div>
            <div className="project-meta__item">
              <span className="project-meta__label">Lights</span>
              <span className="project-meta__value">
                {lightsCount.toLocaleString()}
              </span>
            </div>
            <div className="project-meta__item">
              <span className="project-meta__label">Coordinates</span>
              <span className="project-meta__value">{coordinatesText}</span>
            </div>
            <div className="project-meta__item">
              <span className="project-meta__label">Scenes (List)</span>
              <span className="project-meta__value">{scenesText}</span>
            </div>
            <div className="project-meta__item">
              <span className="project-meta__label">Light IDs</span>
              <span className="project-meta__value">{lightText}</span>
            </div>
            <div className="project-meta__item">
              <span className="project-meta__label">Latitude / Longitude</span>
              <span className="project-meta__value">{latLonText}</span>
            </div>
          </div>
        ) : (
          <p>請先選擇專案以檢視詳細資料。</p>
        )}
      </div>
    </section>
  );

  if (!project) {
    return (
      <>
        {projectDetailsSection}
        {filterSection}
        <section>
          <div className="panel panel--surface">
            <p>請先選擇專案以使用分析工具。</p>
          </div>
        </section>
      </>
    );
  }

  const handleDownloadReport = async () => {
    try {
      setIsGeneratingReport(true);
      await generateProjectReportPdf({
        project,
        dateRangeLabel,
        scansInRange,
        clicksInRange,
        uniqueUsersInRange,
        dailyScanSeries: dailySeries,
        dailyClickSeries,
        clickRanking,
        userAcquisitionSeries: userAcquisitionRangeSeries,
      });
    } catch (error) {
      console.error("Failed to export PDF report", error);
      window.alert("匯出 PDF 失敗，請確認字型檔是否存在後再試一次。");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  return (
    <>
      {projectDetailsSection}
      {filterSection}

      <section>
        <div className="section-header">
          <SectionTitle title={`Project Overview — ${projectName}`} />
          <button
            type="button"
            className="report-button"
            onClick={handleDownloadReport}
            disabled={isGeneratingReport}
          >
            {isGeneratingReport ? "產生中…" : "匯出 PDF 報告"}
          </button>
        </div>
        <div className="metric-overview">
          <div className="metric-overview__group">
            <div className="metric-overview__title">Scans</div>
            <div className="metric-overview__grid">
              <MetricCard title={`Scans (${dateRangeLabel})`} value={scansInRange} />
              <MetricCard title="Scans（全期間）" value={totalScansAllTime} />
            </div>
            <div className="metric-grid metric-grid--secondary">
              <MetricCard title="Scans Today" value={scansToday} />
              <MetricCard title="Scans Yesterday" value={scansYesterday} />
              <MetricCard value={summary?.scansThisWeek ?? 0} title="Scans This Week" />
              <MetricCard value={summary?.scansLastWeek ?? 0} title="Scans Last Week" />
              <MetricCard value={summary?.scansThisMonth ?? 0} title="Scans This Month" />
              <MetricCard value={summary?.scansLastMonth ?? 0} title="Scans Last Month" />
            </div>
          </div>
          <div className="metric-overview__group">
            <div className="metric-overview__title">Clicks</div>
            <div className="metric-overview__grid">
              <MetricCard title={`Clicks (${dateRangeLabel})`} value={clicksInRange} />
              <MetricCard title="Clicks（全期間）" value={totalClicksAllTime} />
            </div>
          </div>
          <div className="metric-overview__group">
            <div className="metric-overview__title">Users</div>
            <div className="metric-overview__grid">
              <MetricCard
                title={`Unique Users (${dateRangeLabel})`}
                value={uniqueUsersInRange}
              />
              <MetricCard title="Unique Users（全期間）" value={totalUsersAllTime} />
            </div>
            <div className="metric-grid metric-grid--secondary">
              <MetricCard title={`New Users (${dateRangeLabel})`} value={newUsersRange} />
              <MetricCard
                title={`Active Users (${dateRangeLabel})`}
                value={activeUsersRange}
              />
            </div>
          </div>
        </div>
      </section>

      <section>
        <SectionTitle title="Scan Analytics" />
        <div className="chart-grid">
          <div className="panel panel--surface">
            <h3 className="panel__title">Daily Scan Trend ({dateRangeLabel})</h3>
            <Plot
              data={dailyHistogramData}
              layout={{
                autosize: true,
                margin: { l: 60, r: 20, t: 20, b: 50 },
                xaxis: {
                  title: { text: "Date" },
                  type: "date",
                  tickformat: "%Y-%m-%d",
                },
                yaxis: { title: { text: "Scans" }, rangemode: "tozero" },
                paper_bgcolor: "transparent",
                plot_bgcolor: "transparent",
              }}
              style={{ width: "100%", height: "360px" }}
              useResizeHandler
              config={{ displayModeBar: false }}
            />
          </div>
          <div className="panel panel--surface">
            <h3 className="panel__title">最近 30 天（日）</h3>
            {scanVolumeDaily.length > 0 ? (
              <Plot
                data={scanVolumeDailyData}
                layout={{
                  autosize: true,
                  margin: { l: 60, r: 20, t: 20, b: 50 },
                  xaxis: {
                    title: { text: "Date" },
                    type: "date",
                    tickformat: "%m-%d",
                  },
                  yaxis: { title: { text: "Scans" }, rangemode: "tozero" },
                  paper_bgcolor: "transparent",
                  plot_bgcolor: "transparent",
                }}
                style={{ width: "100%", height: "360px" }}
                useResizeHandler
                config={{ displayModeBar: false }}
              />
            ) : (
              <p>沒有足夠的掃描資料。</p>
            )}
          </div>
          <div className="panel panel--surface">
            <h3 className="panel__title">近 12 個月（月）</h3>
            {scanVolumeMonthly.length > 0 ? (
              <Plot
                data={scanVolumeMonthlyData}
                layout={{
                  autosize: true,
                  margin: { l: 60, r: 20, t: 20, b: 50 },
                  xaxis: {
                    title: { text: "Month" },
                    type: "date",
                    tickformat: "%Y-%m",
                  },
                  yaxis: { title: { text: "Scans" }, rangemode: "tozero" },
                  paper_bgcolor: "transparent",
                  plot_bgcolor: "transparent",
                }}
                style={{ width: "100%", height: "360px" }}
                useResizeHandler
                config={{ displayModeBar: false }}
              />
            ) : (
              <p>沒有足夠的掃描資料。</p>
            )}
          </div>
        </div>
      </section>

      <section>
        <SectionTitle title="User Acquisition" />
        <div className="chart-grid">
          <div className="panel panel--surface">
            <h3 className="panel__title">最近 30 天（日）</h3>
            {acquisitionDailyData ? (
              <Plot
                data={acquisitionDailyData.data}
                layout={acquisitionDailyData.layout}
                style={{ width: "100%", height: "420px" }}
                config={{ displayModeBar: true }}
                useResizeHandler
              />
            ) : (
              <p>沒有足夠的互動資料可用來繪製最近 30 天趨勢。</p>
            )}
          </div>
          <div className="panel panel--surface">
            <h3 className="panel__title">全期間（月）</h3>
            {acquisitionMonthlyData ? (
              <Plot
                data={acquisitionMonthlyData.data}
                layout={acquisitionMonthlyData.layout}
                style={{ width: "100%", height: "420px" }}
                config={{ displayModeBar: true }}
                useResizeHandler
              />
            ) : (
              <p>沒有足夠的互動資料可用來繪製月度趨勢。</p>
            )}
          </div>
        </div>
      </section>

      <SessionIntelligenceSection sessionAnalytics={sessionAnalytics} />

      <section>
        <SectionTitle title="Interactions & Scenes" />
        <div className="panel panel--surface">
          <h3 className="panel__title">Object Interaction Ranking ({dateRangeLabel})</h3>
          {clickRanking.length === 0 ? (
            <p>選定期間內沒有物件互動紀錄。</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>AR Object</th>
                    <th>Scene</th>
                    <th>Clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {clickRanking.map((item) => (
                    <tr key={item.objId}>
                      <td>{item.name}</td>
                      <td>{item.sceneName ?? "-"}</td>
                      <td>{item.count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="panel panel--surface">
          <h3 className="panel__title">Scene User Stats ({dateRangeLabel})</h3>
          {sceneUserStats.length === 0 ? (
            <p>選定期間內沒有可顯示的場景互動。</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Scene</th>
                    <th>新增用戶</th>
                    <th>互動用戶</th>
                  </tr>
                </thead>
                <tbody>
                  {sceneUserStats.slice(0, 30).map((row) => (
                    <tr key={row.sceneId}>
                      <td>{row.sceneName}</td>
                      <td>{row.newUsers.toLocaleString()}</td>
                      <td>{row.activeUsers.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sceneUserStats.length > 30 && (
                <p className="field-hint">
                  僅顯示前 30 筆，可縮小日期或篩選帳號以查看更多資料。
                </p>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function SessionIntelligenceSection({
  sessionAnalytics,
}: {
  sessionAnalytics: ClickSessionAnalytics | null;
}) {
  const sessionInsights = sessionAnalytics?.insights ?? null;
  const sessionSamples = sessionAnalytics ? sessionAnalytics.sessions.slice(0, 8) : [];

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (!Number.isFinite(mins)) return "-";
    return `${mins}m ${secs.toString().padStart(2, "0")}s`;
  };

  const buildPathPreview = (steps: ClickSessionRecord["steps"]) => {
    if (!steps || steps.length === 0) return "-";
    const names = steps.slice(0, 5).map((step) => step.name);
    return `${names.join(" → ")}${steps.length > 5 ? " …" : ""}`;
  };

  return (
    <section>
      <SectionTitle title="Marketing Insights — Session Intelligence" />
      <div className="panel panel--surface">
        {sessionInsights ? (
          <>
            <div className="metric-grid marketing-metrics">
              <div className="metric-card">
                <div className="metric-card__title">Total Sessions</div>
                <div className="metric-card__value">
                  {sessionInsights.totalSessions.toLocaleString()}
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-card__title">Avg Duration</div>
                <div className="metric-card__value">
                  {formatDuration(sessionInsights.avgDurationSeconds)}
                </div>
              </div>
              <div className="metric-card">
                <div className="metric-card__title">Median Duration</div>
                <div className="metric-card__value">
                  {formatDuration(sessionInsights.medianDurationSeconds)}
                </div>
              </div>
            </div>
            <div className="marketing-grid marketing-grid--session">
              <div className="marketing-column">
                <h4>Top Entry Objects</h4>
                {sessionInsights.topEntryObjects.length === 0 ? (
                  <p>尚無足夠資料。</p>
                ) : (
                  <div className="table-wrapper table-wrapper--compact">
                    <table className="table-compact">
                      <thead>
                        <tr>
                          <th>Object</th>
                          <th>Sessions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessionInsights.topEntryObjects.map((item) => (
                          <tr key={`entry-${item.objId}`}>
                            <td>{item.name}</td>
                            <td>{item.count.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="marketing-column">
                <h4>Top Exit Objects</h4>
                {sessionInsights.topExitObjects.length === 0 ? (
                  <p>尚無足夠資料。</p>
                ) : (
                  <div className="table-wrapper table-wrapper--compact">
                    <table className="table-compact">
                      <thead>
                        <tr>
                          <th>Object</th>
                          <th>Sessions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessionInsights.topExitObjects.map((item) => (
                          <tr key={`exit-${item.objId}`}>
                            <td>{item.name}</td>
                            <td>{item.count.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="marketing-column marketing-column--wide">
                <h4>Top Transitions</h4>
                {sessionInsights.topTransitions.length === 0 ? (
                  <p>尚無轉換資料。</p>
                ) : (
                  <div className="table-wrapper table-wrapper--compact">
                    <table className="table-compact">
                      <thead>
                        <tr>
                          <th>From → To</th>
                          <th>Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessionInsights.topTransitions.map((item) => (
                          <tr key={`${item.fromId}-${item.toId}`}>
                            <td>
                              {item.fromName} → {item.toName}
                            </td>
                            <td>{item.count.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="marketing-column marketing-column--wide">
                <h4>Common Paths</h4>
                {sessionInsights.topPaths.length === 0 ? (
                  <p>尚無常見路徑資料。</p>
                ) : (
                  <div className="table-wrapper table-wrapper--compact">
                    <table className="table-compact">
                      <thead>
                        <tr>
                          <th>Path</th>
                          <th>Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessionInsights.topPaths.map((item, index) => (
                          <tr key={`path-${index}`}>
                            <td>{item.path.join(" → ")}</td>
                            <td>{item.count.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            <div className="marketing-sessions">
              <h4>近期 Session 範例</h4>
              {sessionSamples.length === 0 ? (
                <p>尚無 Session 範例。</p>
              ) : (
                <div className="table-wrapper table-wrapper--compact">
                  <table className="table-compact marketing-sessions__table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Start Time</th>
                        <th>Duration</th>
                        <th>Clicks</th>
                        <th>First Hit</th>
                        <th>Last Touch</th>
                        <th>Path (≤5 steps)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessionSamples.map((session) => (
                        <tr key={session.id}>
                          <td>{session.userId || "-"}</td>
                          <td>{format(session.start, "MM-dd HH:mm")}</td>
                          <td>{formatDuration(session.durationSeconds)}</td>
                          <td>{session.clickCount}</td>
                          <td>{session.firstStep?.name ?? "-"}</td>
                          <td>{session.lastStep?.name ?? "-"}</td>
                          <td className="marketing-sessions__path">
                            {buildPathPreview(session.steps)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : (
          <p>暫無足夠的點擊資料可供行銷分析。</p>
        )}
      </div>
    </section>
  );
}

interface BigScreenPageProps {
  scopedData: DashboardData;
  summary: ReturnType<typeof computeScanSummary>;
  projectRankRows: ProjectRankRow[];
  userAcquisitionMonthly: UserAcquisitionPoint[];
}

function BigScreenPage({
  scopedData,
  summary,
  projectRankRows,
  userAcquisitionMonthly,
}: BigScreenPageProps) {
  const last30Data = useMemo(() => {
    const rangeEnd = endOfDay(new Date());
    const rangeStart = startOfDay(subDays(rangeEnd, 29));
    const scanSeries = computeDailyScanSeries(scopedData, rangeStart, rangeEnd);
    const clickSeries = computeDailyClickSeries(scopedData, rangeStart, rangeEnd);
    const projectUserRows = computeProjectUserAcquisition(
      scopedData,
      rangeStart,
      rangeEnd
    );
    const ranking = computeClickRanking(scopedData, rangeStart, rangeEnd, 10);
    return {
      rangeStart,
      rangeEnd,
      scanSeries,
      clickSeries,
      projectUserRows,
      ranking,
    };
  }, [scopedData]);

  const monthlyScans = useMemo(
    () => computeScanVolumeMonthly(scopedData, 12),
    [scopedData]
  );

  const monthlyClicks = useMemo(() => buildMonthlyClickSeries(scopedData), [scopedData]);

  const userEngagementMonthly = useMemo(() => {
    if (userAcquisitionMonthly.length === 0) return [];
    const end = endOfMonth(new Date());
    const start = startOfMonth(subMonths(end, 11));
    return userAcquisitionMonthly
      .filter((item) => item.date >= start && item.date <= end)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [userAcquisitionMonthly]);

  const projectNewUserMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const row of last30Data.projectUserRows) {
      map.set(row.projectId, row.newUsers);
    }
    return map;
  }, [last30Data.projectUserRows]);

  const projectAnalysisRows = useMemo(
    () =>
      projectRankRows.slice(0, 8).map((row) => ({
        name: row.name,
        total: row.total,
        newUsers: projectNewUserMap.get(row.projectId) ?? 0,
        month: row.thisMonth,
        week: row.thisWeek,
        day: row.today,
      })),
    [projectRankRows, projectNewUserMap]
  );

  const {
    heatmapPoints,
    topObjectRows,
  } = useMemo(() => buildClickGeoData(scopedData, last30Data.ranking), [scopedData, last30Data.ranking]);

  const keyMetrics = [
    { label: "Total Scans", value: summary.totalScans },
    { label: "Total Clicks", value: scopedData.clicks.length },
    { label: "Unique Users", value: summary.uniqueUsers },
    { label: "Active Projects", value: summary.activeProjects },
  ];

  const thirtyDayRangeLabel = `${format(last30Data.rangeStart, "MM-dd")} ~ ${format(
    last30Data.rangeEnd,
    "MM-dd"
  )}`;

  const thirtyDayTrendData: Partial<Data>[] = [
    {
      type: "scatter",
      mode: "lines+markers",
      name: "Scans",
      x: last30Data.scanSeries.map((point) => point.date.toISOString()),
      y: last30Data.scanSeries.map((point) => point.total),
      line: { color: "#4f9ac3", width: 3 },
    },
    {
      type: "scatter",
      mode: "lines+markers",
      name: "Clicks",
      x: last30Data.clickSeries.map((point) => point.date.toISOString()),
      y: last30Data.clickSeries.map((point) => point.total),
      line: { color: "#ff7f0e", width: 3 },
    },
  ];

  const monthlyLabels = monthlyScans.map((point) => format(point.month, "yyyy-MM"));

  const monthlyTrendData: Partial<Data>[] = [
    {
      type: "bar",
      name: "Scans",
      x: monthlyLabels,
      y: monthlyScans.map((point) => point.total),
      marker: { color: "#4f9ac3" },
    },
    {
      type: "bar",
      name: "Clicks",
      x: monthlyLabels,
      y: monthlyClicks.map((point) => point.total),
      marker: { color: "#ff7f0e" },
    },
  ];

  const userEngagementData: Partial<Data>[] = [
    {
      type: "bar",
      name: "New Users",
      x: userEngagementMonthly.map((point) => format(point.date, "yyyy-MM")),
      y: userEngagementMonthly.map((point) => point.newUsers),
      marker: { color: "#a855f7" },
    },
    {
      type: "bar",
      name: "Returning Users",
      x: userEngagementMonthly.map((point) => format(point.date, "yyyy-MM")),
      y: userEngagementMonthly.map((point) => point.returningUsers),
      marker: { color: "#67e8f9" },
    },
  ];

  const totalClicksForScale = Math.max(...heatmapPoints.map((point) => point.clicks), 1);

  const heatmapData: Partial<Data>[] = [
    {
      type: "scattergeo",
      mode: "markers",
      lat: heatmapPoints.map((point) => point.lat),
      lon: heatmapPoints.map((point) => point.lon),
      text: heatmapPoints.map(
        (point) => `${point.name}<br />Clicks: ${point.clicks.toLocaleString()}`
      ),
      marker: {
        size: heatmapPoints.map((point) =>
          Math.max(6, Math.sqrt(point.clicks / totalClicksForScale) * 40)
        ),
        color: heatmapPoints.map((point) => point.clicks),
        colorscale: "YlOrRd",
        showscale: heatmapPoints.length > 0,
        colorbar: { title: { text: "Clicks" } },
        opacity: 0.85,
      },
    },
  ];

  return (
    <div className="big-screen-wrapper">
      <div className="big-screen-frame">
        <section className="big-screen">
          <div className="big-screen__metrics">
            {keyMetrics.map((metric) => (
              <div key={metric.label} className="big-card">
                <div className="big-card__label">{metric.label}</div>
                <div className="big-card__value">{metric.value.toLocaleString()}</div>
              </div>
            ))}
          </div>

          <div className="big-screen__body">
            <div className="big-screen__column-left">
              <div className="big-panel">
                <div className="big-panel__title">Last 30 Days — Scans vs Clicks ({thirtyDayRangeLabel})</div>
                <Plot
                  data={thirtyDayTrendData}
                  layout={{
                    autosize: true,
                    height: 220,
                    margin: { l: 60, r: 20, t: 10, b: 40 },
                    xaxis: { type: "date" },
                    yaxis: { title: { text: "Volume" }, rangemode: "tozero" },
                    paper_bgcolor: "transparent",
                    plot_bgcolor: "transparent",
                    legend: { orientation: "h" },
                  }}
                  style={{ width: "100%", height: "100%" }}
                  config={{ displayModeBar: false }}
                  useResizeHandler
                />
              </div>

              <div className="big-panel">
                <div className="big-panel__title">Last 12 Months — Scans & Clicks</div>
                <Plot
                  data={monthlyTrendData}
                  layout={{
                    autosize: true,
                    barmode: "group",
                    height: 190,
                    margin: { l: 60, r: 20, t: 10, b: 40 },
                    paper_bgcolor: "transparent",
                    plot_bgcolor: "transparent",
                    legend: { orientation: "h" },
                  }}
                  style={{ width: "100%", height: "100%" }}
                  config={{ displayModeBar: false }}
                  useResizeHandler
                />
              </div>

              <div className="big-panel">
                <div className="big-panel__title">User Engagement — Last 12 Months</div>
                {userEngagementMonthly.length === 0 ? (
                  <p>暫無可顯示的用戶參與資料。</p>
                ) : (
                  <Plot
                    data={userEngagementData}
                    layout={{
                      autosize: true,
                      barmode: "stack",
                      height: 190,
                      margin: { l: 60, r: 20, t: 10, b: 40 },
                      paper_bgcolor: "transparent",
                      plot_bgcolor: "transparent",
                      legend: { orientation: "h" },
                    }}
                    style={{ width: "100%", height: "100%" }}
                    config={{ displayModeBar: false }}
                    useResizeHandler
                  />
                )}
              </div>
            </div>

            <div className="big-screen__column-center">
              <div className="big-panel big-panel--map">
                <div className="big-panel__title">Global Click Density</div>
                {heatmapPoints.length === 0 ? (
                  <p>尚無足夠的地理資訊用於點擊熱力圖。</p>
                ) : (
                  <Plot
                    data={heatmapData}
                    layout={{
                      autosize: true,
                      height: 540,
                      margin: { l: 0, r: 0, t: 0, b: 0 },
                      paper_bgcolor: "transparent",
                      plot_bgcolor: "transparent",
                      geo: {
                        scope: "world",
                        showland: true,
                        landcolor: "#f7f7f7",
                        bgcolor: "rgba(0,0,0,0)",
                        projection: { type: "natural earth" },
                        showcountries: true,
                        countrycolor: "#bcbcbc",
                      },
                    }}
                    style={{ width: "100%", height: "100%" }}
                    config={{ displayModeBar: false }}
                    useResizeHandler
                  />
                )}
              </div>
            </div>

            <div className="big-screen__column-right">
              <div className="big-panel">
                <div className="big-panel__title">Project Focus</div>
                <div className="table-wrapper">
                  <table>
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Total Scans</th>
                    <th>New Users (30d)</th>
                    <th>Months</th>
                    <th>Weeks</th>
                    <th>Days</th>
                  </tr>
                </thead>
                <tbody>
                  {projectAnalysisRows.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td>{row.total.toLocaleString()}</td>
                      <td>{row.newUsers.toLocaleString()}</td>
                      <td>{row.month.toLocaleString()}</td>
                      <td>{row.week.toLocaleString()}</td>
                      <td>{row.day.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="big-panel">
            <div className="big-panel__title">Top 10 Clicked AR Objects (30d)</div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>AR Object</th>
                    <th>Project</th>
                    <th>Clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {topObjectRows.map((row) => (
                    <tr key={row.objId}>
                      <td>{row.name}</td>
                      <td>{row.projectNames || "-"}</td>
                      <td>{row.count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </div>
          </div>
        </div>
        </section>
      </div>
    </div>
  );
}

interface ProjectFormState {
  id?: string;
  projectId: string;
  projectName: string;
  startDate: string;
  endDate: string;
  coordinates: string[];
  lightIds: string[];
  scenes: string[];
  isActive: boolean;
  latLon: string;
  ownerEmails: string[];
}

const initialProjectForm: ProjectFormState = {
  projectId: "",
  projectName: "",
  startDate: "",
  endDate: "",
  coordinates: [],
  lightIds: [],
  scenes: [],
  isActive: false,
  latLon: "",
  ownerEmails: [],
};

interface SelectOption {
  value: string;
  label: string;
}

const SETTINGS_PAGE_SIZE = 10;

function toProjectIdNumber(value: string): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function sortAirtableProjects(items: AirtableProject[]): AirtableProject[] {
  return [...items].sort((a, b) => {
    const diff = toProjectIdNumber(a.projectId) - toProjectIdNumber(b.projectId);
    if (diff !== 0) return diff;
    return a.projectName.localeCompare(b.projectName, undefined, { sensitivity: "base" });
  });
}

function SettingsPage({
  ownerOptions,
  onNavigateHome,
}: {
  ownerOptions: string[];
  onNavigateHome: () => void;
}) {
  const [projects, setProjects] = useState<AirtableProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [formState, setFormState] = useState<ProjectFormState>(initialProjectForm);
  const [saving, setSaving] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [projectSearchTerm, setProjectSearchTerm] = useState("");

  const [ligToken, setLigToken] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("lig_token") ?? "";
  });
  const [tokenInput, setTokenInput] = useState(ligToken);
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [loggingIn, setLoggingIn] = useState(false);
  const [ligError, setLigError] = useState<string | null>(null);

  const [lightOptions, setLightOptions] = useState<SelectOption[]>([]);
  const [sceneOptions, setSceneOptions] = useState<SelectOption[]>([]);
  const [coordinateOptions, setCoordinateOptions] = useState<SelectOption[]>([]);
  const [loadingLightOptions, setLoadingLightOptions] = useState(false);
  const [loadingSceneOptions, setLoadingSceneOptions] = useState(false);
  const [loadingCoordinateOptions, setLoadingCoordinateOptions] = useState(false);
  const [ownerEmailInput, setOwnerEmailInput] = useState("");
  const [lightSearchInput, setLightSearchInput] = useState("");
  const [sceneSearchInput, setSceneSearchInput] = useState("");
  const [customOwnerEmails, setCustomOwnerEmails] = useState<string[]>([]);
  const [scenePages, setScenePages] = useState<SceneDetail[]>([]);
  const [coordinatePages, setCoordinatePages] = useState<CoordinateSystemDetail[]>([]);
  const [scenePageIndex, setScenePageIndex] = useState(0);
  const [coordinatePageIndex, setCoordinatePageIndex] = useState(0);
  const [loadingScenes, setLoadingScenes] = useState(false);
  const [loadingCoordinates, setLoadingCoordinates] = useState(false);
  const [isSyncingData, setIsSyncingData] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const sortedProjects = useMemo(() => sortAirtableProjects(projects), [projects]);
  const selectedProject = useMemo(
    () => sortedProjects.find((project) => project.id === selectedProjectId) ?? null,
    [sortedProjects, selectedProjectId]
  );

  const visibleScenes = useMemo(
    () => getPagedData(scenePages, scenePageIndex, SETTINGS_PAGE_SIZE),
    [scenePages, scenePageIndex]
  );
  const visibleCoordinates = useMemo(
    () => getPagedData(coordinatePages, coordinatePageIndex, SETTINGS_PAGE_SIZE),
    [coordinatePages, coordinatePageIndex]
  );

  useEffect(() => {
    const maxIndex = Math.max(Math.ceil(scenePages.length / SETTINGS_PAGE_SIZE) - 1, 0);
    setScenePageIndex((prev) => Math.min(prev, maxIndex));
  }, [scenePages.length]);

  useEffect(() => {
    const maxIndex = Math.max(Math.ceil(coordinatePages.length / SETTINGS_PAGE_SIZE) - 1, 0);
    setCoordinatePageIndex((prev) => Math.min(prev, maxIndex));
  }, [coordinatePages.length]);

  useEffect(() => {
    if (sortedProjects.length === 0) {
      if (selectedProjectId) {
        setSelectedProjectId("");
      }
      return;
    }
    const exists = sortedProjects.some((project) => project.id === selectedProjectId);
    if (!exists) {
      setSelectedProjectId(sortedProjects[0].id);
    }
  }, [sortedProjects, selectedProjectId]);

  useEffect(() => {
    if (formState.id) return;
    if (formState.projectId.trim()) return;
    setFormState((prev) => ({
      ...prev,
      projectId: computeNextProjectId(sortedProjects),
    }));
  }, [sortedProjects, formState.id, formState.projectId]);

  const sceneTotalPages = Math.ceil(scenePages.length / SETTINGS_PAGE_SIZE);
  const coordinateTotalPages = Math.ceil(coordinatePages.length / SETTINGS_PAGE_SIZE);

  const projectSelectOptions = useMemo(() => {
    const keyword = projectSearchTerm.trim().toLowerCase();
    let filtered = sortedProjects;
    if (keyword) {
      filtered = sortedProjects.filter((project) => {
        const idMatch = project.projectId.toLowerCase().includes(keyword);
        const nameMatch = project.projectName.toLowerCase().includes(keyword);
        return idMatch || nameMatch;
      });
    }
    if (selectedProjectId && !filtered.some((project) => project.id === selectedProjectId)) {
      const current = sortedProjects.find((project) => project.id === selectedProjectId);
      if (current) {
        return [current, ...filtered];
      }
    }
    return filtered;
  }, [sortedProjects, projectSearchTerm, selectedProjectId]);

  const ownerEmailOptions = useMemo(() => {
    const set = new Set<string>();
    ownerOptions.forEach((email) => set.add(email));
    customOwnerEmails.forEach((email) => set.add(email));
    formState.ownerEmails.forEach((email) => set.add(email));
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [ownerOptions, customOwnerEmails, formState.ownerEmails]);

  const selectedLightItems = useMemo(() => {
    const map = new Map(lightOptions.map((option) => [option.value, option.label]));
    return formState.lightIds.map((lightId) => ({
      value: lightId,
      label: map.get(lightId) ?? lightId,
    }));
  }, [formState.lightIds, lightOptions]);

  const selectedSceneItems = useMemo(() => {
    const map = new Map(sceneOptions.map((option) => [option.value, option.label]));
    return formState.scenes.map((sceneId) => ({
      value: sceneId,
      label: map.get(sceneId) ?? sceneId,
    }));
  }, [formState.scenes, sceneOptions]);

  const airtableConfigured =
    Boolean(import.meta.env.VITE_AIRTABLE_PAT) &&
    Boolean(import.meta.env.VITE_AIRTABLE_BASE_ID) &&
    Boolean(import.meta.env.VITE_AIRTABLE_EVENTS_TABLE);
  const lightDatalistId = "settings-light-options";
  const sceneDatalistId = "settings-scene-options";

  useEffect(() => {
    if (!airtableConfigured) return;
    void loadProjects();
  }, [airtableConfigured]);

  useEffect(() => {
    setTokenInput(ligToken);
    if (ligToken) {
      localStorage.setItem("lig_token", ligToken);
    } else {
      localStorage.removeItem("lig_token");
    }
    void loadReferenceData(ligToken);
  }, [ligToken]);

  useEffect(() => {
    let cancelled = false;

    async function loadCoordinates() {
      if (formState.lightIds.length === 0) {
        setCoordinateOptions((prev) =>
          mergeOptions(prev, formState.coordinates.map((value) => ({ value, label: value })))
        );
        return;
      }

      setLoadingCoordinateOptions(true);
      try {
        const aggregated = new Map<string, SelectOption>();
        for (const lightId of formState.lightIds) {
          const list = await fetchCoordinatesForLight(lightId, ligToken || undefined);
          list.forEach((coord) => {
            const value = `${coord.id}-${coord.name}`;
            aggregated.set(value, { value, label: value });
          });
        }
        formState.coordinates.forEach((value) => {
          if (!aggregated.has(value)) aggregated.set(value, { value, label: value });
        });
        if (!cancelled) {
          setCoordinateOptions(Array.from(aggregated.values()));
          const allowed = new Set(aggregated.keys());
          setFormState((prev) => {
            const filtered = prev.coordinates.filter((value) => allowed.has(value));
            if (filtered.length === prev.coordinates.length) return prev;
            return { ...prev, coordinates: filtered };
          });
        }
      } catch (error) {
        if (!cancelled) {
          setLigError(error instanceof Error ? error.message : String(error));
          setCoordinateOptions((prev) =>
            mergeOptions(prev, formState.coordinates.map((value) => ({ value, label: value })))
          );
        }
      } finally {
        if (!cancelled) setLoadingCoordinateOptions(false);
      }
    }

    void loadCoordinates();
    return () => {
      cancelled = true;
    };
  }, [ligToken, formState.lightIds.join(","), formState.coordinates.join("|")]);

  async function loadProjects(): Promise<AirtableProject[] | undefined> {
    try {
      setLoadingProjects(true);
      setProjectsError(null);
      const list = await fetchAirtableProjects();
      const sorted = sortAirtableProjects(list);
      setProjects(sorted);
      return sorted;
    } catch (error) {
      setProjectsError(
        error instanceof Error ? error.message : "讀取專案資料失敗"
      );
      return undefined;
    } finally {
      setLoadingProjects(false);
    }
  }

  async function loadReferenceData(token: string) {
    setLigError(null);
    setLoadingLightOptions(true);
    setLoadingSceneOptions(true);
    if (token) {
      setLoadingScenes(true);
      setLoadingCoordinates(true);
    } else {
      setScenePages([]);
      setCoordinatePages([]);
      setScenePageIndex(0);
      setCoordinatePageIndex(0);
    }
    try {
      const [lights, scenes, scenesMeta, coordinateMeta] = await Promise.all([
        fetchLightOptions(token || undefined),
        fetchSceneOptions(token || undefined),
        token ? fetchScenesWithMeta(token) : Promise.resolve([]),
        token ? fetchCoordinateSystemsWithMeta(token) : Promise.resolve([]),
      ]);
      setLightOptions((prev) =>
        mergeOptions(
          prev,
          lights.map((item) => ({ value: item.id, label: item.label }))
        )
      );
      setSceneOptions((prev) =>
        mergeOptions(
          prev,
          scenes.map((item) => {
            const value = `${item.id}-${item.name}`;
            return { value, label: value };
          })
        )
      );
      if (token) {
        const sortedScenes = sortByDescendingId(scenesMeta);
        const sortedCoords = sortByDescendingId(coordinateMeta);
        setScenePages(sortedScenes);
        setCoordinatePages(sortedCoords);
        setScenePageIndex(0);
        setCoordinatePageIndex(0);
      } else {
        setScenePages([]);
        setCoordinatePages([]);
      }
    } catch (error) {
      setLigError(error instanceof Error ? error.message : String(error));
      setScenePages([]);
      setCoordinatePages([]);
      setScenePageIndex(0);
      setCoordinatePageIndex(0);
    } finally {
      setLoadingLightOptions(false);
      setLoadingSceneOptions(false);
      setLoadingScenes(false);
      setLoadingCoordinates(false);
    }
  }

  function mergeOptions(current: SelectOption[], extras: SelectOption[]): SelectOption[] {
    const map = new Map(current.map((opt) => [opt.value, opt] as const));
    extras.forEach((opt) => {
      if (opt.value) map.set(opt.value, opt);
    });
    return Array.from(map.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" })
    );
  }

  function resetForm(nextProjectId?: string) {
    setFormState({
      ...initialProjectForm,
      projectId: nextProjectId ?? computeNextProjectId(sortedProjects),
    });
    setOwnerEmailInput("");
  }

  function addLightValue(rawValue?: string) {
    const input = (rawValue ?? lightSearchInput).trim();
    if (!input) return;
    const match = lightOptions.find(
      (option) =>
        option.value.toLowerCase() === input.toLowerCase() ||
        option.label.toLowerCase() === input.toLowerCase()
    );
    const value = match?.value ?? input;
    const label = match?.label ?? input;
    setFormState((prev) => {
      if (prev.lightIds.includes(value)) return prev;
      return { ...prev, lightIds: [...prev.lightIds, value] };
    });
    setLightOptions((prev) => mergeOptions(prev, [{ value, label }]));
    setLightSearchInput("");
  }

  function removeLightValue(value: string) {
    setFormState((prev) => ({
      ...prev,
      lightIds: prev.lightIds.filter((item) => item !== value),
    }));
  }

  function addSceneValue(rawValue?: string) {
    const input = (rawValue ?? sceneSearchInput).trim();
    if (!input) return;
    const match = sceneOptions.find(
      (option) =>
        option.value.toLowerCase() === input.toLowerCase() ||
        option.label.toLowerCase() === input.toLowerCase()
    );
    const value = match?.value ?? input;
    const label = match?.label ?? input;
    setFormState((prev) => {
      if (prev.scenes.includes(value)) return prev;
      return { ...prev, scenes: [...prev.scenes, value] };
    });
    setSceneOptions((prev) => mergeOptions(prev, [{ value, label }]));
    setSceneSearchInput("");
  }

  function removeSceneValue(value: string) {
    setFormState((prev) => ({
      ...prev,
      scenes: prev.scenes.filter((item) => item !== value),
    }));
  }

  function handleInputChange(
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  }

  function handleArraySelect(
    field: "lightIds" | "scenes" | "coordinates" | "ownerEmails"
  ) {
    return (event: React.ChangeEvent<HTMLSelectElement>) => {
      const values = Array.from(event.target.selectedOptions).map((option) => option.value);
      setFormState((prev) => ({ ...prev, [field]: values }));
    };
  }

  function addOwnerEmail() {
    const email = ownerEmailInput.trim();
    if (!email) return;
    setFormState((prev) => {
      if (prev.ownerEmails.includes(email)) return prev;
      return { ...prev, ownerEmails: [...prev.ownerEmails, email] };
    });
    setCustomOwnerEmails((prev) => {
      if (prev.includes(email)) return prev;
      return [...prev, email];
    });
    setOwnerEmailInput("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!formState.projectName.trim()) {
      setProjectsError("專案名稱為必填");
      return;
    }

    setSaving(true);
    setProjectsError(null);
    try {
      const payload = {
        projectId: formState.projectId.trim(),
        projectName: formState.projectName.trim(),
        startDate: formState.startDate || null,
        endDate: formState.endDate || null,
        coordinates: formState.coordinates.map((value) => value.trim()).filter(Boolean),
        lightIds: formState.lightIds.map((value) => value.trim()).filter(Boolean),
        scenes: formState.scenes.map((value) => value.trim()).filter(Boolean),
        isActive: formState.isActive,
        latLon: formState.latLon.trim() || null,
        ownerEmails: formState.ownerEmails.map((value) => value.trim()).filter(Boolean),
      };

      if (formState.id) {
        await updateAirtableProject(formState.id, payload);
      } else {
        await createAirtableProject(payload);
      }
      const updatedList = await loadProjects();
      resetForm(computeNextProjectId(updatedList ?? sortedProjects));
    } catch (error) {
      setProjectsError(
        error instanceof Error ? error.message : "儲存專案失敗"
      );
    } finally {
      setSaving(false);
    }
  }

  function sortByDescendingId<T extends { id: string }>(records: T[]): T[] {
    const toNumeric = (value: string): number => {
      const num = Number(value);
      return Number.isFinite(num) ? num : 0;
    };

    return [...records]
      .sort((a, b) => toNumeric(b.id) - toNumeric(a.id))
      .map((item) => ({ ...item }));
  }

  function getPagedData<T>(records: T[], pageIndex: number, pageSize = 10): T[] {
    if (records.length === 0) return [];
    const start = pageIndex * pageSize;
    return records.slice(start, start + pageSize);
  }

  function formatArrayValue(values: string[]): string {
    return values.length > 0 ? values.join(", ") : "-";
  }

  function computeNextProjectId(records: AirtableProject[]): string {
    if (records.length === 0) return "1";
    const currentMax = records.reduce((max, project) => {
      const value = toProjectIdNumber(project.projectId);
      return value > max ? value : max;
    }, 0);
    return String(currentMax + 1);
  }

  function startEdit(record: AirtableProject) {
    setSelectedProjectId(record.id);
    setFormState({
      id: record.id,
      projectId: record.projectId,
      projectName: record.projectName,
      startDate: record.startDate ?? "",
      endDate: record.endDate ?? "",
      coordinates: record.coordinates,
      lightIds: record.lightIds,
      scenes: record.scenes,
      isActive: record.isActive,
      latLon: record.latLon ?? "",
      ownerEmails: record.ownerEmails,
    });

    setCustomOwnerEmails((prev) => {
      const set = new Set(prev);
      record.ownerEmails.forEach((email) => {
        if (email) set.add(email);
      });
      return Array.from(set);
    });

    setLightOptions((prev) =>
      mergeOptions(prev, record.lightIds.map((value) => ({ value, label: value })))
    );
    setSceneOptions((prev) =>
      mergeOptions(prev, record.scenes.map((value) => ({ value, label: value })))
    );
    setCoordinateOptions((prev) =>
      mergeOptions(prev, record.coordinates.map((value) => ({ value, label: value })))
    );
  }

  async function handleDelete(id: string) {
    if (!window.confirm("確定要刪除此專案嗎？")) return;
    try {
      setSaving(true);
      await deleteAirtableProject(id);
      const updatedList = await loadProjects();
      if (formState.id === id) {
        const fallbackList = updatedList ?? sortedProjects.filter((project) => project.id !== id);
        resetForm(computeNextProjectId(fallbackList));
      }
    } catch (error) {
      setProjectsError(
        error instanceof Error ? error.message : "刪除專案失敗"
      );
    } finally {
      setSaving(false);
    }
  }

  function handleApplyToken(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLigToken(tokenInput.trim());
  }

  function handleClearToken() {
    setLigToken("");
    setLigError(null);
  }

  function handleLoginFieldChange(event: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;
    setLoginForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleLigLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loginForm.email || !loginForm.password) {
      setLigError("請輸入帳號與密碼");
      return;
    }
    setLoggingIn(true);
    setLigError(null);
    try {
      const token = await loginLigDashboard(
        loginForm.email.trim(),
        loginForm.password
      );
      setLigToken(token);
      setTokenInput(token);
      setLoginForm({ email: "", password: "" });
    } catch (error) {
      setLigError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleDataSync() {
    setIsSyncingData(true);
    setSyncMessage(null);
    setSyncErrorMessage(null);
    try {
      const result = await triggerDataSync();
      const fileLabel =
        result.files && result.files.length > 0
          ? `（${result.files.join(", ")}）`
          : "";
      const baseMessage = result.message ?? "資料已同步";
      setSyncMessage(
        `${baseMessage}${fileLabel ? ` ${fileLabel}` : ""}。重新整理頁面即可套用最新資料。`
      );
    } catch (error) {
      setSyncErrorMessage(
        error instanceof Error ? error.message : "資料更新失敗，請確認網路位於內網或 VPN 環境。"
      );
    } finally {
      setIsSyncingData(false);
    }
  }

  return (
    <div className="settings">
      <div className="settings__nav">
        <button type="button" className="settings__home-button" onClick={onNavigateHome}>
          ← 回到主頁
        </button>
      </div>
      <div className="panel panel--surface">
        <h3 className="panel__title">Owner Accounts</h3>
        <p>目前可用帳號 ({ownerOptions.length}):</p>
        <ul>
          {ownerOptions.map((owner) => (
            <li key={owner}>{owner}</li>
          ))}
        </ul>
      </div>

      <div className="panel panel--surface">
        <h3 className="panel__title">資料來源更新</h3>
        <p>
          連上公司 Wi-Fi 或 VPN 時，可透過此按鈕自動從{" "}
          <code>web1:/opt/deploy_dashboard/data</code> 下載最新的
          {" "}scandata.csv 與 obj_click_log.csv 並覆蓋 <code>public/data</code>。
        </p>
        <button
          type="button"
          className="primary"
          onClick={handleDataSync}
          disabled={isSyncingData}
        >
          {isSyncingData ? "更新中…" : "同步最新 CSV"}
        </button>
        <p className="form-hint">更新成功後重新整理頁面即可載入最新資料。</p>
        {syncMessage && <p className="form-success">✅ {syncMessage}</p>}
        {syncErrorMessage && <p className="form-error">⚠️ {syncErrorMessage}</p>}
      </div>

      <div className="panel panel--surface">
        <h3 className="panel__title">LiG API Token</h3>
        <form className="form-inline" onSubmit={handleApplyToken}>
          <label>
            Token
            <input
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder="貼上 Bearer token"
            />
          </label>
          <button type="submit" className="primary">
            套用 Token
          </button>
          {ligToken && (
            <button type="button" className="secondary" onClick={handleClearToken}>
              清除
            </button>
          )}
        </form>
        <form className="form-inline" onSubmit={handleLigLogin}>
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="email"
              value={loginForm.email}
              onChange={handleLoginFieldChange}
              placeholder="輸入 LIG Email"
            />
          </label>
          <label>
            密碼
            <input
              type="password"
              autoComplete="current-password"
              name="password"
              value={loginForm.password}
              onChange={handleLoginFieldChange}
              placeholder="輸入密碼"
            />
          </label>
          <button type="submit" className="primary" disabled={loggingIn}>
            {loggingIn ? "登入中…" : "登入並取得 Token"}
          </button>
        </form>
        <p>目前 token 狀態：{ligToken ? "已設定" : "未設定"}</p>
        {ligError && <p className="form-error">⚠️ {ligError}</p>}
        {loadingLightOptions && <p>燈具列表載入中…</p>}
        {loadingSceneOptions && <p>場景列表載入中…</p>}
      </div>

      <div className="panel panel--surface">
        <h3 className="panel__title">Scenes 與 Coordinate Systems</h3>
        {!ligToken ? (
          <p>設定或登入 LiG API token 後即可載入 Scenes 與 Coordinate Systems。</p>
        ) : (
          <div className="recent-grid">
            <div>
              <h4>Scenes</h4>
              {loadingScenes ? (
                <p>載入中…</p>
              ) : scenePages.length === 0 ? (
                <p>沒有可顯示的場景。</p>
              ) : (
                <>
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>名稱</th>
                        <th>Project ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleScenes.map((scene) => (
                        <tr key={scene.id}>
                          <td>{scene.id}</td>
                          <td>{scene.name}</td>
                          <td>{(scene.raw as any)?.project_id ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="pagination">
                    <span>共 {scenePages.length} 筆</span>
                    {sceneTotalPages > 1 && (
                      <div className="pagination__controls">
                        <button
                          type="button"
                          onClick={() => setScenePageIndex((prev) => Math.max(prev - 1, 0))}
                          disabled={scenePageIndex === 0}
                        >
                          上一頁
                        </button>
                        <span>第 {scenePageIndex + 1} / {sceneTotalPages} 頁</span>
                        <button
                          type="button"
                          onClick={() =>
                            setScenePageIndex((prev) =>
                              Math.min(prev + 1, sceneTotalPages - 1)
                            )
                          }
                          disabled={scenePageIndex >= sceneTotalPages - 1}
                        >
                          下一頁
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            <div>
              <h4>Coordinate Systems</h4>
              {loadingCoordinates ? (
                <p>載入中…</p>
              ) : coordinatePages.length === 0 ? (
                <p>沒有可顯示的座標資料。</p>
              ) : (
                <>
                  <table>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>名稱</th>
                        <th>Project ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleCoordinates.map((coord) => (
                        <tr key={coord.id}>
                          <td>{coord.id}</td>
                          <td>{coord.name}</td>
                          <td>{coord.projectId ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="pagination">
                    <span>共 {coordinatePages.length} 筆</span>
                    {coordinateTotalPages > 1 && (
                      <div className="pagination__controls">
                        <button
                          type="button"
                          onClick={() => setCoordinatePageIndex((prev) => Math.max(prev - 1, 0))}
                          disabled={coordinatePageIndex === 0}
                        >
                          上一頁
                        </button>
                        <span>第 {coordinatePageIndex + 1} / {coordinateTotalPages} 頁</span>
                        <button
                          type="button"
                          onClick={() =>
                            setCoordinatePageIndex((prev) =>
                              Math.min(prev + 1, coordinateTotalPages - 1)
                            )
                          }
                          disabled={coordinatePageIndex >= coordinateTotalPages - 1}
                        >
                          下一頁
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="panel panel--surface">
        <h3 className="panel__title">Projects (Airtable)</h3>
        {!airtableConfigured && (
          <p>
            請先在 <code>.env.local</code> 設定 Airtable 相關參數（PAT / Base
            ID / Table），才能啟用專案管理。
          </p>
        )}
        {airtableConfigured && (
          <>
            <form className="event-form" onSubmit={handleSubmit}>
              <div className="form-grid">
                <label>
                  Project ID
                  <input
                    name="projectId"
                    value={formState.projectId}
                    onChange={handleInputChange}
                    required
                    placeholder="例如：1"
                    disabled={saving}
                  />
                </label>
                <label className="form-spacer" aria-hidden="true" />
                <label>
                  Project Name
                  <input
                    name="projectName"
                    value={formState.projectName}
                    onChange={handleInputChange}
                    required
                    placeholder="專案名稱"
                    disabled={saving}
                  />
                </label>
                <label>
                  開始日期
                  <input
                    type="date"
                    name="startDate"
                    value={formState.startDate}
                    onChange={handleInputChange}
                    disabled={saving}
                  />
                </label>
                <label>
                  結束日期
                  <input
                    type="date"
                    name="endDate"
                    value={formState.endDate}
                    onChange={handleInputChange}
                    disabled={saving}
                  />
                </label>
                <label className="form-notes">
                  Light IDs
                  <div className="list-picker">
                    <input
                      type="search"
                      list={lightDatalistId}
                      value={lightSearchInput}
                      onChange={(event) => setLightSearchInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addLightValue();
                        }
                      }}
                      placeholder="搜尋或輸入 Light ID"
                      disabled={saving}
                    />
                    <datalist id={lightDatalistId}>
                      {lightOptions.map((option) => (
                        <option key={option.value} value={option.value} label={option.label} />
                      ))}
                    </datalist>
                    <button
                      type="button"
                      onClick={() => addLightValue()}
                      disabled={!lightSearchInput.trim() || saving}
                    >
                      加入
                    </button>
                  </div>
                  {!ligToken && <small>未設定 token 時會使用備援資料。</small>}
                  {selectedLightItems.length > 0 && (
                    <div className="selected-tags" aria-live="polite">
                      {selectedLightItems.map((item) => (
                        <div key={item.value} className="selected-tags__item">
                          <span>{item.label}</span>
                          <button
                            type="button"
                            className="selected-tags__remove"
                            onClick={() => removeLightValue(item.value)}
                            aria-label={`移除 ${item.label}`}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </label>
                <label className="form-notes">
                  Coordinates (隨 Light ID 載入)
                  <select
                    multiple
                    name="coordinates"
                    value={formState.coordinates}
                    onChange={handleArraySelect("coordinates")}
                    disabled={saving || coordinateOptions.length === 0}
                  >
                    {coordinateOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {loadingCoordinateOptions && <small>座標載入中…</small>}
                </label>
                <label className="form-notes">
                  Scenes
                  <div className="list-picker">
                    <input
                      type="search"
                      list={sceneDatalistId}
                      value={sceneSearchInput}
                      onChange={(event) => setSceneSearchInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addSceneValue();
                        }
                      }}
                      placeholder="搜尋或輸入 Scene"
                      disabled={saving}
                    />
                    <datalist id={sceneDatalistId}>
                      {sceneOptions.map((option) => (
                        <option key={option.value} value={option.value} label={option.label} />
                      ))}
                    </datalist>
                    <button
                      type="button"
                      onClick={() => addSceneValue()}
                      disabled={!sceneSearchInput.trim() || saving}
                    >
                      加入
                    </button>
                  </div>
                  {selectedSceneItems.length > 0 && (
                    <div className="selected-tags" aria-live="polite">
                      {selectedSceneItems.map((item) => (
                        <div key={item.value} className="selected-tags__item">
                          <span>{item.label}</span>
                          <button
                            type="button"
                            className="selected-tags__remove"
                            onClick={() => removeSceneValue(item.value)}
                            aria-label={`移除 ${item.label}`}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </label>
                <label>
                  Is Active
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={formState.isActive}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        isActive: event.target.checked,
                      }))
                    }
                    disabled={saving}
                  />
                </label>
                <label>
                  Latitude and Longitude
                  <input
                    name="latLon"
                    value={formState.latLon}
                    onChange={handleInputChange}
                    placeholder="25.0495, 121.5235"
                    disabled={saving}
                  />
                </label>
                <label className="form-notes">
                  Owner Emails
                  <select
                    multiple
                    name="ownerEmails"
                    value={formState.ownerEmails}
                    onChange={handleArraySelect("ownerEmails")}
                    disabled={saving}
                  >
                    {ownerEmailOptions.map((email) => (
                      <option key={email} value={email}>
                        {email}
                      </option>
                    ))}
                  </select>
                  <div className="form-inline">
                    <input
                      type="email"
                      autoComplete="email"
                      value={ownerEmailInput}
                      onChange={(event) => setOwnerEmailInput(event.target.value)}
                      placeholder="新增 email"
                      disabled={saving}
                    />
                    <button
                      type="button"
                      className="secondary"
                      onClick={addOwnerEmail}
                      disabled={!ownerEmailInput.trim() || saving}
                    >
                      加入
                    </button>
                  </div>
                </label>
              </div>
              <div className="form-actions">
                <button type="submit" className="primary" disabled={saving}>
                  {formState.id ? "更新專案" : "新增專案"}
                </button>
                {formState.id && (
                  <button
                    type="button"
                    onClick={() => resetForm()}
                    className="secondary"
                    disabled={saving}
                  >
                    取消編輯
                  </button>
                )}
              </div>
            </form>

            {projectsError && (
              <p className="form-error">⚠️ {projectsError}</p>
            )}

            {loadingProjects ? (
              <p>專案資料載入中…</p>
            ) : projects.length === 0 ? (
              <p>目前沒有任何專案紀錄。</p>
            ) : (
              <div className="project-viewer">
                <div className="project-viewer__search">
                  <input
                    type="search"
                    value={projectSearchTerm}
                    onChange={(event) => setProjectSearchTerm(event.target.value)}
                    placeholder="搜尋專案名稱或 ID"
                  />
                  {projectSearchTerm && (
                    <button
                      type="button"
                      onClick={() => setProjectSearchTerm("")}
                      aria-label="清除搜尋"
                    >
                      清除
                    </button>
                  )}
                </div>
                {projectSelectOptions.length === 0 ? (
                  <p className="field-hint">無符合搜尋條件的專案。</p>
                ) : (
                  <label className="project-viewer__select">
                    選擇專案
                    <select
                      value={selectedProjectId}
                      onChange={(event) => setSelectedProjectId(event.target.value)}
                    >
                      {projectSelectOptions.map((project) => (
                        <option key={project.id} value={project.id}>
                          ({project.projectId ? `#${project.projectId}` : "#-"}){" "}
                          {project.projectName || "未命名專案"}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {selectedProject ? (
                  <div className="project-details">
                    <div className="project-details__header">
                      <div>
                        <div className="project-details__title">{selectedProject.projectName}</div>
                        <small className="project-details__subtitle">
                          Airtable ID: {selectedProject.id}
                        </small>
                      </div>
                      <div className="project-details__actions">
                        <button type="button" onClick={() => startEdit(selectedProject)} disabled={saving}>
                          編輯
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(selectedProject.id)}
                          disabled={saving}
                        >
                          刪除
                        </button>
                      </div>
                    </div>
                    <div className="project-details__grid">
                      <div className="project-details__item">
                        <div className="project-details__label">Project ID</div>
                        <div className="project-details__value">
                          {selectedProject.projectId || "-"}
                        </div>
                      </div>
                      <div className="project-details__item">
                        <div className="project-details__label">開始日期</div>
                        <div className="project-details__value">
                          {selectedProject.startDate ?? "-"}
                        </div>
                      </div>
                      <div className="project-details__item">
                        <div className="project-details__label">結束日期</div>
                        <div className="project-details__value">
                          {selectedProject.endDate ?? "-"}
                        </div>
                      </div>
                      <div className="project-details__item">
                        <div className="project-details__label">座標</div>
                        <div className="project-details__value">
                          {formatArrayValue(selectedProject.coordinates)}
                        </div>
                      </div>
                      <div className="project-details__item">
                        <div className="project-details__label">Light IDs</div>
                        <div className="project-details__value">
                          {formatArrayValue(selectedProject.lightIds)}
                        </div>
                      </div>
                      <div className="project-details__item">
                        <div className="project-details__label">Scenes</div>
                        <div className="project-details__value">
                          {formatArrayValue(selectedProject.scenes)}
                        </div>
                      </div>
                      <div className="project-details__item">
                        <div className="project-details__label">Active</div>
                        <div className="project-details__value">
                          {selectedProject.isActive ? "Yes" : "No"}
                        </div>
                      </div>
                      <div className="project-details__item">
                        <div className="project-details__label">Lat / Lon</div>
                        <div className="project-details__value">
                          {selectedProject.latLon ?? "-"}
                        </div>
                      </div>
                      <div className="project-details__item project-details__item--wide">
                        <div className="project-details__label">Owner Emails</div>
                        <div className="project-details__value">
                          {formatArrayValue(selectedProject.ownerEmails)}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="field-hint">請選擇專案以檢視詳細資料。</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function buildMonthlyClickSeries(data: DashboardData) {
  const end = endOfMonth(new Date());
  const start = startOfMonth(subMonths(end, 11));
  const months = eachMonthOfInterval({ start, end });
  const counts = new Map<number, number>();
  months.forEach((month) => {
    counts.set(startOfMonth(month).getTime(), 0);
  });
  for (const click of data.clicks) {
    if (click.time < start || click.time > end) continue;
    const key = startOfMonth(click.time).getTime();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return months.map((month) => ({
    month: startOfMonth(month),
    total: counts.get(startOfMonth(month).getTime()) ?? 0,
  }));
}

function buildClickGeoData(
  data: DashboardData,
  ranking: ClickRankingRow[]
): {
  heatmapPoints: Array<{ projectId: number; lat: number; lon: number; name: string; clicks: number }>;
  topObjectRows: Array<ClickRankingRow & { projectNames: string }>;
} {
  const sceneProjectMap = new Map<number, Set<number>>();
  for (const project of data.projects) {
    for (const sceneRaw of project.scenes) {
      const sceneId = parseSceneId(sceneRaw);
      if (sceneId === null) continue;
      if (!sceneProjectMap.has(sceneId)) {
        sceneProjectMap.set(sceneId, new Set());
      }
      sceneProjectMap.get(sceneId)!.add(project.projectId);
    }
  }

  const arObjectProjectMap = new Map<number, Set<number>>();
  for (const obj of data.arObjects) {
    if (obj.sceneId === null) continue;
    const owners = sceneProjectMap.get(obj.sceneId);
    if (!owners) continue;
    arObjectProjectMap.set(obj.id, new Set(owners));
  }

  const projectClickCounts = new Map<number, number>();
  for (const click of data.clicks) {
    const owners = arObjectProjectMap.get(click.objId);
    if (!owners) continue;
    owners.forEach((projectId) => {
      projectClickCounts.set(projectId, (projectClickCounts.get(projectId) ?? 0) + 1);
    });
  }

  const heatmapPoints = Array.from(projectClickCounts.entries())
    .map(([projectId, clicks]) => {
      const project = data.projectById[projectId];
      if (!project || !project.latLon) return null;
      return {
        projectId,
        name: project.name,
        lat: project.latLon.lat,
        lon: project.latLon.lon,
        clicks,
      };
    })
    .filter((item): item is { projectId: number; lat: number; lon: number; name: string; clicks: number } =>
      Boolean(item)
    );

  const topObjectRows = ranking.map((item) => {
    const owners = arObjectProjectMap.get(item.objId);
    const projectNames = owners
      ? Array.from(owners)
          .map((id) => data.projectById[id]?.name)
          .filter(Boolean)
          .join("、")
      : "";
    return {
      ...item,
      projectNames,
    };
  });

  return { heatmapPoints, topObjectRows };
}

function buildProjectClickStats(
  data: DashboardData | null
): Map<number, { clicks: number; users: number }> {
  const result = new Map<number, { clicks: number; users: number }>();
  if (!data) return result;

  const sceneProjectMap = new Map<number, Set<number>>();
  for (const project of data.projects) {
    for (const sceneRaw of project.scenes) {
      const sceneId = parseSceneId(sceneRaw);
      if (sceneId === null) continue;
      if (!sceneProjectMap.has(sceneId)) {
        sceneProjectMap.set(sceneId, new Set());
      }
      sceneProjectMap.get(sceneId)!.add(project.projectId);
    }
  }

  const arObjectProjectMap = new Map<number, Set<number>>();
  for (const obj of data.arObjects) {
    if (obj.sceneId === null) continue;
    const owners = sceneProjectMap.get(obj.sceneId);
    if (!owners || owners.size === 0) continue;
    arObjectProjectMap.set(obj.id, new Set(owners));
  }

  const tempStats = new Map<number, { clicks: number; users: Set<string> }>();
  for (const click of data.clicks) {
    const owners = arObjectProjectMap.get(click.objId);
    if (!owners) continue;
    owners.forEach((projectId) => {
      if (!tempStats.has(projectId)) {
        tempStats.set(projectId, { clicks: 0, users: new Set<string>() });
      }
      const entry = tempStats.get(projectId)!;
      entry.clicks += 1;
      if (click.codeName) {
        entry.users.add(click.codeName.trim());
      }
    });
  }

  tempStats.forEach((value, projectId) => {
    result.set(projectId, { clicks: value.clicks, users: value.users.size });
  });

  return result;
}

function computeVolumeStats<T extends { total: number; date: Date }>(
  series: T[]
): { peakValue: number; peakDate: Date; avg: number } | null {
  if (series.length === 0) return null;
  let peak = series[0];
  let sum = 0;
  for (const point of series) {
    if (point.total > peak.total) {
      peak = point;
    }
    sum += point.total;
  }
  const avg = Math.round(sum / series.length);
  return { peakValue: peak.total, peakDate: peak.date, avg };
}

function parseSceneId(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/^(\d+)/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

function SectionTitle({ title }: { title: string }) {
  return <h2 className="section-title">{title}</h2>;
}

function MetricCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="metric-card">
      <div className="metric-card__title">{title}</div>
      <div className="metric-card__value">{value.toLocaleString()}</div>
    </div>
  );
}

interface DumbbellSeries {
  data: Partial<Data>[];
  categories: string[];
}

function buildDumbbellSeries(
  rows: ProjectRankRow[],
  previousKey: keyof ProjectRankRow,
  currentKey: keyof ProjectRankRow,
  previousLabel: string,
  currentLabel: string
): DumbbellSeries | null {
  if (rows.length === 0) return null;
  const ordered = [...rows].reverse();
  const names = ordered.map((row) => row.name);
  const previousValues = ordered.map((row) => row[previousKey] as number);
  const currentValues = ordered.map((row) => row[currentKey] as number);

  const lineX: Array<number | null> = [];
  const lineY: Array<string | null> = [];

  const growthText = ordered.map((_, idx) => {
    const prev = previousValues[idx];
    const curr = currentValues[idx];
    const delta = curr - prev;
    const deltaLabel = `${delta >= 0 ? "+" : ""}${delta.toLocaleString()}`;
    const percent =
      prev > 0 ? `${((delta / prev) * 100).toFixed(1)}%` : "N/A";
    return `差值: ${deltaLabel}<br>成長率: ${percent}`;
  });

  ordered.forEach((_, idx) => {
    const prev = previousValues[idx];
    const curr = currentValues[idx];
    const name = names[idx];
    lineX.push(prev, curr, null);
    lineY.push(name, name, null);
  });

  const currentColors = ordered.map((_, idx) =>
    currentValues[idx] >= previousValues[idx] ? "#2ca02c" : "#d62728"
  );

  const lineTrace: Partial<Data> = {
    type: "scatter",
    mode: "lines",
    x: lineX,
    y: lineY,
    line: { color: "#9aa5b1", width: 2 },
    hoverinfo: "skip",
    showlegend: false,
  };

  const previousTrace: Partial<Data> = {
    type: "scatter",
    mode: "markers",
    x: previousValues,
    y: names,
    name: previousLabel,
    marker: { color: "#ffa94d", size: 10, symbol: "circle" },
    hovertemplate: `${previousLabel}: %{x:,}<extra></extra>`,
  };

  const currentTrace: Partial<Data> = {
    type: "scatter",
    mode: "markers",
    x: currentValues,
    y: names,
    name: currentLabel,
    marker: {
      color: currentColors,
      size: 12,
      symbol: "circle",
      line: { color: "#ffffff", width: 1 },
    },
    text: growthText,
    hovertemplate: `${currentLabel}: %{x:,}<br>%{text}<extra></extra>`,
  };

  return {
    data: [lineTrace, previousTrace, currentTrace],
    categories: names,
  };
}

function createDumbbellLayout(
  categories: string[],
  xTitle: string
): Partial<Layout> {
  return {
    autosize: true,
    margin: { l: 200, r: 40, t: 20, b: 40 },
    xaxis: {
      title: { text: xTitle },
      zeroline: false,
      showgrid: true,
      gridcolor: "#e4edf5",
    },
    yaxis: {
      type: "category",
      categoryorder: "array",
      categoryarray: categories,
      automargin: true,
    },
    legend: {
      orientation: "h",
      x: 0.5,
      xanchor: "center",
      y: 1.1,
    },
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
  };
}

function extractOwnerOptions(projects: Project[]): string[] {
  const owners = new Set<string>();
  for (const project of projects) {
    project.ownerEmails.forEach((email) => owners.add(email));
  }
  return Array.from(owners).sort();
}

function createProjectScope(
  projects: Project[],
  owners: string[]
): Set<number> {
  if (owners.length === 0) {
    return new Set(projects.map((project) => project.projectId));
  }

  const matching = projects
    .filter((project) =>
      project.ownerEmails.some((email) => owners.includes(email))
    )
    .map((project) => project.projectId);

  return new Set(matching);
}

function createDefaultRange(): DateRange {
  const end = new Date();
  const start = subDays(end, 13);
  return { start, end };
}

function buildUserAcquisitionPlot(
  series: UserAcquisitionPoint[],
  options: {
    showRangeSlider?: boolean;
    xTickFormat?: string;
  } = {}
): {
  data: Partial<Data>[];
  layout: Partial<Layout>;
} {
  const dates = series.map((point) => point.date);
  const xValues = dates.map((date) => date.toISOString());
  const newValues = series.map((point) => point.newUsers);
  const returningValues = series.map((point) => point.returningUsers);
  const cumulativeValues = series.map((point) => point.cumulativeUsers);

  const start = xValues[0];
  const end = xValues[xValues.length - 1];

  const data: Partial<Data>[] = [
    {
      type: "bar",
      name: "新用戶",
      x: xValues,
      y: newValues,
      marker: { color: "#4f9ac3" },
    },
    {
      type: "bar",
      name: "回購用戶",
      x: xValues,
      y: returningValues,
      marker: { color: "#ffa94d" },
    },
    {
      type: "scatter",
      mode: "lines+markers",
      name: "累積用戶",
      x: xValues,
      y: cumulativeValues,
      yaxis: "y2",
      line: { color: "#2f5597", width: 2 },
      marker: { size: 6 },
    },
  ];

  const layout: Partial<Layout> = {
    autosize: true,
    barmode: "stack",
    margin: { l: 70, r: 70, t: 20, b: 60 },
    xaxis: {
      type: "date",
      range: [start, end],
      rangeslider: { visible: options.showRangeSlider ?? true },
      tickformat: options.xTickFormat,
      showgrid: true,
      gridcolor: "#e4edf5",
    },
    yaxis: {
      title: { text: "每日用戶數" },
      showgrid: true,
      gridcolor: "#e4edf5",
    },
    yaxis2: {
      title: { text: "累積用戶" },
      overlaying: "y",
      side: "right",
      showgrid: false,
    },
    legend: {
      orientation: "h",
      x: 0.5,
      xanchor: "center",
      y: 1.1,
    },
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
  };

  return { data, layout };
}

export default App;
