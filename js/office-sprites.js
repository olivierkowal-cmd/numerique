/* Studio - sprites pixel art du Bureau de Studio.
   Chaque sprite = { pal:{car:'#hex'}, frames:[ [rangées de caractères], ... ] } ; '.' = transparent.
   Les sprites sont construits au chargement à partir de définitions compactes (aucune dépendance).
   Studio.sprites._meta.problems doit être un tableau vide (contrôle dimensions / palette). */
(function () {
  'use strict';
  window.Studio = window.Studio || {};

  var OL = '#2b1d2a'; // contour sombre 1px

  // ---------- petit moteur de grille ----------
  function G(w, h) {
    var g = { w: w, h: h, d: [] };
    for (var j = 0; j < h; j++) { var row = []; for (var i = 0; i < w; i++) row.push('.'); g.d.push(row); }
    g.set = function (x, y, c) { if (x >= 0 && y >= 0 && x < w && y < h) g.d[y][x] = c; };
    g.get = function (x, y) { return (x >= 0 && y >= 0 && x < w && y < h) ? g.d[y][x] : '.'; };
    g.rect = function (x0, y0, x1, y1, c) { for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) g.set(x, y, c); };
    g.px = function (list, c) { list.forEach(function (p) { g.set(p[0], p[1], c); }); };
    g.circle = function (cx, cy, r, base, hi, lo) {
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= r * r) { var s = dx + dy; g.set(x, y, s < -r * 0.7 ? hi : s > r * 0.7 ? lo : base); }
      }
    };
    g.mirror = function () { g.d = g.d.map(function (r) { return r.slice().reverse(); }); };
    g.outline = function () {
      var add = [], n = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) if (g.d[y][x] === '.') {
        if (n.some(function (v) { var c = g.get(x + v[0], y + v[1]); return c !== '.' && c !== 'o'; })) add.push([x, y]);
      }
      add.forEach(function (p) { g.d[p[1]][p[0]] = 'o'; });
    };
    g.rows = function () { return g.d.map(function (r) { return r.join(''); }); };
    return g;
  }

  var seed = 7;
  function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

  var S = {};
  function emit(name, pal, grids) {
    var p = { o: OL };
    for (var k in pal) p[k] = pal[k];
    S[name] = { pal: p, frames: grids.map(function (g) { return g.rows(); }) };
  }

  // ---------- tuiles ----------
  (function () {
    var g = G(16, 16), x, y;
    for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) g.set(x, y, ((x >> 3) + (y >> 3)) % 2 ? 'b' : 'a');
    for (var i = 0; i < 9; i++) g.set(Math.floor(rnd() * 16), Math.floor(rnd() * 16), 'c');
    emit('tile_floor', { a: '#ecdcc1', b: '#e4d2b4', c: '#d8c3a1' }, [g]);

    var w = G(16, 16);
    w.rect(0, 0, 15, 15, 'a'); w.rect(0, 0, 15, 0, 'c');
    w.rect(0, 1, 0, 10, 'b'); w.rect(8, 1, 8, 10, 'b'); w.rect(0, 11, 15, 11, 'f');
    w.px([[3, 4], [12, 7], [5, 9]], 'b');
    w.rect(0, 12, 15, 12, 'e'); w.rect(0, 13, 15, 15, 'd');
    emit('tile_wall', { a: '#d9b995', b: '#cfae88', c: '#e8cdab', f: '#b8956f', e: '#98694a', d: '#7b5539' }, [w]);
  })();

  // ---------- bureau ----------
  (function () {
    var g = G(32, 16);
    g.rect(1, 1, 30, 10, 'w'); g.rect(1, 1, 30, 1, 'W');
    [[3, 4, 9], [14, 4, 8], [22, 6, 7], [5, 7, 10], [17, 8, 9], [4, 9, 6], [25, 9, 4]].forEach(function (a) { g.rect(a[0], a[1], a[0] + a[2], a[1], 'W'); });
    g.rect(1, 11, 30, 12, 'd'); g.rect(1, 12, 30, 12, 'D');
    g.rect(2, 13, 4, 14, 'D'); g.rect(27, 13, 29, 14, 'D');
    g.rect(19, 11, 25, 11, 'k');
    g.outline();
    emit('desk', { w: '#c98d55', W: '#dba66f', d: '#a96d3d', D: '#7f4f2b', k: '#ecc77d' }, [g]);
  })();

  // ---------- ordinateurs ----------
  function monitor(screen) {
    var g = G(16, 16);
    g.rect(1, 1, 14, 10, 'k'); g.rect(1, 1, 14, 1, 'K');
    g.rect(2, 2, 13, 8, 's'); screen(g);
    g.rect(7, 11, 8, 12, 'n'); g.rect(5, 13, 10, 13, 'N');
    g.rect(3, 14, 12, 14, 'Y'); g.px([[5, 14], [8, 14], [10, 14]], 'Z');
    g.set(12, 9, 'v');
    g.outline();
    return g;
  }
  var cpal = { k: '#3a3f4b', K: '#555b6b', s: '#1f2530', x: '#2e384a', B: '#1b3a5c', t: '#9bd1ff', u: '#ffd166', v: '#7ee0a1', n: '#8a8f9c', N: '#6b7080', Y: '#efe8da', Z: '#c9bfae', w: '#ffffff' };
  emit('computer_off', cpal, [monitor(function (g) { g.px([[3, 7], [4, 6], [5, 5], [6, 4], [8, 7], [9, 6], [10, 5]], 'x'); })]);
  emit('computer_on', cpal, [
    monitor(function (g) { g.rect(2, 2, 13, 8, 'B'); g.rect(3, 3, 8, 3, 't'); g.rect(4, 4, 6, 4, 'u'); g.rect(4, 5, 10, 5, 'v'); g.rect(3, 6, 7, 6, 't'); g.set(9, 7, 'w'); }),
    monitor(function (g) { g.rect(2, 2, 13, 8, 'B'); g.rect(3, 3, 6, 3, 't'); g.rect(4, 4, 9, 4, 'u'); g.rect(4, 5, 7, 5, 'v'); g.rect(3, 6, 10, 6, 't'); g.rect(3, 7, 4, 7, 'u'); g.set(6, 7, 'w'); })
  ]);

  // ---------- plante ----------
  (function () {
    var g = G(16, 16);
    g.circle(5, 5, 3, 'l', 'L', 'D'); g.circle(10.5, 4.5, 3, 'l', 'L', 'D'); g.circle(8, 7, 3.5, 'l', 'L', 'D');
    g.circle(4, 8, 2.5, 'l', 'L', 'D'); g.circle(11.5, 8.5, 2.5, 'l', 'L', 'D');
    g.px([[8, 9], [8, 10]], 'D');
    g.rect(3, 10, 12, 10, 't'); g.rect(4, 11, 11, 11, 'r'); g.rect(5, 12, 10, 13, 'r'); g.rect(6, 14, 9, 14, 'R');
    g.rect(10, 12, 10, 13, 'R'); g.rect(11, 11, 11, 11, 'R');
    g.outline();
    emit('plant', { l: '#3f9a54', L: '#6fc977', D: '#2c7040', r: '#c9693c', R: '#9c4b27', t: '#e38d58' }, [g]);
  })();

  // ---------- étagère ----------
  (function () {
    var g = G(16, 16);
    g.rect(1, 1, 14, 14, 'w'); g.rect(2, 2, 13, 6, 'i'); g.rect(2, 8, 13, 12, 'i');
    g.rect(1, 7, 14, 7, 'd'); g.rect(1, 13, 14, 14, 'd'); g.rect(1, 1, 14, 1, 'W');
    var cols = [['R', 'r'], ['O', 'y'], ['U', 'u'], ['G', 'g'], ['V', 'v'], ['P', 'p'], ['Q', 'q']];
    [6, 12].forEach(function (bottom) {
      var x = 2, i = bottom === 6 ? 0 : 3;
      while (x <= 13) {
        var wd = 2 + (i % 2), h = 3 + ((i * 7) % 3);
        for (var k = 0; k < wd && x + k <= 13; k++) g.rect(x + k, bottom - h + 1, x + k, bottom, cols[i % 7][k === 0 ? 1 : 0]);
        x += wd; i++;
        if (i % 4 === 0 && x <= 12) x += 1;
      }
    });
    g.outline();
    emit('shelf', {
      w: '#b07844', W: '#c98d55', d: '#7f4f2b', i: '#4f3320',
      R: '#e4572e', r: '#b8421f', O: '#f3a712', y: '#c98a0a', U: '#4f86c6', u: '#3a669a', G: '#6bbf59', g: '#4c9a3c',
      V: '#9b5de5', v: '#7a3fc4', P: '#f15bb5', p: '#c93f93', Q: '#f2e9d8', q: '#cfc3ab'
    }, [g]);
  })();

  // ---------- machine à café ----------
  (function () {
    var g = G(16, 16);
    g.rect(2, 1, 13, 4, 'r'); g.rect(2, 1, 13, 1, 'R');
    g.rect(2, 5, 13, 13, 'k'); g.rect(2, 5, 2, 13, 'K');
    g.rect(4, 6, 6, 7, 'g'); g.set(9, 6, 'r'); g.set(11, 6, 'u'); g.rect(9, 7, 11, 7, 'K');
    g.rect(7, 8, 8, 9, 'n');
    g.rect(6, 10, 9, 11, 'w'); g.rect(7, 10, 8, 10, 'c'); g.set(10, 10, 'w'); g.set(10, 11, 'w');
    g.rect(3, 12, 12, 13, 'n'); g.rect(3, 13, 12, 13, 'N');
    g.outline();
    emit('coffee', { r: '#d9534f', R: '#e8766f', k: '#4a4e5a', K: '#666b7b', g: '#7ee0a1', u: '#ffd166', n: '#b4b9c4', N: '#8a8f9c', w: '#fbf6ee', c: '#6b4226' }, [g]);
  })();

  // ---------- imprimante ----------
  (function () {
    var g = G(16, 16);
    g.rect(4, 1, 11, 6, 'w'); g.rect(5, 2, 9, 2, 'l'); g.rect(5, 4, 8, 4, 'l');
    g.rect(1, 6, 14, 12, 'p'); g.rect(1, 6, 14, 6, 'P'); g.rect(1, 10, 14, 12, 'q');
    g.rect(3, 9, 12, 9, 'k');
    g.rect(4, 10, 11, 13, 'w'); g.rect(5, 11, 9, 11, 'l'); g.rect(5, 13, 7, 13, 'l');
    g.set(12, 7, 'g'); g.set(13, 7, 'u');
    g.outline();
    emit('printer', { w: '#fbf8f1', l: '#c3c8d4', p: '#d8dce4', P: '#f0f2f6', q: '#aab0bd', k: '#3a3f4b', g: '#5fd38d', u: '#ffb347' }, [g]);
  })();

  // ---------- tableau blanc ----------
  (function () {
    var g = G(32, 16);
    g.rect(1, 1, 30, 13, 'f'); g.rect(2, 2, 29, 12, 'w');
    g.rect(4, 4, 14, 4, 'b'); g.rect(4, 6, 11, 6, 'b'); g.rect(4, 8, 8, 8, 'r');
    g.px([[5, 11], [7, 10], [9, 10], [11, 9], [13, 8], [14, 8]], 'g');
    g.rect(19, 3, 22, 6, 'y'); g.rect(20, 4, 21, 4, 'z');
    g.rect(24, 3, 27, 6, 'p'); g.rect(25, 5, 26, 5, 'z');
    g.rect(20, 8, 23, 11, 'n'); g.rect(21, 9, 22, 9, 'z');
    g.rect(2, 13, 29, 13, 'f'); g.rect(3, 14, 28, 14, 'T'); g.rect(6, 14, 8, 14, 'r'); g.rect(10, 14, 11, 14, 'b');
    g.outline();
    emit('whiteboard', { f: '#9aa3af', w: '#fbfbf8', b: '#3b82c4', r: '#d9534f', g: '#4caf70', y: '#ffd95e', p: '#ff9ec0', n: '#8fe0a0', z: '#7a6a3a', T: '#7a828e' }, [g]);
  })();

  // ---------- tapis ----------
  (function () {
    var g = G(32, 32);
    for (var y = 0; y < 32; y++) for (var x = 0; x < 32; x++) {
      var e = Math.min(x, y, 31 - x, 31 - y), c;
      if (e === 0) c = 'd'; else if (e === 1) c = 'c'; else if (e <= 3) c = 'r'; else if (e === 4) c = 'c'; else if (e === 5) c = 'd';
      else {
        var d = Math.abs(x - 15.5) + Math.abs(y - 15.5);
        if (d < 3) c = 'd'; else if (d < 6) c = 'r'; else if (d < 7) c = 'c'; else if (d < 10) c = 'i';
        else if (d < 12) c = 'm'; else if (d < 13) c = 'c'; else c = 'i';
        if (c === 'i' && ((x + y) % 4 === 0) && d > 13 && e > 6) c = 'm';
      }
      g.set(x, y, c);
    }
    g.px([[0, 0], [1, 0], [0, 1], [31, 0], [30, 0], [31, 1], [0, 31], [1, 31], [0, 30], [31, 31], [30, 31], [31, 30]], '.');
    emit('rug', { d: '#8c3b2e', c: '#f4e2c0', r: '#c8553d', i: '#f0d7a1', m: '#e0aa4f' }, [g]);
  })();

  // ---------- agents 16x24 ----------
  var BASE = { s: '#f1c9a0', S: '#d9a97c', h: '#3a2a22', H: '#2a1d18', e: '#2b1d2a', g: '#2b1d2a', b: '#4f46e5', B: '#3b34b8', a: '#d94f4f', d: '#2b1d2a', p: '#4a4458', q: '#3a3548', P: '#2b2430', w: '#fbf8f1', m: '#c0c6d0', l: '#bfe6ff', c: '#7a5a46', C: '#98725a', k: '#2b2430', y: '#ffd166' };

  var ROLES = {
    max: { // chef : veste indigo + cravate
      color: '#4f46e5', pal: { s: '#f0c8a0', S: '#d4a478', h: '#2f2420', H: '#1f1713', b: '#4f46e5', B: '#3a33b0', a: '#e0564a', p: '#2f3350', q: '#252840' },
      head: function () { },
      body: function (g, v) {
        if (v === 'down') { g.rect(6, 9, 9, 13, 'w'); g.rect(7, 10, 8, 13, 'a'); g.rect(7, 9, 8, 9, 'a'); g.px([[4, 10], [4, 11], [11, 10], [11, 11]], 'B'); }
        if (v === 'side') { g.rect(5, 10, 5, 12, 'a'); g.rect(5, 9, 5, 9, 'w'); }
      }
    },
    chercheur: { // lunettes rondes + loupe, violet
      color: '#7c3aed', pal: { s: '#8d5a3b', S: '#6f4429', h: '#1d1512', H: '#120d0b', b: '#7c3aed', B: '#5b24b8', g: '#e8c14d', p: '#3b3552', q: '#2d2841' },
      head: function (g, v) {
        if (v === 'down') { g.px([[6, 5], [9, 5], [5, 6], [7, 6], [8, 6], [10, 6], [6, 7], [9, 7]], 'g'); g.px([[6, 6], [9, 6]], 'e'); }
        if (v === 'side') { g.px([[4, 5], [5, 5], [6, 5], [4, 7], [5, 7], [6, 7], [4, 6], [6, 6]], 'g'); g.set(5, 6, 'e'); g.set(5, 5, 'l'); g.set(5, 7, 'l'); }
        g.px([[4, 1], [5, 1], [10, 1], [11, 1]], 'h');
        if (v !== 'side') g.px([[3, 2], [12, 2], [3, 3], [3, 4], [12, 3], [12, 4]], 'h');
      },
      body: function (g, v) {
        if (v === 'down') { g.rect(12, 15, 14, 17, 'm'); g.set(13, 16, 'l'); g.set(12, 14, 'c'); g.px([[12, 13], [13, 13]], 'B'); }
        if (v === 'side') { g.rect(2, 12, 4, 14, 'm'); g.set(3, 13, 'l'); g.set(5, 15, 'c'); }
      }
    },
    developpeur: { // sweat à capuche vert + casque
      color: '#16a34a', pal: { s: '#f3d2ae', S: '#d9ac82', h: '#6b4226', H: '#4a2c17', b: '#16a34a', B: '#0f7a37', a: '#2b2430', p: '#3d4a63', q: '#2f3a50' },
      head: function (g, v) {
        if (v === 'down' || v === 'up') { g.rect(3, 5, 3, 7, 'a'); g.rect(12, 5, 12, 7, 'a'); g.rect(5, 1, 10, 1, 'a'); g.rect(4, 2, 4, 3, 'a'); g.rect(11, 2, 11, 3, 'a'); }
        if (v === 'side') { g.rect(7, 5, 8, 7, 'a'); g.rect(5, 1, 11, 1, 'a'); }
      },
      body: function (g, v) {
        if (v === 'down') { g.rect(5, 9, 10, 9, 'B'); g.px([[7, 10], [7, 11], [8, 10], [8, 12]], 'w'); g.rect(6, 13, 9, 14, 'B'); }
        if (v === 'up') { g.rect(4, 8, 11, 10, 'B'); g.rect(6, 9, 9, 9, 'b'); }
        if (v === 'side') { g.rect(9, 9, 10, 11, 'B'); g.set(5, 10, 'w'); g.set(5, 11, 'w'); }
      }
    },
    designer: { // béret corail
      color: '#ff6f61', pal: { s: '#f6d5b8', S: '#dcae88', h: '#a8472a', H: '#7d311b', b: '#f6ead6', B: '#d9c6a4', a: '#ff6f61', d: '#d4503f', p: '#4b4e6d', q: '#3b3d58', y: '#ffd166', g: '#5fa8d3' },
      head: function () { },
      body: function (g, v) {
        if (v === 'down') { g.rect(6, 9, 9, 9, 'a'); g.px([[5, 12], [6, 12]], 'a'); g.px([[10, 14], [9, 13]], 'g'); g.set(5, 14, 'y'); }
        if (v === 'up') { g.rect(6, 9, 9, 9, 'a'); g.set(10, 13, 'g'); g.set(5, 12, 'y'); }
        if (v === 'side') { g.rect(5, 9, 6, 9, 'a'); g.set(7, 13, 'g'); g.set(9, 12, 'y'); g.rect(4, 13, 4, 15, 'c'); g.set(4, 12, 'a'); }
      },
      hat: true
    },
    redacteur: { // gilet jaune + stylo
      color: '#eab308', pal: { s: '#a8693f', S: '#8a5230', h: '#c9c3b8', H: '#9a948a', b: '#eab308', B: '#fbf8f1', a: '#2f6fd1', d: '#8a6a04', p: '#5a4a3a', q: '#46392c' },
      arms: 'B',
      head: function () { },
      body: function (g, v) {
        if (v === 'down') { g.rect(6, 9, 9, 13, 'B'); g.rect(4, 9, 5, 15, 'b'); g.rect(10, 9, 11, 15, 'b'); g.rect(7, 14, 8, 15, 'b'); g.px([[5, 11], [10, 11]], 'd'); g.rect(14, 12, 14, 14, 'a'); g.set(14, 15, 'd'); }
        if (v === 'up') { g.rect(4, 9, 11, 15, 'b'); g.rect(7, 9, 8, 15, 'd'); }
        if (v === 'side') { g.rect(4, 12, 4, 14, 'a'); g.set(4, 15, 'd'); g.rect(9, 10, 10, 14, 'd'); }
      }
    },
    analyste: { // chemise bleue + lunettes carrées
      color: '#2563eb', pal: { s: '#e6b98f', S: '#c99468', h: '#1a1a24', H: '#0f0f16', b: '#2563eb', B: '#1b47ad', g: '#2b1d2a', a: '#ffd166', p: '#3c3f4f', q: '#2d2f3c' },
      head: function (g, v) {
        if (v === 'down') { g.rect(5, 5, 10, 5, 'g'); g.rect(5, 7, 10, 7, 'g'); g.px([[5, 6], [7, 6], [8, 6], [10, 6]], 'g'); g.px([[6, 6], [9, 6]], 'e'); }
        if (v === 'side') { g.rect(4, 5, 6, 5, 'g'); g.rect(4, 7, 6, 7, 'g'); g.px([[4, 6], [6, 6]], 'g'); g.set(5, 6, 'e'); g.px([[7, 6], [8, 6]], 'g'); }
      },
      body: function (g, v) {
        if (v === 'down') { g.rect(6, 9, 9, 9, 'w'); g.rect(7, 10, 8, 10, 'w'); g.px([[9, 12], [10, 12]], 'B'); g.set(10, 11, 'a'); g.rect(13, 13, 14, 16, 'w'); g.rect(13, 14, 14, 14, 'a'); g.rect(13, 16, 14, 16, 'a'); }
        if (v === 'up') { g.rect(6, 9, 9, 9, 'w'); }
        if (v === 'side') { g.rect(5, 9, 5, 9, 'w'); g.rect(2, 12, 4, 15, 'w'); g.rect(3, 13, 4, 13, 'a'); g.rect(3, 15, 4, 15, 'a'); }
      }
    }
  };

  function beret(g) {
    g.rect(5, 1, 10, 1, 'a'); g.rect(3, 2, 12, 2, 'a'); g.rect(3, 3, 11, 3, 'd');
    g.set(8, 0, 'd'); g.set(8, 1, 'd'); g.set(7, 1, 'y'); g.rect(10, 2, 12, 2, 'd');
  }

  function agentBase(cfg, view, f) {
    var g = G(16, 24), armCol = cfg.arms || 'B', lf = f === 0;
    if (view === 'down' || view === 'up') {
      var Le = lf ? 21 : 20, Re = lf ? 20 : 21;
      g.rect(4, 16, 6, Le, 'p'); g.rect(9, 16, 11, Re, 'p');
      g.rect(4, Le - 1, 6, Le, 'P'); g.rect(9, Re - 1, 11, Re, 'P');
      if (view === 'down') g.px([[3, Le], [12, Re]], 'P');
      g.rect(4, 9, 11, 15, 'b'); g.rect(4, 15, 11, 15, 'B');
      var al = lf ? 14 : 13, ar = lf ? 13 : 14;
      g.rect(2, 10, 3, al, armCol); g.rect(2, al + 1, 3, al + 1, 's');
      g.rect(12, 10, 13, ar, armCol); g.rect(12, ar + 1, 13, ar + 1, 's');
      if (view === 'down') {
        g.rect(4, 2, 11, 8, 's'); g.rect(4, 2, 11, 4, 'h'); g.px([[4, 5], [11, 5], [4, 6], [11, 6]], 'h');
        g.px([[6, 6], [9, 6]], 'e'); g.px([[7, 8], [8, 8]], 'S'); g.px([[5, 3], [8, 2]], 'H'); g.px([[6, 7], [9, 7]], 'S');
        g.px([[7, 9], [8, 9]], 's');
      } else {
        g.rect(4, 2, 11, 8, 'h'); g.rect(5, 8, 10, 8, 'H'); g.px([[6, 3], [9, 4], [7, 6]], 'H'); g.rect(7, 9, 8, 9, 's');
      }
      if (cfg.hat) beret(g);
      cfg.head(g, view, f); cfg.body(g, view, f);
    } else { // de profil, regarde à gauche
      if (lf) {
        g.rect(8, 16, 10, 20, 'q'); g.rect(8, 19, 11, 20, 'P');
        g.rect(4, 16, 6, 21, 'p'); g.rect(3, 20, 6, 21, 'P');
      } else {
        g.rect(6, 16, 9, 20, 'q'); g.rect(5, 19, 9, 20, 'P');
        g.rect(6, 16, 9, 19, 'p'); g.rect(5, 18, 9, 19, 'P'); g.rect(7, 16, 9, 18, 'p');
      }
      g.rect(5, 9, 10, 15, 'b'); g.rect(5, 15, 10, 15, 'B');
      g.rect(4, 2, 11, 8, 's');
      g.rect(5, 2, 11, 3, 'h'); g.rect(4, 3, 11, 4, 'h'); g.rect(8, 5, 11, 8, 'h');
      g.set(8, 6, 'S'); g.set(3, 6, 's'); g.set(5, 6, 'e'); g.set(5, 8, 'S');
      g.px([[9, 7], [10, 4]], 'H'); g.px([[5, 9], [6, 9]], 's');
      if (cfg.hat) beret(g);
      cfg.head(g, 'side', f); cfg.body(g, 'side', f);
      var ax = lf ? 5 : 7;
      g.rect(ax, 10, ax + 2, 13, armCol); g.rect(ax, 14, ax + 1, 14, 's');
    }
    g.outline();
    return g;
  }

  function agentWork(cfg, f) {
    var g = G(16, 24), hl = f === 0 ? 12 : 13, hr = f === 0 ? 13 : 12, armCol = cfg.arms || 'B';
    g.rect(4, 9, 11, 15, 'b');
    g.rect(4, 2, 11, 8, 'h'); g.rect(5, 8, 10, 8, 'H'); g.px([[6, 3], [9, 4], [7, 6]], 'H'); g.rect(7, 9, 8, 9, 's');
    if (cfg.hat) beret(g);
    cfg.head(g, 'up', f);
    g.rect(2, 9, 3, hl - 1, armCol); g.rect(2, hl, 3, hl, 's');
    g.rect(12, 9, 13, hr - 1, armCol); g.rect(12, hr, 13, hr, 's');
    cfg.body(g, 'up', f);
    // fauteuil
    g.rect(4, 12, 11, 18, 'c'); g.rect(5, 12, 10, 12, 'C'); g.px([[4, 12], [11, 12]], '.');
    g.rect(6, 14, 9, 14, 'C');
    g.rect(7, 19, 8, 20, 'k'); g.rect(4, 21, 11, 21, 'k'); g.px([[4, 22], [5, 22], [10, 22], [11, 22]], 'k');
    g.outline();
    return g;
  }

  var roleNames = Object.keys(ROLES), colors = {};
  roleNames.forEach(function (r) {
    var cfg = ROLES[r], pal = {}, k;
    colors[r] = cfg.color;
    for (k in BASE) pal[k] = BASE[k];
    for (k in cfg.pal) pal[k] = cfg.pal[k];
    ['down', 'up', 'left', 'right'].forEach(function (dir) {
      [0, 1].forEach(function (f) {
        var view = (dir === 'down' || dir === 'up') ? dir : 'side';
        var g = agentBase(cfg, view, f);
        if (dir === 'right') g.mirror();
        emit('agent_' + r + '_' + dir + '_' + f, pal, [g]);
      });
    });
    [0, 1].forEach(function (f) { emit('agent_' + r + '_work_' + f, pal, [agentWork(cfg, f)]); });
  });

  // ---------- contrôle + palettes réduites ----------
  var problems = [], dims = { tile_floor: [16, 16], tile_wall: [16, 16], desk: [32, 16], computer_off: [16, 16], computer_on: [16, 16], plant: [16, 16], shelf: [16, 16], coffee: [16, 16], printer: [16, 16], whiteboard: [32, 16], rug: [32, 32] };
  Object.keys(S).forEach(function (n) {
    var sp = S[n], d = dims[n] || [16, 24], used = {};
    if (n === 'computer_on' ? sp.frames.length !== 2 : sp.frames.length !== 1) problems.push('frames ' + n);
    sp.frames.forEach(function (fr) {
      if (fr.length !== d[1]) problems.push('hauteur ' + n);
      fr.forEach(function (row) {
        if (row.length !== d[0]) problems.push('largeur ' + n);
        for (var i = 0; i < row.length; i++) used[row[i]] = 1;
      });
    });
    delete used['.'];
    var np = {};
    Object.keys(used).forEach(function (ch) { if (!sp.pal[ch]) problems.push('palette ' + n + ' ' + ch); else np[ch] = sp.pal[ch]; });
    sp.pal = np;
  });

  S._meta = { tile: 16, roles: roleNames, colors: colors, problems: problems };
  Studio.sprites = S;
})();
