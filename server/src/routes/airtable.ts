import express from 'express';
import axios from 'axios';

const router = express.Router();

const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME = process.env.AIRTABLE_EVENTS_TABLE || 'projects';

// Field mappings
const FIELD_MAP = {
    id: process.env.AIRTABLE_EVENTS_FIELD_EVENT_ID || 'ProjectID',
    name: process.env.AIRTABLE_EVENTS_FIELD_NAME || 'Project Name',
    start: process.env.AIRTABLE_EVENTS_FIELD_START || 'Start Date',
    end: process.env.AIRTABLE_EVENTS_FIELD_END || 'End Date',
    coordinates: process.env.AIRTABLE_PROJECT_FIELD_COORDINATES || 'Coordinates',
    lightIds: process.env.AIRTABLE_PROJECT_FIELD_LIGHT_IDS || 'Light ID',
    scenes: process.env.AIRTABLE_PROJECT_FIELD_SCENES || 'Scenes',
    active: process.env.AIRTABLE_PROJECT_FIELD_ACTIVE || 'Is Active',
    latLon: process.env.AIRTABLE_PROJECT_FIELD_LAT_LON || 'Latitude and Longitude',
    ownerEmails: process.env.AIRTABLE_PROJECT_FIELD_OWNER_EMAIL || 'Owner Email',
};

router.get('/', async (req, res) => {
    console.log('[Airtable] GET /api/projects');
    console.log('[Airtable] Config:', {
        hasPat: !!AIRTABLE_PAT,
        baseId: AIRTABLE_BASE_ID,
        table: AIRTABLE_TABLE_NAME
    });

    if (!AIRTABLE_PAT || !AIRTABLE_BASE_ID) {
        console.error('[Airtable] Missing configuration');
        return res.status(500).json({ error: 'Airtable configuration missing' });
    }

    try {
        const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`;
        console.log('[Airtable] Fetching URL:', url);

        // Handle pagination if needed, for now simple fetch
        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${AIRTABLE_PAT}`,
            },
            params: {
                // Add sort if needed
                // sort: [{ field: 'Start Date', direction: 'desc' }]
            }
        });
        console.log('[Airtable] Success, records:', response.data.records.length);

        // Helper to coerce string
        const coerceString = (val: any): string => {
            if (val === undefined || val === null) return "";
            return String(val);
        };

        // Helper to parse list from string or array
        const parseList = (val: any): string[] => {
            if (Array.isArray(val)) return val.map(String);
            const str = coerceString(val);
            if (!str) return [];
            try {
                const parsed = JSON.parse(str);
                if (Array.isArray(parsed)) {
                    return parsed.map((item: any) => String(item).trim()).filter(Boolean);
                }
            } catch (e) {
                // ignore
            }
            return str.split(',').map(s => s.trim()).filter(Boolean);
        };

        const records = response.data.records.map((record: any) => {
            const fields = record.fields;
            return {
                id: record.id,
                createdTime: record.createdTime,
                projectId: coerceString(fields[FIELD_MAP.id]),
                projectName: coerceString(fields[FIELD_MAP.name]),
                startDate: fields[FIELD_MAP.start] ? coerceString(fields[FIELD_MAP.start]) : null,
                endDate: fields[FIELD_MAP.end] ? coerceString(fields[FIELD_MAP.end]) : null,
                coordinates: parseList(fields[FIELD_MAP.coordinates]),
                lightIds: parseList(fields[FIELD_MAP.lightIds]),
                scenes: parseList(fields[FIELD_MAP.scenes]),
                isActive: Boolean(fields[FIELD_MAP.active]),
                latLon: fields[FIELD_MAP.latLon] ? coerceString(fields[FIELD_MAP.latLon]) : null,
                ownerEmails: parseList(fields[FIELD_MAP.ownerEmails]),
            };
        });

        res.json(records);
    } catch (error: any) {
        console.error('Error fetching Airtable data:', error.response?.data || error.message);
        res.status(500).json({ error: 'Failed to fetch project data' });
    }
});

router.post('/', async (req, res) => {
    if (!AIRTABLE_PAT || !AIRTABLE_BASE_ID) return res.status(500).json({ error: 'Config missing' });
    try {
        const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}`;
        const response = await axios.post(url, req.body, {
            headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' }
        });
        res.json(response.data);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to create project' });
    }
});

router.patch('/:id', async (req, res) => {
    if (!AIRTABLE_PAT || !AIRTABLE_BASE_ID) return res.status(500).json({ error: 'Config missing' });
    try {
        const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}/${req.params.id}`;
        const response = await axios.patch(url, req.body, {
            headers: { Authorization: `Bearer ${AIRTABLE_PAT}`, 'Content-Type': 'application/json' }
        });
        res.json(response.data);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to update project' });
    }
});

router.delete('/:id', async (req, res) => {
    if (!AIRTABLE_PAT || !AIRTABLE_BASE_ID) return res.status(500).json({ error: 'Config missing' });
    try {
        const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}/${req.params.id}`;
        const response = await axios.delete(url, {
            headers: { Authorization: `Bearer ${AIRTABLE_PAT}` }
        });
        res.json(response.data);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

export default router;
