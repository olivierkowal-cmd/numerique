/* Studio v2 — « Mes matières » (dev-subjects). IIFE, pas de module ES, aucune IA.
   Assistants : vocabulaire, dates d'histoire, tables & maths, définitions, cartes avec images,
   « Contrôle demain » (plan jour par jour, clé store 'plan2'), import rapide .csv/.txt.
   Logique pure exposée dans Studio.subjectsLogic (testée sous node : tests/subjects.test.js). */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  root.Studio = root.Studio || {};
  var S = root.Studio;

  /* =====================================================================
     LOGIQUE PURE
     ===================================================================== */
  function stripAccents(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function norm(s) { return stripAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function clean(s) { return String(s == null ? '' : s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim(); }
  function stripHtml(s) {
    return String(s).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  }
  function escXml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // petit générateur pseudo-aléatoire déterministe (testable)
  function rng(seed) {
    var a = (seed == null ? 1 : seed) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rand) {
    var a = arr.slice(), i, j, t;
    for (i = a.length - 1; i > 0; i--) { j = Math.floor(rand() * (i + 1)); t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function pick(arr, rand) { return arr[Math.floor(rand() * arr.length)]; }

  // nombre à la française : virgule décimale, pas de zéros inutiles
  function fmt(n) {
    var r = Math.round(n * 1e9) / 1e9;
    var s = String(r);
    if (/e/i.test(s)) s = r.toFixed(9).replace(/0+$/, '').replace(/\.$/, '');
    return s.replace('.', ',').replace(/^-0$/, '0');
  }
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a || 1; }

  /* ---------- 1. lecture des listes « terme ; définition » ---------- */
  var HEADER_WORDS = ['mot', 'mots', 'word', 'terme', 'term', 'front', 'recto', 'question', 'date', 'francais', 'anglais', 'neerlandais', 'espagnol', 'allemand',
    'traduction', 'translation', 'back', 'verso', 'definition', 'evenement', 'event', 'reponse', 'answer', 'vocabulaire'];

  function csvSplit(line, delim) {
    var out = [], cur = '', q = false, i, ch;
    for (i = 0; i < line.length; i++) {
      ch = line[i];
      if (q) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  // renvoie [a, b] ou null ; csvMode = le texte entier ressemble à du CSV à virgules
  function splitLine(line, csvMode) {
    var m, idx;
    if (line.indexOf('\t') >= 0) {
      var cols = line.split('\t').map(clean).filter(function (c, i) { return i < 2 || c; });
      if (cols[0] && cols[1]) return [cols[0], cols[1]];
      return null;
    }
    if (/^\s*"/.test(line)) {                                   // CSV avec guillemets
      var d = line.indexOf('";') >= 0 || /;\s*"/.test(line) ? ';' : ',';
      var c2 = csvSplit(line, d).map(clean);
      return c2[0] && c2[1] ? [c2[0], c2[1]] : null;
    }
    if ((idx = line.indexOf(';')) >= 0) return [clean(line.slice(0, idx)), clean(line.slice(idx + 1))];
    if ((m = /\s[-–—]\s|\s*(?:=>|->|→|⇒)\s*|\s=\s/.exec(line))) return [clean(line.slice(0, m.index)), clean(line.slice(m.index + m[0].length))];
    if ((m = /\s*:\s+|\s+:\s*/.exec(line))) return [clean(line.slice(0, m.index)), clean(line.slice(m.index + m[0].length))];
    if (csvMode && (idx = line.indexOf(',')) >= 0) return [clean(line.slice(0, idx)), clean(line.slice(idx + 1))];
    return null;
  }

  /* parsePairs(text, {skipHeader=true}) -> {pairs:[{a,b,line}], skipped:[{line,text,reason}], duplicates:n} */
  function parsePairs(text, opts) {
    opts = opts || {};
    var raw = stripHtml(String(text == null ? '' : text)).replace(/^﻿/, '').split(/\r\n|\r|\n/);
    var lines = [], i;
    for (i = 0; i < raw.length; i++) lines.push({ n: i + 1, t: raw[i].replace(/^[\s•·*]+(?=\S)/, '').trim() });
    lines = lines.filter(function (l) { return l.t && !/^(#|\/\/)/.test(l.t); });
    // mode CSV à virgules : aucune ligne n'a de tab / ; / tiret / flèche / deux-points
    var csvMode = lines.length > 0 && lines.every(function (l) { return !/\t|;|\s[-–—]\s|=>|->|→|⇒|\s=\s|:/.test(l.t) && l.t.indexOf(',') >= 0 || /^\s*"/.test(l.t); });
    var pairs = [], skipped = [], seen = {}, dup = 0;
    lines.forEach(function (l, k) {
      var p = splitLine(l.t, csvMode);
      if (!p || !p[0] || !p[1]) { skipped.push({ line: l.n, text: l.t, reason: p ? 'un côté est vide' : 'pas de séparateur' }); return; }
      if (k === 0 && opts.skipHeader !== false && HEADER_WORDS.indexOf(norm(p[0])) >= 0 && HEADER_WORDS.indexOf(norm(p[1])) >= 0) return;
      var key = norm(p[0]) + '\u0001' + norm(p[1]);
      if (seen[key]) { dup++; return; }
      seen[key] = 1;
      pairs.push({ a: p[0], b: p[1], line: l.n });
    });
    return { pairs: pairs, skipped: skipped, duplicates: dup };
  }

  /* ---------- 2. vocabulaire ---------- */
  function vocabCards(pairs, opts) {
    var both = !opts || opts.both !== false, out = [];
    pairs.forEach(function (p) {
      out.push({ front: p.a, back: p.b });
      if (both && norm(p.a) !== norm(p.b)) out.push({ front: p.b, back: p.a });
    });
    return out;
  }

  // QCM générique : prompt(pair) ; réponse = field 'answerField' ; distracteurs pris chez les autres paires
  function mcQuestions(pairs, prompt, ansOf, opts) {
    opts = opts || {};
    var rand = rng(opts.seed == null ? 7 : opts.seed), max = opts.max || 10, out = [];
    if (pairs.length < 3) return out;
    shuffle(pairs, rand).forEach(function (p) {
      if (out.length >= max) return;
      var good = ansOf(p), pool = [];
      pairs.forEach(function (o) { var v = ansOf(o); if (norm(v) !== norm(good) && pool.map(norm).indexOf(norm(v)) < 0) pool.push(v); });
      if (pool.length < 1) return;
      var choices = shuffle([good].concat(shuffle(pool, rand).slice(0, 3)), rand);
      out.push({ type: 'qcm', q: prompt(p), choices: choices, answer: choices.indexOf(good), explain: 'Réponse : ' + good + '.', difficulty: 1 });
    });
    return out;
  }
  function vocabQuiz(pairs, opts) { return mcQuestions(pairs, function (p) { return 'Que veut dire « ' + p.a + ' » ?'; }, function (p) { return p.b; }, opts); }

  /* ---------- 3. dates d'histoire ---------- */
  var BC = /av(?:ant|\.)?\s*(?:j\.?\s*-?\s*c|j[ée]sus)/i;
  function yearOf(s) {
    s = String(s);
    var nums = s.match(/\d+/g);
    if (!nums) return null;
    var n = nums.filter(function (x) { return x.length >= 3; })[0] || nums[0];
    var y = parseInt(n, 10);
    return BC.test(s) || /^\s*-\s*\d/.test(s) ? -y : y;
  }
  /* parseDates(text) -> {events:[{date,title,year,line}] triés, skipped, duplicates} */
  function parseDates(text) {
    var r = parsePairs(text, { skipHeader: true }), events = [], skipped = r.skipped.slice();
    r.pairs.forEach(function (p) {
      var a = p.a, b = p.b;
      if (!/\d/.test(a) && /\d/.test(b)) { var t = a; a = b; b = t; }
      var y = /\d/.test(a) ? yearOf(a) : null;
      if (y == null) { skipped.push({ line: p.line, text: p.a + ' ; ' + p.b, reason: 'pas de date' }); return; }
      events.push({ date: a, title: b, year: y, line: p.line });
    });
    events.sort(function (x, y2) { return x.year - y2.year || x.line - y2.line; });
    return { events: events, skipped: skipped, duplicates: r.duplicates };
  }
  function dateCards(events, opts) {
    var both = !opts || opts.both !== false, out = [];
    events.forEach(function (e) {
      out.push({ front: e.date, back: e.title, hint: 'Que s’est-il passé ?' });
      if (both) out.push({ front: e.title, back: e.date, hint: 'En quelle année ?' });
    });
    return out;
  }
  function dateQuiz(events, opts) {
    return mcQuestions(events, function (e) { return 'Quand a eu lieu : ' + e.title + ' ?'; }, function (e) { return e.date; }, opts);
  }
  function wrapWords(s, n, maxLines) {
    var words = String(s).split(' '), lines = [], cur = '';
    words.forEach(function (w) { if ((cur + ' ' + w).trim().length > n && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, '…'); }
    return lines;
  }
  /* frise SVG : positions proportionnelles aux années, écartées d'au moins `gap` px */
  function timelineSvg(events, opts) {
    opts = opts || {};
    var evs = events.slice().sort(function (a, b) { return a.year - b.year; });
    if (!evs.length) return '';
    var gap = opts.gap || 112, pad = 70, minY = evs[0].year, maxY = evs[evs.length - 1].year, span = Math.max(1, maxY - minY);
    var base = Math.max(560, (evs.length - 1) * gap);
    var xs = [], i;
    for (i = 0; i < evs.length; i++) {
      var x = pad + (evs.length === 1 ? base / 2 : (evs[i].year - minY) / span * base);
      if (i && x < xs[i - 1] + gap) x = xs[i - 1] + gap;
      xs.push(x);
    }
    var W = xs[xs.length - 1] + pad, H = 300, axis = 150, out = [];
    out.push('<svg xmlns="http://www.w3.org/2000/svg" class="sj-timeline" viewBox="0 0 ' + Math.round(W) + ' ' + H + '" width="' + Math.round(W) + '" height="' + H + '" role="img" aria-label="Frise chronologique de ' + evs.length + ' événements">');
    out.push('<line class="sj-axis" x1="20" y1="' + axis + '" x2="' + Math.round(W - 20) + '" y2="' + axis + '" stroke-width="4" stroke-linecap="round"/>');
    evs.forEach(function (e, k) {
      var up = k % 2 === 0, x = Math.round(xs[k]), y1 = up ? axis - 38 : axis + 38, ty = up ? axis - 46 : axis + 54;
      out.push('<line class="sj-stem" x1="' + x + '" y1="' + axis + '" x2="' + x + '" y2="' + y1 + '" stroke-width="2"/>');
      out.push('<circle class="sj-dot" cx="' + x + '" cy="' + axis + '" r="7"/>');
      var lines = wrapWords(e.title, 17, 3), nl = lines.length;
      var texts = '<text class="sj-year" x="' + x + '" y="' + (up ? ty - nl * 15 - 4 : ty + 2) + '" text-anchor="middle">' + escXml(e.date) + '</text>';
      lines.forEach(function (ln, j) { texts += '<text class="sj-title" x="' + x + '" y="' + (up ? ty - (nl - 1 - j) * 15 : ty + 18 + j * 15) + '" text-anchor="middle">' + escXml(ln) + '</text>'; });
      out.push(texts);
    });
    out.push('</svg>');
    return out.join('');
  }

  /* ---------- 4. tables et maths ---------- */
  /* tablesCards([2,7], {max:10, divisions:false, shuffle:false, seed}) */
  function tablesCards(tables, opts) {
    opts = opts || {};
    var max = Math.max(1, Math.min(20, opts.max || 10)), out = [], seen = {};
    (tables || []).forEach(function (t) {
      t = Math.round(t);
      if (!(t >= 1 && t <= 30)) return;
      for (var k = 1; k <= max; k++) {
        var f = t + ' × ' + k + ' = ?';
        if (!seen[f]) { seen[f] = 1; out.push({ front: f, back: String(t * k) }); }
        if (opts.divisions) { var d = (t * k) + ' ÷ ' + t + ' = ?'; if (!seen[d]) { seen[d] = 1; out.push({ front: d, back: String(k) }); } }
      }
    });
    return opts.shuffle ? shuffle(out, rng(opts.seed || 1)) : out;
  }
  function tablesQuiz(tables, opts) {
    opts = opts || {};
    var cards = shuffle(tablesCards(tables, { max: opts.max }), rng(opts.seed || 3)).slice(0, opts.count || 10);
    return cards.map(function (c) { return { type: 'fill', q: c.front.replace(' = ?', ' = ____'), answer: c.back, explain: c.front.replace('?', c.back), difficulty: 1 }; });
  }

  function fractionCards(n, seed) {
    var rand = rng(seed == null ? 11 : seed), out = [], seen = {}, tries = 0;
    function add(f, b) { if (!seen[f]) { seen[f] = 1; out.push({ front: f, back: b }); } }
    var denoms = [2, 3, 4, 5, 6, 8, 10, 12];
    while (out.length < n && tries++ < n * 40) {
      var kind = out.length % 4, d, num, g;
      if (kind === 0) {                                         // simplifier
        g = pick([2, 3, 4, 5], rand); d = pick(denoms.filter(function (x) { return x <= 6; }), rand); num = Math.floor(rand() * (d - 1)) + 1;
        if (gcd(num, d) !== 1) continue;
        add('Simplifie la fraction ' + (num * g) + '/' + (d * g), num + '/' + d);
      } else if (kind === 1) {                                  // addition, même dénominateur
        d = pick(denoms, rand); var a = Math.floor(rand() * (d - 2)) + 1, b = Math.floor(rand() * (d - a - 1)) + 1;
        if (a + b >= d) continue;
        var s = a + b, gg = gcd(s, d);
        add(a + '/' + d + ' + ' + b + '/' + d + ' = ?', s + '/' + d + (gg > 1 ? ' (ou ' + (s / gg) + '/' + (d / gg) + ')' : ''));
      } else if (kind === 2) {                                  // fraction d'un nombre
        d = pick([2, 3, 4, 5, 10], rand); num = Math.floor(rand() * (d - 1)) + 1; var q = Math.floor(rand() * 9) + 2;
        add('Calcule ' + num + '/' + d + ' de ' + (d * q), String(num * q));
      } else {                                                  // fractions équivalentes
        d = pick([2, 3, 4, 5], rand); num = Math.floor(rand() * (d - 1)) + 1; var m = pick([2, 3, 4, 5, 6], rand);
        add(num + '/' + d + ' = ?/' + (d * m), String(num * m));
      }
    }
    return out;
  }

  var UNIT_GROUPS = {
    longueur: [['km', 1000], ['m', 1], ['dm', 0.1], ['cm', 0.01], ['mm', 0.001]],
    masse: [['t', 1e6], ['kg', 1000], ['g', 1], ['mg', 0.001]],
    capacité: [['hL', 100], ['L', 1], ['dL', 0.1], ['cL', 0.01], ['mL', 0.001]],
    durée: [['j', 86400], ['h', 3600], ['min', 60], ['s', 1]]
  };
  function convert(v, from, to, group) {
    var g = UNIT_GROUPS[group], f = null, t = null;
    g.forEach(function (u) { if (u[0] === from) f = u[1]; if (u[0] === to) t = u[1]; });
    if (f == null || t == null) throw new Error('unité inconnue');
    return Math.round(v * f / t * 1e9) / 1e9;
  }
  function unitCards(n, seed, groups) {
    var rand = rng(seed == null ? 5 : seed), out = [], seen = {}, tries = 0;
    var names = (groups && groups.length ? groups : Object.keys(UNIT_GROUPS)).filter(function (k) { return UNIT_GROUPS[k]; });
    var values = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 0.5, 1.5, 2.5, 3.5, 7.5, 0.25];
    while (out.length < n && tries++ < n * 60 && names.length) {
      var gname = names[out.length % names.length], g = UNIT_GROUPS[gname];
      var i = Math.floor(rand() * g.length), j = Math.floor(rand() * g.length);
      if (i === j || Math.abs(i - j) > 3) continue;
      var v = pick(values, rand), res = convert(v, g[i][0], g[j][0], gname);
      if (res > 100000 || res < 0.01) continue;
      var f = 'Convertis : ' + fmt(v) + ' ' + g[i][0] + ' = ? ' + g[j][0];
      if (!seen[f]) { seen[f] = 1; out.push({ front: f, back: fmt(res) + ' ' + g[j][0] }); }
    }
    return out;
  }

  var PI = 3.14;
  var FORMULAS = [
    ['Aire du rectangle', 'longueur × largeur'], ['Périmètre du rectangle', '2 × (longueur + largeur)'],
    ['Aire du carré', 'côté × côté'], ['Périmètre du carré', '4 × côté'],
    ['Aire du triangle', 'base × hauteur ÷ 2'], ['Aire du parallélogramme', 'base × hauteur'],
    ['Aire du losange', 'grande diagonale × petite diagonale ÷ 2'], ['Aire du trapèze', '(grande base + petite base) × hauteur ÷ 2'],
    ['Périmètre du cercle', '2 × π × rayon'], ['Aire du disque', 'π × rayon × rayon']
  ];
  function geometryCards(n, seed, opts) {
    opts = opts || {};
    var rand = rng(seed == null ? 9 : seed), out = [], seen = {}, tries = 0;
    if (opts.formulas !== false) FORMULAS.forEach(function (f) { seen[f[0]] = 1; out.push({ front: f[0] + ' : quelle formule ?', back: f[1] }); });
    var kinds = ['rect', 'rectP', 'carre', 'carreP', 'tri', 'cerP', 'cerA', 'para', 'losange', 'trap'], count = 0;
    function add(q, a) { if (!seen[q]) { seen[q] = 1; out.push({ front: q, back: a }); count++; } }
    while (count < n && tries++ < n * 60) {
      var k = kinds[count % kinds.length], L = Math.floor(rand() * 12) + 2, l = Math.floor(rand() * 9) + 2, h = Math.floor(rand() * 9) + 2;
      if (k === 'rect') add('Rectangle de ' + L + ' cm sur ' + l + ' cm. Quelle est son aire ?', fmt(L * l) + ' cm²');
      else if (k === 'rectP') add('Rectangle de ' + L + ' cm sur ' + l + ' cm. Quel est son périmètre ?', fmt(2 * (L + l)) + ' cm');
      else if (k === 'carre') add('Carré de ' + l + ' cm de côté. Quelle est son aire ?', fmt(l * l) + ' cm²');
      else if (k === 'carreP') add('Carré de ' + L + ' cm de côté. Quel est son périmètre ?', fmt(4 * L) + ' cm');
      else if (k === 'tri') add('Triangle de base ' + (2 * L) + ' cm et de hauteur ' + h + ' cm. Quelle est son aire ?', fmt(2 * L * h / 2) + ' cm²');
      else if (k === 'cerP') add('Cercle de rayon ' + l + ' cm. Quel est son périmètre ? (π ≈ 3,14)', fmt(2 * PI * l) + ' cm');
      else if (k === 'cerA') add('Disque de rayon ' + l + ' cm. Quelle est son aire ? (π ≈ 3,14)', fmt(PI * l * l) + ' cm²');
      else if (k === 'para') add('Parallélogramme de base ' + L + ' cm et de hauteur ' + h + ' cm. Quelle est son aire ?', fmt(L * h) + ' cm²');
      else if (k === 'losange') add('Losange de diagonales ' + (2 * L) + ' cm et ' + (2 * h) + ' cm. Quelle est son aire ?', fmt(2 * L * 2 * h / 2) + ' cm²');
      else add('Trapèze de bases ' + L + ' cm et ' + (L + l) + ' cm, de hauteur ' + (2 * h) + ' cm. Quelle est son aire ?', fmt((L + L + l) * 2 * h / 2) + ' cm²');
    }
    return out;
  }

  /* ---------- 5. définitions ---------- */
  function parseDefinitions(text) { return parsePairs(text, { skipHeader: true }); }
  function definitionCards(pairs, opts) {
    var both = opts && opts.both, out = [];
    pairs.forEach(function (p) {
      out.push({ front: p.a, back: p.b, hint: 'Définis ce mot' });
      if (both) out.push({ front: p.b, back: p.a, hint: 'Quel est le mot ?' });
    });
    return out;
  }
  function definitionQuiz(pairs, opts) {
    return mcQuestions(pairs, function (p) { return 'Quel mot correspond à : « ' + p.b + ' » ?'; }, function (p) { return p.a; }, opts);
  }

  /* ---------- 6. images ---------- */
  function dataUrlBytes(u) {
    var i = String(u).indexOf('base64,');
    if (i < 0) return String(u).length;
    var b64 = u.slice(i + 7), pad = /==$/.test(b64) ? 2 : /=$/.test(b64) ? 1 : 0;
    return Math.floor(b64.length * 3 / 4) - pad;
  }
  function fitSize(w, h, max) {
    var k = Math.min(1, max / Math.max(w, h, 1));
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
  }

  /* ---------- 7. import Anki-like ---------- */
  function parseImport(text) {
    var t = String(text == null ? '' : text);
    return parsePairs(t, { skipHeader: true });   // les lignes « #separator:tab » / « #html:true » sont des commentaires ignorés
  }
  function titleFromFilename(name) { return clean(String(name || 'Import').replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[_-]+/g, ' ')) || 'Import'; }

  /* ---------- 8. « Contrôle demain » ---------- */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(d) { d = d instanceof Date ? d : new Date(d); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function parseDay(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function addDays(d, n) { var r = new Date(d.getFullYear(), d.getMonth(), d.getDate()); r.setDate(r.getDate() + n); return r; }
  function daysBetween(a, b) { return Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000); }

  // tâches du jour « J-n » (le paramètre « has » est gardé pour compatibilité, il n'est plus utilisé)
  function tasksFor(n, has) {
    has = has || {};
    var read = { kind: 'read', text: 'Relis ton cours pendant 10 minutes.', go: 'library' };
    var cards10 = { kind: 'cards', text: 'Révise 10 cartes.', go: 'flashcards' };
    var test = { kind: 'cards', text: 'Teste-toi avec tes cartes (10 minutes).', go: 'flashcards' };
    var memory = { kind: 'memory', text: 'Joue au memory (5 minutes).', go: 'memory' };
    var missed = { kind: 'cards', text: 'Revois tes cartes ratées.', go: 'flashcards' };
    if (n <= 0) return [{ kind: 'final', text: 'Jour J : 5 minutes pour relire tes cartes difficiles.', go: 'flashcards' }];
    if (n === 1) return [memory, missed];
    if (n === 2) return [test];
    if (n === 3) return [read, cards10];
    if (n === 4) return [read, cards10];
    if (n === 5) return [cards10, memory];
    if (n === 6) return [read];
    return [cards10];
  }
  /* buildPlan({exam:'AAAA-MM-JJ', today:Date, subject, docId, deckId, has}) -> plan | {error} */
  function buildPlan(o) {
    o = o || {};
    var today = o.today || new Date(), exam = typeof o.exam === 'string' ? parseDay(o.exam) : o.exam;
    if (!exam) return { error: 'Choisis la date de ton contrôle.' };
    var n = daysBetween(today, exam);
    if (n < 0) return { error: 'Cette date est déjà passée.' };
    if (n > 7) return { error: 'Choisis une date dans les 7 prochains jours.' };
    var days = [], k, tasks, t;
    for (k = n; k >= 0; k--) {
      tasks = tasksFor(k, o.has).map(function (x, i) { return { id: 'j' + k + '-' + i, kind: x.kind, text: x.text, go: x.go, done: false }; });
      t = addDays(today, n - k);
      days.push({ day: dayKey(t), offset: k, label: k === 0 ? 'Jour J' : 'J-' + k, tasks: tasks });
    }
    return { subject: clean(o.subject) || 'Mon contrôle', docId: o.docId || null, deckId: o.deckId || null, exam: dayKey(exam), created: dayKey(today), days: days };
  }
  /* examPlan(cards, n, today?) : contrôle dans n jours (1…7) -> n étapes (aujourd'hui … veille), cartes réparties */
  function examPlan(cards, n, today) {
    today = today || new Date();
    n = Math.round(n);
    if (!(n >= 1)) return { error: 'Le contrôle doit être dans le futur.', days: [] };
    var p = buildPlan({ exam: addDays(today, n), today: today });
    if (p.error) return { error: p.error, days: [] };
    var days = p.days.slice(0, n), list = cards || [], base = Math.floor(list.length / n), extra = list.length % n, pos = 0;
    days.forEach(function (d, i) { var take = base + (i < extra ? 1 : 0); d.cards = list.slice(pos, pos + take); d.count = d.cards.length; pos += take; });
    return { days: days, steps: days, total: list.length, daysLeft: n };
  }
  function planProgress(plan) {
    var done = 0, total = 0;
    ((plan && plan.days) || []).forEach(function (d) { d.tasks.forEach(function (t) { total++; if (t.done) done++; }); });
    return { done: done, total: total, pct: total ? Math.round(100 * done / total) : 0 };
  }
  function planToday(plan, today) {
    var k = dayKey(today || new Date()), r = null;
    ((plan && plan.days) || []).forEach(function (d) { if (d.day === k) r = d; });
    return r;
  }
  function coachMessage(plan, today) {
    if (!plan || !plan.days || !plan.days.length) return 'Choisis ta matière et la date : je prépare ton plan.';
    today = today || new Date();
    var exam = parseDay(plan.exam), left = exam ? daysBetween(today, exam) : 0, p = planProgress(plan), d = planToday(plan, today);
    if (left < 0) return p.pct >= 80 ? 'Le contrôle est passé. Tu t’y étais bien préparé. Bravo !' : 'Le contrôle est passé. La prochaine fois, on fera un plan encore plus tôt !';
    if (left === 0) return 'C’est aujourd’hui ! Cinq minutes de relecture, puis respire. Tu es prêt.';
    if (d && d.tasks.length && d.tasks.every(function (t) { return t.done; })) return 'Super, tu as fini pour aujourd’hui ! Repose-toi, ton cerveau retient pendant que tu dors.';
    if (p.done === 0) return 'On y va doucement : commence par la première case. Petit à petit, ça rentre.';
    return 'Bien joué, ' + p.done + ' étape' + (p.done > 1 ? 's' : '') + ' sur ' + p.total + '. Continue comme ça !';
  }

  /* ---------- exemples de repli (si content/subjects.js n'a pas de samples) ---------- */
  var FALLBACK_SAMPLES = {
    vocab: { title: 'Anglais : les animaux', lang: 'en', text: 'dog ; chien\ncat ; chat\nhorse ; cheval\nrabbit ; lapin\nbird ; oiseau\nfish ; poisson\ncow ; vache\npig ; cochon' },
    dates: { title: 'Histoire : quelques dates', text: '-3500 ; Invention de l’écriture en Mésopotamie\n476 ; Fin de l’Empire romain d’Occident\n1492 ; Christophe Colomb arrive en Amérique\n1789 ; Prise de la Bastille\n1914 ; Début de la Première Guerre mondiale\n1945 ; Fin de la Seconde Guerre mondiale' },
    definitions: { title: 'Sciences : les mots à connaître', text: 'Atome ; Plus petite particule d’un élément chimique\nMolécule ; Groupe d’atomes liés entre eux\nÉvaporation ; Passage d’un liquide à l’état de gaz\nCondensation ; Passage d’un gaz à l’état liquide\nHabitat ; Lieu où vit un être vivant' }
  };
  /* samplesFor(kind) : accepte plusieurs formes pour Studio.content.subjects.samples (tableau ou objet, texte ou {title,text|pairs|lines}) */
  function samplesFor(kind, content) {
    var out = [], c = content === undefined ? (S.content && S.content.subjects) : content, src = c && c.samples;
    function toText(v) {
      if (typeof v === 'string') return v;
      if (v && typeof v.text === 'string') return v.text;
      var arr = v && (v.pairs || v.paires || v.lines || v.items || v.cards);
      if (Array.isArray(arr)) return arr.map(function (x) { return Array.isArray(x) ? x.join(' ; ') : (x && (x.a || x.front || x.term || x.word || x.date)) ? ((x.a || x.front || x.term || x.word || x.date) + ' ; ' + (x.b || x.back || x.definition || x.translation || x.event || x.title)) : String(x); }).join('\n');
      return '';
    }
    function aliases(k) { return { vocab: ['vocab', 'vocabulary', 'vocabulaire', 'langues', 'languages'], dates: ['dates', 'histoire', 'history'], definitions: ['definitions', 'définitions', 'sciences', 'science', 'geo', 'géo'] }[k] || [k]; }
    function push(v, fallbackTitle) { var t = toText(v); if (t && t.trim()) out.push({ title: (v && (v.title || v.titre || v.name || v.label)) || fallbackTitle || 'Exemple', text: t, lang: v && (v.lang || v.langue), foreignRight: !!(v && (v.paires || v.pairs) && (v.lang || v.langue)) }); }
    if (src) {
      var al = aliases(kind);
      if (Array.isArray(src)) {
        src.forEach(function (v) { var ty = norm((v && (v.type || v.kind || v.id)) || ''); if (al.some(function (a) { return ty.indexOf(norm(a)) === 0 || norm(a) === ty; })) push(v); });
      } else if (typeof src === 'object') {
        Object.keys(src).forEach(function (key) {
          if (!al.some(function (a) { return norm(a) === norm(key) || norm(key).indexOf(norm(a)) === 0; })) return;
          var v = src[key];
          if (Array.isArray(v) && v.length && typeof v[0] === 'object' && !Array.isArray(v[0]) && !(v[0].a || v[0].front)) v.forEach(function (x) { push(x); });
          else if (Array.isArray(v) && v.length && typeof v[0] === 'object' && (v[0].text || v[0].pairs || v[0].paires || v[0].lines)) v.forEach(function (x) { push(x); });
          else if (v && typeof v === 'object' && !Array.isArray(v) && !v.text && !v.pairs && !v.paires && !v.lines && !v.items) Object.keys(v).forEach(function (kk) { push(v[kk], kk); });
          else push(v, key);
        });
      }
    }
    if (!out.length && FALLBACK_SAMPLES[kind]) out.push(FALLBACK_SAMPLES[kind]);
    return out;
  }

  var L = {
    stripAccents: stripAccents, norm: norm, clean: clean, stripHtml: stripHtml, rng: rng, shuffle: shuffle, fmt: fmt, gcd: gcd,
    splitLine: splitLine, parsePairs: parsePairs, vocabCards: vocabCards, vocabQuiz: vocabQuiz, mcQuestions: mcQuestions,
    yearOf: yearOf, parseDates: parseDates, dateCards: dateCards, dateQuiz: dateQuiz, timelineSvg: timelineSvg,
    tablesCards: tablesCards, tablesQuiz: tablesQuiz, fractionCards: fractionCards, unitCards: unitCards, convert: convert, UNIT_GROUPS: UNIT_GROUPS,
    geometryCards: geometryCards, FORMULAS: FORMULAS, parseDefinitions: parseDefinitions, definitionCards: definitionCards, definitionQuiz: definitionQuiz,
    dataUrlBytes: dataUrlBytes, fitSize: fitSize, parseImport: parseImport, titleFromFilename: titleFromFilename,
    dayKey: dayKey, parseDay: parseDay, addDays: addDays, daysBetween: daysBetween, tasksFor: tasksFor, buildPlan: buildPlan, examPlan: examPlan,
    planProgress: planProgress, planToday: planToday, coachMessage: coachMessage, samplesFor: samplesFor, FALLBACK_SAMPLES: FALLBACK_SAMPLES
  };
  S.subjectsLogic = L;
  if (typeof module !== 'undefined' && module.exports) module.exports = L;

  if (typeof document === 'undefined' || typeof S.register !== 'function') return;

  /* =====================================================================
     INTERFACE
     ===================================================================== */
  function h(tag, attrs) { return S.ui.el.apply(S.ui, arguments); }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function toast(m, t) { if (S.ui && S.ui.toast) S.ui.toast(m, t); }
  function plural(n, s, p) { return n + ' ' + (n > 1 ? (p || s + 's') : s); }
  function emit(type, count) { if (S.bus && S.bus.emit) S.bus.emit('activity', { type: type, count: count }); }
  function say(text, lang) {
    if (typeof S.speak === 'function') { S.speak(text, { lang: lang }); return; }
    try {
      if (root.speechSynthesis && root.SpeechSynthesisUtterance) {
        var u = new root.SpeechSynthesisUtterance(text); if (lang) u.lang = lang;
        root.speechSynthesis.cancel(); root.speechSynthesis.speak(u);
      }
    } catch (e) { /* silencieux */ }
  }
  function canSpeak() { return typeof S.speak === 'function' || !!(root.speechSynthesis && root.SpeechSynthesisUtterance); }

  function newCard(spec) {
    var c = { id: S.ui.uid(), front: spec.front, back: spec.back, hint: spec.hint || '', box: 0, ease: 2.5, interval: 0, reps: 0, lapses: 0, due: Date.now() };
    if (!c.hint) delete c.hint;
    if (spec.imgFront) c.imgFront = spec.imgFront;
    if (spec.imgBack) c.imgBack = spec.imgBack;
    return c;
  }
  /* crée un deck ; renvoie {deck, quiz:null, count}. (Les questions éventuelles ne sont plus enregistrées : plus de mode Quiz.) */
  function createContent(title, specs, questions, docId) {
    var did = docId || (S.activeDocId && S.activeDocId()) || 'subjects';
    var deck = S.store.add('decks', { id: S.ui.uid(), docId: did, title: title, createdAt: Date.now(), cards: specs.map(newCard) });
    if (!deck) { toast('Plus de place : supprime un vieux cours ou exporte tes données.', 'error'); return null; }   // rien n'est enregistré
    S.bus.emit('decks:changed');
    var quiz = null;
    emit('import', specs.length);
    return { deck: deck, quiz: quiz, count: specs.length };
  }

  function mount(container) {
    var root0 = h('div', { class: 'sj' });
    clear(container); container.appendChild(root0);
    return root0;
  }

  function render(container, ctx) {
    var box = mount(container);
    var KINDS = [
      { id: 'vocab', icon: '🔤', title: 'Vocabulaire', text: 'Colle une liste de mots. Je fais des cartes dans les deux sens.' },
      { id: 'dates', icon: '🏛️', title: 'Dates d’histoire', text: 'Date et événement, avec une frise du temps.' },
      { id: 'maths', icon: '🧮', title: 'Tables et maths', text: 'Tables, fractions, unités, aires et périmètres.' },
      { id: 'defs', icon: '🔬', title: 'Définitions', text: 'Un mot, sa définition. Pour les sciences et la géo.' },
      { id: 'images', icon: '🖼️', title: 'Cartes avec images', text: 'Ajoute une photo au recto ou au verso.' },
      { id: 'plan', icon: '📅', title: 'Contrôle demain', text: 'Un plan tout simple, jour par jour.' },
      { id: 'import', icon: '📥', title: 'Importer un fichier', text: 'Un fichier .csv ou .txt (comme Anki).' }
    ];
    var openId = ctx && ctx.params && ctx.params.assistant;

    function home() {
      clear(box);
      box.appendChild(h('div', { class: 'page-header' }, h('div', null, h('h1', null, '🎒 Mes matières'), h('p', { class: 'lead' }, 'Choisis un assistant. Pas besoin d’IA ni de cours.'))));
      var plan = S.store.get('plan2', null);
      if (plan && plan.days) {
        var pr = planProgress(plan);
        box.appendChild(h('button', { type: 'button', class: 'card sj-plan-banner', onclick: function () { wizard('plan'); } },
          h('strong', null, '📅 ' + plan.subject + ' : contrôle le ' + plan.exam), h('span', { class: 'muted' }, ' · ' + pr.done + '/' + pr.total + ' étapes faites')));
      }
      var grid = h('div', { class: 'grid sj-grid' });
      KINDS.forEach(function (k) {
        grid.appendChild(h('button', { type: 'button', class: 'card sj-tile', 'data-assistant': k.id, onclick: function () { wizard(k.id); } },
          h('span', { class: 'sj-tile-icon', 'aria-hidden': 'true' }, k.icon), h('strong', null, k.title), h('span', { class: 'muted' }, k.text)));
      });
      box.appendChild(grid);
    }

    function back() { return h('button', { class: 'btn btn-ghost', type: 'button', onclick: home }, '← Mes matières'); }

    function wizard(id) {
      clear(box);
      var k = KINDS.filter(function (x) { return x.id === id; })[0];
      box.appendChild(back());
      box.appendChild(h('h1', { class: 'sj-h1' }, k.icon + ' ' + k.title));
      var body = h('div', { class: 'stack' });
      box.appendChild(body);
      var f = { vocab: wVocab, dates: wDates, maths: wMaths, defs: wDefs, images: wImages, plan: wPlan, import: wImport }[id];
      f(body);
    }

    /* ---- éléments communs ---- */
    function field(label, ctl, id) { return h('div', { class: 'field' }, h('label', { for: id }, label), ctl); }
    function checkbox(label, checked, id) {
      var cb = h('input', { type: 'checkbox', id: id }); cb.checked = !!checked;
      return { cb: cb, node: h('label', { class: 'sj-check', for: id }, cb, ' ' + label) };
    }
    function resultPanel(res, kindLabel) {
      var p = h('div', { class: 'card sj-result', role: 'status' },
        h('h2', null, '✅ ' + plural(res.count, 'carte créée', 'cartes créées')),
        h('p', null, 'Paquet « ' + res.deck.title + ' ».'),
        h('div', { class: 'row sj-actions' },
          h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: function () { S.go('flashcards', { deckId: res.deck.id, review: 1 }); } }, 'Réviser maintenant'),
          h('button', { class: 'btn btn-ghost', type: 'button', onclick: home }, 'Retour')));
      return p;
    }
    function previewBox(specs, info, extraNode) {
      var p = h('div', { class: 'card sj-preview', 'aria-live': 'polite' });
      p.appendChild(h('h2', null, 'Aperçu'));
      if (!specs.length) { p.appendChild(h('p', { class: 'muted' }, 'Rien à créer pour l’instant.')); }
      else {
        p.appendChild(h('p', null, h('strong', null, plural(specs.length, 'carte')), ' seront créées.'));
        var lst = h('ul', { class: 'sj-prev-list' });
        specs.slice(0, 6).forEach(function (c) { lst.appendChild(h('li', null, h('span', null, c.front), h('span', { class: 'sj-arrow', 'aria-hidden': 'true' }, ' → '), h('span', { class: 'muted' }, c.back))); });
        p.appendChild(lst);
        if (specs.length > 6) p.appendChild(h('p', { class: 'muted' }, '… et ' + (specs.length - 6) + ' de plus.'));
      }
      if (info && info.duplicates) p.appendChild(h('p', { class: 'badge badge-sun' }, plural(info.duplicates, 'doublon') + ' ignoré' + (info.duplicates > 1 ? 's' : '')));
      if (info && info.skipped && info.skipped.length) {
        p.appendChild(h('p', { class: 'badge badge-coral' }, plural(info.skipped.length, 'ligne') + ' non comprise' + (info.skipped.length > 1 ? 's' : '') + ' :'));
        var sl = h('ul', { class: 'sj-skipped' });
        info.skipped.slice(0, 4).forEach(function (s) { sl.appendChild(h('li', null, 'ligne ' + s.line + ' : « ' + s.text.slice(0, 40) + ' » (' + s.reason + ')')); });
        p.appendChild(sl);
      }
      if (extraNode) p.appendChild(extraNode);
      return p;
    }

    /* assistant à partir d'un texte collé (vocab, dates, defs, import) */
    function textWizard(body, cfg) {
      var ta = h('textarea', { id: 'sj-text', rows: 8, placeholder: cfg.placeholder, 'aria-label': cfg.label || 'Ta liste' });
      var titleIn = h('input', { type: 'text', id: 'sj-title', value: cfg.title || '' });
      titleIn._auto = true;
      var both = checkbox(cfg.bothLabel || 'Cartes dans les deux sens', true, 'sj-both');
      var extras = cfg.extras ? cfg.extras() : null;
      var out = h('div'), act = h('div', { class: 'row sj-actions' });
      var state = null;
      var samples = cfg.sampleKind ? samplesFor(cfg.sampleKind) : [];
      var sampleRow = null;
      if (samples.length) {
        sampleRow = h('div', { class: 'sj-samples' }, h('span', { class: 'muted' }, 'Pas d’idée ? Essaie un exemple : '));
        samples.slice(0, 4).forEach(function (sm) {
          sampleRow.appendChild(h('button', { class: 'chip', type: 'button', onclick: function () {
            ta.value = sm.text; if (!titleIn.value || titleIn._auto) { titleIn.value = sm.title; titleIn._auto = true; }
            if (cfg.onSampleLang) cfg.onSampleLang(sm.lang, sm);
            update();
          } }, sm.title));
        });
      }
      var createBtn = h('button', { class: 'btn btn-primary btn-lg', type: 'button', disabled: true, onclick: create }, 'Créer les cartes');
      function update() {
        state = ta.value.trim() ? cfg.parse(ta.value) : null;
        var built = state ? cfg.build(state, { both: both.cb.checked }) : { cards: [] };
        state && (state.built = built);
        clear(out);
        if (state) out.appendChild(previewBox(built.cards, state, cfg.previewExtra ? cfg.previewExtra(state) : null));
        createBtn.disabled = !(built.cards && built.cards.length);
      }
      function create() {
        if (!state || !state.built.cards.length) return;
        var res = createContent(titleIn.value.trim() || cfg.title || 'Mon paquet', state.built.cards, [], cfg.docId && cfg.docId());
        if (!res) return;
        clear(body); body.appendChild(resultPanel(res)); toast(plural(res.count, 'carte créée', 'cartes créées') + ' !', 'success');
      }
      ta.addEventListener('input', update); both.cb.addEventListener('change', update);
      titleIn.addEventListener('input', function () { titleIn._auto = false; });
      if (cfg.intro) body.appendChild(h('p', { class: 'lead' }, cfg.intro));
      if (cfg.beforeText) body.appendChild(cfg.beforeText());
      body.appendChild(h('div', { class: 'card stack' }, sampleRow, field(cfg.label || 'Ta liste (une ligne par carte)', ta, 'sj-text'), extras,
        h('div', { class: 'sj-opts' }, cfg.noBoth ? null : both.node), field('Nom du paquet', titleIn, 'sj-title')));
      body.appendChild(out);
      act.appendChild(createBtn); body.appendChild(act);
      return { update: update, ta: ta };
    }

    /* ---- 1 Vocabulaire ---- */
    function wVocab(body) {
      var lang = h('select', { id: 'sj-lang', 'aria-label': 'Langue à prononcer' });
      [['en-GB', 'Anglais'], ['nl-BE', 'Néerlandais'], ['es-ES', 'Espagnol'], ['de-DE', 'Allemand'], ['it-IT', 'Italien'], ['fr-FR', 'Français']].forEach(function (o) { lang.appendChild(h('option', { value: o[0] }, o[1])); });
      var side = h('select', { id: 'sj-side', 'aria-label': 'Place du mot étranger' }, h('option', { value: 'a' }, 'À gauche (dog ; chien)'), h('option', { value: 'b' }, 'À droite (chien ; dog)'));
      textWizard(body, {
        intro: 'Écris un mot et sa traduction sur chaque ligne. Sépare avec « ; », une tabulation, « - » ou une virgule.',
        placeholder: 'dog ; chien\ncat ; chat\nhouse - maison', title: 'Mon vocabulaire', sampleKind: 'vocab',
        extras: function () { return h('div', { class: 'grid grid-2' }, field('Langue étrangère (pour la prononciation)', lang, 'sj-lang'), field('Où est le mot étranger ?', side, 'sj-side')); },
        onSampleLang: function (l, sm) { side.value = sm && sm.foreignRight ? 'b' : 'a'; var m = { en: 'en-GB', nl: 'nl-BE', es: 'es-ES', de: 'de-DE', it: 'it-IT', fr: 'fr-FR' }[String(l).slice(0, 2)]; if (m) lang.value = m; },
        parse: function (t) { var r = parsePairs(t); return r; },
        build: function (st, o) { return { cards: vocabCards(st.pairs, o), questions: vocabQuiz(st.pairs) }; },
        previewExtra: function (st) {
          if (!canSpeak() || !st.pairs.length) return null;
          return h('div', { class: 'row sj-actions' }, h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: function () { say(st.pairs[0][side.value], lang.value); } }, '🔊 Écouter « ' + st.pairs[0][side.value] + ' »'),
            h('span', { class: 'muted' }, 'Pour entendre un mot.'));
        }
      });
    }

    /* ---- 2 Dates ---- */
    function wDates(body) {
      textWizard(body, {
        intro: 'Écris une date et ce qui s’est passé. Exemple : « 1789 ; Prise de la Bastille ».',
        placeholder: '1789 ; Prise de la Bastille\n1914 ; Début de la Première Guerre mondiale', title: 'Mes dates d’histoire', sampleKind: 'dates',
        label: 'Tes dates (une par ligne)', bothLabel: 'Cartes date → événement et événement → date',
        parse: function (t) { var r = parseDates(t); r.pairs = r.events; return r; },
        build: function (st, o) { return { cards: dateCards(st.events, o), questions: dateQuiz(st.events) }; },
        previewExtra: function (st) {
          if (!st.events.length) return null;
          var w = h('div', { class: 'sj-timeline-wrap', tabindex: 0, role: 'group', 'aria-label': 'Frise chronologique' });
          w.innerHTML = timelineSvg(st.events);
          return h('div', null, h('h3', null, 'Ta frise du temps'), w);
        }
      });
    }

    /* ---- 4 Définitions ---- */
    function wDefs(body) {
      textWizard(body, {
        intro: 'Écris un mot, puis sa définition. Exemple : « Atome ; Plus petite particule d’un élément ».',
        placeholder: 'Atome ; Plus petite particule d’un élément\nDelta ; Embouchure d’un fleuve en forme de triangle', title: 'Mes définitions', sampleKind: 'definitions',
        label: 'Tes définitions (une par ligne)', bothLabel: 'Aussi : définition → mot',
        parse: function (t) { return parseDefinitions(t); },
        build: function (st, o) { return { cards: definitionCards(st.pairs, o), questions: definitionQuiz(st.pairs) }; }
      });
      var both = body.querySelector('#sj-both'); if (both) { both.checked = false; both.dispatchEvent(new Event('change')); }
    }

    /* ---- 7 Import ---- */
    function wImport(body) {
      var info = h('p', { class: 'muted', id: 'sj-file-info' }, 'Aucun fichier choisi.');
      var fileIn = h('input', { type: 'file', id: 'sj-file', accept: '.csv,.txt,.tsv,text/csv,text/plain' });
      var tw = textWizard(body, {
        intro: 'Importe un fichier .csv ou .txt : « recto ; verso » par ligne. Les exports Anki (tabulations) marchent aussi.',
        placeholder: 'Ou colle ton texte ici…', title: 'Import', label: 'Contenu du fichier',
        beforeText: function () { return h('div', { class: 'card stack' }, field('Choisir un fichier', fileIn, 'sj-file'), info); },
        parse: function (t) { return parseImport(t); },
        build: function (st, o) { return { cards: vocabCards(st.pairs, o), questions: [] }; },
        noQuiz: true, bothLabel: 'Aussi dans l’autre sens (verso → recto)'
      });
      var both = body.querySelector('#sj-both'); if (both) { both.checked = false; }
      fileIn.addEventListener('change', function () {
        var file = fileIn.files && fileIn.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { info.textContent = 'Ce fichier est trop gros (2 Mo maximum).'; return; }
        file.arrayBuffer().then(function (buf) {
          var txt = new TextDecoder('utf-8').decode(buf);
          if (txt.indexOf('�') >= 0) { try { txt = new TextDecoder('windows-1252').decode(buf); } catch (e) { /* garde utf-8 */ } }
          tw.ta.value = txt;
          var t = body.querySelector('#sj-title'); if (t) t.value = titleFromFilename(file.name);
          info.textContent = file.name + ' (' + Math.max(1, Math.round(file.size / 1024)) + ' Ko)';
          tw.update();
        }).catch(function () { info.textContent = 'Je n’arrive pas à lire ce fichier.'; });
      });
    }

    /* ---- 3 Maths ---- */
    function wMaths(body) {
      var tables = {}, tbox = h('div', { class: 'chip-list', role: 'group', 'aria-label': 'Tables à réviser' });
      [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].forEach(function (n) {
        var b = h('button', { class: 'chip sj-table', type: 'button', 'aria-pressed': 'false', 'data-n': n, onclick: function () {
          tables[n] = !tables[n]; b.setAttribute('aria-pressed', String(!!tables[n])); update();
        } }, 'Table de ' + n);
        tbox.appendChild(b);
      });
      var quick = h('div', { class: 'row sj-actions' },
        h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: function () { setT([2, 3, 4, 5]); } }, '2 à 5'),
        h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: function () { setT([6, 7, 8, 9]); } }, '6 à 9'),
        h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: function () { setT([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]); } }, 'Toutes'),
        h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: function () { setT([]); } }, 'Aucune'));
      function setT(a) { tables = {}; a.forEach(function (n) { tables[n] = true; }); [].forEach.call(tbox.children, function (b) { b.setAttribute('aria-pressed', String(!!tables[b.getAttribute('data-n')])); }); update(); }
      var div = checkbox('Ajouter les divisions (56 ÷ 7)', false, 'sj-div'), frac = checkbox('Fractions simples (10 cartes)', false, 'sj-frac'),
        unit = checkbox('Conversions d’unités (10 cartes)', false, 'sj-unit'), geo = checkbox('Aire et périmètre (formules + 10 calculs)', false, 'sj-geo');
      var titleIn = h('input', { type: 'text', id: 'sj-title', value: 'Maths' });
      var out = h('div'), createBtn = h('button', { class: 'btn btn-primary btn-lg', type: 'button', disabled: true, onclick: create }, 'Créer les cartes');
      var cards = [];
      function selected() { return Object.keys(tables).filter(function (n) { return tables[n]; }).map(Number); }
      function update() {
        cards = [];
        var ts = selected();
        if (ts.length) cards = cards.concat(tablesCards(ts, { max: 10, divisions: div.cb.checked, shuffle: true, seed: 4 }));
        if (frac.cb.checked) cards = cards.concat(fractionCards(10, 11));
        if (unit.cb.checked) cards = cards.concat(unitCards(10, 5));
        if (geo.cb.checked) cards = cards.concat(geometryCards(10, 9));
        clear(out); out.appendChild(previewBox(cards));
        createBtn.disabled = !cards.length;
      }
      [div, frac, unit, geo].forEach(function (c) { c.cb.addEventListener('change', update); });
      function create() {
        var res = createContent(titleIn.value.trim() || 'Maths', cards, []);
        if (!res) return;
        clear(body); body.appendChild(resultPanel(res)); toast(plural(res.count, 'carte créée', 'cartes créées') + ' !', 'success');
      }
      body.appendChild(h('p', { class: 'lead' }, 'Choisis ce que tu veux réviser. Les réponses sont calculées pour toi.'));
      body.appendChild(h('div', { class: 'card stack' }, h('h2', null, 'Tables de multiplication'), tbox, quick, div.node));
      body.appendChild(h('div', { class: 'card stack' }, h('h2', null, 'Autres'), frac.node, unit.node, geo.node, field('Nom du paquet', titleIn, 'sj-title')));
      body.appendChild(out); body.appendChild(h('div', { class: 'row sj-actions' }, createBtn));
      update();
    }

    /* ---- 5 Images ---- */
    function shrinkImage(file) {
      return new Promise(function (resolve, reject) {
        if (!file || !/^image\//.test(file.type || '')) return reject(new Error('Ce fichier n’est pas une image.'));
        var url = URL.createObjectURL(file), img = new Image();
        img.onload = function () {
          try {
            var limit = (S.blobs && S.blobs.MAX_IMAGE_BYTES) || 40 * 1024, best = null, sizes = [720, 600, 480, 380, 300, 220, 160], qs = [0.8, 0.65, 0.5, 0.4], i, j;
            for (i = 0; i < sizes.length; i++) {
              var d = fitSize(img.naturalWidth || img.width, img.naturalHeight || img.height, sizes[i]), cv = document.createElement('canvas');
              cv.width = d.w; cv.height = d.h;
              var g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, d.w, d.h); g.drawImage(img, 0, 0, d.w, d.h);
              for (j = 0; j < qs.length; j++) {
                best = cv.toDataURL('image/jpeg', qs[j]);
                if (dataUrlBytes(best) <= limit) { URL.revokeObjectURL(url); return resolve(best); }
              }
            }
            URL.revokeObjectURL(url); resolve(best);
          } catch (e) { reject(e); }
        };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Je n’arrive pas à ouvrir cette image.')); };
        img.src = url;
      });
    }
    function wImages(body) {
      var decks = S.store.list('decks'), sel = h('select', { id: 'sj-deck', 'aria-label': 'Paquet' }, h('option', { value: '' }, '➕ Nouveau paquet « Cartes avec images »'));
      decks.forEach(function (d) { sel.appendChild(h('option', { value: d.id }, d.title)); });
      var front = h('input', { type: 'text', id: 'sj-front', placeholder: 'Ex. : Comment s’appelle cet os ?' }), back = h('input', { type: 'text', id: 'sj-back', placeholder: 'Ex. : Le fémur' });
      var imgs = { front: null, back: null }, added = 0, lastDeck = null;
      var msg = h('p', { class: 'muted', id: 'sj-img-msg', role: 'status' });
      function picker(side, label) {
        var prev = h('div', { class: 'sj-img-prev' }), inp = h('input', { type: 'file', accept: 'image/*', id: 'sj-img-' + side, 'aria-label': label });
        var rm = h('button', { class: 'btn btn-sm btn-ghost', type: 'button', style: 'display:none', onclick: function () { imgs[side] = null; inp.value = ''; clear(prev); rm.style.display = 'none'; } }, 'Retirer l’image');
        inp.addEventListener('change', function () {
          var f = inp.files && inp.files[0]; if (!f) return;
          prev.textContent = 'Je réduis l’image…';
          shrinkImage(f).then(function (u) {
            imgs[side] = u; clear(prev);
            prev.appendChild(h('img', { src: u, alt: 'Aperçu de l’image du ' + (side === 'front' ? 'recto' : 'verso') }));
            prev.appendChild(h('span', { class: 'badge badge-mint' }, Math.max(1, Math.round(dataUrlBytes(u) / 1024)) + ' Ko'));
            rm.style.display = '';
          }).catch(function (e) { imgs[side] = null; prev.textContent = e.message; });
        });
        return h('div', { class: 'field' }, h('label', { for: 'sj-img-' + side }, label), inp, prev, rm);
      }
      var add = h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: function () {
        var fv = front.value.trim(), bv = back.value.trim();
        if (!fv && !imgs.front) return toast('Écris un texte ou ajoute une image au recto.', 'error');
        if (!bv && !imgs.back) return toast('Écris un texte ou ajoute une image au verso.', 'error');
        var spec = { front: fv || '(image)', back: bv || '(image)', imgFront: imgs.front, imgBack: imgs.back };
        var deck = sel.value ? S.store.byId('decks', sel.value) : null;
        if (deck) { var nc = newCard(spec); deck.cards.push(nc); if (!S.store.update('decks', deck.id, { cards: deck.cards })) { deck.cards.pop(); return toast('Plus de place : supprime un vieux cours ou exporte tes données.', 'error'); } S.bus.emit('decks:changed'); emit('import', 1); }
        else { var r = createContent('Cartes avec images', [spec], null); if (!r) return; deck = r.deck; var o = h('option', { value: deck.id }, deck.title); sel.appendChild(o); sel.value = deck.id; }
        lastDeck = deck; added++;
        msg.textContent = '✅ ' + plural(added, 'carte ajoutée', 'cartes ajoutées') + ' dans « ' + deck.title + ' ».';
        front.value = ''; back.value = ''; imgs = { front: null, back: null };
        [].forEach.call(body.querySelectorAll('.sj-img-prev'), clear); [].forEach.call(body.querySelectorAll('input[type=file]'), function (i) { i.value = ''; });
        [].forEach.call(body.querySelectorAll('.sj-img-prev + button'), function (b) { b.style.display = 'none'; });
        reviewBtn.style.display = '';
      } }, 'Ajouter la carte');
      var reviewBtn = h('button', { class: 'btn btn-ghost btn-lg', type: 'button', style: 'display:none', onclick: function () { if (lastDeck) S.go('flashcards', { deckId: lastDeck.id, review: 1 }); } }, 'Réviser maintenant');
      body.appendChild(h('p', { class: 'lead' }, 'Ajoute une photo au recto ou au verso. L’image est réduite pour rester légère.'));
      body.appendChild(h('div', { class: 'card stack' }, field('Dans quel paquet ?', sel, 'sj-deck'),
        h('div', { class: 'grid grid-2' },
          h('div', { class: 'stack-sm' }, h('h2', null, 'Recto'), field('Texte du recto', front, 'sj-front'), picker('front', 'Image du recto (facultatif)')),
          h('div', { class: 'stack-sm' }, h('h2', null, 'Verso'), field('Texte du verso', back, 'sj-back'), picker('back', 'Image du verso (facultatif)'))),
        msg));
      body.appendChild(h('div', { class: 'row sj-actions' }, add, reviewBtn));
    }

    /* ---- 6 Contrôle demain ---- */
    function wPlan(body) {
      function draw() {
        clear(body);
        var plan = S.store.get('plan2', null);
        if (plan && plan.days) planView(plan); else planForm();
      }
      function planForm() {
        var docs = S.store.list('docs'), docSel = h('select', { id: 'sj-pdoc' }, h('option', { value: '' }, 'Une autre matière (sans document)'));
        docs.forEach(function (d) { docSel.appendChild(h('option', { value: d.id }, d.name)); });
        var act = S.activeDocId && S.activeDocId(); if (act) docSel.value = act;
        var subj = h('input', { type: 'text', id: 'sj-psubj', placeholder: 'Ex. : Histoire' });
        function syncName() { var d = docSel.value && S.store.byId('docs', docSel.value); if (d) subj.value = clean(d.subject || String(d.name).split(' — ')[0].replace(/\.[a-z0-9]{1,4}$/i, '')).slice(0, 40); }
        docSel.addEventListener('change', syncName); syncName();
        var today = new Date(), chosen = 1, chips = h('div', { class: 'chip-list', role: 'group', 'aria-label': 'Date du contrôle' });
        var NAMES = ['Aujourd’hui', 'Demain', 'Dans 2 jours', 'Dans 3 jours', 'Dans 4 jours', 'Dans 5 jours', 'Dans 6 jours', 'Dans 7 jours'];
        function setChosen(n) { chosen = n; [].forEach.call(chips.children, function (c, i) { c.setAttribute('aria-pressed', String(i === n)); }); }
        NAMES.forEach(function (nm, i) {
          chips.appendChild(h('button', { class: 'chip sj-day', type: 'button', 'data-n': i, 'aria-pressed': String(i === 1), onclick: function () { setChosen(i); } },
            nm + ' (' + dayKey(addDays(today, i)).slice(8) + '/' + dayKey(addDays(today, i)).slice(5, 7) + ')'));
        });
        body.appendChild(h('p', { class: 'lead' }, 'Dis-moi la matière et le jour du contrôle. Je te fais un plan tout simple.'));
        body.appendChild(h('div', { class: 'card stack' }, field('Ton cours', docSel, 'sj-pdoc'), field('Matière', subj, 'sj-psubj'), h('div', { class: 'field' }, h('span', { class: 'label' }, 'Quand est le contrôle ?'), chips)));
        body.appendChild(h('div', { class: 'row sj-actions' }, h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: function () {
          var did = docSel.value || null, deck = null;
          if (did) deck = S.store.list('decks').filter(function (d) { return d.docId === did; })[0] || null;
          var has = {};
          var p = buildPlan({ exam: dayKey(addDays(today, chosen)), today: today, subject: subj.value, docId: did, deckId: deck && deck.id, has: has });
          if (p.error) return toast(p.error, 'error');
          S.store.set('plan2', p); toast('Ton plan est prêt !', 'success'); draw();
        } }, 'Créer mon plan')));
      }
      function dayHint(n) { var c = S.content && S.content.subjects && S.content.subjects.controleDemain; return c && (c[n === 0 ? 'J0' : 'J-' + n] || null); }
      function planView(plan) {
        var today = new Date(), pr = planProgress(plan), tk = dayKey(today);
        var coachName = '', msg = coachMessage(plan, today);
        try { if (S.game && S.game.coach) { var c = S.game.coach(); if (c) coachName = (c.emoji ? c.emoji + ' ' : '') + (c.name || ''); } } catch (e) { /* ignore */ }
        var bar = h('div', { class: 'progress progress-mint', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pr.pct, 'aria-label': 'Avancement du plan' }, h('div', { class: 'progress-bar', style: 'width:' + pr.pct + '%' }));
        var coachBox = h('div', { class: 'card sj-coach', role: 'status' }, h('strong', null, (coachName || '🤖 Ton coach') + ' : '), msg);
        body.appendChild(coachBox);
        body.appendChild(h('div', { class: 'card stack' }, h('h2', null, plan.subject + ' · contrôle le ' + plan.exam.slice(8) + '/' + plan.exam.slice(5, 7)), bar,
          h('p', { class: 'muted', id: 'sj-prog' }, pr.done + ' étape' + (pr.done > 1 ? 's' : '') + ' sur ' + pr.total + ' (' + pr.pct + ' %)')));
        plan.days.forEach(function (d) {
          var isToday = d.day === tk, past = d.day < tk;
          var card = h('section', { class: 'card sj-day-card' + (isToday ? ' is-today' : '') + (past ? ' is-past' : ''), 'aria-label': d.label },
            h('h3', null, d.label + ' ', h('span', { class: 'muted' }, '(' + d.day.slice(8) + '/' + d.day.slice(5, 7) + ')'), isToday ? h('span', { class: 'badge badge-primary', style: 'margin-left:8px' }, 'Aujourd’hui') : null));
          var hint = dayHint(d.offset); if (hint) card.appendChild(h('p', { class: 'muted sj-hint' }, hint));
          d.tasks.forEach(function (t) {
            var cb = h('input', { type: 'checkbox', id: 'sj-t-' + t.id, class: 'sj-cb' }); cb.checked = !!t.done;
            cb.addEventListener('change', function () {
              t.done = cb.checked; S.store.set('plan2', plan);
              var p2 = planProgress(plan); bar.firstChild.style.width = p2.pct + '%'; bar.setAttribute('aria-valuenow', p2.pct);
              body.querySelector('#sj-prog').textContent = p2.done + ' étape' + (p2.done > 1 ? 's' : '') + ' sur ' + p2.total + ' (' + p2.pct + ' %)';
              coachBox.lastChild.textContent = coachMessage(plan, new Date());
              if (cb.checked && S.game && S.game.award) { try { S.game.award('plan', 1); } catch (e) { /* ignore */ } }
            });
            var go = t.go ? h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: function () {
              if (t.go === 'flashcards' && plan.deckId && S.store.byId('decks', plan.deckId)) S.go('flashcards', { deckId: plan.deckId, review: 1 }); else S.go(t.go);
            } }, 'Ouvrir') : null;
            card.appendChild(h('div', { class: 'sj-task' }, h('label', { class: 'sj-task-label', for: 'sj-t-' + t.id }, cb, h('span', null, t.text)), go));
          });
          body.appendChild(card);
        });
        body.appendChild(h('div', { class: 'row sj-actions' }, h('button', { class: 'btn btn-ghost', type: 'button', onclick: function () {
          Promise.resolve(S.ui.confirm('Supprimer ce plan et en faire un nouveau ?')).then(function (ok) { if (ok) { S.store.set('plan2', null); draw(); } });
        } }, 'Faire un nouveau plan')));
      }
      draw();
    }

    home();
    if (openId && KINDS.some(function (k) { return k.id === openId; })) wizard(openId);
  }

  S.register({ id: 'subjects', title: 'Mes matières', icon: '🎒', order: 4, needsDoc: false, render: render });
})();
