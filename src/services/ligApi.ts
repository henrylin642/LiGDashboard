import { fetchCsv } from "../utils/csv";

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
    return fetchCsv("/data/light.csv", (row) => {
      const id = row["Id"]?.trim();
      if (!id) return null;
      const name = row["Name"]?.trim() || row["Location"]?.trim() || "";
      const label = name ? `${id} - ${name}` : id;
      return { id, label } as LightOption;
    });
  }
  const headers: Record<string, string> = {};
  headers.Authorization = `Bearer ${token}`;
  try {
    const endpoints = [
      `${API_BASE}/api/v1/lights`,
      `${API_BASE}/api/v1/lightids`,
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
    const rows = await fetchCsv("/data/light.csv", (row) => {
      const id = row["Id"]?.trim();
      if (!id) return null;
      const name = row["Name"]?.trim() || row["Location"]?.trim() || "";
      const label = name ? `${id} - ${name}` : id;
      return { id, label } as LightOption;
    });
    return rows;
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
    const rows = await fetchCsv("/data/scan_coordinate.csv", (row) => {
      const rowLightId = row["Light ID"]?.trim();
      if (rowLightId !== String(lightId).trim()) return null;
      const id = row["Id"]?.trim();
      const name = `${row["Location X"] ?? ""},${row["Location Z"] ?? ""}`;
      if (!id) return null;
      return { id, name } as CoordinateOption;
    });
    return rows;
  }
}

export async function fetchSceneOptions(token?: Token): Promise<SceneOption[]> {
  if (!token) {
    return fetchCsv("/data/scene.csv", (row) => {
      const id = row["Id"]?.trim();
      if (!id) return null;
      const name = row["Name"]?.trim() || id;
      return { id, name } as SceneOption;
    });
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
    const rows = await fetchCsv("/data/scene.csv", (row) => {
      const id = row["Id"]?.trim();
      if (!id) return null;
      const name = row["Name"]?.trim() || id;
      return { id, name } as SceneOption;
    });
    return rows;
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

export async function fetchCoordinateSystemsWithMeta(
  token?: Token
): Promise<CoordinateSystemDetail[]> {
  if (!token) return [];
  const res = await fetch(`${API_BASE}/api/v1/coordinate_systems`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as any).coordinate_systems)
      ? (data as any).coordinate_systems
      : Array.isArray((data as any).scenes)
        ? (data as any).scenes
        : [];
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

export async function fetchArObjectsWithMeta(
  token?: Token
): Promise<ArObjectDetail[]> {
  if (!token) return [];
  const res = await fetch(`${API_BASE}/api/v1/ar_objects`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as any).ar_objects)
      ? (data as any).ar_objects
      : [];
  return list
    .map((item: any) => {
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
      } as ArObjectDetail;
    })
    .filter(Boolean) as ArObjectDetail[];
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
