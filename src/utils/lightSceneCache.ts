const STORAGE_KEY = "lig_light_scene_cache_v1";

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
