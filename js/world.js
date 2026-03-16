// World helpers — grid occupancy tracking and block mesh creation.
// Requires: state.js (gridOccupancy), config.js (BLOCK_SIZE)

function snapGrid(v) {
  return Math.round(v);
}

/** Snap a Y value to the world block grid: 0.5, 1.5, 2.5, … */
function snapGridY(v) {
  return Math.floor(v) + 0.5;
}

/** Register a landed block in the grid occupancy map. */
function registerBlock(block) {
  const wp = new THREE.Vector3();
  block.getWorldPosition(wp);
  const gx = snapGrid(wp.x);
  const gy = snapGridY(wp.y);
  const gz = snapGrid(wp.z);
  block.userData.gridPos = { x: gx, y: gy, z: gz };
  if (!gridOccupancy.has(gy)) gridOccupancy.set(gy, new Set());
  gridOccupancy.get(gy).add(gx + "," + gz);

  const mat = block.userData.materialType;
  if (mat === 'lava' || mat === 'gold' || mat === 'ice') {
    registerAuraEmitter(gx, gy, gz, mat);
  }
}

/** Remove a block from the grid occupancy map (mining or line-clear). */
function unregisterBlock(block) {
  const gp = block.userData.gridPos;
  if (!gp) return;
  const layer = gridOccupancy.get(gp.y);
  if (layer) {
    layer.delete(gp.x + "," + gp.z);
    if (!layer.size) gridOccupancy.delete(gp.y);
  }

  const mat = block.userData.materialType;
  if (mat === 'lava' || mat === 'gold' || mat === 'ice') {
    removeAuraEmitter(gp.x, gp.y, gp.z);
  }

  block.userData.gridPos = null;
}

/** Create a single block mesh with edge overlay. */
function createBlockMesh(color) {
  const geometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  addFaceBrightnessColors(geometry);
  const edges = new THREE.EdgesGeometry(geometry);
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0x000000,
    linewidth: 2,
  });
  const edgesMesh = new THREE.LineSegments(edges, lineMaterial);

  // Resolve the canonical game color (always the standard palette hex).
  const canonicalHex = (color instanceof THREE.Color) ? color.getHex() : new THREE.Color(color).getHex();

  // Choose material: colorblind-safe takes priority, then theme, then standard.
  let material;
  if (colorblindMode) {
    const cbIdx = COLOR_TO_INDEX[canonicalHex];
    if (cbIdx !== undefined && COLORBLIND_COLORS[cbIdx] !== null) {
      material = createBlockMaterialColorblind(COLORBLIND_COLORS[cbIdx], COLORBLIND_PATTERNS[cbIdx]);
    } else {
      material = createBlockMaterial(color);
    }
  } else if (activeTheme === "nether") {
    const nIdx = COLOR_TO_INDEX[canonicalHex];
    if (nIdx !== undefined && NETHER_COLORS[nIdx] !== null) {
      material = createBlockMaterial(NETHER_COLORS[nIdx]);
    } else {
      material = createBlockMaterial(color);
    }
  } else {
    material = createBlockMaterial(color);
  }

  const cube = new THREE.Mesh(geometry, material);
  cube.add(edgesMesh);
  cube.userData.isBlock = true;
  // originalColor tracks the current display color (used by mining.js damage tinting).
  cube.userData.originalColor = material.color.clone();
  // canonicalColor always holds the standard palette hex for save/restore and mode-switching.
  cube.userData.canonicalColor = canonicalHex;

  // Tag with material type and per-material properties (keyed on canonical color).
  const materialName = COLOR_TO_MATERIAL[canonicalHex];
  if (materialName) {
    cube.userData.materialType = materialName;
    cube.userData.miningClicks = BLOCK_TYPES[materialName].hits;
    if (BLOCK_TYPES[materialName].effect === "lava_glow" && !colorblindMode) {
      const lavaEmissive = new THREE.Color(0x220800);
      cube.material.emissive = lavaEmissive;
      cube.material.needsUpdate = true;
      cube.userData.defaultEmissive = lavaEmissive.clone();
    }
  }

  return cube;
}
