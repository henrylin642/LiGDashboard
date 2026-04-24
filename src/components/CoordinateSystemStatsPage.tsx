import { useCallback, useEffect, useMemo, useState } from "react";
import { useDashboardData } from "../context/DashboardDataContext";

type SortField = 'id' | 'name' | 'sceneId';
type SortOrder = 'asc' | 'desc';
const LIG_API = "https://api.lig.com.tw";

export function CoordinateSystemStatsPage() {
    const { status, data } = useDashboardData();
    const [searchTerm, setSearchTerm] = useState("");
    const [sortField, setSortField] = useState<SortField>('id');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 50;
    const [lightToSceneMap, setLightToSceneMap] = useState<Map<number, { sceneId: number; sceneName: string }>>(new Map());

    const fetchSceneForLight = useCallback(async (lightId: number): Promise<{ sceneId: number; sceneName: string } | null> => {
        try {
            const res = await fetch(`${LIG_API}/api/v1/ar_objects_list/${lightId}`);
            if (!res.ok) return null;
            const payload = await res.json();
            const scenes = Array.isArray(payload) ? payload : payload?.scenes;
            if (!Array.isArray(scenes) || scenes.length === 0) return null;
            const first = scenes[0];
            const sceneId = Number(first.scene_id ?? first.id ?? 0);
            if (!sceneId) return null;
            return {
                sceneId,
                sceneName: String(first.scene_name ?? first.name ?? "").trim() || `Scene ${sceneId}`,
            };
        } catch {
            return null;
        }
    }, []);

    const uniqueLightIds = useMemo(() => {
        if (status !== "ready" || !data) return [];
        const ids = new Set<number>();
        data.coordinateSystems.forEach((cs) => cs.lightIds.forEach((id) => ids.add(id)));
        data.lights.forEach((light) => ids.add(light.ligId));
        return Array.from(ids).sort((a, b) => a - b);
    }, [status, data]);

    useEffect(() => {
        if (status !== "ready" || !data || uniqueLightIds.length === 0) return;

        let cancelled = false;
        const initialMap = new Map<number, { sceneId: number; sceneName: string }>();
        Object.entries(data.lightToSceneMap || {}).forEach(([lightIdRaw, scene]) => {
            const lightId = Number(lightIdRaw);
            if (!Number.isFinite(lightId) || !scene?.sceneId) return;
            initialMap.set(lightId, { sceneId: scene.sceneId, sceneName: scene.sceneName });
        });
        setLightToSceneMap(initialMap);

        const missingLightIds = uniqueLightIds.filter((lightId) => !initialMap.has(lightId));
        if (missingLightIds.length === 0) return;

        async function load() {
            const result = new Map(initialMap);
            const BATCH = 10;
            for (let i = 0; i < missingLightIds.length; i += BATCH) {
                if (cancelled) return;
                const batch = missingLightIds.slice(i, i + BATCH);
                const entries = await Promise.all(batch.map((lightId) => fetchSceneForLight(lightId)));
                batch.forEach((lightId, index) => {
                    const item = entries[index];
                    if (item) result.set(lightId, item);
                });
                if (!cancelled) {
                    setLightToSceneMap(new Map(result));
                }
            }
        }

        void load();
        return () => {
            cancelled = true;
        };
    }, [status, data, uniqueLightIds, fetchSceneForLight]);

    const stats = useMemo(() => {
        if (status !== "ready" || !data) return [];

        // Build a Scene map for quick name lookup
        const sceneMap = new Map<number, string>();
        data.scenes.forEach(s => {
            sceneMap.set(s.id, s.name);
        });

        const pushCandidate = (
            counter: Map<number, { count: number; sceneName: string }>,
            sceneId: number | null | undefined,
            sceneName: string | null | undefined
        ) => {
            if (!sceneId) return;
            const current = counter.get(sceneId);
            counter.set(sceneId, {
                count: (current?.count ?? 0) + 1,
                sceneName: sceneName?.trim() || current?.sceneName || sceneMap.get(sceneId) || `Scene ${sceneId}`,
            });
        };

        // Use the coordinateSystems from DashboardDataContext
        return data.coordinateSystems.map(cs => {
            let linkedSceneId = cs.sceneId;
            let sName = cs.sceneName;

            if ((!linkedSceneId || !sName) && linkedSceneId && sceneMap.has(linkedSceneId)) {
                sName = sceneMap.get(linkedSceneId)!;
            }

            if (!linkedSceneId) {
                const candidates = new Map<number, { count: number; sceneName: string }>();

                (cs.lightIds || []).forEach((lightId) => {
                    const mapped = lightToSceneMap.get(lightId);
                    if (mapped) {
                        pushCandidate(candidates, mapped.sceneId, mapped.sceneName);
                    }
                });

                data.lights.forEach((light) => {
                    if (light.coordinateSystemId !== cs.id) return;
                    const mapped = lightToSceneMap.get(light.ligId);
                    if (mapped) {
                        pushCandidate(candidates, mapped.sceneId, mapped.sceneName);
                    }
                });

                data.scans.forEach((scan) => {
                    if (scan.coordinateSystemId !== cs.id) return;
                    const mapped = lightToSceneMap.get(scan.ligId);
                    if (mapped) {
                        pushCandidate(candidates, mapped.sceneId, mapped.sceneName);
                    }
                });

                const bestMatch = Array.from(candidates.entries()).sort((a, b) => {
                    if (b[1].count !== a[1].count) return b[1].count - a[1].count;
                    return a[0] - b[0];
                })[0];

                if (bestMatch) {
                    linkedSceneId = bestMatch[0];
                    sName = bestMatch[1].sceneName;
                }
            }

            return {
                id: cs.id,
                name: cs.name,
                sceneId: linkedSceneId ?? null,
                sceneName: sName || (linkedSceneId ? `Scene ${linkedSceneId}` : "-"),
                lightIds: cs.lightIds || [],
            };
        });
    }, [status, data, lightToSceneMap]);

    const filteredStats = useMemo(() => {
        const lowerTerm = searchTerm.toLowerCase();
        return stats.filter(s =>
            s.name.toLowerCase().includes(lowerTerm) ||
            String(s.id).includes(searchTerm) ||
            (s.sceneName && s.sceneName.toLowerCase().includes(lowerTerm)) ||
            (s.sceneId && String(s.sceneId).includes(searchTerm))
        );
    }, [stats, searchTerm]);

    const sortedStats = useMemo(() => {
        return [...filteredStats].sort((a, b) => {
            let res = 0;
            if (sortField === 'id') res = (Number(a.id) || 0) - (Number(b.id) || 0);
            else if (sortField === 'name') res = a.name.localeCompare(b.name);
            else if (sortField === 'sceneId') res = (a.sceneId || 0) - (b.sceneId || 0);

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
            setSortOrder('desc'); // Usually desc when switching fields is good for IDs
        }
    };

    if (status === "loading") return <div style={{ padding: "2rem" }}>載入中...</div>;
    if (!data) return <div style={{ padding: "2rem" }}>無資料</div>;

    const totalPages = Math.ceil(filteredStats.length / pageSize);

    return (
        <div className="panel panel--surface">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h2 className="panel__title" style={{ marginBottom: 0 }}>Coordinate Systems</h2>
                <input
                    type="text"
                    placeholder="搜尋名稱、座標 ID 或 Scene ID..."
                    value={searchTerm}
                    onChange={e => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1); // Reset page on search
                    }}
                    style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc" }}
                />
            </div>

            <div className="table-container">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ borderBottom: "2px solid #eee", textAlign: "left", background: "#f9f9f9" }}>
                            <th
                                style={{ padding: "0.5rem", cursor: "pointer", width: "10%" }}
                                onClick={() => handleSort('id')}
                            >
                                Coordinate ID {sortField === 'id' && (sortOrder === 'asc' ? '↑' : '↓')}
                            </th>
                            <th
                                style={{ padding: "0.5rem", cursor: "pointer", width: "30%" }}
                                onClick={() => handleSort('name')}
                            >
                                Name {sortField === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
                            </th>
                            <th
                                style={{ padding: "0.5rem", cursor: "pointer", width: "25%" }}
                                onClick={() => handleSort('sceneId')}
                            >
                                Linked Scene {sortField === 'sceneId' && (sortOrder === 'asc' ? '↑' : '↓')}
                            </th>
                            <th style={{ padding: "0.5rem", width: "35%" }}>
                                Linked Light IDs
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedStats.map((row) => (
                            <tr key={row.id} style={{ borderBottom: "1px solid #eee", verticalAlign: "top" }}>
                                <td style={{ padding: "0.5rem", color: "#666" }}>{row.id}</td>
                                <td style={{ padding: "0.5rem", fontWeight: "bold" }}>{row.name}</td>
                                <td style={{ padding: "0.5rem" }}>
                                    {row.sceneId ? (
                                        <div>
                                            {row.sceneName} <span style={{ color: "#888", fontSize: "0.9em" }}>(ID: {row.sceneId})</span>
                                        </div>
                                    ) : (
                                        <span style={{ color: "#ccc" }}>未連結</span>
                                    )}
                                </td>
                                <td style={{ padding: "0.5rem" }}>
                                    {row.lightIds.length > 0 ? (
                                        <span
                                            title={row.lightIds.join(", ")}
                                            style={{
                                                fontFamily: "monospace",
                                                background: "#f5f5f5",
                                                padding: "2px 5px",
                                                borderRadius: "4px",
                                                display: "inline-block",
                                                maxWidth: "300px",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                                cursor: "help"
                                            }}
                                        >
                                            {row.lightIds.join(", ")}
                                        </span>
                                    ) : (
                                        <span style={{ color: "#ccc" }}>-</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {stats.length === 0 && (
                            <tr>
                                <td colSpan={4} style={{ padding: "1rem", textAlign: "center", color: "#888" }}>
                                    尚無 Coordinate System 資料。
                                </td>
                            </tr>
                        )}
                        {stats.length > 0 && paginatedStats.length === 0 && (
                            <tr>
                                <td colSpan={4} style={{ padding: "1rem", textAlign: "center", color: "#888" }}>
                                    找不到符合搜尋條件的資料。
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div style={{ marginTop: "1rem", display: "flex", justifyContent: "center", gap: "0.5rem" }}>
                    <button
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        style={{ padding: "0.5rem 1rem", cursor: currentPage === 1 ? "not-allowed" : "pointer" }}
                    >
                        上一頁
                    </button>
                    <span style={{ padding: "0.5rem" }}>第 {currentPage} / {totalPages} 頁</span>
                    <button
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        style={{ padding: "0.5rem 1rem", cursor: currentPage >= totalPages ? "not-allowed" : "pointer" }}
                    >
                        下一頁
                    </button>
                </div>
            )}

            <p style={{ marginTop: "1rem", color: "#666", fontSize: "0.8em" }}>
                註：這些座標資料是透過跨帳號的 API 快取統一彙整而來。
            </p>
        </div>
    );
}
