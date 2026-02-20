const K_THRESHOLD = parseInt(process.env.K_ANONYMITY_THRESHOLD || '10', 10);

/**
 * Compute k-anonymity for a set of records given quasi-identifiers.
 * Returns the minimum group size (k) across all equivalence classes.
 *
 * @param {Array<Object>} records - Array of data records
 * @param {string[]} quasiIdentifiers - Field names that form quasi-identifiers
 * @returns {{ k: number, groups: Map<string, number>, totalRecords: number }}
 */
export function calculateKAnonymity(records, quasiIdentifiers) {
  if (!records.length) return { k: Infinity, groups: new Map(), totalRecords: 0 };

  const groups = new Map();

  for (const record of records) {
    const key = quasiIdentifiers
      .map((qi) => String(record[qi] ?? 'NULL'))
      .join('||');
    groups.set(key, (groups.get(key) || 0) + 1);
  }

  let minK = Infinity;
  for (const count of groups.values()) {
    if (count < minK) minK = count;
  }

  return { k: minK, groups, totalRecords: records.length };
}

/**
 * Validate k-anonymity on a dataset.
 * Records in groups smaller than k are suppressed (excluded).
 *
 * @param {Array<Object>} records
 * @param {string[]} quasiIdentifiers
 * @param {number} k - Minimum group size (default from env)
 * @returns {{ valid: boolean, k: number, kept: Array, suppressed: Array, groupCount: number }}
 */
export function validateKAnonymity(records, quasiIdentifiers, k = K_THRESHOLD) {
  if (!records.length) {
    return { valid: true, k, kept: [], suppressed: [], groupCount: 0 };
  }

  const groupMap = new Map();

  for (const record of records) {
    const key = quasiIdentifiers
      .map((qi) => String(record[qi] ?? 'NULL'))
      .join('||');
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(record);
  }

  const kept = [];
  const suppressed = [];

  for (const [, group] of groupMap) {
    if (group.length >= k) {
      kept.push(...group);
    } else {
      suppressed.push(...group);
    }
  }

  return {
    valid: suppressed.length === 0,
    k,
    kept,
    suppressed,
    groupCount: groupMap.size,
  };
}

/**
 * Check if a single record would be unique (re-identification risk)
 * in the context of existing records.
 *
 * @param {Object} record
 * @param {Array<Object>} existingRecords
 * @param {string[]} quasiIdentifiers
 * @returns {{ isUnique: boolean, groupSize: number }}
 */
export function uniquenessTest(record, existingRecords, quasiIdentifiers) {
  const recordKey = quasiIdentifiers
    .map((qi) => String(record[qi] ?? 'NULL'))
    .join('||');

  let groupSize = 1; // count the record itself
  for (const existing of existingRecords) {
    const key = quasiIdentifiers
      .map((qi) => String(existing[qi] ?? 'NULL'))
      .join('||');
    if (key === recordKey) groupSize++;
  }

  return { isUnique: groupSize === 1, groupSize };
}
