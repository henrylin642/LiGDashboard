import express from 'express';
import { google } from 'googleapis';
import { Readable } from 'stream';

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
    return new google.auth.JWT(
        SERVICE_ACCOUNT_EMAIL,
        undefined,
        PRIVATE_KEY,
        ['https://www.googleapis.com/auth/drive.readonly']
    );
};

router.get('/:filename', async (req, res) => {
    const { filename } = req.params;
    const auth = getAuthClient();

    if (!auth) {
        console.error('[Drive] Missing Google Credentials');
        return res.status(500).json({ error: 'Server misconfiguration: Missing Google Credentials' });
    }

    if (!FOLDER_ID) {
        console.error('[Drive] Missing Folder ID');
        return res.status(500).json({ error: 'Server misconfiguration: Missing Drive Folder ID' });
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
            console.warn(`[Drive] File not found: ${filename}`);
            return res.status(404).json({ error: 'File not found' });
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
        res.status(500).json({ error: 'Failed to fetch file from Drive' });
    }
});

export default router;
