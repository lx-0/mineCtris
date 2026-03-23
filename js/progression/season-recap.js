// season-recap.js — Season MVP Highlight + Shareable Card
// Auto-generated at season close for players with >= 5 matches.
// Stores up to 3 past season cards in localStorage.
// Depends on: season.js (getSeasonRankTier), leveling.js (toast queue)

'use strict';

var _RECAP_KEY_PREFIX      = 'mineCtris_season_recap_';
var _RECAP_INDEX_KEY       = 'mineCtris_season_recap_index';
var _RECAP_NOTIF_KEY_PFX   = 'mineCtris_season_recap_notif_';
var RECAP_MAX_CARDS        = 3;
var RECAP_SHARE_PARAM      = 'season-recap';

// ── Theme accent colors (mirrors season.js) ───────────────────────────────────
var _RECAP_THEME_ACCENT = {
  overworld: '#4A90D9',
  nether:    '#CC3300',
  end:       '#7B2FBE',
  deep_dark: '#00CED1',
};

function _recapAccent(theme) {
  return _RECAP_THEME_ACCENT[theme] || '#00ff88';
}

// ── Storage ───────────────────────────────────────────────────────────────────

function _loadRecapIndex() {
  try { return JSON.parse(localStorage.getItem(_RECAP_INDEX_KEY) || '[]'); } catch (_) { return []; }
}

function _saveRecapCard(card) {
  try {
    localStorage.setItem(_RECAP_KEY_PREFIX + card.seasonId, JSON.stringify(card));
    var index = _loadRecapIndex();
    var pos = index.indexOf(card.seasonId);
    if (pos !== -1) index.splice(pos, 1);
    index.unshift(card.seasonId);
    if (index.length > RECAP_MAX_CARDS) index = index.slice(0, RECAP_MAX_CARDS);
    localStorage.setItem(_RECAP_INDEX_KEY, JSON.stringify(index));
  } catch (_) {}
}

/** Load a single recap card by seasonId. */
function loadSeasonRecapCard(seasonId) {
  try { return JSON.parse(localStorage.getItem(_RECAP_KEY_PREFIX + seasonId) || 'null'); } catch (_) { return null; }
}

/** Load all saved recap cards (newest first, up to RECAP_MAX_CARDS). */
function loadAllSeasonRecaps() {
  var index = _loadRecapIndex();
  var cards = [];
  index.forEach(function (id) {
    var c = loadSeasonRecapCard(id);
    if (c) cards.push(c);
  });
  return cards;
}

// ── Card Generation ───────────────────────────────────────────────────────────

/**
 * Generate and save a season recap card for the player if they qualify (>= 5 matches).
 *
 * @param {string}      seasonId
 * @param {string}      seasonName
 * @param {string}      theme           one of: overworld, nether, end, deep_dark
 * @param {string}      playerName
 * @param {object|null} ratingEntry     { rank, rating } from rating snapshot
 * @param {object}      seasonStats     { wins, losses, draws, tournamentsEntered }
 * @param {object|null} archiveEntry    { totalScore, gamesPlayed } from season archive
 * @param {object|null} tournamentStats { bestFinish: 'Champion'|'Finalist'|null }
 * @returns {object|null}  saved card, or null if player doesn't qualify
 */
function generateAndSaveSeasonRecap(seasonId, seasonName, theme, playerName,
    ratingEntry, seasonStats, archiveEntry, tournamentStats) {
  seasonStats = seasonStats || { wins: 0, losses: 0, draws: 0, tournamentsEntered: 0 };
  var matches = (seasonStats.wins || 0) + (seasonStats.losses || 0) + (seasonStats.draws || 0);
  if (matches < 5) return null;

  // Rank + tier
  var rank = null, rating = 0, tierName = null, tierCls = null;
  if (ratingEntry) {
    rank   = ratingEntry.rank;
    rating = ratingEntry.rating || 0;
    if (typeof getSeasonRankTier === 'function') {
      var tier = getSeasonRankTier(rating);
      tierName = tier.name;
      tierCls  = tier.cls;
    }
  }

  // Best stat highlight — prefer season score, fall back to win rate
  var bestStatLabel = null, bestStatValue = null;
  if (archiveEntry && archiveEntry.totalScore > 0) {
    bestStatLabel = 'Season Score';
    bestStatValue = archiveEntry.totalScore.toLocaleString();
  } else if (matches > 0) {
    bestStatLabel = 'Win Rate';
    bestStatValue = Math.round((seasonStats.wins || 0) / matches * 100) + '%';
  }

  var winRate = matches > 0 ? Math.round((seasonStats.wins || 0) / matches * 100) : 0;

  var card = {
    seasonId:             seasonId,
    seasonName:           seasonName  || 'Season',
    theme:                theme        || 'overworld',
    playerName:           playerName   || 'Player',
    rank:                 rank,
    rating:               rating,
    tierName:             tierName,
    tierCls:              tierCls,
    bestStatLabel:        bestStatLabel,
    bestStatValue:        bestStatValue,
    matchesPlayed:        matches,
    wins:                 seasonStats.wins   || 0,
    losses:               seasonStats.losses || 0,
    draws:                seasonStats.draws  || 0,
    winRate:              winRate,
    tournamentsEntered:   seasonStats.tournamentsEntered || 0,
    bestTournamentFinish: tournamentStats ? (tournamentStats.bestFinish || null) : null,
    generatedAt:          Date.now(),
  };

  _saveRecapCard(card);
  return card;
}

// ── Share URL ─────────────────────────────────────────────────────────────────

/** Build a stable shareable URL encoding the card data (no server needed). */
function buildRecapShareUrl(card) {
  try {
    var encoded = btoa(unescape(encodeURIComponent(JSON.stringify(card))));
    var url = new URL(location.href);
    url.search = '';
    url.searchParams.set(RECAP_SHARE_PARAM, encoded);
    return url.toString();
  } catch (_) { return location.href; }
}

function _parseRecapShareParam() {
  try {
    var params = new URLSearchParams(location.search);
    var raw = params.get(RECAP_SHARE_PARAM);
    if (!raw) return null;
    return JSON.parse(decodeURIComponent(escape(atob(raw))));
  } catch (_) { return null; }
}

/** Called on page load — shows shared recap modal if ?season-recap= param is present. */
function initRecapFromUrl() {
  var card = _parseRecapShareParam();
  if (!card) return;
  setTimeout(function () { showSeasonRecapModal(card); }, 600);
}

// ── Canvas rendering ──────────────────────────────────────────────────────────

var _TIER_COLOR = {
  Diamond:  '#88eeff',
  Platinum: '#d0d0d0',
  Gold:     '#ffd700',
  Silver:   '#aaaaaa',
  Bronze:   '#cd7f32',
};

/**
 * Draw the season recap card onto a 600×360 canvas and return it.
 * Pure Canvas 2D — no external deps.
 */
function drawRecapCardCanvas(card) {
  var W = 600, H = 360;
  var canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  var ctx = canvas.getContext('2d');
  var accent = _recapAccent(card.theme);

  // ── Background ──
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, W, H);

  // ── Outer glow border ──
  ctx.strokeStyle = accent + '33';
  ctx.lineWidth = 14;
  ctx.strokeRect(0, 0, W, H);

  // ── Sharp border ──
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(2, 2, W - 4, H - 4);

  // ── Header row ──
  ctx.fillStyle = accent;
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('MINETRIS', 22, 30);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 17px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(card.seasonName.toUpperCase(), W / 2, 30);

  ctx.fillStyle = accent;
  ctx.font = '11px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('SEASON RECAP', W - 22, 30);

  // ── Header divider ──
  ctx.strokeStyle = accent + '55';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(22, 40); ctx.lineTo(W - 22, 40); ctx.stroke();

  // ── Player name ──
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 30px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(_truncate(card.playerName, 18), W / 2, 80);

  // ── Rank + tier ──
  var rankY = 112;
  if (card.rank) {
    ctx.fillStyle = accent;
    ctx.font = 'bold 19px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Rank  #' + card.rank, W / 2, rankY);
    rankY += 26;
  }
  if (card.tierName) {
    ctx.fillStyle = _TIER_COLOR[card.tierName] || '#ffffff';
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(card.tierName.toUpperCase() + '  \u2014  ' + card.rating + ' pts', W / 2, rankY);
  }

  // ── Stats grid (3 cols) ──
  var gridY   = 162;
  var colW    = (W - 48) / 3;
  var cols = [
    { label: 'MATCHES',     value: String(card.matchesPlayed) },
    { label: 'WIN RATE',    value: card.winRate + '%' },
    { label: 'TOURNAMENTS', value: String(card.tournamentsEntered) },
  ];
  cols.forEach(function (col, i) {
    var cx = 24 + i * colW + colW / 2;
    ctx.fillStyle = '#777';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(col.label, cx, gridY);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px monospace';
    ctx.fillText(col.value, cx, gridY + 28);
  });
  // Vertical dividers
  ctx.strokeStyle = accent + '44';
  ctx.lineWidth = 1;
  for (var d = 1; d < 3; d++) {
    var dvX = 24 + d * colW;
    ctx.beginPath(); ctx.moveTo(dvX, gridY - 12); ctx.lineTo(dvX, gridY + 38); ctx.stroke();
  }

  // ── Best stat highlight ──
  if (card.bestStatLabel) {
    var bsY = gridY + 68;
    // Background pill
    ctx.fillStyle = accent + '18';
    var pillW = 280, pillH = 38;
    ctx.beginPath();
    ctx.roundRect
      ? ctx.roundRect(W / 2 - pillW / 2, bsY - 24, pillW, pillH, 6)
      : ctx.rect(W / 2 - pillW / 2, bsY - 24, pillW, pillH);
    ctx.fill();

    ctx.fillStyle = '#999';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(card.bestStatLabel.toUpperCase(), W / 2, bsY - 8);
    ctx.fillStyle = accent;
    ctx.font = 'bold 18px monospace';
    ctx.fillText(String(card.bestStatValue), W / 2, bsY + 10);
  }

  // ── Best tournament finish ──
  if (card.bestTournamentFinish) {
    var btIcon = card.bestTournamentFinish === 'Champion' ? '\uD83C\uDFC6' : '\uD83E\uDD48';
    ctx.fillStyle = '#ffd700';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Best Finish: ' + btIcon + ' ' + card.bestTournamentFinish, W / 2, H - 44);
  }

  // ── Footer divider ──
  ctx.strokeStyle = accent + '44';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(22, H - 28); ctx.lineTo(W - 22, H - 28); ctx.stroke();

  // ── Footer text ──
  ctx.fillStyle = '#444';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('minetris.pages.dev', 22, H - 12);
  ctx.textAlign = 'right';
  ctx.fillText(new Date(card.generatedAt).toLocaleDateString(), W - 22, H - 12);

  return canvas;
}

function _truncate(str, max) {
  str = String(str || '');
  return str.length > max ? str.slice(0, max - 1) + '\u2026' : str;
}

// ── PNG Export ────────────────────────────────────────────────────────────────

/** Export the recap card as a PNG download. */
function exportRecapAsPng(card) {
  var canvas = drawRecapCardCanvas(card);
  var link = document.createElement('a');
  link.download = 'minetris-season-recap-' + (card.seasonId || 'card') + '.png';
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ── Notification toast ────────────────────────────────────────────────────────

function _hasShownRecapNotif(seasonId) {
  try { return !!localStorage.getItem(_RECAP_NOTIF_KEY_PFX + seasonId); } catch (_) { return true; }
}

function _markRecapNotifShown(seasonId) {
  try { localStorage.setItem(_RECAP_NOTIF_KEY_PFX + seasonId, '1'); } catch (_) {}
}

/** Push notification: "Your Season X recap is ready!" */
function showRecapReadyNotification(card) {
  if (!card || _hasShownRecapNotif(card.seasonId)) return;
  _markRecapNotifShown(card.seasonId);
  // Reuse the level-up toast infrastructure (leveling.js)
  var el = document.getElementById('level-up-toast');
  if (!el) return;
  var iconEl  = el.querySelector('.lu-toast-icon');
  var titleEl = el.querySelector('.lu-toast-title');
  var bodyEl  = el.querySelector('.lu-toast-body');
  if (iconEl)  iconEl.textContent  = '\uD83C\uDFC6';
  if (titleEl) titleEl.textContent = 'Season Recap Ready!';
  if (bodyEl)  bodyEl.textContent  = (card.seasonName || 'Season') + ' card is available.';
  el.classList.remove('lu-toast-visible');
  void el.offsetWidth;
  el.classList.add('lu-toast-visible');
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(function () { el.classList.remove('lu-toast-visible'); }, 3500);
}

// ── Modal ─────────────────────────────────────────────────────────────────────

/** Populate and show the season recap overlay for a given card. */
function showSeasonRecapModal(card) {
  if (!card) return;
  var overlay = document.getElementById('season-recap-overlay');
  if (!overlay) return;

  var accent = _recapAccent(card.theme);
  var panel  = document.getElementById('season-recap-panel');
  if (panel) panel.style.setProperty('--recap-accent', accent);

  // Render canvas
  var container = document.getElementById('season-recap-canvas-container');
  if (container) {
    container.innerHTML = '';
    var canvas = drawRecapCardCanvas(card);
    canvas.style.maxWidth = '100%';
    canvas.style.height   = 'auto';
    canvas.style.display  = 'block';
    container.appendChild(canvas);
  }

  // Share URL
  var shareUrl  = buildRecapShareUrl(card);
  var shareInput = document.getElementById('season-recap-share-url');
  if (shareInput) shareInput.value = shareUrl;

  // Export button
  var exportBtn = document.getElementById('season-recap-export-btn');
  if (exportBtn) exportBtn.onclick = function () { exportRecapAsPng(card); };

  // Copy link button
  var copyBtn = document.getElementById('season-recap-copy-btn');
  if (copyBtn) {
    copyBtn.onclick = function () {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(shareUrl).then(function () {
          copyBtn.textContent = 'Copied!';
          setTimeout(function () { copyBtn.textContent = 'Copy Link'; }, 2200);
        });
      } else {
        try { shareInput && shareInput.select(); document.execCommand('copy'); } catch (_) {}
        copyBtn.textContent = 'Copied!';
        setTimeout(function () { copyBtn.textContent = 'Copy Link'; }, 2200);
      }
    };
  }

  overlay.style.display = 'flex';

  var closeBtn = document.getElementById('season-recap-close-btn');
  if (closeBtn) closeBtn.onclick = function () { overlay.style.display = 'none'; };

  // Close on backdrop click
  overlay.onclick = function (e) {
    if (e.target === overlay) overlay.style.display = 'none';
  };
}

// ── Season cards carousel (for stats panel / profile) ────────────────────────

/**
 * Render the season cards carousel into a container element.
 * Shows most recent card prominently; up to RECAP_MAX_CARDS cards total.
 * @param {string} containerId  ID of the container element
 */
function renderSeasonRecapSection(containerId) {
  var el = document.getElementById(containerId);
  if (!el) return;
  var cards = loadAllSeasonRecaps();
  if (!cards.length) { el.style.display = 'none'; return; }

  var html = '<div class="season-recap-section-title">SEASON CARDS</div>';
  html += '<div class="season-recap-carousel">';
  cards.forEach(function (card, i) {
    var accent = _recapAccent(card.theme);
    var isPinned = i === 0;
    html += '<div class="season-recap-thumb' + (isPinned ? ' season-recap-thumb-pinned' : '') +
      '" data-recap-idx="' + i + '" style="--recap-accent:' + accent + ';border-color:' + accent + '">';
    if (isPinned) {
      html += '<div class="season-recap-pinned-badge">&#9733; Latest</div>';
    }
    html += '<div class="season-recap-thumb-season">' + _escRecapHtml(card.seasonName) + '</div>';
    if (card.rank) {
      html += '<div class="season-recap-thumb-rank" style="color:' + accent + '">Rank #' + card.rank + '</div>';
    }
    if (card.tierName) {
      html += '<div class="season-recap-thumb-tier" style="color:' + (_TIER_COLOR[card.tierName] || '#fff') + '">' +
        _escRecapHtml(card.tierName) + '</div>';
    }
    html += '<div class="season-recap-thumb-matches">' + card.matchesPlayed + ' matches &middot; ' +
      card.winRate + '% win</div>';
    html += '<div class="season-recap-thumb-cta">View Card &#8594;</div>';
    html += '</div>';
  });
  html += '</div>';
  el.innerHTML = html;
  el.style.display = '';

  // Wire click handlers
  var thumbs = el.querySelectorAll('.season-recap-thumb');
  thumbs.forEach(function (thumb) {
    var idx = parseInt(thumb.getAttribute('data-recap-idx'), 10);
    thumb.style.cursor = 'pointer';
    thumb.onclick = function () { showSeasonRecapModal(cards[idx]); };
  });
}

function _escRecapHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
