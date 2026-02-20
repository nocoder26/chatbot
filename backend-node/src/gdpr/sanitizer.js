import crypto from 'crypto';

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_REGEX = /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}\b/g;
const DOCTOR_REGEX = /\b(?:Dr\.?|Doctor|Prof\.?|Professor)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g;
const CLINIC_REGEX = /\b(?:Hospital|Clinic|Medical Center|Centro|Clínica|Hôpital|Krankenhaus)\s+(?:de\s+|of\s+)?[A-Z][a-zA-Zéèêëàáâäïîôùüÿçñ\s-]+\b/g;
const PARTNER_REGEX = /\b(?:my\s+(?:husband|wife|partner|spouse|boyfriend|girlfriend|fiancée?|novio|novia|mari|femme|Ehemann|Ehefrau))\s+[A-Z][a-z]+\b/gi;
const ADDRESS_REGEX = /\b\d{1,5}\s+[A-Z][a-z]+(?:\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Lane|Ln|Way|Court|Ct|Circle|Cir|Place|Pl)\.?)\b/g;
const SSN_REGEX = /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g;

const REDACTED = '[REDACTED]';

/**
 * Detect and strip PII patterns from text.
 * Preserves medical terminology.
 */
export function sanitizeInput(text) {
  if (!text || typeof text !== 'string') return text || '';

  let result = text;
  result = result.replace(EMAIL_REGEX, REDACTED);
  result = result.replace(SSN_REGEX, REDACTED);
  result = result.replace(DOCTOR_REGEX, REDACTED);
  result = result.replace(CLINIC_REGEX, REDACTED);
  result = result.replace(PARTNER_REGEX, REDACTED);
  result = result.replace(ADDRESS_REGEX, REDACTED);
  result = result.replace(PHONE_REGEX, (match) => {
    if (match.replace(/\D/g, '').length >= 7) return REDACTED;
    return match;
  });

  return result.replace(/(\[REDACTED\]\s*){2,}/g, REDACTED).trim();
}

/**
 * Check if text contains potential PII.
 * Returns an array of detected PII types.
 */
export function detectPII(text) {
  if (!text) return [];
  const detected = [];
  if (EMAIL_REGEX.test(text)) detected.push('email');
  EMAIL_REGEX.lastIndex = 0;
  if (DOCTOR_REGEX.test(text)) detected.push('doctor_name');
  DOCTOR_REGEX.lastIndex = 0;
  if (CLINIC_REGEX.test(text)) detected.push('clinic_name');
  CLINIC_REGEX.lastIndex = 0;
  if (PARTNER_REGEX.test(text)) detected.push('partner_name');
  PARTNER_REGEX.lastIndex = 0;
  if (SSN_REGEX.test(text)) detected.push('ssn');
  SSN_REGEX.lastIndex = 0;
  return detected;
}

/**
 * Hash a user ID with a salt for pseudonymisation in external systems (e.g., Pinecone).
 */
export function hashUserId(userId, salt) {
  const effectiveSalt = salt || process.env.ENCRYPTION_MASTER_KEY?.slice(0, 16) || 'default-salt';
  return crypto.createHash('sha256').update(`${effectiveSalt}:${userId}`).digest('hex').slice(0, 32);
}
