import { useMemo, useState } from "react";
import { useDashboardData } from "../context/DashboardDataContext";

// SceneStatsPage.tsx
interface SceneStats {
    sceneId: number;
    sceneName: string;
    coordinateSystems: {
        id: number;
        name: string;
        lightIds: number[];
    }[];
    totalLights: number;
    clickCount: number | null; // null means not loaded yet? No, click log is loaded. null means probably 0.
}

type SortField = 'sceneId' | 'sceneName' | 'clickCount';
type SortOrder = 'asc' | 'desc';

export function SceneStatsPage() {
    const { status, data } = useDashboardData();
    const [searchTerm, setSearchTerm] = useState("");
    const [sortField, setSortField] = useState<SortField>('sceneId');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 50;

    const stats = useMemo(() => {
        if (status !== "ready" || !data) return [];

        // Pre-calculate CS map to avoid O(N*M)
        const csBySceneId = new Map<number, typeof data.coordinateSystems>();
        data.coordinateSystems.forEach(cs => {
            const sid = cs.sceneId;
            if (sid) {
                const list = csBySceneId.get(sid) || [];
                list.push(cs);
                csBySceneId.set(sid, list);
            }
        });

        // Optimize Click Counting: Iterate clicks once
        const clickMap = new Map<number, number>();
        // We need Obj -> Scene map.
        const objToScene = new Map<number, number>();
        data.arObjects.forEach(o => {
            if (o.sceneId) objToScene.set(o.id, o.sceneId);
        });

        data.clicks.forEach(c => {
            const sId = objToScene.get(c.objId);
            if (sId) {
                clickMap.set(sId, (clickMap.get(sId) || 0) + 1);
            }
        });

        // 1. Start with ALL scenes
        return data.scenes.map((scene): SceneStats => {
            const sceneId = scene.id;

            // Find linked Coordinate Systems (O(1) lookup)
            const linkedCS = csBySceneId.get(sceneId) || [];

            // Collect all lights known to be in this scene from `sceneToLightIds`
            const knownLightsInScene = new Set(data.sceneToLightIds[sceneId] || []);

            const csStats = linkedCS.map(cs => {
                // Remove these lights from the "Unlinked Set"
                cs.lightIds.forEach(id => knownLightsInScene.delete(id));
                return {
                    id: cs.id,
                    name: cs.name,
                    lightIds: cs.lightIds
                };
            });

            // Any remaining lights are unlinked
            if (knownLightsInScene.size > 0) {
                csStats.push({
                    id: -1,
                    name: "Unlinked Lights (無座標系)",
                    lightIds: Array.from(knownLightsInScene).sort((a, b) => a - b)
                });
            }

            return {
                sceneId,
                sceneName: scene.name,
                coordinateSystems: csStats.sort((a, b) => a.name.localeCompare(b.name)),
                totalLights: (data.sceneToLightIds[sceneId] || []).length,
                clickCount: clickMap.get(sceneId) || 0
            };
        });
    }, [status, data]);

    const filteredStats = useMemo(() => {
        return stats.filter(s =>
            s.sceneName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            String(s.sceneId).includes(searchTerm)
        );
    }, [stats, searchTerm]);

    const sortedStats = useMemo(() => {
        return [...filteredStats].sort((a, b) => {
            let res = 0;
            if (sortField === 'sceneId') res = a.sceneId - b.sceneId;
            else if (sortField === 'sceneName') res = a.sceneName.localeCompare(b.sceneName);
            else if (sortField === 'clickCount') res = (a.clickCount || 0) - (b.clickCount || 0);

            return sortOrder === 'asc' ? res : -res;
        });
    }, [filteredStats, sortField, sortOrder]);

    const paginatedStats = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return sortedStats.slice(start, start + pageSize);
    }, [sortedStats, currentPage]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('desc'); // Default desc for new field? Usually asc, but for stats desc number is better.
        }
    };

    if (status === "loading") return <div style={{ padding: "2rem" }}>載入中...</div>;
    if (!data) return <div style={{ padding: "2rem" }}>無資料</div>;

    const totalPages = Math.ceil(filteredStats.length / pageSize);

    return (
        <div className="panel panel--surface">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h2 className="panel__title" style={{ marginBottom: 0 }}>Scene Analysis</h2>
                <input
                    type="text"
                    placeholder="搜尋 Scene ID 或名稱..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc" }}
                />
            </div>

            <div className="table-container">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ borderBottom: "2px solid #eee", textAlign: "left", background: "#f9f9f9" }}>
                            <th
                                style={{ padding: "0.5rem", cursor: "pointer" }}
                                onClick={() => handleSort('sceneId')}
                            >
                                Scene ID {sortField === 'sceneId' && (sortOrder === 'asc' ? '↑' : '↓')}
                            </th>
                            <th
                                style={{ padding: "0.5rem", cursor: "pointer" }}
                                onClick={() => handleSort('sceneName')}
                            >
                                Scene Name {sortField === 'sceneName' && (sortOrder === 'asc' ? '↑' : '↓')}
                            </th>
                            <th style={{ padding: "0.5rem" }}>Coordinate Systems (ID + Name)</th>
                            <th style={{ padding: "0.5rem" }}>Light IDs</th>
                            <th
                                style={{ padding: "0.5rem", cursor: "pointer" }}
                                onClick={() => handleSort('clickCount')}
                            >
                                Clicks {sortField === 'clickCount' && (sortOrder === 'asc' ? '↑' : '↓')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedStats.map((row) => (
                            <tr key={row.sceneId} style={{ borderBottom: "1px solid #eee", verticalAlign: "top" }}>
                                <td style={{ padding: "0.5rem", color: "#666" }}>{row.sceneId}</td>
                                <td style={{ padding: "0.5rem", fontWeight: "bold" }}>{row.sceneName}</td>
                                <td style={{ padding: "0.5rem" }}>
                                    {row.coordinateSystems.map(cs => (
                                        <div key={cs.id} style={{ marginBottom: "0.5rem", whiteSpace: "nowrap" }}>
                                            {cs.name} <span style={{ color: "#888", fontSize: "0.9em" }}>(ID: {cs.id})</span>
                                        </div>
                                    ))}
                                    {row.coordinateSystems.length === 0 && <span style={{ color: "#ccc" }}>-</span>}
                                </td>
                                <td style={{ padding: "0.5rem" }}>
                                    {row.coordinateSystems.map(cs => (
                                        <div key={cs.id} style={{ marginBottom: "0.5rem", minHeight: "1.2em" }}>
                                            {cs.lightIds.length > 0 ? (
                                                <span
                                                    title={cs.lightIds.join(", ")}
                                                    style={{
                                                        fontFamily: "monospace",
                                                        background: "#f5f5f5",
                                                        padding: "2px 5px",
                                                        borderRadius: "4px",
                                                        display: "inline-block",
                                                        maxWidth: "200px",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        whiteSpace: "nowrap",
                                                        cursor: "help"
                                                    }}
                                                >
                                                    {cs.lightIds.join(", ")}
                                                </span>
                                            ) : (
                                                <span style={{ color: "#ccc" }}>-</span>
                                            )}
                                        </div>
                                    ))}
                                    {row.coordinateSystems.length === 0 && <span style={{ color: "#ccc" }}>-</span>}
                                </td>
                                <td style={{ padding: "0.5rem" }}>
                                    {row.clickCount !== 0 ? row.clickCount?.toLocaleString() : <span style={{ color: "#ccc" }}>-</span>}
                                </td>
                            </tr>
                        ))}
                        {stats.length === 0 && (
                            <tr>
                                <td colSpan={5} style={{ padding: "1rem", textAlign: "center", color: "#888" }}>
                                    尚無 Scene 資料。
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div style={{ marginTop: "1rem", display: "flex", justifyContent: "center", gap: "0.5rem" }}>
                <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    style={{ padding: "0.5rem 1rem", cursor: currentPage === 1 ? "not-allowed" : "pointer" }}
                >
                    Previous
                </button>
                <span style={{ padding: "0.5rem" }}>Page {currentPage} of {totalPages || 1}</span>
                <button
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    style={{ padding: "0.5rem 1rem", cursor: currentPage >= totalPages ? "not-allowed" : "pointer" }}
                >
                    Next
                </button>
            </div>

            <p style={{ marginTop: "1rem", color: "#666", fontSize: "0.8em" }}>
                註：Clicks 資料來自歷史點擊紀錄 (obj_click_log.csv)，需等待 AR 物件對應表載入完成後才能正確統計。
            </p>
        </div>
    );
}
