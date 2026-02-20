import { Router } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '24h';

function hashUsername(username) {
  return crypto.createHash('sha256').update(username.trim().toLowerCase()).digest('hex');
}

/**
 * POST /api/auth/register
 * Create anonymous user with username and optional avatarUrl (legacy)
 */
router.post('/register', async (req, res) => {
  try {
    const { username, avatarUrl } = req.body;
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'username is required' });
    }

    const uHash = hashUsername(username);

    const user = await prisma.user.create({
      data: {
        username: username.trim(),
        usernameHash: uHash,
        avatarUrl: avatarUrl && typeof avatarUrl === 'string' ? avatarUrl.trim() : undefined,
      },
    });

    const accessToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_ACCESS_EXPIRY });

    return res.json({
      token: accessToken,
      user: {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (err) {
    console.error('Auth register error:', err);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/login
 * Login with username + passphrase
 */
router.post('/login', async (req, res) => {
  try {
    const { username, passphrase, deviceInfo } = req.body;
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'username is required' });
    }
    if (!passphrase || typeof passphrase !== 'string') {
      return res.status(400).json({ error: 'passphrase is required' });
    }

    const uHash = hashUsername(username);
    const user = await prisma.user.findFirst({ where: { usernameHash: uHash } });

    if (!user || !user.passphraseHash) {
      return res.status(401).json({ error: 'Invalid username or passphrase' });
    }

    const valid = await bcrypt.compare(passphrase, user.passphraseHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or passphrase' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_ACCESS_EXPIRY });

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
    console.error('Auth login error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

export default router;
