import { Router } from 'express';
import prisma from '../lib/prisma.js';
import { verifyJWT } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/user-profile/:username
 * JWT required. Returns all chats and bloodwork reports from the last 24 hours for the authenticated user only.
 * Caller must own the requested username.
 */
router.get('/:username', verifyJWT, async (req, res) => {
  try {
    const { username } = req.params;
    const userId = req.userId;
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const user = await prisma.user.findFirst({
      where: { username: username.trim() },
      include: {
        chats: {
          where: { createdAt: { gte: cutoff } },
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
              take: 2,
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        bloodWorkReports: {
          where: { createdAt: { gte: cutoff } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (user.id !== userId) {
      return res.status(403).json({ error: 'You can only view your own profile' });
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
      },
      chats: user.chats.map((c) => ({
        id: c.id,
        title: c.title,
        createdAt: c.createdAt,
        messageCount: c.messages?.length ?? 0,
      })),
      bloodwork: user.bloodWorkReports.map((r) => ({
        id: r.id,
        results: r.results,
        summary: r.summary,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    console.error('User profile error:', err);
    res.status(500).json({ error: err?.message || 'Failed to fetch profile' });
  }
});

/**
 * DELETE /api/user-profile/:username/chats/:chatId
 * JWT required. Delete a chat (must belong to authenticated user).
 */
router.delete('/:username/chats/:chatId', verifyJWT, async (req, res) => {
  try {
    const { username, chatId } = req.params;
    const userId = req.userId;
    const user = await prisma.user.findFirst({
      where: { username: username.trim() },
    });
    if (!user || user.id !== userId) {
      return res.status(404).json({ error: 'User not found' });
    }
    await prisma.chat.deleteMany({
      where: { id: chatId, userId: user.id },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete chat error:', err);
    res.status(500).json({ error: err?.message || 'Failed to delete chat' });
  }
});

export default router;
