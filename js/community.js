// community.js — Community puzzle browser
// Requires: leaderboard.js (LEADERBOARD_WORKER_URL), puzzle-codec.js (puzzleCodecDecode),
//           state.js (customPuzzle* globals)

(function () {
  'use strict';

  var _allFetched = [];       // accumulated puzzles from all loaded pages
  var _currentCursor = null;
  var _currentDifficulty = null;
  var _currentSearch = '';
  var _allLoaded = false;
  var _loading = false;
  var _searchDebounce = null;

  function _workerUrl() {
    return (typeof LEADERBOARD_WORKER_URL !== 'undefined')
      ? LEADERBOARD_WORKER_URL
      : 'https://minectris-leaderboard.workers.dev';
  }

  var _DIFF_STARS = { easy: 1, medium: 2, hard: 3, expert: 4 };

  function _renderStars(difficulty) {
    var n = _DIFF_STARS[difficulty] || 0;
    var max = 3;
    return '★'.repeat(n) + '☆'.repeat(Math.max(0, max - n));
  }

  function _renderStarsFromInt(n) {
    n = parseInt(n) || 0;
    return '★'.repeat(Math.min(n, 3)) + '☆'.repeat(Math.max(0, 3 - n));
  }

  // ── DOM helpers ─────────────────────────────────────────────────────────────

  function _el(id) { return document.getElementById(id); }

  function _showSpinner() {
    var s = _el('cb-spinner');
    if (s) s.style.display = '';
    var err = _el('cb-error');
    if (err) err.style.display = 'none';
    var empty = _el('cb-empty');
    if (empty) empty.style.display = 'none';
  }

  function _hideSpinner() {
    var s = _el('cb-spinner');
    if (s) s.style.display = 'none';
  }

  function _showError(retryFn) {
    _hideSpinner();
    var err = _el('cb-error');
    if (err) err.style.display = '';
    var retryBtn = _el('cb-retry-btn');
    if (retryBtn) {
      retryBtn.onclick = function () { retryFn(); };
    }
  }

  function _showEmpty() {
    var empty = _el('cb-empty');
    if (empty) empty.style.display = '';
  }

  function _updateTotal(total) {
    var el = _el('cb-total');
    if (!el) return;
    el.textContent = typeof total === 'number' ? total + ' puzzle' + (total !== 1 ? 's' : '') : '';
  }

  function _updateLoadMore() {
    var btn = _el('cb-load-more');
    if (!btn) return;
    btn.style.display = _allLoaded ? 'none' : '';
  }

  // ── Filter buttons ───────────────────────────────────────────────────────────

  function _updateFilterButtons(active) {
    var buttons = document.querySelectorAll('.cb-filter-btn');
    buttons.forEach(function (b) {
      b.classList.toggle('cb-filter-active', b.dataset.diff === (active || ''));
    });
  }

  // ── Render puzzle card ───────────────────────────────────────────────────────

  function _renderPuzzleCard(puzzle) {
    var card = document.createElement('div');
    card.className = 'cb-card';

    var stars = _renderStars(puzzle.difficulty);
    var plays = typeof puzzle.plays === 'number' ? puzzle.plays : 0;
    var thumbsUp   = typeof puzzle.thumbsUp   === 'number' ? puzzle.thumbsUp   : 0;
    var thumbsDown = typeof puzzle.thumbsDown === 'number' ? puzzle.thumbsDown : 0;
    var ratingHtml = (thumbsUp > 0 || thumbsDown > 0)
      ? '<span class="cb-card-rating">&#128077; ' + thumbsUp + ' &#128078; ' + thumbsDown + '</span>'
      : '';

    card.innerHTML =
      '<div class="cb-card-left">' +
        '<div class="cb-card-title">' + _esc(puzzle.title || 'Untitled') + '</div>' +
        '<div class="cb-card-meta">' +
          '<span class="cb-card-author">by ' + _esc(puzzle.author || 'Anonymous') + '</span>' +
          (stars ? '<span class="cb-card-stars">' + stars + '</span>' : '') +
          '<span class="cb-card-plays">&#9654; ' + plays + '</span>' +
          ratingHtml +
        '</div>' +
      '</div>' +
      '<button class="cb-card-play" data-id="' + _esc(puzzle.id) + '">&#9654; Play</button>';

    var playBtn = card.querySelector('.cb-card-play');
    playBtn.addEventListener('click', function () {
      _playPuzzle(puzzle.id, puzzle.title, puzzle.author, puzzle.difficulty, playBtn);
    });

    return card;
  }

  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Filtered view of accumulated puzzles ─────────────────────────────────────

  function _filteredPuzzles() {
    var q = _currentSearch.toLowerCase();
    return _allFetched.filter(function (p) {
      if (_currentDifficulty && p.difficulty !== _currentDifficulty) return false;
      if (q) {
        var title = (p.title || '').toLowerCase();
        var author = (p.author || '').toLowerCase();
        return title.indexOf(q) !== -1 || author.indexOf(q) !== -1;
      }
      return true;
    });
  }

  function _renderList() {
    var list = _el('cb-list');
    if (!list) return;
    list.innerHTML = '';

    var empty = _el('cb-empty');
    if (empty) empty.style.display = 'none';
    var err = _el('cb-error');
    if (err) err.style.display = 'none';

    var visible = _filteredPuzzles();
    if (visible.length === 0) {
      _showEmpty();
    } else {
      visible.forEach(function (p) { list.appendChild(_renderPuzzleCard(p)); });
    }
  }

  // ── Creator play count achievement check ─────────────────────────────────────

  function _checkCreatorPlayAchievements(allPuzzles) {
    var publishedRaw = localStorage.getItem('mineCtris_publishedPuzzles');
    if (!publishedRaw) return;
    var publishedIds;
    try { publishedIds = JSON.parse(publishedRaw); } catch (_) { return; }
    if (!Array.isArray(publishedIds) || publishedIds.length === 0) return;

    var authored = allPuzzles.filter(function (p) {
      return publishedIds.indexOf(p.id) !== -1;
    }).map(function (p) {
      return { id: p.id, plays: p.plays || 0 };
    });

    if (authored.length > 0 && typeof achOnCreatorPlayCounts === 'function') {
      achOnCreatorPlayCounts(authored);
    }
  }

  // ── Fetch puzzles from API ───────────────────────────────────────────────────

  async function _fetchPage() {
    if (_loading) return;
    _loading = true;
    _showSpinner();

    try {
      var url = new URL(_workerUrl() + '/api/puzzles');
      if (_currentCursor) url.searchParams.set('cursor', _currentCursor);
      // Send difficulty filter only when not searching (search is client-side across all pages)
      if (_currentDifficulty && !_currentSearch) {
        url.searchParams.set('difficulty', _currentDifficulty);
      }

      var resp = await fetch(url.toString());
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var data = await resp.json();

      var puzzles = Array.isArray(data.puzzles) ? data.puzzles : [];
      _allFetched = _allFetched.concat(puzzles);
      _currentCursor = data.nextCursor || null;
      _allLoaded = !data.nextCursor;

      _updateTotal(data.total);
      _hideSpinner();
      _renderList();
      _updateLoadMore();
      _checkCreatorPlayAchievements(_allFetched);
    } catch (e) {
      _showError(function () { _loading = false; _fetchPage(); });
    }

    _loading = false;
  }

  // ── Open/close ───────────────────────────────────────────────────────────────

  function openCommunityBrowser() {
    var screen = _el('community-browser-screen');
    if (!screen) return;

    // Reset state
    _allFetched = [];
    _currentCursor = null;
    _currentDifficulty = null;
    _currentSearch = '';
    _allLoaded = false;
    _loading = false;

    var searchInput = _el('cb-search');
    if (searchInput) searchInput.value = '';
    _updateFilterButtons(null);

    var list = _el('cb-list');
    if (list) list.innerHTML = '';
    var empty = _el('cb-empty');
    if (empty) empty.style.display = 'none';
    var err = _el('cb-error');
    if (err) err.style.display = 'none';
    _updateLoadMore();

    screen.style.display = 'flex';
    _fetchPage();
  }

  function closeCommunityBrowser() {
    var screen = _el('community-browser-screen');
    if (screen) screen.style.display = 'none';
  }

  // Expose worker URL helper for vote calls from puzzle.js
  window._communityWorkerUrl = _workerUrl;

  // ── Play a puzzle ────────────────────────────────────────────────────────────

  async function _playPuzzle(puzzleId, title, author, difficulty, btn) {
    if (btn) { btn.textContent = '...'; btn.disabled = true; }

    // Track community puzzle ID for play count and voting
    window._communityPuzzleId = puzzleId;

    try {
      var resp = await fetch(_workerUrl() + '/api/puzzles/' + puzzleId);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var puzzle = await resp.json();
      var code = puzzle.code;

      if (!code) throw new Error('No code');

      var decodeResult = (typeof puzzleCodecDecode === 'function')
        ? puzzleCodecDecode(code)
        : (typeof decodePuzzleShareCode === 'function' && decodePuzzleShareCode(code)
            ? { ok: true, blocks: decodePuzzleShareCode(code).blocks,
                winCondition: decodePuzzleShareCode(code).winCondition,
                metadata: decodePuzzleShareCode(code).metadata,
                pieceSequence: decodePuzzleShareCode(code).pieceSequence }
            : { ok: false, error: 'Cannot decode' });

      if (!decodeResult.ok) {
        if (btn) { btn.textContent = '▶ Play'; btn.disabled = false; }
        alert('Could not load this puzzle. The share code may be corrupted.');
        return;
      }

      // Set game globals (defined in state.js)
      customPuzzleWinCondition = decodeResult.winCondition;
      customPieceSequence = decodeResult.pieceSequence || { mode: 'random', pieces: [] };
      customPuzzleMetadata = decodeResult.metadata
        || { name: puzzle.title || '', description: '', author: puzzle.author || '', difficulty: 0 };
      customPuzzleLayout = decodeResult.blocks.map(function (b) {
        var hexColor = '#808080';
        if (typeof EDITOR_PALETTE !== 'undefined' && b[3] !== undefined) {
          var pi = b[3];
          if (pi >= 0 && pi < EDITOR_PALETTE.length) {
            hexColor = '#' + EDITOR_PALETTE[pi].hex.toString(16).padStart(6, '0');
          }
        }
        return { x: b[0], y: b[1], z: b[2], color: hexColor };
      });
      isCustomPuzzleMode = true;
      puzzleComplete = false;
      difficultyMultiplier = 0.5;
      lastDifficultyTier = 0;

      // Fire play count (fire-and-forget)
      fetch(_workerUrl() + '/api/puzzles/' + puzzleId + '/play', { method: 'POST' }).catch(function () {});

      // Populate the custom-puzzle-load-screen and show it
      closeCommunityBrowser();

      var screen = _el('custom-puzzle-load-screen');
      var nameEl = _el('cpls-name');
      var descEl = _el('cpls-desc');
      var authorEl = _el('cpls-author');
      var diffEl = _el('cpls-difficulty');
      var playBtnEl = _el('cpls-play-btn');
      var spinnerEl = _el('cpls-spinner');

      if (spinnerEl) spinnerEl.style.display = 'none';
      if (nameEl) nameEl.textContent = puzzle.title || 'Community Puzzle';
      if (descEl) descEl.textContent = (decodeResult.metadata && decodeResult.metadata.description) || '';
      if (authorEl) {
        authorEl.textContent = puzzle.author ? 'by ' + puzzle.author : '';
        authorEl.style.display = puzzle.author ? '' : 'none';
      }
      if (diffEl) {
        var diff = _DIFF_STARS[puzzle.difficulty] || 0;
        if (diff > 0) {
          diffEl.textContent = _renderStarsFromInt(diff);
          diffEl.style.display = '';
        } else {
          diffEl.style.display = 'none';
        }
      }
      if (playBtnEl) playBtnEl.style.display = '';
      if (screen) screen.style.display = 'flex';

    } catch (e) {
      if (btn) { btn.textContent = '▶ Play'; btn.disabled = false; }
      alert('Could not load this puzzle. Please try again.');
    }
  }

  // ── Init event listeners ─────────────────────────────────────────────────────

  function _init() {
    // Search input
    var searchInput = _el('cb-search');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        clearTimeout(_searchDebounce);
        _searchDebounce = setTimeout(function () {
          _currentSearch = searchInput.value.trim();
          _renderList();
        }, 300);
      });
    }

    // Filter buttons
    var filterBtns = document.querySelectorAll('.cb-filter-btn');
    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var diff = btn.dataset.diff || null;
        _currentDifficulty = diff || null;
        _updateFilterButtons(diff);
        // Reset and reload from server with new difficulty filter
        _allFetched = [];
        _currentCursor = null;
        _allLoaded = false;
        _loading = false;
        var list = _el('cb-list');
        if (list) list.innerHTML = '';
        _updateLoadMore();
        _fetchPage();
      });
    });

    // Load more button
    var loadMoreBtn = _el('cb-load-more');
    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', function () {
        _fetchPage();
      });
    }

    // Back button
    var backBtn = _el('cb-back-btn');
    if (backBtn) {
      backBtn.addEventListener('click', function () {
        closeCommunityBrowser();
        // Show main menu
        var blocker = document.getElementById('blocker');
        var instructions = document.getElementById('instructions');
        if (blocker) blocker.style.display = 'flex';
        if (instructions) instructions.style.display = '';
      });
    }
  }

  document.addEventListener('DOMContentLoaded', _init);

  // Expose
  window.openCommunityBrowser = openCommunityBrowser;
  window.closeCommunityBrowser = closeCommunityBrowser;

})();
