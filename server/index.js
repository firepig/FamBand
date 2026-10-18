import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import SqliteStoreFactory from 'better-sqlite3-session-store';
import Database from 'better-sqlite3';
import { initializeDb } from './db.js';
import authRouter from './routes/auth.js';
import { requireUser, requireActiveMember } from './middleware/auth.js';
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
const IS_PROD = process.env.NODE_ENV === 'production';

initializeDb();

const SqliteStore = SqliteStoreFactory(session);
const sessionDbPath = path.resolve(__dirname, '..', 'data', 'famband.db');
const sessionDb = new Database(sessionDbPath);

app.set('trust proxy', 1);

app.use(cors({
  origin: (origin, cb) => cb(null, origin || true),
  credentials: true,
}));
app.use(express.json());

const SESSION_SECRET = process.env.SESSION_SECRET
  || (IS_PROD ? null : 'dev-only-insecure-secret-change-me');
if (!SESSION_SECRET) {
  console.error('SESSION_SECRET env var is required in production');
  process.exit(1);
}

app.use(session({
  name: 'fam.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
  },
  store: new SqliteStore({
    client: sessionDb,
    expired: { clear: true, intervalMs: 1000 * 60 * 60 },
  }),
}));

// Serve uploaded photos
app.use('/photos', express.static(path.resolve(__dirname, '..', 'public', 'photos')));

if (IS_PROD) {
  app.use(express.static(path.resolve(__dirname, '..', 'dist')));
}

// Public auth routes
app.use('/api/auth', authRouter);

// Health check (public)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// All /api routes below require an authenticated user + family scope.
// Routes that mutate on behalf of a member additionally require requireActiveMember
// (enforced inside each router where applicable).
app.use('/api/members', requireUser, membersRouter);
app.use('/api/chores', requireUser, choresRouter);
app.use('/api/templates', requireUser, templatesRouter);
app.use('/api/points', requireUser, pointsRouter);
app.use('/api/bulletin', requireUser, bulletinRouter);
app.use('/api/homework', requireUser, homeworkRouter);
app.use('/api/snacks', requireUser, snacksRouter);
app.use('/api/stats', requireUser, statsRouter);

if (IS_PROD) {
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '..', 'dist', 'index.html'));
  });
}

app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FamBand server running on port ${PORT}`);
  });
}

export default app;
