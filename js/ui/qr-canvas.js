// qr-canvas.js — QR Code renderer via Canvas API only. No external libraries.
// API: QRCanvas.draw(canvas, text, opts)
//   opts: { scale: 4, margin: 4, dark: '#000', light: '#fff' }
// Supports byte mode, versions 1-20, L error correction.
(function (global) {
  "use strict";

  // ── GF(256) ───────────────────────────────────────────────────────────────
  var GF_EXP = new Uint8Array(512), GF_LOG = new Uint8Array(256);
  (function () {
    for (var i = 0, x = 1; i < 255; i++) {
      GF_EXP[i] = x; GF_LOG[x] = i;
      x ^= x << 1 ^ (x & 128 ? 0x11D : 0); x &= 255;
    }
    for (var i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
  })();
  function gfMul(a, b) { return a && b ? GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255] : 0; }

  // ── Reed-Solomon ──────────────────────────────────────────────────────────
  function rsGenPoly(n) {
    var g = [1];
    for (var i = 0; i < n; i++) {
      var ng = new Array(g.length + 1).fill(0);
      for (var j = 0; j < g.length; j++) {
        ng[j] ^= g[j]; ng[j + 1] ^= gfMul(g[j], GF_EXP[i]);
      }
      g = ng;
    }
    return g;
  }
  function rsEncode(data, nec) {
    var g = rsGenPoly(nec);
    var msg = data.slice().concat(new Array(nec).fill(0));
    for (var i = 0; i < data.length; i++) {
      var c = msg[i];
      if (c) for (var j = 0; j < g.length; j++) msg[i + j] ^= gfMul(c, g[j]);
    }
    return msg.slice(data.length);
  }

  // ── Tables ────────────────────────────────────────────────────────────────
  // L error correction: [ecPerBlock, g1Blocks, g1DataCW, g2Blocks, g2DataCW]
  var EC_L = [null,
    [7,1,19,0,0],[10,1,34,0,0],[15,1,55,0,0],[20,1,80,0,0],
    [26,1,108,0,0],[18,2,68,0,0],[20,2,78,0,0],[24,2,97,0,0],
    [30,2,116,0,0],[18,2,68,2,69],[20,4,81,0,0],[24,2,92,2,93],
    [26,4,107,0,0],[30,3,115,1,116],[22,5,87,1,88],[24,5,98,1,99],
    [28,1,107,5,108],[30,5,120,1,121],[28,3,113,4,114],[28,3,107,5,108],
  ];
  var BYTE_CAP = [0,17,32,53,78,106,134,154,192,230,271,321,367,428,461,523,589,647,718,792,858];
  var ALIGN = [[],[],[6,18],[6,22],[6,26],[6,30],[6,34],
    [6,22,38],[6,24,42],[6,26,46],[6,28,50],[6,30,54],[6,32,58],[6,34,62],
    [6,26,46,66],[6,26,48,70],[6,26,50,74],[6,30,54,78],[6,30,56,82],
    [6,30,58,86],[6,34,62,90],
  ];

  // ── BCH helpers ───────────────────────────────────────────────────────────
  function bchFormat(d5) {
    var rem = d5 << 10;
    for (var i = 14; i >= 10; i--) if (rem >> i & 1) rem ^= 0x537 << (i - 10);
    return ((d5 << 10) | (rem & 0x3FF)) ^ 0x5412;
  }
  function bchVersion(v) {
    var rem = v << 12;
    for (var i = 17; i >= 12; i--) if (rem >> i & 1) rem ^= 0x1F25 << (i - 12);
    return (v << 12) | (rem & 0xFFF);
  }

  // ── Encode bytes (UTF-8) ──────────────────────────────────────────────────
  function toUTF8(text) {
    var b = [];
    for (var i = 0; i < text.length; i++) {
      var cp = text.charCodeAt(i);
      if (cp < 0x80) b.push(cp);
      else if (cp < 0x800) b.push(0xC0 | cp >> 6, 0x80 | cp & 63);
      else b.push(0xE0 | cp >> 12, 0x80 | (cp >> 6) & 63, 0x80 | cp & 63);
    }
    return b;
  }

  function buildCodewords(ver, dataBytes) {
    var spec = EC_L[ver];
    var ecPB = spec[0], g1b = spec[1], g1d = spec[2], g2b = spec[3], g2d = spec[4];
    var totalData = g1b * g1d + g2b * g2d;
    var ccBits = ver < 10 ? 8 : 16;

    var bits = [];
    function push(v, n) { for (var i = n-1; i >= 0; i--) bits.push((v>>i)&1); }
    push(4, 4); push(dataBytes.length, ccBits);
    for (var i = 0; i < dataBytes.length; i++) push(dataBytes[i], 8);
    for (var i = 0; i < 4 && bits.length < totalData*8; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);
    var pad = [0xEC, 0x11], pi = 0;
    while (bits.length < totalData*8) { push(pad[pi++ & 1], 8); }

    var cw = [];
    for (var i = 0; i < bits.length; i += 8) {
      var b = 0; for (var j = 0; j < 8; j++) b = (b<<1)|bits[i+j]; cw.push(b);
    }

    // Split into blocks and encode RS
    var blocks = [], pos = 0;
    for (var i = 0; i < g1b; i++) { blocks.push(cw.slice(pos, pos+g1d)); pos += g1d; }
    for (var i = 0; i < g2b; i++) { blocks.push(cw.slice(pos, pos+g2d)); pos += g2d; }
    var ecBlocks = blocks.map(function(bl) { return rsEncode(bl, ecPB); });

    // Interleave
    var result = [];
    var maxD = Math.max(g1d, g2d || 0);
    for (var i = 0; i < maxD; i++) for (var j = 0; j < blocks.length; j++) if (i < blocks[j].length) result.push(blocks[j][i]);
    for (var i = 0; i < ecPB; i++) for (var j = 0; j < ecBlocks.length; j++) result.push(ecBlocks[j][i]);
    return result;
  }

  // ── Matrix ────────────────────────────────────────────────────────────────
  var FMT1 = [[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[8,7],[8,8],[7,8],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8]];

  function makeMatrix(ver, cw) {
    var N = 4*ver+17;
    var mat = [];
    for (var i = 0; i < N; i++) { mat.push(new Int8Array(N)); mat[i].fill(-1); }

    function set(r, c, dark) { if (r>=0&&r<N&&c>=0&&c<N) mat[r][c] = dark?1:0; }

    // Finder patterns
    function finder(tr, tc) {
      for (var dr = 0; dr < 7; dr++)
        for (var dc = 0; dc < 7; dc++) {
          var d = dr===0||dr===6||dc===0||dc===6||(dr>=2&&dr<=4&&dc>=2&&dc<=4);
          set(tr+dr, tc+dc, d);
        }
    }
    finder(0,0); finder(0,N-7); finder(N-7,0);

    // Separators
    for (var i = 0; i < 8; i++) {
      set(7,i,false); set(i,7,false);
      set(7,N-1-i,false); set(i,N-8,false);
      set(N-8,i,false); set(N-1-i,7,false);
    }

    // Timing
    for (var i = 8; i < N-8; i++) { set(6,i,i%2===0); set(i,6,i%2===0); }

    // Dark module
    set(4*ver+9, 8, true);

    // Alignment patterns — skip if center already placed
    var ac = ALIGN[ver];
    for (var i = 0; i < ac.length; i++)
      for (var j = 0; j < ac.length; j++) {
        var r = ac[i], c = ac[j];
        if (mat[r][c] !== -1) continue;
        for (var dr = -2; dr <= 2; dr++)
          for (var dc = -2; dc <= 2; dc++) {
            var d = dr===-2||dr===2||dc===-2||dc===2||(dr===0&&dc===0);
            set(r+dr, c+dc, d);
          }
      }

    // Reserve format info areas (value 0 = light placeholder)
    for (var i = 0; i < 15; i++) {
      var r = FMT1[i][0], c = FMT1[i][1];
      if (mat[r][c] === -1) mat[r][c] = 0;
    }
    for (var i = 0; i < 8; i++) { var c = N-1-i; if(mat[8][c]===-1) mat[8][c]=0; }
    for (var i = 0; i < 7; i++) { var r = N-7+i; if(mat[r][8]===-1) mat[r][8]=0; }

    // Version info (v7+)
    if (ver >= 7) {
      var vi = bchVersion(ver);
      for (var i = 0; i < 18; i++) {
        var bit = (vi>>i)&1, r = i%6, c = Math.floor(i/6);
        set(r, N-11+c, !!bit); set(N-11+c, r, !!bit);
      }
    }

    // Place data bits
    var bits = [];
    for (var i = 0; i < cw.length; i++) for (var b = 7; b >= 0; b--) bits.push((cw[i]>>b)&1);
    var bi = 0, up = true, col = N-1;
    while (col > 0) {
      if (col === 6) col--;
      for (var r = (up?N-1:0); up?r>=0:r<N; r+=(up?-1:1))
        for (var dc = 0; dc <= 1; dc++) {
          var c = col-dc;
          if (c >= 0 && mat[r][c] === -1) {
            mat[r][c] = (bi < bits.length && bits[bi]) ? 3 : 2; bi++;
          }
        }
      col -= 2; up = !up;
    }
    return mat;
  }

  // ── Masking ───────────────────────────────────────────────────────────────
  var MASK_FN = [
    function(r,c){return (r+c)%2===0;},
    function(r){return r%2===0;},
    function(r,c){return c%3===0;},
    function(r,c){return (r+c)%3===0;},
    function(r,c){return (Math.floor(r/2)+Math.floor(c/3))%2===0;},
    function(r,c){return r*c%2+r*c%3===0;},
    function(r,c){return (r*c%2+r*c%3)%2===0;},
    function(r,c){return ((r+c)%2+r*c%3)%2===0;},
  ];

  function applyMask(mat, N, maskId) {
    var fn = MASK_FN[maskId];
    for (var r = 0; r < N; r++)
      for (var c = 0; c < N; c++)
        if (mat[r][c] >= 2 && fn(r,c)) mat[r][c] ^= 1; // flip data modules
  }

  function scoreMask(mat, N) {
    var score = 0;
    // Rule 1: runs of 5+
    for (var r = 0; r < N; r++) {
      for (var isRow = 0; isRow < 2; isRow++) {
        var run = 1, cur = isRow ? mat[r][0] : mat[0][r];
        for (var i = 1; i < N; i++) {
          var v = isRow ? mat[r][i] : mat[i][r];
          var bit = v&1;
          if (bit === (cur&1)) { run++; if (run===5) score+=3; else if (run>5) score++; }
          else { run=1; cur=v; }
        }
      }
    }
    // Rule 2: 2x2 blocks
    for (var r = 0; r < N-1; r++)
      for (var c = 0; c < N-1; c++) {
        var b = mat[r][c]&1;
        if ((mat[r][c+1]&1)===b&&(mat[r+1][c]&1)===b&&(mat[r+1][c+1]&1)===b) score+=3;
      }
    // Rule 3: finder-like pattern
    var P1 = [1,0,1,1,1,0,1,0,0,0,0], P2 = [0,0,0,0,1,0,1,1,1,0,1];
    for (var r = 0; r < N; r++)
      for (var isRow = 0; isRow < 2; isRow++)
        for (var c = 0; c <= N-11; c++) {
          var m1 = true, m2 = true;
          for (var k = 0; k < 11; k++) {
            var v = isRow ? mat[r][c+k]&1 : mat[c+k][r]&1;
            if (v !== P1[k]) m1 = false;
            if (v !== P2[k]) m2 = false;
          }
          if (m1 || m2) score += 40;
        }
    // Rule 4: dark ratio
    var dark = 0;
    for (var r = 0; r < N; r++) for (var c = 0; c < N; c++) dark += mat[r][c]&1;
    var k = Math.floor(Math.abs(dark*20/N/N - 10)/5);
    score += 10*k;
    return score;
  }

  function placeFormat(mat, N, fmtStr) {
    for (var i = 0; i < 15; i++) {
      var bit = (fmtStr>>(14-i))&1, r=FMT1[i][0], c=FMT1[i][1];
      mat[r][c] = bit ? 1 : 0;
    }
    for (var i = 0; i < 8; i++) mat[8][N-1-i] = (fmtStr>>i)&1 ? 1 : 0;
    mat[8][N-8] = (fmtStr>>7)&1 ? 1 : 0;
    for (var i = 0; i < 7; i++) mat[N-7+i][8] = (fmtStr>>(8+i))&1 ? 1 : 0;
  }

  // ── Main ──────────────────────────────────────────────────────────────────
  function buildQR(text) {
    var bytes = toUTF8(text);
    var ver = 1;
    while (ver <= 20 && BYTE_CAP[ver] < bytes.length) ver++;
    if (ver > 20) return null;

    var cw = buildCodewords(ver, bytes);
    var mat = makeMatrix(ver, cw);
    var N = 4*ver+17;

    // Try all 8 masks, pick best score
    var bestMask = 0, bestScore = Infinity;
    for (var m = 0; m < 8; m++) {
      var tmp = [];
      for (var r = 0; r < N; r++) tmp.push(new Int8Array(mat[r]));
      applyMask(tmp, N, m);
      placeFormat(tmp, N, bchFormat((1<<3)|m)); // L=01b
      var s = scoreMask(tmp, N);
      if (s < bestScore) { bestScore = s; bestMask = m; }
    }

    applyMask(mat, N, bestMask);
    placeFormat(mat, N, bchFormat((1<<3)|bestMask));
    return { mat: mat, size: N };
  }

  // ── Draw ──────────────────────────────────────────────────────────────────
  function draw(canvas, text, opts) {
    opts = opts || {};
    var scale  = opts.scale  || 4;
    var margin = opts.margin !== undefined ? opts.margin : 4;
    var dark   = opts.dark   || '#000000';
    var light  = opts.light  || '#ffffff';

    var qr = buildQR(text);
    if (!qr) { console.warn('QRCanvas: text too long for v20'); return; }

    var N = qr.size;
    var total = (N + 2*margin) * scale;
    canvas.width = canvas.height = total;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = light;
    ctx.fillRect(0, 0, total, total);
    ctx.fillStyle = dark;
    for (var r = 0; r < N; r++)
      for (var c = 0; c < N; c++)
        if (qr.mat[r][c] & 1)
          ctx.fillRect((c+margin)*scale, (r+margin)*scale, scale, scale);
  }

  global.QRCanvas = { draw: draw };
})(window);
