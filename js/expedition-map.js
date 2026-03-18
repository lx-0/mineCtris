// Expedition Map — world map UI for per-season biome exploration.
// Depends on: leaderboard.js (LEADERBOARD_WORKER_URL, loadDisplayName),
//             season.js (getSeasonConfig)

// ── Storage ───────────────────────────────────────────────────────────────────

const _EXP_MAP_KEY = 'mineCtris_expeditionMap';

function _saveLocalMap(map) {
  try { localStorage.setItem(_EXP_MAP_KEY, JSON.stringify(map)); } catch (_) {}
}

function _loadLocalMap() {
  try { return JSON.parse(localStorage.getItem(_EXP_MAP_KEY) || 'null'); } catch (_) { return null; }
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function _apiGetMap(userId, seasonId) {
  const params = new URLSearchParams({ userId });
  if (seasonId) params.set('seasonId', seasonId);
  const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/expedition/map?' + params);
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.map || null;
}

async function _apiGenerateMap(userId, seasonId) {
  const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/expedition/map', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, seasonId: seasonId || null }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.map || null;
}

async function _apiRecordScore(userId, seasonId, nodeId, score) {
  const resp = await fetch(LEADERBOARD_WORKER_URL + '/api/expedition/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, seasonId: seasonId || null, nodeId, score }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return data.map || null;
}

// ── Map state ─────────────────────────────────────────────────────────────────

let _expMap = null;
let _expSelectedNodeId = 0;

function _getSeasonId() {
  const s = (typeof getSeasonConfig === 'function') ? getSeasonConfig() : null;
  return s ? s.seasonId : null;
}

function _getUserId() {
  return (typeof loadDisplayName === 'function') ? (loadDisplayName() || 'guest') : 'guest';
}

/**
 * Load or generate the expedition map. Uses local cache first, syncs with server.
 */
async function loadExpeditionMap() {
  const userId = _getUserId();
  const seasonId = _getSeasonId();

  // Check local cache — valid if seasonId matches
  const cached = _loadLocalMap();
  if (cached && cached.seasonId === (seasonId || 'default') && cached.userId === userId) {
    _expMap = cached;
    return _expMap;
  }

  // Fetch from server — generate if missing
  let map = await _apiGetMap(userId, seasonId);
  if (!map) {
    map = await _apiGenerateMap(userId, seasonId);
  }
  if (map) {
    _expMap = map;
    _saveLocalMap(map);
  }
  return _expMap;
}

/**
 * Record a score for a biome node and refresh the local map.
 * @param {number} nodeId
 * @param {number} score
 */
async function recordExpeditionScore(nodeId, score) {
  const userId = _getUserId();
  const seasonId = _getSeasonId();
  const updated = await _apiRecordScore(userId, seasonId, nodeId, score);
  if (updated) {
    _expMap = updated;
    _saveLocalMap(updated);
    // If the overlay is open, re-render
    const overlay = document.getElementById('expedition-map-overlay');
    if (overlay && overlay.style.display !== 'none') {
      _renderExpeditionMap(_expMap);
    }
  }
  return updated;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

const _BIOME_ICONS = {
  stone:  '&#9935;',   // ⛏
  forest: '&#127795;', // 🌳
  nether: '&#128293;', // 🔥
  ice:    '&#10052;',  // ❄
};

const _BIOME_COLORS = {
  stone:  { bg: '#374151', border: '#9ca3af', glow: '#9ca3af33' },
  forest: { bg: '#065f46', border: '#34d399', glow: '#34d39933' },
  nether: { bg: '#7f1d1d', border: '#f97316', glow: '#f9731633' },
  ice:    { bg: '#0c4a6e', border: '#60a5fa', glow: '#60a5fa33' },
};

function _escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function _renderExpeditionMap(map) {
  const canvas = document.getElementById('expedition-map-canvas');
  const infoEl = document.getElementById('expedition-map-info');
  if (!canvas || !infoEl) return;

  const nodes = map.nodes;

  // Determine grid dimensions
  const maxRow = Math.max(...nodes.map(n => n.row));
  const maxCol = Math.max(...nodes.map(n => n.col));

  const CELL_W = 130;
  const CELL_H = 110;
  const PAD = 24;
  const canvasW = (maxCol + 1) * CELL_W + PAD * 2;
  const canvasH = (maxRow + 1) * CELL_H + PAD * 2;

  canvas.innerHTML = '';
  canvas.style.width = canvasW + 'px';
  canvas.style.height = canvasH + 'px';
  canvas.style.position = 'relative';

  // Draw SVG connector lines
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', canvasW);
  svg.setAttribute('height', canvasH);
  svg.style.position = 'absolute';
  svg.style.top = '0';
  svg.style.left = '0';
  svg.style.pointerEvents = 'none';
  canvas.appendChild(svg);

  function _nodeCenter(n) {
    return {
      x: PAD + n.col * CELL_W + CELL_W / 2,
      y: PAD + n.row * CELL_H + CELL_H / 2,
    };
  }

  // Draw connections
  for (const node of nodes) {
    const from = _nodeCenter(node);
    for (const childId of (node.connections || [])) {
      const child = nodes.find(n => n.nodeId === childId);
      if (!child) continue;
      const to = _nodeCenter(child);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', from.x);
      line.setAttribute('y1', from.y);
      line.setAttribute('x2', to.x);
      line.setAttribute('y2', to.y);
      const done = node.highScore > 0;
      line.setAttribute('stroke', done ? '#4ade80' : '#374151');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-dasharray', done ? 'none' : '6,4');
      svg.appendChild(line);
    }
  }

  // Draw nodes
  for (const node of nodes) {
    const center = _nodeCenter(node);
    const colors = _BIOME_COLORS[node.biomeId] || _BIOME_COLORS.stone;
    const icon = _BIOME_ICONS[node.biomeId] || '&#127758;';
    const isSelected = node.nodeId === _expSelectedNodeId;
    const isDone = node.highScore > 0;
    const isLocked = !node.unlocked;

    const el = document.createElement('div');
    el.className = 'exp-node' +
      (isSelected ? ' exp-node-selected' : '') +
      (isLocked ? ' exp-node-locked' : '') +
      (isDone ? ' exp-node-done' : '');
    el.dataset.nodeId = node.nodeId;
    el.style.left = (center.x - 50) + 'px';
    el.style.top  = (center.y - 44) + 'px';
    el.style.width = '100px';
    el.style.borderColor = isSelected ? '#facc15' : (isLocked ? '#4b5563' : colors.border);
    el.style.background = isLocked ? '#1f2937' : colors.bg;
    if (isSelected) el.style.boxShadow = '0 0 16px #facc1588, 0 0 4px #facc15';
    else if (!isLocked) el.style.boxShadow = '0 0 8px ' + colors.glow;

    el.innerHTML =
      '<div class="exp-node-icon">' + (isLocked ? '&#128274;' : icon) + '</div>' +
      '<div class="exp-node-name">' + _escHtml(node.biomeName) + '</div>' +
      '<div class="exp-node-score">' + (isLocked ? 'Locked' : (isDone ? '&#9733; ' + node.highScore : 'Play')) + '</div>';

    el.setAttribute('tabindex', isLocked ? '-1' : '0');
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', node.biomeName + (isLocked ? ' — locked' : (isDone ? ' — score ' + node.highScore : ' — available')));

    if (!isLocked) {
      el.addEventListener('click', () => _selectNode(node.nodeId));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); _selectNode(node.nodeId); }
      });
    }

    canvas.appendChild(el);
  }

  // Update info panel for selected node
  _updateInfoPanel(map, _expSelectedNodeId);
}

function _selectNode(nodeId) {
  if (!_expMap) return;
  const node = _expMap.nodes.find(n => n.nodeId === nodeId);
  if (!node || !node.unlocked) return;
  _expSelectedNodeId = nodeId;
  _renderExpeditionMap(_expMap);
}

function _updateInfoPanel(map, nodeId) {
  const infoEl = document.getElementById('expedition-map-info');
  if (!infoEl) return;
  const node = map.nodes.find(n => n.nodeId === nodeId);
  if (!node) { infoEl.innerHTML = ''; return; }

  const colors = _BIOME_COLORS[node.biomeId] || _BIOME_COLORS.stone;
  const icon = _BIOME_ICONS[node.biomeId] || '&#127758;';
  const locked = !node.unlocked;
  const done = node.highScore > 0;

  infoEl.innerHTML =
    '<div class="exp-info-icon">' + (locked ? '&#128274;' : icon) + '</div>' +
    '<div class="exp-info-name">' + _escHtml(node.biomeName) + '</div>' +
    '<div class="exp-info-status">' +
      (locked ? '<span class="exp-locked-label">Locked — complete prior biome to unlock</span>' :
       done    ? '<span class="exp-done-label">&#9733; Best: ' + node.highScore + '</span>' :
                 '<span class="exp-avail-label">Ready to explore</span>') +
    '</div>' +
    (!locked ? '<button id="exp-play-btn" class="exp-play-btn">&#9658; Enter Biome</button>' : '');

  if (!locked) {
    document.getElementById('exp-play-btn').addEventListener('click', () => _launchBiome(node));
  }
}

function _launchBiome(node) {
  // Store selected expedition node in session so the game can apply biome rules
  try {
    sessionStorage.setItem('mineCtris_expeditionNode', JSON.stringify({
      nodeId: node.nodeId,
      biomeId: node.biomeId,
      biomeName: node.biomeName,
      seasonId: _expMap ? _expMap.seasonId : null,
    }));
  } catch (_) {}
  closeExpeditionMap();
  // Dispatch event so main.js can start the biome game session
  document.dispatchEvent(new CustomEvent('expeditionLaunch', { detail: { node } }));
}

// ── Keyboard navigation ───────────────────────────────────────────────────────

function _expeditionKeyHandler(e) {
  if (!_expMap) return;
  const nodes = _expMap.nodes;
  const cur = nodes.find(n => n.nodeId === _expSelectedNodeId);
  if (!cur) return;

  let target = null;

  if (e.key === 'ArrowRight' || e.key === 'd') {
    // Move to unlocked node to the right on same row, or next row
    target = nodes.find(n => n.unlocked && n.row === cur.row && n.col > cur.col) ||
             nodes.find(n => n.unlocked && n.row > cur.row);
  } else if (e.key === 'ArrowLeft' || e.key === 'a') {
    target = [...nodes].reverse().find(n => n.unlocked && n.row === cur.row && n.col < cur.col) ||
             [...nodes].reverse().find(n => n.unlocked && n.row < cur.row);
  } else if (e.key === 'ArrowDown' || e.key === 's') {
    target = nodes.find(n => n.unlocked && n.row > cur.row);
  } else if (e.key === 'ArrowUp' || e.key === 'w') {
    target = [...nodes].reverse().find(n => n.unlocked && n.row < cur.row);
  } else if (e.key === 'Enter' || e.key === ' ') {
    if (cur.unlocked) _launchBiome(cur);
    return;
  } else if (e.key === 'Escape') {
    closeExpeditionMap();
    return;
  }

  if (target) {
    e.preventDefault();
    _selectNode(target.nodeId);
  }
}

// ── Gamepad polling ───────────────────────────────────────────────────────────

let _expGamepadInterval = null;
let _expLastGamepadInput = 0;

function _startGamepadPoll() {
  if (_expGamepadInterval) return;
  _expGamepadInterval = setInterval(_pollGamepad, 150);
}

function _stopGamepadPoll() {
  if (_expGamepadInterval) { clearInterval(_expGamepadInterval); _expGamepadInterval = null; }
}

function _pollGamepad() {
  if (!_expMap) return;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = Array.from(pads).find(p => p && p.connected);
  if (!pad) return;

  const now = Date.now();
  if (now - _expLastGamepadInput < 150) return;

  const LEFT  = pad.axes[0] < -0.5 || pad.buttons[14]?.pressed;
  const RIGHT = pad.axes[0] >  0.5 || pad.buttons[15]?.pressed;
  const UP    = pad.axes[1] < -0.5 || pad.buttons[12]?.pressed;
  const DOWN  = pad.axes[1] >  0.5 || pad.buttons[13]?.pressed;
  const ENTER = pad.buttons[0]?.pressed; // A button
  const BACK  = pad.buttons[1]?.pressed; // B button

  if (BACK) { _expLastGamepadInput = now; closeExpeditionMap(); return; }

  const nodes = _expMap.nodes;
  const cur = nodes.find(n => n.nodeId === _expSelectedNodeId);
  if (!cur) return;

  let target = null;
  if (RIGHT)      target = nodes.find(n => n.unlocked && n.row === cur.row && n.col > cur.col) || nodes.find(n => n.unlocked && n.row > cur.row);
  else if (LEFT)  target = [...nodes].reverse().find(n => n.unlocked && n.row === cur.row && n.col < cur.col) || [...nodes].reverse().find(n => n.unlocked && n.row < cur.row);
  else if (DOWN)  target = nodes.find(n => n.unlocked && n.row > cur.row);
  else if (UP)    target = [...nodes].reverse().find(n => n.unlocked && n.row < cur.row);
  else if (ENTER) { if (cur.unlocked) { _expLastGamepadInput = now; _launchBiome(cur); } return; }

  if (target) { _expLastGamepadInput = now; _selectNode(target.nodeId); }
}

// ── Open / Close ──────────────────────────────────────────────────────────────

async function openExpeditionMap() {
  const overlay = document.getElementById('expedition-map-overlay');
  if (!overlay) return;

  overlay.style.display = 'flex';

  const loading = document.getElementById('expedition-map-loading');
  const content = document.getElementById('expedition-map-content');
  if (loading) loading.style.display = 'block';
  if (content) content.style.display = 'none';

  const map = await loadExpeditionMap();

  if (loading) loading.style.display = 'none';
  if (content) content.style.display = 'block';

  if (!map) {
    if (content) content.innerHTML = '<p class="exp-error">Could not load expedition map. Check your connection.</p>';
    overlay.addEventListener('keydown', _expeditionKeyHandler);
    return;
  }

  // Default selection: first unlocked node
  const firstUnlocked = map.nodes.find(n => n.unlocked);
  if (firstUnlocked) _expSelectedNodeId = firstUnlocked.nodeId;

  _renderExpeditionMap(map);

  // Focus the overlay for keyboard nav
  overlay.setAttribute('tabindex', '-1');
  overlay.focus();
  overlay.addEventListener('keydown', _expeditionKeyHandler);
  _startGamepadPoll();
}

function closeExpeditionMap() {
  const overlay = document.getElementById('expedition-map-overlay');
  if (overlay) {
    overlay.style.display = 'none';
    overlay.removeEventListener('keydown', _expeditionKeyHandler);
  }
  _stopGamepadPoll();
}

// ── Init ──────────────────────────────────────────────────────────────────────

function initExpeditionMap() {
  const closeBtn = document.getElementById('expedition-map-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeExpeditionMap);

  const openBtn = document.getElementById('mode-expedition-btn');
  if (openBtn) openBtn.addEventListener('click', openExpeditionMap);

  // Close on overlay background click
  const overlay = document.getElementById('expedition-map-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeExpeditionMap();
    });
  }
}
