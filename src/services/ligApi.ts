

type Token = string;

const DEFAULT_API_BASE = "/api/lig";
const API_BASE = (import.meta.env.VITE_LIG_API_BASE as string | undefined)?.replace(/\/$/, "") || DEFAULT_API_BASE;

export interface LightOption {
  id: string;
  label: string;
}

export interface CoordinateOption {
  id: string;
  name: string;
}

export interface SceneOption {
  id: string;
  name: string;
}

export interface SceneDetail {
  id: string;
  name: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  raw?: unknown;
}

export interface AssetDetail {
  id: string;
  name: string;
  type?: string | null;
  category?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  raw?: unknown;
}

export interface ArObjectDetail {
  id: string;
  name: string;
  sceneId: number | null;
  sceneName: string | null;
  location:
  | {
    x: number | null;
    y: number | null;
    z: number | null;
  }
  | null;
  raw?: unknown;
}

export interface CoordinateSystemDetail {
  id: string;
  name: string;
  projectId?: string | number | null;
  raw?: unknown;
}

export interface LightDetail {
  id: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  fieldId?: number | null;
  coordinateSystemId?: number | null;
  coordinateSystemName?: string | null;
  updatedAt?: string | null;
  raw?: unknown;
}

export async function loginLigDashboard(
  email: string,
  password: string
): Promise<string> {
  const url = `${API_BASE}/api/v1/login`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: { email, password } }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`登入失敗：${response.status} ${text}`);
  }

  const data = (await response.json()) as { token?: string };
  if (!data.token) {
    throw new Error("回應中缺少 token");
  }
  return data.token;
}

export async function fetchLightOptions(token?: Token): Promise<LightOption[]> {
  if (!token) {
    return [];
  }
  const headers: Record<string, string> = {};
  headers.Authorization = `Bearer ${token}`;
  try {
    const endpoints = [
      `${API_BASE}/api/v1/lights?limit=10000`,
      `${API_BASE}/api/v1/lightids?limit=10000`,
    ];

    let lastError: Error | null = null;

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, { headers });
        if (!res.ok) {
          lastError = new Error(`${res.status} ${await res.text()}`);
          continue;
        }

        const data = await res.json();
        const items = Array.isArray(data)
          ? data
          : Array.isArray((data as any).lights)
            ? (data as any).lights
            : Array.isArray((data as any).lightids)
              ? (data as any).lightids
              : Array.isArray((data as any).light_ids)
                ? (data as any).light_ids
                : [];
        if (!items.length) {
          lastError = new Error("空資料");
          continue;
        }

        return items
          .map((item: any) => {
            const id = String(item.id ?? item.light_id ?? item.lig_id ?? "").trim();
            if (!id) return null;
            const name = String(item.name ?? item.location ?? item.label ?? "").trim();
            const label = name ? `${id} - ${name}` : id;
            return { id, label } as LightOption;
          })
          .filter(Boolean) as LightOption[];
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error("無法取得燈具資料");
  } catch (error) {
    console.error("fetchLightOptions failed", error);
    return [];
  }
}

export async function fetchCoordinatesForLight(
  lightId: string,
  token?: Token
): Promise<CoordinateOption[]> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const endpoints = [
      `${API_BASE}/api/v1/lights/${encodeURIComponent(lightId)}`,
      `${API_BASE}/api/v1/lightids/${encodeURIComponent(lightId)}`,
    ];

    let lastError: Error | null = null;

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, { headers });
        if (!res.ok) {
          lastError = new Error(`${res.status} ${await res.text()}`);
          continue;
        }
        const json = await res.json();
        const list = Array.isArray(json?.cs_list)
          ? json.cs_list
          : Array.isArray(json?.coordinate_systems)
            ? json.coordinate_systems
            : [];
        if (!list.length) {
          lastError = new Error("空資料");
          continue;
        }

        return list
          .map((item: any) => {
            const id = String(item.id ?? "").trim();
            const name = String(item.name ?? item.label ?? "").trim();
            if (!id || !name) return null;
            return { id, name } as CoordinateOption;
          })
          .filter(Boolean) as CoordinateOption[];
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    if (lastError) throw lastError;
    throw new Error("無法取得座標資料");
  } catch (error) {
    console.warn("API fetch failed for coordinates:", error);
    return [];
  }
}

export async function fetchSceneOptions(token?: Token): Promise<SceneOption[]> {
  if (!token) {
    return [];
  }
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const res = await fetch(`${API_BASE}/api/scenes`, {
      headers,
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const items = Array.isArray(data)
      ? data
      : Array.isArray((data as any).scenes)
        ? (data as any).scenes
        : Array.isArray((data as any).data)
          ? (data as any).data
          : [];
    if (!items.length) throw new Error("空資料");
    return items
      .map((item: any) => {
        const id = String(item.id ?? item.scene_id ?? "").trim();
        const name = String(item.name ?? item.scene_name ?? "").trim();
        if (!id || !name) return null;
        return { id, name } as SceneOption;
      })
      .filter(Boolean) as SceneOption[];

  } catch (error) {
    console.error("fetchSceneOptions failed", error);
    return [];
  }
}

export async function fetchScenesWithMeta(token?: Token): Promise<SceneDetail[]> {
  if (!token) return [];
  const res = await fetch(`${API_BASE}/api/scenes`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const items = Array.isArray(data)
    ? data
    : Array.isArray((data as any).scenes)
      ? (data as any).scenes
      : Array.isArray((data as any).data)
        ? (data as any).data
        : [];
  return items
    .map((item: any) => {
      const id = String(item.id ?? item.scene_id ?? "").trim();
      const name = String(item.name ?? item.scene_name ?? "").trim();
      if (!id || !name) return null;
      return {
        id,
        name,
        createdAt: item.created_at ?? item.createdAt ?? null,
        updatedAt: item.updated_at ?? item.updatedAt ?? null,
        raw: item,
      } as SceneDetail;
    })
    .filter(Boolean) as SceneDetail[];
}

export async function fetchAssetsWithMeta(token?: Token): Promise<AssetDetail[]> {
  if (!token) return [];
  const res = await fetch(`${API_BASE}/api/v1/assets`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const items = Array.isArray(data)
    ? data
    : Array.isArray((data as any).assets)
      ? (data as any).assets
      : [];
  return items
    .map((item: any) => {
      const id = String(item.id ?? item.asset_id ?? "").trim();
      const name = String(item.name ?? item.title ?? item.asset_name ?? "").trim();
      if (!id || !name) return null;
      return {
        id,
        name,
        type: item.type ?? item.asset_type ?? null,
        category: item.category ?? null,
        createdAt: item.created_at ?? item.createdAt ?? null,
        updatedAt: item.updated_at ?? item.updatedAt ?? null,
        raw: item,
      } as AssetDetail;
    })
    .filter(Boolean) as AssetDetail[];
}



export async function fetchArObjectsForLight(
  lightId: number,
  token?: Token
): Promise<ArObjectDetail[]> {
  if (!token) return [];
  try {
    const res = await fetch(`${API_BASE}/api/v1/ar_objects_list/${lightId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      // 404 means no data for this light/coordinate system
      // 406 means not acceptable (likely no JSON representation), treat as empty
      if (res.status === 404 || res.status === 406) return [];
      throw new Error(`${res.status} ${await res.text()}`);
    }
    const json = await res.json();
    const data = Array.isArray(json) ? json : (json.scenes || []);

    if (!Array.isArray(data)) return [];

    return data.flatMap((sceneItem: any) => {
      const sceneId = sceneItem.scene_id;
      const sceneName = sceneItem.scene_name ?? sceneItem.name; // Fallback to 'name' property

      if (!Array.isArray(sceneItem.ar_objects)) return [];

      return sceneItem.ar_objects.map((item: any) => {
        const id = String(item.id ?? item.obj_id ?? "").trim();
        if (!id) return null;
        const name = String(item.name ?? item.obj_name ?? id).trim();

        return {
          id,
          name,
          sceneId: sceneId ?? item.scene_id,
          sceneName: sceneName ?? item.scene_name,
          location: item.location,
          // Add other fields if needed
        } as ArObjectDetail;
      }).filter(Boolean) as ArObjectDetail[];
    });
  } catch (error) {
    // Suppress warnings for expected errors to avoid console spam
    // console.warn(`[LiG] Failed to fetch AR objects for light ${lightId}`, error);
    return [];
  }
}

export async function fetchScenesForLight(
  lightId: string,
  token?: Token
): Promise<SceneOption[]> {
  if (!token) return [];
  try {
    const res = await fetch(`${API_BASE}/api/v1/ar_objects_list/${lightId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 404 || res.status === 406) return [];
      throw new Error(`${res.status} ${await res.text()}`);
    }
    const json = await res.json();
    const scenesList = Array.isArray(json) ? json : (json.scenes || []);

    if (!Array.isArray(scenesList)) return [];

    const uniqueScenes = new Map<string, string>();
    scenesList.forEach((item: any) => {
      const id = String(item.scene_id ?? "").trim();
      // The API returns 'name' for the scene name in the scenes list structure
      // based on the JSON: { scenes: [ { scene_id: ..., name: "Scene Name", ... } ] }
      const name = String(item.name ?? item.scene_name ?? "").trim();

      if (id) {
        // If we already have this ID, only update if we found a name (and didn't have one before)
        if (!uniqueScenes.has(id) || (name && !uniqueScenes.get(id))) {
          uniqueScenes.set(id, name);
        }
      }
    });

    return Array.from(uniqueScenes.entries()).map(([id, name]) => ({
      id,
      name
    }));
  } catch (error) {
    console.warn(`[LiG] Failed to fetch scenes for light ${lightId}`, error);
    return [];
  }
}

export async function fetchArObjectsWithMeta(
  token?: Token,
  lightIds: number[] = []
): Promise<ArObjectDetail[]> {
  if (!token) return [];
  if (lightIds.length === 0) return [];

  // Deduplicate lightIds
  const uniqueIds = Array.from(new Set(lightIds));

  // Fetch in batches to avoid overwhelming the server/browser
  const BATCH_SIZE = 5;
  const results: ArObjectDetail[][] = [];

  for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
    const batch = uniqueIds.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(id => fetchArObjectsForLight(id, token).catch(err => {
        console.warn(`[LiG] Failed to fetch AR objects for light ${id}`, err);
        return [];
      }))
    );
    results.push(...batchResults);
  }

  return results.flat();
}



export async function fetchArObjectById(
  objId: string,
  token?: Token
): Promise<ArObjectDetail | null> {
  if (!token) return null;
  const res = await fetch(`${API_BASE}/api/v1/ar_objects/${encodeURIComponent(objId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`${res.status} ${await res.text()}`);
  }
  const item = await res.json();
  const id = String(item.id ?? item.obj_id ?? "").trim();
  if (!id) return null;
  const name = String(item.name ?? item.obj_name ?? id).trim();
  const sceneIdRaw =
    item.scene_id ??
    item.sceneId ??
    item.scene?.id ??
    item.scene?.scene_id ??
    null;
  const sceneId =
    sceneIdRaw === null || sceneIdRaw === undefined
      ? null
      : Number(sceneIdRaw);
  const sceneName =
    item.scene_name ??
    item.sceneName ??
    item.scene?.name ??
    item.scene?.scene_name ??
    null;
  const location = item.location;
  const locationX =
    typeof location?.x === "number"
      ? location.x
      : typeof location?.X === "number"
        ? location.X
        : null;
  const locationY =
    typeof location?.y === "number"
      ? location.y
      : typeof location?.Y === "number"
        ? location.Y
        : null;
  const locationZ =
    typeof location?.z === "number"
      ? location.z
      : typeof location?.Z === "number"
        ? location.Z
        : null;
  return {
    id,
    name,
    sceneId: Number.isFinite(sceneId) ? Number(sceneId) : null,
    sceneName: sceneName ? String(sceneName).trim() : null,
    location:
      locationX === null && locationY === null && locationZ === null
        ? null
        : { x: locationX, y: locationY, z: locationZ },
    raw: item,
  };
}

// ... existing imports ...

export async function fetchCoordinateSystemsWithMeta(
  token?: Token
): Promise<CoordinateSystemDetail[]> {
  if (!token) return [];
  const res = await fetch(`${API_BASE}/api/v1/coordinate_systems`, {
    headers: { Authorization: `Bearer ${token}` },
    method: "GET" // explicit GET
  });
  if (!res.ok) {
    console.warn(`[ligApi] fetchCoordinateSystems failed ${res.status}`);
    return [];
  }
  const data = await res.json();
  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as any).coordinate_systems)
      ? (data as any).coordinate_systems
      : [];

  if (list.length > 0) {
    console.log("[ligApi] fetchCoordinateSystems first item keys:", Object.keys(list[0]));
    console.log("[ligApi] fetchCoordinateSystems first item raw:", list[0]);
  }

  return list
    .map((item: any) => {
      const id = String(item.id ?? item.coordinate_system_id ?? "").trim();
      const name = String(item.name ?? item.label ?? "").trim();
      if (!id || !name) return null;
      return {
        id,
        name,
        projectId: item.project_id ?? item.projectId ?? null,
        raw: item,
      } as CoordinateSystemDetail;
    })
    .filter(Boolean) as CoordinateSystemDetail[];
}

// ... other functions ...

export async function fetchLights(token?: Token): Promise<LightDetail[]> {
  if (!token) return [];
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };

  try {
    const res = await fetch(`${API_BASE}/api/v1/lights?limit=10000`, { headers });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);

    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.lights || []);

    if (items.length > 0) {
      console.log("[ligApi] fetchLights first item keys:", Object.keys(items[0]));
      // Check specifically for coordinate related keys
      const first = items[0];
      console.log("[ligApi] fetchLights check CS:", first.coordinate_system_id, first.coordinate_system, first.cs_id, first.scene_id);
    }

    return items.map((item: any) => {
      const id = String(item.id ?? item.light_id ?? "").trim();
      if (!id) return null;

      // Try multiple possible field names for CS ID
      const csIdRaw = item.coordinate_system_id ?? item.cs_id ?? item.coordinate_system?.id;
      const csNameRaw = item.coordinate_system_name ?? item.coordinate_system?.name ?? item.cs_name;

      return {
        id,
        name: String(item.name ?? item.label ?? "").trim(),
        latitude: Number(item.latitude) || null,
        longitude: Number(item.longitude) || null,
        fieldId: Number(item.field_id ?? item.group_id) || null,
        coordinateSystemId: csIdRaw !== null && csIdRaw !== undefined ? Number(csIdRaw) : null,
        coordinateSystemName: String(csNameRaw ?? "").trim() || null,
        updatedAt: item.updated_at ?? null,
        raw: item
      } as LightDetail;
    }).filter(Boolean) as LightDetail[];
  } catch (error) {
    console.error("fetchLights failed", error);
    return [];
  }
}
