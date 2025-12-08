import express from 'express';
import { google } from 'googleapis';
import { Readable } from 'stream';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Environment variables
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'); // Handle newlines in env var
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

// Initialize Auth
const getAuthClient = () => {
    if (!SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY) {
        return null;
    }
    return new google.auth.JWT({
        email: SERVICE_ACCOUNT_EMAIL,
        key: PRIVATE_KEY,
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
};

router.get('/:filename', async (req, res) => {
    const { filename } = req.params;
    const auth = getAuthClient();

    // Helper to serve local file
    const serveLocalFile = async () => {
        try {
            // Assuming server is running in /server, so public is in ../public
            // Adjust path based on where the compiled server runs. 
            // If running via ts-node in server/src, it's ../../public
            // If running via node in server/dist, it's ../../public
            // Let's try to resolve from project root.
            const localPath = path.resolve(__dirname, '../../../public/data', filename);
            console.log(`[Drive] Trying local file: ${localPath}`);

            if (fs.existsSync(localPath)) {
                console.log(`[Drive] Serving local file: ${filename}`);
                res.sendFile(localPath);
                return true;
            }
            console.warn(`[Drive] Local file not found: ${localPath}`);
            return false;
        } catch (err) {
            console.error(`[Drive] Error serving local file:`, err);
            return false;
        }
    };

    if (!auth || !FOLDER_ID) {
        console.log('[Drive] Missing Google Credentials/Folder ID, falling back to local file');
        const served = await serveLocalFile();
        if (!served) {
            return res.status(500).json({ error: 'Server misconfiguration: Missing Google Credentials and local file not found' });
        }
        return;
    }

    try {
        const drive = google.drive({ version: 'v3', auth });

        // 1. Search for the file in the specific folder
        const query = `name = '${filename}' and '${FOLDER_ID}' in parents and trashed = false`;
        const listRes = await drive.files.list({
            q: query,
            fields: 'files(id, name, mimeType)',
            pageSize: 1,
        });

        const files = listRes.data.files;
        if (!files || files.length === 0) {
            console.warn(`[Drive] File not found in Drive: ${filename}, trying local...`);
            const served = await serveLocalFile();
            if (!served) {
                return res.status(404).json({ error: 'File not found' });
            }
            return;
        }

        const fileId = files[0].id!;
        const mimeType = files[0].mimeType;

        console.log(`[Drive] Streaming file: ${filename} (${fileId})`);

        // 2. Stream the file content
        const streamRes = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'stream' }
        );

        // Set headers
        res.setHeader('Content-Type', mimeType || 'application/octet-stream');

        // Pipe the stream to response
        (streamRes.data as Readable).pipe(res);

    } catch (error: any) {
        console.error('[Drive] Error:', error.message);
        console.log('[Drive] Drive fetch failed, trying local file...');
        const served = await serveLocalFile();
        if (!served) {
            res.status(500).json({ error: 'Failed to fetch file from Drive and local' });
        }
    }
});

export default router;
