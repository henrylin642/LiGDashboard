import express, { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

// Environment variables
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const router = express.Router();

function getSupabase() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error('Supabase configuration missing');
    }
    return createClient(SUPABASE_URL, SUPABASE_KEY);
}

// Get all clients
router.get('/', async (req: Request, res: Response) => {
    try {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('clients')
            .select('*')
            .order('id', { ascending: true });

        if (error) throw error;
        return res.status(200).json(data);
    } catch (error: any) {
        console.error('Error fetching clients:', error.message);
        return res.status(500).json({ error: 'Failed to fetch clients', details: error.message });
    }
});

// Create a single client
router.post('/', async (req: Request, res: Response) => {
    try {
        const supabase = getSupabase();
        const { name, email, password } = req.body;

        const { data, error } = await supabase
            .from('clients')
            .insert({ name, email, password })
            .select()
            .single();

        if (error) throw error;
        return res.status(201).json(data);
    } catch (error: any) {
        console.error('Error creating client:', error.message);
        return res.status(500).json({ error: 'Failed to create client', details: error.message });
    }
});

// Bulk upload clients
router.post('/upload', async (req: Request, res: Response) => {
    try {
        const supabase = getSupabase();
        const clients = req.body.clients; // Expected to be an array of { name, email, password, original_id }

        if (!Array.isArray(clients) || clients.length === 0) {
            return res.status(400).json({ error: 'Invalid or empty clients array' });
        }

        // We can either do bulk insert or upsert based on email/original_id. 
        // We'll use insert/upsert with email as a potential unique key if needed, 
        // but for simplicity let's just insert or upsert by original_id if defined.

        // Let's map to snake_case just in case table expects it
        const payload = clients.map((c: any) => ({
            name: c.name,
            email: c.email,
            password: c.password,
            original_id: c.id ? Number(c.id) : null
        }));

        // Insert multiple rows
        const { data, error } = await supabase
            .from('clients')
            .upsert(payload, { onConflict: 'email' }) // Assuming email is unique constraint
            .select();

        if (error) throw error;
        return res.status(200).json({ message: `Successfully uploaded ${data.length} clients`, data });
    } catch (error: any) {
        console.error('Error uploading clients:', error.message);
        return res.status(500).json({ error: 'Failed to upload clients', details: error.message });
    }
});

// Update a client
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const supabase = getSupabase();
        const id = req.params.id;
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
        console.error('Error updating client:', error.message);
        return res.status(500).json({ error: 'Failed to update client', details: error.message });
    }
});

// Delete a client
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const supabase = getSupabase();
        const id = req.params.id;

        const { error } = await supabase
            .from('clients')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return res.status(200).json({ message: 'Client deleted successfully' });
    } catch (error: any) {
        console.error('Error deleting client:', error.message);
        return res.status(500).json({ error: 'Failed to delete client', details: error.message });
    }
});

export default router;
