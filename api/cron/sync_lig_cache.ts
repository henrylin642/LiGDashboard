import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

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
async function fetchSceneMappingsForLight(lightId: number, token?: string): Promise<{ sceneId: number; sceneName: string }[]> {
    try {
        const headers: Record<string, string> = {
            'Accept': 'application/json, */*',
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await axios.get(`${API_BASE}/api/v1/ar_objects_list/${lightId}`, {
            timeout: 10000,
            headers,
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

// Shared helper to fetch a CSV from filesystem or production URL
async function fetchCsvText(filename: string): Promise<string> {
    // Try filesystem first (local dev)
    const possiblePaths = [
        path.join(process.cwd(), 'public', 'data', filename),
        path.join(__dirname, 'public', 'data', filename),
        path.resolve(__dirname, '..', '..', 'public', 'data', filename),
    ];

    for (const p of possiblePaths) {
        try {
            const text = fs.readFileSync(p, 'utf-8');
            if (text.length > 0) return text;
        } catch { /* try next */ }
    }

    // Fallback: fetch from production deployment
    const urls = [
        `https://li-g-dashboard.vercel.app/api/data/${filename}`,
        process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}/api/data/${filename}` : '',
    ].filter(Boolean);

    for (const url of urls) {
        try {
            const res = await axios.get(url, { timeout: 60000 });
            if (typeof res.data === 'string' && res.data.length > 100) {
                console.log(`[Sync Cache] Fetched ${filename} from ${url} (${res.data.length} bytes)`);
                return res.data;
            }
        } catch { /* try next */ }
    }

    console.warn(`[Sync Cache] ${filename} NOT FOUND from any source`);
    return '';
}

interface ScanDailyRow { date: string; ligId: number; csId: number | null; clientId: string; count: number }

// Aggregate scandata.csv → light-CS mappings + daily scan summaries
async function aggregateScandataCsv(): Promise<{
    lightToCsMap: Map<number, Set<number>>;
    scanDailySummary: ScanDailyRow[];
}> {
    const lightToCsMap = new Map<number, Set<number>>();
    const dailyMap = new Map<string, ScanDailyRow>(); // key = "date|ligId|csId|clientId"

    try {
        const csvText = await fetchCsvText('scandata.csv');
        if (!csvText) return { lightToCsMap, scanDailySummary: [] };

        const lines = csvText.split('\n');
        if (lines.length < 2) return { lightToCsMap, scanDailySummary: [] };

        // Parse header: time,ligtag_id,client_id,coordinate_system_id
        const header = lines[0].split(',').map(h => h.trim().toLowerCase());
        const timeIdx = header.findIndex(h => h === 'time');
        const lightIdx = header.findIndex(h => h === 'ligtag_id' || h === 'light_id');
        const clientIdx = header.findIndex(h => h === 'client_id');
        const csIdx = header.findIndex(h => h === 'coordinate_system_id');

        if (lightIdx === -1) return { lightToCsMap, scanDailySummary: [] };

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            const lightId = Number(cols[lightIdx]?.trim());
            if (isNaN(lightId) || lightId === 0) continue;

            const csId = csIdx !== -1 ? Number(cols[csIdx]?.trim()) : null;
            const clientId = clientIdx !== -1 ? (cols[clientIdx]?.trim() || '') : '';

            // Build light→CS map
            if (csId && !isNaN(csId) && csId !== 0) {
                if (!lightToCsMap.has(lightId)) lightToCsMap.set(lightId, new Set());
                lightToCsMap.get(lightId)!.add(csId);
            }

            // Build daily summary
            let dateStr = '';
            if (timeIdx !== -1 && cols[timeIdx]) {
                // Parse "2024-01-01 00:03:55 +0800" → "2024-01-01"
                dateStr = cols[timeIdx].trim().slice(0, 10);
            }
            if (!dateStr || dateStr.length !== 10) continue;

            const key = `${dateStr}|${lightId}|${csId ?? ''}|${clientId}`;
            const existing = dailyMap.get(key);
            if (existing) {
                existing.count++;
            } else {
                dailyMap.set(key, { date: dateStr, ligId: lightId, csId: csId && !isNaN(csId) ? csId : null, clientId, count: 1 });
            }
        }
    } catch (err) {
        console.warn('[Sync Cache] Error aggregating scandata.csv:', err);
    }

    return { lightToCsMap, scanDailySummary: Array.from(dailyMap.values()) };
}

interface ClickDailyRow { date: string; objId: number; codeName: string; count: number }

// Aggregate obj_click_log.csv → daily click summaries
async function aggregateClickLogCsv(): Promise<ClickDailyRow[]> {
    const dailyMap = new Map<string, ClickDailyRow>(); // key = "date|objId|codeName"

    try {
        const csvText = await fetchCsvText('obj_click_log.csv');
        if (!csvText) return [];

        const lines = csvText.split('\n');
        if (lines.length < 2) return [];

        // Parse header: time,code_name,obj_id
        const header = lines[0].split(',').map(h => h.trim().toLowerCase());
        const timeIdx = header.findIndex(h => h === 'time');
        const codeIdx = header.findIndex(h => h === 'code_name');
        const objIdx = header.findIndex(h => h === 'obj_id');

        if (timeIdx === -1 || objIdx === -1) return [];

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            const objId = Number(cols[objIdx]?.trim());
            if (isNaN(objId) || objId === 0) continue;

            const codeName = codeIdx !== -1 ? (cols[codeIdx]?.trim() || '') : '';
            const dateStr = cols[timeIdx]?.trim().slice(0, 10) || '';
            if (dateStr.length !== 10) continue;

            const key = `${dateStr}|${objId}|${codeName}`;
            const existing = dailyMap.get(key);
            if (existing) {
                existing.count++;
            } else {
                dailyMap.set(key, { date: dateStr, objId, codeName, count: 1 });
            }
        }
    } catch (err) {
        console.warn('[Sync Cache] Error aggregating obj_click_log.csv:', err);
    }

    return Array.from(dailyMap.values());
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

        // Step 2: Start CSV aggregation in parallel with client processing
        const scandataPromise = aggregateScandataCsv();
        const clickLogPromise = aggregateClickLogCsv();

        // Step 3: For each client, fetch scenes, coords, and active lights → scene mappings
        const allScenes: any[] = [];
        const allCoords: { id: number; name: string }[] = [];
        // light_id → Set<scene_id>
        const lightToSceneIds = new Map<number, Set<number>>();
        const lightSceneNames = new Map<number, string>(); // sceneId → sceneName from ar_objects_list
        const allActiveLightIds = new Set<number>(); // collected from all client active lights
        let savedToken = ''; // save first valid token for ar_objects_list calls

        const BATCH_SIZE = 3;
        for (let i = 0; i < clients.length; i += BATCH_SIZE) {
            const batch = clients.slice(i, i + BATCH_SIZE);

            await Promise.all(batch.map(async (client) => {
                if (!client.email || !client.password) return;
                const token = await loginLig(client.email, client.password);
                if (!token) return;
                if (!savedToken) savedToken = token;

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

        // Step 4: Wait for CSV aggregation
        const { lightToCsMap, scanDailySummary } = await scandataPromise;
        const clickDailySummary = await clickLogPromise;
        console.log(`[Sync Cache] scandata aggregated: ${lightToCsMap.size} lights, ${scanDailySummary.length} daily scan rows.`);
        console.log(`[Sync Cache] click log aggregated: ${clickDailySummary.length} daily click rows.`);

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
                lightBatch.map(lid => fetchSceneMappingsForLight(lid, savedToken))
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
            scanDailySummary,
            clickDailySummary,
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
                scanDailyRows: scanDailySummary.length,
                clickDailyRows: clickDailySummary.length,
                arObjectsListError: _arObjectsListFirstError || null,
            }
        });

    } catch (error: any) {
        console.error('[Sync Cache] Error:', error);
        return res.status(500).json({ error: 'Failed to sync lig cache', details: error.message });
    }
}
