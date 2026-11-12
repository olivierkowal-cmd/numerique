/* Studio core : store, bus, ui, register, router, stats. Voir spec.md. */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var Studio = root.Studio = root.Studio || {};
  Studio.content = Studio.content || {};
  /* Données séparées par élève : la plateforme fixe window.__STUDIO_USER__ (adresse mail) AVANT de charger ce fichier.
     Sans élève (tests, ancien usage) : clés « studio.* » comme avant. Avec un élève : « studio-<mail>|* » (+ blobs et IndexedDB propres). */
  function userKey(email) { return String(email == null ? '' : email).trim().toLowerCase().replace(/[^a-z0-9@._-]/g, '_').slice(0, 120); }
  function keyNames(email) {
    var k = userKey(email);
    return k ? { user: k, prefix: 'studio-' + k + '|', blobPrefix: 'studiob-' + k + '|', idb: 'studio-blobs-' + k }
             : { user: '', prefix: 'studio.', blobPrefix: 'studiob.', idb: 'studio-blobs' };
  }
  Studio.userKey = userKey; Studio.keyNames = keyNames;
  var NAMES = keyNames(root.__STUDIO_USER__ || '');
  var PREFIX = NAMES.prefix;
  var COLLECTIONS = ['docs', 'decks', 'quizzes', 'summaries', 'mnemos', 'mindmaps'];

  /* ---------- bus ---------- */
  var handlers = {};
  Studio.bus = {
    on: function (evt, fn) { (handlers[evt] = handlers[evt] || []).push(fn); return function () { Studio.bus.off(evt, fn); }; },
    off: function (evt, fn) { handlers[evt] = (handlers[evt] || []).filter(function (f) { return f !== fn; }); },
    emit: function (evt, data) {
      (handlers[evt] || []).slice().forEach(function (fn) {
        try { fn(data); } catch (e) { if (root.console) console.error('[Studio.bus] ' + evt, e); }
      });
    }
  };

  /* ---------- store (localStorage avec repli mémoire) ---------- */
  var mem = {};
  function ls() {
    try { if (root.localStorage) { var k = '__studio_t'; root.localStorage.setItem(k, '1'); root.localStorage.removeItem(k); return root.localStorage; } } catch (e) { /* indisponible */ }
    return null;
  }
  var warned = false;
  var MSG_FULL = 'Plus de place : supprime un vieux cours ou exporte tes données.';
  function toastErr(msg) { if (Studio.ui && Studio.ui.toast) Studio.ui.toast(msg, 'error'); }

  /* ---- écritures différées (anti-rebond) : pend[clé] = { str, inline, waits, committed, timer } ---- */
  var pend = {}, DEBOUNCE = 300;
  function rawGet(key) {
    if (pend[key]) return pend[key].str;
    var s = ls();
    if (s) { var v = s.getItem(PREFIX + key); return v === null ? undefined : v; }
    return mem[key];
  }
  function rawSet(key, str) {
    var s = ls();
    if (s) {
      try { s.setItem(PREFIX + key, str); return true; } catch (e) {
        toastErr(MSG_FULL);
        return false;
      }
    }
    if (!warned) { warned = true; toastErr('Stockage du navigateur indisponible : tes données ne seront pas conservées.'); }
    mem[key] = str; return true;
  }
  function rawRemove(key) { var e = pend[key]; if (e) { if (e.timer) clearTimeout(e.timer); delete pend[key]; } var s = ls(); if (s) s.removeItem(PREFIX + key); else delete mem[key]; }
  function flushKey(key, force) {
    var e = pend[key]; if (!e) return true;
    if (!force && !e.committed) return true;           // on attend que les gros blobs soient écrits (IndexedDB)
    if (e.timer) { clearTimeout(e.timer); e.timer = 0; }
    delete pend[key];
    return rawSet(key, e.committed ? e.str : e.inline);   // blob pas encore écrit à la fermeture : on écrit la version complète
  }
  function flushAll() { Object.keys(pend).forEach(function (k) { flushKey(k, true); }); }
  function schedule(key, ms) {
    var e = pend[key]; if (!e) return;
    if (e.timer) clearTimeout(e.timer);
    e.timer = setTimeout(function () { if (pend[key] === e) { e.timer = 0; flushKey(key, false); } }, ms);
  }
  function allKeys() {
    var s = ls(), out = [];
    if (s) { for (var i = 0; i < s.length; i++) { var k = s.key(i); if (k && k.indexOf(PREFIX) === 0) out.push(k.slice(PREFIX.length)); } }
    else out = Object.keys(mem);
    Object.keys(pend).forEach(function (k) { if (out.indexOf(k) < 0) out.push(k); });
    return out;
  }

  /* ---------- Studio.blobs : gros contenus (images de cartes, texte des gros documents) ----------
     IndexedDB avec repli localStorage (clés « studiob.* », jamais exportées telles quelles) ou mémoire.
     Le store les remplace par une référence dans docs/decks et les remet en place à la lecture (cache mémoire
     chargé au démarrage : Studio.blobs.ready) : le reste de l'appli ne voit aucune différence. */
  var REF = '§blob§', BPREFIX = NAMES.blobPrefix;
  var IMG_MIN = 2000, TEXT_MIN = 30000;                         // seuils d'externalisation (caractères)
  var MAX_IMAGE_BYTES = 40 * 1024, MAX_IMAGES = 30;
  var rev = typeof Map === 'function' ? new Map() : { get: function () {}, set: function () {} };   // texte -> clé (évite de re-hacher les gros contenus)
  var bcache = {}, idb = null, idbOpen = null, blobsReady = false, readyPromise;
  var hasIDB = false;
  try { hasIDB = !!(root.indexedDB && typeof root.indexedDB.open === 'function'); } catch (e) { hasIDB = false; }
  function hashKey(str) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < str.length; i++) { var c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 'h' + (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36) + str.length.toString(36);
  }
  function lsBlobSet(key, data) { var s = ls(); if (!s) return true; try { s.setItem(BPREFIX + key, data); return true; } catch (e) { return false; } }
  function openIDB() {
    if (idbOpen) return idbOpen;
    idbOpen = new Promise(function (resolve) {
      if (!hasIDB) return resolve(null);
      try {
        var rq = root.indexedDB.open(NAMES.idb, 1);
        rq.onupgradeneeded = function () { try { rq.result.createObjectStore('blobs'); } catch (e) { /* ignore */ } };
        rq.onsuccess = function () { idb = rq.result; resolve(idb); };
        rq.onerror = rq.onblocked = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
    return idbOpen;
  }
  function idbReq(mode, fn) {
    return openIDB().then(function (db) {
      if (!db) return { ok: false };
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction('blobs', mode), st = tx.objectStore('blobs'), out = fn(st);
          tx.oncomplete = function () { resolve({ ok: true, value: out && out.result }); };
          tx.onerror = tx.onabort = function () { resolve({ ok: false }); };
        } catch (e) { resolve({ ok: false }); }
      });
    });
  }
  /* persist : écrit sur disque. Retourne une promesse ; .ok vaut true/false tout de suite quand c'est synchrone. */
  function persist(key, data) {
    var p;
    if (!hasIDB) { var ok = lsBlobSet(key, data); p = Promise.resolve(ok); p.ok = ok; return p; }
    p = idbReq('readwrite', function (st) { st.put(data, key); }).then(function (r) {
      if (r.ok) return true;
      return lsBlobSet(key, data);            // IndexedDB refuse : repli localStorage
    });
    return p;
  }
  function blobRemove(key) {
    delete bcache[key];
    var s = ls(); if (s) { try { s.removeItem(BPREFIX + key); } catch (e) { /* ignore */ } }
    if (hasIDB) idbReq('readwrite', function (st) { st.delete(key); });
  }
  function blobGetSync(key) {
    if (Object.prototype.hasOwnProperty.call(bcache, key)) return bcache[key];
    var s = ls(); if (s) { var v = s.getItem(BPREFIX + key); if (v !== null) { bcache[key] = v; return v; } }
    return undefined;
  }
  function loadAllBlobs() {
    if (!hasIDB) return Promise.resolve();
    return openIDB().then(function (db) {
      if (!db) return;
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction('blobs', 'readonly'), rq = tx.objectStore('blobs').openCursor();
          rq.onsuccess = function () { var c = rq.result; if (c) { if (!Object.prototype.hasOwnProperty.call(bcache, c.key)) bcache[c.key] = c.value; c.continue(); } };
          tx.oncomplete = tx.onerror = tx.onabort = function () { resolve(); };
        } catch (e) { resolve(); }
      });
    });
  }
  function b64Bytes(u) {
    var i = String(u).indexOf('base64,');
    if (i < 0) return String(u).length;
    return Math.floor((u.length - i - 7) * 3 / 4);
  }
  function checkImage(u) {
    if (typeof u !== 'string' || u.indexOf('data:image/') !== 0) return { ok: false, msg: 'Ce n’est pas une image.' };
    var n = b64Bytes(u);
    if (n > MAX_IMAGE_BYTES) return { ok: false, msg: 'Image trop lourde (' + Math.round(n / 1024) + ' Ko, maximum ' + Math.round(MAX_IMAGE_BYTES / 1024) + ' Ko). Réduis-la avant de l’ajouter.' };
    return { ok: true };
  }
  function isRef(v) { return typeof v === 'string' && v.indexOf(REF) === 0; }

  /* externalise : retourne { value, waits, error } ; ne modifie pas l'objet reçu. */
  function externalize(coll, arr) {
    var waits = [], error = null;
    function ext(str, minLen, isImg) {
      if (typeof str !== 'string' || isRef(str)) return str;
      if (str.length < minLen) return str;
      var key = rev.get(str) || ((isImg ? 'img-' : 'txt-') + hashKey(str));
      if (isImg && blobGetSync(key) === undefined) {
        var chk = checkImage(str);
        if (!chk.ok) { error = error || chk.msg; return str; }
      }
      if (blobGetSync(key) === undefined) {
        bcache[key] = str; rev.set(str, key);
        var p = persist(key, str);
        if (p.ok === false) { error = error || MSG_FULL; delete bcache[key]; return str; }
        if (p.ok !== true) waits.push(p);
      }
      return REF + key;
    }
    var out = arr;
    if (coll === 'docs') {
      out = arr.map(function (d) { if (d && typeof d.text === 'string' && d.text.length >= TEXT_MIN) { var t = ext(d.text, TEXT_MIN, false); return t === d.text ? d : Object.assign({}, d, { text: t }); } return d; });
    } else if (coll === 'decks') {
      out = arr.map(function (d) {
        if (!d || !Array.isArray(d.cards)) return d;
        var changed = false, cards = d.cards.map(function (c) {
          if (!c || (typeof c.imgFront !== 'string' && typeof c.imgBack !== 'string')) return c;
          var f = ext(c.imgFront, IMG_MIN, true), b = ext(c.imgBack, IMG_MIN, true);
          if (f === c.imgFront && b === c.imgBack) return c;
          changed = true; var n = Object.assign({}, c); if (f !== undefined) n.imgFront = f; if (b !== undefined) n.imgBack = b; return n;
        });
        return changed ? Object.assign({}, d, { cards: cards }) : d;
      });
    }
    return { value: out, waits: waits, error: error };
  }
  function hydrate(coll, arr) {
    if (!Array.isArray(arr)) return arr;
    function back(v) { if (!isRef(v)) return v; var d = blobGetSync(v.slice(REF.length)); if (d === undefined) return v; rev.set(d, v.slice(REF.length)); return d; }
    if (coll === 'docs') return arr.map(function (d) { return d && isRef(d.text) ? Object.assign({}, d, { text: back(d.text) }) : d; });
    if (coll === 'decks') return arr.map(function (d) {
      if (!d || !Array.isArray(d.cards)) return d;
      var ch = false, cards = d.cards.map(function (c) {
        if (!c || (!isRef(c.imgFront) && !isRef(c.imgBack))) return c;
        ch = true; var n = Object.assign({}, c); if (isRef(c.imgFront)) n.imgFront = back(c.imgFront); if (isRef(c.imgBack)) n.imgBack = back(c.imgBack); return n;
      });
      return ch ? Object.assign({}, d, { cards: cards }) : d;
    });
    return arr;
  }
  function countImgs(str) { var m = String(str || '').match(/"img(?:Front|Back)":"/g); return m ? m.length : 0; }
  function referencedKeys() {
    var seen = {};
    ['docs', 'decks'].forEach(function (k) {
      var raw = rawGet(k) || '', re = new RegExp(REF + '([\\w-]+)', 'g'), m;
      while ((m = re.exec(raw))) seen[m[1]] = true;
    });
    return seen;
  }
  function blobKeys() {
    var out = Object.keys(bcache), s = ls();
    if (s) for (var i = 0; i < s.length; i++) { var k = s.key(i); if (k && k.indexOf(BPREFIX) === 0 && out.indexOf(k.slice(BPREFIX.length)) < 0) out.push(k.slice(BPREFIX.length)); }
    return out;
  }
  Studio.blobs = {
    MAX_IMAGE_BYTES: MAX_IMAGE_BYTES, MAX_IMAGES: MAX_IMAGES,
    put: function (key, data) { bcache[key] = String(data); return persist(key, String(data)).then(function (ok) { return !!ok; }); },
    get: function (key) { var v = blobGetSync(key); if (v !== undefined) return Promise.resolve(v); return openIDB().then(function () { return idbReq('readonly', function (st) { return st.get(key); }); }).then(function (r) { return r.ok ? r.value : undefined; }); },
    getSync: blobGetSync,
    remove: function (key) { blobRemove(key); return Promise.resolve(true); },
    keys: blobKeys,
    checkImage: checkImage,
    usesIndexedDB: function () { return hasIDB && !!idb; },
    isReady: function () { return blobsReady; },
    hashKey: hashKey,
    /* supprime les blobs que plus aucun document / deck ne référence */
    gc: function () {
      if (Object.keys(pend).length) return 0;
      var used = referencedKeys(), n = 0;
      blobKeys().forEach(function (k) { if (!used[k] && (/^(img|txt)-/.test(k))) { blobRemove(k); n++; } });
      return n;
    },
    clear: function () { blobKeys().forEach(blobRemove); },
    /* migration : réécrit docs/decks pour sortir les gros contenus déjà stockés en ligne. Retourne le nombre de collections migrées. */
    migrate: function () {
      var n = 0;
      ['docs', 'decks'].forEach(function (k) {
        var raw = rawGet(k);
        if (!raw || raw.length < IMG_MIN) return;
        var arr; try { arr = JSON.parse(raw); } catch (e) { return; }
        if (!Array.isArray(arr)) return;
        var r = externalize(k, arr);
        if (r.error || r.value === arr || (r.value.every(function (x, i) { return x === arr[i]; }))) return;
        commit(k, r, JSON.stringify(arr), {}); n++;
      });
      return n;
    }
  };

  /* commit : écrit la valeur (références) ; si des blobs sont encore en route vers IndexedDB, l'écriture attend. */
  function commit(key, ext, inlineStr, opts) {
    var str = JSON.stringify(ext.value);
    if (!ext.waits.length && !(opts && opts.defer)) { var e0 = pend[key]; if (e0) { if (e0.timer) clearTimeout(e0.timer); delete pend[key]; } return rawSet(key, str); }
    var e = { str: str, inline: inlineStr, committed: !ext.waits.length, timer: 0 };
    var old = pend[key]; if (old && old.timer) clearTimeout(old.timer);
    pend[key] = e;
    if (ext.waits.length) {
      Promise.all(ext.waits).then(function (rs) {
        if (pend[key] !== e) return;
        if (rs.some(function (x) { return !x; })) toastErr(MSG_FULL);
        e.committed = true; flushKey(key, false);
      });
    } else schedule(key, DEBOUNCE);
    return true;
  }
  function writeKey(key, value, opts) {
    if (key === 'docs' || key === 'decks') {
      var prev = key === 'decks' ? countImgs(rawGet(key)) : 0;
      var ext = externalize(key, value);
      if (!ext.error && key === 'decks') {
        var now = countImgs(JSON.stringify(ext.value));
        if (now > MAX_IMAGES && now > prev) ext.error = 'Tu as déjà ' + MAX_IMAGES + ' images dans tes cartes (maximum). Supprime des images avant d’en ajouter.';
      }
      if (ext.error) { toastErr(ext.error); return false; }
      var changed = ext.value !== value && ext.value.some(function (x, i) { return x !== value[i]; });
      if (changed || (opts && opts.defer) || pend[key]) return commit(key, ext, JSON.stringify(value), opts);
      return rawSet(key, JSON.stringify(value));
    }
    return rawSet(key, JSON.stringify(value));
  }
  var lastUpd = {};
  readyPromise = hasIDB ? openIDB().then(loadAllBlobs).then(function () {
    blobsReady = true;
    try { Studio.blobs.migrate(); } catch (e) { /* ignore */ }
    setTimeout(function () { try { Studio.blobs.gc(); } catch (e) { /* ignore */ } }, 4000);
  }) : Promise.resolve().then(function () { try { Studio.blobs.migrate(); } catch (e) { /* ignore */ } });
  if (!hasIDB) blobsReady = true;
  Studio.blobs.ready = readyPromise;
  if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', function () { if (document.hidden || document.visibilityState === 'hidden') flushAll(); });
  if (root.addEventListener) root.addEventListener('pagehide', flushAll);

  Studio.store = {
    get: function (key, def) {
      var v = rawGet(key);
      if (v === undefined) return def;
      try {
        var o = JSON.parse(v);
        return (key === 'docs' || key === 'decks') && v.indexOf(REF) >= 0 ? hydrate(key, o) : o;
      } catch (e) { return def; }
    },
    /* set : retourne false (et affiche un message) si l'écriture a échoué. opts.defer : écriture différée (anti-rebond 300 ms). */
    set: function (key, value, opts) {
      var str;
      try { str = JSON.stringify(value); } catch (e) { return false; }
      if (key === 'docs' || key === 'decks') { if (Array.isArray(value)) return writeKey(key, value, opts); }
      if (opts && opts.defer) { var old = pend[key]; if (old && old.timer) clearTimeout(old.timer); pend[key] = { str: str, inline: str, committed: true, timer: 0 }; schedule(key, DEBOUNCE); return true; }
      var e0 = pend[key]; if (e0) { if (e0.timer) clearTimeout(e0.timer); delete pend[key]; }
      return rawSet(key, str);
    },
    flush: flushAll,
    list: function (c) { var a = Studio.store.get(c, []); return Array.isArray(a) ? a : []; },
    /* add : retourne l'objet enregistré, ou null si l'enregistrement a échoué (rien n'est alors ajouté). */
    add: function (c, obj) {
      var a = Studio.store.list(c);
      obj = obj || {};
      if (!obj.id) obj.id = Studio.ui.uid();
      a.push(obj);
      if (Studio.store.set(c, a) === false) return null;
      notify(c); return obj;
    },
    /* update : retourne l'objet mis à jour, ou null (introuvable ou écriture impossible : rien n'est modifié).
       Des mises à jour rapprochées du même objet (notes de cartes…) sont regroupées (écriture différée). */
    update: function (c, id, patch, opts) {
      var a = Studio.store.list(c), found = null;
      for (var i = 0; i < a.length; i++) if (a[i].id === id) { Object.assign(a[i], patch); found = a[i]; break; }
      if (!found) return null;
      var sig = c + '/' + id + '/' + Object.keys(patch || {}).sort().join(','), now = Date.now();
      var rapid = !!(lastUpd[sig] && now - lastUpd[sig] < 1500);
      lastUpd[sig] = now;
      var o = opts || {}; if (rapid && o.defer === undefined) o = { defer: true };
      if (Studio.store.set(c, a, o) === false) return null;
      notify(c);
      return found;
    },
    remove: function (c, id) {
      var a = Studio.store.list(c), b = a.filter(function (x) { return x.id !== id; });
      if (b.length !== a.length) { if (Studio.store.set(c, b) === false) return false; notify(c); return true; }
      return false;
    },
    byId: function (c, id) {
      var a = Studio.store.list(c);
      for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
      return null;
    },
    keys: allKeys,
    /* Espace utilisé dans le localStorage (en caractères ; quota Chrome ≈ 5,2 millions) */
    usage: function () {
      var s = ls(), used = 0, blob = 0;
      if (s) for (var i = 0; i < s.length; i++) { var k = s.key(i); if (!k) continue; var n = k.length + (s.getItem(k) || '').length; if (k.indexOf(PREFIX) === 0) used += n; else if (k.indexOf(BPREFIX) === 0) { used += n; blob += n; } }
      var quota = 5 * 1024 * 1024;
      return { used: used, quota: quota, ratio: Math.min(1, used / quota), blobChars: blob, indexedDB: Studio.blobs.usesIndexedDB() };
    },
    /* Export de toutes les données : { app, version, exportedAt, data:{clé:valeur} } */
    exportAll: function (includeApiKey) {
      var data = {};
      allKeys().forEach(function (k) { data[k] = Studio.store.get(k); });
      if (!includeApiKey && data.settings) { data.settings = Object.assign({}, data.settings); data.settings.apiKey = ''; }
      return { app: 'studio', version: 1, exportedAt: new Date().toISOString(), data: data };
    },
    importAll: function (obj) {
      if (!obj || obj.app !== 'studio' || !obj.data || typeof obj.data !== 'object') throw new Error('Ce fichier n’est pas une sauvegarde Studio valide.');
      var keepKey = (Studio.store.get('settings', {}) || {}).apiKey || '';
      allKeys().forEach(rawRemove);
      Object.keys(obj.data).forEach(function (k) {
        if (/^[\w.-]+$/.test(k)) Studio.store.set(k, obj.data[k]);
      });
      var st = Studio.store.get('settings');
      if (st && !st.apiKey && keepKey) { st.apiKey = keepKey; Studio.store.set('settings', st); }
    },
    clear: function () { allKeys().forEach(rawRemove); Studio.blobs.clear(); }
  };
  function notify(c) { Studio.bus.emit(c + ':changed', { collection: c }); }

  /* ---------- Validateur de schéma (réutilisable) ----------
     Studio.validate(type, obj) -> { ok:boolean, errors:[string] }
     types : doc, card, deck, question, quiz, summary, mnemo, mindmap, stats, settings */
  (function () {
    var KINDS = ['pdf', 'txt', 'md', 'docx', 'html', 'paste'];
    function str(v) { return typeof v === 'string'; }
    function ne(v) { return str(v) && v.trim().length > 0; }
    function num(v) { return typeof v === 'number' && isFinite(v); }
    function int(v) { return num(v) && Math.floor(v) === v; }
    function obj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
    function C(errs, path) { return function (ok, msg) { if (!ok) errs.push(path + ' : ' + msg); }; }

    var V = {
      doc: function (d, e, p) {
        var c = C(e, p);
        if (!obj(d)) return c(false, 'objet attendu');
        c(ne(d.id), 'id manquant'); c(ne(d.name), 'name manquant');
        c(KINDS.indexOf(d.kind) >= 0, 'kind invalide (' + d.kind + ')');
        c(str(d.text), 'text doit être une chaîne'); c(int(d.words) && d.words >= 0, 'words entier ≥ 0');
        c(num(d.addedAt), 'addedAt (timestamp ms)');
        c(d.subject === undefined || str(d.subject), 'subject doit être une chaîne');
      },
      card: function (d, e, p) {
        var c = C(e, p);
        if (!obj(d)) return c(false, 'objet attendu');
        c(ne(d.id), 'id manquant'); c(ne(d.front), 'front vide'); c(ne(d.back), 'back vide');
        c(d.hint === undefined || str(d.hint), 'hint doit être une chaîne');
        c(d.mnemo === undefined || str(d.mnemo), 'mnemo doit être une chaîne');
        c(d.imgFront === undefined || (str(d.imgFront) && /^data:image\//.test(d.imgFront)), 'imgFront doit être une data URL image');
        c(d.imgBack === undefined || (str(d.imgBack) && /^data:image\//.test(d.imgBack)), 'imgBack doit être une data URL image');
        c(d.source === undefined || str(d.source), 'source doit être une chaîne');
        c(d.flagged === undefined || typeof d.flagged === 'boolean', 'flagged doit être un booléen');
        c(int(d.box) && d.box >= 0 && d.box <= 5, 'box entier 0-5');
        c(num(d.ease) && d.ease >= 1.3, 'ease nombre ≥ 1.3');
        c(num(d.interval) && d.interval >= 0, 'interval ≥ 0');
        c(int(d.reps) && d.reps >= 0, 'reps entier ≥ 0'); c(int(d.lapses) && d.lapses >= 0, 'lapses entier ≥ 0');
        c(num(d.due), 'due (timestamp ms)');
      },
      deck: function (d, e, p) {
        var c = C(e, p);
        if (!obj(d)) return c(false, 'objet attendu');
        c(ne(d.id), 'id manquant'); c(ne(d.docId), 'docId manquant'); c(ne(d.title), 'title manquant');
        c(num(d.createdAt), 'createdAt'); if (!Array.isArray(d.cards)) return c(false, 'cards doit être un tableau');
        d.cards.forEach(function (x, i) { V.card(x, e, p + '.cards[' + i + ']'); });
      },
      question: function (q, e, p) {
        var c = C(e, p);
        if (!obj(q)) return c(false, 'objet attendu');
        c(ne(q.id), 'id manquant'); c(ne(q.q), 'q vide');
        c(['qcm', 'vf', 'fill', 'open'].indexOf(q.type) >= 0, 'type invalide (' + q.type + ')');
        c(int(q.difficulty) && q.difficulty >= 1 && q.difficulty <= 3, 'difficulty entier 1-3');
        c(q.explain === undefined || str(q.explain), 'explain doit être une chaîne');
        c(q.source === undefined || str(q.source), 'source doit être une chaîne');
        c(q.flagged === undefined || typeof q.flagged === 'boolean', 'flagged doit être un booléen');
        if (q.type === 'qcm') {
          var ok = Array.isArray(q.choices) && q.choices.length >= 2 && q.choices.every(ne);
          c(ok, 'choices : ≥ 2 chaînes non vides');
          c(ok && int(q.answer) && q.answer >= 0 && q.answer < q.choices.length, 'answer doit être un index valide de choices');
        } else if (q.type === 'vf') c(typeof q.answer === 'boolean', 'answer booléen');
        else if (q.type === 'fill') { c(str(q.q) && q.q.indexOf('____') >= 0, 'q doit contenir "____"'); c(ne(q.answer), 'answer chaîne non vide'); }
        else if (q.type === 'open') c(ne(q.answer), 'answer (réponse modèle) non vide');
      },
      quiz: function (d, e, p) {
        var c = C(e, p);
        if (!obj(d)) return c(false, 'objet attendu');
        c(ne(d.id), 'id manquant'); c(ne(d.docId), 'docId manquant'); c(ne(d.title), 'title manquant'); c(num(d.createdAt), 'createdAt');
        c(Array.isArray(d.history), 'history doit être un tableau');
        (d.history || []).forEach(function (h, i) { c(obj(h) && h.date !== undefined && num(h.score) && num(h.total), 'history[' + i + '] {date,score,total}'); });
        if (!Array.isArray(d.questions)) return c(false, 'questions doit être un tableau');
        d.questions.forEach(function (x, i) { V.question(x, e, p + '.questions[' + i + ']'); });
      },
      summary: function (d, e, p) {
        var c = C(e, p);
        if (!obj(d)) return c(false, 'objet attendu');
        c(ne(d.id), 'id manquant'); c(ne(d.docId), 'docId manquant'); c(ne(d.title), 'title'); c(num(d.createdAt), 'createdAt'); c(ne(d.markdown), 'markdown vide');
      },
      mnemo: function (d, e, p) {
        var c = C(e, p);
        if (!obj(d)) return c(false, 'objet attendu');
        c(ne(d.id), 'id manquant'); c(ne(d.docId), 'docId manquant'); c(ne(d.title), 'title'); c(num(d.createdAt), 'createdAt');
        if (!Array.isArray(d.items)) return c(false, 'items doit être un tableau');
        d.items.forEach(function (x, i) { c(obj(x) && ne(x.technique) && ne(x.concept) && ne(x.tip), 'items[' + i + '] {technique,concept,tip}'); });
      },
      mindmap: function (d, e, p) {
        var c = C(e, p);
        if (!obj(d)) return c(false, 'objet attendu');
        c(ne(d.id), 'id manquant'); c(ne(d.docId), 'docId manquant'); c(ne(d.title), 'title');
        (function node(n, path, depth) {
          if (!obj(n)) return c(false, path + ' doit être un objet');
          c(ne(n.label), path + '.label vide');
          c(n.children === undefined || Array.isArray(n.children), path + '.children doit être un tableau');
          if (depth > 12) return c(false, 'profondeur excessive');
          (n.children || []).forEach(function (x, i) { node(x, path + '.children[' + i + ']', depth + 1); });
        })(d.root, p + '.root', 0);
      },
      stats: function (d, e, p) {
        var c = C(e, p);
        if (!obj(d)) return c(false, 'objet attendu');
        c(int(d.streak) && d.streak >= 0, 'streak entier ≥ 0');
        c(d.lastStudyDay === '' || d.lastStudyDay === null || (str(d.lastStudyDay) && /^\d{4}-\d{2}-\d{2}$/.test(d.lastStudyDay)), 'lastStudyDay AAAA-MM-JJ');
        c(obj(d.reviews), 'reviews objet'); c(num(d.xp), 'xp nombre'); c(Array.isArray(d.quizScores), 'quizScores tableau');
      },
      settings: function (d, e, p) {
        var c = C(e, p);
        if (!obj(d)) return c(false, 'objet attendu');
        c(['light', 'dark', 'auto'].indexOf(d.theme) >= 0, 'theme invalide');
        c(['none', 'anthropic', 'openai', 'gemini'].indexOf(d.provider) >= 0, 'provider invalide');
        c(d.apiKey === undefined || str(d.apiKey), 'apiKey chaîne'); c(d.model === undefined || str(d.model), 'model chaîne'); c(d.lang === undefined || str(d.lang), 'lang chaîne');
      }
    };
    function validate(type, o) {
      var errors = [];
      if (!V[type]) return { ok: false, errors: ['type inconnu : ' + type] };
      V[type](o, errors, type);
      return { ok: errors.length === 0, errors: errors };
    }
    validate.types = Object.keys(V);
    Studio.validate = validate;
  })();

  /* ---------- ui ---------- */
  var uidN = 0;
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs && typeof attrs === 'object' && !(attrs.nodeType || Array.isArray(attrs))) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class' || k === 'className') node.className = v;
        else if (k === 'style') { if (typeof v === 'string') node.style.cssText = v; else Object.assign(node.style, v); }
        else if (k === 'dataset') Object.keys(v).forEach(function (d) { node.dataset[d] = v[d]; });
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'text') node.textContent = v;
        else if (k.indexOf('on') === 0 && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'value' || k === 'checked' || k === 'selected' || k === 'disabled') { node[k] = v; if (v === true) node.setAttribute(k, ''); }
        else node.setAttribute(k, v === true ? '' : v);
      });
      append(node, Array.prototype.slice.call(arguments, 2));
    } else {
      append(node, Array.prototype.slice.call(arguments, 1));
    }
    return node;
  }
  function append(node, kids) {
    kids.forEach(function (c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) append(node, c);
      else if (c.nodeType) node.appendChild(c);
      else node.appendChild(document.createTextNode(String(c)));
    });
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function toastBox() {
    var b = document.getElementById('toasts');
    if (!b) { b = el('div', { id: 'toasts', 'aria-live': 'polite', role: 'status', style: 'position:fixed;right:16px;bottom:16px;z-index:10000;display:flex;flex-direction:column;gap:8px' }); document.body.appendChild(b); }
    return b;
  }
  function toast(msg, type) {
    if (typeof document === 'undefined') return;
    type = type || 'info';
    var t = el('div', { class: 'toast toast-' + type + ' ' + type }, String(msg));
    toastBox().appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, type === 'error' ? 6000 : 3500);
    return t;
  }
  Studio.bus.on('toast', function (d) { d = d || {}; toast(d.msg || d.message || '', d.type); });

  /* modal : overlay.modal-backdrop > .modal[role=dialog] > .modal-header / .modal-body / .modal-actions */
  function modal(opts) {
    opts = opts || {};
    var prevFocus = document.activeElement;
    var titleId = 'm' + (++uidN);
    var closed = false, handle = {};
    var body = el('div', { class: 'modal-body' });
    if (opts.body && opts.body.nodeType) body.appendChild(opts.body);
    else if (opts.body != null) body.innerHTML = '<p>' + escapeHtml(opts.body).replace(/\n/g, '<br>') + '</p>';
    var actions = el('div', { class: 'modal-actions' });
    (opts.actions || [{ label: 'Fermer' }]).forEach(function (a) {
      var cls = a.kind === 'primary' || a.primary ? 'btn btn-primary' : 'btn btn-ghost';
      if (a.danger) cls += ' btn-danger';
      actions.appendChild(el('button', { type: 'button', class: cls, onclick: function () {
        var r = a.onClick ? a.onClick(handle) : undefined;
        if (a.close !== false && r !== false) close(a.value);
      } }, a.label));
    });
    var box = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1' },
      el('div', { class: 'modal-header' }, el('h2', { id: titleId }, opts.title || '')), body, actions);
    var back = el('div', { class: 'modal-backdrop' }, box);
    back.addEventListener('mousedown', function (e) { if (e.target === back && opts.dismissable !== false) close(undefined); });
    function key(e) {
      if (e.key === 'Escape' && opts.dismissable !== false) { e.stopPropagation(); close(undefined); }
      else if (e.key === 'Tab') {
        var f = box.querySelectorAll('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    function close(v) {
      if (closed) return; closed = true;
      document.removeEventListener('keydown', key, true);
      if (back.parentNode) back.parentNode.removeChild(back);
      if (!document.querySelector('.modal-backdrop')) document.body.classList.remove('modal-open');
      if (prevFocus && prevFocus.focus) try { prevFocus.focus(); } catch (e) { /* ignore */ }
      if (opts.onClose) opts.onClose(v);
    }
    handle.close = close; handle.el = box; handle.body = body;
    document.addEventListener('keydown', key, true);
    document.body.appendChild(back);
    document.body.classList.add('modal-open');
    var pf = actions.querySelector('.btn-primary') || actions.querySelector('button');
    (box.querySelector('input,select,textarea') || pf || box).focus();
    return handle;
  }

  function confirmDlg(msg, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      modal({
        title: opts.title || 'Confirmation', body: msg, dismissable: true,
        onClose: function (v) { resolve(v === true); },
        actions: [{ label: opts.cancel || 'Annuler', value: false }, { label: opts.ok || 'Confirmer', kind: 'primary', danger: !!opts.danger, value: true }]
      });
    });
  }

  /* mini markdown sûr : on échappe tout d'abord, puis on balise. */
  function inline(s) {
    s = escapeHtml(s);
    var codes = [];
    s = s.replace(/`([^`]+)`/g, function (_, c) { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
    s = s.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, function (_, a, b) { return '<strong>' + (a || b) + '</strong>'; });
    s = s.replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^_\w])_([^_\s][^_]*)_(?![_\w])/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return '<code>' + codes[+i] + '</code>'; });
    return s;
  }
  function md(src) {
    var lines = String(src == null ? '' : src).replace(/\r\n?/g, '\n').split('\n');
    var out = [], i = 0, para = [];
    function flush() { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } }
    while (i < lines.length) {
      var l = lines[i], m;
      if (/^\s*$/.test(l)) { flush(); i++; continue; }
      if (/^```/.test(l)) {
        flush(); var code = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
        i++; out.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>'); continue;
      }
      if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) { flush(); out.push('<h' + m[1].length + '>' + inline(m[2].replace(/\s+#+\s*$/, '')) + '</h' + m[1].length + '>'); i++; continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { flush(); out.push('<hr>'); i++; continue; }
      if (/^\s*>/.test(l)) {
        flush(); var q = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
        out.push('<blockquote>' + md(q.join('\n')) + '</blockquote>'); continue;
      }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
        flush();
        var ordered = /^\s*\d+[.)]/.test(l), tag = ordered ? 'ol' : 'ul', items = [];
        while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) {
          items.push('<li>' + inline(lines[i].replace(/^\s*([-*+]|\d+[.)])\s+/, '')) + '</li>'); i++;
        }
        out.push('<' + tag + '>' + items.join('') + '</' + tag + '>'); continue;
      }
      para.push(l.trim()); i++;
    }
    flush();
    return out.join('\n');
  }

  function shuffle(arr) {
    var a = (arr || []).slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  function confetti() {
    if (typeof document === 'undefined') return;
    if (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var colors = ['#6c4cf1', '#ff6b6b', '#3ddbb0', '#ffd23f', '#4f6bff'];
    var layer = el('div', { 'aria-hidden': 'true', style: 'position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:11000' });
    document.body.appendChild(layer);
    for (var i = 0; i < 70; i++) {
      var p = el('i', { style: 'position:absolute;top:-12px;left:' + (Math.random() * 100) + '%;width:' + (6 + Math.random() * 6) + 'px;height:' + (8 + Math.random() * 8) + 'px;background:' + colors[i % colors.length] + ';border-radius:2px' });
      layer.appendChild(p);
      if (p.animate) p.animate([
        { transform: 'translate3d(0,0,0) rotate(0deg)', opacity: 1 },
        { transform: 'translate3d(' + ((Math.random() - 0.5) * 240) + 'px,' + (root.innerHeight + 40) + 'px,0) rotate(' + (360 + Math.random() * 540) + 'deg)', opacity: 0.9 }
      ], { duration: 1600 + Math.random() * 1400, delay: Math.random() * 300, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' });
    }
    setTimeout(function () { if (layer.parentNode) layer.parentNode.removeChild(layer); }, 3600);
  }

  function loading(container, msg) {
    clear(container);
    var n = el('div', { class: 'empty', role: 'status', 'aria-busy': 'true' },
      el('div', { class: 'empty-icon', 'aria-hidden': 'true' }, '⏳'),
      el('p', null, msg || 'Chargement…'));
    container.appendChild(n); return n;
  }

  function empty(container, o) {
    o = o || {};
    clear(container);
    var n = el('div', { class: 'empty' },
      o.icon ? el('div', { class: 'empty-icon', 'aria-hidden': 'true' }, o.icon) : null,
      o.title ? el('h2', null, o.title) : null,
      o.text ? el('p', null, o.text) : null);
    if (typeof o.cta === 'string') o.cta = { label: o.cta, go: o.go, onClick: o.onClick };   /* texte seul (Studio.content.text.empty.*.cta) */
    if (o.cta && o.cta.label && (o.cta.onClick || o.cta.go)) {
      n.appendChild(el('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
        if (o.cta.onClick) o.cta.onClick(); else if (o.cta.go) Studio.go(o.cta.go, o.cta.params);
      } }, o.cta.label));
    }
    container.appendChild(n); return n;
  }

  Studio.ui = {
    uid: function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + (++uidN).toString(36); },
    el: el, clear: clear, toast: toast, modal: modal, confirm: confirmDlg, md: md, escape: escapeHtml,
    shuffle: shuffle, confetti: confetti, loading: loading, empty: empty
  };

  /* ---------- modules + router ---------- */
  var modules = {}, container = null, cur = { moduleId: null, docId: null, params: {} };

  /* Points d'accroche v2 : Réglages {id,title,render(container)} et Bibliothèque {id,label,icon,onClick(ctx)}. */
  Studio.settingsSections = Studio.settingsSections || [];
  Studio.libraryActions = Studio.libraryActions || [];
  /* Réglages : jauge d'espace utilisé */
  Studio.settingsSections.push({ id: 'storage', title: 'Espace utilisé', render: function (box) {
    var u = Studio.store.usage(), pct = Math.round(u.ratio * 100), warn = pct >= 80;
    var bar = el('div', { style: 'height:12px;border-radius:6px;background:rgba(127,127,127,.25);overflow:hidden', role: 'progressbar', 'aria-label': 'Espace utilisé', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) },
      el('div', { style: 'height:100%;width:' + Math.max(1, pct) + '%;background:' + (warn ? '#e5484d' : 'var(--primary, #6c57f2)') }));
    box.appendChild(bar);
    box.appendChild(el('p', { class: 'small muted', id: 'storage-gauge-text' }, pct + ' % utilisé (' + Math.round(u.used / 1024) + ' Ko sur environ ' + Math.round(u.quota / 1024) + ' Ko).' + (warn ? ' Presque plein : supprime un vieux cours ou exporte tes données.' : '')));
    var extra = el('p', { class: 'small muted' }, u.indexedDB ? 'Les images et les gros cours sont rangés à part (grand espace).' : 'Les images de cartes sont limitées (40 Ko chacune, 30 au maximum).');
    box.appendChild(extra);
    try {
      if (root.navigator && root.navigator.storage && root.navigator.storage.estimate) root.navigator.storage.estimate().then(function (e) {
        if (e && e.usage != null) extra.textContent += ' Total du navigateur pour Studio : ' + Math.round(e.usage / 1024) + ' Ko' + (e.quota ? ' sur ' + Math.round(e.quota / 1048576) + ' Mo possibles' : '') + '.';
      }, function () {});
    } catch (e) { /* ignore */ }
  } });

  Studio.register = function (m) {
    if (!m || !m.id || typeof m.render !== 'function') throw new Error('Studio.register : module invalide');
    modules[m.id] = Object.assign({ order: 100, needsDoc: false, title: m.id, icon: '•' }, m);
    return m;
  };
  Studio.modules = function () {
    return Object.keys(modules).map(function (k) { return modules[k]; }).sort(function (a, b) { return a.order - b.order; });
  };
  Studio.setContainer = function (c) { container = c; };
  function getContainer() {
    if (container && container.isConnected !== false) return container;
    return document.getElementById('view') || document.getElementById('main') || document.querySelector('main') || document.querySelector('.main');
  }

  Studio.activeDocId = function () {
    var id = Studio.store.get('activeDoc', null), docs = Studio.store.list('docs');
    if (id && docs.some(function (d) { return d.id === id; })) return id;
    return docs.length ? docs[docs.length - 1].id : null;
  };
  Studio.activeDoc = function () { var id = Studio.activeDocId(); return id ? Studio.store.byId('docs', id) : null; };
  Studio.setActiveDoc = function (id) {
    Studio.store.set('activeDoc', id);
    Studio.bus.emit('doc:active', { docId: id });
  };

  function parseHash(h) {
    h = String(h || '').replace(/^#\/?/, '');
    var q = h.indexOf('?'), id = q < 0 ? h : h.slice(0, q), params = {};
    if (q >= 0) h.slice(q + 1).split('&').forEach(function (kv) {
      if (!kv) return; var p = kv.split('='); try { params[decodeURIComponent(p[0])] = decodeURIComponent(p.slice(1).join('=')); } catch (e) { /* ignore */ }
    });
    return { id: id, params: params };
  }
  function buildHash(id, params) {
    var q = Object.keys(params || {}).filter(function (k) { return params[k] != null; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(typeof params[k] === 'object' ? JSON.stringify(params[k]) : params[k]); }).join('&');
    return '#/' + id + (q ? '?' + q : '');
  }

  var pendingParams = null;
  Studio.go = function (moduleId, params) {
    var h = buildHash(moduleId, params);
    if (typeof location === 'undefined') { render(moduleId, params || {}); return; }
    if (location.hash === h) render(moduleId, params || {});
    else {
      pendingParams = params || {}; location.hash = h;
      /* Filet de sécurité : si le navigateur (ou le cadre Apps Script) ne signale pas le changement de #, on affiche quand même la page. */
      var want = h;
      setTimeout(function () { if (pendingParams && lastHash !== want) { var pp = pendingParams; pendingParams = null; render(moduleId, pp); } }, 200);
    }
  };
  Studio.current = function () { return { moduleId: cur.moduleId, docId: cur.docId, params: cur.params }; };
  Studio.refresh = function () { render(cur.moduleId, cur.params); };

  function render(id, params) {
    var c = getContainer();
    if (!c) return;
    if (id === 'home') id = 'library';   /* alias historique : 'home' = bibliothèque */
    if (id === 'accueil') id = modules.today ? 'today' : 'library';
    var mod = modules[id] || modules.today || modules.library || Studio.modules()[0];
    if (!mod) return;
    var docId = Studio.activeDocId();
    cur = { moduleId: mod.id, docId: docId, params: params || {} };
    clear(c);
    c.scrollTop = 0; if (root.scrollTo) try { root.scrollTo(0, 0); } catch (e) { /* ignore */ }
    if (mod.needsDoc && !docId) {
      empty(c, { icon: '📚', title: 'Choisis d’abord un cours', text: 'Cette section a besoin d’un document. Ajoute un cours dans la bibliothèque.', cta: { label: 'Aller à la bibliothèque', go: 'library' } });
    } else {
      try {
        mod.render(c, { docId: docId, params: params || {}, go: Studio.go });
      } catch (e) {
        if (root.console) console.error('[Studio] module ' + mod.id, e);
        empty(c, { icon: '😕', title: 'Oups, cette section a rencontré un problème', text: String(e && e.message || e) });
      }
    }
    Studio.bus.emit('nav', { moduleId: mod.id, docId: docId, params: params || {} });
  }

  var lastHash = null;
  function onHash() {
    lastHash = location.hash;
    var p = parseHash(location.hash);
    var params = p.params;
    if (pendingParams) { params = Object.assign({}, pendingParams, params); pendingParams = null; }
    /* accueil par défaut : « Aujourd'hui » s'il existe au moins un document, sinon la Bibliothèque */
    render(p.id || (modules.today ? 'today' : 'library'), params);
  }
  Studio.router = {
    start: function () {
      if (typeof window === 'undefined') return;
      window.addEventListener('hashchange', onHash);
      /* on attend (au plus 1,5 s) que les gros contenus (images, textes) soient chargés depuis IndexedDB */
      if (Studio.blobs.isReady()) onHash();
      else { var go1 = false, first = function () { if (!go1) { go1 = true; onHash(); } }; Studio.blobs.ready.then(first, first); setTimeout(first, 1500); }
    },
    parseHash: parseHash, buildHash: buildHash
  };

  /* ---------- stats ---------- */
  function dayKey(d) {
    d = d || new Date();
    var m = d.getMonth() + 1, j = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (j < 10 ? '0' : '') + j;
  }
  function defStats() { return { streak: 0, lastStudyDay: '', reviews: {}, xp: 0, quizScores: [] }; }
  function loadStats() { return Object.assign(defStats(), Studio.store.get('stats', {}) || {}); }
  Studio.stats = {
    dayKey: dayKey,
    get: loadStats,
    touch: function (n) {
      n = n == null ? 1 : n;
      var s = loadStats(), today = dayKey(), y = new Date(); y.setDate(y.getDate() - 1);
      s.reviews = s.reviews || {};
      s.reviews[today] = (s.reviews[today] || 0) + n;
      if (s.lastStudyDay !== today) {
        s.streak = s.lastStudyDay === dayKey(y) ? (s.streak || 0) + 1 : 1;
        s.lastStudyDay = today;
      }
      Studio.store.set('stats', s, { defer: true });
      Studio.bus.emit('stats:changed', s);
      return s;
    },
    addXp: function (n) {
      var s = loadStats(); s.xp = (s.xp || 0) + (n || 0);
      Studio.store.set('stats', s, { defer: true }); Studio.bus.emit('stats:changed', s); return s.xp;
    },
    /* série réellement en cours (0 si le dernier jour d'étude est plus vieux qu'hier) */
    currentStreak: function () {
      var s = loadStats(), y = new Date(); y.setDate(y.getDate() - 1);
      return (s.lastStudyDay === dayKey() || s.lastStudyDay === dayKey(y)) ? (s.streak || 0) : 0;
    },
    addQuizScore: function (score) {
      var s = loadStats(); s.quizScores = (s.quizScores || []).concat([score]).slice(-200);
      Studio.store.set('stats', s, { defer: true }); Studio.bus.emit('stats:changed', s);
    }
  };
})();
