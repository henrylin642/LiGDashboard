import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ error: 'Supabase configuration missing' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    if (req.method === 'GET') {
        try {
            const { data, error } = await supabase
                .from('clients')
                .select('*')
                .order('id', { ascending: true });

            if (error) throw error;
            return res.status(200).json(data);
        } catch (error: any) {
            return res.status(500).json({ error: 'Failed to fetch clients', details: error.message });
        }
    }

    if (req.method === 'POST') {
        try {
            const { name, email, password } = req.body;
            const { data, error } = await supabase
                .from('clients')
                .insert({ name, email, password })
                .select()
                .single();

            if (error) throw error;
            return res.status(201).json(data);
        } catch (error: any) {
            return res.status(500).json({ error: 'Failed to create client', details: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
