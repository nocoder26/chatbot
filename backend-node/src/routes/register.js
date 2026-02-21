import { Router } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import { generatePositiveUsernames } from '../lib/usernames.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is not set! Registration will fail.');
}

const AVATAR_URLS = [
  'https://api.dicebear.com/9.x/avataaars/svg?seed=1',
  'https://api.dicebear.com/9.x/avataaars/svg?seed=2',
  'https://api.dicebear.com/9.x/avataaars/svg?seed=3',
  'https://api.dicebear.com/9.x/avataaars/svg?seed=4',
  'https://api.dicebear.com/9.x/avataaars/svg?seed=5',
  'https://api.dicebear.com/9.x/avataaars/svg?seed=6',
];

function hashUsername(username) {
  return crypto.createHash('sha256').update(username.trim().toLowerCase()).digest('hex');
}

/**
 * GET /api/register-anonymous
 * Returns 5 random positive usernames (excluding already-taken) + 6 avatar URLs.
 * Selected name is linked to the user on POST; returned list refills with different available names.
 */
router.get('/', async (req, res) => {
  try {
    let existing = [];
    try {
      existing = await prisma.user.findMany({ select: { username: true } });
    } catch (dbErr) {
      console.error('Register-anonymous DB error:', dbErr.message);
      // Continue with empty list - usernames will still be generated
    }
    const taken = new Set((existing || []).map((u) => (u.username || '').trim().toLowerCase()).filter(Boolean));

    let usernames = [];
    try {
      usernames = generatePositiveUsernames(5, taken) || [];
    } catch (genErr) {
      console.error('Register-anonymous username generation error:', genErr.message);
      // Fallback usernames if generator fails
      usernames = ['HappyUser1', 'BrightStar2', 'JoyfulHeart3', 'WarmSmile4', 'KindSoul5'];
    }

    return res.json({ usernames, avatarUrls: AVATAR_URLS });
  } catch (err) {
    console.error('Register-anonymous options error:', err.message, err.stack);
    return res.status(500).json({ error: 'Failed to generate options' });
  }
});

/**
 * POST /api/register-anonymous
 * Accepts username, avatarUrl, and optional passphrase.
 * Hashes username for anonymous lookup, hashes passphrase with bcrypt.
 * Returns JWT (24h expiry).
 */
router.post('/', async (req, res) => {
  try {
    if (!JWT_SECRET) {
      return res.status(500).json({ error: 'Server misconfiguration: authentication is unavailable' });
    }

    const { username, avatarUrl, passphrase, deviceInfo } = req.body;
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'username is required' });
    }

    const uHash = hashUsername(username);

    // Check if username already taken
    const existing = await prisma.user.findFirst({ where: { usernameHash: uHash } });
    if (existing) {
      return res.status(409).json({ error: 'Username already taken. Please choose another or log in.' });
    }

    let passphraseHash = null;
    if (passphrase && typeof passphrase === 'string' && passphrase.length >= 8) {
      passphraseHash = await bcrypt.hash(passphrase, 10);
    }

    const user = await prisma.user.create({
      data: {
        username: username.trim(),
        usernameHash: uHash,
        passphraseHash,
        avatarUrl:
          avatarUrl && typeof avatarUrl === 'string'
            ? (AVATAR_URLS.includes(avatarUrl) ? avatarUrl.trim() : AVATAR_URLS[0])
            : AVATAR_URLS[0],
      },
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

    prisma.userActivity.create({
      data: {
        userId: user.id,
        type: 'login',
        metadata: { method: passphrase ? 'passphrase' : 'anonymous' },
      },
    }).catch((e) => console.error('Activity log error:', e));

    if (deviceInfo && typeof deviceInfo === 'object') {
      prisma.userActivity.create({
        data: {
          userId: user.id,
          type: 'device_info',
          metadata: {
            browser: deviceInfo.browser || 'Unknown',
            os: deviceInfo.os || 'Unknown',
            screen: deviceInfo.screen || '',
            language: deviceInfo.language || '',
            timezone: deviceInfo.timezone || '',
          },
        },
      }).catch((e) => console.error('Device info log error:', e));
    }

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err) {
    console.error('Register-anonymous error:', err.message, err.stack);
    const detail = !JWT_SECRET
      ? 'Server misconfiguration: JWT_SECRET is not set'
      : err.message || 'Registration failed';
    return res.status(500).json({ error: detail });
  }
});

export default router;
