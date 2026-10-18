import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDb } from './db.js';
import authMiddleware from './middleware/auth.js';
import membersRouter from './routes/members.js';
import choresRouter from './routes/chores.js';
import templatesRouter from './routes/templates.js';
import pointsRouter from './routes/points.js';
import bulletinRouter from './routes/bulletin.js';
import homeworkRouter from './routes/homework.js';
import snacksRouter from './routes/snacks.js';
import statsRouter from './routes/stats.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database
initializeDb();

// CORS enabled for all origins (development)
app.use(cors());

// JSON body parser
app.use(express.json());

// Auth middleware
app.use(authMiddleware);

// Serve uploaded photos
app.use('/photos', express.static(path.resolve(__dirname, '..', 'public', 'photos')));

// Serve static files from dist in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.resolve(__dirname, '..', 'dist')));
}

// API routes
app.use('/api/members', membersRouter);
app.use('/api/chores', choresRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/points', pointsRouter);
app.use('/api/bulletin', bulletinRouter);
app.use('/api/homework', homeworkRouter);
app.use('/api/snacks', snacksRouter);
app.use('/api/stats', statsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback for production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '..', 'dist', 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

// Start server (only when not imported for testing)
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FamBand server running on port ${PORT}`);
  });
}

export default app;
