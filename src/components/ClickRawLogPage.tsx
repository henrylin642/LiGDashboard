import { useState, useMemo } from "react";
import { format } from "date-fns";
import type { ClickRecord } from "../types";

interface ClickRawLogPageProps {
    clicks: ClickRecord[];
}

export function ClickRawLogPage({ clicks }: ClickRawLogPageProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 100;

    const totalPages = Math.max(1, Math.ceil(clicks.length / itemsPerPage));

    // Ensure current page is within visible bounds if data changes
    const validCurrentPage = Math.min(currentPage, totalPages);

    const paginatedClicks = useMemo(() => {
        const start = (validCurrentPage - 1) * itemsPerPage;
        return clicks.slice(start, start + itemsPerPage);
    }, [clicks, validCurrentPage, itemsPerPage]);

    return (
        <div className="panel panel--surface" style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px", height: "calc(100vh - 120px)" }}>
            <h2>ClickRawLog</h2>
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
