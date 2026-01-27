import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Environment variables
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.error('[Supabase] Missing configuration');
        return res.status(500).json({ error: 'Supabase configuration missing' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    if (req.method === 'GET') {
        try {
            console.log('[Supabase] GET /api/projects');

            // Fetch all projects, order by created_at or start_date as needed
            // Defaulting to match previous behavior (no specific sort in code, but typically desired)
            const { data, error } = await supabase
                .from('projects')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            console.log('[Supabase] Success, records:', data?.length);

            // Map Supabase fields to frontend expected format
            // The frontend expects:
            // id, projectId, projectName, startDate, endDate, coordinates, lightIds, scenes, isActive, latLon, ownerEmails, lightConfigs
            // Our Supabase table columns:
            // id, project_id, name, start_date, end_date, coordinates, light_ids, scenes, is_active, lat_lon, owner_emails, light_configs

            const records = data.map((item: any) => ({
                id: item.id, // Using UUID from Supabase
                createdTime: item.created_at,
                // Ensure we map back to what frontend expects
                // Original frontend code might expect Airtable record ID as 'id', 
                // but we should use our new UUID. However, let's keep frontend fields consistent.

                projectId: item.project_id,
                projectName: item.name,
                startDate: item.start_date,
                endDate: item.end_date,
                coordinates: item.coordinates || [],
                lightIds: item.light_ids || [],
                scenes: item.scenes || [],
                isActive: item.is_active,
                latLon: item.lat_lon,
                ownerEmails: item.owner_emails || [],
                lightConfigs: item.light_configs,
            }));

            return res.status(200).json(records);
        } catch (error: any) {
            console.error('Error fetching Supabase data:', error.message);
            return res.status(500).json({ error: 'Failed to fetch project data' });
        }
    }

    if (req.method === 'POST') {
        try {
            const body = req.body;
            // Map frontend body (camelCase) to Supabase columns (snake_case)
            // Frontend sends: fields: { ... } structure from AirTable logic? 
            // Or does frontend send flat object? 
            // Looking at previous airtable.ts, it just forwarded req.body to Airtable.
            // Airtable expects { fields: { ... } }.
            // We need to check what the frontend sends.
            // Assuming frontend was communicating with our proxy, which forwarded to Airtable.
            // So frontend likely sends { fields: { ... } }.

            let payload = body;
            if (body.fields) {
                // Adapt Airtable-style payload to Supabase
                const f = body.fields;
                // Original FIELD_MAP in airtable.ts used env vars to map keys. 
                // We should try to be robust.

                // Helper to get value from multiple possible keys
                const getVal = (keys: string[]) => {
                    for (const k of keys) {
                        if (f[k] !== undefined) return f[k];
                    }
                    return null;
                };

                // Construct Supabase payload
                payload = {
                    project_id: getVal(['ProjectID', 'project_id', process.env.VITE_AIRTABLE_EVENTS_FIELD_EVENT_ID || '']),
                    name: getVal(['Project Name', 'name', process.env.VITE_AIRTABLE_EVENTS_FIELD_NAME || '']),
                    start_date: getVal(['Start Date', 'start_date', 'start']),
                    end_date: getVal(['End Date', 'end_date', 'end']),
                    coordinates: getVal(['Coordinates', 'coordinates']),
                    light_ids: getVal(['Light ID', 'lightIds', 'light_ids']),
                    scenes: getVal(['Scenes', 'scenes']),
                    is_active: getVal(['Is Active', 'isActive', 'is_active']) === true,
                    lat_lon: getVal(['Latitude and Longitude', 'latLon', 'lat_lon']),
                    owner_emails: getVal(['Owner Email', 'ownerEmails', 'owner_emails']),
                    light_configs: getVal(['Light Configs', 'lightConfigs', 'light_configs']),
                };
            }

            // Clean up: ensure arrays are arrays, etc.
            if (typeof payload.coordinates === 'string') payload.coordinates = payload.coordinates.split(',');
            if (typeof payload.light_ids === 'string') payload.light_ids = payload.light_ids.split(',');

            const { data, error } = await supabase
                .from('projects')
                .insert(payload)
                .select()
                .single();

            if (error) throw error;

            // Transform back to Airtable format for frontend compatibility
            const responseData = {
                id: data.id,
                createdTime: data.created_at,
                fields: {
                    'ProjectID': data.project_id,
                    'Project Name': data.name,
                    'Start Date': data.start_date,
                    'End Date': data.end_date,
                    'Coordinates': data.coordinates,
                    'Light ID': data.light_ids,
                    'Scenes': data.scenes,
                    'Is Active': data.is_active,
                    'Latitude and Longitude': data.lat_lon,
                    'Owner Email': data.owner_emails,
                    'Light Configs': data.light_configs
                }
            };

            return res.status(200).json(responseData);
        } catch (error: any) {
            console.error('Error creating project:', error.message);
            return res.status(500).json({ error: 'Failed to create project', details: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
