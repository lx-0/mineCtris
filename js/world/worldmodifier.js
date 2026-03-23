// World modifier system — per-run modifier that changes block distribution,
// sky/fog, piece behavior, and score multiplier.
// Requires: (none — standalone config module, read by other modules)

const WORLD_MODIFIER_DEFS = {
  normal: {
    id: 'normal',
    name: 'Normal',
    icon: '\u2605',
    description: 'Standard world. No modifiers.',
    swatchColor: '#88bb44',   // grass green
    blockWeights: null,       // null = use default uniform distribution
    fogColor: null,           // null = use default sky-derived fog
    fogDensityBase: null,     // null = use default base (0.002)
    scoreMultiplier: 1.0,
    playerSpeedMult: 1.0,
    fallSpeedMult: 1.0,
    iceAllBlocks: false,
  },
  ice_world: {
    id: 'ice_world',
    name: 'Ice World',
    icon: '\u2744',
    description: '60% ice pieces. Ice friction everywhere. \xD71.1 score.',
    swatchColor: '#aad4ff',   // blue-white
    // ~60% ice (index 4), reduced lava, no change to others
    blockWeights: { 1: 1, 2: 2, 3: 1, 4: 12, 5: 1, 6: 1, 7: 2 },
    fogColor: 0xaad4ff,       // blue-white fog
    fogDensityBase: 0.013,
    scoreMultiplier: 1.1,
    playerSpeedMult: 1.0,
    fallSpeedMult: 1.0,
    iceAllBlocks: true,       // all blocks behave as ice (slippery)
  },
  nether: {
    id: 'nether',
    name: 'Nether',
    icon: '\uD83D\uDD25',
    description: '60% lava/gold. No wood. Faster fall. \xD71.2 score.',
    swatchColor: '#cc4400',   // orange-red
    // ~67% lava+gold (indices 6+3), no ice (4) or moss (5)
    blockWeights: { 1: 1, 2: 2, 3: 5, 4: 0, 5: 0, 6: 5, 7: 2 },
    fogColor: 0xcc4400,       // orange haze
    fogDensityBase: 0.012,
    scoreMultiplier: 1.2,
    playerSpeedMult: 1.0,
    fallSpeedMult: 1.35,
    iceAllBlocks: false,
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean Depths',
    icon: '\u224B',
    description: '60% ocean blocks. Rare diamond. Slow movement. \xD71.15 score.',
    swatchColor: '#1a7a55',   // blue-green
    // ~60% ocean/ice (index 4), rare diamond (index 8)
    blockWeights: { 1: 1, 2: 1, 3: 1, 4: 12, 5: 1, 6: 1, 7: 2, 8: 1 },
    fogColor: 0x004433,       // blue-green murk
    fogDensityBase: 0.015,
    scoreMultiplier: 1.15,
    playerSpeedMult: 0.6,     // slow movement
    fallSpeedMult: 1.0,
    iceAllBlocks: false,
  },
};

// Active world modifier ID. null = 'normal'. Set at mode select; cleared on reset.
let activeWorldModifierId = null;

/** Return the active WORLD_MODIFIER_DEFS entry (never null — falls back to 'normal'). */
function getWorldModifier() {
  return WORLD_MODIFIER_DEFS[activeWorldModifierId || 'normal'];
}

/** Set the active world modifier by id string. Unknown ids fall back to 'normal'. */
function setWorldModifier(id) {
  activeWorldModifierId = (id && id in WORLD_MODIFIER_DEFS) ? id : null;
}

/** Clear the active modifier (call on game reset). */
function resetWorldModifier() {
  activeWorldModifierId = null;
}

/**
 * Given a blockWeights map { index: weight }, build a weighted pool and
 * return a random index using the supplied rng function.
 * Entries with weight 0 are excluded.
 * Falls back to uniform [1..7] if pool is empty.
 *
 * @param {{ [idx: string]: number }} weights
 * @param {function(): number} rng  0..1 PRNG (use _rng() from pieces.js context)
 * @returns {number}
 */
function worldModifierWeightedIndex(weights, rng) {
  const pool = [];
  for (const key in weights) {
    const w = Math.round(weights[key]);
    if (w <= 0) continue;
    const idx = parseInt(key, 10);
    for (let i = 0; i < w; i++) pool.push(idx);
  }
  if (pool.length === 0) {
    return Math.floor((rng ? rng() : Math.random()) * 7) + 1;
  }
  return pool[Math.floor((rng ? rng() : Math.random()) * pool.length)];
}
