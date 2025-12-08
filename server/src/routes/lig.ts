import express from 'express';
import axios from 'axios';

const router = express.Router();
const API_BASE = process.env.LIG_API_BASE || 'https://api.lig.com.tw';

// Helper to forward requests
const forwardRequest = async (req: express.Request, res: express.Response, method: 'GET' | 'POST', endpoint: string, data?: any, params?: any) => {
    try {
        const url = `${API_BASE}${endpoint}`;
        const headers: any = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
        };
        if (method !== 'GET') {
            headers['Content-Type'] = 'application/json';
        }

        // Forward Authorization header if present
        if (req.headers.authorization) {
            headers['Authorization'] = req.headers.authorization;
        }

        console.log(`[LiG] Proxying ${method} ${url}`);
        console.log(`[LiG] Upstream URL: ${url}`);
        console.log(`[LiG] Request Headers:`, JSON.stringify(headers, null, 2));
        if (params) {
            console.log(`[LiG] Query Params:`, JSON.stringify(params, null, 2));
        }

        const response = await axios({
            method,
            url,
            headers,
            params,
            data: method === 'GET' ? undefined : data,
        });

        console.log(`[LiG] Success: ${response.status}`);
        res.json(response.data);
    } catch (error: any) {
        console.error(`[LiG] Error forwarding to ${endpoint}:`, error.response?.data || error.message);
        console.error(`[LiG] Status:`, error.response?.status);
        if (error.response?.headers) {
            console.error(`[LiG] Response Headers:`, JSON.stringify(error.response.headers, null, 2));
        }
        res.status(error.response?.status || 500).json({
            error: 'Proxy request failed',
            upstreamStatus: error.response?.status,
            upstreamData: error.response?.data,
            upstreamHeaders: error.response?.headers
        });
    }
};

router.post('/api/v1/login', async (req, res) => {
    await forwardRequest(req, res, 'POST', '/api/v1/login', req.body);
});

router.get('/api/v1/lights', async (req, res) => {
    // Try both endpoints as in original code
    try {
        const url = `${API_BASE}/api/v1/lights`;
        const headers: any = {};
        if (req.headers.authorization) headers['Authorization'] = req.headers.authorization;

        const response = await axios.get(url, { headers });
        res.json(response.data);
    } catch (error) {
        // Fallback or try other endpoint logic if strictly needed, 
        // but for now let's stick to the main one or implement the loop logic if complex
        // The original code tried /api/v1/lights then /api/v1/lightids
        // Let's implement a simple fallback
        try {
            const url2 = `${API_BASE}/api/v1/lightids`;
            const headers: any = {};
            if (req.headers.authorization) headers['Authorization'] = req.headers.authorization;
            const response = await axios.get(url2, { headers });
            res.json(response.data);
        } catch (err: any) {
            res.status(500).json({ error: 'Failed to fetch lights' });
        }
    }
});

router.get('/api/v1/lights/:id', async (req, res) => {
    await forwardRequest(req, res, 'GET', `/api/v1/lights/${req.params.id}`);
});

router.get('/api/v1/lightids/:id', async (req, res) => {
    await forwardRequest(req, res, 'GET', `/api/v1/lightids/${req.params.id}`);
});

router.get('/api/scenes', async (req, res) => {
    await forwardRequest(req, res, 'GET', '/api/scenes');
});

router.get('/api/v1/assets', async (req, res) => {
    await forwardRequest(req, res, 'GET', '/api/v1/assets');
});

router.get('/api/v1/coordinate_systems', async (req, res) => {
    await forwardRequest(req, res, 'GET', '/api/v1/coordinate_systems');
});

router.get('/api/v1/ar_objects', async (req, res) => {
    await forwardRequest(req, res, 'GET', req.path, undefined, req.query);
});

router.get('/api/v1/ar_objects/:id', async (req, res) => {
    await forwardRequest(req, res, 'GET', `/api/v1/ar_objects/${req.params.id}`);
});

router.get('/api/v1/ar_objects_list/:id', async (req, res) => {
    await forwardRequest(req, res, 'GET', `/api/v1/ar_objects_list/${req.params.id}`);
});

export default router;
