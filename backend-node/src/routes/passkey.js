import { Router } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import prisma from '../lib/prisma.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;

const rpName = process.env.WEBAUTHN_RP_NAME || 'Izana AI';
const defaultRpID = process.env.WEBAUTHN_RP_ID || 'localhost';
const defaultOrigin = process.env.WEBAUTHN_ORIGIN || 'http://localhost:3000';

// Dynamically resolve rpID and origin from the request for Vercel preview deployments
function getWebAuthnConfig(req) {
  const reqOrigin = req.headers.origin;
  if (reqOrigin) {
    try {
      const url = new URL(reqOrigin);
      if (url.hostname.endsWith('.vercel.app') || url.hostname.endsWith('.vercel.sh')) {
        return { rpID: url.hostname, origin: reqOrigin };
      }
    } catch {}
  }
  return { rpID: defaultRpID, origin: defaultOrigin };
}

// In-memory challenge store (short-lived, keyed by usernameHash)
const challengeStore = new Map();

function hashUsername(username) {
  return crypto.createHash('sha256').update(username.trim().toLowerCase()).digest('hex');
}

/**
 * POST /api/auth/passkey/register-options
 * Generate WebAuthn registration options for a new or existing user
 */
router.post('/register-options', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'username is required' });
    }

    const uHash = hashUsername(username);

    // Check for existing credentials
    const existingUser = await prisma.user.findFirst({
      where: { usernameHash: uHash },
      include: { webAuthnCredentials: true },
    });

    const excludeCredentials = (existingUser?.webAuthnCredentials || []).map((c) => ({
      id: Buffer.from(c.credentialId, 'base64url'),
      type: 'public-key',
      transports: c.transports,
    }));

    const { rpID } = getWebAuthnConfig(req);

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: Buffer.from(uHash, 'hex'),
      userName: username.trim(),
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    challengeStore.set(uHash, { challenge: options.challenge, expires: Date.now() + 5 * 60 * 1000 });

    return res.json(options);
  } catch (err) {
    console.error('Passkey register-options error:', err);
    return res.status(500).json({ error: 'Failed to generate registration options' });
  }
});

/**
 * POST /api/auth/passkey/register-verify
 * Verify attestation, store credential, return JWT
 */
router.post('/register-verify', async (req, res) => {
  try {
    const { username, attestation, avatarUrl } = req.body;
    if (!username || !attestation) {
      return res.status(400).json({ error: 'username and attestation are required' });
    }

    const uHash = hashUsername(username);
    const stored = challengeStore.get(uHash);
    if (!stored || stored.expires < Date.now()) {
      challengeStore.delete(uHash);
      return res.status(400).json({ error: 'Challenge expired. Please try again.' });
    }

    const { rpID, origin: expectedOrigin } = getWebAuthnConfig(req);

    const verification = await verifyRegistrationResponse({
      response: attestation,
      expectedChallenge: stored.challenge,
      expectedOrigin,
      expectedRPID: rpID,
    });

    challengeStore.delete(uHash);

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Passkey verification failed' });
    }

    const { credential } = verification.registrationInfo;

    // Find or create user
    let user = await prisma.user.findFirst({ where: { usernameHash: uHash } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          username: username.trim(),
          usernameHash: uHash,
          avatarUrl: avatarUrl || null,
        },
      });
    }

    // Store credential
    await prisma.webAuthnCredential.create({
      data: {
        userId: user.id,
        credentialId: Buffer.from(credential.id).toString('base64url'),
        publicKey: Buffer.from(credential.publicKey),
        counter: BigInt(credential.counter),
        transports: attestation.response?.transports || [],
      },
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

    return res.json({
      token,
      user: { id: user.id, username: user.username, avatarUrl: user.avatarUrl },
    });
  } catch (err) {
    console.error('Passkey register-verify error:', err);
    return res.status(500).json({ error: 'Passkey registration failed' });
  }
});

/**
 * POST /api/auth/passkey/login-options
 * Generate authentication options for an existing user
 */
router.post('/login-options', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'username is required' });
    }

    const uHash = hashUsername(username);
    const user = await prisma.user.findFirst({
      where: { usernameHash: uHash },
      include: { webAuthnCredentials: true },
    });

    if (!user || user.webAuthnCredentials.length === 0) {
      return res.status(404).json({ error: 'No passkey found for this username' });
    }

    const allowCredentials = user.webAuthnCredentials.map((c) => ({
      id: Buffer.from(c.credentialId, 'base64url'),
      type: 'public-key',
      transports: c.transports,
    }));

    const { rpID } = getWebAuthnConfig(req);

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: 'preferred',
    });

    challengeStore.set(uHash, { challenge: options.challenge, expires: Date.now() + 5 * 60 * 1000 });

    return res.json(options);
  } catch (err) {
    console.error('Passkey login-options error:', err);
    return res.status(500).json({ error: 'Failed to generate login options' });
  }
});

/**
 * POST /api/auth/passkey/login-verify
 * Verify assertion, return JWT
 */
router.post('/login-verify', async (req, res) => {
  try {
    const { username, assertion } = req.body;
    if (!username || !assertion) {
      return res.status(400).json({ error: 'username and assertion are required' });
    }

    const uHash = hashUsername(username);
    const stored = challengeStore.get(uHash);
    if (!stored || stored.expires < Date.now()) {
      challengeStore.delete(uHash);
      return res.status(400).json({ error: 'Challenge expired. Please try again.' });
    }

    const user = await prisma.user.findFirst({
      where: { usernameHash: uHash },
      include: { webAuthnCredentials: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const credentialIdFromAssertion = assertion.id;
    const matchingCred = user.webAuthnCredentials.find(
      (c) => c.credentialId === credentialIdFromAssertion
    );

    if (!matchingCred) {
      return res.status(400).json({ error: 'Credential not recognized' });
    }

    const { rpID, origin: expectedOrigin } = getWebAuthnConfig(req);

    const verification = await verifyAuthenticationResponse({
      response: assertion,
      expectedChallenge: stored.challenge,
      expectedOrigin,
      expectedRPID: rpID,
      credential: {
        id: Buffer.from(matchingCred.credentialId, 'base64url'),
        publicKey: matchingCred.publicKey,
        counter: Number(matchingCred.counter),
        transports: matchingCred.transports,
      },
    });

    challengeStore.delete(uHash);

    if (!verification.verified) {
      return res.status(400).json({ error: 'Passkey authentication failed' });
    }

    // Update counter
    await prisma.webAuthnCredential.update({
      where: { id: matchingCred.id },
      data: { counter: BigInt(verification.authenticationInfo.newCounter) },
    });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

    return res.json({
      token,
      user: { id: user.id, username: user.username, avatarUrl: user.avatarUrl },
    });
  } catch (err) {
    console.error('Passkey login-verify error:', err);
    return res.status(500).json({ error: 'Passkey login failed' });
  }
});

/**
 * POST /api/auth/passkey/check
 * Check what auth methods a username has available
 */
router.post('/check', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username || typeof username !== 'string') {
      return res.status(400).json({ error: 'username is required' });
    }

    const uHash = hashUsername(username);
    const user = await prisma.user.findFirst({
      where: { usernameHash: uHash },
      include: { webAuthnCredentials: { select: { id: true } } },
    });

    if (!user) {
      return res.json({ exists: false, hasPasskey: false, hasPassphrase: false });
    }

    return res.json({
      exists: true,
      hasPasskey: user.webAuthnCredentials.length > 0,
      hasPassphrase: !!user.passphraseHash,
    });
  } catch (err) {
    console.error('Passkey check error:', err);
    return res.status(500).json({ error: 'Check failed' });
  }
});

export default router;
