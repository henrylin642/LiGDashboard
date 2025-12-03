import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import airtableRoutes from './routes/airtable';
import ligRoutes from './routes/lig';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/projects', airtableRoutes);
app.use('/api/lig', ligRoutes);

app.get('/health', (req, res) => {
    res.send('Server is running');
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
