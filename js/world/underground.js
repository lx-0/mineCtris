// Underground exposed-face block rendering engine.
// Manages a 20×20×31 voxel grid (undergroundGrid[x][z][y]) for the underground play space.
// Only blocks with at least one exposed face (neighbor is air or boundary) carry a mesh,
// keeping peak mesh count well below 2,400.
//
// Requires (loaded before this file):
//   config.js  — BLOCK_SIZE, BLOCK_TYPES
//   world.js   — createBlockMesh(), disposeBlock()
//   state.js   — worldGroup

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

// ── Material assignment ───────────────────────────────────────────────────────

const _UG_COLORS = {
  dirt:    0x8b4513,
  stone:   0x808080,
  bedrock: 0x404040,
};

function _ugMaterial(xi, zi, yi) {
  if (yi === UG_H - 1) return 'bedrock'; // deepest layer
  if (yi <= 3)         return 'dirt';
  return 'stone';
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

// ── initUndergroundGrid ───────────────────────────────────────────────────────

/**
 * Initialises the 20×20×31 underground grid with solid blocks and creates
 * meshes only for the surface layer (yi=0, world Y=0.5), which is exposed
 * on its top face (boundary above the grid).
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
        undergroundGrid[xi][zi][yi] = { material: _ugMaterial(xi, zi, yi), mesh: null };
      }
    }
  }

  // Surface layer: yi=0 is exposed on its top boundary (air above the grid).
  for (let xi = 0; xi < UG_W; xi++) {
    for (let zi = 0; zi < UG_D; zi++) {
      createExposedMesh(xi, zi, 0);
    }
  }
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
