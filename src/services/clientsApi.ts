export interface ClientRecord {
    id?: number;
    name: string;
    email: string;
    password?: string;
    original_id?: number | null;
    created_at?: string;
}

export async function fetchClients(): Promise<ClientRecord[]> {
    const res = await fetch('/api/clients');
    if (!res.ok) throw new Error(`fetchClients error: ${await res.text()}`);
    return res.json();
}

export async function createClient(data: Partial<ClientRecord>): Promise<ClientRecord> {
    const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`createClient error: ${await res.text()}`);
    return res.json();
}

export async function uploadClients(clients: Partial<ClientRecord>[]): Promise<any> {
    const res = await fetch('/api/clients/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clients })
    });
    if (!res.ok) throw new Error(`uploadClients error: ${await res.text()}`);
    return res.json();
}

export async function updateClient(id: number, data: Partial<ClientRecord>): Promise<ClientRecord> {
    const res = await fetch(`/api/clients/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(`updateClient error: ${await res.text()}`);
    return res.json();
}

export async function deleteClient(id: number): Promise<void> {
    const res = await fetch(`/api/clients/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`deleteClient error: ${await res.text()}`);
}
