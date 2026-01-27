import express from 'express';
// import { google } from 'googleapis';
import { Readable } from 'stream';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Environment variables
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'); // Handle newlines in env var
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

// Initialize Auth
const getGoogleDrive = () => {
    if (!SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY) {
        return null;
    }
    // Lazy load to prevent startup hang
    const { google } = require('googleapis');

    const auth = new google.auth.JWT({
        email: SERVICE_ACCOUNT_EMAIL,
        key: PRIVATE_KEY,
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    return google.drive({ version: 'v3', auth });
};

router.get('/:filename', async (req, res) => {
    const { filename } = req.params;
    console.log(`[Drive] Route hit for filename: ${filename}`);
    // Use the refactored function
    const drive = getGoogleDrive();

    // Helper to serve local file
    const serveLocalFile = async () => {
        try {
            // Assuming server is running in /server, so public is in ../public
            // Adjust path based on where the compiled server runs. 
            // If running via ts-node in server/src, it's ../../public
            // If running via node in server/dist, it's ../../public
            // Try to resolve from project root.
            console.log(`[Drive] __dirname: ${__dirname}`);
            console.log(`[Drive] process.cwd(): ${process.cwd()}`);

            const localPath = path.resolve(__dirname, '../../../public/data', filename);
            const altPath = path.resolve(process.cwd(), '../public/data', filename);

            console.log(`[Drive] Trying local path (relative to source): ${localPath}`);
            console.log(`[Drive] Trying alt path (relative to cwd): ${altPath}`);

            if (fs.existsSync(localPath)) {
                console.log(`[Drive] Serving local file: ${filename} from source path`);
                res.sendFile(localPath);
                return true;
            }

            if (fs.existsSync(altPath)) {
                console.log(`[Drive] Serving local file: ${filename} from alt path`);
                res.sendFile(altPath);
                return true;
            }

            console.warn(`[Drive] Local file not found: ${localPath} OR ${altPath}`);

            // List contents of directories to debug
            try {
                const publicDataDir = path.resolve(process.cwd(), '../public/data');
                console.log(`[Drive] Listing contents of ${publicDataDir}:`);
                if (fs.existsSync(publicDataDir)) {
                    console.log(fs.readdirSync(publicDataDir).join(', '));
                } else {
                    console.log('[Drive] Directory does not exist.');
                }
            } catch (e) {
                console.error('[Drive] Failed to list directory', e);
            }

            return false;
        } catch (err) {
            console.error(`[Drive] Error serving local file:`, err);
            return false;
        }
    };

    if (!drive || !FOLDER_ID) {
        console.log('[Drive] Missing Google Credentials/Folder ID, falling back to local file');
        const served = await serveLocalFile();
        if (!served) {
            return res.status(500).json({ error: 'Server misconfiguration: Missing Google Credentials and local file not found' });
        }
        return;
    }

    try {
        // const drive = google.drive({ version: 'v3', auth }); // Removed, drive already initialized

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
