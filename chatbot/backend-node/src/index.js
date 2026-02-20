import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import registerRoutes from './routes/register.js';
import passkeyRoutes from './routes/passkey.js';
import chatRoutes from './routes/chat.js';
import bloodworkRoutes from './routes/bloodwork.js';
import profileRoutes from './routes/profile.js';
import adminRoutes from './routes/admin.js';
import pushRoutes from './routes/push.js';
import consentRoutes from './routes/consent.js';
import userRightsRoutes from './routes/userRights.js';
import { startPrivacyDeletionCron } from './cron/privacyDeletion.js';
import { startTier2ExtractionCron } from './cron/tier2Extraction.js';
import { startTier3AggregationCron } from './cron/tier3Aggregation.js';
import { startModelImprovementCron } from './cron/modelImprovement.js';
import { generatePositiveUsernames } from './lib/usernames.js';
import prisma from './lib/prisma.js';

const AVATAR_URLS = [
  'https://api.dicebear.com/9.x/avataaars/svg?seed=1',
  'https://api.dicebear.com/9.x/avataaars/svg?seed=2',
  'https://api.dicebear.com/9.x/avataaars/svg?seed=3',
  'https://api.dicebear.com/9.x/avataaars/svg?seed=4',
  'https://api.dicebear.com/9.x/avataaars/svg?seed=5',
  'https://api.dicebear.com/9.x/avataaars/svg?seed=6',
];

const app = express();
const PORT = process.env.PORT || 8080;

// Startup checks for critical environment variables
['JWT_SECRET', 'DATABASE_URL'].forEach((key) => {
  if (!process.env[key]) {
    console.error(`[STARTUP WARNING] ${key} is not set — features depending on it will fail.`);
  }
});
if (!process.env.GROQ_API_KEY && !process.env.COHERE_API_KEY) {
  console.error('[STARTUP WARNING] Neither GROQ_API_KEY nor COHERE_API_KEY is set — chat and topic filter will fail.');
}

// CORS: allow localhost + Vercel URL + any *.vercel.app
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.VERCEL_APP_URL,
].filter(Boolean);

const EXTRA_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : [];

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (EXTRA_ORIGINS.includes(origin)) return true;
  if (origin.endsWith('.vercel.app')) return true;
  return false;
}

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked origin: ${origin}`);
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key'],
};

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false, validate: { xForwardedForHeader: false }, message: { error: 'Too many requests, please try again later.' } });
const gdprLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, validate: { xForwardedForHeader: false }, message: { error: 'Too many GDPR requests, please try again later.' } });
app.use('/api/chat', apiLimiter);
app.use('/api/analyze-bloodwork', apiLimiter);
app.use('/api/gdpr', gdprLimiter);

app.get('/', (req, res) => {
  res.json({ status: 'Active', message: 'Izana AI Node Backend', version: '2.0.0' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

app.get('/api/register-options', async (req, res) => {
  try {
    const existing = await prisma.user.findMany({ select: { username: true } });
    const taken = new Set(existing.map((u) => (u.username || '').trim().toLowerCase()).filter(Boolean));
    const usernames = generatePositiveUsernames(5, taken);
    res.json({ usernames, avatarUrls: AVATAR_URLS });
  } catch (err) {
    console.error('Register-options error:', err);
    res.status(500).json({ error: 'Failed to generate options' });
  }
});

// Routes (passkey mounted first — more specific path before general /api/auth)
app.use('/api/auth/passkey', passkeyRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/register-anonymous', registerRoutes);
app.use('/api/consent', consentRoutes);
app.use('/api/gdpr', userRightsRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/analyze-bloodwork', bloodworkRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/user-profile', profileRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/push', pushRoutes);

/**
 * POST /feedback  &  POST /api/feedback
 */
app.post(['/feedback', '/api/feedback'], async (req, res) => {
  const { question, answer, rating, reason, type, sessionDuration, messageCount } = req.body || {};
  console.log(`[Feedback] type=${type || 'rating'} rating=${rating} reason="${reason || ''}" q="${(question || '').slice(0, 80)}"`);

  // Extract userId from JWT if present (best-effort)
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const jwt = await import('jsonwebtoken');
      const decoded = jwt.default.verify(authHeader.slice(7), process.env.JWT_SECRET);
      const userId = decoded.userId || decoded.id;
      if (userId) {
        const { default: prismaClient } = await import('./lib/prisma.js');
        prismaClient.userActivity.create({
          data: {
            userId,
            type: type === 'session_end' ? 'session_end' : 'feedback',
            metadata: { question: (question || '').slice(0, 200), rating, reason, sessionDuration, messageCount },
          },
        }).catch((e) => console.error('Feedback activity log error:', e));
      }
    }
  } catch (_) { /* best-effort */ }

  res.json({ success: true });
});

// Global async error handler — catches unhandled throws from any route/middleware
app.use((err, req, res, next) => {
  console.error('[Unhandled]', err.stack || err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error' });
});

// Catch-all 404
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

startTier2ExtractionCron();
startPrivacyDeletionCron();
startTier3AggregationCron();
startModelImprovementCron();

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on 0.0.0.0:${PORT}`);
});

function shutdown(signal) {
  console.log(`[${signal}] Shutting down gracefully...`);
  server.close(async () => {
    try { await prisma.$disconnect(); } catch (_) {}
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
