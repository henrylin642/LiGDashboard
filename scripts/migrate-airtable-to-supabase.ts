import dotenv from 'dotenv';
// Load env from .env.local if present
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

// --- Configuration ---
const AIRTABLE_PAT = process.env.VITE_AIRTABLE_PAT || process.env.AIRTABLE_PAT;
const AIRTABLE_BASE_ID = process.env.VITE_AIRTABLE_BASE_ID || process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_NAME = process.env.VITE_AIRTABLE_EVENTS_TABLE || process.env.AIRTABLE_EVENTS_TABLE || 'projects';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

// --- Field Mappings ---
const FIELD_MAP = {
    id: process.env.VITE_AIRTABLE_EVENTS_FIELD_EVENT_ID || 'ProjectID',
    name: process.env.VITE_AIRTABLE_EVENTS_FIELD_NAME || 'Project Name',
    start: process.env.VITE_AIRTABLE_EVENTS_FIELD_START || 'Start Date',
    end: process.env.VITE_AIRTABLE_EVENTS_FIELD_END || 'End Date',
    coordinates: process.env.VITE_AIRTABLE_PROJECT_FIELD_COORDINATES || 'Coordinates',
    lightIds: process.env.VITE_AIRTABLE_PROJECT_FIELD_LIGHT_IDS || 'Light ID',
    scenes: process.env.VITE_AIRTABLE_PROJECT_FIELD_SCENES || 'Scenes',
    active: process.env.VITE_AIRTABLE_PROJECT_FIELD_ACTIVE || 'Is Active',
    latLon: process.env.VITE_AIRTABLE_PROJECT_FIELD_LAT_LON || 'Latitude and Longitude',
    ownerEmails: process.env.VITE_AIRTABLE_PROJECT_FIELD_OWNER_EMAIL || 'Owner Email',
    lightConfigs: process.env.VITE_AIRTABLE_PROJECT_FIELD_LIGHT_CONFIGS || 'Light Configs',
};

// --- Helpers ---
const coerceString = (val: any): string => {
    if (val === undefined || val === null) return "";
    return String(val);
};

const parseList = (val: any): string[] => {
    if (Array.isArray(val)) return val.map(String);
    const str = coerceString(val);
    if (!str) return [];
    try {
        const parsed = JSON.parse(str);
        if (Array.isArray(parsed)) {
            return parsed.map((item: any) => String(item).trim()).filter(Boolean);
        }
    } catch (e) { }
    return str.split(',').map(s => s.trim()).filter(Boolean);
};

// --- Main ---
async function main() {
    console.log('--- 開始遷移：Airtable -> Supabase ---');

    // 1. Validate Config
    if (!AIRTABLE_PAT || !AIRTABLE_BASE_ID) {
        console.error('❌ 缺少 Airtable 設定。');
        process.exit(1);
    }
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.error('❌ 缺少 Supabase 設定。請設定 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY。');
        process.exit(1);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // 2. Fetch from Airtable
    console.log(`📥 正在從 Airtable base: ${AIRTABLE_BASE_ID}, table: ${AIRTABLE_TABLE_NAME} 讀取資料...`);
    let records: any[] = [];
    try {
        let offset = '';
        do {
            const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(AIRTABLE_TABLE_NAME)}?offset=${offset}`;
            const res = await axios.get(url, { headers: { Authorization: `Bearer ${AIRTABLE_PAT}` } });
            records = records.concat(res.data.records);
            offset = res.data.offset;
        } while (offset);
        console.log(`✅ 從 Airtable 成功讀取 ${records.length} 筆記錄。`);
    } catch (err: any) {
        console.error('❌ 讀取 Airtable 失敗:', err.message);
        process.exit(1);
    }

    // 3. Transform and Insert to Supabase
    console.log('📤 正在寫入資料至 Supabase...');

    let successCount = 0;
    let failCount = 0;

    for (const record of records) {
        const fields = record.fields;
        const mappedData = {
            project_id: coerceString(fields[FIELD_MAP.id]),
            name: coerceString(fields[FIELD_MAP.name]),
            start_date: fields[FIELD_MAP.start] ? new Date(fields[FIELD_MAP.start]).toISOString() : null,
            end_date: fields[FIELD_MAP.end] ? new Date(fields[FIELD_MAP.end]).toISOString() : null,
            coordinates: parseList(fields[FIELD_MAP.coordinates]),
            light_ids: parseList(fields[FIELD_MAP.lightIds]),
            scenes: parseList(fields[FIELD_MAP.scenes]),
            is_active: Boolean(fields[FIELD_MAP.active]),
            lat_lon: fields[FIELD_MAP.latLon] ? coerceString(fields[FIELD_MAP.latLon]) : null,
            owner_emails: parseList(fields[FIELD_MAP.ownerEmails]),
            light_configs: fields[FIELD_MAP.lightConfigs] ? coerceString(fields[FIELD_MAP.lightConfigs]) : null,
        };

        const { error } = await supabase
            .from('projects')
            .upsert(mappedData, { onConflict: 'project_id' }); // Assuming project_id is unique enough, or use another logic

        if (error) {
            console.error(`❌ 寫入失敗 ${mappedData.project_id} (${mappedData.name}):`, error.message);
            failCount++;
        } else {
            process.stdout.write('.');
            successCount++;
        }
    }

    console.log('\n');
    console.log(`-----------------------------------`);
    console.log(`遷移完成。`);
    console.log(`✅ 成功: ${successCount}`);
    console.log(`❌ 失敗:  ${failCount}`);
    console.log(`-----------------------------------`);
}

main();
