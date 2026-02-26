import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.error('Supabase configuration missing');
        return;
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: cache, error } = await supabase.from('api_cache').select('updated_at, data').eq('key', 'lig_aggregated_data').single();

    if (error) {
        console.error("Error fetching cache:", error);
        return;
    }

    if (!cache) {
        console.log("No cache found in DB.");
        return;
    }

    console.log("Updated at:", cache.updated_at);
    console.log("Scenes count:", cache.data.scenes?.length);
    console.log("Coords count:", cache.data.coordinateSystems?.length);
}

run().catch(console.error);
