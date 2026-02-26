/**
 * Local test of the enriched cache sync logic.
 * Tests the core functions from sync_lig_cache.ts without running the Vercel handler.
 */
import axios from 'axios';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = process.env.VITE_LIG_API_BASE || process.env.LIG_API_BASE || 'https://api.lig.com.tw';

async function loginLig(email: string, password: string): Promise<string | null> {
    try {
        const res = await axios.post(`${API_BASE}/api/v1/login`, {
            user: { email, password }
        });
        return res.data?.token || res.data?.access_token || null;
    } catch { return null; }
}

async function fetchScenes(token: string) {
    try {
        const res = await axios.get(`${API_BASE}/api/scenes`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = Array.isArray(res.data) ? res.data : (res.data?.scenes || []);
        return data.map((item: any) => ({
            id: Number(item.id),
            name: String(item.name ?? "").trim(),
            projectId: item.project_id ?? null,
        })).filter((s: any) => !isNaN(s.id));
    } catch { return []; }
}

async function fetchCoords(token: string) {
    try {
        const res = await axios.get(`${API_BASE}/api/v1/coordinate_systems`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = Array.isArray(res.data) ? res.data : (res.data?.coordinate_systems || []);
        return data.map((item: any) => ({
            id: Number(item.id),
            name: String(item.name ?? "").trim(),
        })).filter((c: any) => !isNaN(c.id));
    } catch { return []; }
}

async function fetchActiveLights(token: string): Promise<number[]> {
    try {
        const res = await axios.get(`${API_BASE}/api/v1/lights?limit=10000`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = Array.isArray(res.data) ? res.data : (res.data?.lights || []);
        return data.filter((l: any) => l.status !== '庫存').map((l: any) => Number(l.id)).filter((id: number) => !isNaN(id));
    } catch { return []; }
}

async function fetchArObjSceneMapping(token: string, lightId: number): Promise<number[]> {
    try {
        const res = await axios.get(`${API_BASE}/api/v1/ar_objects_from_scene/${lightId}`, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 5000
        });
        const arObjects = res.data?.ar_objects || (Array.isArray(res.data) ? res.data : []);
        const sceneIds = new Set<number>();
        for (const obj of arObjects) {
            const sid = Number(obj.scene_id);
            if (!isNaN(sid) && sid > 0) sceneIds.add(sid);
        }
        return Array.from(sceneIds);
    } catch { return []; }
}

function parseScandataForLightCs(): Map<number, Set<number>> {
    const map = new Map<number, Set<number>>();
    try {
        const csvPath = path.resolve(__dirname, 'public/data/scandata.csv');
        if (!fs.existsSync(csvPath)) {
            console.log('[Test] scandata.csv not found at', csvPath);
            return map;
        }
        const text = fs.readFileSync(csvPath, 'utf-8');
        const lines = text.split('\n');
        const header = lines[0].split(',').map(h => h.trim().toLowerCase());
        const lightIdx = header.findIndex(h => h === 'ligtag_id' || h === 'light_id');
        const csIdx = header.findIndex(h => h === 'coordinate_system_id');
        if (lightIdx === -1 || csIdx === -1) return map;

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',');
            const lightId = Number(cols[lightIdx]?.trim());
            const csId = Number(cols[csIdx]?.trim());
            if (isNaN(lightId) || isNaN(csId) || csId === 0) continue;
            if (!map.has(lightId)) map.set(lightId, new Set());
            map.get(lightId)!.add(csId);
        }
        console.log(`[Test] Parsed scandata: ${map.size} unique lights with CS mappings`);
    } catch (e) {
        console.log('[Test] Failed to parse scandata.csv:', e);
    }
    return map;
}

async function run() {
    const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
    const { data: clients } = await supabase.from('clients').select('email, password');
    if (!clients || clients.length === 0) { console.log("No clients"); return; }

    console.log(`Processing ${clients.length} clients...`);

    // Parse scandata for Light→CS mappings
    const lightToCsMap = parseScandataForLightCs();

    const allScenes: any[] = [];
    const allCoords: any[] = [];
    const lightToSceneIds = new Map<number, Set<number>>();
    let totalActiveLights = 0;
    let totalLightsWithScenes = 0;

    const BATCH_SIZE = 3;
    for (let i = 0; i < clients.length; i += BATCH_SIZE) {
        const batch = clients.slice(i, i + BATCH_SIZE);
        process.stdout.write(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(clients.length / BATCH_SIZE)}...`);

        await Promise.all(batch.map(async (client) => {
            if (!client.email || !client.password) return;
            const token = await loginLig(client.email, client.password);
            if (!token) return;

            const [scenes, coords, activeLightIds] = await Promise.all([
                fetchScenes(token),
                fetchCoords(token),
                fetchActiveLights(token)
            ]);

            allScenes.push(...scenes);
            allCoords.push(...coords);
            totalActiveLights += activeLightIds.length;

            // Fetch scene mappings for active lights
            const LIGHT_BATCH = 5;
            for (let j = 0; j < activeLightIds.length; j += LIGHT_BATCH) {
                const lightBatch = activeLightIds.slice(j, j + LIGHT_BATCH);
                const results = await Promise.all(
                    lightBatch.map(lid => fetchArObjSceneMapping(token, lid))
                );
                lightBatch.forEach((lid, idx) => {
                    const sceneIds = results[idx];
                    if (sceneIds.length > 0) {
                        if (!lightToSceneIds.has(lid)) lightToSceneIds.set(lid, new Set());
                        sceneIds.forEach(sid => lightToSceneIds.get(lid)!.add(sid));
                        totalLightsWithScenes++;
                    }
                });
            }
        }));
        console.log(' done');
    }

    // Build CS ↔ Scene bridge
    const csToSceneIds = new Map<number, Set<number>>();
    const csToLightIds = new Map<number, Set<number>>();

    for (const [lightId, csIds] of lightToCsMap.entries()) {
        const sceneIds = lightToSceneIds.get(lightId);
        for (const csId of csIds) {
            if (!csToLightIds.has(csId)) csToLightIds.set(csId, new Set());
            csToLightIds.get(csId)!.add(lightId);
            if (sceneIds && sceneIds.size > 0) {
                if (!csToSceneIds.has(csId)) csToSceneIds.set(csId, new Set());
                for (const sid of sceneIds) csToSceneIds.get(csId)!.add(sid);
            }
        }
    }

    // De-duplicate
    const uniqueScenes = Array.from(new Map(allScenes.map(s => [s.id, s])).values());
    const uniqueCoordsMap = new Map<number, any>();
    allCoords.forEach(c => { if (!uniqueCoordsMap.has(c.id)) uniqueCoordsMap.set(c.id, c); });

    const sceneNameMap = new Map<number, string>();
    uniqueScenes.forEach(s => sceneNameMap.set(s.id, s.name));

    const enrichedCoords = Array.from(uniqueCoordsMap.values()).map(cs => {
        const sceneIds = csToSceneIds.get(cs.id);
        const lightIds = csToLightIds.get(cs.id);
        let sceneId: number | null = null;
        let sceneName: string | null = null;
        if (sceneIds && sceneIds.size > 0) {
            sceneId = sceneIds.values().next().value!;
            sceneName = sceneNameMap.get(sceneId) || null;
        }
        return { id: cs.id, name: cs.name, sceneId, sceneName, lightIds: lightIds ? Array.from(lightIds).sort((a, b) => a - b) : [] };
    });

    console.log('\n=== Results ===');
    console.log(`Total unique scenes: ${uniqueScenes.length}`);
    console.log(`Total unique coordinate systems: ${enrichedCoords.length}`);
    console.log(`Total active lights processed: ${totalActiveLights}`);
    console.log(`Lights with scene mappings: ${totalLightsWithScenes}`);
    console.log(`CS with scene links: ${enrichedCoords.filter(c => c.sceneId).length}`);
    console.log(`CS with light links: ${enrichedCoords.filter(c => c.lightIds.length > 0).length}`);
    console.log('\nSample enriched CS:');
    enrichedCoords.filter(c => c.sceneId).slice(0, 5).forEach(c => {
        console.log(`  CS ${c.id} "${c.name}" → Scene ${c.sceneId} "${c.sceneName}" | Lights: [${c.lightIds.join(', ')}]`);
    });

    // Write to Supabase
    const payload = { scenes: uniqueScenes, coordinateSystems: enrichedCoords };
    const { error } = await supabase.from('api_cache').upsert({
        key: 'lig_aggregated_data',
        data: payload,
        updated_at: new Date().toISOString()
    }, { onConflict: 'key' });

    if (error) {
        console.error('Supabase upsert error:', error);
    } else {
        console.log('\n✅ Successfully wrote enriched cache to Supabase!');
    }
}

const start = Date.now();
run().then(() => {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\nTotal time: ${elapsed}s`);
});
