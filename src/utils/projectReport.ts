import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import type { Project } from "../types";
import type {
  ClickRankingRow,
  DailyClickPoint,
  DailyScanPoint,
} from "./stats";
import type { UserAcquisitionPoint } from "./stats";

interface ProjectReportParams {
  project: Project;
  dateRangeLabel: string;
  scansInRange: number;
  clicksInRange: number;
  uniqueUsersInRange: number;
  dailyScanSeries: DailyScanPoint[];
  dailyClickSeries: DailyClickPoint[];
  clickRanking: ClickRankingRow[];
  userAcquisitionSeries: UserAcquisitionPoint[];
  reportedBy?: string;
}

const numberFormatter = new Intl.NumberFormat("en-US");
const REPORT_FONT_FILE = "NotoSansTC-VariableFont_wght.ttf";
const REPORT_FONT_NAME = "NotoSansTC";
const REPORT_FONT_URL = `/fonts/${REPORT_FONT_FILE}`;
let reportFontDataPromise: Promise<string> | null = null;

export async function generateProjectReportPdf({
  project,
  dateRangeLabel,
  scansInRange,
  clicksInRange,
  uniqueUsersInRange,
  dailyScanSeries,
  dailyClickSeries,
  clickRanking,
  userAcquisitionSeries,
  reportedBy = "Light Generation Co. Ltd.",
}: ProjectReportParams): Promise<void> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
  });
  const margin = 36;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  let cursorY = margin;

  await ensureReportFont(doc);

  // Title block
  doc.setFont(REPORT_FONT_NAME, "bold");
  doc.setFontSize(18);
  doc.text(`${project.name} — Project Report`, margin, cursorY);
  doc.setFont(REPORT_FONT_NAME, "normal");
  doc.setFontSize(10);
  cursorY += 16;
  doc.text(`Reporting Window: ${dateRangeLabel}`, margin, cursorY);
  const generatedAt = format(new Date(), "yyyy-MM-dd HH:mm");
  doc.text(`Generated ${generatedAt}`, pageWidth - margin, cursorY, {
    align: "right",
  });
  cursorY += 24;

  cursorY = drawSectionHeading(doc, "Project Detail", margin, contentWidth, cursorY);
  cursorY = drawProjectDetailTable(doc, project, margin, contentWidth, cursorY);

  cursorY = drawSectionHeading(doc, "Project Overview", margin, contentWidth, cursorY + 6);
  cursorY = drawOverviewTable(
    doc,
    dateRangeLabel,
    scansInRange,
    clicksInRange,
    uniqueUsersInRange,
    margin,
    contentWidth,
    cursorY
  );

  cursorY = drawSectionHeading(doc, "Scan Analytics", margin, contentWidth, cursorY + 10);
  cursorY += 8;
  cursorY = drawTrendCard(doc, {
    title: `Daily Scan Trend (${dateRangeLabel})`,
    series: dailyScanSeries.map((point) => ({
      label: format(point.date, "MM-dd"),
      value: point.total,
    })),
    x: margin,
    y: cursorY,
    width: contentWidth,
    height: 140,
    stroke: { r: 31, g: 119, b: 180 },
    summaryLabel: buildSummaryText(dailyScanSeries),
  }) + 24;

  cursorY = drawSectionHeading(doc, "Interactions", margin, contentWidth, cursorY);
  cursorY += 8;
  cursorY = drawTrendCard(doc, {
    title: `Daily Click Trend (${dateRangeLabel})`,
    series: dailyClickSeries.map((point) => ({
      label: format(point.date, "MM-dd"),
      value: point.total,
    })),
    x: margin,
    y: cursorY,
    width: contentWidth,
    height: 140,
    stroke: { r: 44, g: 160, b: 44 },
    summaryLabel: buildSummaryText(dailyClickSeries),
  }) + 24;

  if (cursorY + 220 > pageHeight - margin) {
    doc.addPage();
    cursorY = margin;
  }

  cursorY = drawSectionHeading(doc, "User Acquisition", margin, contentWidth, cursorY);
  cursorY += 8;
  cursorY = drawTrendCard(doc, {
    title: `Daily New User Trend (${dateRangeLabel})`,
    series: userAcquisitionSeries.map((point) => ({
      label: format(point.date, "MM-dd"),
      value: point.newUsers,
    })),
    x: margin,
    y: cursorY,
    width: contentWidth,
    height: 140,
    stroke: { r: 128, g: 0, b: 128 },
    summaryLabel: buildSummaryText(
      userAcquisitionSeries.map((point) => ({ total: point.newUsers }))
    ),
  }) + 24;

  if (cursorY + 160 > pageHeight - margin) {
    doc.addPage();
    cursorY = margin;
  }
  cursorY = drawSectionHeading(
    doc,
    "Interactions — Top AR Objects",
    margin,
    contentWidth,
    cursorY
  );
  cursorY = drawInteractionTable(
    doc,
    clickRanking,
    margin,
    contentWidth,
    cursorY
  ) + 20;

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    drawFooter(doc, {
      margin,
      pageNumber: page,
      pageCount,
      reportedBy,
    });
  }

  const filename = `ProjectReport_${project.projectId}_${format(
    new Date(),
    "yyyyMMdd_HHmm"
  )}.pdf`;
  doc.save(filename);
}

function drawSectionHeading(
  doc: jsPDF,
  text: string,
  margin: number,
  width: number,
  cursorY: number
): number {
  doc.setFillColor(79, 154, 195);
  doc.setTextColor(255, 255, 255);
  doc.setFont(REPORT_FONT_NAME, "bold");
  doc.setFontSize(12);
  doc.roundedRect(margin, cursorY, width, 22, 6, 6, "F");
  doc.text(text, margin + 10, cursorY + 15);
  doc.setTextColor(11, 31, 51);
  return cursorY + 32;
}

function drawProjectDetailTable(
  doc: jsPDF,
  project: Project,
  margin: number,
  width: number,
  startY: number
): number {
  const detailRows: Array<[string, string]> = [
    ["Project Name", project.name],
    ["Start Date", formatDate(project.startDate)],
    ["End Date", formatDate(project.endDate)],
    [
      "Coordinate",
      project.coordinates.length > 0 ? project.coordinates.join(" / ") : "-",
    ],
    [
      "Scenes List",
      project.scenes.length > 0 ? project.scenes.join(", ") : "-",
    ],
    [
      "Light ID",
      project.lightIds.length > 0
        ? project.lightIds.map((id) => id.toString()).join(", ")
        : "-",
    ],
  ];

  autoTable(doc, {
    startY,
    margin: { left: margin, right: margin },
    tableWidth: width,
    head: [["Field", "Value"]],
    body: detailRows,
    theme: "grid",
    styles: {
      fontSize: 9,
      cellPadding: 4,
      font: REPORT_FONT_NAME,
    },
    headStyles: {
      fillColor: [15, 46, 91],
      textColor: 255,
      font: REPORT_FONT_NAME,
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: width * 0.32 },
      1: { cellWidth: "auto" },
    },
  });

  return getLastTableY(doc, startY);
}

function drawOverviewTable(
  doc: jsPDF,
  dateRangeLabel: string,
  scansInRange: number,
  clicksInRange: number,
  uniqueUsersInRange: number,
  margin: number,
  width: number,
  startY: number
): number {
  const rows: Array<[string, string]> = [
    [`Scans (${dateRangeLabel})`, formatNumber(scansInRange)],
    [`Clicks (${dateRangeLabel})`, formatNumber(clicksInRange)],
    [`Unique Users (${dateRangeLabel})`, formatNumber(uniqueUsersInRange)],
  ];

  autoTable(doc, {
    startY,
    margin: { left: margin, right: margin },
    tableWidth: width,
    head: [["Metric", "Value"]],
    body: rows,
    theme: "grid",
    styles: {
      fontSize: 10,
      cellPadding: 5,
      font: REPORT_FONT_NAME,
    },
    headStyles: {
      fillColor: [79, 154, 195],
      textColor: 255,
      font: REPORT_FONT_NAME,
    },
    columnStyles: {
      0: { fontStyle: "bold" },
    },
  });

  return getLastTableY(doc, startY);
}

interface TrendCardOptions {
  title: string;
  series: Array<{ label: string; value: number }>;
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: { r: number; g: number; b: number };
  summaryLabel: string;
}

function drawTrendCard(doc: jsPDF, options: TrendCardOptions): number {
  const { title, series, x, y, width, height, stroke, summaryLabel } = options;
  doc.setFont(REPORT_FONT_NAME, "bold");
  doc.setFontSize(11);
  doc.text(title, x, y);
  const cardY = y + 14;
  doc.setDrawColor(204, 212, 226);
  doc.roundedRect(x, cardY, width, height, 8, 8);

  if (series.length === 0) {
    doc.setFont(REPORT_FONT_NAME, "normal");
    doc.setFontSize(10);
    doc.text("Insufficient data for trend", x + width / 2, cardY + height / 2, {
      align: "center",
    });
  } else {
    const values = series.map((item) => item.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const safeRange = max - min || 1;
    const cumulativeTotal = values.reduce((acc, value) => acc + value, 0);

    doc.setFont(REPORT_FONT_NAME, "normal");
    doc.setFontSize(10);
    const headerY = cardY + 18;
    doc.text(`累積總量：${formatNumber(cumulativeTotal)}`, x + 12, headerY);
    doc.text(summaryLabel, x + width - 12, headerY, { align: "right" });

    doc.setDrawColor(230, 233, 240);
    doc.setLineWidth(0.5);
    const gridLines = 4;
    for (let i = 1; i < gridLines; i += 1) {
      const lineY = cardY + (height / gridLines) * i;
      doc.line(x + 8, lineY, x + width - 8, lineY);
    }

    doc.setDrawColor(stroke.r, stroke.g, stroke.b);
    doc.setLineWidth(1.4);
    const points = series.map((item, idx) => {
      const ratio =
        series.length === 1 ? 0 : idx / Math.max(1, series.length - 1);
      const px = x + 12 + ratio * (width - 24);
      const py =
        cardY +
        height -
        12 -
        ((item.value - min) / safeRange) * (height - 24);
      return { px, py, value: item.value, label: item.label };
    });

    if (points.length >= 2) {
      for (let i = 0; i < points.length - 1; i += 1) {
        const start = points[i];
        const end = points[i + 1];
        doc.line(start.px, start.py, end.px, end.py);
      }
    }

    doc.setFillColor(stroke.r, stroke.g, stroke.b);
    points.forEach((point) => {
      doc.circle(point.px, point.py, 2, "F");
    });

    doc.setFont(REPORT_FONT_NAME, "normal");
    doc.setFontSize(8);
    points.forEach((point) => {
      const textY = Math.min(point.py - 4, cardY + height - 18);
      doc.text(formatNumber(point.value), point.px, textY, {
        align: "center",
      });
    });

    const labelStep = Math.max(1, Math.ceil(series.length / 8));
    const axisY = cardY + height - 6;
    doc.setFontSize(7);
    points.forEach((point, index) => {
      if (
        index !== 0 &&
        index !== points.length - 1 &&
        index % labelStep !== 0
      ) {
        return;
      }
      doc.text(point.label, point.px, axisY, { align: "center" });
    });
  }

  return cardY + height + 10;
}

function drawInteractionTable(
  doc: jsPDF,
  ranking: ClickRankingRow[],
  margin: number,
  width: number,
  startY: number
): number {
  const rows = ranking.slice(0, 10).map((item) => [
    item.name,
    formatNumber(item.count),
  ]);

  if (rows.length === 0) {
    doc.setFont(REPORT_FONT_NAME, "normal");
    doc.setFontSize(10);
    doc.text("選定期間內沒有物件互動資料。", margin, startY + 14);
    return startY + 28;
  }

  autoTable(doc, {
    startY,
    margin: { left: margin, right: margin },
    tableWidth: width,
    head: [["AR Object", "Clicks"]],
    body: rows,
    theme: "grid",
    styles: {
      font: REPORT_FONT_NAME,
      fontSize: 10,
      cellPadding: 5,
    },
    headStyles: {
      fillColor: [15, 46, 91],
      textColor: 255,
      font: REPORT_FONT_NAME,
    },
    columnStyles: {
      0: { cellWidth: width * 0.7 },
      1: { cellWidth: width * 0.3, halign: "right" },
    },
  });

  return getLastTableY(doc, startY);
}

interface FooterOptions {
  margin: number;
  pageNumber: number;
  pageCount: number;
  reportedBy: string;
}

function drawFooter(doc: jsPDF, options: FooterOptions): void {
  const { margin, pageNumber, pageCount, reportedBy } = options;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFont(REPORT_FONT_NAME, "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  const footerY = pageHeight - margin / 3;
  doc.text(`Reported by ${reportedBy}`, margin, footerY);
  doc.text(`Page ${pageNumber} / ${pageCount}`, pageWidth / 2, footerY, {
    align: "center",
  });
  doc.setTextColor(11, 31, 51);
}

async function ensureReportFont(doc: jsPDF): Promise<void> {
  if (typeof window === "undefined") return;
  reportFontDataPromise = reportFontDataPromise ?? loadReportFontData();
  const fontData = await reportFontDataPromise;
  doc.addFileToVFS(REPORT_FONT_FILE, fontData);
  doc.addFont(REPORT_FONT_FILE, REPORT_FONT_NAME, "normal");
  doc.addFont(REPORT_FONT_FILE, REPORT_FONT_NAME, "bold");
  doc.setFont(REPORT_FONT_NAME, "normal");
}

async function loadReportFontData(): Promise<string> {
  if (typeof fetch === "undefined") {
    throw new Error("PDF 匯出僅支援瀏覽器模式。");
  }
  const response = await fetch(REPORT_FONT_URL);
  if (!response.ok) {
    throw new Error(`無法載入報告字型：${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  return arrayBufferToBase64(buffer);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return window.btoa(binary);
}

function formatDate(value: Date | null): string {
  return value ? format(value, "yyyy-MM-dd") : "-";
}

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function getLastTableY(doc: jsPDF, fallback: number): number {
  const typedDoc = doc as jsPDF & {
    lastAutoTable?: { finalY: number };
  };
  return typedDoc.lastAutoTable?.finalY ?? fallback;
}

function buildSummaryText(series: Array<{ total: number }>): string {
  if (series.length === 0) return "No activity in range";
  const totals = series.map((point) => point.total);
  const sum = totals.reduce((acc, value) => acc + value, 0);
  const max = Math.max(...totals);
  return `Total ${formatNumber(sum)} • Peak ${formatNumber(max)}`;
}
