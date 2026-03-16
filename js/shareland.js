// Share landing page — detects ?share= URL param and shows a styled score card modal.
// Must be loaded after DOM is ready (placed before main.js at bottom of body).

(function () {
  "use strict";

  var LEADERBOARD_URL = "https://minetris.pages.dev"; // base URL for leaderboard link

  /** Parse the ?share= and ?sname= params from the current URL. */
  function parseShareParams() {
    var params = new URLSearchParams(location.search);
    var share = params.get("share");
    var sname = params.get("sname") || "";
    if (!share) return null;

    // Format: Mode-score-lines-MMSS  e.g. "Classic-12500-42-0342"
    var parts = share.split("-");
    if (parts.length < 4) return null;

    var mode = parts[0];
    var score = parseInt(parts[1], 10);
    var lines = parseInt(parts[2], 10);
    var timeRaw = parts[3]; // MMSS string e.g. "0342"

    if (isNaN(score) || isNaN(lines)) return null;

    var mm = timeRaw.length >= 4 ? timeRaw.slice(0, 2) : "00";
    var ss = timeRaw.length >= 4 ? timeRaw.slice(2, 4) : timeRaw.padStart(2, "0");
    var timeStr = mm + ":" + ss;

    return { mode: mode, score: score, lines: lines, timeStr: timeStr, sname: sname };
  }

  /** Format a number with locale comma separators. */
  function fmtNum(n) {
    return n.toLocaleString();
  }

  /** Build and show the score card modal. */
  function showShareCard(data) {
    var modal = document.getElementById("share-card-modal");
    if (!modal) return;

    // Headline
    var headline = document.getElementById("sc-headline");
    if (headline) {
      if (data.sname) {
        headline.textContent = data.sname + " scored " + fmtNum(data.score) + " in " + data.mode + "!";
      } else {
        headline.textContent = "Score " + fmtNum(data.score) + " in " + data.mode + "!";
      }
    }

    // Subline
    var subline = document.getElementById("sc-subline");
    if (subline) {
      subline.textContent = "Can you beat it?";
    }

    // Stats rows
    var statsEl = document.getElementById("sc-stats");
    if (statsEl) {
      statsEl.innerHTML =
        "<div><span class='sc-label'>SCORE</span><br>" + fmtNum(data.score) + "</div>" +
        "<div><span class='sc-label'>LINES</span><br>" + data.lines + "</div>" +
        "<div><span class='sc-label'>TIME</span><br>" + data.timeStr + "</div>" +
        "<div><span class='sc-label'>MODE</span><br>" + data.mode + "</div>";
    }

    // Leaderboard link (only if player has a display name)
    var lbLink = document.getElementById("sc-lb-link");
    if (lbLink) {
      if (data.sname) {
        lbLink.textContent = "View " + data.sname + "'s rank on the leaderboard";
        lbLink.style.display = "block";
        lbLink.onclick = function () {
          // Open leaderboard panel if available, otherwise no-op
          var lbBtn = document.getElementById("mode-select-lb-btn");
          modal.style.display = "none";
          // Show mode select first, then trigger leaderboard
          var modeSelectEl = document.getElementById("mode-select");
          if (modeSelectEl && modeSelectEl.style.display !== "none") {
            if (lbBtn) lbBtn.click();
          } else {
            // Trigger via start button click chain
            var startBtn = document.getElementById("start-random-btn");
            if (startBtn) {
              startBtn.click();
              // After mode select shows, open leaderboard
              setTimeout(function () {
                var lbBtn2 = document.getElementById("mode-select-lb-btn");
                if (lbBtn2) lbBtn2.click();
              }, 100);
            }
          }
        };
      } else {
        lbLink.style.display = "none";
      }
    }

    modal.style.display = "flex";
  }

  /** Wire up the Play Now button to dismiss modal and show mode select. */
  function initPlayNowBtn(modal) {
    var playBtn = document.getElementById("sc-play-btn");
    if (!playBtn) return;
    playBtn.onclick = function () {
      modal.style.display = "none";
      // Trigger the start flow via the start button (bubbles to blocker click handler)
      var startBtn = document.getElementById("start-random-btn");
      if (startBtn) startBtn.click();
    };
  }

  /** Wire up the dismiss (X) button. */
  function initDismissBtn(modal) {
    var dismissBtn = document.getElementById("sc-dismiss-btn");
    if (!dismissBtn) return;
    dismissBtn.onclick = function () {
      modal.style.display = "none";
    };
  }

  /** Entry point — called after DOM is ready. */
  function init() {
    var data = parseShareParams();
    if (!data) return; // No share param — nothing to do.

    var modal = document.getElementById("share-card-modal");
    if (!modal) return;

    showShareCard(data);
    initPlayNowBtn(modal);
    initDismissBtn(modal);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
