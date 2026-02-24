import React, { useState, useEffect } from 'react';
import { fetchClients, uploadClients, deleteClient } from '../services/clientsApi';
import type { ClientRecord } from '../services/clientsApi';

export function ClientManagementPanel() {
    const [clients, setClients] = useState<ClientRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const loadClients = async () => {
        setLoading(true);
        try {
            const data = await fetchClients();
            setClients(data);
            setError(null);
        } catch (err: any) {
            setError(err.message || '載入客戶資料失敗');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadClients();
    }, []);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const text = event.target?.result as string;
                if (!text) return;

                // Simple CSV parsing
                const lines = text.split('\n').filter(line => line.trim() !== '');
                if (lines.length < 2) throw new Error('CSV holds no data');

                const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
                const idIdx = headers.findIndex(h => h.toLowerCase() === 'id');
                const nameIdx = headers.findIndex(h => h.toLowerCase() === 'name');
                const emailIdx = headers.findIndex(h => h.toLowerCase() === 'email_users' || h.toLowerCase() === 'email');
                const pwIdx = headers.findIndex(h => h.toLowerCase() === 'password');

                if (nameIdx === -1 || emailIdx === -1) {
                    throw new Error('CSV format incorrect: Missing name or email column');
                }

                const parsedClients: Partial<ClientRecord>[] = [];
                for (let i = 1; i < lines.length; i++) {
                    const row = lines[i].split(',').map(c => c.trim().replace(/"/g, ''));
                    // Need to handle commas inside quotes if they exist, but split(',') is quick for simple CSV
                    // The client.csv provided has some emails separated by commas in quotes.
                    // We need a slightly better CSV parser to handle quotes
                    const matchRow = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
                    const cols = matchRow ? matchRow.map(v => v.replace(/^"|"$/g, '').trim()) : row;

                    const name = cols[nameIdx];
                    const emailString = cols[emailIdx] || '';
                    const pw = pwIdx !== -1 ? cols[pwIdx] : '';
                    const origId = idIdx !== -1 ? Number(cols[idIdx]) : null;

                    if (name && emailString) {
                        // Emails might have multiple emails separated by commas or spaces inside the field
                        const emails = emailString.includes(',') ? emailString.split(',') : [emailString];
                        for (let email of emails) {
                            email = email.trim();
                            if (email) {
                                parsedClients.push({
                                    original_id: origId,
                                    name,
                                    email,
                                    password: pw,
                                });
                            }
                        }
                    }
                }

                setLoading(true);
                await uploadClients(parsedClients);
                setSuccessMsg(`成功匯入 ${parsedClients.length} 筆客戶資料`);
                loadClients();
            } catch (err: any) {
                setError(err.message || '匯入發生錯誤');
            } finally {
                setLoading(false);
                // clear file input
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('確定要刪除此帳號嗎？')) return;
        setLoading(true);
        try {
            await deleteClient(id);
            setSuccessMsg('刪除成功');
            loadClients();
        } catch (err: any) {
            setError(err.message || '刪除失敗');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="panel panel--surface">
            <h3 className="panel__title">Client Management (Supabase)</h3>
            <p>透過上傳 `client.csv` 自動建立並更新所有客戶的登入帳號與密碼，供 Dashboard 跨帳號撈取 Scene 報表使用。</p>

            <div style={{ marginBottom: "1rem" }}>
                <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    disabled={loading}
                    style={{ display: "block", marginBottom: "0.5rem" }}
                />
                <small className="form-hint">CSV 必須包含 Id, Name, Email_Users, Password 欄位</small>
            </div>

            {error && <p className="form-error">⚠️ {error}</p>}
            {successMsg && <p className="form-success">✅ {successMsg}</p>}

            <div className="table-wrapper" style={{ maxHeight: "300px", overflowY: "auto" }}>
                {loading ? (
                    <p>載入中...</p>
                ) : clients.length === 0 ? (
                    <p>目前沒有客戶資料。</p>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                        <thead style={{ position: "sticky", top: 0, background: "#fff", zIndex: 1, borderBottom: "2px solid #ddd" }}>
                            <tr>
                                <th>Orig ID</th>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Password</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {clients.map(c => (
                                <tr key={c.id} style={{ borderBottom: "1px solid #eee" }}>
                                    <td>{c.original_id ?? '-'}</td>
                                    <td>{c.name}</td>
                                    <td>{c.email}</td>
                                    <td>{c.password ? '****' : '(空)'}</td>
                                    <td>
                                        <button
                                            type="button"
                                            className="secondary"
                                            onClick={() => c.id && handleDelete(c.id)}
                                            style={{ padding: "2px 8px", fontSize: "0.8em" }}
                                        >
                                            刪除
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            <div style={{ marginTop: "1rem" }}>
                <p>總計: {clients.length} 個帳號</p>
            </div>
        </div>
    );
}
