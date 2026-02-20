import crypto from 'crypto';
import prisma from '../lib/prisma.js';

let lastHashCache = null;

/**
 * Get the hash of the most recent audit log entry for chain integrity.
 */
async function getLastHash() {
  if (lastHashCache) return lastHashCache;
  const last = await prisma.auditLog.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { integrityHash: true },
  });
  return last?.integrityHash || '0'.repeat(64);
}

/**
 * Compute a chain hash: SHA-256(previousHash + action + tier + actorId + timestamp + details)
 */
function computeChainHash(previousHash, action, tier, actorId, timestamp, details) {
  const payload = `${previousHash}|${action}|${tier}|${actorId || ''}|${timestamp}|${JSON.stringify(details)}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Log an audit event with tamper-proof hash chain.
 *
 * @param {Object} params
 * @param {string} params.action - e.g. 'consent_granted', 'data_accessed', 'deletion_requested'
 * @param {string} params.tier - 'tier1', 'tier2', 'tier3'
 * @param {string} params.actorType - 'user', 'admin', 'system'
 * @param {string} [params.actorId] - User/admin ID
 * @param {string} [params.targetId] - Target record ID
 * @param {Object} [params.details] - Additional details
 */
export async function logAuditEvent({ action, tier, actorType, actorId, targetId, details = {} }) {
  try {
    const previousHash = await getLastHash();
    const timestamp = new Date().toISOString();
    const integrityHash = computeChainHash(previousHash, action, tier, actorId, timestamp, details);

    const entry = await prisma.auditLog.create({
      data: {
        action,
        tier,
        actorType,
        actorId: actorId || null,
        targetId: targetId || null,
        details,
        integrityHash,
      },
    });

    lastHashCache = integrityHash;
    return entry;
  } catch (err) {
    console.error('[Audit] Failed to log event:', err.message);
  }
}

/**
 * Verify the integrity of the audit log chain.
 * Returns { valid, brokenAt, totalChecked }.
 */
export async function verifyAuditChain() {
  const entries = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, action: true, tier: true, actorId: true, createdAt: true, details: true, integrityHash: true },
  });

  let previousHash = '0'.repeat(64);

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const expected = computeChainHash(
      previousHash,
      entry.action,
      entry.tier,
      entry.actorId,
      entry.createdAt.toISOString(),
      entry.details,
    );

    if (expected !== entry.integrityHash) {
      return { valid: false, brokenAt: i, entryId: entry.id, totalChecked: entries.length };
    }
    previousHash = entry.integrityHash;
  }

  return { valid: true, totalChecked: entries.length };
}
