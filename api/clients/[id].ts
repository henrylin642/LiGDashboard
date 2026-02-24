import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Vercel routes params like /api/clients/[id] to req.query.id
    const id = req.query.id as string;

    if (!id) {
        return res.status(400).json({ error: 'Missing client id' });
    }

    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ error: 'Supabase configuration missing' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    if (req.method === 'PUT') {
        try {
            const { name, email, password } = req.body;
            const { data, error } = await supabase
                .from('clients')
                .update({ name, email, password })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return res.status(200).json(data);
        } catch (error: any) {
            return res.status(500).json({ error: 'Failed to update client', details: error.message });
        }
    }

    if (req.method === 'DELETE') {
        try {
            const { error } = await supabase
                .from('clients')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return res.status(200).json({ message: 'Client deleted successfully' });
        } catch (error: any) {
            return res.status(500).json({ error: 'Failed to delete client', details: error.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
