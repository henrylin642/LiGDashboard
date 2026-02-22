import express, { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

// Environment variables
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const router = express.Router();

router.get('/', async (req: Request, res: Response) => {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.error('[Supabase] Missing configuration');
        return res.status(500).json({ error: 'Supabase configuration missing' });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    try {
        console.log('[Supabase] GET /api/projects');

        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        console.log('[Supabase] Success, records:', data?.length);

        const records = data.map((item: any) => ({
            id: item.id,
            createdTime: item.created_at,
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
});

router.post('/', async (req: Request, res: Response) => {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.error('[Supabase] Missing configuration');
        return res.status(500).json({ error: 'Supabase configuration missing' });
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    try {
        const body = req.body;
        let payload = body;
        
        if (body.fields) {
            const f = body.fields;
            const getVal = (keys: string[]) => {
                for (const k of keys) {
                    if (f[k] !== undefined) return f[k];
                }
                return null;
            };

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

        if (typeof payload.coordinates === 'string') payload.coordinates = payload.coordinates.split(',');
        if (typeof payload.light_ids === 'string') payload.light_ids = payload.light_ids.split(',');

        const { data, error } = await supabase
            .from('projects')
            .insert(payload)
            .select()
            .single();

        if (error) throw error;

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
});

export default router;
