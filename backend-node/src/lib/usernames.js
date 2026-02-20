/**
 * Generate unique positive usernames by combining adjective + noun.
 * All words are positive and uplifting only. Pool supports unlimited unique combinations.
 * Optional: exclude already-taken usernames so the list can be "refilled" with different names.
 */

const ADJECTIVES = [
  'Grateful', 'Radiant', 'Peaceful', 'Kind', 'Wise', 'Gentle', 'Bright', 'Calm',
  'Joyful', 'Serene', 'Brave', 'True', 'Noble', 'Sweet', 'Bold', 'Warm',
  'Lively', 'Graceful', 'Cheerful', 'Loving', 'Hopeful', 'Soothing', 'Fresh',
  'Sunny', 'Cozy', 'Tender', 'Pure', 'Clear', 'Soft', 'Fair', 'Golden',
  'Harmonious', 'Inspiring', 'Jubilant', 'Keen', 'Lucky', 'Merry', 'Nurturing',
  'Optimistic', 'Proud', 'Quiet', 'Resilient', 'Steady', 'Trusty', 'Upbeat',
  'Vibrant', 'Welcoming', 'Zen', 'Amber', 'Blissful', 'Caring', 'Daring',
  'Eager', 'Faithful', 'Genuine', 'Hearty', 'Infinite', 'Jolly', 'Kindred',
  'Luminous', 'Mellow', 'Noble', 'Open', 'Placid', 'Quiet', 'Radiant',
  'Stellar', 'Tranquil', 'Unique', 'Valiant', 'Warm', 'Youthful', 'Zesty',
];

const NOUNS = [
  'Panda', 'Dolphin', 'Star', 'Heart', 'Cloud', 'Meadow', 'River', 'Breeze',
  'Lark', 'Haven', 'Peak', 'Dawn', 'Glow', 'Bloom', 'Flame', 'Crest',
  'Sage', 'Willow', 'Maple', 'Lotus', 'Coral', 'Pearl', 'Jade', 'Sky',
  'Moon', 'Sun', 'Wave', 'Stone', 'Leaf', 'Rose', 'Lily', 'Fern',
  'Grove', 'Vale', 'Brook', 'Frost', 'Mist', 'Spark', 'Ember', 'Breeze',
  'Dew', 'Ray', 'Beam', 'Shore', 'Dune', 'Pine', 'Oak', 'Elm',
  'Dove', 'Swan', 'Hawk', 'Eagle', 'Wren', 'Finch', 'Gull', 'Heron',
  'Lion', 'Wolf', 'Bear', 'Deer', 'Fox', 'Seal', 'Otter', 'Lynx',
  'Comet', 'Orbit', 'Nova', 'Pulse', 'Echo', 'Chord', 'Note', 'Rhythm',
  'Quest', 'Path', 'Trail', 'Gate', 'Bridge', 'Harbor', 'Anchor', 'Sail',
];

const DEFAULT_COUNT = 5;
const MAX_ATTEMPTS_FACTOR = 50;

/**
 * Generate unique positive usernames (Adjective + Noun). Excludes any name in excludeSet (lowercased).
 * @param {number} [count=5] - Number of usernames to return.
 * @param {Set<string>|string[]|null} [excludeSet=null] - Already-taken usernames (normalized to lowercase). Generated names in this set are skipped so the list "refills" with different options.
 * @returns {string[]} Array of unique positive usernames.
 */
export function generatePositiveUsernames(count = DEFAULT_COUNT, excludeSet = null) {
  const exclude = excludeSet instanceof Set
    ? excludeSet
    : Array.isArray(excludeSet)
      ? new Set(excludeSet.map((u) => String(u).trim().toLowerCase()))
      : new Set();
  const seen = new Set();
  const usernames = [];
  const maxAttempts = count * ADJECTIVES.length * NOUNS.length + Math.min(500, count * MAX_ATTEMPTS_FACTOR);

  let attempts = 0;
  while (usernames.length < count && attempts < maxAttempts) {
    attempts += 1;
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const username = `${adj}${noun}`;
    const key = username.toLowerCase();
    if (!seen.has(key) && !exclude.has(key)) {
      seen.add(key);
      usernames.push(username);
    }
  }

  return usernames;
}
