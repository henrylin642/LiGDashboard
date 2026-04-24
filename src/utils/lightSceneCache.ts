const STORAGE_KEY = "lig_light_scene_cache_v1";
const LIG_API = "https://api.lig.com.tw";

export interface LightSceneCacheEntry {
  sceneId: number;
  sceneName: string;
}

let memoryCache = new Map<number, LightSceneCacheEntry>();

function canUseSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function serialize(cache: Map<number, LightSceneCacheEntry>): string {
  return JSON.stringify(
    Array.from(cache.entries()).map(([lightId, scene]) => ({
      lightId,
      sceneId: scene.sceneId,
      sceneName: scene.sceneName,
    }))
  );
}

function deserialize(raw: string | null): Map<number, LightSceneCacheEntry> {
  if (!raw) return new Map<number, LightSceneCacheEntry>();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Map<number, LightSceneCacheEntry>();

    const next = new Map<number, LightSceneCacheEntry>();
    parsed.forEach((item) => {
      const lightId = Number(item?.lightId);
      const sceneId = Number(item?.sceneId);
      const sceneName = String(item?.sceneName ?? "").trim();
      if (!Number.isFinite(lightId) || !Number.isFinite(sceneId) || !sceneName) return;
      next.set(lightId, { sceneId, sceneName });
    });
    return next;
  } catch {
    return new Map<number, LightSceneCacheEntry>();
  }
}

export function readLightSceneCache(): Map<number, LightSceneCacheEntry> {
  if (memoryCache.size > 0) {
    return new Map(memoryCache);
  }

  if (!canUseSessionStorage()) {
    return new Map<number, LightSceneCacheEntry>();
  }

  memoryCache = deserialize(window.sessionStorage.getItem(STORAGE_KEY));
  return new Map(memoryCache);
}

export function writeLightSceneCache(cache: Map<number, LightSceneCacheEntry>): void {
  memoryCache = new Map(cache);
  if (!canUseSessionStorage()) return;
  window.sessionStorage.setItem(STORAGE_KEY, serialize(memoryCache));
}

export function mergeLightSceneCache(entries: Iterable<[number, LightSceneCacheEntry]>): Map<number, LightSceneCacheEntry> {
  const next = readLightSceneCache();
  for (const [lightId, scene] of entries) {
    next.set(lightId, scene);
  }
  writeLightSceneCache(next);
  return next;
}

async function fetchSceneForLight(lightId: number): Promise<LightSceneCacheEntry | null> {
  try {
    const res = await fetch(`${LIG_API}/api/v1/ar_objects_list/${lightId}`);
    if (!res.ok) return null;
    const payload = await res.json();
    const scenes = Array.isArray(payload) ? payload : payload?.scenes;
    if (!Array.isArray(scenes) || scenes.length === 0) return null;
    const first = scenes[0];
    const sceneId = Number(first.scene_id ?? first.id ?? 0);
    if (!sceneId) return null;
    const sceneName = String(first.scene_name ?? first.name ?? "").trim() || `Scene ${sceneId}`;
    return { sceneId, sceneName };
  } catch {
    return null;
  }
}

export async function warmLightSceneCache(lightIds: number[], batchSize = 10): Promise<Map<number, LightSceneCacheEntry>> {
  const deduped = Array.from(new Set(lightIds.filter((id) => Number.isFinite(id) && id > 0)));
  if (deduped.length === 0) return readLightSceneCache();

  const result = readLightSceneCache();
  const missing = deduped.filter((lightId) => !result.has(lightId));
  if (missing.length === 0) return result;

  for (let i = 0; i < missing.length; i += Math.max(1, batchSize)) {
    const batch = missing.slice(i, i + Math.max(1, batchSize));
    const entries = await Promise.all(batch.map((lightId) => fetchSceneForLight(lightId)));
    const resolvedBatch: Array<[number, LightSceneCacheEntry]> = [];
    batch.forEach((lightId, index) => {
      const scene = entries[index];
      if (!scene) return;
      result.set(lightId, scene);
      resolvedBatch.push([lightId, scene]);
    });
    if (resolvedBatch.length > 0) {
      mergeLightSceneCache(resolvedBatch);
    }
  }

  return readLightSceneCache();
}
