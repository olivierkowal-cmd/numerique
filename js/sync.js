/* Studio — sauvegarde des données d'étude de l'élève sur le serveur (chargerEtude / sauvegarderEtude).
   Partie 1 : logique pure, testable sous node (Studio.syncLogic).
   Partie 2 : branchement (store, événements, indicateur « sauvegardé »), seulement dans un navigateur et après connexion.
   Règle d'or : les données restent TOUJOURS d'abord dans le navigateur (localStorage, une clé par élève) ; le serveur en reçoit une copie.
   Un échec réseau ne perd donc jamais rien : on réessaie plus tard. Seul google.script.run (via Studio.server) est utilisé. */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var Studio = root.Studio = root.Studio || {};

  /* ======================= 1. LOGIQUE PURE ======================= */
  /* Réglages qui ne partent JAMAIS sur le serveur : clé IA, fournisseur, consentement IA. */
  var STRIP_SETTINGS = ['apiKey', 'provider', 'model', 'aiConsent'];
  var IGNORE_FOR_HAS = ['onboarded', 'settings', 'activeDoc', 'lastNav', 'todaySession'];
  var MAX_CHARS = 850000;   /* le serveur refuse au-delà de 900 000 caractères (MAX_ETUDE dans Code.gs) */

  function cleanForCloud(data) {
    var out = {};
    Object.keys(data || {}).forEach(function (k) { out[k] = data[k]; });
    if (out.settings && typeof out.settings === 'object') {
      var s = {};
      Object.keys(out.settings).forEach(function (k) { if (STRIP_SETTINGS.indexOf(k) < 0) s[k] = out.settings[k]; });
      out.settings = s;
    }
    return out;
  }
  function xpForLevel(L) { L = Math.max(1, Math.floor(L)); return 40 * (L - 1) + 10 * (L - 1) * (L - 2); }   /* identique à game.js */
  function levelFromXp(xp) { xp = Math.max(0, Math.floor(+xp || 0)); var L = 1; while (xpForLevel(L + 1) <= xp) L++; return L; }
  function summaryFrom(data, over) {
    data = data || {}; over = over || {};
    var st = data.stats || {}, xp = Math.max(0, Math.floor(+st.xp || 0));
    var cards = (Array.isArray(data.decks) ? data.decks : []).reduce(function (a, d) { return a + ((d && d.cards) ? d.cards.length : 0); }, 0);
    var streak = over.streak != null ? over.streak : (data.game && data.game.streak && data.game.streak.count != null ? data.game.streak.count : (st.streak || 0));
    return { xp: xp, level: over.level != null ? over.level : levelFromXp(xp), streak: Math.max(0, Math.floor(+streak || 0)), cards: cards };
  }
  /* Construit le texte envoyé au serveur. Si c'est trop gros, on retire d'abord le texte des cours (les cartes et la progression restent). */
  function buildPayload(data, now, over, limit) {
    limit = limit || MAX_CHARS;
    var clean = cleanForCloud(data), omitted = [];
    function make() { return JSON.stringify({ app: 'studio-etude', v: 1, savedAt: now, summary: summaryFrom(data, over), omitted: omitted, data: clean }); }
    var json = make();
    if (json.length > limit && clean.docs) { omitted.push('docs'); delete clean.docs; json = make(); }
    return { json: json, omitted: omitted, tooBig: json.length > limit };
  }
  function parseRemote(text) {
    if (!text || typeof text !== 'string') return null;
    try {
      var o = JSON.parse(text);
      if (o && o.app === 'studio-etude' && o.data && typeof o.data === 'object') return o;
    } catch (e) { /* texte illisible : on l'ignore, le local reste */ }
    return null;
  }
  function hasData(data) {
    return Object.keys(data || {}).some(function (k) {
      if (IGNORE_FOR_HAS.indexOf(k) >= 0) return false;
      var v = data[k];
      if (v == null) return false;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'object') return Object.keys(v).length > 0;
      return !!v;
    });
  }
  /* Que faire au démarrage ? 'pull' = prendre la copie du serveur, 'push' = envoyer le local, 'keep' = déjà à jour, 'none' = rien à faire. */
  function decideMerge(localHas, remote, meta) {
    meta = meta || {};
    var rHas = !!(remote && remote.data && hasData(remote.data));
    if (!rHas) return localHas ? 'push' : 'none';
    if (!localHas) return 'pull';
    if (meta.dirty) return 'push';                                   /* des changements n'ont pas encore été envoyés : le local gagne */
    return (remote.savedAt || 0) > (meta.lastSyncedAt || 0) ? 'pull' : 'keep';
  }

  /* Anti-rebond de sauvegarde. opts : { delay (15 s), maxWait (60 s), retry [15 s, 30 s, 60 s, 120 s], save() -> Promise,
     now(), setTimer(fn, ms), clearTimer(id), onStatus(statut, info) }.  Statuts : 'pending', 'saving', 'saved', 'error'.
     - markDirty() : un changement a eu lieu ; la sauvegarde partira delay ms après le DERNIER changement (au plus tard maxWait après le premier).
     - flush() : sauvegarde tout de suite (fermeture, changement d'onglet, bouton « Réessayer »).
     - échec : dirty reste vrai, nouvel essai plus tard (délais croissants) ; rien n'est perdu. */
  function createSaver(opts) {
    var delay = opts.delay != null ? opts.delay : 15000, maxWait = opts.maxWait != null ? opts.maxWait : 60000;
    var retry = opts.retry || [15000, 30000, 60000, 120000];
    var now = opts.now || function () { return Date.now(); };
    var setT = opts.setTimer || function (f, ms) { return setTimeout(f, ms); };
    var clearT = opts.clearTimer || function (id) { clearTimeout(id); };
    var st = { dirty: false, inflight: false, timer: null, firstDirty: 0, failures: 0, status: 'saved', lastError: '' };
    function status(s, info) { st.status = s; if (opts.onStatus) { try { opts.onStatus(s, info || {}); } catch (e) { /* l'affichage ne doit jamais bloquer */ } } }
    function schedule(ms, isRetry) {
      if (st.timer != null) { clearT(st.timer); st.timer = null; }
      var cap = (st.firstDirty && !isRetry) ? Math.max(0, maxWait - (now() - st.firstDirty)) : ms;   /* le plafond de 60 s vaut pour l'attente normale, pas pour les réessais après un échec */
      st.timer = setT(function () { st.timer = null; run(); }, Math.min(ms, cap));
    }
    function run() {
      if (st.inflight || !st.dirty) return Promise.resolve(false);
      if (st.timer != null) { clearT(st.timer); st.timer = null; }
      st.inflight = true; st.dirty = false; st.firstDirty = 0;
      status('saving');
      var p;
      try { p = Promise.resolve(opts.save()); } catch (e) { p = Promise.reject(e); }
      return p.then(function (r) {
        st.inflight = false; st.failures = 0; st.lastError = '';
        if (st.dirty) { status('pending'); schedule(delay); } else status('saved', r || {});
        return true;
      }, function (e) {
        st.inflight = false; st.dirty = true; st.failures++; st.lastError = (e && e.message) || 'Erreur';
        if (!st.firstDirty) st.firstDirty = now();
        var wait = retry[Math.min(st.failures - 1, retry.length - 1)];
        status('error', { message: st.lastError, retryIn: wait, failures: st.failures });
        schedule(wait, true);
        return false;
      });
    }
    return {
      markDirty: function () {
        st.dirty = true;
        if (!st.firstDirty) st.firstDirty = now();
        if (st.inflight) return;
        if (st.status !== 'error') status('pending');
        if (st.status === 'error') schedule(retry[Math.min(Math.max(st.failures - 1, 0), retry.length - 1)], true); else schedule(delay);
      },
      flush: function () { if (st.timer != null) { clearT(st.timer); st.timer = null; } return run(); },
      state: function () { return { dirty: st.dirty, inflight: st.inflight, failures: st.failures, status: st.status, lastError: st.lastError, hasTimer: st.timer != null }; }
    };
  }

  Studio.syncLogic = { cleanForCloud: cleanForCloud, summaryFrom: summaryFrom, buildPayload: buildPayload, parseRemote: parseRemote, hasData: hasData,
    decideMerge: decideMerge, createSaver: createSaver, levelFromXp: levelFromXp, STRIP_SETTINGS: STRIP_SETTINGS, MAX_CHARS: MAX_CHARS };
  if (typeof module !== 'undefined' && module.exports) module.exports = Studio.syncLogic;
  if (typeof document === 'undefined' || !Studio.store || !Studio.keyNames) return;

  /* ======================= 2. BRANCHEMENT (navigateur) ======================= */
  var L = Studio.syncLogic;
  var session = null, saver = null, metaKey = '', meta = { dirty: false, lastSyncedAt: 0 }, active = false, lastHeure = '', lastKind = 'saved';

  function lsGet(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { root.localStorage.setItem(k, v); } catch (e) { /* quota : la sauvegarde serveur réessaiera */ } }
  function readMeta() { try { var o = JSON.parse(lsGet(metaKey) || '{}'); meta = { dirty: !!o.dirty, lastSyncedAt: +o.lastSyncedAt || 0 }; } catch (e) { meta = { dirty: false, lastSyncedAt: 0 }; } }
  function writeMeta() { lsSet(metaKey, JSON.stringify(meta)); }
  function snapshot() {
    try { Studio.store.flush(); } catch (e) { /* ignore */ }
    var all = Studio.store.exportAll(false);
    var over = {};
    try { if (Studio.game && Studio.game.streak) over.streak = Studio.game.streak().count; if (Studio.game && Studio.game.level) over.level = Studio.game.level().level; } catch (e) { /* ignore */ }
    var now = Date.now(), p = L.buildPayload(all.data, now, over);
    return { json: p.json, savedAt: now, omitted: p.omitted, tooBig: p.tooBig };
  }
  function doSave() {
    var snap = snapshot();
    if (snap.tooBig) return Promise.reject(new Error('Tes données sont trop grosses pour être sauvegardées. Supprime de vieux cours.'));
    return Studio.server.call('sauvegarderEtude', session.jeton, snap.json).then(function (r) {
      meta.lastSyncedAt = snap.savedAt; meta.dirty = false; writeMeta();
      return { heure: (r && r.heure) || '' };
    });
  }
  function render(kind, info) {
    lastKind = kind;
    if (kind === 'saved' && info && info.heure) lastHeure = info.heure;
    var box = document.getElementById('sync-status');
    if (!box) return;
    var txt = '', cls = 'sync-' + kind;
    if (kind === 'saved') txt = '☁️ Sauvegardé' + (lastHeure ? ' à ' + lastHeure : '');
    else if (kind === 'pending') txt = '☁️ Sauvegarde bientôt…';
    else if (kind === 'saving') txt = '☁️ Sauvegarde…';
    else txt = '⚠️ Pas de connexion. On réessaie. Rien n’est perdu.';
    box.className = 'sync-status ' + cls;
    box.textContent = txt;
    if (kind === 'error') {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'sync-retry'; b.textContent = 'Réessayer';
      b.addEventListener('click', function () { Studio.sync.saveNow(); });
      box.appendChild(b);
    }
  }
  function onStatus(kind, info) { if (kind === 'error') { /* le fichier local est intact */ } render(kind, info); }

  function makeSaver() {
    saver = L.createSaver({ save: doSave, onStatus: onStatus });
  }
  function markDirty() {
    if (!active || !saver) return;
    if (!meta.dirty) { meta.dirty = true; writeMeta(); }
    saver.markDirty();
  }

  Studio.sync = {
    state: function () { return saver ? saver.state() : null; },
    meta: function () { return Object.assign({}, meta); },
    /* Appelé juste après core.js + sync.js, AVANT le chargement des autres modules (le jeu lit ses données au chargement). */
    init: function (sess, serverText, opts) {
      session = sess; metaKey = 'studio-sync|' + Studio.keyNames(sess.email).user; readMeta();
      var remote = L.parseRemote(serverText);
      var localData = Studio.store.exportAll(false).data;
      var decision = (opts && opts.serverUnknown) ? (meta.dirty ? 'push' : 'keep') : L.decideMerge(L.hasData(localData), remote, meta);   /* serveur injoignable : on ne touche à rien, on réessaiera */
      if (decision === 'pull') {
        var keep = {};
        (remote.omitted || []).forEach(function (k) { if (localData[k] !== undefined) keep[k] = localData[k]; });
        try {
          Studio.store.importAll({ app: 'studio', version: 1, data: Object.assign({}, remote.data, keep) });
          meta.lastSyncedAt = remote.savedAt || Date.now(); meta.dirty = false; writeMeta();
        } catch (e) { decision = 'keep'; }
      }
      Studio.sync.decision = decision;
      return decision;
    },
    /* Branche la sauvegarde automatique (après le chargement complet de Studio). */
    start: function () {
      if (active || !session) return;
      active = true; makeSaver();
      var rawSet = Studio.store.set;
      Studio.store.set = function (key) {
        var r = rawSet.apply(Studio.store, arguments);
        if (key !== 'lastNav' && key !== 'todaySession') markDirty();
        return r;
      };
      ['decks:changed', 'docs:changed', 'stats:changed'].forEach(function (e) { Studio.bus.on(e, markDirty); });
      function flushNow() { if (saver && meta.dirty) saver.flush(); }
      document.addEventListener('visibilitychange', function () { if (document.hidden || document.visibilityState === 'hidden') flushNow(); });
      root.addEventListener('pagehide', flushNow);
      root.addEventListener('online', flushNow);
      if (Studio.sync.decision === 'push' || meta.dirty) { meta.dirty = true; writeMeta(); saver.markDirty(); }
      else render('saved', {});
    },
    saveNow: function () { if (!saver) return Promise.resolve(false); meta.dirty = true; writeMeta(); saver.markDirty(); return saver.flush(); },
    flush: function () { return saver && meta.dirty ? saver.flush() : Promise.resolve(false); }
  };
})();
