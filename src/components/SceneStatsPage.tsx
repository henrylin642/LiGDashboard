import { useMemo } from "react";
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
    clickCount: number;
}

export function SceneStatsPage() {
    const { status, data } = useDashboardData();

    const stats = useMemo(() => {
        if (status !== "ready" || !data) return [];

        const sceneMap = new Map<number, SceneStats>();

        // Helper to get Scene Name by ID (from loaded AR objects)
        const sceneNames = new Map<number, string>();

        data.arObjects.forEach(obj => {
            if (obj.sceneId && obj.sceneName) {
                sceneNames.set(obj.sceneId, obj.sceneName);
            }
        });

        // 1. Iterate sceneToLightIds to build the base map
        Object.entries(data.sceneToLightIds).forEach(([sIdStr, lightIds]) => {
            const sceneId = Number(sIdStr);
            const sceneName = sceneNames.get(sceneId) || `Scene #${sceneId}`;

            // Determine Coordinate Systems for these lights
            const csMap = new Map<number, { id: number; name: string; lightIds: number[] }>();

            lightIds.forEach(lid => {
                const light = data.lights.find(l => l.ligId === lid);
                // Use -1 for lights without a coordinate system
                const csId = light?.coordinateSystemId ?? -1;
                const csName = light?.coordinateSystemName;

                if (!csMap.has(csId)) {
                    let name = "Unknown CS";
                    if (csId === -1) {
                        name = "Unlinked Lights (無座標系)";
                    } else if (csName) {
                        name = csName;
                    } else {
                        const cs = data.coordinateSystems.find(c => c.id === csId);
                        name = cs ? cs.name : `CS #${csId}`;
                    }

                    csMap.set(csId, {
                        id: csId,
                        name,
                        lightIds: []
                    });
                }
                csMap.get(csId)!.lightIds.push(lid);
            });

            const coordinateSystems = Array.from(csMap.values()).sort((a, b) => a.name.localeCompare(b.name));
            coordinateSystems.forEach(cs => cs.lightIds.sort((a, b) => a - b));

            sceneMap.set(sceneId, {
                sceneId,
                sceneName,
                coordinateSystems,
                totalLights: lightIds.length,
                clickCount: 0
            });
        });

        // 2. Count Clicks
        data.clicks.forEach(click => {
            const obj = data.arObjects.find(o => o.id === click.objId);
            if (obj && obj.sceneId && sceneMap.has(obj.sceneId)) {
                sceneMap.get(obj.sceneId)!.clickCount++;
            }
        });

        return Array.from(sceneMap.values()).sort((a, b) => {
            // Sort by Scene Name, but "Scene #" at the end
            if (a.sceneName.startsWith("Scene #") && !b.sceneName.startsWith("Scene #")) return 1;
            if (!a.sceneName.startsWith("Scene #") && b.sceneName.startsWith("Scene #")) return -1;
            return a.sceneName.localeCompare(b.sceneName);
        });

    }, [status, data]);

    if (status === "loading") return <div>載入中...</div>;
    if (!data) return <div>無資料</div>;

    return (
        <div className="panel panel--surface">
            <h2 className="panel__title">Scene / Coordinate / LightID 關聯表</h2>
            <div className="table-container">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ borderBottom: "2px solid #eee", textAlign: "left" }}>
                            <th style={{ padding: "0.5rem" }}>Scene ID</th>
                            <th style={{ padding: "0.5rem" }}>Scene Name</th>
                            <th style={{ padding: "0.5rem" }}>Coordinate Systems (ID + Name)</th>
                            <th style={{ padding: "0.5rem" }}>Light IDs</th>
                            <th style={{ padding: "0.5rem" }}>Clicks</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stats.map((row) => (
                            <tr key={row.sceneId} style={{ borderBottom: "1px solid #eee", verticalAlign: "top" }}>
                                <td style={{ padding: "0.5rem", color: "#666" }}>{row.sceneId}</td>
                                <td style={{ padding: "0.5rem", fontWeight: "bold" }}>{row.sceneName}</td>
                                <td style={{ padding: "0.5rem" }}>
                                    {row.coordinateSystems.map(cs => (
                                        <div key={cs.id} style={{ marginBottom: "0.5rem" }}>
                                            {cs.name} <span style={{ color: "#888", fontSize: "0.9em" }}>(ID: {cs.id})</span>
                                        </div>
                                    ))}
                                    {row.coordinateSystems.length === 0 && <span style={{ color: "#ccc" }}>-</span>}
                                </td>
                                <td style={{ padding: "0.5rem" }}>
                                    {row.coordinateSystems.map(cs => (
                                        <div key={cs.id} style={{ marginBottom: "0.5rem", minHeight: "1.2em" }}>
                                            {cs.lightIds.length > 0 ? (
                                                <span style={{ fontFamily: "monospace", background: "#f5f5f5", padding: "2px 5px", borderRadius: "4px" }}>
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
                                    {row.clickCount > 0 ? row.clickCount.toLocaleString() : "-"}
                                </td>
                            </tr>
                        ))}
                        {stats.length === 0 && (
                            <tr>
                                <td colSpan={5} style={{ padding: "1rem", textAlign: "center", color: "#888" }}>
                                    尚無 Scene 資料。請確認已載入相關專案的 LightID 資料。
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            <p style={{ marginTop: "1rem", color: "#666", fontSize: "0.9em" }}>
                註：此表基於已載入的 AR 物件與 LightID 反向建立關聯。若某些 Scene 無 AR 物件或尚未載入，則不會顯示。
            </p>
        </div>
    );
}
