import { useState, useMemo } from "react";
import { format } from "date-fns";
import type { ScanRecord } from "../types";
import { useDashboardData } from "../context/DashboardDataContext";

interface ScanRawDataPageProps {
    scans: ScanRecord[];
}

interface LigCsSummary {
    ligId: number;
    entries: { csId: number | null; latestTime: Date }[];
}

export function ScanRawDataPage({ scans }: ScanRawDataPageProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const [showSummary, setShowSummary] = useState(true);
    const itemsPerPage = 100;
    const dashState = useDashboardData();

    // Build CS ID → Name lookup from cached coordinate systems
    const csNameMap = useMemo<Map<number, string>>(() => {
        const map = new Map<number, string>();
        if (dashState.status === "ready" && dashState.data?.coordinateSystems) {
            for (const cs of dashState.data.coordinateSystems) {
                if (cs.id && cs.name) map.set(cs.id, cs.name);
            }
        }
        return map;
    }, [dashState]);

    // Build Light ID → Scene ID/Name lookup from direct cache mapping
    const lightToSceneMap = useMemo<Map<number, { sceneId: number; sceneName: string }>>(() => {
        const map = new Map<number, { sceneId: number; sceneName: string }>();
        if (dashState.status === "ready" && dashState.data) {
            // Use direct lightToSceneMap from cache (populated by ar_objects_list API)
            const cached = (dashState.data as any).lightToSceneMap;
            if (cached && typeof cached === 'object') {
                for (const [lidStr, val] of Object.entries(cached)) {
                    const lid = Number(lidStr);
                    const v = val as any;
                    if (!isNaN(lid) && v?.sceneId) {
                        map.set(lid, { sceneId: Number(v.sceneId), sceneName: String(v.sceneName || '') });
                    }
                }
            }
        }
        return map;
    }, [dashState]);

    // --- Summary: unique LigID → CS IDs with latest time ---
    const summary = useMemo<LigCsSummary[]>(() => {
        // key: "ligId|csId"
        const map = new Map<string, { ligId: number; csId: number | null; latestTime: Date }>();
        for (const scan of scans) {
            const key = `${scan.ligId}|${scan.coordinateSystemId ?? "null"}`;
            const existing = map.get(key);
            if (!existing || scan.time > existing.latestTime) {
                map.set(key, { ligId: scan.ligId, csId: scan.coordinateSystemId, latestTime: scan.time });
            }
        }

        // Group by ligId
        const grouped = new Map<number, { csId: number | null; latestTime: Date }[]>();
        for (const entry of map.values()) {
            if (!grouped.has(entry.ligId)) grouped.set(entry.ligId, []);
            grouped.get(entry.ligId)!.push({ csId: entry.csId, latestTime: entry.latestTime });
        }

        // Sort entries within each ligId by latestTime desc
        const result: LigCsSummary[] = [];
        for (const [ligId, entries] of grouped.entries()) {
            entries.sort((a, b) => b.latestTime.getTime() - a.latestTime.getTime());
            result.push({ ligId, entries });
        }
        // Sort by ligId ascending
        result.sort((a, b) => a.ligId - b.ligId);
        return result;
    }, [scans]);

    const sortedScans = useMemo(() => {
        return [...scans].sort((a, b) => b.time.getTime() - a.time.getTime());
    }, [scans]);

    const totalPages = Math.max(1, Math.ceil(sortedScans.length / itemsPerPage));
    const validCurrentPage = Math.min(currentPage, totalPages);

    const paginatedScans = useMemo(() => {
        const start = (validCurrentPage - 1) * itemsPerPage;
        return sortedScans.slice(start, start + itemsPerPage);
    }, [sortedScans, validCurrentPage, itemsPerPage]);

    return (
        <div className="panel panel--surface" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px", height: "calc(100vh - 120px)" }}>
            <h2>ScanRawData</h2>

            {/* ===== Summary Table ===== */}
            <div style={{ border: "1px solid #ddd", borderRadius: "8px", overflow: "hidden" }}>
                <button
                    type="button"
                    onClick={() => setShowSummary(s => !s)}
                    style={{
                        width: "100%",
                        padding: "10px 16px",
                        background: "#f5f5f5",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        fontWeight: 600,
                        fontSize: "14px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}
                >
                    <span>📋 LigID ↔ CS 對照表（{summary.length} 個 Lig ID）</span>
                    <span style={{ fontSize: "12px", color: "#888" }}>{showSummary ? "▲ 收起" : "▼ 展開"}</span>
                </button>

                {showSummary && (
                    <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                        <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse", fontSize: "13px" }}>
                            <thead style={{ position: "sticky", top: 0, backgroundColor: "#fafafa", zIndex: 1 }}>
                                <tr style={{ borderBottom: "2px solid #ddd" }}>
                                    <th style={{ padding: "6px 10px", width: "100px" }}>Lig ID</th>
                                    <th style={{ padding: "6px 10px", width: "120px" }}>Scene ID</th>
                                    <th style={{ padding: "6px 10px" }}>CS ID（最新時間）</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.map(row => (
                                    <tr key={row.ligId} style={{ borderBottom: "1px solid #eee" }}>
                                        <td style={{ padding: "6px 10px", fontWeight: 600 }}>{row.ligId}</td>
                                        <td style={{ padding: "6px 10px" }}>
                                            {lightToSceneMap.has(row.ligId) ? (
                                                <span style={{ fontSize: "12px" }}>
                                                    {lightToSceneMap.get(row.ligId)!.sceneId}
                                                    {lightToSceneMap.get(row.ligId)!.sceneName && (
                                                        <span style={{ color: "#888", marginLeft: "4px" }}>
                                                            {lightToSceneMap.get(row.ligId)!.sceneName}
                                                        </span>
                                                    )}
                                                </span>
                                            ) : (
                                                <span style={{ color: "#ccc" }}>-</span>
                                            )}
                                        </td>
                                        <td style={{ padding: "6px 10px" }}>
                                            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                                {row.entries.map((e, i) => (
                                                    <span
                                                        key={i}
                                                        style={{
                                                            display: "inline-block",
                                                            padding: "2px 8px",
                                                            borderRadius: "4px",
                                                            backgroundColor: e.csId != null ? "#e8f4fd" : "#f0f0f0",
                                                            border: "1px solid #ccc",
                                                            fontSize: "12px",
                                                            whiteSpace: "nowrap",
                                                        }}
                                                    >
                                                        CS {e.csId ?? "-"}{e.csId != null && csNameMap.has(e.csId) ? ` ${csNameMap.get(e.csId)}` : ""}{" "}
                                                        <span style={{ color: "#888" }}>
                                                            ({format(e.latestTime, "yyyy/MM/dd HH:mm")})
                                                        </span>
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {summary.length === 0 && (
                                    <tr><td colSpan={3} style={{ textAlign: "center", padding: "12px", color: "#999" }}>No data</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ===== Raw Data Table ===== */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Total Records: {scans.length.toLocaleString()}</span>
                <div>
                    <button
                        type="button"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={validCurrentPage === 1}
                        style={{ marginRight: "10px", padding: "4px 8px" }}
                    >
                        Previous
                    </button>
                    <span>Page {validCurrentPage} of {totalPages}</span>
                    <button
                        type="button"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={validCurrentPage === totalPages}
                        style={{ marginLeft: "10px", padding: "4px 8px" }}
                    >
                        Next
                    </button>
                </div>
            </div>

            <div className="table-wrapper" style={{ flex: 1, overflowY: "auto" }}>
                <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
                    <thead style={{ position: "sticky", top: 0, backgroundColor: "#fff", zIndex: 1, borderBottom: "2px solid #ddd" }}>
                        <tr>
                            <th style={{ padding: "8px" }}>Time</th>
                            <th style={{ padding: "8px" }}>Lig ID</th>
                            <th style={{ padding: "8px" }}>Scene ID</th>
                            <th style={{ padding: "8px" }}>Client ID</th>
                            <th style={{ padding: "8px" }}>CS ID</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedScans.length === 0 ? (
                            <tr>
                                <td colSpan={5} style={{ textAlign: "center", padding: "20px" }}>No data</td>
                            </tr>
                        ) : (
                            paginatedScans.map((scan, idx) => (
                                <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                                    <td style={{ padding: "8px", whiteSpace: "nowrap" }}>{format(scan.time, "yyyy-MM-dd HH:mm:ss")}</td>
                                    <td style={{ padding: "8px" }}>{scan.ligId}</td>
                                    <td style={{ padding: "8px", color: lightToSceneMap.has(scan.ligId) ? undefined : "#ccc" }}>
                                        {lightToSceneMap.has(scan.ligId) ? lightToSceneMap.get(scan.ligId)!.sceneId : "-"}
                                    </td>
                                    <td style={{ padding: "8px", wordBreak: "break-all", msWordBreak: "break-all" }}>{scan.clientId}</td>
                                    <td style={{ padding: "8px" }}>{scan.coordinateSystemId ?? "-"}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
