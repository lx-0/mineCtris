// Editor mode — block palette, paint tools, ghost preview.
// Requires: state.js, config.js, world.js, mining.js (targetedBlock, targetedFaceNormal, groundPlacementPoint)

// ── Palette definition ────────────────────────────────────────────────────────
// 9 block types mapped to keys 1–9, each with canonical hex color (matching COLORS/COLOR_TO_MATERIAL).
const EDITOR_PALETTE = [
  { name: "Dirt",     hex: 0x8b4513 },
  { name: "Stone",    hex: 0x808080 },
  { name: "Gold",     hex: 0xffff00 },
  { name: "Ice",      hex: 0x00ffff },
  { name: "Moss",     hex: 0x008000 },
  { name: "Lava",     hex: 0xff0000 },
  { name: "Crystal",  hex: 0x800080 },
  { name: "Diamond",  hex: 0x1a237e },
  { name: "Obsidian", hex: 0x1a0020 },
];

let editorSelectedIdx = 0;
let editorGhostMesh = null;

// ── Ghost block ───────────────────────────────────────────────────────────────

function _createEditorGhost() {
  const geo = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
  const mat = new THREE.MeshBasicMaterial({
    color: EDITOR_PALETTE[editorSelectedIdx].hex,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "editor_ghost";
  mesh.visible = false;
  scene.add(mesh);
  return mesh;
}

function _getGhostPlacementPos() {
  if (targetedBlock && targetedFaceNormal) {
    const blockPos = new THREE.Vector3();
    targetedBlock.getWorldPosition(blockPos);
    return {
      x: snapGrid(blockPos.x + targetedFaceNormal.x * BLOCK_SIZE),
      y: snapGridY(blockPos.y + targetedFaceNormal.y * BLOCK_SIZE),
      z: snapGrid(blockPos.z + targetedFaceNormal.z * BLOCK_SIZE),
    };
  } else if (groundPlacementPoint) {
    return {
      x: snapGrid(groundPlacementPoint.x),
      y: 0.5,
      z: snapGrid(groundPlacementPoint.z),
    };
  }
  return null;
}

function _isValidPlacementPos(px, py, pz) {
  if (py < 0.5) return false;
  const layer = gridOccupancy.get(py);
  if (layer && layer.has(px + "," + pz)) return false;
  if (controls) {
    const pp = controls.getObject().position;
    if (
      Math.abs(px - pp.x) < PLAYER_RADIUS + 0.5 &&
      Math.abs(pz - pp.z) < PLAYER_RADIUS + 0.5 &&
      Math.abs(py - pp.y) < PLAYER_HEIGHT / 2 + 0.5
    ) return false;
  }
  return true;
}

/** Call each animation frame while in editor mode to update ghost position and color. */
function updateEditorGhost() {
  if (!editorGhostMesh) return;
  const pos = _getGhostPlacementPos();
  if (pos && _isValidPlacementPos(pos.x, pos.y, pos.z)) {
    editorGhostMesh.position.set(pos.x, pos.y, pos.z);
    editorGhostMesh.material.color.setHex(EDITOR_PALETTE[editorSelectedIdx].hex);
    editorGhostMesh.visible = true;
  } else {
    editorGhostMesh.visible = false;
  }
}

// ── Block palette actions ─────────────────────────────────────────────────────

/** Select a palette entry by 0-based index. */
function selectEditorBlock(idx) {
  if (idx < 0 || idx >= EDITOR_PALETTE.length) return;
  editorSelectedIdx = idx;
  if (editorGhostMesh) {
    editorGhostMesh.material.color.setHex(EDITOR_PALETTE[editorSelectedIdx].hex);
  }
  renderEditorPaletteHUD();
}

/** Place the selected palette block at the current ghost position (free — no inventory cost). */
function editorPlaceBlock() {
  const pos = _getGhostPlacementPos();
  if (!pos) return;
  if (!_isValidPlacementPos(pos.x, pos.y, pos.z)) return;

  const entry = EDITOR_PALETTE[editorSelectedIdx];
  const block = createBlockMesh(new THREE.Color(entry.hex));
  block.name = "landed_block";
  block.position.set(pos.x, pos.y, pos.z);
  worldGroup.add(block);
  registerBlock(block);

  if (typeof playPlaceSound === "function") playPlaceSound();
}

/** Instantly remove the targeted block (no mining animation). */
function editorEraseBlock() {
  if (!targetedBlock) return;
  unregisterBlock(targetedBlock);
  worldGroup.remove(targetedBlock);
  // Also remove from obsidian shimmer list if present
  if (typeof obsidianBlocks !== "undefined") {
    const idx = obsidianBlocks.indexOf(targetedBlock);
    if (idx !== -1) obsidianBlocks.splice(idx, 1);
  }
  // Reset targeting so the stale reference isn't held
  targetedBlock = null;
  if (typeof unhighlightTarget === "function") unhighlightTarget();
}

// ── Palette HUD ───────────────────────────────────────────────────────────────

/** Build / refresh the palette HUD strip. */
function renderEditorPaletteHUD() {
  const container = document.getElementById("editor-palette");
  if (!container) return;
  container.innerHTML = "";
  EDITOR_PALETTE.forEach(function (entry, i) {
    const slot = document.createElement("div");
    slot.className = "editor-palette-slot" + (i === editorSelectedIdx ? " editor-palette-selected" : "");
    slot.title = entry.name;

    const swatch = document.createElement("div");
    swatch.className = "editor-palette-swatch";
    swatch.style.background = "#" + entry.hex.toString(16).padStart(6, "0");

    const label = document.createElement("div");
    label.className = "editor-palette-key";
    label.textContent = String(i + 1);

    const name = document.createElement("div");
    name.className = "editor-palette-name";
    name.textContent = entry.name;

    slot.appendChild(swatch);
    slot.appendChild(label);
    slot.appendChild(name);
    container.appendChild(slot);
  });
}

// ── Init / cleanup ────────────────────────────────────────────────────────────

/** Call when entering editor mode. */
function initEditorMode() {
  editorSelectedIdx = 0;
  if (!editorGhostMesh) {
    editorGhostMesh = _createEditorGhost();
  } else {
    editorGhostMesh.visible = false;
    editorGhostMesh.material.color.setHex(EDITOR_PALETTE[editorSelectedIdx].hex);
  }
  renderEditorPaletteHUD();
}

/** Call when leaving editor mode (reset / exit). */
function cleanupEditorMode() {
  if (editorGhostMesh) {
    editorGhostMesh.visible = false;
  }
  const container = document.getElementById("editor-palette");
  if (container) container.innerHTML = "";
}
