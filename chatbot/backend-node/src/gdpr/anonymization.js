import crypto from 'crypto';

const DP_EPSILON = parseFloat(process.env.DP_EPSILON || '1.0');

/**
 * Clinical reference ranges for common bloodwork markers.
 * Values are generalized to clinical categories instead of exact numbers.
 */
const MARKER_RANGES = {
  AMH:         { low: 1.0, high: 3.5, unit: 'ng/mL' },
  FSH:         { low: 3.5, high: 12.5, unit: 'mIU/mL' },
  LH:          { low: 2.4, high: 12.6, unit: 'mIU/mL' },
  ESTRADIOL:   { low: 30, high: 400, unit: 'pg/mL' },
  PROGESTERONE:{ low: 1.0, high: 25.0, unit: 'ng/mL' },
  TSH:         { low: 0.4, high: 4.0, unit: 'mIU/L' },
  PROLACTIN:   { low: 2.0, high: 29.0, unit: 'ng/mL' },
  TESTOSTERONE:{ low: 15, high: 70, unit: 'ng/dL' },
  GLUCOSE:     { low: 70, high: 100, unit: 'mg/dL' },
  HBA1C:       { low: 4.0, high: 5.6, unit: '%' },
  CHOLESTEROL: { low: 0, high: 200, unit: 'mg/dL' },
  HEMOGLOBIN:  { low: 12.0, high: 16.0, unit: 'g/dL' },
};

/**
 * Generalize a bloodwork value to a clinical range category.
 * e.g., "AMH 0.8" -> "AMH low (<1.0 ng/mL)"
 */
export function generalizeBloodworkValue(name, value, unit) {
  const numericValue = parseFloat(value);
  if (isNaN(numericValue)) return { name, range: 'unknown', unit };

  const key = name.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const ref = Object.entries(MARKER_RANGES).find(([k]) => key.includes(k));

  if (!ref) {
    const quintile = Math.ceil(numericValue / 20) * 20;
    return { name, range: `${quintile - 20}-${quintile}`, unit };
  }

  const [, ranges] = ref;
  if (numericValue < ranges.low) {
    return { name, range: `low (<${ranges.low} ${ranges.unit})`, unit: ranges.unit };
  } else if (numericValue > ranges.high) {
    return { name, range: `elevated (>${ranges.high} ${ranges.unit})`, unit: ranges.unit };
  }
  return { name, range: `normal (${ranges.low}-${ranges.high} ${ranges.unit})`, unit: ranges.unit };
}

/**
 * Generalize exact age to a 5-year bracket.
 */
export function generalizeAge(age) {
  const numAge = parseInt(age, 10);
  if (isNaN(numAge) || numAge < 0) return null;
  const lower = Math.floor(numAge / 5) * 5;
  return `${lower}-${lower + 5}`;
}

/**
 * PII patterns to detect and strip from free-text.
 */
const PII_PATTERNS = [
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,           // email
  /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}\b/g, // phone
  /\b(?:Dr\.?|Doctor|Prof\.?|Professor)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g, // doctor names
  /\b(?:Hospital|Clinic|Medical Center|Centro|Clínica|Hôpital)\s+(?:de\s+)?[A-Z][a-zA-Zéèêëàáâäïîôùüÿç\s-]+\b/g, // clinic names
  /\b(?:my\s+(?:husband|wife|partner|spouse|boyfriend|girlfriend))\s+[A-Z][a-z]+\b/gi, // partner names
  /\b\d{1,5}\s+[A-Z][a-z]+(?:\s+(?:St|Ave|Rd|Blvd|Dr|Lane|Way|Court|Ct|Circle|Cir)\.?)\b/g, // street addresses
];

/**
 * Remove PII patterns from free text while preserving medical terminology.
 */
export function sanitizeFreeText(text) {
  if (!text) return '';
  let result = text;
  for (const pattern of PII_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result.replace(/\[REDACTED\]\s*\[REDACTED\]/g, '[REDACTED]').trim();
}

/**
 * Suppress medication/condition combinations that appear fewer than threshold times.
 * Returns records that meet the threshold; suppressed records are excluded.
 */
export function suppressRareCombinations(records, threshold = 5) {
  const comboCounts = new Map();
  for (const record of records) {
    const key = record.combinationKey || JSON.stringify(record.markers || []);
    comboCounts.set(key, (comboCounts.get(key) || 0) + 1);
  }
  const kept = [];
  const suppressed = [];
  for (const record of records) {
    const key = record.combinationKey || JSON.stringify(record.markers || []);
    if (comboCounts.get(key) >= threshold) {
      kept.push(record);
    } else {
      suppressed.push(record);
    }
  }
  return { kept, suppressed };
}

/**
 * Replace exact dates with temporal buckets (cycle phases or month-level).
 */
export function temporalBucket(date, cyclePhase) {
  if (cyclePhase) return cyclePhase;
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return 'unknown';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Add Laplace noise for differential privacy.
 * Implements the Laplace mechanism with configurable epsilon and sensitivity.
 */
export function addDifferentialPrivacyNoise(value, epsilon = DP_EPSILON, sensitivity = 1.0) {
  const numValue = parseFloat(value);
  if (isNaN(numValue)) return value;
  const scale = sensitivity / epsilon;
  const u = Math.random() - 0.5;
  const noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
  return Math.round((numValue + noise) * 100) / 100;
}

/**
 * Categorize a question into a topic bucket.
 */
export function categorizeQuestion(text) {
  if (!text) return 'general';
  const lower = text.toLowerCase();
  if (/\b(ivf|in.?vitro)\b/.test(lower)) return 'ivf';
  if (/\b(iui|insemination)\b/.test(lower)) return 'iui';
  if (/\b(blood\s*work|lab\s*result|marker|amh|fsh|lh)\b/.test(lower)) return 'bloodwork';
  if (/\b(diet|nutrition|food|supplement|vitamin)\b/.test(lower)) return 'nutrition';
  if (/\b(male|sperm|semen)\b/.test(lower)) return 'male_fertility';
  if (/\b(success\s*rate|chance|probability)\b/.test(lower)) return 'success_rates';
  if (/\b(medic|drug|clomid|letrozole|gonadotropin)\b/.test(lower)) return 'medication';
  if (/\b(pregnant|pregnancy|conceiv|ttc)\b/.test(lower)) return 'pregnancy';
  return 'general';
}

/**
 * Hash a value with SHA-256 for deduplication without storing originals.
 */
export function hashForDedup(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}
