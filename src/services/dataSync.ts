export interface DataSyncResult {
  success: boolean;
  message?: string;
  files?: string[];
}

function parseJson<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function triggerDataSync(signal?: AbortSignal): Promise<DataSyncResult> {
  const response = await fetch("/api/internal-data-sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
  });

  const rawText = await response.text();
  const payload = parseJson<DataSyncResult>(rawText);

  if (!response.ok) {
    const errorMessage =
      payload?.message ??
      (response.status === 404
        ? "伺服器未提供資料更新 API，請確認已使用內網環境啟動儀表板。"
        : `資料更新失敗 (${response.status})`);
    throw new Error(errorMessage);
  }

  return payload ?? { success: true };
}
