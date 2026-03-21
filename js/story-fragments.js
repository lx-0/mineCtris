// Story Fragments — lore collectibles with per-run drop logic.
//
// Each expedition run has a chance to surface one story fragment per run.
// Fragments are tied to biomes, have a rarity, and never re-drop once collected.
// Legendary fragments only unlock after the player has collected 50%+ of that
// biome's common fragments.
//
// Load order: after expedition-session.js, before main.js.

// ── Fragment Library ──────────────────────────────────────────────────────────

const STORY_FRAGMENTS = [
  // ── Stone biome (8 fragments: 4 common, 2 rare, 2 legendary) ───────────────
  {
    id: 'stone_c1',
    biomeId: 'stone',
    rarity: 'common',
    title: 'The First Descent',
    lore: 'The first miners did not choose to descend — they fell. Passages carved by water long since vanished led them deeper than any torch could illuminate. They left marks on the walls so others could follow. No one knows who came back.',
    artRef: 'art/fragments/stone_c1.png',
  },
  {
    id: 'stone_c2',
    biomeId: 'stone',
    rarity: 'common',
    title: 'Fossil Record',
    lore: 'Pressed flat inside a seam of shale, the creature left only an outline. Three segmented legs. A fan of spines along the dorsal ridge. Whatever it was, it lived before the surface was the surface. The stone remembered it. We did not.',
    artRef: 'art/fragments/stone_c2.png',
  },
  {
    id: 'stone_c3',
    biomeId: 'stone',
    rarity: 'common',
    title: 'Iron Seam',
    lore: 'Iron runs in veins the way rivers run on the surface — following the path of least resistance through older, harder stone. The miners called it "the thread." Follow the thread long enough and you find where the world was stitched together.',
    artRef: 'art/fragments/stone_c3.png',
  },
  {
    id: 'stone_c4',
    biomeId: 'stone',
    rarity: 'common',
    title: 'Hollow Echo',
    lore: 'Tap the wall. If it rings hollow, step back. The stone here is thin over something much larger below. Generations of miners learned this lesson late. They named the empty space beneath their feet the Echo Hall. No one has mapped its full extent.',
    artRef: 'art/fragments/stone_c4.png',
  },
  {
    id: 'stone_r1',
    biomeId: 'stone',
    rarity: 'rare',
    title: 'The Crystal Chamber',
    lore: 'Quartz formations the size of houses grew in a sealed pocket for ten thousand years. When the miners broke through, the air was so cold it burned. The crystals hummed at a frequency that made tools vibrate loose from handles. The chamber was resealed within a week. The maps mark it only as "Restricted."',
    artRef: 'art/fragments/stone_r1.png',
  },
  {
    id: 'stone_r2',
    biomeId: 'stone',
    rarity: 'rare',
    title: 'Fault Line',
    lore: 'The great crack runs north to south for three hundred meters before it vanishes under compacted rubble. On one side: limestone. On the other: basalt. They should not be adjacent — they formed in different eras, under different pressures. Whatever event brought them together also erased everything between them.',
    artRef: 'art/fragments/stone_r2.png',
  },
  {
    id: 'stone_l1',
    biomeId: 'stone',
    rarity: 'legendary',
    title: 'The Deep Architect',
    lore: 'Deep in the stone, far past any natural seam, the tunnels are too regular. Perfectly circular cross-sections. Smooth walls unmarked by any tool we recognize. The passages predate every settlement on the surface by millennia. Someone built this world from the inside out — and when they were done, they went further down.',
    artRef: 'art/fragments/stone_l1.png',
  },
  {
    id: 'stone_l2',
    biomeId: 'stone',
    rarity: 'legendary',
    title: 'Primordial Stone',
    lore: 'At the deepest reachable point, the rock changes. It is not granite or basalt or anything nameable. It absorbs light differently. Instruments give false readings near it. The oldest miners called it the Ur-Stone — the substance from which all other stone learned to be stone. It has no seams. It has always been exactly what it is.',
    artRef: 'art/fragments/stone_l2.png',
  },

  // ── Forest biome (8 fragments: 4 common, 2 rare, 2 legendary) ──────────────
  {
    id: 'forest_c1',
    biomeId: 'forest',
    rarity: 'common',
    title: 'Root Network',
    lore: 'The roots do not compete — they share. Neighboring trees of different species splice their root tips together in the dark, passing nutrients through a slow, silent exchange. The forest has no center. Every tree is the center. The network has been running longer than the oldest tree has been standing.',
    artRef: 'art/fragments/forest_c1.png',
  },
  {
    id: 'forest_c2',
    biomeId: 'forest',
    rarity: 'common',
    title: 'Canopy Whisper',
    lore: 'The top layer of the forest moves in winds that never reach the floor. You can hear it from below — a long, slow rushing sound like a tide drawing back. The canopy is its own world. Different creatures live there, eat there, die there, and never touch the ground their entire lives.',
    artRef: 'art/fragments/forest_c2.png',
  },
  {
    id: 'forest_c3',
    biomeId: 'forest',
    rarity: 'common',
    title: 'Spore Migration',
    lore: 'Twice each year the forest exhales. A visible haze hangs in the air for three days as spores of every fungal species travel to new ground. If you breathe it in — and you cannot avoid it — you carry the forest\'s intentions with you for weeks. It is not harmful. But you will dream of trees.',
    artRef: 'art/fragments/forest_c3.png',
  },
  {
    id: 'forest_c4',
    biomeId: 'forest',
    rarity: 'common',
    title: 'Bark Inscription',
    lore: 'The oldest trees carry marks pressed into their bark from the inside. Raised lines that form no script anyone has translated, spiraling from root-line to crown. The marks only appear on trees more than two centuries old. They deepen as the tree ages. No one carved them.',
    artRef: 'art/fragments/forest_c4.png',
  },
  {
    id: 'forest_r1',
    biomeId: 'forest',
    rarity: 'rare',
    title: 'The Heartwood',
    lore: 'At the core of the largest tree in the biome lies wood so dense it has nearly become stone. The rings in the heartwood no longer show annual growth — the tree aged past years into something else. Cut a cross-section and the pattern inside is not concentric circles. It is a map of a place that does not correspond to anywhere on the surface.',
    artRef: 'art/fragments/forest_r1.png',
  },
  {
    id: 'forest_r2',
    biomeId: 'forest',
    rarity: 'rare',
    title: 'Mycelium Mind',
    lore: 'Remove one tree from the network and three others respond within hours — redirecting growth, changing chemical output, raising chemical defenses. The response is too coordinated to be coincidence and too slow to be electrical. Whatever intelligence the forest holds is distributed, patient, and very old. It has been making decisions since before the word "decision" existed.',
    artRef: 'art/fragments/forest_r2.png',
  },
  {
    id: 'forest_l1',
    biomeId: 'forest',
    rarity: 'legendary',
    title: 'World Tree Memory',
    lore: 'At the biome\'s edge stands a tree no instrument can date. Its trunk is thirty meters across. Its lowest branch is eighty meters up. The root network beneath it connects to every other tree in the forest — the network flows through it, not around it. When the wind moves it, the entire forest shudders. When it shudders, the root network carries something that is not a nutrient and not a signal. The other trees go quiet for days afterward.',
    artRef: 'art/fragments/forest_l1.png',
  },
  {
    id: 'forest_l2',
    biomeId: 'forest',
    rarity: 'legendary',
    title: 'The Green Accord',
    lore: 'Long before the first settlement, the forest made an agreement with the stone beneath it. The roots do not break the deep rock; the rock does not close the water channels the roots need. For ten thousand years this treaty has held. The forest knows that if it ever violates the accord, the stone will remember. So far, the forest has chosen continuity over conquest. So far.',
    artRef: 'art/fragments/forest_l2.png',
  },

  // ── Nether biome (7 fragments: 3 common, 2 rare, 2 legendary) ──────────────
  {
    id: 'nether_c1',
    biomeId: 'nether',
    rarity: 'common',
    title: 'Lava Chronicle',
    lore: 'The lava here is not recent. It has been flowing since before the biome was named. Different layers carry different minerals — a vertical history of the Nether\'s temperature over thousands of years. Read upward: the world was once cooler here. The lava is getting hotter. The rate of change is accelerating.',
    artRef: 'art/fragments/nether_c1.png',
  },
  {
    id: 'nether_c2',
    biomeId: 'nether',
    rarity: 'common',
    title: 'Ash Testament',
    lore: 'The ash layer deposited after the great fire event is two centimeters thick across the entire biome, at the same depth, without variation. The event that caused it was simultaneous everywhere. Whatever burned, burned all at once. The Nether\'s current inhabitants built their culture on top of that layer. They do not speak of what burned.',
    artRef: 'art/fragments/nether_c2.png',
  },
  {
    id: 'nether_c3',
    biomeId: 'nether',
    rarity: 'common',
    title: 'Ember Memory',
    lore: 'Certain rocks here retain heat for weeks after being removed from the biome. Settlers discovered this early and used Nether stone for winter heating in the cold zones. The stone does not merely hold heat — it releases it in pulses, as though breathing. The rhythm matches nothing biological. It matches the pulse of the lava flows underground.',
    artRef: 'art/fragments/nether_c3.png',
  },
  {
    id: 'nether_r1',
    biomeId: 'nether',
    rarity: 'rare',
    title: 'The Bastion Record',
    lore: 'The fortress at the Nether\'s center was not built for defense — the walls face inward. Whatever the builders feared, they feared it was already inside with them. The record they left is scratched into magma-cooled obsidian: a list of rules for surviving an entity they described only as "the one that moves between fires." The last rule reads: "Do not watch it. It grows larger when observed."',
    artRef: 'art/fragments/nether_r1.png',
  },
  {
    id: 'nether_r2',
    biomeId: 'nether',
    rarity: 'rare',
    title: 'Flame Tongue',
    lore: 'The Nether\'s oldest inhabitants communicated through controlled burns — the color and speed of flame conveying meaning across distances. Some of these signal fires have been burning continuously for two centuries, maintained by no one visible, passing messages no current generation can decode. The flames change color on a schedule. Someone is still sending.',
    artRef: 'art/fragments/nether_r2.png',
  },
  {
    id: 'nether_l1',
    biomeId: 'nether',
    rarity: 'legendary',
    title: 'The First Fire',
    lore: 'There is a flame at the Nether\'s core that predates all others. It burns without fuel. It does not spread. It does not go out. Every fire in the biome traces its origin to a point where someone carried an ember from this central source outward, and that ember lit another fire, which lit another, for ten thousand years. The first fire remembers every flame descended from it. It is running out of space to remember.',
    artRef: 'art/fragments/nether_l1.png',
  },
  {
    id: 'nether_l2',
    biomeId: 'nether',
    rarity: 'legendary',
    title: 'Netherstorm Origin',
    lore: 'Once per century, the Nether generates a storm of charged particles that strips every unprotected surface down to bare stone. The survivors recorded the last three occurrences. Each one was larger than the last. Each one was preceded by a period of unusual silence — the lava flows slowing, the constant heat diminishing, as though the Nether were drawing breath. The silence before the next storm has already begun.',
    artRef: 'art/fragments/nether_l2.png',
  },

  // ── Ice biome (7 fragments: 3 common, 2 rare, 2 legendary) ─────────────────
  {
    id: 'ice_c1',
    biomeId: 'ice',
    rarity: 'common',
    title: 'Glacial Inscription',
    lore: 'The glacier carries rock scraped from its origin point thousands of kilometers distant. Study the stone trapped in the ice and you can read a journey no living thing witnessed. Granite from the eastern peaks. Basalt from the old volcanic field. Limestone from a seafloor that is now a mountain. The glacier is a library of everywhere it has been.',
    artRef: 'art/fragments/ice_c1.png',
  },
  {
    id: 'ice_c2',
    biomeId: 'ice',
    rarity: 'common',
    title: 'Frost Memoir',
    lore: 'The ice here preserves things intact. Insects from three thousand years ago, suspended mid-flight. A leather glove, still flexible, still bearing the shape of the hand that wore it. Seeds from extinct plant species. The biome holds everything it catches with equal indifference — the significant and the ordinary, the ancient and the merely forgotten.',
    artRef: 'art/fragments/ice_c2.png',
  },
  {
    id: 'ice_c3',
    biomeId: 'ice',
    rarity: 'common',
    title: 'Permafrost Story',
    lore: 'Below the active frost layer, the permafrost has not thawed in twelve thousand years. Cores drilled from its depth contain bubbles of ancient atmosphere — air that nothing alive today has ever breathed, from a world with different ratios of every gas. The old air is richer. Whatever the world had then, it had more of it. We have been running on less ever since.',
    artRef: 'art/fragments/ice_c3.png',
  },
  {
    id: 'ice_r1',
    biomeId: 'ice',
    rarity: 'rare',
    title: 'The Frozen Sea',
    lore: 'The ice biome sits above what was once an ocean. Press your ear to the deep ice on a quiet day and you can hear the current that still moves beneath it — the water never fully stopped, only slowed. The creatures of that subglacial sea adapted over millennia to total darkness, near-zero temperatures, and pressure that would crush the biome\'s surface inhabitants. They are still there. They have never been catalogued.',
    artRef: 'art/fragments/ice_r1.png',
  },
  {
    id: 'ice_r2',
    biomeId: 'ice',
    rarity: 'rare',
    title: 'Crystal Archive',
    lore: 'Ice crystals grown slowly enough develop internal lattice structures that catch and redirect light in patterns unique to the conditions of their formation. Scholars learned to read these structures as records of temperature, atmospheric pressure, and magnetic field strength at the moment of growth. The deep ice holds thousands of years of such records. Most of them describe conditions that no longer exist and should not have been stable.',
    artRef: 'art/fragments/ice_r2.png',
  },
  {
    id: 'ice_l1',
    biomeId: 'ice',
    rarity: 'legendary',
    title: 'The Last Winter',
    lore: 'A recurring pattern in the ice layers shows that every fifteen thousand years, the biome undergoes a total freeze event. Everything stops. The subglacial sea locks solid. The permafrost merges with the surface ice into a single mass kilometers thick. It lasts for approximately two centuries. Then it releases. The last event ended fourteen thousand nine hundred years ago. The interval is not irregular. The ice is prepared. We are not.',
    artRef: 'art/fragments/ice_l1.png',
  },
  {
    id: 'ice_l2',
    biomeId: 'ice',
    rarity: 'legendary',
    title: 'Glacial Epoch',
    lore: 'At the ice biome\'s center, buried under four hundred meters of accumulated frost, there is a structure that does not appear in any survey. It is too regular to be natural — a series of interlocking chambers, each maintained at a precise temperature different from its neighbors. Something lives in the thermal gradient between the chambers. It has adapted so completely to ice and cold and pressure that warmth itself is lethal to it. It has been waiting there since the last great freeze. Patiently. At peace with the slow passage of millennia.',
    artRef: 'art/fragments/ice_l2.png',
  },
];

// ── Persistence ───────────────────────────────────────────────────────────────

const _FRAGMENT_COLLECTED_KEY = 'mineCtris_collectedFragments';
const _FRAGMENT_NEW_KEY       = 'mineCtris_newFragments';

/** Returns Set of collected fragment IDs. Survives season resets (never cleared). */
function getCollectedFragmentIds() {
  try {
    const raw = localStorage.getItem(_FRAGMENT_COLLECTED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch (_) {
    return new Set();
  }
}

/** Returns Set of fragment IDs that are newly collected but not yet viewed in the codex. */
function getNewFragmentIds() {
  try {
    const raw = localStorage.getItem(_FRAGMENT_NEW_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch (_) {
    return new Set();
  }
}

/**
 * Remove the given fragment IDs from the "new" set (called when the codex tab is opened).
 * @param {string[]} fragmentIds
 */
function markFragmentsViewed(fragmentIds) {
  var ids = getNewFragmentIds();
  fragmentIds.forEach(function (id) { ids.delete(id); });
  try {
    localStorage.setItem(_FRAGMENT_NEW_KEY, JSON.stringify(Array.from(ids)));
  } catch (_) {}
}

/** Persist a newly collected fragment ID. Idempotent. */
function _markFragmentCollected(fragmentId) {
  const ids = getCollectedFragmentIds();
  ids.add(fragmentId);
  try {
    localStorage.setItem(_FRAGMENT_COLLECTED_KEY, JSON.stringify(Array.from(ids)));
  } catch (_) {}
}

// ── Query helpers ─────────────────────────────────────────────────────────────

/** Returns all fragments for a biome, optionally filtered by rarity. */
function _fragmentsForBiome(biomeId, rarity) {
  return STORY_FRAGMENTS.filter(function (f) {
    return f.biomeId === biomeId && (!rarity || f.rarity === rarity);
  });
}

/**
 * Returns true when the legendary-unlock threshold is met:
 * the player has collected ≥ 50% of the common fragments for this biome.
 */
function _legendaryUnlocked(biomeId, collected) {
  const commons = _fragmentsForBiome(biomeId, 'common');
  if (commons.length === 0) return false;
  const collectedCommons = commons.filter(function (f) { return collected.has(f.id); });
  return collectedCommons.length >= Math.ceil(commons.length * 0.5);
}

// ── Drop logic ────────────────────────────────────────────────────────────────

/**
 * Roll for a story fragment drop at the end of an expedition run.
 *
 * Probabilities (per spec):
 *   common    60%
 *   rare      30%
 *   legendary 10% (only when legendary-unlock threshold is met; else re-roll as rare)
 *
 * Never returns a fragment the player has already collected.
 * Returns null when no eligible fragment is available.
 *
 * @param {string} biomeId  - The biome of the completed run.
 * @param {function} [rng]  - Optional seeded RNG (returns [0, 1)). Defaults to Math.random.
 * @returns {{ fragment: object, isNew: boolean } | null}
 */
function rollStoryFragment(biomeId, rng) {
  var random = rng || Math.random;
  var collected = getCollectedFragmentIds();

  // Determine rarity by dice roll
  var roll = random();
  var rarity;
  if (roll < 0.60) {
    rarity = 'common';
  } else if (roll < 0.90) {
    rarity = 'rare';
  } else {
    // Legendary: only available when threshold met; else falls back to rare
    if (_legendaryUnlocked(biomeId, collected)) {
      rarity = 'legendary';
    } else {
      rarity = 'rare';
    }
  }

  // Pick an uncollected fragment of the chosen rarity
  var candidates = _fragmentsForBiome(biomeId, rarity).filter(function (f) {
    return !collected.has(f.id);
  });

  // If no uncollected fragments at this rarity, try other rarities (ascending rarity order)
  if (candidates.length === 0) {
    var fallbackOrder = ['common', 'rare', 'legendary'];
    for (var i = 0; i < fallbackOrder.length; i++) {
      var fb = fallbackOrder[i];
      if (fb === rarity) continue;
      if (fb === 'legendary' && !_legendaryUnlocked(biomeId, collected)) continue;
      var fbCandidates = _fragmentsForBiome(biomeId, fb).filter(function (f) {
        return !collected.has(f.id);
      });
      if (fbCandidates.length > 0) {
        candidates = fbCandidates;
        rarity = fb;
        break;
      }
    }
  }

  if (candidates.length === 0) return null;  // all biome fragments collected

  var fragment = candidates[Math.floor(random() * candidates.length)];
  _markFragmentCollected(fragment.id);
  // Track as "new" so the codex shows a NEW badge until the player views it.
  var newIds = getNewFragmentIds();
  newIds.add(fragment.id);
  try { localStorage.setItem(_FRAGMENT_NEW_KEY, JSON.stringify(Array.from(newIds))); } catch (_) {}
  return { fragment: fragment, isNew: true };
}

// ── Collection stats ──────────────────────────────────────────────────────────

/**
 * Returns collection progress for a given biome.
 * @returns {{ total: number, collected: number, pct: number }}
 */
function getFragmentProgress(biomeId) {
  var all = biomeId ? _fragmentsForBiome(biomeId) : STORY_FRAGMENTS;
  var collected = getCollectedFragmentIds();
  var collectedCount = all.filter(function (f) { return collected.has(f.id); }).length;
  return {
    total: all.length,
    collected: collectedCount,
    pct: all.length > 0 ? Math.round((collectedCount / all.length) * 100) : 0,
  };
}

/**
 * Returns full fragment objects for all collected fragments (across all biomes or one biome).
 */
function getCollectedFragments(biomeId) {
  var collected = getCollectedFragmentIds();
  return STORY_FRAGMENTS.filter(function (f) {
    return collected.has(f.id) && (!biomeId || f.biomeId === biomeId);
  });
}
