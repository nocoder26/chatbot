import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const DEK_LENGTH = 32;

function getMasterKey() {
  const hex = process.env.ENCRYPTION_MASTER_KEY;
  if (!hex || hex.length < 64) return null;
  return Buffer.from(hex, 'hex');
}

export function generateDEK() {
  return crypto.randomBytes(DEK_LENGTH);
}

function encryptWithKey(plaintext, key) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext: encrypted, iv, authTag };
}

function decryptWithKey(ciphertext, key, iv, authTag) {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Envelope-encrypt a plaintext string.
 * Generates a random DEK, encrypts the data with the DEK,
 * then encrypts the DEK with the master key.
 * Returns a JSON-serializable object for storage.
 */
export function encryptField(plaintext) {
  const masterKey = getMasterKey();
  if (!masterKey) return null;

  const dek = generateDEK();
  const { ciphertext, iv, authTag } = encryptWithKey(plaintext, dek);
  const { ciphertext: encDek, iv: dekIv, authTag: dekTag } = encryptWithKey(dek.toString('hex'), masterKey);

  return {
    v: 1,
    ct: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    at: authTag.toString('base64'),
    ek: encDek.toString('base64'),
    ei: dekIv.toString('base64'),
    ea: dekTag.toString('base64'),
  };
}

/**
 * Decrypt a field that was encrypted with encryptField().
 */
export function decryptField(envelope) {
  if (!envelope || envelope.v !== 1) return null;
  const masterKey = getMasterKey();
  if (!masterKey) return null;

  const dekHex = decryptWithKey(
    Buffer.from(envelope.ek, 'base64'),
    masterKey,
    Buffer.from(envelope.ei, 'base64'),
    Buffer.from(envelope.ea, 'base64'),
  );
  const dek = Buffer.from(dekHex, 'hex');

  return decryptWithKey(
    Buffer.from(envelope.ct, 'base64'),
    dek,
    Buffer.from(envelope.iv, 'base64'),
    Buffer.from(envelope.at, 'base64'),
  );
}

/**
 * Re-encrypt all DEKs when rotating the master key.
 * Takes an array of envelope objects and returns new envelopes
 * with DEKs re-encrypted under the new master key.
 */
export function rotateEnvelopes(envelopes, oldMasterKeyHex, newMasterKeyHex) {
  const oldKey = Buffer.from(oldMasterKeyHex, 'hex');
  const newKey = Buffer.from(newMasterKeyHex, 'hex');

  return envelopes.map((env) => {
    const dekHex = decryptWithKey(
      Buffer.from(env.ek, 'base64'),
      oldKey,
      Buffer.from(env.ei, 'base64'),
      Buffer.from(env.ea, 'base64'),
    );
    const { ciphertext: encDek, iv: dekIv, authTag: dekTag } = encryptWithKey(dekHex, newKey);
    return {
      ...env,
      ek: encDek.toString('base64'),
      ei: dekIv.toString('base64'),
      ea: dekTag.toString('base64'),
    };
  });
}

export function isEncryptionEnabled() {
  return !!getMasterKey();
}
