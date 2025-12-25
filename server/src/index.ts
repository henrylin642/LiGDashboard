import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import airtableRoutes from './routes/airtable';
import ligRoutes from './routes/lig';
import driveRoutes from './routes/drive';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/projects', airtableRoutes);
app.use('/api/lig', ligRoutes);
app.use('/api/data', driveRoutes);

app.get('/health', (req, res) => {
    res.send('Server is running');
});

const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

server.on('error', (err) => {
    console.error('Server error:', err);
});

// Debug: Keep the process alive. This prevents the process from exiting 
// if the event loop drains for some reason (e.g. socket close).
setInterval(() => {
    // Heartbeat
}, 30000);

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

