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
        console.warn(`[Sync Cache] Login failed for ${email}:`, err.response?.status, err.response?.data);
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
            raw: item,
            createdAt: item.created_at ?? item.createdAt ?? null,
            updatedAt: item.updated_at ?? item.updatedAt ?? null,
        })).filter(s => !isNaN(s.id));
    } catch {
        return [];
    }
}

// Fetch coordinate systems for a token
async function fetchCoords(token: string) {
    try {
        // According to ligApi.ts, it uses /api/v1/coordinate_systems
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
                name: String(item.name ?? item.title ?? "").trim(),
                sceneId: item.scene_id ?? null,
                sceneName: item.scene_name ?? null,
                lightIds: Array.isArray(item.lights) ? item.lights.map((l: any) => Number(l.id || l.light_id || l)) : [],
                raw: item,
            };
        }).filter(Boolean);
    } catch {
        return [];
    }
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
        console.log('[Sync Cache] Fetching all clients from Supabase...');
        const { data: clients, error: clientErr } = await supabase.from('clients').select('email, password');

        if (clientErr) throw clientErr;
        if (!clients || clients.length === 0) {
            return res.status(200).json({ message: 'No clients to process.' });
        }

        console.log(`[Sync Cache] Processing ${clients.length} clients...`);

        const allScenes: any[] = [];
        const allCoords: any[] = [];

        // Process in small batches to avoid LiG API rate limits
        const BATCH_SIZE = 3;
        for (let i = 0; i < clients.length; i += BATCH_SIZE) {
            const batch = clients.slice(i, i + BATCH_SIZE);

            await Promise.all(batch.map(async (client) => {
                if (!client.email || !client.password) return;
                const token = await loginLig(client.email, client.password);
                if (!token) return;

                const [scenes, coords] = await Promise.all([
                    fetchScenes(token),
                    fetchCoords(token)
                ]);

                allScenes.push(...scenes);
                allCoords.push(...coords);
            }));
        }

        // De-duplicate aggregated results
        const uniqueScenes = Array.from(new Map(allScenes.map(s => [s.id, s])).values());
        const uniqueCoords = Array.from(new Map(allCoords.map(c => [c.id, c])).values());

        console.log(`[Sync Cache] Done. Found ${uniqueScenes.length} unique scenes and ${uniqueCoords.length} unique coords.`);

        const payload = {
            scenes: uniqueScenes,
            coordinateSystems: uniqueCoords,
        };

        // Write to cache using `upsert`
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
            message: 'Cache updated successfully.',
            stats: { scenes: uniqueScenes.length, coords: uniqueCoords.length }
        });

    } catch (error: any) {
        console.error('[Sync Cache] Error:', error);
        return res.status(500).json({ error: 'Failed to sync lig cache', details: error.message });
    }
}
