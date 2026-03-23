// js/tournament.js — Tournament lobby: browse, register, bracket view, match entry.
// Uses localStorage for persistence (client-side simulation — no server required).

const TOURNAMENT_STORAGE_KEY      = 'mineCtris_tournaments';
const TOURNAMENT_REGISTRATIONS_KEY = 'mineCtris_tournamentRegs';
const TOURNAMENT_MAX_PLAYERS       = 8;

const TournamentStatus = {
  OPEN:        'open',
  IN_PROGRESS: 'in_progress',
  COMPLETED:   'completed',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function _tMakePlayer(name, rating) {
  return { name: name, rating: rating, result: null };
}

function _tBotName() {
  var firsts = ['Notch', 'Creeper', 'Diamond', 'Obsidian', 'Lava', 'Stone',
                'Iron', 'Nether', 'Pixel', 'Block', 'RedDust', 'Cave'];
  var lasts  = ['King', 'Miner', 'Lord', 'Rider', 'Warden', 'Golem',
                'Walker', 'Slayer', 'Smith', 'Digger', 'Stoker', 'Blaster'];
  return firsts[Math.floor(Math.random() * firsts.length)] +
         lasts[Math.floor(Math.random() * lasts.length)] +
         Math.floor(Math.random() * 90 + 10);
}

// ── Seed data ─────────────────────────────────────────────────────────────────

/**
 * Build a fully-resolved 8-player single-elimination bracket.
 * Players must already be sorted by rating descending (seed 1 = index 0).
 */
function _tBuildCompletedBracket(players, modes) {
  modes = modes || ['Survival', 'Score Race', 'Survival', 'Score Race', 'Score Race', 'Survival', 'Score Race'];
  // QF: seed 1v8, 2v7, 3v6, 4v5; slight upset in match 2
  var qf = [
    { p1: players[0], p2: players[7], result: 'p1', live: false, gameMode: modes[0] },
    { p1: players[1], p2: players[6], result: 'p1', live: false, gameMode: modes[1] },
    { p1: players[2], p2: players[5], result: 'p2', live: false, gameMode: modes[2] }, // upset
    { p1: players[3], p2: players[4], result: 'p1', live: false, gameMode: modes[3] },
  ];
  // SF winners: qf0→p1=players[0], qf1→p1=players[1], qf2→p2=players[5], qf3→p1=players[3]
  var sf = [
    { p1: players[0], p2: players[1], result: 'p1', live: false, gameMode: modes[4] },
    { p1: players[5], p2: players[3], result: 'p2', live: false, gameMode: modes[5] }, // players[3] wins
  ];
  // Final: players[0] vs players[3]; players[0] wins championship
  var final = { p1: players[0], p2: players[3], result: 'p1', live: false, gameMode: modes[6] };
  return { qf: qf, sf: sf, final: final };
}

function _tSeedTournaments() {
  var now = Date.now();

  // ── In-progress bracket ──
  var ipPlayers = [];
  for (var i = 0; i < 8; i++) {
    ipPlayers.push(_tMakePlayer(_tBotName(), Math.floor(Math.random() * 500) + 1000));
  }
  ipPlayers.sort(function (a, b) { return b.rating - a.rating; });

  var qf = [
    { p1: ipPlayers[0], p2: ipPlayers[7], result: 'p1', live: false },
    { p1: ipPlayers[1], p2: ipPlayers[6], result: 'p1', live: false },
    { p1: ipPlayers[2], p2: ipPlayers[5], result: null,  live: true  },
    { p1: ipPlayers[3], p2: ipPlayers[4], result: null,  live: false },
  ];
  var sf = [
    { p1: qf[0].p1, p2: qf[1].p1, result: null, live: false },
    { p1: null,     p2: null,      result: null, live: false },
  ];
  var final = { p1: null, p2: null, result: null, live: false };

  // ── Classic Cup — completed with full bracket ──
  var ccPlayers = [];
  for (var j = 0; j < 8; j++) {
    ccPlayers.push(_tMakePlayer(_tBotName(), Math.floor(Math.random() * 400) + 1050));
  }
  ccPlayers.sort(function (a, b) { return b.rating - a.rating; });
  var ccBracket = _tBuildCompletedBracket(ccPlayers);
  var ccWinner  = ccBracket.final.p1.name;

  // ── Winter Blitz — older completed tournament ──
  var wbPlayers = [];
  for (var k = 0; k < 8; k++) {
    wbPlayers.push(_tMakePlayer(_tBotName(), Math.floor(Math.random() * 400) + 1000));
  }
  wbPlayers.sort(function (a, b) { return b.rating - a.rating; });
  var wbBracket = _tBuildCompletedBracket(wbPlayers,
    ['Score Race', 'Survival', 'Score Race', 'Survival', 'Score Race', 'Survival', 'Survival']);
  // Give the underdog (p2) the championship for variety
  wbBracket.final.result = 'p2';
  var wbWinner = wbBracket.final.p2.name;

  return [
    {
      id: 'tourn_grand',
      name: 'Grand Invitational',
      prize: { label: '\u2605 Grand', color: '#ffd700' },
      status: TournamentStatus.OPEN,
      players: [
        _tMakePlayer(_tBotName(), 1380),
        _tMakePlayer(_tBotName(), 1250),
        _tMakePlayer(_tBotName(), 1420),
      ],
      bracket: null,
      matchReady: false,
      createdAt: now - 3600000,
    },
    {
      id: 'tourn_elite',
      name: 'Elite Challenge',
      prize: { label: '\u26A1 Elite', color: '#c0c0c0' },
      status: TournamentStatus.IN_PROGRESS,
      players: ipPlayers,
      bracket: { qf: qf, sf: sf, final: final },
      matchReady: false,
      createdAt: now - 7200000,
    },
    {
      id: 'tourn_classic',
      name: 'Classic Cup',
      prize: { label: '\u2764 Classic', color: '#cd7f32' },
      status: TournamentStatus.COMPLETED,
      players: ccPlayers,
      bracket: ccBracket,
      winner: ccWinner,
      completedAt: now - 79200000,
      matchReady: false,
      createdAt: now - 86400000,
    },
    {
      id: 'tourn_winter',
      name: 'Winter Blitz',
      prize: { label: '\u2744 Winter', color: '#88ccff' },
      status: TournamentStatus.COMPLETED,
      players: wbPlayers,
      bracket: wbBracket,
      winner: wbWinner,
      completedAt: now - 259200000,
      matchReady: false,
      createdAt: now - 345600000,
    },
  ];
}

// ── Storage ───────────────────────────────────────────────────────────────────

function _tLoadTournaments() {
  try {
    var raw = localStorage.getItem(TOURNAMENT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function _tSaveTournaments(data) {
  try { localStorage.setItem(TOURNAMENT_STORAGE_KEY, JSON.stringify(data)); } catch (_) {}
}

function _tLoadRegistrations() {
  try {
    var raw = localStorage.getItem(TOURNAMENT_REGISTRATIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) { return {}; }
}

function _tSaveRegistrations(data) {
  try { localStorage.setItem(TOURNAMENT_REGISTRATIONS_KEY, JSON.stringify(data)); } catch (_) {}
}

// ── Module ────────────────────────────────────────────────────────────────────

var tournamentLobby = (function () {
  var _tournaments     = null;
  var _registrations   = null; // { tournamentId: { playerName, rating, seedPos } }
  var _countdownTimer  = null;
  var _countdownSecs   = 0;
  var _onCountdownEnd  = null;

  // ── Init ──

  function _ensure() {
    if (!_tournaments) {
      _tournaments = _tLoadTournaments();
      if (!_tournaments) {
        _tournaments = _tSeedTournaments();
        _tSaveTournaments(_tournaments);
      }
    }
    if (!_registrations) {
      _registrations = _tLoadRegistrations();
    }
  }

  // ── Accessors ──

  function getAll() {
    _ensure();
    return _tournaments.slice();
  }

  function getById(id) {
    _ensure();
    return _tournaments.find(function (t) { return t.id === id; }) || null;
  }

  function isRegistered(id) {
    _ensure();
    return !!_registrations[id];
  }

  function getRegistration(id) {
    _ensure();
    return _registrations[id] || null;
  }

  // ── Registration ──

  function register(tournamentId) {
    _ensure();
    var t = getById(tournamentId);
    if (!t)                                         return { ok: false, reason: 'not_found' };
    if (t.status !== TournamentStatus.OPEN)         return { ok: false, reason: 'not_open' };
    if (t.players.length >= TOURNAMENT_MAX_PLAYERS) return { ok: false, reason: 'full' };
    if (_registrations[tournamentId])               return { ok: false, reason: 'already_registered' };

    var myName   = _getMyName();
    var myRating = _getMyRating();
    t.players.push(_tMakePlayer(myName, myRating));

    // Estimate seed position by rating rank
    var sorted  = t.players.slice().sort(function (a, b) { return b.rating - a.rating; });
    var seedPos = sorted.findIndex(function (p) { return p.name === myName; }) + 1;

    _registrations[tournamentId] = { playerName: myName, rating: myRating, seedPos: seedPos };
    _tSaveTournaments(_tournaments);
    _tSaveRegistrations(_registrations);
    if (typeof recordSeasonTournamentEntered === 'function') recordSeasonTournamentEntered();
    if (typeof onSeasonMissionTournamentEntered === 'function') onSeasonMissionTournamentEntered();

    return { ok: true, seedPos: seedPos, rating: myRating, count: t.players.length };
  }

  // ── Helpers ──

  function _getMyName() {
    try { return localStorage.getItem('mineCtris_displayName') || 'You'; } catch (_) { return 'You'; }
  }

  function _getMyRating() {
    if (typeof loadBattleRating === 'function') return loadBattleRating().rating;
    return 1000;
  }

  // ── Match result ──

  /**
   * Record a match result for the player in a tournament bracket.
   * Advances winner through the bracket; marks tournament completed when Final is done.
   * If the player wins the whole tournament (Final match), applies the +50 rating bonus.
   * @param {string} tournamentId
   * @param {boolean} won  true if the player won this match
   * @returns {{ advanced: boolean, tournamentWon: boolean }}
   */
  function recordMatchResult(tournamentId, won) {
    _ensure();
    var t = getById(tournamentId);
    if (!t || t.status !== TournamentStatus.IN_PROGRESS || !t.bracket) {
      return { advanced: false, tournamentWon: false };
    }

    var myName = _getMyName();
    var rounds = [t.bracket.qf, t.bracket.sf, [t.bracket.final]].filter(Boolean);
    var advanced = false;
    var tournamentWon = false;

    for (var ri = 0; ri < rounds.length; ri++) {
      var round = rounds[ri];
      for (var mi = 0; mi < round.length; mi++) {
        var match = round[mi];
        if (!match || match.result) continue; // already resolved
        var isP1 = match.p1 && match.p1.name === myName;
        var isP2 = match.p2 && match.p2.name === myName;
        if (!isP1 && !isP2) continue;

        // Record result
        match.result = won ? (isP1 ? 'p1' : 'p2') : (isP1 ? 'p2' : 'p1');
        match.live   = false;
        advanced = true;

        // Determine winner object
        var winner = won ? (isP1 ? match.p1 : match.p2) : (isP1 ? match.p2 : match.p1);

        // Is this the Final match?
        if (ri === rounds.length - 1) {
          t.status = TournamentStatus.COMPLETED;
          t.winner = winner ? winner.name : null;
          t.completedAt = Date.now();
          if (won) {
            tournamentWon = true;
            // Apply +50 rating bonus for tournament winner
            if (typeof applyTournamentWinBonus === 'function') {
              applyTournamentWinBonus();
            }
          }
        } else {
          // Advance winner to next round slot
          var nextRound = rounds[ri + 1];
          var nextSlotIdx = Math.floor(mi / 2);
          if (nextRound && nextRound[nextSlotIdx]) {
            var nextMatch = nextRound[nextSlotIdx];
            if (mi % 2 === 0) { nextMatch.p1 = winner; }
            else              { nextMatch.p2 = winner; }
          }
          // If player won the semi-final, they've reached the Final
          if (won && ri === rounds.length - 2) {
            if (typeof achOnTournamentFinalReached === 'function') achOnTournamentFinalReached();
          }
        }
        break;
      }
      if (advanced) break;
    }

    _tSaveTournaments(_tournaments);

    // Fire tournament achievements
    if (advanced && won) {
      // Count how many matches this player has won in this tournament
      var winsInTournament = 0;
      var allRounds = [t.bracket.qf, t.bracket.sf, [t.bracket.final]].filter(Boolean);
      allRounds.forEach(function (round) {
        round.forEach(function (match) {
          if (!match || !match.result) return;
          var isP1 = match.p1 && match.p1.name === myName;
          var isP2 = match.p2 && match.p2.name === myName;
          if ((isP1 && match.result === 'p1') || (isP2 && match.result === 'p2')) {
            winsInTournament++;
          }
        });
      });
      if (typeof achOnTournamentMatchWin === 'function') achOnTournamentMatchWin(winsInTournament);
      if (typeof onSeasonMissionTournamentMatchWon === 'function') onSeasonMissionTournamentMatchWon();
    }
    if (tournamentWon) {
      if (typeof achOnTournamentWon === 'function') achOnTournamentWon();
    }

    return { advanced: advanced, tournamentWon: tournamentWon };
  }

  // ── Registrations accessor ──

  function getRegistrations() {
    _ensure();
    return Object.assign({}, _registrations);
  }

  // ── Past tournaments ──

  /** Returns completed tournaments sorted by completedAt descending (most recent first). */
  function getPast() {
    _ensure();
    return _tournaments
      .filter(function (t) { return t.status === TournamentStatus.COMPLETED; })
      .sort(function (a, b) { return (b.completedAt || b.createdAt) - (a.completedAt || a.createdAt); });
  }

  /**
   * Returns the current player's tournament history stats.
   * { entered, wins, bestFinish: 'Champion'|'Finalist'|null }
   */
  function getTournamentStats() {
    _ensure();
    var myName = _getMyName();
    var entered = 0;
    var wins    = 0;
    var finalist = false;

    _tournaments.forEach(function (t) {
      if (!_registrations[t.id]) return;
      entered++;
      if (t.status !== TournamentStatus.COMPLETED) return;
      if (t.winner === myName) {
        wins++;
      } else if (t.bracket && t.bracket.final) {
        var f = t.bracket.final;
        if ((f.p1 && f.p1.name === myName) || (f.p2 && f.p2.name === myName)) {
          finalist = true;
        }
      }
    });

    var bestFinish = wins > 0 ? 'Champion' : finalist ? 'Finalist' : null;
    return { entered: entered, wins: wins, bestFinish: bestFinish };
  }

  // ── Countdown ──

  function startCountdown(secs, onEnd) {
    stopCountdown();
    _countdownSecs  = secs;
    _onCountdownEnd = onEnd;
    _countdownTimer = setInterval(function () {
      _countdownSecs--;
      if (typeof _onCountdownTick === 'function') _onCountdownTick(_countdownSecs);
      if (_countdownSecs <= 0) {
        stopCountdown();
        if (_onCountdownEnd) _onCountdownEnd();
      }
    }, 1000);
  }

  function stopCountdown() {
    if (_countdownTimer) { clearInterval(_countdownTimer); _countdownTimer = null; }
    _countdownSecs  = 0;
    _onCountdownEnd = null;
  }

  function getCountdownSecs() { return _countdownSecs; }

  // ── Match room code (for spectator Watch buttons in bracket) ──

  /**
   * Store the battle room code for the player's current live tournament match.
   * This is called when the host creates a room for a tournament match.
   * Stores in localStorage so spectators can discover it via the bracket view.
   * @param {string} roomCode  4-character room code
   */
  function setMatchRoomCode(roomCode) {
    _ensure();
    // Find the live match involving the current player across all tournaments
    var myName = _getMyName();
    var changed = false;
    _tournaments.forEach(function (t) {
      if (t.status !== TournamentStatus.IN_PROGRESS || !t.bracket) return;
      var rounds = [t.bracket.qf, t.bracket.sf, [t.bracket.final]].filter(Boolean);
      rounds.forEach(function (round) {
        round.forEach(function (match) {
          if (!match || match.result || !match.live) return;
          var isInMatch = (match.p1 && match.p1.name === myName) ||
                          (match.p2 && match.p2.name === myName);
          if (isInMatch) {
            match.roomCode = roomCode;
            changed = true;
          }
        });
      });
    });
    if (changed) _tSaveTournaments(_tournaments);
  }

  return {
    getAll:               getAll,
    getById:              getById,
    getPast:              getPast,
    getTournamentStats:   getTournamentStats,
    isRegistered:         isRegistered,
    getRegistration:      getRegistration,
    getRegistrations:     getRegistrations,
    register:             register,
    recordMatchResult:    recordMatchResult,
    setMatchRoomCode:     setMatchRoomCode,
    startCountdown:       startCountdown,
    stopCountdown:        stopCountdown,
    getCountdownSecs:     getCountdownSecs,
  };
}());

// ── Countdown tick callback — set by UI layer ─────────────────────────────────
var _onCountdownTick = null;
