import { useState, useMemo } from "react";
import { format } from "date-fns";
import type { ClickRecord } from "../types";

interface ClickRawLogPageProps {
    clicks: ClickRecord[];
}

export function ClickRawLogPage({ clicks }: ClickRawLogPageProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const [showSummary, setShowSummary] = useState(true);
    const itemsPerPage = 100;

    // --- Summary: project prefixes (first 3 chars of codeName) ---
    const projectPrefixStats = useMemo(() => {
        const map = new Map<string, number>();
        for (const c of clicks) {
            const prefix = (c.codeName || "").slice(0, 3) || "???";
            map.set(prefix, (map.get(prefix) ?? 0) + 1);
        }
        return Array.from(map.entries())
            .map(([prefix, count]) => ({ prefix, count }))
            .sort((a, b) => b.count - a.count);
    }, [clicks]);

    // --- Summary: unique users + top 10 ---
    const userStats = useMemo(() => {
        const countMap = new Map<string, number>();
        const lastClickMap = new Map<string, Date>();
        for (const c of clicks) {
            const userId = (c.codeName || "").trim();
            if (!userId) continue;
            countMap.set(userId, (countMap.get(userId) ?? 0) + 1);
            const prev = lastClickMap.get(userId);
            if (!prev || c.time > prev) lastClickMap.set(userId, c.time);
        }
        const totalUniqueUsers = countMap.size;
        const top10 = Array.from(countMap.entries())
            .map(([userId, count]) => ({ userId, count, lastClick: lastClickMap.get(userId)! }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);
        return { totalUniqueUsers, top10 };
    }, [clicks]);

    const sortedClicks = useMemo(() => {
        return [...clicks].sort((a, b) => b.time.getTime() - a.time.getTime());
    }, [clicks]);

    const totalPages = Math.max(1, Math.ceil(sortedClicks.length / itemsPerPage));
    const validCurrentPage = Math.min(currentPage, totalPages);

    const paginatedClicks = useMemo(() => {
        const start = (validCurrentPage - 1) * itemsPerPage;
        return sortedClicks.slice(start, start + itemsPerPage);
    }, [sortedClicks, validCurrentPage, itemsPerPage]);

    const thStyle: React.CSSProperties = { padding: "6px 10px", textAlign: "left", borderBottom: "2px solid #ccc" };
    const tdStyle: React.CSSProperties = { padding: "5px 10px", borderBottom: "1px solid #eee" };

    return (
        <div className="panel panel--surface" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px", height: "calc(100vh - 120px)" }}>
            <h2>ClickRawLog</h2>

            {/* Collapsible Summary Section */}
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
                <span>📊 Click 統計摘要（{clicks.length.toLocaleString()} 筆紀錄）</span>
                <span style={{ fontSize: "12px", color: "#ccc" }}>{showSummary ? "▲ 收起" : "▼ 展開"}</span>
            </button>

            {showSummary && (
                <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                    {/* Table 1: Project Prefix Stats */}
                    <div style={{ flex: "1 1 300px", maxHeight: "280px", overflowY: "auto", border: "1px solid #ddd", borderRadius: "8px" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                            <thead style={{ position: "sticky", top: 0, backgroundColor: "#f5f7fa", zIndex: 1 }}>
                                <tr>
                                    <th colSpan={3} style={{ ...thStyle, textAlign: "center", backgroundColor: "#e8ecf1", fontWeight: 600 }}>
                                        Project 前綴統計（codeName 前 3 碼）
                                    </th>
                                </tr>
                                <tr>
                                    <th style={thStyle}>前綴</th>
                                    <th style={{ ...thStyle, textAlign: "right" }}>Log 次數</th>
                                    <th style={{ ...thStyle, textAlign: "right" }}>佔比</th>
                                </tr>
                            </thead>
                            <tbody>
                                {projectPrefixStats.map(({ prefix, count }) => (
                                    <tr key={prefix}>
                                        <td style={{ ...tdStyle, fontFamily: "monospace", fontWeight: 600 }}>{prefix}</td>
                                        <td style={{ ...tdStyle, textAlign: "right" }}>{count.toLocaleString()}</td>
                                        <td style={{ ...tdStyle, textAlign: "right", color: "#888" }}>
                                            {clicks.length > 0 ? ((count / clicks.length) * 100).toFixed(1) + "%" : "-"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Table 2: User Stats + Top 10 */}
                    <div style={{ flex: "1 1 300px", maxHeight: "280px", overflowY: "auto", border: "1px solid #ddd", borderRadius: "8px" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                            <thead style={{ position: "sticky", top: 0, backgroundColor: "#f5f7fa", zIndex: 1 }}>
                                <tr>
                                    <th colSpan={3} style={{ ...thStyle, textAlign: "center", backgroundColor: "#e8ecf1", fontWeight: 600 }}>
                                        User 排行榜（共 {userStats.totalUniqueUsers.toLocaleString()} 位用戶）
                                    </th>
                                </tr>
                                <tr>
                                    <th style={thStyle}>#</th>
                                    <th style={thStyle}>User ID</th>
                                    <th style={{ ...thStyle, textAlign: "right" }}>Click 次數</th>
                                    <th style={{ ...thStyle, textAlign: "right" }}>最新 Click</th>
                                </tr>
                            </thead>
                            <tbody>
                                {userStats.top10.map(({ userId, count, lastClick }, idx) => (
                                    <tr key={userId}>
                                        <td style={{ ...tdStyle, color: idx < 3 ? "#d4a017" : "#888", fontWeight: idx < 3 ? 700 : 400 }}>
                                            {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}`}
                                        </td>
                                        <td style={{ ...tdStyle, fontFamily: "monospace" }}>{userId}</td>
                                        <td style={{ ...tdStyle, textAlign: "right" }}>{count.toLocaleString()}</td>
                                        <td style={{ ...tdStyle, textAlign: "right", fontSize: "12px", color: "#666" }}>
                                            {format(lastClick, "yyyy/MM/dd HH:mm")}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Raw log table */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Total Records: {clicks.length.toLocaleString()}</span>
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
                            <th style={{ padding: "8px" }}>Code Name</th>
                            <th style={{ padding: "8px" }}>Object ID</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedClicks.length === 0 ? (
                            <tr>
                                <td colSpan={3} style={{ textAlign: "center", padding: "20px" }}>No data</td>
                            </tr>
                        ) : (
                            paginatedClicks.map((click, idx) => (
                                <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                                    <td style={{ padding: "8px", whiteSpace: "nowrap" }}>{format(click.time, "yyyy-MM-dd HH:mm:ss")}</td>
                                    <td style={{ padding: "8px" }}>{click.codeName}</td>
                                    <td style={{ padding: "8px" }}>{click.objId}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
