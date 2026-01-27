import { useState, useMemo } from "react";
import { useDashboardData } from "../context/DashboardDataContext";
import { format } from "date-fns";

export function LightIdStatsPage() {
    const { status, data } = useDashboardData();
    const [startDate, setStartDate] = useState<string>(
        format(new Date(new Date().setDate(new Date().getDate() - 30)), "yyyy-MM-dd")
    );
    const [endDate, setEndDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));

    const stats = useMemo(() => {
        if (status !== "ready" || !data) return [];

        const start = new Date(startDate);
        const end = new Date(endDate);
        // Set end date to end of day
        end.setHours(23, 59, 59, 999);

        const counts = new Map<number, number>();

        // Count scans
        data.scans.forEach((scan) => {
            // Ensure scan date is valid and within range
            if (scan.time && scan.time >= start && scan.time <= end) {
                counts.set(scan.ligId, (counts.get(scan.ligId) ?? 0) + 1);
            }
        });

        // Build list of all known Light IDs (from scans and project configs)
        const allIds = new Set(counts.keys());
        data.lights.forEach(l => allIds.add(l.ligId));
        data.projects.forEach(p => p.lightIds.forEach(id => allIds.add(id)));

        const result = Array.from(allIds).map((ligId) => {
            const scanCount = counts.get(ligId) ?? 0;
            const projectIds = data.lightToProjectIds[ligId] ?? [];
            const projectNames = projectIds
                .map((pid) => data.projectById[pid]?.name)
                .filter(Boolean)
                .join(", ");

            return {
                ligId,
                scanCount,
                projectNames: projectNames || "未歸類",
                isAssigned: projectIds.length > 0
            };
        });

        // Sort by scan count descending
        return result.sort((a, b) => b.scanCount - a.scanCount);
    }, [status, data, startDate, endDate]);

    if (status === "loading") return <div>載入中...</div>;
    if (!data) return <div>無資料</div>;

    return (
        <div className="panel panel--surface">
            <h2 className="panel__title">LightID 掃描統計</h2>

            <div className="controls" style={{ marginBottom: "1rem", display: "flex", gap: "1rem", alignItems: "center" }}>
                <label>
                    開始日期:
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        style={{ marginLeft: "0.5rem", padding: "0.25rem" }}
                    />
                </label>
                <label>
                    結束日期:
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        style={{ marginLeft: "0.5rem", padding: "0.25rem" }}
                    />
                </label>
            </div>

            <div className="table-container">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ borderBottom: "2px solid #eee", textAlign: "left" }}>
                            <th style={{ padding: "0.5rem" }}>Light ID</th>
                            <th style={{ padding: "0.5rem" }}>掃描次數</th>
                            <th style={{ padding: "0.5rem" }}>歸屬專案</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stats.map((row) => (
                            <tr key={row.ligId} style={{ borderBottom: "1px solid #eee" }}>
                                <td style={{ padding: "0.5rem" }}>{row.ligId}</td>
                                <td style={{ padding: "0.5rem", fontWeight: "bold" }}>{row.scanCount.toLocaleString()}</td>
                                <td style={{ padding: "0.5rem", color: row.isAssigned ? "inherit" : "#ff4d4f", fontWeight: row.isAssigned ? "normal" : "bold" }}>
                                    {row.projectNames}
                                </td>
                            </tr>
                        ))}
                        {stats.length === 0 && (
                            <tr>
                                <td colSpan={3} style={{ padding: "1rem", textAlign: "center" }}>查無資料</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
