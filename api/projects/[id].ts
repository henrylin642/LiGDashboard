import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Environment variables
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { id } = req.query;

    if (!id || Array.isArray(id)) {
        return res.status(400).json({ error: 'Invalid ID' });
    }

    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ error: 'Supabase configuration missing' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    if (req.method === 'PATCH') {
        try {
            const body = req.body;
            let payload = body;

            // Handle Airtable-style 'fields' wrapper if present
            if (body.fields) {
                const f = body.fields;
                // Reuse simplified mapping logic or just check keys
                // For updates, we might receive partial data. 
                // We'll map known keys if they exist in `f`.

                const getVal = (keys: string[]) => {
                    for (const k of keys) {
                        if (f[k] !== undefined) return f[k];
                    }
                    return undefined;
                };

                // Build payload with only defined values
                const p: any = {};
                // We define the mapping and iterate
                const mapping = [
                    { s: 'project_id', a: ['ProjectID'] },
                    { s: 'name', a: ['Project Name', 'name'] },
                    { s: 'start_date', a: ['Start Date', 'start'] },
                    { s: 'end_date', a: ['End Date', 'end'] },
                    { s: 'coordinates', a: ['Coordinates'] },
                    { s: 'light_ids', a: ['Light ID', 'lightIds'] },
                    { s: 'scenes', a: ['Scenes'] },
                    { s: 'is_active', a: ['Is Active', 'isActive'] },
                    { s: 'lat_lon', a: ['Latitude and Longitude', 'latLon'] },
                    { s: 'owner_emails', a: ['Owner Email', 'ownerEmails'] },
                    { s: 'light_configs', a: ['Light Configs', 'lightConfigs'] },
                ];

                for (const m of mapping) {
                    const val = getVal(m.a);
                    if (val !== undefined) {
                        if (m.s === 'is_active') p[m.s] = val === true;
                        else p[m.s] = val;
                    }
                }
                payload = p;
            }

            // The 'id' in query could be the Airtable ID (if frontend sends that) or our Supabase UUID.
            // If we migrated data, we might not have preserved Airtable record IDs as the primary key.
            // But verify: migration script didn't explicitly set 'id' to Airtable ID. It generated new UUIDs.
            // PROBLEM: Frontend likely refers to records by their Airtable Record ID (e.g. `rec123...`).
            // WE NEED TO CHECK HOW WE IDENTIFY RECORDS.
            // In migration script: We did NOT save Airtable record ID ('id') into Supabase! 
            // We only saved `ProjectID` (custom string ID) into `project_id`.

            // If the frontend calls PATCH /api/projects/rec123... 
            // We need to know which record to update.
            // Since we didn't migrate the Airtable `id` column, we might have an issue if the frontend depends on it.
            // But looking at the code, `id` was usually the `ProjectID` (e.g. 'Project-1')? 
            // No, Airtable uses `rec...` IDs for API calls. 
            // The `api/projects/index.ts` returned `id: item.id`. 
            // In our new `index.ts`, we return Supabase UUID as `id`.
            // So if the frontend re-fetches the list, it will get the Supabase UUIDs.
            // Then it will call PATCH /api/projects/[UUID].
            // So `req.query.id` will be the UUID.

            const { data, error } = await supabase
                .from('projects')
                .update(payload)
                .eq('id', id)
                .select()
                .single(); // Ensure we get a single object, not an array

            if (error) throw error;

            // Transform back to Airtable format for frontend compatibility
            // See src/services/airtable.ts for field names
            const responseData = {
                id: data.id,
                createdTime: data.created_at,
                fields: {
                    'ProjectID': data.project_id,
                    'Project Name': data.name,
                    'Start Date': data.start_date,
                    'End Date': data.end_date,
                    'Coordinates': data.coordinates, // Array or string? Supabase stores arrays as JSON
                    'Light ID': data.light_ids,
                    'Scenes': data.scenes,
                    'Is Active': data.is_active,
                    'Latitude and Longitude': data.lat_lon,
                    'Owner Email': data.owner_emails,
                    'Light Configs': data.light_configs
                }
            };

            // Handle array fields being strings (if legacy data)
            // But Supabase JSON/Arrays should be fine. The frontend parseList handles string|array.

            return res.status(200).json(responseData);
        } catch (error: any) {
            console.error('Error updating project:', error.message);
            return res.status(500).json({ error: 'Failed to update project', details: error.message });
        }
    }

    if (req.method === 'DELETE') {
        try {
            const { error } = await supabase
                .from('projects')
                .delete()
                .eq('id', id);

            if (error) throw error;

            return res.status(200).json({ success: true, id });
        } catch (error: any) {
            console.error('Error deleting project:', error.message);
            return res.status(500).json({ error: 'Failed to delete project', details: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
