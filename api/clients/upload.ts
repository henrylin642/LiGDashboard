import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ error: 'Supabase configuration missing' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    try {
        const clients = req.body.clients;

        if (!Array.isArray(clients) || clients.length === 0) {
            return res.status(400).json({ error: 'Invalid or empty clients array' });
        }

        const payload = clients.map((c: any) => ({
            name: c.name,
            email: c.email,
            password: c.password,
            original_id: c.original_id ? Number(c.original_id) : null
        }));

        const { data, error } = await supabase
            .from('clients')
            .upsert(payload, { onConflict: 'email' })
            .select();

        if (error) throw error;
        return res.status(200).json({ message: `Successfully uploaded ${data.length} clients`, data });
    } catch (error: any) {
        console.error('Error uploading clients:', error.message);
        return res.status(500).json({ error: 'Failed to upload clients', details: error.message });
    }
}
