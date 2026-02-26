import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = process.env.VITE_LIG_API_BASE || process.env.LIG_API_BASE || 'https://api.lig.com.tw';

async function loginLig(email: string, password: string): Promise<string | null> {
    try {
        console.log(`Attempting login for ${email} ...`);
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

async function fetchScenes(token: string) {
    try {
        const res = await axios.get(`${API_BASE}/api/scenes`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = Array.isArray(res.data) ? res.data : (res.data?.scenes || res.data?.data || []);
        console.log(`fetchScenes returned ${data.length} items for token.`);
        if (!Array.isArray(data)) return [];

        return data.map(item => ({
            id: Number(item.scene_id ?? item.id),
            name: String(item.name ?? item.title ?? "").trim(),
            raw: item,
            createdAt: item.created_at ?? item.createdAt ?? null,
            updatedAt: item.updated_at ?? item.updatedAt ?? null,
        })).filter(s => !isNaN(s.id));
    } catch (err: any) {
        console.warn(`[Sync Cache] fetchScenes failed:`, err.response?.status, err.response?.data);
        return [];
    }
}

async function fetchCoords(token: string) {
    try {
        const res = await axios.get(`${API_BASE}/api/v1/coordinate_systems`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = Array.isArray(res.data) ? res.data : (res.data?.coordinate_systems || []);
        console.log(`fetchCoords returned ${data.length} items for token.`);
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
    } catch (err: any) {
        console.warn(`[Sync Cache] fetchCoords failed:`, err.response?.status, err.response?.data);
        return [];
    }
}

async function run() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.error('Supabase configuration missing');
        return;
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('[Sync Cache] Fetching all clients from Supabase...');
    const { data: clients, error: clientErr } = await supabase.from('clients').select('email, password').limit(5); // Just grab 5 for testing

    if (clientErr) throw clientErr;
    if (!clients || clients.length === 0) {
        console.log('No clients to process.');
        return;
    }

    console.log(`[Sync Cache] Processing ${clients.length} clients...`);

    const token = await loginLig(clients[0].email, clients[0].password);
    if (!token) {
        console.error("Login completely failed for first user!");
        return;
    }

    console.log("Login succeeded, token:", token.substring(0, 10) + "...");

    const scenes = await fetchScenes(token);
    console.log("Parsed scenes length:", scenes.length);

    const coords = await fetchCoords(token);
    console.log("Parsed coords length:", coords.length);
}

run().catch(console.error);
