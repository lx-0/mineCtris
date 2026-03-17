// Editor mode — block palette, paint tools, ghost preview, draft autosave.
// Requires: state.js, config.js, world.js, mining.js (targetedBlock, targetedFaceNormal, groundPlacementPoint)

// ── Draft autosave ────────────────────────────────────────────────────────────

const EDITOR_DRAFT_KEY = "mineCtris_editorDraft";
const EDITOR_AUTOSAVE_INTERVAL = 5; // seconds

let _editorAutosaveTimer = 0;
// Set by main.js before pointer lock to carry a loaded draft into initEditorMode.
let _pendingEditorDraft = null;

// ── Win condition state ───────────────────────────────────────────────────────
// mode: "mine_all" | "clear_lines" | "survive_seconds" | "score_points"
// n:    numeric target (unused for mine_all)
let editorWinCondition = { mode: "mine_all", n: 10 };

// ── Puzzle metadata state ─────────────────────────────────────────────────────
let editorPuzzleMetadata = { name: "", description: "", author: "", difficulty: 0 };

/** Serialize current editor world (all landed_block children) to localStorage. */
function saveEditorDraft() {
  try {
    const blocks = [];
    worldGroup.children.forEach(function (child) {
      if (child.name === "landed_block") {
        const wp = new THREE.Vector3();
        child.getWorldPosition(wp);
        blocks.push({ x: wp.x, y: wp.y, z: wp.z, color: child.userData.canonicalColor });
      }
    });
    const draft = {
      blocks: blocks,
      selectedIdx: editorSelectedIdx,
      winCondition: { mode: editorWinCondition.mode, n: editorWinCondition.n },
      metadata: {
        name: editorPuzzleMetadata.name,
        description: editorPuzzleMetadata.description,
        author: editorPuzzleMetadata.author,
        difficulty: editorPuzzleMetadata.difficulty,
      },
      savedAt: Date.now(),
    };
    localStorage.setItem(EDITOR_DRAFT_KEY, JSON.stringify(draft));
  } catch (_) {}
}

/** Return the parsed draft object from localStorage, or null if none / invalid. */
function loadEditorDraft() {
  try {
    const raw = localStorage.getItem(EDITOR_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

/** Remove the saved draft from localStorage. */
function clearEditorDraft() {
  try { localStorage.removeItem(EDITOR_DRAFT_KEY); } catch (_) {}
}

/** Place blocks from a draft object into the current editor world. */
function applyEditorDraft(draft) {
  if (!draft || !Array.isArray(draft.blocks)) return;
  draft.blocks.forEach(function (b) {
    const block = createBlockMesh(new THREE.Color(b.color));
    block.name = "landed_block";
    block.position.set(b.x, b.y, b.z);
    worldGroup.add(block);
    registerBlock(block);
  });
  if (typeof draft.selectedIdx === "number") {
    selectEditorBlock(draft.selectedIdx);
  }
  if (draft.winCondition && draft.winCondition.mode) {
    editorWinCondition = { mode: draft.winCondition.mode, n: draft.winCondition.n || 10 };
    renderWinConditionBuilder();
  }
  if (draft.metadata) {
    editorPuzzleMetadata = {
      name:        (draft.metadata.name        || "").slice(0, 40),
      description: (draft.metadata.description || "").slice(0, 120),
      author:      (draft.metadata.author      || "").slice(0, 20),
      difficulty:  draft.metadata.difficulty   || 0,
    };
    renderMetadataPanel();
  }
}

/** Advance the autosave timer; call each frame while in editor mode with delta seconds. */
function tickEditorAutosave(delta) {
  _editorAutosaveTimer += delta;
  if (_editorAutosaveTimer >= EDITOR_AUTOSAVE_INTERVAL) {
    _editorAutosaveTimer = 0;
    saveEditorDraft();
  }
}

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

// ── Win condition builder ─────────────────────────────────────────────────────

/** Get the player-facing preview text for the current win condition. */
function getWinConditionPreviewText() {
  const mode = editorWinCondition.mode;
  const n = editorWinCondition.n;
  if (mode === "mine_all") {
    let blockCount = 0;
    if (typeof worldGroup !== "undefined") {
      worldGroup.children.forEach(function (c) {
        if (c.name === "landed_block") blockCount++;
      });
    }
    return "Mine all " + blockCount + " block" + (blockCount === 1 ? "" : "s") + "!";
  }
  if (mode === "clear_lines") return "Clear " + n + " line" + (n === 1 ? "" : "s") + "!";
  if (mode === "survive_seconds") return "Survive " + n + " second" + (n === 1 ? "" : "s") + "!";
  if (mode === "score_points") return "Score " + n.toLocaleString() + " points!";
  return "";
}

/** Build / refresh the win condition builder panel inside #editor-win-condition. */
function renderWinConditionBuilder() {
  const container = document.getElementById("editor-win-condition");
  if (!container) return;

  const mode = editorWinCondition.mode;
  const n = editorWinCondition.n;
  const needsN = mode !== "mine_all";

  container.innerHTML =
    '<div class="editor-wc-label">WIN CONDITION</div>' +
    '<div class="editor-wc-row">' +
      '<select id="editor-wc-mode" class="editor-wc-select">' +
        '<option value="mine_all"' + (mode === "mine_all" ? " selected" : "") + '>Mine All Blocks</option>' +
        '<option value="clear_lines"' + (mode === "clear_lines" ? " selected" : "") + '>Clear N Lines</option>' +
        '<option value="survive_seconds"' + (mode === "survive_seconds" ? " selected" : "") + '>Survive N Secs</option>' +
        '<option value="score_points"' + (mode === "score_points" ? " selected" : "") + '>Score N Points</option>' +
      '</select>' +
      '<input type="number" id="editor-wc-n" class="editor-wc-n" min="1" max="9999" value="' + n + '"' +
        (needsN ? "" : ' style="display:none"') + '>' +
    '</div>' +
    '<div id="editor-wc-preview" class="editor-wc-preview">' + getWinConditionPreviewText() + '</div>';

  var modeSelect = document.getElementById("editor-wc-mode");
  if (modeSelect) {
    modeSelect.addEventListener("change", function () {
      editorWinCondition.mode = this.value;
      var nInput = document.getElementById("editor-wc-n");
      if (nInput) nInput.style.display = editorWinCondition.mode === "mine_all" ? "none" : "";
      var previewEl = document.getElementById("editor-wc-preview");
      if (previewEl) previewEl.textContent = getWinConditionPreviewText();
    });
  }

  var nInput = document.getElementById("editor-wc-n");
  if (nInput) {
    nInput.addEventListener("input", function () {
      var val = parseInt(this.value, 10);
      if (!isNaN(val) && val >= 1 && val <= 9999) {
        editorWinCondition.n = val;
        var previewEl = document.getElementById("editor-wc-preview");
        if (previewEl) previewEl.textContent = getWinConditionPreviewText();
      }
    });
  }
}

// ── Metadata panel ────────────────────────────────────────────────────────────

/** Build / refresh the puzzle metadata panel inside #editor-metadata. */
function renderMetadataPanel() {
  var container = document.getElementById("editor-metadata");
  if (!container) return;

  var m = editorPuzzleMetadata;

  container.innerHTML =
    '<div class="editor-meta-label">PUZZLE INFO</div>' +
    '<div class="editor-meta-row">' +
      '<label class="editor-meta-field-label">Name <span class="editor-meta-required">*</span></label>' +
      '<div class="editor-meta-field-wrap">' +
        '<input id="editor-meta-name" class="editor-meta-input" type="text" maxlength="40" ' +
               'placeholder="Puzzle name…" value="' + _escAttr(m.name) + '">' +
        '<span class="editor-meta-counter" id="editor-meta-name-count">' + m.name.length + '/40</span>' +
      '</div>' +
    '</div>' +
    '<div class="editor-meta-row">' +
      '<label class="editor-meta-field-label">Desc</label>' +
      '<div class="editor-meta-field-wrap">' +
        '<input id="editor-meta-desc" class="editor-meta-input editor-meta-input-wide" type="text" maxlength="120" ' +
               'placeholder="Short description…" value="' + _escAttr(m.description) + '">' +
        '<span class="editor-meta-counter" id="editor-meta-desc-count">' + m.description.length + '/120</span>' +
      '</div>' +
    '</div>' +
    '<div class="editor-meta-row">' +
      '<label class="editor-meta-field-label">Author</label>' +
      '<div class="editor-meta-field-wrap">' +
        '<input id="editor-meta-author" class="editor-meta-input" type="text" maxlength="20" ' +
               'placeholder="Your name…" value="' + _escAttr(m.author) + '">' +
        '<span class="editor-meta-counter" id="editor-meta-author-count">' + m.author.length + '/20</span>' +
      '</div>' +
    '</div>' +
    '<div class="editor-meta-row">' +
      '<label class="editor-meta-field-label">Diff</label>' +
      '<div class="editor-meta-stars" id="editor-meta-stars">' +
        _buildStarButtons(m.difficulty) +
      '</div>' +
    '</div>';

  // Wire up name input
  var nameInput = document.getElementById("editor-meta-name");
  if (nameInput) {
    nameInput.addEventListener("input", function () {
      editorPuzzleMetadata.name = this.value.slice(0, 40);
      var c = document.getElementById("editor-meta-name-count");
      if (c) c.textContent = editorPuzzleMetadata.name.length + "/40";
      _updateShareBtnState();
    });
  }

  // Wire up description input
  var descInput = document.getElementById("editor-meta-desc");
  if (descInput) {
    descInput.addEventListener("input", function () {
      editorPuzzleMetadata.description = this.value.slice(0, 120);
      var c = document.getElementById("editor-meta-desc-count");
      if (c) c.textContent = editorPuzzleMetadata.description.length + "/120";
    });
  }

  // Wire up author input
  var authorInput = document.getElementById("editor-meta-author");
  if (authorInput) {
    authorInput.addEventListener("input", function () {
      editorPuzzleMetadata.author = this.value.slice(0, 20);
      var c = document.getElementById("editor-meta-author-count");
      if (c) c.textContent = editorPuzzleMetadata.author.length + "/20";
    });
  }

  // Wire up star buttons
  _wireStarButtons();
  _updateShareBtnState();
}

function _buildStarButtons(selected) {
  var out = "";
  for (var i = 1; i <= 3; i++) {
    out += '<button class="editor-meta-star' + (i <= selected ? " editor-meta-star-on" : "") +
           '" data-star="' + i + '" type="button">' +
           (i <= selected ? "★" : "☆") + '</button>';
  }
  return out;
}

function _wireStarButtons() {
  var container = document.getElementById("editor-meta-stars");
  if (!container) return;
  container.querySelectorAll(".editor-meta-star").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var val = parseInt(this.getAttribute("data-star"), 10);
      // Clicking the already-selected star deselects (sets to 0)
      editorPuzzleMetadata.difficulty = (editorPuzzleMetadata.difficulty === val) ? 0 : val;
      var starsEl = document.getElementById("editor-meta-stars");
      if (starsEl) starsEl.innerHTML = _buildStarButtons(editorPuzzleMetadata.difficulty);
      _wireStarButtons();
    });
  });
}

/** Escape a string for use in an HTML attribute value. */
function _escAttr(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Enable or disable share button based on whether puzzle name is filled in. */
function _updateShareBtnState() {
  var shareBtn = document.getElementById("editor-share-btn");
  if (!shareBtn) return;
  var hasName = editorPuzzleMetadata.name.trim().length > 0;
  shareBtn.disabled = !hasName;
  shareBtn.title = hasName ? "" : "Enter a puzzle name to share";
  shareBtn.style.opacity = hasName ? "" : "0.45";
}

/** Encode current editor layout + win condition into a compact URL-safe share code. */
function encodePuzzleShareCode() {
  if (typeof puzzleCodecEncode !== "function") return null;
  var blocks = [];
  if (typeof worldGroup !== "undefined") {
    worldGroup.children.forEach(function (child) {
      if (child.name === "landed_block") {
        var wp = new THREE.Vector3();
        child.getWorldPosition(wp);
        var hexInt = 0;
        if (child.material && child.material.color) {
          hexInt = child.material.color.getHex();
        }
        var paletteIdx = 0;
        for (var i = 0; i < EDITOR_PALETTE.length; i++) {
          if (EDITOR_PALETTE[i].hex === hexInt) { paletteIdx = i; break; }
        }
        blocks.push([Math.round(wp.x), Math.round(wp.y * 10) / 10, Math.round(wp.z), paletteIdx]);
      }
    });
  }
  return puzzleCodecEncode({
    winCondition: { mode: editorWinCondition.mode, n: editorWinCondition.n },
    blocks: blocks,
    metadata: {
      name:        editorPuzzleMetadata.name,
      description: editorPuzzleMetadata.description,
      author:      editorPuzzleMetadata.author,
      difficulty:  editorPuzzleMetadata.difficulty,
    },
  });
}

/**
 * Decode a share code. Returns { winCondition, blocks, metadata } or null if invalid.
 * For richer error info (version mismatch vs. corrupted), use puzzleCodecDecode() directly.
 */
function decodePuzzleShareCode(code) {
  if (typeof puzzleCodecDecode !== "function") return null;
  var result = puzzleCodecDecode(code);
  if (!result.ok) return null;
  return { winCondition: result.winCondition, blocks: result.blocks, metadata: result.metadata };
}

// ── Init / cleanup ────────────────────────────────────────────────────────────

/** Call when entering editor mode. */
function initEditorMode() {
  editorSelectedIdx = 0;
  _editorAutosaveTimer = 0;
  editorPuzzleMetadata = { name: "", description: "", author: "", difficulty: 0 };
  if (!editorGhostMesh) {
    editorGhostMesh = _createEditorGhost();
  } else {
    editorGhostMesh.visible = false;
    editorGhostMesh.material.color.setHex(EDITOR_PALETTE[editorSelectedIdx].hex);
  }
  renderEditorPaletteHUD();
  renderWinConditionBuilder();
  renderMetadataPanel();

  // Apply loaded draft if one was queued by the draft prompt
  if (_pendingEditorDraft) {
    applyEditorDraft(_pendingEditorDraft);
    _pendingEditorDraft = null;
  }
}

/** Call when leaving editor mode (reset / exit). */
function cleanupEditorMode() {
  // Final autosave before the world is cleared by resetGame
  saveEditorDraft();
  if (editorGhostMesh) {
    editorGhostMesh.visible = false;
  }
  const container = document.getElementById("editor-palette");
  if (container) container.innerHTML = "";
}
