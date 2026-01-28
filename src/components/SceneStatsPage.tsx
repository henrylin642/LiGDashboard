import { useMemo } from "react";
import { useDashboardData } from "../context/DashboardDataContext";

interface SceneStats {
    sceneName: string;
    coordinateSystems: {
        id: number;
        name: string;
        lightIds: number[];
    }[];
    totalLights: number;
    clickCount: number; // Placeholder for now, hard to calculate without full object linking
}

export function SceneStatsPage() {
    const { status, data } = useDashboardData();

    const stats = useMemo(() => {
        if (status !== "ready" || !data) return [];

        const sceneMap = new Map<string, SceneStats>();

        // 1. Group Coordinate Systems by Scene
        // Note: Some coordinate systems might not have a scene name?
        const csByScene = new Map<string, typeof data.coordinateSystems>();

        data.coordinateSystems.forEach(cs => {
            const sceneName = cs.sceneName || "Unknown Scene";
            if (!csByScene.has(sceneName)) {
                csByScene.set(sceneName, []);
            }
            csByScene.get(sceneName)?.push(cs);
        });

        // 2. Map Lights to Coordinate Systems
        const lightsByCs = new Map<number, number[]>();
        data.lights.forEach(l => {
            if (l.coordinateSystemId) {
                if (!lightsByCs.has(l.coordinateSystemId)) {
                    lightsByCs.set(l.coordinateSystemId, []);
                }
                lightsByCs.get(l.coordinateSystemId)?.push(l.ligId);
            }
        });

        // 3. Build Stats
        csByScene.forEach((css, sceneName) => {
            const coordinateSystems = css.map(cs => {
                const lightIds = lightsByCs.get(cs.id) || [];
                return {
                    id: cs.id,
                    name: cs.name,
                    lightIds: lightIds.sort((a, b) => a - b)
                };
            });

            const totalLights = coordinateSystems.reduce((sum, cs) => sum + cs.lightIds.length, 0);

            // Clicks aggregation (if possible)
            // Currently clicks link to objId. We need objId -> sceneId mapping.
            // ArObjects are lazy loaded, so we might not have all of them.
            // We can try to use what we have.
            // Count relevant clicks
            // This is global, can be optimized

            // Iterate all clicks, check if their objId exists in data.arObjects
            // and if that arbObject has this sceneName.
            // This is efficient enough for small datasets.

            // Build objId -> sceneName map from available arObjects
            const objToScene = new Map<number, string>();
            data.arObjects.forEach(obj => {
                if (obj.sceneName) objToScene.set(obj.id, obj.sceneName);
            });

            // Count relevant clicks
            // This is global, can be optimized

            sceneMap.set(sceneName, {
                sceneName,
                coordinateSystems: coordinateSystems.sort((a, b) => a.name.localeCompare(b.name)),
                totalLights,
                clickCount: 0 // Will populate in a separate pass if needed, or efficiently below?
            });
        });

        // Populate click counts efficiently
        const objToScene = new Map<number, string>();
        data.arObjects.forEach(obj => {
            if (obj.sceneName) objToScene.set(obj.id, obj.sceneName);
        });

        data.clicks.forEach(click => {
            const sName = objToScene.get(click.objId);
            if (sName && sceneMap.has(sName)) {
                const s = sceneMap.get(sName)!;
                s.clickCount++;
            } else if (!sName) {
                // Click on unknown object or object not loaded
                // Maybe add to "Unknown" scene?
                // For now, ignore.
            }
        });

        return Array.from(sceneMap.values()).sort((a, b) => b.totalLights - a.totalLights);

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
                            <th style={{ padding: "0.5rem" }}>Scene Name</th>
                            <th style={{ padding: "0.5rem" }}>Coordinate Systems</th>
                            <th style={{ padding: "0.5rem" }}>Light IDs</th>
                            <th style={{ padding: "0.5rem" }}>Clicks (Loaded Objects)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stats.map((row) => (
                            <tr key={row.sceneName} style={{ borderBottom: "1px solid #eee", verticalAlign: "top" }}>
                                <td style={{ padding: "0.5rem", fontWeight: "bold" }}>{row.sceneName}</td>
                                <td style={{ padding: "0.5rem" }}>
                                    {row.coordinateSystems.map(cs => (
                                        <div key={cs.id} style={{ marginBottom: "0.5rem" }}>
                                            {cs.name} <span style={{ color: "#888", fontSize: "0.8em" }}>(ID: {cs.id})</span>
                                        </div>
                                    ))}
                                </td>
                                <td style={{ padding: "0.5rem" }}>
                                    {row.coordinateSystems.map(cs => (
                                        <div key={cs.id} style={{ marginBottom: "0.5rem", minHeight: "1.2em" }}>
                                            {cs.lightIds.length > 0 ? (
                                                <span style={{ fontFamily: "monospace", background: "#eee", padding: "2px 4px", borderRadius: "4px" }}>
                                                    {cs.lightIds.join(", ")}
                                                </span>
                                            ) : (
                                                <span style={{ color: "#ccc" }}>-</span>
                                            )}
                                        </div>
                                    ))}
                                </td>
                                <td style={{ padding: "0.5rem" }}>
                                    {row.clickCount > 0 ? row.clickCount.toLocaleString() : "-"}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p style={{ marginTop: "1rem", color: "#666", fontSize: "0.9em" }}>
                註：Clicks 統計僅包含已載入 AR 物件的點擊記錄。若需完整統計，請確保相關 LightID 的物件已載入。
                <br />
                目前 "Unknown Scene" 可能包含尚未綁定 Scene 的 Coordinate Systems。
            </p>
        </div>
    );
}
