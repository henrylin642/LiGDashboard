import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Mock fetch for Node environment if needed, or just use node-fetch
// Since we are running this as a script, we might need to hit the local server URL
// or read the local DB file if it exists.
// The user is running `npm run dev` which likely starts a server on localhost:3000 (or similar).
// Let's assume the server is running on http://localhost:3000 based on typical Vite/Express setups.
// We can use `fetch` (available in Node 18+) to hit the API.

const API_URL = 'http://localhost:3001/api/projects'; // Assuming backend port is 3001 or we can try 3000
// Wait, the user has `npm run dev` in `server` directory and `npm run dev` in root.
// Usually server runs on 3001 or 3000. Let's try to find the port or just try both.
// Actually, I can just read the `server` code to see where it stores data if it's a local JSON/SQLite.
// But hitting the API is safer as it respects the transformation logic.

async function backupProjects() {
    try {
        // Try port 3001 first (common for backend in separate folder)
        let response = await fetch('http://localhost:3001/api/projects');
        if (!response.ok) {
            console.log('Port 3001 failed, trying 3000...');
            response = await fetch('http://localhost:3000/api/projects');
        }

        if (!response.ok) {
            throw new Error(`Failed to fetch projects: ${response.status} ${response.statusText}`);
        }

        const projects = await response.json();

        if (!Array.isArray(projects)) {
            throw new Error('Response is not an array');
        }

        // Convert to CSV
        const headers = [
            'id', 'projectId', 'projectName', 'startDate', 'endDate',
            'coordinates', 'lightIds', 'scenes', 'isActive', 'latLon', 'ownerEmails'
        ];

        const csvRows = [headers.join(',')];

        for (const p of projects) {
            const row = headers.map(header => {
                let val = p[header];
                if (Array.isArray(val)) {
                    val = JSON.stringify(val).replace(/"/g, '""'); // Escape quotes
                    return `"${val}"`;
                }
                if (val === null || val === undefined) return '';
                val = String(val).replace(/"/g, '""');
                return `"${val}"`;
            });
            csvRows.push(row.join(','));
        }

        const csvContent = csvRows.join('\n');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `projects_backup_${timestamp}.csv`;
        const outputPath = path.join(process.cwd(), 'public', 'data', filename);

        fs.writeFileSync(outputPath, csvContent);
        console.log(`Backup created at: ${outputPath}`);

    } catch (error) {
        console.error('Backup failed:', error);
        process.exit(1);
    }
}

backupProjects();
