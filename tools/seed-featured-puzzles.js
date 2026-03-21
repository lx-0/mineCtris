#!/usr/bin/env node
/**
 * seed-featured-puzzles.js — Generate KV bulk data for official featured puzzles.
 *
 * Usage:
 *   node tools/seed-featured-puzzles.js > tools/featured-kv.json
 *   wrangler kv:bulk put --binding PUZZLES_KV tools/featured-kv.json
 *
 * This is an admin-only script. The `featured` flag is NOT settable via the
 * public POST /api/puzzles endpoint — only this seed script may write featured
 * puzzles. Featured puzzles are stored in `puzzle:{id}` (same schema as
 * community puzzles) plus a `puzzles:featured` index they are sourced from.
 *
 * EDITOR_PALETTE indices (from js/editor.js):
 *   0=Dirt, 1=Stone, 2=Gold, 3=Ice, 4=Moss, 5=Lava, 6=Crystal, 7=Diamond, 8=Obsidian
 *
 * Block format: [x, yLevel, z, paletteIdx]  yLevel 0 = ground
 *
 * Win condition modes (from js/puzzle.js):
 *   mine_all      — mine all pre-placed blocks (n ignored)
 *   clear_lines   — clear n lines
 *   survive_seconds — survive n seconds
 *   score_points  — reach n points
 */

'use strict';

// ── Inline LZ-string (URL-safe variant) ───────────────────────────────────────
// Adapted from puzzle-codec.js (same algorithm, CommonJS-compatible).
const _LZ = (function () {
  const K = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  function compress(str) {
    if (str == null) return '';
    const BPC = 6;
    let dic = {}, dicToCreate = {}, c = '', wc = '', w = '';
    let enlargeIn = 2, dictSize = 3, numBits = 2;
    let out = [], dv = 0, dp = 0;

    function writeBits(v, n) {
      for (let b = 0; b < n; b++) {
        dv = (dv << 1) | (v & 1);
        if (dp === BPC - 1) { dp = 0; out.push(K[dv]); dv = 0; }
        else dp++;
        v >>= 1;
      }
    }
    function checkEnlarge() {
      if (--enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; }
    }

    for (let ii = 0; ii < str.length; ii++) {
      c = str[ii];
      if (!(c in dic)) { dic[c] = dictSize++; dicToCreate[c] = true; }
      wc = w + c;
      if (wc in dic) {
        w = wc;
      } else {
        if (w in dicToCreate) {
          const val = w.charCodeAt(0);
          if (val < 256) { writeBits(0, numBits); writeBits(val, 8); }
          else           { writeBits(1, numBits); writeBits(val, 16); }
          checkEnlarge();
          delete dicToCreate[w];
        } else {
          writeBits(dic[w], numBits);
        }
        checkEnlarge();
        dic[wc] = dictSize++;
        w = String(c);
      }
    }
    if (w !== '') {
      if (w in dicToCreate) {
        const val = w.charCodeAt(0);
        if (val < 256) { writeBits(0, numBits); writeBits(val, 8); }
        else           { writeBits(1, numBits); writeBits(val, 16); }
        checkEnlarge();
      } else {
        writeBits(dic[w], numBits);
      }
      checkEnlarge();
    }
    writeBits(2, numBits);
    while (true) { dv <<= 1; if (dp === BPC - 1) { out.push(K[dv]); break; } dp++; }
    return out.join('');
  }

  return { compress };
})();

const PUZZLE_CODEC_VERSION = 2;

function encode(winCondition, blocks, metadata, pieceSequence) {
  const obj = {
    v:    PUZZLE_CODEC_VERSION,
    wc:   { m: winCondition.mode, n: winCondition.n },
    b:    blocks,
    meta: {
      n:  metadata.name,
      d:  metadata.description,
      a:  metadata.author,
      df: metadata.difficulty,
    },
    ps:   pieceSequence
      ? { m: pieceSequence.mode, p: pieceSequence.pieces }
      : { m: 'random', p: [] },
  };
  return _LZ.compress(JSON.stringify(obj));
}

// ── Puzzle definitions ─────────────────────────────────────────────────────────
//
// difficulty mapping: 0=easy(1★)  1=medium(2★)  2=hard(3★)
// DIFFICULTY_LABELS[df] → stored as string in KV: 'easy'|'medium'|'hard'

const DIFFICULTY_LABELS = ['easy', 'medium', 'hard', 'expert'];

const OFFICIAL_PUZZLES = [
  // ── 1. mine_all / easy ───────────────────────────────────────────────────────
  {
    id:          'official-1',
    metadata: {
      name:        'Golden Gateway',
      description: 'Mine the gold ore arch before time runs out.',
      author:      'MineCtris',
      difficulty:  0, // easy / 1★
    },
    winCondition:  { mode: 'mine_all', n: 0 },
    // Gold arch: two pillars + keystone  (paletteIdx 2 = Gold)
    blocks: [
      [-1, 0, 0, 2], [1, 0, 0, 2],
      [-1, 1, 0, 2], [0, 1, 0, 2], [1, 1, 0, 2],
    ],
    pieceSequence: { mode: 'random', pieces: [] },
  },

  // ── 2. clear_lines / medium ──────────────────────────────────────────────────
  {
    id:          'official-2',
    metadata: {
      name:        'Line Buster',
      description: 'Stack and clear 8 full lines to win.',
      author:      'MineCtris',
      difficulty:  1, // medium / 2★
    },
    winCondition:  { mode: 'clear_lines', n: 8 },
    blocks: [],     // no pre-placed blocks; pure tetris line-clearing challenge
    pieceSequence: { mode: 'random', pieces: [] },
  },

  // ── 3. survive_seconds / medium ──────────────────────────────────────────────
  {
    id:          'official-3',
    metadata: {
      name:        'Iron Will',
      description: 'Survive for 90 seconds without topping out.',
      author:      'MineCtris',
      difficulty:  1, // medium / 2★
    },
    winCondition:  { mode: 'survive_seconds', n: 90 },
    blocks: [],
    pieceSequence: { mode: 'random', pieces: [] },
  },

  // ── 4. score_points / hard ────────────────────────────────────────────────────
  {
    id:          'official-4',
    metadata: {
      name:        'Score Rush',
      description: 'Rack up 5000 points. Chain combos and 4-line clears.',
      author:      'MineCtris',
      difficulty:  2, // hard / 3★
    },
    winCondition:  { mode: 'score_points', n: 5000 },
    blocks: [],
    pieceSequence: { mode: 'random', pieces: [] },
  },

  // ── 5. mine_all / hard ────────────────────────────────────────────────────────
  {
    id:          'official-5',
    metadata: {
      name:        'Crystal Fortress',
      description: 'Mine every crystal in this towering 3D formation.',
      author:      'MineCtris',
      difficulty:  2, // hard / 3★
    },
    winCondition:  { mode: 'mine_all', n: 0 },
    // Crystal fortress: wide base, side arms, bridge, apex  (paletteIdx 6 = Crystal)
    blocks: [
      [-2, 0, 0, 6], [-1, 0, 0, 6], [0, 0, 0, 6], [1, 0, 0, 6], [2, 0, 0, 6],
      [-2, 1, 0, 6],                                               [2, 1, 0, 6],
      [-1, 2, 0, 6], [0, 2, 0, 6], [1, 2, 0, 6],
      [-2, 0, 1, 6],                               [2, 0, 1, 6],
      [0, 3, 0, 6],
    ],
    pieceSequence: { mode: 'random', pieces: [] },
  },
];

// ── Build KV records ──────────────────────────────────────────────────────────

const createdAt = new Date().toISOString();
const kvEntries = [];

const featuredIndex = OFFICIAL_PUZZLES.map((p) => {
  const difficulty = DIFFICULTY_LABELS[p.metadata.difficulty] || 'easy';
  return {
    id:         p.id,
    title:      p.metadata.name,
    author:     p.metadata.author,
    difficulty,
    createdAt,
  };
});

for (const p of OFFICIAL_PUZZLES) {
  const difficulty = DIFFICULTY_LABELS[p.metadata.difficulty] || 'easy';
  const code = encode(p.winCondition, p.blocks, p.metadata, p.pieceSequence);
  if (!code) {
    process.stderr.write(`ERROR: Failed to encode puzzle ${p.id}\n`);
    process.exit(1);
  }

  const record = {
    id:        p.id,
    title:     p.metadata.name,
    author:    p.metadata.author,
    difficulty,
    plays:     0,
    rating:    0,
    thumbsUp:  0,
    thumbsDown: 0,
    featured:  true,
    createdAt,
    code,
  };

  kvEntries.push({
    key:   `puzzle:${p.id}`,
    value: JSON.stringify(record),
  });
}

// Featured index (no expiry — permanent)
kvEntries.push({
  key:   'puzzles:featured',
  value: JSON.stringify(featuredIndex),
});

process.stdout.write(JSON.stringify(kvEntries, null, 2) + '\n');

process.stderr.write(
  `\nGenerated ${OFFICIAL_PUZZLES.length} featured puzzles + 1 index entry.\n` +
  `\nNext steps:\n` +
  `  wrangler kv:bulk put --binding PUZZLES_KV tools/featured-kv.json\n` +
  `\nPuzzles seeded:\n` +
  OFFICIAL_PUZZLES.map((p) =>
    `  [${DIFFICULTY_LABELS[p.metadata.difficulty]}] ${p.metadata.name} (${p.winCondition.mode}${p.winCondition.n ? ', n=' + p.winCondition.n : ''})`
  ).join('\n') + '\n'
);
