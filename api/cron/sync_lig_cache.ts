import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

// Required environment variables
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = process.env.LIG_API_BASE || 'https://api.lig.com.tw';

// Helper to login and get token
async function loginLig(email: string, password: string): Promise<string | null> {
    try {
        const res = await axios.post(`${API_BASE}/api/v1/login`, {
            user: { email, password }
        }, {
            headers: { 'Content-Type': 'application/json' }
        });
        return res.data?.token || res.data?.access_token || null;
    } catch (err: any) {
        console.warn(`[Sync Cache] Login failed for ${email}:`, err.response?.status);
        return null;
    }
}

// Fetch scenes for a token
async function fetchScenes(token: string) {
    try {
        const res = await axios.get(`${API_BASE}/api/scenes`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = Array.isArray(res.data) ? res.data : (res.data?.scenes || res.data?.data || []);
        if (!Array.isArray(data)) return [];

        return data.map(item => ({
            id: Number(item.scene_id ?? item.id),
            name: String(item.name ?? item.title ?? "").trim(),
            projectId: item.project_id ?? null,
            createdAt: item.created_at ?? null,
            updatedAt: item.updated_at ?? null,
        })).filter(s => !isNaN(s.id));
    } catch {
        return [];
    }
}

// Fetch coordinate systems for a token (only returns {id, name})
async function fetchCoords(token: string) {
    try {
        const res = await axios.get(`${API_BASE}/api/v1/coordinate_systems`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = Array.isArray(res.data) ? res.data : (res.data?.coordinate_systems || []);
        if (!Array.isArray(data)) return [];

        return data.map(item => {
            const id = Number(item.id ?? item.coordinate_system_id);
            if (isNaN(id)) return null;
            return {
                id,
                name: String(item.name ?? "").trim(),
            };
        }).filter(Boolean) as { id: number; name: string }[];
    } catch {
        return [];
    }
}

// Fetch active lights for a token
async function fetchActiveLights(token: string): Promise<number[]> {
    try {
        const res = await axios.get(`${API_BASE}/api/v1/lights?limit=10000`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = Array.isArray(res.data) ? res.data : (res.data?.lights || []);
        return data
            .filter((l: any) => l.status !== '庫存')
            .map((l: any) => Number(l.id))
            .filter((id: number) => !isNaN(id));
    } catch {
        return [];
    }
}

let _arObjectsListFirstError = '';

// Fetch scene mappings for a light via /api/v1/ar_objects_list/{light_id}
// This is a PUBLIC endpoint — no auth token required
async function fetchSceneMappingsForLight(lightId: number): Promise<{ sceneId: number; sceneName: string }[]> {
    try {
        const res = await axios.get(`${API_BASE}/api/v1/ar_objects_list/${lightId}`, {
            timeout: 10000
        });
        const scenes = res.data?.scenes;
        if (!Array.isArray(scenes)) {
            if (!_arObjectsListFirstError) _arObjectsListFirstError = `light=${lightId}: scenes not array, data=${JSON.stringify(res.data).slice(0, 200)}`;
            return [];
        }

        return scenes
            .filter((s: any) => s.scene_id && !isNaN(Number(s.scene_id)))
            .map((s: any) => ({
                sceneId: Number(s.scene_id),
                sceneName: String(s.name ?? '').trim(),
            }));
    } catch (err: any) {
        if (!_arObjectsListFirstError) {
            _arObjectsListFirstError = `light=${lightId}: ${err?.response?.status || ''} ${err?.code || ''} ${err?.message || 'unknown'}`.trim();
        }
        return [];
    }
}

// Parse scandata.csv to extract light_id → coordinate_system_id mappings
async function fetchScandataLightCsMappings(): Promise<Map<number, Set<number>>> {
    const lightToCsMap = new Map<number, Set<number>>();
    try {
        // In Vercel, we can fetch from our own API endpoint
        // But scandata.csv is served as static file, so we fetch it directly
        const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
        const res = await axios.get(`${baseUrl}/api/data/scandata.csv`, { timeout: 30000 });
        const csvText = res.data;
        if (typeof csvText !== 'string') return lightToCsMap;

        const lines = csvText.split('\n');
        if (lines.length < 2) return lightToCsMap;

        // Parse header
        const header = lines[0].split(',').map(h => h.trim().toLowerCase());
        const lightIdx = header.findIndex(h => h === 'ligtag_id' || h === 'light_id');
        const csIdx = header.findIndex(h => h === 'coordinate_system_id');

        if (lightIdx === -1 || csIdx === -1) return lightToCsMap;

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            const lightId = Number(cols[lightIdx]?.trim());
            const csId = Number(cols[csIdx]?.trim());
            if (isNaN(lightId) || isNaN(csId) || csId === 0) continue;

            if (!lightToCsMap.has(lightId)) {
                lightToCsMap.set(lightId, new Set());
            }
            lightToCsMap.get(lightId)!.add(csId);
        }
    } catch (err) {
        console.warn('[Sync Cache] Could not parse scandata.csv for Light→CS mappings:', err);
    }
    return lightToCsMap;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST' && req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ error: 'Supabase configuration missing' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    try {
        console.log('[Sync Cache] Starting enhanced cache sync...');

        // Step 1: Fetch all clients
        const { data: clients, error: clientErr } = await supabase.from('clients').select('email, password');
        if (clientErr) throw clientErr;
        if (!clients || clients.length === 0) {
            return res.status(200).json({ message: 'No clients to process.' });
        }
        console.log(`[Sync Cache] Processing ${clients.length} clients...`);

        // Step 2: Fetch scandata Light→CS mapping (parallel with client processing)
        const scandataPromise = fetchScandataLightCsMappings();

        // Step 3: For each client, fetch scenes, coords, and active lights → scene mappings
        const allScenes: any[] = [];
        const allCoords: { id: number; name: string }[] = [];
        // light_id → Set<scene_id>
        const lightToSceneIds = new Map<number, Set<number>>();
        const lightSceneNames = new Map<number, string>(); // sceneId → sceneName from ar_objects_list
        const allActiveLightIds = new Set<number>(); // collected from all client active lights

        const BATCH_SIZE = 3;
        for (let i = 0; i < clients.length; i += BATCH_SIZE) {
            const batch = clients.slice(i, i + BATCH_SIZE);

            await Promise.all(batch.map(async (client) => {
                if (!client.email || !client.password) return;
                const token = await loginLig(client.email, client.password);
                if (!token) return;

                // Fetch basic data
                const [scenes, coords, activeLightIds] = await Promise.all([
                    fetchScenes(token),
                    fetchCoords(token),
                    fetchActiveLights(token)
                ]);

                allScenes.push(...scenes);
                allCoords.push(...coords);

                // Collect active lights from this client as a supplementary source
                for (const lid of activeLightIds) {
                    allActiveLightIds.add(lid);
                }
            }));
        }

        // Step 4: Wait for scandata parsing
        const lightToCsMap = await scandataPromise;
        console.log(`[Sync Cache] scandata.csv parsed: ${lightToCsMap.size} unique lights with CS mappings.`);

        // Step 4b: Fetch scene mappings for ALL known lights
        // Combine lights from scandata.csv + active lights from clients
        const combinedLightIds = new Set<number>([
            ...lightToCsMap.keys(),
            ...allActiveLightIds
        ]);
        console.log(`[Sync Cache] Total unique lights: ${combinedLightIds.size} (scandata: ${lightToCsMap.size}, active: ${allActiveLightIds.size})`);
        console.log(`[Sync Cache] Fetching scene mappings via ar_objects_list (public, no auth)...`);

        const allLightIds = Array.from(combinedLightIds);
        const LIGHT_BATCH = 10;
        for (let j = 0; j < allLightIds.length; j += LIGHT_BATCH) {
            const lightBatch = allLightIds.slice(j, j + LIGHT_BATCH);
            const results = await Promise.all(
                lightBatch.map(lid => fetchSceneMappingsForLight(lid))
            );
            lightBatch.forEach((lid, idx) => {
                const sceneMappings = results[idx];
                if (sceneMappings.length > 0) {
                    if (!lightToSceneIds.has(lid)) {
                        lightToSceneIds.set(lid, new Set());
                    }
                    sceneMappings.forEach(m => {
                        lightToSceneIds.get(lid)!.add(m.sceneId);
                        if (m.sceneName) lightSceneNames.set(m.sceneId, m.sceneName);
                    });
                }
            });
        }
        console.log(`[Sync Cache] Mapped ${lightToSceneIds.size} lights to scenes.`);

        // Step 5: Build the CS ↔ Scene bridge
        // For each light that appears in BOTH maps, we can connect its CS(es) to its Scene(s)
        const csToSceneIds = new Map<number, Set<number>>();
        const csToLightIds = new Map<number, Set<number>>();

        for (const [lightId, csIds] of lightToCsMap.entries()) {
            const sceneIds = lightToSceneIds.get(lightId);

            // Track CS → Light mapping regardless
            for (const csId of csIds) {
                if (!csToLightIds.has(csId)) csToLightIds.set(csId, new Set());
                csToLightIds.get(csId)!.add(lightId);
            }

            // If we have both CS and Scene for this light, bridge them
            if (sceneIds && sceneIds.size > 0) {
                for (const csId of csIds) {
                    if (!csToSceneIds.has(csId)) csToSceneIds.set(csId, new Set());
                    for (const sid of sceneIds) {
                        csToSceneIds.get(csId)!.add(sid);
                    }
                }
            }
        }

        // Step 6: De-duplicate and enrich
        const uniqueScenes = Array.from(new Map(allScenes.map(s => [s.id, s])).values());

        const sceneNameMap = new Map<number, string>();
        uniqueScenes.forEach(s => sceneNameMap.set(s.id, s.name));

        const uniqueCoordsMap = new Map<number, any>();
        allCoords.forEach(c => {
            if (!uniqueCoordsMap.has(c.id)) {
                uniqueCoordsMap.set(c.id, c);
            }
        });

        // Build enriched CS list with sceneId, sceneName, lightIds
        const enrichedCoords = Array.from(uniqueCoordsMap.values()).map(cs => {
            const sceneIds = csToSceneIds.get(cs.id);
            const lightIds = csToLightIds.get(cs.id);

            // Pick the first scene as the primary (most CS link to exactly one scene)
            let sceneId: number | null = null;
            let sceneName: string | null = null;
            if (sceneIds && sceneIds.size > 0) {
                sceneId = sceneIds.values().next().value!;
                // Prefer name from ar_objects_list, fallback to /api/scenes
                sceneName = lightSceneNames.get(sceneId) || sceneNameMap.get(sceneId) || null;
            }

            return {
                id: cs.id,
                name: cs.name,
                sceneId,
                sceneName,
                lightIds: lightIds ? Array.from(lightIds).sort((a, b) => a - b) : [],
            };
        });

        console.log(`[Sync Cache] Done. ${uniqueScenes.length} scenes, ${enrichedCoords.length} coords (${enrichedCoords.filter(c => c.sceneId).length} with scene mapping).`);

        // Build direct light → scene mapping for frontend use
        const lightToSceneMapPayload: Record<number, { sceneId: number; sceneName: string }> = {};
        for (const [lightId, sceneIdSet] of lightToSceneIds.entries()) {
            const sceneId = sceneIdSet.values().next().value!;
            lightToSceneMapPayload[lightId] = {
                sceneId,
                sceneName: lightSceneNames.get(sceneId) || sceneNameMap.get(sceneId) || '',
            };
        }

        const payload = {
            scenes: uniqueScenes,
            coordinateSystems: enrichedCoords,
            lightToSceneMap: lightToSceneMapPayload,
        };

        // Write to cache
        const { error: upsertErr } = await supabase
            .from('api_cache')
            .upsert({
                key: 'lig_aggregated_data',
                data: payload,
                updated_at: new Date().toISOString()
            }, { onConflict: 'key' });

        if (upsertErr) throw upsertErr;

        return res.status(200).json({
            success: true,
            message: 'Cache updated successfully with enriched CS→Scene mappings.',
            stats: {
                scenes: uniqueScenes.length,
                coords: enrichedCoords.length,
                coordsWithScene: enrichedCoords.filter(c => c.sceneId).length,
                coordsWithLights: enrichedCoords.filter(c => c.lightIds.length > 0).length,
                totalLightsMapped: lightToSceneIds.size,
                scandataLights: lightToCsMap.size,
                activeLights: allActiveLightIds.size,
                combinedLights: allLightIds.length,
                lightToSceneMapEntries: Object.keys(lightToSceneMapPayload).length,
                arObjectsListError: _arObjectsListFirstError || null,
            }
        });

    } catch (error: any) {
        console.error('[Sync Cache] Error:', error);
        return res.status(500).json({ error: 'Failed to sync lig cache', details: error.message });
    }
}
