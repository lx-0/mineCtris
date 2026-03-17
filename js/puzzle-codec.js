// puzzle-codec.js
// Compact puzzle share code: JSON → LZ-string compress → Base64URL encode.
// Self-contained — no external dependencies (LZ-string inlined below).
// Used by editor.js (encode) and main.js (decode).

var PUZZLE_CODEC_VERSION = 1;

// ── Inline LZ-string (URL-safe variant) ───────────────────────────────────────
// Adapted from lz-string by pieroxy.net (MIT license).
// Uses 64-char URL-safe alphabet (A-Z a-z 0-9 - _); 6 bits per character.
// Output contains only [A-Za-z0-9\-_] — no URL escaping required.
var _PuzzleLZ = (function () {
  "use strict";
  var K = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  var R = null; // reverse-map built on first decompress

  function compress(str) {
    if (str == null) return "";
    var BPC = 6; // bits per output character
    var i, val,
        dic = {}, dicToCreate = {},
        c = "", wc = "", w = "",
        enlargeIn = 2, dictSize = 3, numBits = 2,
        out = [], dv = 0, dp = 0;

    function writeBits(v, n) {
      for (var b = 0; b < n; b++) {
        dv = (dv << 1) | (v & 1);
        if (dp === BPC - 1) { dp = 0; out.push(K[dv]); dv = 0; }
        else dp++;
        v >>= 1;
      }
    }

    function checkEnlarge() {
      if (--enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; }
    }

    for (var ii = 0; ii < str.length; ii++) {
      c = str[ii];
      if (!(c in dic)) { dic[c] = dictSize++; dicToCreate[c] = true; }
      wc = w + c;
      if (wc in dic) {
        w = wc;
      } else {
        if (w in dicToCreate) {
          val = w.charCodeAt(0);
          if (val < 256) {
            writeBits(0, numBits);
            writeBits(val, 8);
          } else {
            writeBits(1, numBits);
            writeBits(val, 16);
          }
          checkEnlarge();
          delete dicToCreate[w];
        } else {
          writeBits(dic[w], numBits);
        }
        checkEnlarge();
        dic[wc] = dictSize++;
        w = String(c);
      }
    }
    if (w !== "") {
      if (w in dicToCreate) {
        val = w.charCodeAt(0);
        if (val < 256) {
          writeBits(0, numBits);
          writeBits(val, 8);
        } else {
          writeBits(1, numBits);
          writeBits(val, 16);
        }
        checkEnlarge();
        delete dicToCreate[w];
      } else {
        writeBits(dic[w], numBits);
      }
      checkEnlarge();
    }
    writeBits(2, numBits); // end-of-stream marker
    while (true) { dv <<= 1; if (dp === BPC - 1) { out.push(K[dv]); break; } dp++; }
    return out.join("");
  }

  function decompress(compressed) {
    if (!compressed) return "";
    if (!R) { R = {}; for (var x = 0; x < K.length; x++) R[K[x]] = x; }
    var BPC = 6, resetVal = 1 << (BPC - 1);
    var data = { v: R[compressed[0]], p: resetVal, i: 1 };
    function nextBit() {
      var b = data.v & data.p;
      data.p >>= 1;
      if (data.p === 0) { data.p = resetVal; data.v = R[compressed[data.i++]] || 0; }
      return b > 0 ? 1 : 0;
    }
    function readBits(n) {
      var val = 0, pw = 1;
      for (var b = 0; b < n; b++) { val += nextBit() * pw; pw <<= 1; }
      return val;
    }

    var dic = [0, 1, 2], dictSize = 3, numBits = 3, enlargeIn = 4;
    function checkEnlarge() { if (--enlargeIn === 0) { enlargeIn = Math.pow(2, numBits); numBits++; } }

    // Read first symbol
    var bits = readBits(2), c;
    if      (bits === 0) c = String.fromCharCode(readBits(8));
    else if (bits === 1) c = String.fromCharCode(readBits(16));
    else                 return "";
    dic[3] = c; dictSize = 4;
    var w = c, result = [c];
    while (true) {
      if (data.i > compressed.length) return "";
      bits = readBits(numBits);
      if (bits === 2) break; // end of stream
      var entry;
      if (bits === 0) {
        dic[dictSize++] = String.fromCharCode(readBits(8));
        bits = dictSize - 1;
        checkEnlarge();
      } else if (bits === 1) {
        dic[dictSize++] = String.fromCharCode(readBits(16));
        bits = dictSize - 1;
        checkEnlarge();
      }
      if (dic[bits]) { entry = dic[bits]; }
      else if (bits === dictSize) { entry = w + w[0]; }
      else { return null; }
      result.push(entry);
      dic[dictSize++] = w + entry[0];
      checkEnlarge();
      w = entry;
    }
    return result.join("");
  }

  return { compress: compress, decompress: decompress };
})();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Encode a puzzle state into a compact URL-safe share code.
 *
 * @param {object} payload  { winCondition, blocks, metadata }
 *   winCondition: { mode, n }
 *   blocks:       array of [x, y, z, paletteIdx]
 *   metadata:     { name, description, author, difficulty }
 * @returns {string|null}  URL-safe code, or null on failure.
 */
function puzzleCodecEncode(payload) {
  try {
    var obj = {
      v:  PUZZLE_CODEC_VERSION,
      wc: { m: payload.winCondition.mode, n: payload.winCondition.n },
      b:  payload.blocks,
      meta: {
        n:  payload.metadata.name,
        d:  payload.metadata.description,
        a:  payload.metadata.author,
        df: payload.metadata.difficulty,
      },
    };
    return _PuzzleLZ.compress(JSON.stringify(obj));
  } catch (_) {
    return null;
  }
}

/**
 * Decode a puzzle share code.
 *
 * @param {string} code  URL-safe share code produced by puzzleCodecEncode.
 * @returns {{ ok: true, winCondition, blocks, metadata }
 *          |{ ok: false, error: string, versionMismatch: boolean }}
 */
function puzzleCodecDecode(code) {
  if (!code || typeof code !== "string") {
    return { ok: false, error: "Empty or invalid code.", versionMismatch: false };
  }
  var raw;
  try {
    raw = _PuzzleLZ.decompress(code);
  } catch (_) {
    raw = null;
  }
  if (!raw) {
    return { ok: false, error: "Could not decompress share code.", versionMismatch: false };
  }
  var obj;
  try {
    obj = JSON.parse(raw);
  } catch (_) {
    return { ok: false, error: "Share code is corrupted.", versionMismatch: false };
  }
  if (!obj || typeof obj !== "object") {
    return { ok: false, error: "Share code is corrupted.", versionMismatch: false };
  }
  // Version check
  if (typeof obj.v === "number" && obj.v > PUZZLE_CODEC_VERSION) {
    return {
      ok: false,
      error: "This puzzle was created with a newer version of the editor.",
      versionMismatch: true,
    };
  }
  // Schema validation
  if (!obj.wc || typeof obj.wc.m !== "string") {
    return { ok: false, error: "Share code is missing win condition.", versionMismatch: false };
  }
  if (!Array.isArray(obj.b)) {
    return { ok: false, error: "Share code is missing block data.", versionMismatch: false };
  }
  var meta = obj.meta || {};
  return {
    ok: true,
    winCondition: { mode: obj.wc.m || "mine_all", n: obj.wc.n || 10 },
    blocks: obj.b,
    metadata: {
      name:        String(meta.n  || "").slice(0, 40),
      description: String(meta.d  || "").slice(0, 120),
      author:      String(meta.a  || "").slice(0, 20),
      difficulty:  meta.df  || 0,
    },
  };
}
