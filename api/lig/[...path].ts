import type { VercelRequest, VercelResponse } from '@vercel/node';
import axios from 'axios';

const API_BASE = process.env.LIG_API_BASE || 'https://api.lig.com.tw';

// Helper to forward requests
const forwardRequest = async (req: VercelRequest, res: VercelResponse, method: 'GET' | 'POST', endpoint: string, data?: any, params?: any) => {
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

        res.status(200).json(response.data);
    } catch (error: any) {
        console.error(`[LiG] Error forwarding to ${endpoint}:`, error.response?.data || error.message);
        res.status(error.response?.status || 500).json({
            error: 'Proxy request failed',
            upstreamStatus: error.response?.status,
            upstreamData: error.response?.data,
        });
    }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const { path } = req.query;

    // Reconstruct the path from the array
    // request to /api/lig/api/v1/lights -> path = ['api', 'v1', 'lights']
    const pathArray = Array.isArray(path) ? path : [path];
    const fullPath = '/' + pathArray.join('/');

    console.log(`[LiG Handler] Method: ${req.method}, Path: ${fullPath}`);

    if (req.method === 'POST' && fullPath === '/api/v1/login') {
        return forwardRequest(req, res, 'POST', '/api/v1/login', req.body);
    }

    if (req.method === 'GET' && fullPath === '/api/v1/lights') {
        // Try multiple endpoints logic
        try {
            const url = `${API_BASE}/api/v1/lights`;
            const headers: any = {};
            if (req.headers.authorization) headers['Authorization'] = req.headers.authorization;

            const response = await axios.get(url, { headers });
            return res.status(200).json(response.data);
        } catch (error) {
            console.warn('[LiG] /api/v1/lights failed, trying /api/v1/lightids');
            try {
                const url2 = `${API_BASE}/api/v1/lightids`;
                const headers: any = {};
                if (req.headers.authorization) headers['Authorization'] = req.headers.authorization;
                const response = await axios.get(url2, { headers });
                return res.status(200).json(response.data);
            } catch (err: any) {
                console.error('[LiG] Both lights endpoints failed');
                return res.status(500).json({ error: 'Failed to fetch lights' });
            }
        }
    }

    // Default forwarder for everything else
    if (req.method === 'GET') {
        return forwardRequest(req, res, 'GET', fullPath, undefined, req.query);
    }

    // Pass body for other POSTs if any (though only login was explicit in original)
    if (req.method === 'POST') {
        return forwardRequest(req, res, 'POST', fullPath, req.body, req.query);
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
