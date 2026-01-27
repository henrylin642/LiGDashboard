import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';

// Environment variables
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

const getGoogleDrive = () => {
    if (!SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY) {
        return null;
    }
    const auth = new google.auth.JWT({
        email: SERVICE_ACCOUNT_EMAIL,
        key: PRIVATE_KEY,
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    return google.drive({ version: 'v3', auth });
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { filename } = req.query;

    if (!filename || Array.isArray(filename)) {
        return res.status(400).json({ error: 'Invalid filename' });
    }

    console.log(`[Drive] Route hit for filename: ${filename}`);

    const drive = getGoogleDrive();

    // Helper to serve local file
    const serveLocalFile = () => {
        try {
            // In Vercel, process.cwd() is project root
            const localPath = path.join(process.cwd(), 'public', 'data', filename);
            console.log(`[Drive] Checking local path: ${localPath}`);

            if (fs.existsSync(localPath)) {
                console.log(`[Drive] Serving local file: ${filename}`);
                const stat = fs.statSync(localPath);
                res.setHeader('Content-Length', stat.size);
                const readStream = fs.createReadStream(localPath);
                readStream.pipe(res);
                return true;
            }
            console.warn(`[Drive] Local file not found at ${localPath}`);
            return false;
        } catch (err) {
            console.error(`[Drive] Error serving local file:`, err);
            return false;
        }
    };

    if (!drive || !FOLDER_ID) {
        console.log('[Drive] Missing Google Credentials/Folder ID, falling back to local file');
        if (serveLocalFile()) return;
        return res.status(500).json({ error: 'Server misconfiguration: Missing Google Credentials and local file not found' });
    }

    try {
        const query = `name = '${filename}' and '${FOLDER_ID}' in parents and trashed = false`;
        const listRes = await drive.files.list({
            q: query,
            fields: 'files(id, name, mimeType)',
            pageSize: 1,
        });

        const files = listRes.data.files;
        if (!files || files.length === 0) {
            console.warn(`[Drive] File not found in Drive: ${filename}, trying local...`);
            if (serveLocalFile()) return;
            return res.status(404).json({ error: 'File not found' });
        }

        const fileId = files[0].id!;
        const mimeType = files[0].mimeType;

        console.log(`[Drive] Streaming file: ${filename} (${fileId})`);

        const streamRes = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'stream' }
        );

        res.setHeader('Content-Type', mimeType || 'application/octet-stream');
        (streamRes.data as Readable).pipe(res);

    } catch (error: any) {
        console.error('[Drive] Error:', error.message);
        console.log('[Drive] Drive fetch failed, trying local file...');
        if (serveLocalFile()) return;
        res.status(500).json({ error: 'Failed to fetch file from Drive and local' });
    }
}
