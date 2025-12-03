import { useState, useMemo } from "react";
import type { ProjectFunnelRow } from "../utils/stats";

interface ProjectFunnelTableProps {
    rows: ProjectFunnelRow[];
}

type SortKey = keyof ProjectFunnelRow;
type SortDirection = "asc" | "desc";

const formatPercent = (value: number | null, digits = 1) => {
    if (value === null) return "-";
    return `${(value * 100).toFixed(digits)}%`;
};

export function ProjectFunnelTable({ rows }: ProjectFunnelTableProps) {
    const [sortConfig, setSortConfig] = useState<{
        key: SortKey;
        direction: SortDirection;
    } | null>(null);

    const sortedRows = useMemo(() => {
        if (!sortConfig) return rows;
        return [...rows].sort((a, b) => {
            const aValue = a[sortConfig.key];
            const bValue = b[sortConfig.key];

            if (aValue === bValue) return 0;
            if (aValue === null || aValue === undefined) return 1;
            if (bValue === null || bValue === undefined) return -1;

            if (aValue < bValue) {
                return sortConfig.direction === "asc" ? -1 : 1;
            }
            if (aValue > bValue) {
                return sortConfig.direction === "asc" ? 1 : -1;
            }
            return 0;
        });
    }, [rows, sortConfig]);

    const requestSort = (key: SortKey) => {
        let direction: SortDirection = "desc"; // Default to desc for numbers usually
        if (
            sortConfig &&
            sortConfig.key === key &&
            sortConfig.direction === "desc"
        ) {
            direction = "asc";
        }
        setSortConfig({ key, direction });
    };

    const getSortIndicator = (key: SortKey) => {
        if (!sortConfig || sortConfig.key !== key) return null;
        return sortConfig.direction === "asc" ? " ▲" : " ▼";
    };

    return (
        <div className="table-wrapper">
            <table>
                <thead>
                    <tr>
                        <th
                            onClick={() => requestSort("projectName")}
                            style={{ cursor: "pointer", userSelect: "none" }}
                        >
                            Project{getSortIndicator("projectName")}
                        </th>
                        <th
                            onClick={() => requestSort("scans")}
                            style={{ cursor: "pointer", userSelect: "none" }}
                        >
                            Scans{getSortIndicator("scans")}
                        </th>
                        <th
                            onClick={() => requestSort("clicks")}
                            style={{ cursor: "pointer", userSelect: "none" }}
                        >
                            Clicks{getSortIndicator("clicks")}
                        </th>
                        <th
                            onClick={() => requestSort("newUsers")}
                            style={{ cursor: "pointer", userSelect: "none" }}
                        >
                            New Users{getSortIndicator("newUsers")}
                        </th>
                        <th
                            onClick={() => requestSort("activeUsers")}
                            style={{ cursor: "pointer", userSelect: "none" }}
                        >
                            Active Users{getSortIndicator("activeUsers")}
                        </th>
                        <th
                            onClick={() => requestSort("clickThroughRate")}
                            style={{ cursor: "pointer", userSelect: "none" }}
                        >
                            CTR{getSortIndicator("clickThroughRate")}
                        </th>
                        <th
                            onClick={() => requestSort("activationRate")}
                            style={{ cursor: "pointer", userSelect: "none" }}
                        >
                            Activation{getSortIndicator("activationRate")}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {sortedRows.map((row) => (
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
    );
}
