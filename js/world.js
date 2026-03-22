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
  // Register hazard block tracking (Crumble/Magma/Void)
  if (typeof registerHazardBlock === 'function') registerHazardBlock(block);
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

  // Unregister hazard block tracking
  if (typeof unregisterHazardBlock === 'function') unregisterHazardBlock(block);

  block.userData.gridPos = null;
}

/** Create a single block mesh with edge overlay. */
function createBlockMesh(color) {
  const geometry = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  addFaceBrightnessColors(geometry);
  const edges = new THREE.EdgesGeometry(geometry);
  const _activeBiome = (typeof activeBiomeId !== 'undefined') ? activeBiomeId : null;
  const _borderColor = (_activeBiome && BIOME_BORDER_COLORS[_activeBiome]) ? BIOME_BORDER_COLORS[_activeBiome] : 0x000000;
  const lineMaterial = new THREE.LineBasicMaterial({
    color: _borderColor,
    linewidth: 2,
  });
  const edgesMesh = new THREE.LineSegments(edges, lineMaterial);

  // Resolve the canonical game color (always the standard palette hex).
  const canonicalHex = (color instanceof THREE.Color) ? color.getHex() : new THREE.Color(color).getHex();

  // Choose material: colorblind-safe takes priority, then block skin, then theme, then standard.
  let material;
  let _skinOverrides = null; // block skin material overrides (if any)
  if (colorblindMode) {
    const cbIdx = COLOR_TO_INDEX[canonicalHex];
    if (cbIdx !== undefined && COLORBLIND_COLORS[cbIdx] !== null) {
      material = createBlockMaterialColorblind(COLORBLIND_COLORS[cbIdx], COLORBLIND_PATTERNS[cbIdx]);
    } else {
      material = createBlockMaterial(color);
    }
  } else if (activeBlockSkin && BLOCK_SKIN_PALETTES[activeBlockSkin]) {
    // Block skin overrides both theme and default colors.
    const skinDef = BLOCK_SKIN_PALETTES[activeBlockSkin];
    const sIdx = COLOR_TO_INDEX[canonicalHex];
    if (sIdx !== undefined && skinDef.colors[sIdx] !== null) {
      material = createBlockMaterial(skinDef.colors[sIdx]);
    } else {
      material = createBlockMaterial(color);
    }
    _skinOverrides = skinDef.material;
    // Override edge color for this skin
    if (skinDef.edgeColor !== undefined) {
      lineMaterial.color.setHex(skinDef.edgeColor);
    }
  } else if (activeTheme !== "classic") {
    const THEME_PALETTE = {
      nether: NETHER_COLORS, ocean: OCEAN_COLORS, candy: CANDY_COLORS,
      fossil: FOSSIL_COLORS, storm: STORM_COLORS, void: VOID_COLORS,
      legendary: LEGENDARY_COLORS,
      biome_stone: BIOME_STONE_COLORS, biome_forest: BIOME_FOREST_COLORS,
      biome_nether: NETHER_COLORS, biome_ice: BIOME_ICE_COLORS,
      cosmetic_carved_stone_board: COSMETIC_CARVED_STONE_COLORS,
      cosmetic_ore_vein_theme:     COSMETIC_ORE_VEIN_COLORS,
      cosmetic_mossy_overgrown_board: COSMETIC_MOSSY_OVERGROWN_COLORS,
      cosmetic_leaf_block_theme:   COSMETIC_LEAF_BLOCK_COLORS,
      cosmetic_obsidian_forge_board: COSMETIC_OBSIDIAN_FORGE_COLORS,
      cosmetic_magma_theme:        COSMETIC_MAGMA_COLORS,
      cosmetic_frozen_tundra_board: COSMETIC_FROZEN_TUNDRA_COLORS,
      cosmetic_crystal_theme:      COSMETIC_CRYSTAL_COLORS,
    };
    const palette = THEME_PALETTE[activeTheme];
    const tIdx = palette ? COLOR_TO_INDEX[canonicalHex] : undefined;
    if (palette && tIdx !== undefined && palette[tIdx] !== null) {
      material = createBlockMaterial(palette[tIdx]);
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
    // Magma hazard: orange emissive glow
    if (BLOCK_TYPES[materialName].effect === "magma_glow" && !colorblindMode) {
      const magmaEmissive = new THREE.Color(0x441100);
      cube.material.emissive = magmaEmissive;
      cube.material.needsUpdate = true;
      cube.userData.defaultEmissive = magmaEmissive.clone();
    }
    // Void hazard: deep purple emissive shimmer
    if (materialName === "void_block" && !colorblindMode) {
      const voidEmissive = new THREE.Color(0x150025);
      cube.material.emissive = voidEmissive;
      cube.material.emissiveIntensity = 1.5;
      cube.material.needsUpdate = true;
      cube.userData.defaultEmissive = voidEmissive.clone();
    }
    // Tag hazard properties
    if (BLOCK_TYPES[materialName].isHazard) {
      cube.userData.isHazard = true;
      cube.userData.hazardType = BLOCK_TYPES[materialName].hazardType;
      if (materialName === 'void_block') cube.userData.isVoid = true;
    }
  }

  // Apply block skin material overrides (emissive, roughness, metalness).
  if (_skinOverrides) {
    if (_skinOverrides.roughness !== undefined) cube.material.roughness = _skinOverrides.roughness;
    if (_skinOverrides.metalness !== undefined) cube.material.metalness = _skinOverrides.metalness;
    if (_skinOverrides.emissive !== undefined) {
      // For neon skin, use the block's own color as emissive for per-block glow.
      const useOwnColor = (activeBlockSkin === 'neon');
      const skinEmissive = useOwnColor
        ? cube.material.color.clone().multiplyScalar(0.4)
        : new THREE.Color(_skinOverrides.emissive);
      const intensity = _skinOverrides.emissiveIntensity || 1.0;
      cube.material.emissive = skinEmissive;
      cube.material.emissiveIntensity = intensity;
      cube.material.needsUpdate = true;
      cube.userData.defaultEmissive = skinEmissive.clone();
    }
  }

  return cube;
}
