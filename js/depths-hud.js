// js/depths-hud.js — Dungeon HUD overlay for Expeditions mode.
// Shows floor depth, loot inventory preview, objective progress, and extraction button.
// Visible only during dungeon runs. Fades during active piece placement.
//
// Requires: depths-config.js (DUNGEON_TIERS, getDungeonModifier),
//           depths-state.js (getDungeonSession, getDungeonCurrentFloor, getDungeonFloorNum, getDungeonLoot),
//           loot-tables.js (LOOT_RARITY, getLootItemById)
// Used by:  depths-session.js (show/hide/update), main.js (per-frame tick)

var depthsHud = (function () {

  var _el = null;           // root container
  var _built = false;

  // Element references
  var _floorNumEl = null;
  var _floorTierEl = null;
  var _modifiersEl = null;
  var _scalingEl = null;    // Infinite Depths difficulty indicator
  var _goalBarFill = null;
  var _goalTextEl = null;
  var _lootListEl = null;
  var _lootCountEl = null;
  var _extractBtn = null;
  var _extractBtnWrap = null;

  // Boss health bar elements
  var _bossBarWrap = null;
  var _bossNameEl = null;
  var _bossBarFill = null;
  var _bossBarText = null;
  var _bossPhaseEl = null;

  // State
  var _visible = false;
  var _extractEnabled = false;
  var _extractPulse = false;
  var _descentAnimTimer = 0;     // animate floor number on descent
  var _bossActive = false;

  // ── DOM build ─────────────────────────────────────────────────────────────

  function _build() {
    if (_built) return;
    _built = true;

    _el = document.createElement('div');
    _el.id = 'depths-hud';
    _el.className = 'depths-hud';
    _el.style.display = 'none';

    // — Floor depth indicator (top-left) —
    var floorSection = document.createElement('div');
    floorSection.className = 'dhud-floor';

    _floorNumEl = document.createElement('div');
    _floorNumEl.className = 'dhud-floor-num';
    _floorNumEl.textContent = 'FLOOR 1';

    _floorTierEl = document.createElement('div');
    _floorTierEl.className = 'dhud-floor-tier';
    _floorTierEl.textContent = 'Shallow';

    _modifiersEl = document.createElement('div');
    _modifiersEl.className = 'dhud-modifiers';

    _scalingEl = document.createElement('div');
    _scalingEl.className = 'dhud-infinite-scaling';
    _scalingEl.style.display = 'none';

    floorSection.appendChild(_floorNumEl);
    floorSection.appendChild(_floorTierEl);
    floorSection.appendChild(_modifiersEl);
    floorSection.appendChild(_scalingEl);
    _el.appendChild(floorSection);

    // — Objective progress (top-center) —
    var goalSection = document.createElement('div');
    goalSection.className = 'dhud-goal';

    _goalTextEl = document.createElement('div');
    _goalTextEl.className = 'dhud-goal-text';
    _goalTextEl.textContent = '0/0 lines';

    var goalBarOuter = document.createElement('div');
    goalBarOuter.className = 'dhud-goal-bar';

    _goalBarFill = document.createElement('div');
    _goalBarFill.className = 'dhud-goal-bar-fill';
    _goalBarFill.style.width = '0%';

    goalBarOuter.appendChild(_goalBarFill);
    goalSection.appendChild(_goalTextEl);
    goalSection.appendChild(goalBarOuter);
    _el.appendChild(goalSection);

    // — Boss health bar (top, full width) —
    _bossBarWrap = document.createElement('div');
    _bossBarWrap.className = 'dhud-boss-bar-wrap';
    _bossBarWrap.style.display = 'none';

    _bossNameEl = document.createElement('div');
    _bossNameEl.className = 'dhud-boss-name';
    _bossNameEl.textContent = '';

    _bossPhaseEl = document.createElement('span');
    _bossPhaseEl.className = 'dhud-boss-phase';
    _bossPhaseEl.textContent = '';
    _bossNameEl.appendChild(_bossPhaseEl);

    var bossBarOuter = document.createElement('div');
    bossBarOuter.className = 'dhud-boss-bar';

    _bossBarFill = document.createElement('div');
    _bossBarFill.className = 'dhud-boss-bar-fill';
    _bossBarFill.style.width = '100%';

    _bossBarText = document.createElement('div');
    _bossBarText.className = 'dhud-boss-bar-text';
    _bossBarText.textContent = '';

    bossBarOuter.appendChild(_bossBarFill);
    bossBarOuter.appendChild(_bossBarText);
    _bossBarWrap.appendChild(_bossNameEl);
    _bossBarWrap.appendChild(bossBarOuter);
    _el.appendChild(_bossBarWrap);

    // — Loot inventory preview (left sidebar) —
    var lootSection = document.createElement('div');
    lootSection.className = 'dhud-loot';

    var lootHeader = document.createElement('div');
    lootHeader.className = 'dhud-loot-header';
    lootHeader.textContent = 'LOOT';
    _lootCountEl = document.createElement('span');
    _lootCountEl.className = 'dhud-loot-count';
    _lootCountEl.textContent = '0';
    lootHeader.appendChild(_lootCountEl);

    _lootListEl = document.createElement('div');
    _lootListEl.className = 'dhud-loot-list';

    lootSection.appendChild(lootHeader);
    lootSection.appendChild(_lootListEl);
    _el.appendChild(lootSection);

    // — Extraction button (bottom-left) —
    _extractBtnWrap = document.createElement('div');
    _extractBtnWrap.className = 'dhud-extract-wrap';
    _extractBtnWrap.style.display = 'none';

    _extractBtn = document.createElement('button');
    _extractBtn.className = 'dhud-extract-btn';
    _extractBtn.innerHTML = '&#x2191; EXTRACT';
    _extractBtn.title = 'Keep loot and end run (available after floor clear)';

    _extractBtnWrap.appendChild(_extractBtn);
    _el.appendChild(_extractBtnWrap);

    document.body.appendChild(_el);
  }

  // ── Loot list rendering ───────────────────────────────────────────────────

  function _renderLootList() {
    if (!_lootListEl) return;

    var loot = (typeof getDungeonLoot === 'function') ? getDungeonLoot() : [];
    if (_lootCountEl) _lootCountEl.textContent = ' (' + loot.length + ')';

    _lootListEl.innerHTML = '';

    if (loot.length === 0) {
      var emptyEl = document.createElement('div');
      emptyEl.className = 'dhud-loot-empty';
      emptyEl.textContent = 'No loot yet';
      _lootListEl.appendChild(emptyEl);
      return;
    }

    // Show most recent items first, max 8 visible
    var maxVisible = 8;
    var startIdx = Math.max(0, loot.length - maxVisible);

    for (var i = loot.length - 1; i >= startIdx; i--) {
      var entry = loot[i];
      var itemEl = document.createElement('div');
      itemEl.className = 'dhud-loot-item';

      // Try to look up catalog item for icon and rarity
      var catalogItem = (typeof getLootItemById === 'function') ? getLootItemById(entry.item) : null;
      var icon = '\uD83D\uDCE6';  // default package emoji
      var rarityColor = '#9ca3af'; // default grey
      var name = entry.item;

      if (catalogItem) {
        icon = catalogItem.icon || icon;
        name = catalogItem.name || name;
        if (typeof LOOT_RARITY !== 'undefined' && catalogItem.rarity && LOOT_RARITY[catalogItem.rarity]) {
          rarityColor = LOOT_RARITY[catalogItem.rarity].color;
        }
      }

      itemEl.style.borderLeftColor = rarityColor;

      var iconSpan = document.createElement('span');
      iconSpan.className = 'dhud-loot-icon';
      iconSpan.textContent = icon;

      var nameSpan = document.createElement('span');
      nameSpan.className = 'dhud-loot-name';
      nameSpan.textContent = name;
      nameSpan.style.color = rarityColor;

      itemEl.appendChild(iconSpan);
      itemEl.appendChild(nameSpan);
      _lootListEl.appendChild(itemEl);
    }

    // Scroll indicator if more items
    if (loot.length > maxVisible) {
      var moreEl = document.createElement('div');
      moreEl.className = 'dhud-loot-more';
      moreEl.textContent = '+' + (loot.length - maxVisible) + ' more';
      _lootListEl.appendChild(moreEl);
    }
  }

  // ── Goal progress ─────────────────────────────────────────────────────────

  function _updateGoalProgress() {
    if (!_goalTextEl || !_goalBarFill) return;
    if (typeof getDungeonCurrentFloor !== 'function') return;

    var floor = getDungeonCurrentFloor();
    if (!floor || !floor.clearCondition) return;

    var condition = floor.clearCondition;
    var current = 0;
    var total = 0;
    var label = '';

    switch (condition.type) {
      case 'clear_lines':
        current = Math.min(typeof dungeonFloorLinesCleared !== 'undefined' ? dungeonFloorLinesCleared : 0, condition.count);
        total = condition.count;
        label = current + '/' + total + ' lines';
        break;
      case 'mine_blocks':
        current = Math.min(typeof dungeonFloorBlocksMined !== 'undefined' ? dungeonFloorBlocksMined : 0, condition.count);
        total = condition.count;
        label = current + '/' + total + ' blocks mined';
        break;
      case 'survive_time':
        var survived = Math.floor((typeof dungeonFloorSurviveMs !== 'undefined' ? dungeonFloorSurviveMs : 0) / 1000);
        current = Math.min(survived, condition.seconds);
        total = condition.seconds;
        label = current + '/' + total + 's survived';
        break;
    }

    _goalTextEl.textContent = label;

    var pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
    _goalBarFill.style.width = pct + '%';

    // Color the bar based on progress
    if (pct >= 100) {
      _goalBarFill.style.background = '#22c55e';
    } else if (pct >= 60) {
      _goalBarFill.style.background = '#6ee7b7';
    } else {
      _goalBarFill.style.background = '#3b82f6';
    }
  }

  // ── Floor info ────────────────────────────────────────────────────────────

  function _updateFloorInfo() {
    if (typeof getDungeonSession !== 'function') return;
    var session = getDungeonSession();
    if (!session) return;

    var floorNum = (typeof getDungeonFloorNum === 'function') ? getDungeonFloorNum() : 1;
    var totalFloors = session.totalFloors || '?';

    if (_floorNumEl) {
      // Infinite Depths: show "Descent N — Floor M"
      var infRun = (typeof getInfiniteRun === 'function') ? getInfiniteRun() : null;
      if (infRun) {
        _floorNumEl.textContent = 'DESCENT ' + infRun.descentNum + ' \u2014 FLOOR ' + floorNum;
      } else {
        _floorNumEl.textContent = 'FLOOR ' + floorNum + '/' + totalFloors;
      }
    }

    // Tier label with color
    if (_floorTierEl && typeof DUNGEON_TIERS !== 'undefined') {
      var tierDef = DUNGEON_TIERS[session.tier];
      if (tierDef) {
        // Infinite mode: override label
        var infRun2 = (typeof getInfiniteRun === 'function') ? getInfiniteRun() : null;
        _floorTierEl.textContent = infRun2 ? '\u221E Infinite' : tierDef.label;
        _floorTierEl.style.color = infRun2 ? '#a855f7' : tierDef.color;
      }
    }

    // Modifiers
    var floor = (typeof getDungeonCurrentFloor === 'function') ? getDungeonCurrentFloor() : null;
    if (_modifiersEl && floor && floor.modifiers && floor.modifiers.length > 0) {
      var names = [];
      for (var i = 0; i < floor.modifiers.length; i++) {
        var mod = (typeof getDungeonModifier === 'function') ? getDungeonModifier(floor.modifiers[i]) : null;
        names.push(mod ? mod.name : floor.modifiers[i]);
      }
      _modifiersEl.textContent = names.join(' + ');
      _modifiersEl.style.display = 'block';
    } else if (_modifiersEl) {
      _modifiersEl.textContent = '';
      _modifiersEl.style.display = 'none';
    }

    // Infinite Depths scaling indicator
    if (_scalingEl) {
      var infRunS = (typeof getInfiniteRun === 'function') ? getInfiniteRun() : null;
      if (infRunS && typeof getInfiniteScaling === 'function') {
        var sc = getInfiniteScaling(infRunS.descentNum);
        var speedPct = Math.round((sc.speedMultiplier - 1.0) * 100);
        var icons = '';
        // One skull per 2 descents of difficulty, capped at 5
        var skulls = Math.min(5, Math.ceil(infRunS.descentNum / 2));
        for (var s = 0; s < skulls; s++) icons += '\u2620';
        _scalingEl.textContent = icons + ' +' + speedPct + '% SPD';
        _scalingEl.style.display = 'block';
        _scalingEl.style.color = sc.speedMultiplier >= 2.5 ? '#ef4444'
                               : sc.speedMultiplier >= 1.75 ? '#fbbf24'
                               : '#a855f7';
      } else {
        _scalingEl.style.display = 'none';
      }
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {

    /**
     * Show the dungeon HUD. Call when a dungeon session starts or a new floor begins.
     */
    show: function () {
      _build();
      if (_el) _el.style.display = 'block';
      _visible = true;
      _extractEnabled = false;
      _extractPulse = false;
      _descentAnimTimer = 0;
      if (_extractBtnWrap) _extractBtnWrap.style.display = 'none';
      if (_extractBtn) _extractBtn.classList.remove('dhud-extract-pulse');

      _updateFloorInfo();
      _updateGoalProgress();
      _renderLootList();
    },

    /**
     * Hide the dungeon HUD. Call when dungeon ends (extract, death, or exit).
     */
    hide: function () {
      if (_el) _el.style.display = 'none';
      _visible = false;
      _extractEnabled = false;
    },

    /**
     * Per-frame tick. Handles descent animation timer and opacity fade.
     * @param {number} delta  Seconds since last frame
     */
    tick: function (delta) {
      if (!_visible || !_el) return;

      // Descent animation: flash floor number
      if (_descentAnimTimer > 0) {
        _descentAnimTimer -= delta;
        if (_floorNumEl) {
          _floorNumEl.classList.add('dhud-floor-descend');
        }
        if (_descentAnimTimer <= 0) {
          _descentAnimTimer = 0;
          if (_floorNumEl) _floorNumEl.classList.remove('dhud-floor-descend');
        }
      }
    },

    /**
     * Update objective progress. Called per-frame from the game loop.
     */
    updateGoal: function () {
      if (!_visible) return;
      _updateGoalProgress();
    },

    /**
     * Refresh floor info and loot. Call on floor change.
     */
    onFloorChange: function () {
      _build();
      _updateFloorInfo();
      _renderLootList();
      _updateGoalProgress();
      _descentAnimTimer = 1.0; // 1-second descent flash
      if (_extractBtnWrap) _extractBtnWrap.style.display = 'none';
      _extractEnabled = false;
      _extractPulse = false;
      if (_extractBtn) _extractBtn.classList.remove('dhud-extract-pulse');
    },

    /**
     * Refresh loot display. Call after loot is awarded.
     */
    updateLoot: function () {
      if (!_visible) return;
      _renderLootList();
    },

    /**
     * Show the extraction button. Call after a floor is cleared.
     * @param {function} onExtract  Callback when player clicks extract
     */
    showExtractButton: function (onExtract) {
      _build();
      _extractEnabled = true;
      if (_extractBtnWrap) _extractBtnWrap.style.display = 'block';

      // Check if player has high-value loot (epic+ rarity) — pulse if so
      var loot = (typeof getDungeonLoot === 'function') ? getDungeonLoot() : [];
      var hasHighValue = false;
      for (var i = 0; i < loot.length; i++) {
        var item = (typeof getLootItemById === 'function') ? getLootItemById(loot[i].item) : null;
        if (item && (item.rarity === 'epic' || item.rarity === 'legendary')) {
          hasHighValue = true;
          break;
        }
      }
      _extractPulse = hasHighValue;
      if (_extractBtn) {
        if (hasHighValue) {
          _extractBtn.classList.add('dhud-extract-pulse');
        } else {
          _extractBtn.classList.remove('dhud-extract-pulse');
        }
      }

      // Wire callback
      if (_extractBtn && onExtract) {
        _extractBtn.onclick = function () {
          _extractEnabled = false;
          if (_extractBtnWrap) _extractBtnWrap.style.display = 'none';
          onExtract();
        };
      }
    },

    /**
     * Hide the extraction button. Call when descending or exiting.
     */
    hideExtractButton: function () {
      _extractEnabled = false;
      _extractPulse = false;
      if (_extractBtnWrap) _extractBtnWrap.style.display = 'none';
      if (_extractBtn) _extractBtn.classList.remove('dhud-extract-pulse');
    },

    /**
     * Set HUD opacity (for fading during active gameplay).
     * @param {number} opacity  0.0 to 1.0
     */
    setOpacity: function (opacity) {
      if (_el) _el.style.opacity = opacity;
    },

    /**
     * Update the boss health bar display.
     * @param {number} currentHP  Current boss HP
     * @param {number} maxHP      Maximum boss HP
     * @param {number} phaseIdx   Current phase index (0-based)
     * @param {object} bossDef    Boss definition from BOSS_DEFINITIONS
     */
    updateBossHealth: function (currentHP, maxHP, phaseIdx, bossDef) {
      _build();

      if (!bossDef || maxHP <= 0) {
        // No boss — hide the bar
        _bossActive = false;
        if (_bossBarWrap) _bossBarWrap.style.display = 'none';
        return;
      }

      _bossActive = true;
      if (_bossBarWrap) _bossBarWrap.style.display = 'block';

      // Boss name
      if (_bossNameEl) {
        _bossNameEl.firstChild.textContent = bossDef.name + ' ';
      }

      // Phase indicator
      if (_bossPhaseEl && bossDef.phases) {
        var phase = bossDef.phases[phaseIdx];
        _bossPhaseEl.textContent = phase ? '— ' + phase.name : '';
      }

      // Health bar fill
      var pct = Math.max(0, Math.min(100, Math.round((currentHP / maxHP) * 100)));
      if (_bossBarFill) {
        _bossBarFill.style.width = pct + '%';
        // Color: green > 60%, yellow > 30%, red <= 30%
        if (pct > 60) {
          _bossBarFill.style.background = '#22c55e';
        } else if (pct > 30) {
          _bossBarFill.style.background = '#fbbf24';
        } else {
          _bossBarFill.style.background = '#ef4444';
        }
      }

      // Health text
      if (_bossBarText) {
        _bossBarText.textContent = Math.ceil(currentHP) + ' / ' + maxHP;
      }
    },

    /**
     * Hide the boss health bar. Call when boss encounter ends.
     */
    hideBossHealth: function () {
      _bossActive = false;
      if (_bossBarWrap) _bossBarWrap.style.display = 'none';
    },
  };
})();
