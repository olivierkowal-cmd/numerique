/* Studio — Photographier mon cahier (dev-ocr). IIFE, pas de module ES.
   Photos -> prétraitement canvas -> Tesseract.js (CDN, à la demande) -> relecture -> document « paste ».
   Hôtes réseau contactés par Tesseract.js 5.1.1 (vérifié dans son code source) : cdnjs.cloudflare.com (tesseract.min.js, voir TESS_URL) et
   cdn.jsdelivr.net (worker.min.js, tesseract.js-core pour le wasm, @tesseract.js-data/fra et /eng pour les langues). Aucun autre hôte.
   Aucune image n'est envoyée nulle part : tout reste dans le navigateur (seul le lecteur Tesseract est téléchargé). */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var Studio = root.Studio = root.Studio || {};

  var MAX_SIDE = 1600, MAX_PAGES = 20, MAX_BYTES = 25 * 1024 * 1024;
  var TESS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js';
  var INIT_TIMEOUT = 120000;

  /* ====================== logique pure (testée avec node) ====================== */

  /* Taille réduite pour que le plus grand côté fasse au plus `max` px (jamais d'agrandissement). */
  function fitSize(w, h, max) {
    max = max || MAX_SIDE; w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    var m = Math.max(w, h);
    if (m <= max) return { w: w, h: h };
    var k = max / m;
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
  }

  /* RGBA (Uint8ClampedArray / tableau) -> niveaux de gris Uint8Array (luminance Rec. 601). */
  function toGray(rgba, w, h) {
    var n = w * h, g = new Uint8Array(n);
    for (var i = 0, j = 0; i < n; i++, j += 4) {
      var a = rgba[j + 3] === undefined ? 255 : rgba[j + 3] / 255;
      // transparent -> blanc
      var r = rgba[j] * a + 255 * (1 - a), gg = rgba[j + 1] * a + 255 * (1 - a), b = rgba[j + 2] * a + 255 * (1 - a);
      g[i] = Math.round(0.299 * r + 0.587 * gg + 0.114 * b);
    }
    return g;
  }

  /* Étire le contraste entre les percentiles lowP et highP (en %). Modifie et renvoie `gray`. */
  function stretchContrast(gray, lowP, highP) {
    lowP = lowP == null ? 1 : lowP; highP = highP == null ? 99 : highP;
    var n = gray.length; if (!n) return gray;
    var hist = new Array(256), i; for (i = 0; i < 256; i++) hist[i] = 0;
    for (i = 0; i < n; i++) hist[gray[i]]++;
    var lo = 0, hi = 255, acc = 0;
    for (i = 0; i < 256; i++) { acc += hist[i]; if (acc > n * lowP / 100) { lo = i; break; } }
    acc = 0;
    for (i = 255; i >= 0; i--) { acc += hist[i]; if (acc > n * (100 - highP) / 100) { hi = i; break; } }
    if (hi - lo < 8) return gray;                       // image presque unie : rien à étirer
    var scale = 255 / (hi - lo);
    for (i = 0; i < n; i++) { var v = (gray[i] - lo) * scale; gray[i] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }
    return gray;
  }

  /* Binarisation adaptative (seuil local = moyenne du voisinage, image intégrale).
     Pixel noir (0) s'il est plus sombre que moyenne*(1-t) ; sinon blanc (255). Tolère les ombres. */
  function adaptiveThreshold(gray, w, h, opts) {
    opts = opts || {};
    var t = opts.t == null ? 0.12 : opts.t;
    var s = opts.window || Math.max(15, Math.round(Math.min(w, h) / 12));
    var half = s >> 1, out = new Uint8Array(w * h), W = w + 1;
    var integ = new Float64Array(W * (h + 1)), x, y;
    for (y = 0; y < h; y++) {
      var row = 0;
      for (x = 0; x < w; x++) { row += gray[y * w + x]; integ[(y + 1) * W + x + 1] = integ[y * W + x + 1] + row; }
    }
    for (y = 0; y < h; y++) {
      var y0 = Math.max(0, y - half), y1 = Math.min(h - 1, y + half);
      for (x = 0; x < w; x++) {
        var x0 = Math.max(0, x - half), x1 = Math.min(w - 1, x + half);
        var cnt = (x1 - x0 + 1) * (y1 - y0 + 1);
        var sum = integ[(y1 + 1) * W + x1 + 1] - integ[y0 * W + x1 + 1] - integ[(y1 + 1) * W + x0] + integ[y0 * W + x0];
        out[y * w + x] = gray[y * w + x] < (sum / cnt) * (1 - t) ? 0 : 255;
      }
    }
    return out;
  }

  /* Chaîne complète sur des pixels RGBA : { gray, bin, w, h }. */
  function preprocess(rgba, w, h, opts) {
    opts = opts || {};
    var gray = stretchContrast(toGray(rgba, w, h), 1, 99);
    var bin = opts.binarize === false ? null : adaptiveThreshold(gray, w, h, opts);
    return { gray: gray, bin: bin, w: w, h: h };
  }

  /* Niveaux de gris / binaire -> RGBA (pour remettre dans un canvas). */
  function grayToRgba(g, out) {
    var n = g.length; out = out || new Uint8ClampedArray(n * 4);
    for (var i = 0, j = 0; i < n; i++, j += 4) { out[j] = out[j + 1] = out[j + 2] = g[i]; out[j + 3] = 255; }
    return out;
  }

  var BULLET = /^([-•*·–—▪●○◦]|\d{1,2}[.)]|[a-z][.)])\s/i;
  var END_PUNCT = /[.!?…:;)»"”]\s*$/;

  /* Nettoyage du texte reconnu : césures, lignes cassées, bruit, espaces. */
  function cleanText(text) {
    var t = String(text == null ? '' : text)
      .replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/­/g, '').replace(/[\t\f\v]+/g, ' ')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    var lines = t.split('\n').map(function (l) { return l.replace(/ {2,}/g, ' ').trim(); });
    // bruit : lignes sans lettre ni chiffre, ou d'un seul caractère parasite
    lines = lines.filter(function (l) {
      if (l === '') return true;
      var alnum = (l.match(/[\p{L}\p{N}]/gu) || []).length;
      if (alnum === 0) return false;
      if (l.length <= 2 && !/\d/.test(l)) return false;
      return true;
    });
    t = lines.join('\n').replace(/\n{3,}/g, '\n\n');
    // césures : « ensei-\ngnement » -> « enseignement »
    t = t.replace(/(\p{L})[-‐‑]\n(\p{Ll})/gu, '$1$2');
    // lignes cassées au sein d'un paragraphe
    var paras = t.split(/\n{2,}/).map(function (p) {
      var ls = p.split('\n'), out = [];
      for (var i = 0; i < ls.length; i++) {
        var cur = ls[i];
        if (out.length) {
          var prev = out[out.length - 1];
          var lowerStart = /^\p{Ll}/u.test(cur);
          var longPrev = prev.length >= 60 && !END_PUNCT.test(prev) && !BULLET.test(cur) && !/^\p{Lu}[\p{Lu}\s\d]+$/u.test(cur);
          if (!END_PUNCT.test(prev) && !BULLET.test(cur) && lowerStart || longPrev) { out[out.length - 1] = prev + ' ' + cur; continue; }
        }
        out.push(cur);
      }
      return out.join('\n');
    });
    return paras.join('\n\n').replace(/ {2,}/g, ' ').trim();
  }

  function moveItem(arr, from, to) {
    var a = arr.slice();
    if (from < 0 || from >= a.length || to < 0 || to >= a.length || from === to) return a;
    var it = a.splice(from, 1)[0]; a.splice(to, 0, it); return a;
  }
  function removeAt(arr, i) { var a = arr.slice(); if (i >= 0 && i < a.length) a.splice(i, 1); return a; }

  var MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  function docName(date) {
    var d = date instanceof Date ? date : new Date(date == null ? Date.now() : date);
    return 'Cahier — ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  /* Assemble les pages (ignore les vides). */
  function joinPages(texts) {
    return (texts || []).map(function (t) { return String(t || '').trim(); }).filter(Boolean).join('\n\n');
  }

  /* Confiance Tesseract (0-100) -> étiquette simple. */
  function quality(conf) {
    if (conf == null || isNaN(conf)) return { id: 'unknown', label: 'À relire' };
    if (conf >= 80) return { id: 'good', label: 'Plutôt bien lu' };
    if (conf >= 60) return { id: 'mid', label: 'À relire de près' };
    return { id: 'low', label: 'Mal lu : relis bien' };
  }

  function isImageFile(f) {
    if (!f) return false;
    return /^image\//.test(f.type || '') || /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(f.name || '');
  }

  var logic = {
    fitSize: fitSize, toGray: toGray, stretchContrast: stretchContrast, adaptiveThreshold: adaptiveThreshold,
    preprocess: preprocess, grayToRgba: grayToRgba, cleanText: cleanText, moveItem: moveItem, removeAt: removeAt,
    docName: docName, joinPages: joinPages, quality: quality, isImageFile: isImageFile, MAX_SIDE: MAX_SIDE
  };
  Studio.ocrLogic = logic;
  if (typeof module !== 'undefined' && module.exports) module.exports = logic;
  if (typeof document === 'undefined' || !document.createElement || !Studio.ui || !Studio.bus) return;   // contexte sans interface (node)

  /* ====================== chargement de Tesseract (à la demande) ====================== */
  var tessLoad = null;
  function loadTesseract() {
    if (root.Tesseract) return Promise.resolve(root.Tesseract);
    if (tessLoad) return tessLoad;
    tessLoad = new Promise(function (resolve, reject) {
      if (root.navigator && root.navigator.onLine === false) { tessLoad = null; return reject(cdnError()); }
      var s = document.createElement('script');
      s.src = TESS_URL; s.async = true;
      s.onload = function () { root.Tesseract ? resolve(root.Tesseract) : (tessLoad = null, reject(cdnError())); };
      s.onerror = function () { tessLoad = null; s.remove(); reject(cdnError()); };
      document.head.appendChild(s);
    });
    return tessLoad;
  }
  function cdnError() {
    var e = new Error('cdn');
    e.userMessage = 'Je n’arrive pas à charger le lecteur de texte. Il faut internet la première fois, ou il est bloqué sur ce réseau.';
    return e;
  }

  /* ====================== prétraitement canvas (navigateur) ====================== */
  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); var e = new Error('img'); e.userMessage = 'Je n’arrive pas à ouvrir cette photo (« ' + (file.name || 'image') + ' »).'; reject(e); };
      img.src = url;
    });
  }
  /* Renvoie un canvas prêt à lire (réduit, gris, contraste, binarisé si demandé). */
  function prepareCanvas(source, opts) {
    opts = opts || {};
    var w0 = source.naturalWidth || source.width, h0 = source.naturalHeight || source.height;
    var sz = fitSize(w0, h0, opts.max || MAX_SIDE);
    var c = document.createElement('canvas'); c.width = sz.w; c.height = sz.h;
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, sz.w, sz.h);
    ctx.drawImage(source, 0, 0, sz.w, sz.h);
    var id = ctx.getImageData(0, 0, sz.w, sz.h);
    var r = preprocess(id.data, sz.w, sz.h, { binarize: opts.binarize !== false });
    grayToRgba(r.bin || r.gray, id.data);
    ctx.putImageData(id, 0, 0);
    return c;
  }

  /* ====================== reconnaissance ====================== */
  function withTimeout(p, ms, msg) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { var e = new Error('timeout'); e.userMessage = msg; reject(e); }, ms);
      p.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }
  function createWorker(T, onLog) {
    var p;
    try {
      p = T.createWorker(['fra', 'eng'], 1, { logger: onLog });
    } catch (e) { return Promise.reject(e); }
    return withTimeout(Promise.resolve(p), INIT_TIMEOUT,
      'Le chargement du lecteur est trop long. Vérifie ta connexion, ou tape le texte à la main.').catch(function (e) {
      if (e && e.userMessage) throw e;
      var er = new Error('worker'); er.userMessage = 'Le lecteur de texte n’a pas pu démarrer (internet nécessaire la première fois pour les langues français et anglais).'; throw er;
    });
  }

  /* ====================== interface ====================== */
  var el = Studio.ui.el;
  var ui = null;   // dialogue ouvert (un seul à la fois)

  function counter() { return 'p' + Math.random().toString(36).slice(2, 9); }

  function open(files) {
    if (ui) { if (files && files.length) ui.addFiles(files); ui.focus(); return ui; }
    var S = { step: 'pick', pages: [], cur: 0, binarize: true, cancelled: false, worker: null, crew: null, errorMsg: '', name: docName(new Date()), prevFocus: document.activeElement, phase: '', progress: 0 };
    var dlg, body, foot, title, back, liveEl;

    function revoke(p) { if (p && p.url) { try { URL.revokeObjectURL(p.url); } catch (e) { /* ignore */ } p.url = null; } }

    function addFiles(list) {
      var arr = Array.prototype.slice.call(list || []), skipped = 0, big = 0;
      arr.forEach(function (f) {
        if (!isImageFile(f)) { skipped++; return; }
        if (f.size > MAX_BYTES) { big++; return; }
        if (S.pages.length >= MAX_PAGES) { skipped++; return; }
        S.pages.push({ id: counter(), file: f, url: URL.createObjectURL(f), text: '', raw: '', conf: null, error: '' });
      });
      if (skipped) Studio.ui.toast(skipped === 1 ? 'Un fichier a été ignoré (ce n’est pas une photo, ou 20 pages maximum).' : skipped + ' fichiers ignorés (pas des photos, ou 20 pages maximum).', 'error');
      if (big) Studio.ui.toast('Une photo est trop lourde (25 Mo maximum).', 'error');
      if (S.step === 'pick') render();
    }

    function say(t) { if (liveEl) liveEl.textContent = t; }

    function closeAll(force) {
      if (S.step === 'run') cancelRun();
      S.pages.forEach(revoke);
      document.removeEventListener('keydown', onKey, true);
      if (back.parentNode) back.parentNode.removeChild(back);
      if (!document.querySelector('.modal-backdrop, .crew-backdrop')) document.body.classList.remove('modal-open');
      ui = null;
      if (S.prevFocus && S.prevFocus.focus && document.body.contains(S.prevFocus)) { try { S.prevFocus.focus(); } catch (e) { /* ignore */ } }
    }
    function requestClose() {
      var work = S.step === 'review' || (S.step === 'pick' && S.pages.length);
      if (!work) return closeAll();
      Studio.ui.confirm(S.step === 'review' ? 'Fermer sans ajouter ? Ton texte relu sera perdu.' : 'Fermer ? Tes photos ne seront pas gardées.',
        { title: 'Fermer', ok: 'Fermer', cancel: 'Continuer' }).then(function (ok) { if (ok) closeAll(); });
    }

    function onKey(e) {
      if (document.querySelector('.modal-backdrop') || document.querySelector('.crew-backdrop')) return;   // une autre fenêtre est au-dessus
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); requestClose(); return; }
      if (e.key !== 'Tab') return;
      var f = Array.prototype.filter.call(dlg.querySelectorAll('button, input, textarea, select, a[href], [tabindex="0"]'), function (n) { return !n.disabled && !n.hidden && n.offsetParent !== null && n.type !== 'file'; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dlg || document.activeElement === title)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    /* ---------- étape 1 : choisir les photos ---------- */
    function inputs() {
      var cam = el('input', { type: 'file', accept: 'image/*', capture: 'environment', multiple: true, class: 'ocr-file', 'aria-label': 'Prendre des photos', tabindex: '-1',
        onchange: function () { addFiles(cam.files); cam.value = ''; } });
      var gal = el('input', { type: 'file', accept: 'image/*', multiple: true, class: 'ocr-file', 'aria-label': 'Choisir des photos dans la galerie', tabindex: '-1',
        onchange: function () { addFiles(gal.files); gal.value = ''; } });
      return { cam: cam, gal: gal };
    }

    function thumbs() {
      var list = el('ol', { class: 'ocr-thumbs', 'aria-label': 'Pages de ton cahier' });
      S.pages.forEach(function (p, i) {
        var up = el('button', { type: 'button', class: 'btn btn-sm btn-ghost', 'aria-label': 'Monter la page ' + (i + 1), disabled: i === 0, onclick: function () { S.pages = moveItem(S.pages, i, i - 1); render(i - 1, 'up'); } }, '←');
        var dn = el('button', { type: 'button', class: 'btn btn-sm btn-ghost', 'aria-label': 'Descendre la page ' + (i + 1), disabled: i === S.pages.length - 1, onclick: function () { S.pages = moveItem(S.pages, i, i + 1); render(i + 1, 'dn'); } }, '→');
        var rm = el('button', { type: 'button', class: 'btn btn-sm btn-ghost ocr-del', 'aria-label': 'Retirer la page ' + (i + 1), onclick: function () { revoke(p); S.pages = removeAt(S.pages, i); render(Math.min(i, S.pages.length - 1), 'rm'); } }, '🗑');
        list.appendChild(el('li', { class: 'ocr-thumb' },
          el('img', { src: p.url, alt: 'Photo de la page ' + (i + 1) }),
          el('span', { class: 'ocr-thumb-n' }, 'Page ' + (i + 1)),
          el('div', { class: 'ocr-thumb-actions' }, up, dn, rm)));
      });
      return list;
    }

    function renderPick() {
      var inp = inputs();
      var pick = el('div', { class: 'ocr-pick' },
        el('p', { class: 'ocr-privacy' }, '🔒 Tes photos restent dans ton navigateur. Elles ne sont envoyées nulle part.'),
        el('div', { class: 'ocr-warn', role: 'note' },
          el('strong', null, '⚠️ Écriture à la main : '), 'elle est moins bien reconnue que le texte imprimé. Relis toujours avant de continuer.'),
        el('div', { class: 'ocr-tips' },
          el('h3', null, 'Pour une bonne photo'),
          el('ul', null,
            el('li', null, '💡 Bonne lumière, sans ombre sur la page.'),
            el('li', null, '📄 Cahier bien à plat, photo bien droite.'),
            el('li', null, '1️⃣ Une page par photo, texte bien net.'))),
        el('div', { class: 'ocr-add' },
          el('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: function () { inp.cam.click(); } }, '📷 ' + (S.pages.length ? 'Ajouter une page' : 'Prendre une photo')),
          el('button', { type: 'button', class: 'btn btn-lg', onclick: function () { inp.gal.click(); } }, '🖼️ Choisir des photos'),
          inp.cam, inp.gal));
      body.appendChild(pick);
      if (S.pages.length) {
        body.appendChild(thumbs());
        body.appendChild(el('label', { class: 'ocr-opt' },
          el('input', { type: 'checkbox', checked: S.binarize, onchange: function (e) { S.binarize = e.target.checked; } }),
          ' Noir et blanc renforcé ', el('span', { class: 'ocr-opt-hint' }, '(aide quand la page est dans l’ombre)')));
      } else {
        body.appendChild(el('p', { class: 'ocr-empty' }, 'Aucune photo pour l’instant. Tu peux aussi glisser des images dans la bibliothèque.'));
      }
      foot.appendChild(el('button', { type: 'button', class: 'btn btn-ghost', onclick: requestClose }, 'Annuler'));
      foot.appendChild(el('button', { type: 'button', class: 'btn btn-primary btn-lg', disabled: !S.pages.length, onclick: startRun }, 'Lire ' + (S.pages.length > 1 ? 'mes ' + S.pages.length + ' pages' : 'ma page') + ' →'));
    }

    /* ---------- étape 2 : lecture ---------- */
    var barEl, pctEl, phaseEl;
    function setProgress(p, phase) {
      S.progress = Math.max(0, Math.min(1, p)); if (phase) S.phase = phase;
      if (barEl) { var v = Math.round(S.progress * 100); barEl.style.width = v + '%'; pctEl.textContent = v + ' %'; barEl.parentNode.parentNode.setAttribute('aria-valuenow', String(v)); }
      if (phaseEl) phaseEl.textContent = S.phase;
      if (S.crew && S.crew.progress) S.crew.progress({ done: Math.round(S.progress * 1000), total: 1000 });
    }
    function renderRun() {
      barEl = el('div', { class: 'progress-bar' });
      pctEl = el('span', { class: 'ocr-pct' }, '0 %');
      phaseEl = el('p', { class: 'ocr-phase' }, S.phase);
      body.appendChild(el('div', { class: 'ocr-run' },
        el('div', { class: 'ocr-run-icon', 'aria-hidden': 'true' }, '📖'),
        el('p', null, 'Je lis ' + (S.pages.length > 1 ? 'tes ' + S.pages.length + ' pages' : 'ta page') + '… Ça peut prendre une minute.'),
        el('div', { class: 'ocr-progress', role: 'progressbar', 'aria-label': 'Progression de la lecture', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' },
          el('div', { class: 'progress progress-lg' }, barEl), pctEl),
        phaseEl,
        el('p', { class: 'ocr-privacy' }, '🔒 Tout se passe dans ton navigateur.')));
      foot.appendChild(el('button', { type: 'button', class: 'btn btn-ghost', onclick: function () { cancelRun(); S.step = 'pick'; render(); } }, 'Arrêter'));
    }

    function cancelRun() {
      S.cancelled = true;
      if (S.worker) { try { S.worker.terminate(); } catch (e) { /* ignore */ } S.worker = null; }
      endCrew(false);
    }
    function startCrew() {
      try {
        if (Studio.crew && Studio.crew.open && Studio.crew.enabled && Studio.crew.enabled() && !(Studio.crew.current && Studio.crew.current()) && Studio.office && Studio.office.sim) {
          Studio.office.sim.startJob('reading'); Studio.office.ensureLoop();
          S.crew = Studio.crew.open('reading', { minMs: 1500, subtitle: 'Lecture de ton cahier' });
        }
      } catch (e) { S.crew = null; }
    }
    function endCrew(ok) {
      var c = S.crew; S.crew = null;
      if (!c) return;
      try { if (ok) c.end({ ok: true }); else c.close(); } catch (e) { /* ignore */ }
    }

    function startRun() {
      if (!S.pages.length) return;
      S.step = 'run'; S.cancelled = false; S.phase = 'Chargement du lecteur de texte…'; S.progress = 0;
      S.pages.forEach(function (p) { p.text = ''; p.raw = ''; p.conf = null; p.error = ''; });
      startCrew();
      render();
      var n = S.pages.length, T, runId = {};
      S.runId = runId;
      loadTesseract().then(function (t) {
        T = t; if (S.cancelled) throw 'cancel';
        setProgress(0.02, 'Chargement du lecteur (la première fois, ça prend un peu de temps)…');
        var cur = 0;
        return createWorker(T, function (m) {
          if (S.cancelled || !m) return;
          if (/loading|initializ/.test(m.status || '')) setProgress(Math.min(0.1, 0.02 + (m.progress || 0) * 0.08), 'Chargement du lecteur et des langues (français, anglais)…');
          else if (m.status === 'recognizing text') setProgress(0.1 + 0.9 * ((cur + (m.progress || 0)) / n), 'Lecture de la page ' + (cur + 1) + ' sur ' + n + '…');
        }).then(function (worker) {
          S.worker = worker;
          var chain = Promise.resolve();
          S.pages.forEach(function (p, i) {
            chain = chain.then(function () {
              if (S.cancelled) throw 'cancel';
              cur = i; setProgress(0.1 + 0.9 * (i / n), 'Préparation de la page ' + (i + 1) + ' sur ' + n + '…');
              return loadImage(p.file).then(function (li) {
                var c; try { c = prepareCanvas(li.img, { binarize: S.binarize }); } finally { URL.revokeObjectURL(li.url); }
                return worker.recognize(c);
              }).then(function (res) {
                var d = (res && res.data) || {};
                p.raw = String(d.text || ''); p.text = cleanText(p.raw); p.conf = typeof d.confidence === 'number' ? d.confidence : null;
              }, function (e) {
                if (S.cancelled) throw 'cancel';
                p.error = (e && e.userMessage) || 'Cette page n’a pas pu être lue.';
              });
            });
          });
          return chain;
        });
      }).then(function () {
        if (S.worker) { try { S.worker.terminate(); } catch (e) { /* ignore */ } S.worker = null; }
        if (S.cancelled || S.runId !== runId) return;
        if (S.pages.every(function (p) { return p.error; })) { var e = new Error('all'); e.userMessage = S.pages[0].error; throw e; }
        setProgress(1, 'Terminé !');
        endCrew(true);
        S.step = 'review'; S.cur = 0; render();
        say('Lecture terminée. Relis le texte avant de l’ajouter.');
      }).catch(function (e) {
        if (S.worker) { try { S.worker.terminate(); } catch (x) { /* ignore */ } S.worker = null; }
        if (e === 'cancel' || S.cancelled || S.runId !== runId) return;
        endCrew(false);
        S.errorMsg = (e && e.userMessage) || 'La lecture a échoué.';
        S.step = 'error'; render();
      });
    }

    /* ---------- erreur : repli ---------- */
    function renderError() {
      body.appendChild(el('div', { class: 'ocr-error', role: 'alert' },
        el('div', { class: 'ocr-error-icon', 'aria-hidden': 'true' }, '😕'),
        el('p', { class: 'ocr-error-msg' }, S.errorMsg),
        el('p', null, 'Tu peux taper le texte à la main : tes photos restent affichées à côté pour t’aider.'),
        el('p', { class: 'ocr-privacy' }, '🔒 Tes photos n’ont pas quitté ton navigateur.')));
      foot.appendChild(el('button', { type: 'button', class: 'btn btn-ghost', onclick: function () { S.step = 'pick'; render(); } }, '← Mes photos'));
      foot.appendChild(el('button', { type: 'button', class: 'btn', onclick: startRun }, 'Réessayer'));
      foot.appendChild(el('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: function () {
        S.pages.forEach(function (p) { p.text = ''; p.raw = ''; p.conf = null; p.manual = true; });
        S.step = 'review'; S.cur = 0; render();
      } }, '✍️ Taper le texte à la main'));
    }

    /* ---------- étape 3 : relecture ---------- */
    function renderReview() {
      var p = S.pages[S.cur], n = S.pages.length;
      var q = quality(p.conf);
      var ta = el('textarea', { class: 'textarea ocr-text', id: 'ocr-text', rows: '12', 'aria-label': 'Texte de la page ' + (S.cur + 1), spellcheck: 'true', lang: 'fr',
        placeholder: p.manual ? 'Tape ici le texte de ta page…' : 'Aucun texte reconnu sur cette page. Tu peux le taper ici.' });
      ta.value = p.text;
      var words = el('span', { class: 'ocr-words' });
      function upd() { var m = ta.value.match(/\S+/g); words.textContent = (m ? m.length : 0) + ' mots'; }
      ta.addEventListener('input', function () { p.text = ta.value; upd(); });
      upd();
      var nameIn = el('input', { class: 'input ocr-name', id: 'ocr-name', type: 'text', value: S.name, onchange: function (e) { S.name = e.target.value; }, oninput: function (e) { S.name = e.target.value; } });
      function go(d) { var i = S.cur + d; if (i < 0 || i >= n) return; S.cur = i; render(); }
      body.appendChild(el('div', { class: 'ocr-warn', role: 'note' }, el('strong', null, '👀 Relis bien : '), 'l’écriture à la main est moins bien reconnue. Corrige les erreurs avant d’ajouter.'));
      body.appendChild(el('div', { class: 'ocr-nav' },
        el('button', { type: 'button', class: 'btn btn-sm', disabled: S.cur === 0, onclick: function () { go(-1); }, 'aria-label': 'Page précédente' }, '← Précédente'),
        el('strong', { 'aria-live': 'polite' }, 'Page ' + (S.cur + 1) + ' sur ' + n),
        el('button', { type: 'button', class: 'btn btn-sm', disabled: S.cur === n - 1, onclick: function () { go(1); }, 'aria-label': 'Page suivante' }, 'Suivante →')));
      if (p.error) body.appendChild(el('p', { class: 'ocr-badge ocr-q-low' }, 'Cette page n’a pas pu être lue : tape le texte à la main.'));
      else if (!p.manual) body.appendChild(el('p', { class: 'ocr-badge ocr-q-' + q.id }, q.label));
      body.appendChild(el('div', { class: 'ocr-split' },
        el('figure', { class: 'ocr-photo' }, el('img', { src: p.url, alt: 'Photo de la page ' + (S.cur + 1) })),
        el('div', { class: 'ocr-edit' },
          el('label', { for: 'ocr-text' }, 'Texte reconnu (modifiable)'), ta,
          el('div', { class: 'ocr-edit-tools' }, words,
            el('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: function () { ta.value = p.text = cleanText(ta.value); upd(); Studio.ui.toast('Texte nettoyé.'); } }, '✨ Nettoyer (césures, lignes cassées)'),
            p.raw ? el('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: function () { ta.value = p.text = p.raw; upd(); } }, '↩ Texte brut') : null,
            el('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: function () { ta.value = p.text = ''; upd(); ta.focus(); } }, 'Vider')))));
      body.appendChild(el('div', { class: 'ocr-namebox' }, el('label', { for: 'ocr-name' }, 'Nom du document'), nameIn));
      body.appendChild(el('p', { class: 'ocr-privacy' }, '🔒 Photos et texte restent dans ton navigateur.'));
      foot.appendChild(el('button', { type: 'button', class: 'btn btn-ghost', onclick: requestClose }, 'Annuler'));
      foot.appendChild(el('button', { type: 'button', class: 'btn btn-primary btn-lg', onclick: finish }, '✅ Ajouter à ma bibliothèque'));
    }

    function finish() {
      var text = joinPages(S.pages.map(function (p) { return p.text; }));
      if (!text) { Studio.ui.toast('Il n’y a pas de texte à ajouter. Tape ou corrige le texte d’abord.', 'error'); return; }
      var name = String(S.name || '').trim() || docName(new Date());
      try {
        var partial = Studio.files.fromText(name, text);
        partial.kind = 'paste';
        var add = Studio.addDoc || (Studio.app && Studio.app.addDoc);
        if (!add) throw new Error('addDoc indisponible');
        if (!add(partial)) return;   // quota plein : message déjà affiché, on garde le texte à l'écran
        var count = S.pages.filter(function (p) { return p.text && p.text.trim(); }).length;
        Studio.bus.emit('activity', { type: 'ocr', count: count });
        Studio.ui.toast('Cahier ajouté : ' + name, 'success');
        closeAll();
      } catch (e) { Studio.ui.toast((e && (e.userMessage || e.message)) || 'Ajout impossible.', 'error'); }
    }

    /* ---------- cadre ---------- */
    var TITLES = { pick: '📷 Photographier mon cahier', run: 'Lecture en cours', review: 'Relis ton texte', error: 'Oups, lecture impossible' };
    function render(focusIdx, what) {
      body.innerHTML = ''; foot.innerHTML = '';
      title.textContent = TITLES[S.step];
      if (S.step === 'pick') renderPick(); else if (S.step === 'run') renderRun(); else if (S.step === 'review') renderReview(); else renderError();
      dlg.setAttribute('data-step', S.step);
      if (what) {
        var li = body.querySelectorAll('.ocr-thumb')[focusIdx];
        var sel = what === 'rm' ? '.ocr-del' : what === 'up' ? 'button:nth-child(1)' : 'button:nth-child(2)';
        var b = li && li.querySelector(sel);
        if (li && (!b || b.disabled)) b = Array.prototype.filter.call(li.querySelectorAll('.ocr-thumb-actions button'), function (x) { return !x.disabled; })[0];
        if (b) { b.focus(); return; }
      }
      if (S.step === 'review') { var t = body.querySelector('.ocr-text'); if (t) { t.focus(); return; } }
      title.focus();
    }

    title = el('h2', { id: 'ocr-title', tabindex: '-1' });
    body = el('div', { class: 'ocr-body' });
    foot = el('div', { class: 'ocr-actions' });
    liveEl = el('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    dlg = el('div', { class: 'ocr-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ocr-title' },
      el('header', { class: 'ocr-head' }, title, el('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': 'Fermer', onclick: requestClose }, '✕')),
      body, foot, liveEl);
    back = el('div', { class: 'ocr-backdrop' }, dlg);
    document.body.appendChild(back);
    document.body.classList.add('modal-open');
    document.addEventListener('keydown', onKey, true);

    ui = { addFiles: addFiles, focus: function () { title.focus(); }, close: closeAll, state: S, el: back };
    if (files && files.length) addFiles(files);
    render();
    return ui;
  }

  /* Bouton dans la bibliothèque (point d'accroche de dev-a11y). */
  Studio.libraryActions = Studio.libraryActions || [];
  if (!Studio.libraryActions.some(function (a) { return a && a.id === 'ocr'; })) {
    Studio.libraryActions.push({ id: 'ocr', label: 'Photographier mon cahier', icon: '📷', onClick: function () { open(); } });
  }

  Studio.ocr = {
    open: open, logic: logic, loadTesseract: loadTesseract, prepareCanvas: prepareCanvas, isImageFile: isImageFile,
    current: function () { return ui; }
  };
})();
