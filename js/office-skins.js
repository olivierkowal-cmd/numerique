/* Studio - décors, chapeaux, skins, avatars de coachs et badges (sprites pixel art).
   Même format que office-sprites.js : { pal:{car:'#hex'}, frames:[ [rangées] ] } ; '.' = transparent.
   Studio.skins = { items:[{id,name,price,slot,w,h,sprite,...}], sprites:{nom:sprite}, recolor(), skinned(), ... }
   - item.sprite = nom du sprite (clé de Studio.skins.sprites, aussi copié dans Studio.sprites).
   - decor : sprite de (w*16)x(h*16) px, 1 ou 2 frames (aquarium, chat, guirlande, popcorn).
   - hat : sprite 16x8 à dessiner en (0,0) du sprite d'agent 16x24 vue de face (yeux sur la rangée 6).
   - skin : { role, map } ; Studio.skins.recolor(nomSpriteAgent, map) ou Studio.skins.skinned(idSkin, nomSpriteAgent).
   - coachs : coach_max / coach_lea / coach_theo / coach_zoe (24x24) ; badges : badge_* (16x16).
   Studio.skins._problems doit rester []. */
(function () {
  'use strict';
  window.Studio = window.Studio || {};
  var OL = '#2b1d2a';

  // ---------- petit moteur de grille (même API que office-sprites.js + ellipse, polygone) ----------
  function G(w, h) {
    var g = { w: w, h: h, d: [] };
    for (var j = 0; j < h; j++) { var row = []; for (var i = 0; i < w; i++) row.push('.'); g.d.push(row); }
    g.set = function (x, y, c) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < w && y < h) g.d[y][x] = c; };
    g.get = function (x, y) { return (x >= 0 && y >= 0 && x < w && y < h) ? g.d[y][x] : '.'; };
    g.rect = function (x0, y0, x1, y1, c) { for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) g.set(x, y, c); };
    g.px = function (list, c) { list.forEach(function (p) { g.set(p[0], p[1], c); }); };
    g.ell = function (cx, cy, rx, ry, base, hi, lo) {
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) g.set(x, y, (hi && dx + dy < -0.8) ? hi : (lo && dx + dy > 0.8) ? lo : base);
      }
    };
    g.poly = function (pts, c) {
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var px = x + 0.5, py = y + 0.5, ins = false;
        for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
          if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) ins = !ins;
        }
        if (ins) g.set(x, y, c);
      }
    };
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

  var S = {}, DIMS = {};
  function emit(name, pal, grids, w, h) {
    var p = { o: OL };
    for (var k in pal) p[k] = pal[k];
    S[name] = { pal: p, frames: grids.map(function (g) { return g.rows(); }) };
    DIMS[name] = [w, h, grids.length];
  }

  /* ======================= DÉCORS ======================= */
  var items = [];
  function decor(id, name, price, w, h, frames, pal, builder) {
    var gs = [];
    for (var f = 0; f < frames; f++) { var g = G(w * 16, h * 16); builder(g, f); g.outline(); gs.push(g); }
    emit('decor_' + id, pal, gs, w * 16, h * 16);
    items.push({ id: 'decor_' + id, name: name, price: price, slot: 'decor', w: w, h: h, sprite: 'decor_' + id, frames: frames });
  }

  decor('poster', 'Poster soleil', 20, 1, 1, 1,
    { f: '#8a5a36', F: '#b07844', p: '#fbf3df', y: '#ffc93c', Y: '#ff9f1c', g: '#4caf70', G: '#2f8a53', m: '#e0d4b8', b: '#8fd3f4' },
    function (g) {
      g.rect(2, 1, 13, 14, 'f'); g.rect(2, 1, 13, 1, 'F'); g.rect(3, 2, 12, 13, 'b'); g.rect(3, 9, 12, 13, 'p');
      g.ell(8, 6, 2.6, 2.6, 'y', null, 'Y');
      g.poly([[3, 13], [6.5, 8], [10, 13]], 'g'); g.poly([[7, 13], [10.5, 9], [12, 11], [12, 13]], 'G');
      g.px([[6, 8]], 'p'); g.rect(4, 12, 6, 12, 'G'); g.rect(3, 13, 12, 13, 'm');
    });

  decor('lamp', 'Lampe chaude', 25, 1, 1, 1,
    { s: '#ffd166', S: '#f4a93a', t: '#fff1b8', m: '#8a8f9c', b: '#6b4226', B: '#8a5a36', l: '#fff6d0' },
    function (g) {
      g.rect(6, 1, 9, 1, 't'); g.rect(5, 2, 10, 3, 's'); g.rect(4, 4, 11, 6, 's'); g.rect(3, 7, 12, 7, 'S');
      g.rect(6, 2, 6, 6, 't'); g.rect(4, 6, 11, 6, 'S'); g.px([[9, 3], [10, 4], [10, 5]], 'S');
      g.rect(7, 8, 8, 12, 'm'); g.rect(5, 13, 10, 14, 'b'); g.rect(5, 13, 10, 13, 'B');
      g.px([[2, 9], [13, 9], [4, 10], [11, 10]], 'l');
    });

  decor('aquarium', 'Aquarium', 150, 2, 1, 2,
    { f: '#4a5568', F: '#718096', w: '#4fb3d9', W: '#7fd3ee', s: '#f0d9a0', S: '#d9bd7d', o: '#2b1d2a', g: '#3fae6a', G: '#2c8450', a: '#ff8c42', A: '#ffb067', z: '#e8f8ff', e: '#ffffff', k: '#2b1d2a', p: '#f15bb5' },
    function (g, f) {
      g.rect(1, 2, 30, 14, 'f'); g.rect(1, 2, 30, 2, 'F'); g.rect(2, 3, 29, 12, 'w'); g.rect(2, 3, 29, 4, 'W');
      g.rect(2, 11, 29, 12, 's'); g.px([[5, 12], [12, 12], [20, 12], [26, 11]], 'S');
      g.rect(4, 7, 4, 10, 'g'); g.rect(5, 8, 5, 10, 'G'); g.rect(3, 9, 3, 10, 'G');
      g.rect(25, 6, 25, 10, 'g'); g.rect(26, 7, 26, 10, 'G'); g.rect(24, 8, 24, 10, 'G');
      g.px([[17, 10], [18, 10], [18, 9]], 'p');
      var fx = f === 0 ? 9 : 12, fy = f === 0 ? 6 : 7;
      g.rect(fx, fy, fx + 3, fy + 1, 'a'); g.rect(fx + 1, fy, fx + 2, fy, 'A'); g.set(fx - 1, fy - 1, 'a'); g.set(fx - 1, fy + 2, 'a'); g.set(fx - 1, fy, 'a'); g.set(fx - 1, fy + 1, 'a');
      g.set(fx + 3, fy, 'k');
      var hx = f === 0 ? 19 : 17, hy = f === 0 ? 8 : 6;
      g.rect(hx, hy, hx + 2, hy + 1, 'p'); g.set(hx - 1, hy, 'p'); g.set(hx + 3, hy + 1, 'p'); g.set(hx, hy, 'k');
      g.set(f === 0 ? 14 : 15, f === 0 ? 4 : 5, 'z'); g.set(f === 0 ? 15 : 14, f === 0 ? 5 : 4, 'z');
      g.set(f === 0 ? 22 : 22, f === 0 ? 9 : 7, 'z');
    });

  decor('trophy', 'Trophée doré', 120, 1, 1, 1,
    { g: '#ffc93c', G: '#e69b12', h: '#fff1a8', b: '#6b4226', B: '#8a5a36', y: '#ffe08a' },
    function (g) {
      g.rect(5, 1, 10, 5, 'g'); g.rect(6, 6, 9, 6, 'g'); g.rect(7, 7, 8, 7, 'G');
      g.rect(5, 1, 10, 1, 'h'); g.rect(6, 2, 6, 5, 'h'); g.rect(10, 3, 10, 5, 'G'); g.rect(9, 6, 9, 6, 'G');
      g.px([[3, 2], [3, 3], [4, 4], [12, 2], [12, 3], [11, 4]], 'G'); g.px([[4, 2], [11, 2]], 'g');
      g.rect(7, 8, 8, 10, 'G'); g.rect(5, 11, 10, 11, 'g'); g.rect(4, 12, 11, 14, 'b'); g.rect(4, 12, 11, 12, 'B'); g.rect(6, 13, 9, 13, 'y');
      g.set(8, 3, 'G');
    });

  decor('sofa', 'Canapé douillet', 180, 2, 1, 1,
    { a: '#d9534f', A: '#e8766f', c: '#b83f3b', d: '#8c2f2c', l: '#6b4226', y: '#f9c3bf' },
    function (g) {
      g.rect(3, 2, 28, 8, 'a'); g.rect(3, 2, 28, 3, 'A'); g.rect(1, 6, 4, 13, 'c'); g.rect(27, 6, 30, 13, 'c');
      g.rect(1, 6, 4, 7, 'a'); g.rect(27, 6, 30, 7, 'a'); g.rect(2, 6, 2, 6, 'A');
      g.rect(5, 8, 26, 12, 'A'); g.rect(5, 12, 26, 12, 'c'); g.rect(15, 8, 16, 12, 'a');
      g.rect(5, 13, 26, 13, 'd'); g.rect(2, 14, 3, 14, 'l'); g.rect(28, 14, 29, 14, 'l');
      g.px([[8, 9], [9, 9], [20, 9], [21, 9]], 'y');
    });

  decor('bookcase', 'Grande bibliothèque', 160, 1, 2, 1,
    { w: '#a86a38', W: '#c98d55', d: '#6f4425', i: '#43291a',
      R: '#e4572e', r: '#b8421f', O: '#f3a712', y: '#c98a0a', U: '#4f86c6', u: '#3a669a', G: '#6bbf59', g: '#4c9a3c', V: '#9b5de5', v: '#7a3fc4', P: '#f15bb5', p: '#c93f93' },
    function (g) {
      g.rect(1, 1, 14, 30, 'w'); g.rect(1, 1, 14, 1, 'W');
      var cols = [['R', 'r'], ['O', 'y'], ['U', 'u'], ['G', 'g'], ['V', 'v'], ['P', 'p']];
      var tops = [2, 9, 16, 23];
      tops.forEach(function (t, row) {
        g.rect(2, t, 13, t + 5, 'i'); g.rect(1, t + 6, 14, t + 6, 'd');
        var x = 2, i = row * 2;
        while (x <= 13) {
          var wd = 2 + ((i + row) % 2), h = 3 + ((i * 5 + row) % 3);
          for (var k = 0; k < wd && x + k <= 13; k++) g.rect(x + k, t + 5 - h + 1, x + k, t + 5, cols[i % 6][k === 0 ? 1 : 0]);
          x += wd; i++;
        }
      });
      g.rect(1, 29, 14, 30, 'd');
    });

  decor('globe', 'Globe terrestre', 55, 1, 1, 1,
    { b: '#4f9fd9', B: '#2f72b0', h: '#8fd0f5', g: '#6bbf59', G: '#3f9a54', m: '#c9a24a', M: '#8a6a24', s: '#6b4226' },
    function (g) {
      g.ell(8, 6.5, 5.5, 5.5, 'b', 'h', 'B');
      g.px([[5, 3], [6, 3], [5, 4], [6, 4], [7, 4], [6, 5], [10, 6], [11, 6], [10, 7], [11, 7], [9, 8], [10, 8], [8, 9], [9, 9], [8, 5], [9, 5]], 'g');
      g.px([[7, 4], [10, 7], [9, 9]], 'G');
      g.px([[2, 3], [2, 4], [2, 9], [3, 10], [13, 3], [13, 9], [12, 10], [3, 2], [12, 2]], 'm');
      g.px([[2, 5], [13, 5], [2, 8], [13, 8]], 'M');
      g.rect(7, 12, 8, 12, 'M'); g.rect(5, 13, 10, 14, 'm'); g.rect(5, 14, 10, 14, 'M');
    });

  decor('cat', 'Chat endormi', 85, 1, 1, 2,
    { c: '#f2a65a', C: '#d9833a', l: '#ffd2a1', k: '#2b1d2a', p: '#f7a8b8', z: '#7aa7d9', Z: '#b9d5f2' },
    function (g, f) {
      var t = f === 0 ? 0 : 1;
      g.ell(8.5, 11.2 - t * 0.4, 6.5, 3.4 + t * 0.4, 'c', 'l', 'C');
      g.ell(5, 8.5, 3.2, 3, 'c', 'l', null);
      g.px([[2, 5], [3, 5], [3, 6], [8, 5], [7, 5], [7, 6]], 'c'); g.px([[2, 6], [8, 6]], 'C'); g.px([[3, 6], [7, 6]], 'p');
      g.px([[3, 8], [4, 8]], 'k'); g.px([[6, 8], [7, 8]], 'k'); g.set(5, 9, 'p');
      g.px([[10, 9], [11, 9], [9, 10], [12, 10]], 'C'); g.px([[13, 11], [14, 12], [14, 13], [13, 13]], 'C');
      g.rect(3, 13, 6, 13, 'l');
      if (f === 0) { g.px([[10, 3], [11, 3], [11, 4]], 'z'); g.set(10, 5, 'z'); }
      else { g.px([[10, 2], [11, 2], [11, 3], [10, 4], [11, 4]], 'Z'); g.px([[12, 0], [13, 0]], 'Z'); g.set(13, 1, 'Z'); g.set(12, 2, 'Z'); }
    });

  decor('plant', 'Plante géante', 95, 1, 2, 1,
    { l: '#3f9a54', L: '#6fc977', D: '#2c7040', r: '#c9693c', R: '#9c4b27', t: '#e38d58' },
    function (g) {
      g.ell(5, 6, 4, 5, 'l', 'L', 'D'); g.ell(11, 5, 4, 4.5, 'l', 'L', 'D'); g.ell(8, 11, 5, 5, 'l', 'L', 'D');
      g.ell(4, 15, 3.5, 4, 'l', 'L', 'D'); g.ell(12, 16, 3.5, 4.5, 'l', 'L', 'D'); g.ell(8, 18, 4, 3.5, 'l', 'L', 'D');
      g.rect(8, 20, 8, 24, 'D'); g.px([[6, 8], [9, 12], [5, 16], [11, 17]], 'D');
      g.rect(3, 24, 12, 24, 't'); g.rect(4, 25, 11, 25, 'r'); g.rect(5, 26, 10, 29, 'r'); g.rect(6, 30, 9, 30, 'R');
      g.rect(10, 26, 10, 29, 'R'); g.rect(11, 25, 11, 25, 'R');
    });

  decor('rug', 'Tapis rond', 60, 2, 2, 1,
    { a: '#7b4fb8', b: '#a47be0', c: '#f4e2c0', d: '#f2a65a', e: '#5a3792' },
    function (g) {
      for (var y = 0; y < 32; y++) for (var x = 0; x < 32; x++) {
        var d = Math.sqrt((x - 15.5) * (x - 15.5) + (y - 15.5) * (y - 15.5)), c = '.';
        if (d <= 15.6) c = d > 14 ? 'e' : d > 12.5 ? 'c' : d > 10.5 ? 'a' : d > 9 ? 'd' : d > 5 ? 'b' : d > 3.5 ? 'c' : 'a';
        if (c === 'b' && ((x + y) % 4 === 0)) c = 'a';
        g.set(x, y, c);
      }
    });

  decor('clock', 'Horloge ronde', 35, 1, 1, 1,
    { f: '#8a5a36', F: '#b07844', w: '#fbf6ee', k: '#3a3f4b', r: '#d9534f', t: '#c9bfae' },
    function (g) {
      g.ell(8, 8, 7, 7, 'f', 'F', null); g.ell(8, 8, 5.4, 5.4, 'w');
      g.px([[8, 3], [8, 12], [3, 8], [12, 8]], 't'); g.px([[5, 4], [11, 4], [4, 11], [11, 11]], 't');
      g.rect(8, 5, 8, 8, 'k'); g.rect(9, 8, 10, 8, 'k'); g.set(8, 8, 'r'); g.set(8, 9, 'r');
    });

  decor('garland', 'Guirlande lumineuse', 45, 2, 1, 2,
    { w: '#6b4226', r: '#ff5d5d', y: '#ffd95e', g: '#6bd48a', b: '#5aa9f0', p: '#ff9ec0', R: '#a63030', Y: '#b08a1a' },
    function (g, f) {
      var cs = ['r', 'y', 'g', 'b', 'p', 'y', 'r', 'g'];
      for (var x = 0; x < 32; x++) {
        var y = Math.round(2 + 3.2 * Math.sin(x / 32 * Math.PI * 4 - 0.4) * 0.5 + 1.5);
        g.set(x, y, 'w');
      }
      for (var i = 0; i < 8; i++) {
        var bx = 2 + i * 4, by = Math.round(2 + 3.2 * Math.sin(bx / 32 * Math.PI * 4 - 0.4) * 0.5 + 1.5);
        var on = (i + f) % 2 === 0, c = cs[i];
        g.set(bx, by + 1, c); g.set(bx, by + 2, on ? c : (c === 'y' ? 'Y' : 'R')); g.set(bx, by + 3, on ? c : 'w');
        if (on) { g.set(bx - 1, by + 2, c); g.set(bx + 1, by + 2, c); }
      }
    });

  decor('rocket', 'Fusée-jouet', 75, 1, 1, 1,
    { w: '#f7f3ea', W: '#d4cdbd', r: '#e4572e', R: '#b8421f', b: '#7ad0f5', B: '#3a8fc4', y: '#ffc93c', Y: '#ff8c42', s: '#8a8f9c' },
    function (g) {
      g.rect(6, 3, 9, 10, 'w'); g.rect(7, 2, 8, 2, 'w'); g.rect(7, 0, 8, 1, 'r'); g.rect(6, 2, 9, 3, 'r'); g.rect(9, 4, 9, 10, 'W');
      g.rect(7, 5, 8, 6, 'b'); g.set(8, 6, 'B');
      g.rect(4, 8, 5, 11, 'r'); g.rect(10, 8, 11, 11, 'r'); g.px([[4, 11], [11, 11]], 'R'); g.rect(6, 11, 9, 11, 'R');
      g.rect(7, 12, 8, 12, 'y'); g.rect(7, 13, 8, 13, 'Y'); g.set(7, 14, 'y');
      g.rect(5, 15, 10, 15, 's');
    });

  decor('popcorn', 'Machine à popcorn', 200, 1, 2, 2,
    { r: '#d9534f', R: '#a63030', g: '#cfe9f2', G: '#e8f6fb', p: '#fff3c4', P: '#f2d780', y: '#ffd166', k: '#3a3f4b', w: '#fbf6ee', b: '#6b4226' },
    function (g, f) {
      g.rect(2, 1, 13, 4, 'r'); g.rect(2, 1, 13, 1, 'y'); g.rect(3, 2, 12, 3, 'w'); g.px([[5, 3], [8, 3], [10, 3]], 'r'); g.rect(4, 2, 5, 2, 'r'); g.rect(8, 2, 11, 2, 'r');
      g.rect(2, 5, 13, 16, 'g'); g.rect(3, 5, 3, 15, 'G'); g.rect(2, 5, 2, 16, 'k'); g.rect(13, 5, 13, 16, 'k');
      g.rect(4, 11, 12, 16, 'p');
      var dots = [[4, 10], [6, 9], [8, 10], [10, 9], [11, 10], [5, 8], [9, 8]];
      dots.forEach(function (d) { g.set(d[0], d[1], 'p'); g.set(d[0] + 1, d[1] + 1, 'P'); });
      g.px([[6, 14], [9, 13], [11, 15], [5, 15]], 'P');
      if (f === 0) { g.px([[7, 6], [8, 7]], 'p'); g.set(10, 7, 'P'); } else { g.px([[9, 6], [6, 7]], 'p'); g.set(7, 5, 'P'); }
      g.rect(2, 17, 13, 29, 'r'); g.rect(2, 17, 13, 17, 'R'); g.rect(4, 19, 11, 22, 'k'); g.px([[5, 20], [10, 21]], 'y');
      g.rect(5, 24, 10, 28, 'w'); g.rect(5, 24, 10, 24, 'r'); g.rect(6, 26, 9, 26, 'r');
      g.rect(2, 30, 13, 30, 'R'); g.rect(3, 31, 4, 31, 'b'); g.rect(11, 31, 12, 31, 'b');
    });

  decor('beanbag', 'Pouf rond', 40, 1, 1, 1,
    { a: '#4fb3a9', A: '#7fd6cc', c: '#2f8a82', s: '#276b66' },
    function (g) {
      g.ell(8, 9.5, 7, 5.2, 'a', 'A', 'c'); g.ell(8, 5.5, 4, 2.2, 'a', 'A', null);
      g.px([[6, 4], [7, 4]], 'A'); g.px([[8, 7], [9, 8], [10, 9]], 's'); g.rect(5, 14, 11, 14, 'c');
    });

  decor('cactus', 'Petit cactus fleuri', 30, 1, 1, 1,
    { g: '#4caf70', G: '#2f8a53', L: '#7fd69a', p: '#f15bb5', y: '#ffd166', r: '#c9693c', R: '#9c4b27', t: '#e38d58', w: '#fbf6ee' },
    function (g) {
      g.rect(6, 3, 9, 11, 'g'); g.rect(7, 2, 8, 2, 'g'); g.rect(6, 3, 6, 11, 'L'); g.rect(9, 4, 9, 11, 'G');
      g.rect(3, 6, 5, 7, 'g'); g.rect(3, 4, 4, 5, 'g'); g.rect(10, 7, 12, 8, 'g'); g.rect(11, 5, 12, 6, 'g');
      g.rect(3, 4, 3, 7, 'L'); g.rect(12, 5, 12, 8, 'G');
      g.px([[7, 5], [8, 8], [7, 10]], 'w');
      g.px([[8, 0], [7, 1], [9, 1], [8, 2]], 'p'); g.set(8, 1, 'y');
      g.rect(4, 11, 11, 11, 't'); g.rect(5, 12, 10, 13, 'r'); g.rect(6, 14, 9, 14, 'R'); g.rect(10, 12, 10, 13, 'R');
    });

  /* ======================= CHAPEAUX 16x8 ======================= */
  var HATS = [];
  function hat(id, name, price, pal, builder) {
    var g = G(16, 8); builder(g); g.outline();
    emit('hat_' + id, pal, [g], 16, 8);
    items.push({ id: 'hat_' + id, name: name, price: price, slot: 'hat', w: 1, h: 1, sprite: 'hat_' + id });
  }
  hat('casquette', 'Casquette', 30, { r: '#e4572e', R: '#b8421f', w: '#fbf6ee' }, function (g) {
    g.rect(5, 1, 10, 1, 'r'); g.rect(4, 2, 11, 4, 'r'); g.rect(4, 4, 11, 4, 'R'); g.rect(1, 4, 5, 4, 'R'); g.rect(2, 3, 4, 3, 'r'); g.set(7, 1, 'w'); g.set(8, 2, 'w');
  });
  hat('couronne', 'Couronne', 200, { y: '#ffc93c', Y: '#e69b12', r: '#d9534f', b: '#4f86c6', w: '#fff1a8' }, function (g) {
    g.px([[4, 0], [8, 0], [11, 0]], 'y'); g.rect(4, 1, 11, 1, 'y'); g.px([[4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2]], 'y');
    g.rect(4, 3, 11, 4, 'y'); g.rect(4, 4, 11, 4, 'Y'); g.set(5, 1, 'w'); g.px([[6, 3], [11, 3]], 'r'); g.set(8, 3, 'b'); g.set(7, 1, 'y'); g.set(6, 1, 'y');
    g.px([[5, 1], [7, 1], [10, 1]], 'y'); g.set(8, 1, 'r');
  });
  hat('lunettes', 'Lunettes de soleil', 50, { k: '#2b2430', l: '#4a4a6a', w: '#8c93b8' }, function (g) {
    g.rect(3, 5, 12, 5, 'k'); g.rect(4, 6, 7, 7, 'k'); g.rect(8, 6, 11, 7, 'k'); g.rect(5, 6, 6, 6, 'l'); g.rect(9, 6, 10, 6, 'l');
    g.set(5, 6, 'w'); g.set(9, 6, 'w'); g.rect(5, 7, 6, 7, 'l'); g.rect(9, 7, 10, 7, 'l'); g.px([[7, 5], [8, 6]], 'k'); g.set(7, 6, 'k'); g.set(8, 6, 'k');
  });
  hat('bonnet', 'Bonnet doux', 35, { a: '#4fb3d9', A: '#7fd3ee', w: '#fbf6ee', W: '#d4cdbd' }, function (g) {
    g.rect(5, 1, 10, 1, 'a'); g.rect(4, 2, 11, 3, 'a'); g.rect(3, 4, 12, 4, 'w'); g.rect(4, 4, 11, 4, 'w'); g.px([[5, 2], [8, 2], [10, 3], [6, 3]], 'A');
    g.px([[4, 4], [7, 4], [10, 4]], 'W'); g.rect(7, 0, 8, 0, 'w'); g.set(7, 0, 'w'); g.set(8, 0, 'W');
  });
  hat('noeud', 'Nœud papillon', 25, { p: '#f15bb5', P: '#c93f93', y: '#ffd166' }, function (g) {
    g.rect(3, 1, 6, 4, 'p'); g.rect(9, 1, 12, 4, 'p'); g.rect(7, 2, 8, 3, 'y'); g.px([[3, 1], [3, 4], [12, 1], [12, 4]], 'P');
    g.px([[4, 3], [5, 3], [10, 3], [11, 3]], 'P');
  });
  hat('pilote', 'Casque de pilote', 90, { b: '#8a6a3a', B: '#6b4f27', g: '#7ad0f5', m: '#c9c3b8', k: '#2b2430' }, function (g) {
    g.rect(5, 1, 10, 1, 'b'); g.rect(4, 2, 11, 4, 'b'); g.rect(3, 4, 4, 6, 'B'); g.rect(11, 4, 12, 6, 'B'); g.rect(5, 2, 7, 2, 'B');
    g.rect(5, 3, 10, 4, 'g'); g.rect(5, 3, 10, 3, 'm'); g.set(6, 4, 'm'); g.rect(4, 1, 4, 1, '.'); g.px([[7, 4], [8, 4]], 'k');
    g.px([[5, 3], [10, 3]], 'k'); g.rect(6, 3, 9, 3, 'g'); g.px([[6, 4], [9, 4]], 'g'); g.px([[7, 3]], 'm');
  });
  hat('sorcier', 'Chapeau de sorcier', 140, { v: '#6c3fc4', V: '#8f63e8', y: '#ffd166', d: '#4a2a94' }, function (g) {
    g.rect(7, 0, 8, 0, 'v'); g.rect(6, 1, 9, 1, 'v'); g.rect(5, 2, 10, 2, 'v'); g.rect(4, 3, 11, 3, 'v'); g.rect(4, 3, 11, 3, 'y');
    g.rect(1, 4, 14, 4, 'd'); g.rect(2, 4, 13, 4, 'v'); g.rect(1, 4, 2, 4, 'd'); g.rect(13, 4, 14, 4, 'd');
    g.px([[7, 1], [7, 2], [6, 2]], 'V'); g.set(9, 2, 'y'); g.set(8, 0, 'v'); g.rect(5, 3, 10, 3, 'y'); g.px([[7, 1]], 'y'); g.px([[9, 0]], '.');
  });
  hat('antennes', 'Antennes rigolotes', 45, { m: '#8a8f9c', r: '#ff5d5d', g: '#6bd48a', R: '#ffb0b0' }, function (g) {
    g.px([[5, 2], [4, 1]], 'm'); g.px([[10, 2], [11, 1]], 'm'); g.rect(5, 3, 5, 3, 'm'); g.rect(10, 3, 10, 3, 'm');
    g.rect(2, 0, 3, 1, 'r'); g.set(2, 0, 'R'); g.rect(12, 0, 13, 1, 'g'); g.set(12, 0, 'R');
  });
  hat('bandeau', 'Bandeau sportif', 20, { r: '#e4572e', R: '#b8421f', w: '#fbf6ee' }, function (g) {
    g.rect(3, 3, 12, 4, 'r'); g.rect(3, 4, 12, 4, 'R'); g.px([[5, 3], [8, 3], [11, 3]], 'w'); g.rect(12, 5, 13, 6, 'r'); g.px([[13, 7]], 'R'); g.set(12, 6, 'R');
  });
  hat('hautdeforme', 'Haut-de-forme', 110, { k: '#2f2f3a', K: '#4a4a5a', r: '#d9534f' }, function (g) {
    g.rect(5, 0, 10, 4, 'k'); g.rect(5, 0, 5, 3, 'K'); g.rect(5, 3, 10, 3, 'r'); g.rect(2, 4, 13, 4, 'k'); g.rect(3, 4, 4, 4, 'K');
  });
  hat('toque', 'Toque de chef', 65, { w: '#fbf6ee', W: '#d4cdbd', g: '#bfc6d4' }, function (g) {
    g.ell(5, 2.5, 2.4, 2.2, 'w'); g.ell(8, 1.8, 2.6, 1.8, 'w'); g.ell(11, 2.5, 2.4, 2.2, 'w'); g.rect(4, 3, 11, 4, 'w');
    g.rect(4, 4, 11, 4, 'W'); g.px([[6, 2], [9, 2], [11, 3]], 'W'); g.rect(4, 3, 4, 3, 'w');
  });
  hat('aureole', 'Auréole', 80, { y: '#ffe066', Y: '#f2b705' }, function (g) {
    g.rect(5, 1, 10, 1, 'y'); g.px([[4, 2], [11, 2]], 'y'); g.rect(5, 3, 10, 3, 'Y'); g.px([[4, 2], [11, 2]], 'Y'); g.px([[5, 2], [10, 2]], '.'); g.rect(6, 2, 9, 2, '.');
  });

  /* ======================= SKINS D'AGENTS (variantes de couleur) ======================= */
  function recolor(spriteName, map) {
    var sp = (window.Studio.sprites && window.Studio.sprites[spriteName]) || S[spriteName];
    if (!sp) return null;
    var pal = {};
    Object.keys(sp.pal).forEach(function (k) { pal[k] = (map && map[k] && k !== 'o') ? map[k] : sp.pal[k]; });
    return { pal: pal, frames: sp.frames };
  }
  var SKINS = {
    max: [['Menthe', 60, { b: '#14b8a6', B: '#0d8a7d', a: '#ffd166' }], ['Rubis', 70, { b: '#d6336c', B: '#a3214f', a: '#ffd166', h: '#6b3a22', H: '#4a2814' }], ['Nuit', 90, { b: '#1f2a44', B: '#141c30', a: '#f59e0b', p: '#4a4458', q: '#3a3548' }], ['Soleil', 80, { b: '#f59e0b', B: '#c47a05', a: '#4f46e5' }]],
    chercheur: [['Forêt', 60, { b: '#2f9e5b', B: '#1f7a43', g: '#ffd166' }], ['Océan', 70, { b: '#0ea5e9', B: '#0873a8', h: '#7a3b1d', H: '#582813' }], ['Rose', 80, { b: '#ec4899', B: '#b52a73', g: '#fff1a8' }], ['Ardoise', 90, { b: '#475569', B: '#334155', g: '#7ad0f5', h: '#c9c3b8', H: '#9a948a' }]],
    developpeur: [['Violet', 60, { b: '#8b5cf6', B: '#6d3fd1' }], ['Orange', 70, { b: '#f97316', B: '#c2530a', h: '#1d1512', H: '#120d0b' }], ['Cyan', 80, { b: '#06b6d4', B: '#0a8aa0', a: '#e4572e' }], ['Noir', 90, { b: '#3a3f4b', B: '#2a2e38', a: '#6bd48a', h: '#d9a066', H: '#b07a3a' }]],
    designer: [['Lavande', 60, { a: '#a78bfa', d: '#7c5fd6', b: '#fbeed8' }], ['Citron', 70, { a: '#facc15', d: '#c79a07', h: '#2f2420', H: '#1f1713' }], ['Menthe', 80, { a: '#34d399', d: '#1f9e72', b: '#e8f1ff', B: '#c3d3ea' }], ['Nuit', 90, { a: '#1e3a8a', d: '#142761', h: '#e8c14d', H: '#c49a22' }]],
    redacteur: [['Ciel', 60, { b: '#60a5fa', B: '#fbf8f1', d: '#2f6fd1' }], ['Prune', 70, { b: '#a855f7', B: '#f3e8ff', d: '#6b21a8', h: '#3a2a22', H: '#2a1d18' }], ['Menthe', 80, { b: '#34d399', B: '#fbf8f1', d: '#1f9e72' }], ['Brique', 90, { b: '#e4572e', B: '#fbf8f1', d: '#a63e1d' }]],
    analyste: [['Pomme', 60, { b: '#16a34a', B: '#0f7a37', a: '#ff6b6b' }], ['Bordeaux', 70, { b: '#9f1239', B: '#6e0c27', a: '#ffd166', h: '#6b4226', H: '#4a2c17' }], ['Gris', 80, { b: '#64748b', B: '#475569', a: '#7ad0f5' }], ['Mandarine', 90, { b: '#fb923c', B: '#c2630e', a: '#2563eb' }]]
  };
  var ROLE_LABEL = { max: 'Max', chercheur: 'Chercheur', developpeur: 'Développeur', designer: 'Designer', redacteur: 'Rédacteur', analyste: 'Analyste' };
  Object.keys(SKINS).forEach(function (role) {
    SKINS[role].forEach(function (s, i) {
      items.push({ id: 'skin_' + role + '_' + (i + 1), name: ROLE_LABEL[role] + ' ' + s[0], price: s[1], slot: 'skin', role: role, w: 1, h: 2, sprite: 'agent_' + role + '_down_0', map: s[2] });
    });
  });
  function skinned(skinId, spriteName) {
    for (var i = 0; i < items.length; i++) if (items[i].id === skinId && items[i].slot === 'skin') {
      var key = skinId + '|' + spriteName;
      if (!skinned._c[key]) skinned._c[key] = recolor(spriteName || items[i].sprite, items[i].map);
      return skinned._c[key];
    }
    return null;
  }
  skinned._c = {};

  /* ======================= AVATARS DE COACHS 24x24 ======================= */
  function bust(name, cfg, extra) {
    var g = G(24, 24);
    if (cfg.long) { g.rect(5, 8, 18, 19, 'h'); g.px([[5, 19], [18, 19]], '.'); }
    g.rect(3, 19, 20, 23, 'b'); g.px([[3, 19], [4, 19], [19, 19], [20, 19], [3, 20], [20, 20]], '.'); g.rect(3, 22, 20, 23, 'b'); g.rect(3, 23, 20, 23, 'B');
    g.rect(10, 16, 13, 19, 'S'); g.rect(10, 16, 13, 17, 'S');
    g.ell(12, 9.5, 7.2, 7.4, 'h', null, 'H');
    g.ell(12, 11.6, 6.2, 6.4, 's', null, null);
    g.rect(5, 8, 18, 8, 'h'); g.rect(6, 7, 17, 7, 'h');
    if (cfg.fringe === 'side') { g.rect(6, 8, 14, 9, 'h'); g.px([[15, 8], [16, 8]], 'h'); g.px([[7, 10], [6, 10]], 'h'); g.px([[13, 10]], 'h'); }
    else if (cfg.fringe === 'mid') { g.rect(6, 8, 17, 9, 'h'); g.px([[9, 10], [14, 10], [12, 10]], 'h'); }
    else { g.rect(6, 8, 17, 8, 'h'); g.px([[6, 9], [17, 9], [7, 9], [16, 9], [6, 10], [17, 10]], 'h'); }
    g.rect(6, 11, 6, 12, 'S'); g.rect(17, 11, 17, 12, 'S');
    g.rect(9, 12, 9, 13, 'e'); g.rect(14, 12, 14, 13, 'e'); g.set(9, 12, 'w'); g.set(14, 12, 'w'); g.rect(9, 13, 9, 13, 'e'); g.rect(14, 13, 14, 13, 'e');
    g.px([[8, 15], [15, 15]], 'k');
    g.px([[10, 16], [11, 16], [12, 16], [13, 16]], 'm'); g.px([[9, 15], [14, 15]], 'm'); g.set(10, 16, 'm');
    g.px([[11, 14], [12, 14]], 'S');
    extra(g);
    g.outline();
    emit('coach_' + name, cfg.pal, [g], 24, 24);
  }
  var cbase = { s: '#f1c9a0', S: '#d9a97c', e: '#2b1d2a', w: '#ffffff', k: '#ff9e9e', m: '#a8473f' };
  function cp(o) { var p = {}, k; for (k in cbase) p[k] = cbase[k]; for (k in o) p[k] = o[k]; return p; }
  bust('max', { fringe: 'side', pal: cp({ h: '#2f2420', H: '#1f1713', b: '#4f46e5', B: '#3a33b0', a: '#e0564a', W: '#fbf8f1' }) }, function (g) {
    g.rect(9, 19, 14, 20, 'W'); g.px([[9, 19], [14, 19]], 'W'); g.rect(11, 19, 12, 23, 'a'); g.set(11, 19, 'a'); g.px([[10, 19], [13, 19]], 'W'); g.px([[10, 20], [13, 20]], 'W');
    g.px([[11, 21], [12, 22]], 'a'); g.rect(11, 22, 12, 23, 'a');
  });
  bust('lea', { long: true, fringe: 'mid', pal: cp({ h: '#6b3a1d', H: '#4a2814', b: '#7c3aed', B: '#5b24b8', g: '#e8c14d', l: '#bfe6ff', s: '#e8b88f', S: '#c99468' }) }, function (g) {
    g.rect(7, 11, 10, 11, 'g'); g.rect(13, 11, 16, 11, 'g'); g.rect(7, 14, 10, 14, 'g'); g.rect(13, 14, 16, 14, 'g');
    g.rect(7, 12, 7, 13, 'g'); g.rect(10, 12, 10, 13, 'g'); g.rect(13, 12, 13, 13, 'g'); g.rect(16, 12, 16, 13, 'g'); g.rect(11, 12, 12, 12, 'g');
    g.rect(8, 12, 8, 13, 'l'); g.rect(15, 12, 15, 13, 'l'); g.rect(9, 12, 9, 13, 'e'); g.rect(14, 12, 14, 13, 'e'); g.set(9, 12, 'w'); g.set(14, 12, 'w');
    g.rect(4, 12, 5, 20, 'h'); g.rect(18, 12, 19, 20, 'h');
  });
  bust('theo', { fringe: 'edge', pal: cp({ h: '#6b4226', H: '#4a2c17', b: '#16a34a', B: '#0f7a37', a: '#2b2430', A: '#555b6b', s: '#f3d2ae', S: '#d9ac82' }) }, function (g) {
    g.rect(2, 8, 3, 13, 'a'); g.rect(20, 8, 21, 13, 'a'); g.rect(4, 3, 4, 8, 'a'); g.rect(19, 3, 19, 8, 'a'); g.rect(5, 1, 18, 2, 'a'); g.rect(4, 2, 4, 3, 'a'); g.rect(19, 2, 19, 3, 'a');
    g.rect(5, 2, 18, 2, 'A'); g.px([[2, 9], [21, 9]], 'A');
    g.rect(10, 19, 13, 20, 'B'); g.px([[10, 21], [13, 21]], 'w'); g.px([[11, 21], [12, 22]], 'w');
  });
  bust('zoe', { long: true, fringe: 'side', pal: cp({ h: '#a8472a', H: '#7d311b', b: '#f6ead6', B: '#d9c6a4', a: '#ff6f61', d: '#d4503f', y: '#ffd166', s: '#f6d5b8', S: '#dcae88' }) }, function (g) {
    g.rect(4, 12, 5, 20, 'h'); g.rect(18, 12, 19, 20, 'h');
    g.rect(8, 3, 17, 3, 'a'); g.rect(5, 4, 18, 5, 'a'); g.rect(4, 6, 17, 6, 'd'); g.rect(10, 1, 14, 2, 'a'); g.px([[12, 0], [12, 1]], 'd'); g.set(11, 2, 'y');
    g.rect(4, 5, 4, 6, '.'); g.set(4, 6, 'd'); g.set(5, 6, 'd');
    g.rect(9, 19, 14, 19, 'a'); g.px([[16, 21], [17, 22]], 'y');
  });

  /* ======================= BADGES 16x16 ======================= */
  var BADGES = [];
  function badge(id, pal, builder) {
    var g = G(16, 16); builder(g); g.outline();
    emit('badge_' + id, pal, [g], 16, 16);
    BADGES.push('badge_' + id);
  }
  function medal(id, base, hi, lo, ribA, ribB, glyph) {
    badge(id, { c: base, h: hi, l: lo, r: ribA, R: ribB, w: '#fffdf4' }, function (g) {
      g.poly([[4, 0], [8, 0], [9, 6], [6, 6]], 'r'); g.poly([[8, 0], [12, 0], [10, 6], [7, 6]], 'R');
      g.ell(8, 10, 5.4, 5.4, 'c', 'h', 'l'); g.ell(8, 10, 3.6, 3.6, 'l'); g.ell(8, 9.8, 3.1, 3.1, 'c');
      glyph(g);
    });
  }
  medal('bronze', '#cd7f32', '#e6a566', '#8f5420', '#d9534f', '#b83f3b', function (g) { g.px([[8, 8], [8, 9], [8, 10], [8, 11], [7, 9]], 'w'); g.px([[7, 11], [9, 11]], 'w'); });
  medal('silver', '#c4ccd8', '#eef2f8', '#8a93a3', '#4f86c6', '#3a669a', function (g) { g.px([[7, 8], [8, 8], [9, 9], [8, 10], [7, 11], [8, 11], [9, 11]], 'w'); });
  medal('gold', '#ffc93c', '#fff1a8', '#d9921a', '#d9534f', '#4f86c6', function (g) { g.px([[8, 8], [7, 9], [9, 9], [8, 9], [6, 9], [10, 9], [7, 10], [9, 10], [7, 11], [9, 11], [8, 7]], 'w'); });

  badge('star', { y: '#ffc93c', Y: '#e69b12', h: '#fff1a8' }, function (g) {
    g.poly([[8, 0.5], [10, 5.2], [15, 5.6], [11.2, 9], [12.4, 14.6], [8, 11.8], [3.6, 14.6], [4.8, 9], [1, 5.6], [6, 5.2]], 'y');
    g.px([[8, 2], [8, 3], [7, 5], [3, 6]], 'h'); g.px([[10, 10], [11, 12], [12, 8]], 'Y');
  });
  badge('flame', { o: '#2b1d2a', r: '#ff8c42', R: '#e4572e', y: '#ffd166', w: '#fff3c4' }, function (g) {
    g.poly([[8, 0.5], [11, 4.5], [13, 8], [12.6, 12], [10, 14.8], [6, 14.8], [3.4, 12], [3, 8.5], [5, 6], [6, 7.5], [6.5, 3.5]], 'r');
    g.poly([[8.4, 6], [10.4, 9], [10.6, 12], [9, 14], [7, 14], [5.6, 12], [6, 9.5], [7.4, 8.2]], 'y'); g.px([[8, 12], [8, 13], [7, 12]], 'w');
    g.px([[11, 8], [12, 10], [12, 11], [10, 14]], 'R');
  });
  badge('book', { b: '#4f86c6', B: '#3a669a', w: '#fbf6ee', W: '#d4cdbd', y: '#ffd166', r: '#d9534f' }, function (g) {
    g.rect(1, 2, 7, 13, 'w'); g.rect(8, 2, 14, 13, 'w'); g.rect(1, 13, 14, 13, 'W'); g.rect(7, 2, 8, 13, 'B');
    g.rect(2, 4, 6, 4, 'W'); g.rect(2, 6, 6, 6, 'W'); g.rect(2, 8, 5, 8, 'W'); g.rect(9, 4, 13, 4, 'W'); g.rect(9, 6, 13, 6, 'W'); g.rect(9, 8, 12, 8, 'W');
    g.rect(10, 9, 11, 13, 'r'); g.set(11, 9, 'r'); g.rect(1, 1, 14, 1, 'b'); g.rect(1, 1, 1, 13, 'b'); g.rect(14, 1, 14, 13, 'b');
  });
  badge('brain', { p: '#ffa8c0', P: '#f27a9c', h: '#ffd0dd', d: '#c94a73' }, function (g) {
    g.ell(5.2, 7.5, 4.4, 5.2, 'p', 'h', 'P'); g.ell(10.8, 7.5, 4.4, 5.2, 'p', 'h', 'P'); g.rect(6, 10, 10, 13, 'p'); g.rect(7, 13, 9, 14, 'P'); g.rect(6, 13, 6, 13, 'P');
    g.rect(8, 2, 8, 12, 'd'); g.px([[4, 4], [5, 4], [3, 7], [4, 7], [5, 9], [6, 6], [11, 4], [12, 4], [11, 7], [12, 7], [10, 9], [10, 6]], 'd');
  });
  badge('bolt', { y: '#ffd43b', Y: '#e8a010', h: '#fff7c2' }, function (g) {
    g.poly([[9.5, 0.5], [3, 9], [7.4, 9], [5.6, 15.4], [13, 6], [8.6, 6], [11.2, 0.5]], 'y'); g.px([[8, 2], [7, 4], [6, 6], [5, 8]], 'h'); g.px([[9, 10], [10, 8], [11, 6]], 'Y');
  });
  badge('target', { r: '#e4572e', w: '#fbf6ee', y: '#ffc93c', b: '#6b4226', f: '#4f86c6', k: '#8a8f9c' }, function (g) {
    g.ell(7.5, 8.5, 6.5, 6.5, 'r'); g.ell(7.5, 8.5, 4.8, 4.8, 'w'); g.ell(7.5, 8.5, 3.2, 3.2, 'r'); g.ell(7.5, 8.5, 1.6, 1.6, 'y');
    g.px([[9, 7], [10, 6], [11, 5], [12, 4]], 'b'); g.px([[13, 3], [14, 2], [14, 1], [15, 1], [15, 3], [13, 1], [13, 2], [14, 3]], 'f');
    g.px([[10, 7], [11, 6], [12, 5]], 'k');
  });
  badge('trophy', { g: '#ffc93c', G: '#e69b12', h: '#fff1a8', b: '#6b4226', B: '#8a5a36' }, function (g) {
    g.rect(4, 1, 11, 6, 'g'); g.rect(5, 7, 10, 7, 'g'); g.rect(6, 8, 9, 8, 'G'); g.rect(5, 1, 6, 6, 'h'); g.rect(10, 3, 11, 6, 'G'); g.rect(4, 1, 11, 1, 'h');
    g.px([[2, 2], [2, 3], [3, 4], [13, 2], [13, 3], [12, 4], [2, 4], [13, 4]], 'G'); g.px([[3, 2], [12, 2]], 'g');
    g.rect(7, 9, 8, 11, 'G'); g.rect(4, 12, 11, 14, 'b'); g.rect(4, 12, 11, 12, 'B'); g.rect(6, 13, 9, 13, 'g');
  });
  badge('heart', { r: '#ff5d7a', R: '#d63a5a', h: '#ffb0c0' }, function (g) {
    g.ell(4.8, 5.2, 3.8, 3.6, 'r'); g.ell(11.2, 5.2, 3.8, 3.6, 'r'); g.poly([[1.2, 6.2], [14.8, 6.2], [8, 14.6]], 'r');
    g.px([[3, 3], [4, 3], [3, 4]], 'h'); g.px([[12, 8], [11, 10], [10, 12], [9, 13]], 'R');
  });
  badge('rocket', { w: '#f7f3ea', W: '#d4cdbd', r: '#e4572e', R: '#b8421f', b: '#7ad0f5', B: '#3a8fc4', y: '#ffc93c', Y: '#ff8c42' }, function (g) {
    g.poly([[8, 0.5], [11.4, 4.5], [11.4, 10.5], [4.6, 10.5], [4.6, 4.5]], 'w'); g.rect(10, 5, 11, 10, 'W');
    g.poly([[8, 0.5], [10.6, 3.5], [5.4, 3.5]], 'r'); g.ell(8, 6.5, 1.8, 1.8, 'b', null, 'B');
    g.poly([[4.6, 7], [1.8, 11.5], [4.6, 11.5]], 'r'); g.poly([[11.4, 7], [14.2, 11.5], [11.4, 11.5]], 'r'); g.rect(6, 11, 9, 11, 'R');
    g.rect(7, 12, 8, 13, 'y'); g.rect(7, 12, 8, 12, 'y'); g.rect(7, 13, 8, 14, 'Y'); g.set(7, 14, 'y');
  });
  badge('owl', { b: '#a8774a', B: '#7d5430', w: '#fbf6ee', y: '#ffc93c', k: '#2b1d2a', l: '#d9b68c' }, function (g) {
    g.ell(8, 9, 6, 6, 'b', null, 'B'); g.rect(3, 2, 4, 4, 'b'); g.rect(11, 2, 12, 4, 'b'); g.rect(3, 2, 12, 3, 'b'); g.px([[3, 2], [12, 2]], 'B');
    g.ell(5.6, 6.5, 2.5, 2.5, 'w'); g.ell(10.4, 6.5, 2.5, 2.5, 'w'); g.rect(5, 6, 6, 7, 'k'); g.rect(10, 6, 11, 7, 'k'); g.set(5, 6, 'w'); g.set(10, 6, 'w');
    g.rect(7, 8, 8, 9, 'y'); g.ell(8, 12.5, 3.3, 2.4, 'l'); g.px([[7, 12], [9, 12], [8, 13], [6, 13], [10, 13]], 'b');
    g.px([[5, 15], [6, 15], [9, 15], [10, 15]], 'y');
  });
  badge('check', { g: '#4caf70', G: '#2f8a53', h: '#8fe0a8', w: '#ffffff' }, function (g) {
    g.ell(8, 8, 7, 7, 'g', 'h', 'G'); g.px([[4, 8], [5, 9], [6, 10], [7, 11], [8, 10], [9, 9], [10, 8], [11, 7], [12, 6], [4, 9], [5, 10], [6, 11], [7, 12], [8, 11], [9, 10], [10, 9], [11, 8], [12, 7]], 'w');
  });
  badge('bulb', { y: '#ffd95e', Y: '#e8a010', h: '#fff7c2', m: '#8a8f9c', M: '#6b7080', r: '#fff3b0' }, function (g) {
    g.ell(8, 6, 5, 5.2, 'y', 'h', 'Y'); g.rect(6, 10, 9, 11, 'y'); g.rect(6, 11, 9, 11, 'Y'); g.rect(6, 12, 9, 12, 'm'); g.rect(6, 13, 9, 13, 'M'); g.rect(7, 14, 8, 14, 'm');
    g.px([[7, 8], [8, 9], [9, 8], [8, 7]], 'Y'); g.px([[7, 7], [9, 7]], 'Y'); g.px([[0, 4], [1, 4], [14, 4], [15, 4], [2, 0], [13, 0]], 'r');
  });
  badge('crown', { y: '#ffc93c', Y: '#e69b12', r: '#d9534f', b: '#4f86c6', g: '#4caf70', h: '#fff1a8' }, function (g) {
    g.poly([[1, 4], [4.5, 8], [8, 2], [11.5, 8], [15, 4], [13.4, 13], [2.6, 13]], 'y'); g.rect(2, 11, 13, 13, 'y'); g.rect(2, 13, 13, 13, 'Y');
    g.px([[1, 3], [8, 1], [14, 3]], 'r'); g.px([[1, 4], [14, 4]], 'r'); g.set(8, 2, 'h'); g.px([[5, 11], [10, 11]], 'b'); g.set(8, 11, 'r'); g.set(3, 11, 'g'); g.set(12, 11, 'g');
    g.px([[4, 6], [5, 8]], 'h');
  });
  badge('gem', { c: '#5ad1e6', C: '#2a9cb8', h: '#c8f5ff', d: '#1f7a91' }, function (g) {
    g.poly([[4, 2], [12, 2], [15, 6], [8, 15], [1, 6]], 'c'); g.poly([[4, 2], [6, 2], [5, 6], [1, 6]], 'h'); g.poly([[10, 2], [12, 2], [15, 6], [11, 6]], 'C');
    g.poly([[8, 15], [11, 6], [15, 6]], 'C'); g.rect(1, 6, 15, 6, 'h'); g.px([[7, 3], [8, 3]], 'h'); g.px([[8, 10], [9, 8]], 'd');
  });
  badge('sprout', { g: '#4caf70', G: '#2f8a53', L: '#8fe0a8', r: '#c9693c', R: '#9c4b27', t: '#e38d58' }, function (g) {
    g.ell(4.5, 5.5, 3.6, 2.4, 'g', 'L', 'G'); g.ell(11.5, 4.5, 3.8, 2.6, 'g', 'L', 'G'); g.rect(7, 6, 8, 11, 'G'); g.rect(7, 5, 7, 11, 'g');
    g.rect(3, 11, 12, 11, 't'); g.rect(4, 12, 11, 13, 'r'); g.rect(5, 14, 10, 14, 'R'); g.rect(10, 12, 11, 13, 'R'); g.rect(4, 12, 4, 13, 'r');
  });
  badge('calendar', { w: '#fbf6ee', W: '#d4cdbd', r: '#e4572e', R: '#b8421f', k: '#3a3f4b', y: '#ffc93c', m: '#8a8f9c' }, function (g) {
    g.rect(1, 2, 14, 14, 'w'); g.rect(1, 2, 14, 5, 'r'); g.rect(1, 5, 14, 5, 'R'); g.rect(1, 14, 14, 14, 'W');
    g.rect(4, 1, 4, 3, 'm'); g.rect(11, 1, 11, 3, 'm');
    for (var yy = 0; yy < 2; yy++) for (var xx = 0; xx < 4; xx++) g.rect(3 + xx * 3, 7 + yy * 3, 4 + xx * 3, 8 + yy * 3, 'W');
    g.rect(9, 10, 10, 11, 'y'); g.rect(6, 7, 7, 8, 'k');
  });
  badge('key', { y: '#ffc93c', Y: '#e69b12', h: '#fff1a8' }, function (g) {
    g.ell(4.6, 4.6, 3.8, 3.8, 'y', 'h', 'Y'); g.ell(4.4, 4.4, 1.4, 1.4, '.'); g.poly([[6.5, 7], [8, 5.6], [15, 12.6], [13.6, 14]], 'y');
    g.rect(11, 11, 12, 13, 'Y'); g.px([[13, 12], [14, 13]], 'Y'); g.px([[9, 9], [10, 10]], 'h');
  });
  badge('clock', { f: '#4f86c6', F: '#7aa9de', w: '#fbf6ee', k: '#3a3f4b', r: '#e4572e' }, function (g) {
    g.ell(8, 8, 7, 7, 'f', 'F', null); g.ell(8, 8, 5.4, 5.4, 'w'); g.rect(8, 4, 8, 8, 'k'); g.rect(9, 8, 11, 8, 'k'); g.set(8, 8, 'r');
    g.px([[8, 3], [8, 12], [3, 8], [12, 8]], 'f');
  });

  /* ======================= CONTRÔLE ======================= */
  var problems = [];
  Object.keys(S).forEach(function (n) {
    var sp = S[n], d = DIMS[n], used = {};
    if (sp.frames.length !== d[2]) problems.push('frames ' + n);
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
  items.forEach(function (it) {
    if (it.slot === 'skin') return;
    if (!S[it.sprite]) problems.push('item sans sprite ' + it.id);
    else if (it.slot === 'decor' && (DIMS[it.sprite][0] !== it.w * 16 || DIMS[it.sprite][1] !== it.h * 16)) problems.push('taille item ' + it.id);
    if (it.price < 20 || it.price > 200) problems.push('prix ' + it.id);
  });

  var coaches = ['coach_max', 'coach_lea', 'coach_theo', 'coach_zoe'];
  window.Studio.skins = {
    items: items, sprites: S, recolor: recolor, skinned: skinned,
    skinMaps: SKINS, coaches: coaches, badges: BADGES, _problems: problems
  };
  if (window.Studio.sprites) Object.assign(window.Studio.sprites, S);
})();
