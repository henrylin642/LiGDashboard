import Papa from "papaparse";

type Row = Record<string, string>;

export function fetchCsv<T>(
  path: string,
  transform: (row: Row) => T | null
): Promise<T[]> {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await fetch(path);
      if (!res.ok) {
        reject(new Error(`Failed to load ${path}: ${res.status}`));
        return;
      }
      const text = await res.text();
      Papa.parse<Row>(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results: Papa.ParseResult<Row>) => {
          if (results.errors.length > 0) {
            reject(
              new Error(
                results.errors
                  .map((item) => item.message)
                  .filter(Boolean)
                  .join("; ")
              )
            );
            return;
          }
          const items: T[] = [];
          for (const row of results.data) {
            const transformed = transform(trimRowKeys(row));
            if (transformed) {
              items.push(transformed);
            }
          }
          resolve(items);
        },
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export function parseNumber(value: string | undefined): number | null {
  if (!value && value !== "0") return null;
  const cleaned = value.replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

export function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  return ["true", "1", "yes"].includes(value.trim().toLowerCase());
}

export function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseJsonArray(value: string | undefined): string[] {
  if (!value) return [];
  const normalized = value.replace(/""/g, '"').trim();
  try {
    const parsed = JSON.parse(normalized);
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item).trim()).filter(Boolean)
      : [];
  } catch {
    return normalized
      .split(",")
      .map((item) => item.replace(/[\[\]\"]+/g, "").trim())
      .filter(Boolean);
  }
}

export function parseLatLon(
  value: string | undefined
): { lat: number; lon: number } | null {
  if (!value) return null;
  const parts = value.split(",").map((part) => parseNumber(part));
  if (parts.length !== 2) return null;
  const [lat, lon] = parts;
  if (lat === null || lon === null) return null;
  return { lat, lon };
}

function trimRowKeys(row: Row): Row {
  return Object.entries(row).reduce<Row>((acc, [key, value]) => {
    const trimmedKey = key.replace(/^\uFEFF/, "").trim();
    acc[trimmedKey] = value;
    return acc;
  }, {});
}
