// Share modal wiring — called once from init().
// Requires: ui/shareland.js loaded first.

function _initShareModal() {
  (function () {
    var modal = document.getElementById("puzzle-share-modal");
    var closeBtn = document.getElementById("psm-close-btn");
    var copyBtn = document.getElementById("psm-copy-btn");
    var feedback = document.getElementById("psm-copy-feedback");
    if (closeBtn) closeBtn.addEventListener("click", function () { if (modal) modal.style.display = "none"; });
    if (modal) modal.addEventListener("click", function (e) { if (e.target === modal) modal.style.display = "none"; });
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var input = document.getElementById("psm-url-input");
        if (!input) return;
        var url = input.value;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function () {
            copyBtn.textContent = "\u2713 Copied!";
            if (feedback) feedback.textContent = "Link copied to clipboard!";
            setTimeout(function () {
              copyBtn.textContent = "\uD83D\uDD17 Copy Link";
              if (feedback) feedback.textContent = "";
            }, 2000);
          }).catch(function () {
            window.prompt("Copy puzzle link:", url);
          });
        } else {
          window.prompt("Copy puzzle link:", url);
        }
      });
    }

    // Publish to Community button
    var publishBtn = document.getElementById("psm-publish-btn");
    var publishFeedback = document.getElementById("psm-publish-feedback");
    if (publishBtn) {
      publishBtn.addEventListener("click", function () {
        var input = document.getElementById("psm-url-input");
        if (!input) return;
        var puzzleParam;
        try {
          puzzleParam = new URL(input.value).searchParams.get("puzzle");
        } catch (_) { return; }
        if (!puzzleParam) return;
        var code = decodeURIComponent(puzzleParam);

        // Get or generate creator ID
        var creatorId = localStorage.getItem("mineCtris_creatorId");
        if (!creatorId) {
          creatorId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
          });
          localStorage.setItem("mineCtris_creatorId", creatorId);
        }

        publishBtn.textContent = "Publishing\u2026";
        publishBtn.disabled = true;
        if (publishFeedback) publishFeedback.textContent = "";

        var workerUrl = (typeof LEADERBOARD_WORKER_URL !== "undefined")
          ? LEADERBOARD_WORKER_URL
          : "https://minectris-leaderboard.workers.dev";

        fetch(workerUrl + "/api/puzzles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: code }),
        })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.id) {
            // Track this puzzle ID so we can check play count achievements later
            var published;
            try { published = JSON.parse(localStorage.getItem("mineCtris_publishedPuzzles") || "[]"); } catch (_) { published = []; }
            if (published.indexOf(data.id) === -1) {
              published.push(data.id);
              localStorage.setItem("mineCtris_publishedPuzzles", JSON.stringify(published));
            }
            // Unlock Workshop Owner achievement
            if (typeof achOnPuzzlePublished === "function") achOnPuzzlePublished();
            publishBtn.textContent = "\u2713 Published!";
            if (publishFeedback) publishFeedback.textContent = "Your puzzle is live in the community!";
          } else {
            throw new Error(data.error || "Publish failed");
          }
        })
        .catch(function (err) {
          publishBtn.textContent = "\u{1F310} Publish to Community";
          publishBtn.disabled = false;
          if (publishFeedback) publishFeedback.textContent = "Could not publish. " + (err.message || "Try again.");
        });
      });
    }
  })();

}
