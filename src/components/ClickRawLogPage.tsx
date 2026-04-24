import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import type { ArObjectRecord, ClickRecord } from "../types";
import { fetchArObjectById } from "../services/ligApi";

const LIG_API = "https://api.lig.com.tw";

interface ClickRawLogPageProps {
    clicks: ClickRecord[];
    arObjects: ArObjectRecord[];
}

export function ClickRawLogPage({ clicks, arObjects }: ClickRawLogPageProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const [showSummary, setShowSummary] = useState(false);
    const [fetchedArObjects, setFetchedArObjects] = useState<Record<number, ArObjectRecord | null>>({});
    const [loadingObjectIds, setLoadingObjectIds] = useState<number[]>([]);
    const itemsPerPage = 100;
    const currentYear = new Date().getFullYear();
    const internalTestAccountId = "00054855";

    async function fetchArObjectByIdDirect(objId: number): Promise<ArObjectRecord | null> {
        try {
            const response = await fetch(`${LIG_API}/api/v1/ar_objects/${encodeURIComponent(String(objId))}`);
            if (!response.ok) return null;

            const item = await response.json();
            const sceneIdRaw = item.scene_id ?? item.sceneId ?? item.scene?.id ?? item.scene?.scene_id ?? null;
            const sceneName = item.scene_name ?? item.sceneName ?? item.scene?.name ?? item.scene?.scene_name ?? null;
            const location = item.location;

            return {
                id: Number(item.id ?? item.obj_id ?? objId),
                name: String(item.name ?? item.obj_name ?? objId).trim(),
                sceneId: sceneIdRaw === null || sceneIdRaw === undefined ? null : Number(sceneIdRaw),
                sceneName: sceneName ? String(sceneName).trim() : null,
                locationX: location?.x ?? location?.X ?? null,
                locationY: location?.y ?? location?.Y ?? null,
                locationZ: location?.z ?? location?.Z ?? null,
            };
        } catch {
            return null;
        }
    }

    const projectPrefixStats = useMemo(() => {
        const map = new Map<string, number>();
        for (const click of clicks) {
            const prefix = (click.codeName || "").slice(0, 3) || "N/A";
            map.set(prefix, (map.get(prefix) ?? 0) + 1);
        }

        return Array.from(map.entries())
            .map(([prefix, count]) => ({ prefix, count }))
            .sort((a, b) => b.count - a.count);
    }, [clicks]);

    const userStats = useMemo(() => {
        const currentYearClicks = clicks.filter((click) => click.time.getFullYear() === currentYear);
        const countMap = new Map<string, number>();
        const lastClickMap = new Map<string, Date>();

        for (const click of currentYearClicks) {
            const userId = (click.codeName || "").trim();
            if (!userId) continue;

            countMap.set(userId, (countMap.get(userId) ?? 0) + 1);
            const previousClick = lastClickMap.get(userId);
            if (!previousClick || click.time > previousClick) {
                lastClickMap.set(userId, click.time);
            }
        }

        const totalUniqueUsers = countMap.size;
        const top10 = Array.from(countMap.entries())
            .map(([userId, count]) => ({
                userId,
                count,
                lastClick: lastClickMap.get(userId)!,
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        return { totalUniqueUsers, top10 };
    }, [clicks, currentYear]);

    const sortedClicks = useMemo(() => [...clicks].sort((a, b) => b.time.getTime() - a.time.getTime()), [clicks]);
    const arObjectLookup = useMemo(() => {
        const lookup = new Map<number, ArObjectRecord>();
        for (const arObject of arObjects) {
            lookup.set(arObject.id, arObject);
        }
        return lookup;
    }, [arObjects]);

    const totalPages = Math.max(1, Math.ceil(sortedClicks.length / itemsPerPage));
    const validCurrentPage = Math.min(currentPage, totalPages);

    const paginatedClicks = useMemo(() => {
        const start = (validCurrentPage - 1) * itemsPerPage;
        return sortedClicks.slice(start, start + itemsPerPage);
    }, [sortedClicks, validCurrentPage]);
    const visibleObjectIds = useMemo(
        () => Array.from(new Set(paginatedClicks.map((click) => click.objId))),
        [paginatedClicks]
    );

    useEffect(() => {
        if (typeof window === "undefined") return;

        const token = window.localStorage.getItem("lig_token") ?? "";
        if (!token) return;

        const missingObjectIds = visibleObjectIds.filter(
            (objId) =>
                !arObjectLookup.has(objId) &&
                !(objId in fetchedArObjects) &&
                !loadingObjectIds.includes(objId)
        );
        if (missingObjectIds.length === 0) return;

        let isCancelled = false;
        setLoadingObjectIds((prev) => Array.from(new Set([...prev, ...missingObjectIds])));

        async function loadMissingObjects() {
            const entries = await Promise.all(
                missingObjectIds.map(async (objId) => {
                    try {
                        const result = await fetchArObjectById(String(objId), token);
                        if (result) {
                            return [
                                objId,
                                {
                                    id: Number(result.id),
                                    name: result.name,
                                    sceneId: result.sceneId,
                                    sceneName: result.sceneName,
                                    locationX: result.location?.x ?? null,
                                    locationY: result.location?.y ?? null,
                                    locationZ: result.location?.z ?? null,
                                } satisfies ArObjectRecord,
                            ] as const;
                        }

                        const directResult = await fetchArObjectByIdDirect(objId);
                        return [objId, directResult] as const;
                    } catch (error) {
                        console.warn(`Failed to resolve object ${objId}`, error);
                        return [objId, null] as const;
                    }
                })
            );

            if (isCancelled) return;

            setFetchedArObjects((prev) => {
                const next = { ...prev };
                for (const [objId, record] of entries) {
                    next[objId] = record;
                }
                return next;
            });

            setLoadingObjectIds((prev) => prev.filter((objId) => !missingObjectIds.includes(objId)));
        }

        void loadMissingObjects();

        return () => {
            isCancelled = true;
        };
    }, [arObjectLookup, fetchedArObjects, loadingObjectIds, visibleObjectIds]);

    const thStyle: React.CSSProperties = { padding: "6px 10px", textAlign: "left", borderBottom: "2px solid #ccc" };
    const tdStyle: React.CSSProperties = { padding: "5px 10px", borderBottom: "1px solid #eee" };

    return (
        <div
            className="panel panel--surface"
            style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px", height: "calc(100vh - 120px)" }}
        >
            <h2>Click Raw Log</h2>

            <button
                type="button"
                onClick={() => setShowSummary(!showSummary)}
                style={{
                    background: "#3a5a8c",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 16px",
                    cursor: "pointer",
                    fontSize: "14px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                }}
            >
                <span>Click 統計摘要（共 {clicks.length.toLocaleString()} 筆紀錄）</span>
                <span style={{ fontSize: "12px", color: "#ccc" }}>{showSummary ? "收合" : "展開"}</span>
            </button>

            {showSummary && (
                <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", flexShrink: 0 }}>
                    <div style={{ flex: "1 1 300px", maxHeight: "180px", overflowY: "auto", border: "1px solid #ddd", borderRadius: "8px" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                            <thead style={{ position: "sticky", top: 0, backgroundColor: "#f5f7fa", zIndex: 1 }}>
                                <tr>
                                    <th colSpan={3} style={{ ...thStyle, textAlign: "center", backgroundColor: "#e8ecf1", fontWeight: 600 }}>
                                        Project Prefix 排行榜（codeName 前 3 碼）
                                    </th>
                                </tr>
                                <tr>
                                    <th style={thStyle}>Prefix</th>
                                    <th style={{ ...thStyle, textAlign: "right" }}>Log 次數</th>
                                    <th style={{ ...thStyle, textAlign: "right" }}>占比</th>
                                </tr>
                            </thead>
                            <tbody>
                                {projectPrefixStats.map(({ prefix, count }) => (
                                    <tr key={prefix}>
                                        <td style={{ ...tdStyle, fontFamily: "monospace", fontWeight: 600 }}>{prefix}</td>
                                        <td style={{ ...tdStyle, textAlign: "right" }}>{count.toLocaleString()}</td>
                                        <td style={{ ...tdStyle, textAlign: "right", color: "#888" }}>
                                            {clicks.length > 0 ? `${((count / clicks.length) * 100).toFixed(1)}%` : "-"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div style={{ flex: "1 1 300px", maxHeight: "180px", overflowY: "auto", border: "1px solid #ddd", borderRadius: "8px" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                            <thead style={{ position: "sticky", top: 0, backgroundColor: "#f5f7fa", zIndex: 1 }}>
                                <tr>
                                    <th colSpan={4} style={{ ...thStyle, textAlign: "center", backgroundColor: "#e8ecf1", fontWeight: 600 }}>
                                        {currentYear}年User 排行榜（共 {userStats.totalUniqueUsers.toLocaleString()} 位用戶）
                                    </th>
                                </tr>
                                <tr>
                                    <th style={thStyle}>#</th>
                                    <th style={thStyle}>User ID</th>
                                    <th style={{ ...thStyle, textAlign: "right" }}>Click 次數</th>
                                    <th style={{ ...thStyle, textAlign: "right" }}>最後點擊</th>
                                </tr>
                            </thead>
                            <tbody>
                                {userStats.top10.map(({ userId, count, lastClick }, idx) => (
                                    <tr key={userId}>
                                        <td style={{ ...tdStyle, color: idx < 3 ? "#d4a017" : "#888", fontWeight: idx < 3 ? 700 : 400 }}>
                                            {idx === 0 ? "1" : idx === 1 ? "2" : idx === 2 ? "3" : `${idx + 1}`}
                                        </td>
                                        <td style={{ ...tdStyle, fontFamily: "monospace" }}>
                                            {userId}
                                            {userId === internalTestAccountId ? "（內部測試帳號）" : ""}
                                        </td>
                                        <td style={{ ...tdStyle, textAlign: "right" }}>{count.toLocaleString()}</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontSize: "12px", color: "#666" }}>
                                            {format(lastClick, "yyyy/MM/dd HH:mm")}
                                        </td>
                                    </tr>
                                ))}
                                {userStats.top10.length === 0 && (
                                    <tr>
                                        <td colSpan={4} style={{ ...tdStyle, textAlign: "center", color: "#888" }}>
                                            當年尚無用戶點擊資料
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Total Records: {clicks.length.toLocaleString()}</span>
                <div>
                    <button
                        type="button"
                        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                        disabled={validCurrentPage === 1}
                        style={{ marginRight: "10px", padding: "4px 8px" }}
                    >
                        Previous
                    </button>
                    <span>Page {validCurrentPage} of {totalPages}</span>
                    <button
                        type="button"
                        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                        disabled={validCurrentPage === totalPages}
                        style={{ marginLeft: "10px", padding: "4px 8px" }}
                    >
                        Next
                    </button>
                </div>
            </div>

            <div className="table-wrapper" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
                    <thead style={{ position: "sticky", top: 0, backgroundColor: "#fff", zIndex: 1, borderBottom: "2px solid #ddd" }}>
                        <tr>
                            <th style={{ padding: "8px" }}>Time</th>
                            <th style={{ padding: "8px" }}>Code Name</th>
                            <th style={{ padding: "8px" }}>Object ID</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedClicks.length === 0 ? (
                            <tr>
                                <td colSpan={3} style={{ textAlign: "center", padding: "20px" }}>
                                    No data
                                </td>
                            </tr>
                        ) : (
                            paginatedClicks.map((click, idx) => {
                                const arObject = arObjectLookup.get(click.objId) ?? fetchedArObjects[click.objId];
                                const isLoading = loadingObjectIds.includes(click.objId);

                                return (
                                    <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                                        <td style={{ padding: "8px", whiteSpace: "nowrap" }}>{format(click.time, "yyyy-MM-dd HH:mm:ss")}</td>
                                        <td style={{ padding: "8px" }}>{click.codeName}</td>
                                        <td style={{ padding: "8px" }}>
                                            <div style={{ fontFamily: "monospace" }}>{click.objId}</div>
                                            <div style={{ fontSize: "12px", color: "#666" }}>
                                                {arObject?.sceneId != null
                                                    ? `scene_id: ${arObject.sceneId} | scene_name: ${arObject.sceneName ?? "-"}`
                                                    : isLoading
                                                        ? "loading scene..."
                                                        : "scene_id: - | scene_name: -"}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
