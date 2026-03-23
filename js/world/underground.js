// Underground exposed-face block rendering engine.
// Manages a 20×20×31 voxel grid (undergroundGrid[x][z][y]) for the underground play space.
// Only blocks with at least one exposed face (neighbor is air or boundary) carry a mesh,
// keeping peak mesh count well below 2,400.
//
// Requires (loaded before this file):
//   config.js  — BLOCK_SIZE, BLOCK_TYPES
//   world.js   — createBlockMesh(), disposeBlock()
//   state.js   — worldGroup

// ── Seeded PRNG (mulberry32) ──────────────────────────────────────────────────

/**
 * Returns a deterministic PRNG function seeded with `seed`.
 * Each call to the returned function advances the sequence and returns [0, 1).
 */
function _ugRng(seed) {
  let s = (seed >>> 0) || 1;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The seed used for the most recent generateUnderground() call. */
let _ugGenerationSeed = 0;

const UG_W  = 20;   // grid columns in X  (xi: 0–19)
const UG_D  = 20;   // grid columns in Z  (zi: 0–19)
const UG_H  = 31;   // grid layers in Y   (yi: 0=surface Y=0.5, 30=bedrock Y=-29.5)

// World-coordinate offsets:
//   world X  =  xi + UG_OX
//   world Z  =  zi + UG_OZ
//   world Y  =  0.5 - yi
const UG_OX = -10;
const UG_OZ = -10;

// undergroundGrid[xi][zi][yi] = { material: string, mesh: THREE.Mesh|null }  — solid block
//                             = null                                           — air (mined out)
// null before initUndergroundGrid() is called.
let undergroundGrid = null;

// ── Coordinate helpers ────────────────────────────────────────────────────────

/** Convert world (wx, wy, wz) to underground grid indices. */
function ugWorldToIndex(wx, wy, wz) {
  return {
    xi: Math.round(wx - UG_OX),
    zi: Math.round(wz - UG_OZ),
    yi: Math.round(0.5 - wy),
  };
}

/** Convert underground grid indices to world coordinates (block centres). */
function ugIndexToWorld(xi, zi, yi) {
  return { x: xi + UG_OX, y: 0.5 - yi, z: zi + UG_OZ };
}

/** Returns true if (xi, zi, yi) is within the grid bounds. */
function ugInBounds(xi, zi, yi) {
  return xi >= 0 && xi < UG_W &&
         zi >= 0 && zi < UG_D &&
         yi >= 0 && yi < UG_H;
}

// ── isExposed ─────────────────────────────────────────────────────────────────

/**
 * Returns true if the solid block at grid position (xi, zi, yi) has at least
 * one exposed face: i.e. at least one of its 6 axis-aligned neighbours is air
 * (null) or lies outside the grid boundary.
 *
 * Returns false for air cells or out-of-bounds coordinates.
 */
function isExposed(xi, zi, yi) {
  if (!ugInBounds(xi, zi, yi)) return false;
  if (undergroundGrid[xi][zi][yi] === null) return false; // air has no face to expose

  const dirs = [
    [xi + 1, zi,     yi    ],
    [xi - 1, zi,     yi    ],
    [xi,     zi + 1, yi    ],
    [xi,     zi - 1, yi    ],
    [xi,     zi,     yi + 1],
    [xi,     zi,     yi - 1],
  ];

  for (let i = 0; i < dirs.length; i++) {
    const d = dirs[i];
    // Out-of-bounds neighbour = grid boundary = always exposed on that side
    if (!ugInBounds(d[0], d[1], d[2])) return true;
    if (undergroundGrid[d[0]][d[1]][d[2]] === null) return true;
  }
  return false;
}

// ── Material colours (must match COLOR_TO_MATERIAL in config.js) ─────────────

const _UG_COLORS = {
  dirt:    0x8b4513,
  stone:   0x808080,
  bedrock: 0x404040,
  moss:    0x008000,
  gold:    0xffff00,
  crystal: 0x800080,
  ice:     0x00ffff,
  diamond: 0x1a237e,
  obsidian: 0x1a0020,
  lava:    0xff0000,
};

// ── Zone material distribution ────────────────────────────────────────────────

/**
 * Pick a material for grid position yi using a pre-seeded rng.
 * Distributions match the depth table in MINAA-384.
 */
function _ugZoneMaterial(yi, rng) {
  if (yi === 0)           return 'dirt';    // surface
  if (yi === UG_H - 1)   return 'bedrock'; // deepest layer (yi=30)

  const r = rng();

  if (yi <= 5) {
    // Shallow (Y=-0.5 to -4.5): dirt 65%, stone 30%, moss 5%
    if (r < 0.65) return 'dirt';
    if (r < 0.95) return 'stone';
    return 'moss';
  }
  if (yi <= 10) {
    // Mid-Shallow (Y=-5.5 to -9.5): stone 55%, dirt 20%, moss 15%, gold 8%, crystal 2%
    if (r < 0.55) return 'stone';
    if (r < 0.75) return 'dirt';
    if (r < 0.90) return 'moss';
    if (r < 0.98) return 'gold';
    return 'crystal';
  }
  if (yi <= 15) {
    // Mid (Y=-10.5 to -14.5): stone 60%, moss 15%, ice 10%, gold 8%, crystal 5%, diamond 2%
    if (r < 0.60) return 'stone';
    if (r < 0.75) return 'moss';
    if (r < 0.85) return 'ice';
    if (r < 0.93) return 'gold';
    if (r < 0.98) return 'crystal';
    return 'diamond';
  }
  if (yi <= 20) {
    // Mid-Deep (Y=-15.5 to -19.5): stone 45%, ice 15%, moss 10%, crystal 12%, diamond 8%, obsidian 5%, lava 5%
    if (r < 0.45) return 'stone';
    if (r < 0.60) return 'ice';
    if (r < 0.70) return 'moss';
    if (r < 0.82) return 'crystal';
    if (r < 0.90) return 'diamond';
    if (r < 0.95) return 'obsidian';
    return 'lava';
  }
  if (yi <= 25) {
    // Deep (Y=-20.5 to -24.5): stone 35%, obsidian 20%, diamond 12%, crystal 10%, lava 10%, gold 8%, ice 5%
    if (r < 0.35) return 'stone';
    if (r < 0.55) return 'obsidian';
    if (r < 0.67) return 'diamond';
    if (r < 0.77) return 'crystal';
    if (r < 0.87) return 'lava';
    if (r < 0.95) return 'gold';
    return 'ice';
  }
  // Abyss (Y=-25.5 to -29.5, yi=26-29): obsidian 30%, stone 20%, lava 15%, diamond 15%, crystal 10%, gold 5%, ice 5%
  if (r < 0.30) return 'obsidian';
  if (r < 0.50) return 'stone';
  if (r < 0.65) return 'lava';
  if (r < 0.80) return 'diamond';
  if (r < 0.90) return 'crystal';
  if (r < 0.95) return 'gold';
  return 'ice';
}

// ── Ore vein spreading ────────────────────────────────────────────────────────

/**
 * For each gold / diamond / crystal cell: 40% chance to spread its material
 * to 1–3 adjacent neighbours (skip bedrock and surface).
 */
function _spreadOreVeins(rng) {
  const ORE = ['gold', 'diamond', 'crystal'];
  const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

  for (let xi = 0; xi < UG_W; xi++) {
    for (let zi = 0; zi < UG_D; zi++) {
      for (let yi = 1; yi < UG_H - 1; yi++) {
        const cell = undergroundGrid[xi][zi][yi];
        if (!cell || ORE.indexOf(cell.material) === -1) continue;
        if (rng() >= 0.40) continue;

        const count = 1 + Math.floor(rng() * 3); // 1-3 neighbours
        // Fisher-Yates shuffle of neighbour list
        const shuffled = dirs.slice();
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(rng() * (i + 1));
          const tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
        }
        for (let k = 0; k < count; k++) {
          const d = shuffled[k];
          const nx = xi + d[0], nz = zi + d[1], ny = yi + d[2];
          if (!ugInBounds(nx, nz, ny)) continue;
          const nc = undergroundGrid[nx][nz][ny];
          if (nc && nc.material !== 'bedrock') nc.material = cell.material;
        }
      }
    }
  }
}

// ── Lava cluster spawning ─────────────────────────────────────────────────────

/**
 * For each lava seed cell, BFS-grow a connected cluster of 3–7 cells by
 * converting adjacent non-bedrock neighbours.
 */
function _spawnLavaClusters(rng) {
  const dirs = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

  for (let xi = 0; xi < UG_W; xi++) {
    for (let zi = 0; zi < UG_D; zi++) {
      for (let yi = 1; yi < UG_H - 1; yi++) {
        const cell = undergroundGrid[xi][zi][yi];
        if (!cell || cell.material !== 'lava' || cell._lvProc) continue;

        const target = 3 + Math.floor(rng() * 5); // 3-7
        const cluster = [[xi, zi, yi]];
        cell._lvProc = true;

        let head = 0;
        while (cluster.length < target && head < cluster.length) {
          const [cx, cz, cy] = cluster[head++];
          for (let d = 0; d < dirs.length && cluster.length < target; d++) {
            const nx = cx + dirs[d][0];
            const nz = cz + dirs[d][1];
            const ny = cy + dirs[d][2];
            if (!ugInBounds(nx, nz, ny)) continue;
            const nc = undergroundGrid[nx][nz][ny];
            if (!nc || nc._lvProc || nc.material === 'bedrock') continue;
            nc.material = 'lava';
            nc._lvProc = true;
            cluster.push([nx, nz, ny]);
          }
        }
      }
    }
  }

  // Remove temporary flags
  for (let xi = 0; xi < UG_W; xi++)
    for (let zi = 0; zi < UG_D; zi++)
      for (let yi = 0; yi < UG_H; yi++) {
        const c = undergroundGrid[xi][zi][yi];
        if (c) delete c._lvProc;
      }
}

// ── createExposedMesh ─────────────────────────────────────────────────────────

/**
 * Creates a Three.js block mesh for the cell at (xi, zi, yi) if it is solid
 * and exposed.  Adds the mesh to worldGroup, tags it as an underground block
 * (name='underground_block'), and stores it in cell.mesh.
 *
 * Does nothing and returns null if the cell already has a mesh, is air, is
 * out of bounds, or is not exposed.
 */
function createExposedMesh(xi, zi, yi) {
  if (!ugInBounds(xi, zi, yi)) return null;
  const cell = undergroundGrid[xi][zi][yi];
  if (!cell || cell.mesh) return null;           // air or mesh already present
  if (!isExposed(xi, zi, yi)) return null;

  const color = _UG_COLORS[cell.material] || 0x808080;
  const mesh = createBlockMesh(new THREE.Color(color));

  const wp = ugIndexToWorld(xi, zi, yi);
  mesh.position.set(wp.x, wp.y, wp.z);
  mesh.name = 'underground_block';
  mesh.userData.isUnderground = true;
  mesh.userData.ugIndex = { xi: xi, zi: zi, yi: yi };
  mesh.userData.materialType = cell.material;

  if (typeof BLOCK_TYPES !== 'undefined' && BLOCK_TYPES[cell.material]) {
    mesh.userData.miningClicks = BLOCK_TYPES[cell.material].hits;
    if (BLOCK_TYPES[cell.material].isBedrock) mesh.userData.isBedrock = true;
  }

  worldGroup.add(mesh);
  cell.mesh = mesh;
  return mesh;
}

// ── onBlockMined ──────────────────────────────────────────────────────────────

/**
 * Call this AFTER the mining code has already disposed and removed the
 * underground block's mesh from the scene (disposeBlock + worldGroup.remove).
 *
 * Updates the grid cell to null (air) and creates new meshes for any of the
 * 6 axis-aligned neighbours that become newly exposed as a result.
 */
function onBlockMined(xi, zi, yi) {
  if (!ugInBounds(xi, zi, yi)) return;
  const cell = undergroundGrid[xi][zi][yi];
  if (!cell) return; // already air

  // Mesh was already disposed externally — clear the reference.
  cell.mesh = null;
  undergroundGrid[xi][zi][yi] = null;

  // Create meshes for neighbours that are now newly exposed.
  const dirs = [
    [xi + 1, zi,     yi    ],
    [xi - 1, zi,     yi    ],
    [xi,     zi + 1, yi    ],
    [xi,     zi - 1, yi    ],
    [xi,     zi,     yi + 1],
    [xi,     zi,     yi - 1],
  ];
  for (let i = 0; i < dirs.length; i++) {
    const d = dirs[i];
    if (!ugInBounds(d[0], d[1], d[2])) continue;
    const nc = undergroundGrid[d[0]][d[1]][d[2]];
    if (!nc || nc.mesh) continue; // air or mesh already present
    if (isExposed(d[0], d[1], d[2])) {
      createExposedMesh(d[0], d[1], d[2]);
    }
  }
}

// ── onBlockPlaced ─────────────────────────────────────────────────────────────

/**
 * Call this when a Tetris block lands in an underground air cell.
 *
 * Sets the cell to solid (using existingMesh if provided, e.g. the already-
 * created 'landed_block' mesh), then disposes meshes of any of the 6
 * neighbours that become fully buried.
 *
 * If existingMesh is omitted and the cell is exposed, creates a new mesh.
 *
 * @param {number} xi
 * @param {number} zi
 * @param {number} yi
 * @param {string} material  - material name (e.g. 'stone', 'dirt')
 * @param {THREE.Mesh|null}  existingMesh  - optional pre-existing block mesh
 */
function onBlockPlaced(xi, zi, yi, material, existingMesh) {
  if (!ugInBounds(xi, zi, yi)) return;
  if (undergroundGrid[xi][zi][yi] !== null) return; // cell already occupied

  undergroundGrid[xi][zi][yi] = {
    material: material || 'stone',
    mesh: existingMesh || null,
  };

  // If no pre-existing mesh and the cell is exposed, create one now.
  if (!existingMesh && isExposed(xi, zi, yi)) {
    createExposedMesh(xi, zi, yi);
  }

  // Dispose meshes of neighbours that are now fully buried.
  const dirs = [
    [xi + 1, zi,     yi    ],
    [xi - 1, zi,     yi    ],
    [xi,     zi + 1, yi    ],
    [xi,     zi - 1, yi    ],
    [xi,     zi,     yi + 1],
    [xi,     zi,     yi - 1],
  ];
  for (let i = 0; i < dirs.length; i++) {
    const d = dirs[i];
    if (!ugInBounds(d[0], d[1], d[2])) continue;
    const nc = undergroundGrid[d[0]][d[1]][d[2]];
    if (!nc || !nc.mesh) continue;
    if (!isExposed(d[0], d[1], d[2])) {
      worldGroup.remove(nc.mesh);
      if (typeof disposeBlock === 'function') disposeBlock(nc.mesh);
      nc.mesh = null;
    }
  }
}

// ── Clear helpers ─────────────────────────────────────────────────────────────

/** Remove and dispose all underground block meshes from the scene. */
function _clearUndergroundMeshes() {
  if (!undergroundGrid) return;
  for (let xi = 0; xi < UG_W; xi++)
    for (let zi = 0; zi < UG_D; zi++)
      for (let yi = 0; yi < UG_H; yi++) {
        const cell = undergroundGrid[xi][zi][yi];
        if (cell && cell.mesh) {
          worldGroup.remove(cell.mesh);
          if (typeof disposeBlock === 'function') disposeBlock(cell.mesh);
          cell.mesh = null;
        }
      }
}

// ── initUndergroundGrid ───────────────────────────────────────────────────────

/**
 * Initialises the 20×20×31 underground grid with basic materials and creates
 * meshes only for the surface layer (yi=0).  Used for non-survival game modes.
 * Survival mode calls generateUnderground() instead.
 *
 * Call once after worldGroup is ready (i.e. during init()).
 */
function initUndergroundGrid() {
  undergroundGrid = [];
  for (let xi = 0; xi < UG_W; xi++) {
    undergroundGrid[xi] = [];
    for (let zi = 0; zi < UG_D; zi++) {
      undergroundGrid[xi][zi] = [];
      for (let yi = 0; yi < UG_H; yi++) {
        let mat;
        if (yi === 0)           mat = 'dirt';
        else if (yi === UG_H - 1) mat = 'bedrock';
        else if (yi <= 3)       mat = 'dirt';
        else                    mat = 'stone';
        undergroundGrid[xi][zi][yi] = { material: mat, mesh: null };
      }
    }
  }

  // Surface layer: yi=0 is exposed on its top boundary (air above the grid).
  for (let xi = 0; xi < UG_W; xi++)
    for (let zi = 0; zi < UG_D; zi++)
      createExposedMesh(xi, zi, 0);
}

// ── generateUnderground ───────────────────────────────────────────────────────

/**
 * Generate the full 20×20×31 underground grid with seeded, depth-appropriate
 * materials, ore-vein clustering, and lava clusters.  Creates meshes only for
 * the surface layer (yi=0, ~400 blocks) so the underground is efficient at
 * startup.
 *
 * Replaces spawnMineableSurfaceGrid() for Survival mode new-world creation.
 *
 * @param {number} [seed]  Integer seed.  Omit for a random seed.
 */
function generateUnderground(seed) {
  _clearUndergroundMeshes();

  _ugGenerationSeed = (seed !== undefined && seed !== null)
    ? (seed >>> 0)
    : (Math.floor(Math.random() * 0x7FFFFFFF) + 1);

  const rng = _ugRng(_ugGenerationSeed);

  // Allocate and fill grid with zone-appropriate materials.
  undergroundGrid = [];
  for (let xi = 0; xi < UG_W; xi++) {
    undergroundGrid[xi] = [];
    for (let zi = 0; zi < UG_D; zi++) {
      undergroundGrid[xi][zi] = [];
      for (let yi = 0; yi < UG_H; yi++) {
        undergroundGrid[xi][zi][yi] = { material: _ugZoneMaterial(yi, rng), mesh: null };
      }
    }
  }

  // Post-process: ore-vein spreading and lava clusters.
  _spreadOreVeins(rng);
  _spawnLavaClusters(rng);

  // Create meshes only for the surface layer (yi=0).
  for (let xi = 0; xi < UG_W; xi++)
    for (let zi = 0; zi < UG_D; zi++)
      createExposedMesh(xi, zi, 0);
}

// ── Underground persistence helpers ──────────────────────────────────────────

/** Returns the seed used for the current world's underground generation. */
function getUndergroundSeed() { return _ugGenerationSeed; }

/**
 * Returns a sparse array of [xi, zi, yi] triples for every cell that has been
 * mined out (set to null) since generation.  Used by saveSurvivalWorld().
 */
function saveUndergroundGridData() {
  if (!undergroundGrid) return [];
  const mined = [];
  for (let xi = 0; xi < UG_W; xi++)
    for (let zi = 0; zi < UG_D; zi++)
      for (let yi = 0; yi < UG_H; yi++)
        if (undergroundGrid[xi][zi][yi] === null)
          mined.push([xi, zi, yi]);
  return mined;
}

/**
 * Restore the underground grid from a saved seed and list of mined cells.
 * Regenerates the deterministic layout, applies excavations, then rebuilds
 * all exposed-face meshes.
 *
 * @param {number}     seed        Seed from getUndergroundSeed() at save time.
 * @param {Array}      minedCells  Array of [xi, zi, yi] triples.
 */
function restoreUndergroundGrid(seed, minedCells) {
  // Regenerate the world data (no meshes yet).
  _clearUndergroundMeshes();

  _ugGenerationSeed = seed >>> 0;
  const rng = _ugRng(_ugGenerationSeed);

  undergroundGrid = [];
  for (let xi = 0; xi < UG_W; xi++) {
    undergroundGrid[xi] = [];
    for (let zi = 0; zi < UG_D; zi++) {
      undergroundGrid[xi][zi] = [];
      for (let yi = 0; yi < UG_H; yi++) {
        undergroundGrid[xi][zi][yi] = { material: _ugZoneMaterial(yi, rng), mesh: null };
      }
    }
  }
  _spreadOreVeins(rng);
  _spawnLavaClusters(rng);

  // Apply mined-out cells.
  if (Array.isArray(minedCells)) {
    for (let k = 0; k < minedCells.length; k++) {
      const m = minedCells[k];
      if (ugInBounds(m[0], m[1], m[2])) {
        undergroundGrid[m[0]][m[1]][m[2]] = null;
      }
    }
  }

  // Rebuild meshes for all currently-exposed cells.
  for (let xi = 0; xi < UG_W; xi++)
    for (let zi = 0; zi < UG_D; zi++)
      for (let yi = 0; yi < UG_H; yi++)
        if (isExposed(xi, zi, yi)) createExposedMesh(xi, zi, yi);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/** Returns the current total number of underground block meshes in the scene. */
function ugMeshCount() {
  if (!undergroundGrid) return 0;
  let count = 0;
  for (let xi = 0; xi < UG_W; xi++) {
    for (let zi = 0; zi < UG_D; zi++) {
      for (let yi = 0; yi < UG_H; yi++) {
        const cell = undergroundGrid[xi][zi][yi];
        if (cell && cell.mesh) count++;
      }
    }
  }
  return count;
}
