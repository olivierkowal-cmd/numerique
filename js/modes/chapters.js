/* Studio — chapitres du site (Chapitre 1 à 4, Évaluations, Bonus) : pages, exercices, chapitres ouverts par le prof, progression.
   Reprend la logique de l'ancien Index.html du site (chargement des exercices par morceaux + injection, messages des exercices, Défis Docs).
   Partie 1 : logique pure (Studio.chaptersLogic, testable sous node). Partie 2 : pages et branchement (Studio.chapters).
   Données de la plateforme : Studio.platform = { jeton, eleve, chapitres, progression, defis, isProf(), refresh() } (posé par js/boot.js). */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var Studio = root.Studio = root.Studio || {};

  /* ======================= 1. LOGIQUE PURE ======================= */
  var LOCK_TEXT = 'Ton prof ouvrira ce chapitre bientôt';

  /* Structure du site (identique à l'ancien PAGES de Index.html). */
  var EXOS = {
    'gestion-boite-mail': { titre: 'Gestion boîte mail', chapitre: 'chapitre-1' },
    'tuto-docs': { titre: 'Tuto Docs', bouton: 'Tuto Google Docs', chapitre: 'chapitre-2' },
    'defis-docs': { titre: 'Défis Docs', chapitre: 'chapitre-2' },
    'creer-sa-cover': { titre: 'Créer sa cover', chapitre: 'chapitre-2', type: 'cover', suivi: false },
    'gestion-fichiers': { titre: 'Gestion fichiers', bouton: 'Gestion des fichiers', chapitre: 'chapitre-3' },
    'taille-des-fichiers': { titre: 'Taille des fichiers', chapitre: 'chapitre-3' },
    'stockage-et-espace': { titre: 'Stockage et espace', chapitre: 'chapitre-3' },
    'binaire': { titre: 'Binaire', bouton: 'Mon prénom en binaire', chapitre: 'chapitre-3' },
    'quiz-hardware': { titre: 'Quiz - Hardware', chapitre: 'chapitre-4' },
    'escape-game': { titre: 'Escape game', chapitre: 'bonus' },
    'balade-ism': { titre: 'Balade à l\'ISM', chapitre: 'bonus' }
  };
  var CHAPTERS = [
    { id: 'chapitre-1', titre: 'Chapitre 1', long: 'Chapitre 1 - Gestion de la boîte mail', img: 'ch1', icon: '📧', exos: ['gestion-boite-mail'] },
    { id: 'chapitre-2', titre: 'Chapitre 2', long: 'Chapitre 2 - Le traitement de texte', img: 'ch2', icon: '📝', exos: ['tuto-docs', 'defis-docs', 'creer-sa-cover'] },
    { id: 'chapitre-3', titre: 'Chapitre 3', long: 'Chapitre 3 - La gestion des fichiers', img: 'ch3', icon: '🗂️', exos: ['gestion-fichiers', 'taille-des-fichiers', 'stockage-et-espace', 'binaire'] },
    { id: 'chapitre-4', titre: 'Chapitre 4', long: 'Chapitre 4 - Hardware et software', img: 'ch4', icon: '💻', exos: ['quiz-hardware'] },
    { id: 'evaluations', titre: 'Évaluations', long: 'Évaluations', img: 'evals', icon: '🎓', exos: [], evals: true },
    { id: 'bonus', titre: 'Bonus', long: 'Bonus', img: 'bonus', icon: '🎁', exos: ['escape-game', 'balade-ism'] }
  ];
  Object.keys(EXOS).forEach(function (k) { EXOS[k].id = k; });

  function chapterById(id) { for (var i = 0; i < CHAPTERS.length; i++) if (CHAPTERS[i].id === id) return CHAPTERS[i]; return null; }
  function exoById(id) { return EXOS[id] || null; }
  function isTracked(id) { var e = EXOS[id]; return !!e && e.suivi !== false && e.type !== 'cover'; }

  /* État « réel » d'ouverture pour les élèves. Pour le prof, le serveur met ouvert=true partout et donne l'état réel dans ouvertEleves. */
  function realOpen(c) { if (!c) return false; return c.ouvertEleves !== undefined && c.ouvertEleves !== null ? !!c.ouvertEleves : !!c.ouvert; }
  function findChapter(chapitres, id) { for (var i = 0; i < (chapitres || []).length; i++) if (chapitres[i] && chapitres[i].id === id) return chapitres[i]; return null; }
  /* Un chapitre est fermé pour un élève s'il n'est pas explicitement ouvert (donnée absente = fermé : on ne montre rien par erreur). Le prof ne voit jamais de verrou. */
  function isLocked(chapterId, chapitres, isProf) {
    if (isProf) return false;
    var c = findChapter(chapitres, chapterId);
    return !(c && c.ouvert === true);
  }
  function exoStatus(id, progression) { var p = progression && progression[id]; return p && (p.statut === 'fait' || p.statut === 'ouvert') ? p.statut : ''; }
  function counts(chapterId, progression) {
    var ch = chapterById(chapterId), total = 0, fait = 0;
    if (!ch) return { fait: 0, total: 0 };
    ch.exos.forEach(function (id) { if (isTracked(id)) { total++; if (exoStatus(id, progression) === 'fait') fait++; } });
    return { fait: fait, total: total };
  }
  function totalCounts(progression) {
    var t = 0, f = 0;
    CHAPTERS.forEach(function (c) { var n = counts(c.id, progression); t += n.total; f += n.fait; });
    return { fait: f, total: t };
  }

  /* Identifiant de page du site (anciens liens #page=…) -> route Studio. */
  function slug(t) {
    try { t = decodeURIComponent(t); } catch (e) { /* tel quel */ }
    t = String(t == null ? '' : t).split('?')[0].split('#')[0].replace(/^\/+|\/+$/g, '').split('/').pop();
    t = t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\.html$/, '');
    var alias = { 'balade-a-lism': 'balade-ism', 'balade-a-l-ism': 'balade-ism', 'quiz---hardware': 'quiz-hardware' };
    return alias[t] || t;
  }
  function resolveRoute(page) {
    var id = slug(page);
    if (id === 'accueil' || id === '' || id === 'today') return { module: 'today' };
    if (id === 'compte' || id === 'account') return { module: 'account' };
    if (chapterById(id)) return { module: id };
    if (EXOS[id]) return { module: EXOS[id].chapitre, params: { exo: id } };
    return { module: 'today' };
  }

  /* Script ajouté dans chaque exercice pour que ses liens #page=… naviguent dans la plateforme (repris tel quel du site). */
  /* Script ajouté dans chaque exercice : (1) ses liens #page=… naviguent dans la plateforme ; (2) il signale à la page qu'on y travaille (pas de déconnexion
     pour inactivité pendant un exercice). Tout passe par parent.postMessage. */
  var SCRIPT_NAV = '<scr' + 'ipt>(function(){document.addEventListener("click",function(e){var a=e.target&&e.target.closest?e.target.closest("a"):null;if(!a)return;var h=a.getAttribute("href")||"";if(h.indexOf("#page=")===0){e.preventDefault();e.stopPropagation();parent.postMessage({fnNav:h.slice(6)},"*");}},true);var t=0;["pointerdown","keydown","touchstart"].forEach(function(n){document.addEventListener(n,function(){var d=Date.now();if(d-t>10000){t=d;try{parent.postMessage({fnActif:1},"*");}catch(x){}}},true);});})();</scr' + 'ipt>';
  /* Exercices dans une iframe SANS allow-same-origin : ils n'ont donc pas de localStorage propre (accès refusé). Ce petit script le remplace par
     une copie en mémoire, préremplie par la page (clés de cet élève et de cet exercice) et enregistrée par la page via postMessage. */
  function scriptStockage(initial) {
    var init = JSON.stringify(initial || {}).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    return '<scr' + 'ipt>(function(){try{window.localStorage.getItem("fn_probe");return;}catch(e){}var d=' + init + ';function s(m){try{parent.postMessage(m,"*");}catch(x){}}' +
      'var L={getItem:function(k){k=String(k);return Object.prototype.hasOwnProperty.call(d,k)?d[k]:null;},setItem:function(k,v){k=String(k);v=String(v);d[k]=v;s({fnLs:"set",k:k,v:v});},' +
      'removeItem:function(k){k=String(k);delete d[k];s({fnLs:"del",k:k});},clear:function(){d={};s({fnLs:"clear"});},key:function(i){var a=Object.keys(d);return i<a.length?a[i]:null;}};' +
      'Object.defineProperty(L,"length",{get:function(){return Object.keys(d).length;}});' +
      'try{Object.defineProperty(window,"localStorage",{configurable:true,get:function(){return L;}});}catch(e){}})();</scr' + 'ipt>';
  }
  /* opts.stockage (objet) : si présent, ajoute le faux localStorage préenregistré (exercice en iframe sandbox). */
  function injecter(html, opts) {
    var ajout = SCRIPT_NAV + (opts && opts.stockage ? scriptStockage(opts.stockage) : '');
    var m = html.match(/<head[^>]*>/i);
    if (m) return html.replace(m[0], function () { return m[0] + ajout; });
    var d = html.match(/<!doctype[^>]*>/i);
    if (d) return html.replace(d[0], function () { return d[0] + ajout; });
    return ajout + html;
  }
  /* Réglages de l'iframe d'exercice. Pas de allow-same-origin : l'exercice reçoit une origine « opaque » et ne peut lire ni le jeton de session,
     ni les données Studio, ni le localStorage de la page. allow-modals (alert/confirm), allow-popups(+escape) (liens vers l'extérieur), allow-downloads. */
  var SANDBOX = 'allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-downloads';
  var LS_MAX_TOTAL = 200000, LS_MAX_KEY = 120;
  /* Applique un message {fnLs:…} de l'exercice à l'objet de stockage de cet élève ; renvoie le nouvel objet (ou null si refusé). */
  function applyLsMessage(store, d) {
    var out = Object.assign({}, store || {});
    if (d.fnLs === 'clear') return {};
    if (typeof d.k !== 'string' || !d.k || d.k.length > LS_MAX_KEY) return null;
    if (d.fnLs === 'del') { delete out[d.k]; return out; }
    if (d.fnLs !== 'set' || typeof d.v !== 'string') return null;
    out[d.k] = d.v;
    var total = 0; Object.keys(out).forEach(function (k) { total += k.length + out[k].length; });
    return total > LS_MAX_TOTAL ? null : out;
  }

  /* File d'attente des notes de progression non envoyées (échec réseau) : un seul élément par exercice, « fait » l'emporte sur « ouvert ». */
  function mergePending(queue, item) {
    var out = [], found = false;
    (queue || []).forEach(function (q) {
      if (q.exoId !== item.exoId) { out.push(q); return; }
      found = true;
      if (q.statut === 'fait' && item.statut !== 'fait') out.push(q);
      else out.push({ exoId: item.exoId, statut: item.statut, score: item.score != null ? item.score : q.score });
    });
    if (!found) out.push({ exoId: item.exoId, statut: item.statut, score: item.score });
    return out;
  }
  function applyLocal(progression, exoId, statut, score, date) {
    var p = Object.assign({}, progression || {}), cur = p[exoId];
    if (cur && cur.statut === 'fait' && statut !== 'fait') return p;
    p[exoId] = { statut: statut, date: date || '' };
    if (score != null) p[exoId].score = score;
    return p;
  }

  Studio.chaptersLogic = { LOCK_TEXT: LOCK_TEXT, CHAPTERS: CHAPTERS, EXOS: EXOS, chapterById: chapterById, exoById: exoById, isTracked: isTracked, realOpen: realOpen,
    findChapter: findChapter, isLocked: isLocked, exoStatus: exoStatus, counts: counts, totalCounts: totalCounts, slug: slug, resolveRoute: resolveRoute,
    injecter: injecter, SCRIPT_NAV: SCRIPT_NAV, scriptStockage: scriptStockage, applyLsMessage: applyLsMessage, SANDBOX: SANDBOX, mergePending: mergePending, applyLocal: applyLocal };
  if (typeof module !== 'undefined' && module.exports) module.exports = Studio.chaptersLogic;
  if (typeof document === 'undefined' || typeof Studio.register !== 'function') return;

  /* ======================= 2. PAGES ======================= */
  var el = function () { return Studio.ui.el.apply(null, arguments); };
  function toast(m, t) { if (Studio.ui && Studio.ui.toast) Studio.ui.toast(m, t); }
  function P() { return Studio.platform || { chapitres: [], progression: {}, eleve: {}, isProf: function () { return false; }, refresh: function () { return Promise.resolve(); } }; }
  function isProf() { try { return !!P().isProf(); } catch (e) { return false; } }
  function images() { return root.IMAGES || {}; }
  function cfg() { return root.CONFIG || {}; }
  function srv(fn) { var a = Array.prototype.slice.call(arguments, 1); return Studio.server.call.apply(Studio.server, [fn, P().jeton].concat(a)); }
  function plural(n, s, p) { return n + ' ' + (n > 1 ? (p || s + 's') : s); }

  /* ---------- progression : envoi avec file d'attente en cas d'échec ---------- */
  var pending = [], pendingKey = '';
  function loadPending() {
    pendingKey = 'fn_pending|' + Studio.keyNames(P().eleve && P().eleve.email).user;
    try { pending = JSON.parse(root.localStorage.getItem(pendingKey) || '[]') || []; } catch (e) { pending = []; }
  }
  function savePending() { try { root.localStorage.setItem(pendingKey, JSON.stringify(pending)); } catch (e) { /* ignore */ } }
  var flushing = false;
  function flushPending() {
    if (flushing || !pending.length || !P().jeton) return Promise.resolve();
    flushing = true;
    var item = pending[0];
    return srv('noterProgression', item.exoId, item.statut, item.score).then(function () {
      pending = pending.filter(function (q) { return !(q.exoId === item.exoId && q.statut === item.statut); }); savePending(); flushing = false;
      return flushPending();
    }, function () { flushing = false; });
  }
  /* note(exoId, 'ouvert'|'fait', score) : met à jour tout de suite l'affichage, puis envoie. Renvoie une promesse { sent: bool }. */
  function note(exoId, statut, score) {
    if (!isTracked(exoId)) return Promise.resolve({ sent: false });
    var plat = P();
    plat.progression = applyLocal(plat.progression, exoId, statut, score, '');
    return srv('noterProgression', exoId, statut, score).then(function () { return { sent: true }; }, function (err) {
      if (err && err.expired) return { sent: false };
      pending = mergePending(pending, { exoId: exoId, statut: statut, score: score }); savePending();
      return { sent: false, queued: true };
    });
  }

  /* ---------- helpers d'affichage ---------- */
  function filAriane(items) {
    var nav = el('nav', { class: 'chap-fil', 'aria-label': 'Fil d’Ariane' });
    items.forEach(function (it, i) {
      if (i) nav.appendChild(document.createTextNode(' › '));
      if (it.go) nav.appendChild(el('a', { href: it.go }, it.label)); else nav.appendChild(el('b', { 'aria-current': 'page' }, it.label));
    });
    return nav;
  }
  function chapterImg(ch, cls) {
    var src = images()[ch.img];
    return src ? el('img', { class: cls || 'chap-img', src: src, alt: '', loading: 'lazy', decoding: 'async' }) : el('div', { class: (cls || 'chap-img') + ' chap-img-fallback', 'aria-hidden': 'true' }, ch.icon);
  }
  function exoLabel(id) { var e = EXOS[id]; return e.bouton || e.titre; }
  function statusMark(id) {
    var s = exoStatus(id, P().progression);
    return s === 'fait' ? el('span', { class: 'chap-mark chap-mark-fait', title: 'Terminé' }, ' ✓') : s === 'ouvert' ? el('span', { class: 'chap-mark', title: 'Déjà ouvert' }, ' ·') : null;
  }
  function exoButton(ch, id, locked) {
    if (locked) return el('button', { type: 'button', class: 'chap-exo chap-exo-locked', disabled: true, 'aria-disabled': 'true', title: LOCK_TEXT }, '🔒 ' + exoLabel(id));
    return el('a', { class: 'chap-exo', href: '#/' + ch.id + '?exo=' + encodeURIComponent(id) }, exoLabel(id), statusMark(id));
  }
  function lockedNote() { return el('p', { class: 'chap-lock', role: 'status' }, '🔒 ' + LOCK_TEXT); }
  function profNote(ch) {
    var c = findChapter(P().chapitres, ch.id);
    return isProf() && !realOpen(c) ? el('p', { class: 'chap-prof-note' }, '🧑‍🏫 Fermé pour les élèves. Tu le vois car tu es prof (ouvre-le dans « Espace prof »).') : null;
  }

  /* Rafraîchit l'état des chapitres en arrière-plan ; redessine si quelque chose a changé. */
  function sig() { return JSON.stringify([P().chapitres, P().progression]); }
  function backgroundRefresh(token, getToken) {
    var before = sig();
    Promise.resolve(P().refresh()).then(function () {
      if (getToken() === token && sig() !== before) Studio.refresh();
    }, function () { /* hors connexion : on garde ce qu'on a */ });
  }

  /* ---------- page d'un chapitre ---------- */
  var renderToken = 0;
  function renderChapter(container, ctx, ch) {
    var tok = ++renderToken;
    var params = (ctx && ctx.params) || {};
    var locked = isLocked(ch.id, P().chapitres, isProf());
    if (params.exo && EXOS[params.exo] && EXOS[params.exo].chapitre === ch.id && !locked) return renderExo(container, ch, EXOS[params.exo], tok);
    if (ch.evals) return renderEvals(container, ch, locked, tok);

    var cnt = counts(ch.id, P().progression);
    var info = el('div', { class: 'chap-info' },
      el('h1', null, (locked ? '🔒 ' : '') + ch.long),
      locked ? lockedNote() : (cnt.total ? el('p', { class: 'chap-count' }, cnt.fait + ' sur ' + plural(cnt.total, 'exercice') + ' terminé' + (cnt.fait > 1 ? 's' : '')) : null),
      profNote(ch),
      el('h2', { class: 'chap-sub' }, 'Les exercices du chapitre'),
      el('div', { class: 'chap-exos' }, ch.exos.map(function (id) { return exoButton(ch, id, locked); })));
    container.appendChild(el('div', { class: 'chap-page' },
      filAriane([{ label: 'Accueil', go: '#/today' }, { label: ch.titre }]),
      el('div', { class: 'chap-card' + (locked ? ' is-locked' : '') }, chapterImg(ch), info)));
    backgroundRefresh(tok, function () { return renderToken; });
  }

  function renderEvals(container, ch, locked, tok) {
    var list = cfg().evaluations || [];
    var body;
    if (locked) body = el('div', { class: 'chap-card is-locked' }, chapterImg(ch), el('div', { class: 'chap-info' }, el('h1', null, '🔒 ' + ch.long), lockedNote()));
    else body = el('div', { class: 'chap-evals' }, list.length ? list.map(function (ev) {
      return el('div', { class: 'card chap-eval' }, el('h2', null, ev.titre),
        ev.url ? el('a', { class: 'btn btn-primary btn-lg', href: ev.url, target: '_blank', rel: 'noopener' }, 'Commencer l’évaluation ↗')
               : el('div', null, el('span', { class: 'badge badge-sun' }, 'Bientôt disponible'), el('p', { class: 'muted' }, 'Ton professeur ouvrira cette évaluation en classe.')));
    }) : el('p', { class: 'muted' }, 'Aucune évaluation pour le moment.'));
    container.appendChild(el('div', { class: 'chap-page' }, filAriane([{ label: 'Accueil', go: '#/today' }, { label: ch.titre }]),
      locked ? null : el('h1', null, 'Évaluations'), profNote(ch), body));
    backgroundRefresh(tok, function () { return renderToken; });
  }

  /* ---------- page d'un exercice ---------- */
  var cacheExos = {};
  /* Petit stockage propre à l'exercice (ex. cases cochées du Tuto Docs, partie en cours de l'Escape game), rangé par élève dans l'appareil. */
  function lsKey(id) { return 'fn_ex|' + Studio.keyNames(P().eleve && P().eleve.email).user + '|' + id; }
  function lsRead(id) { try { return JSON.parse(root.localStorage.getItem(lsKey(id)) || '{}') || {}; } catch (e) { return {}; } }
  function lsWrite(id, obj) { try { root.localStorage.setItem(lsKey(id), JSON.stringify(obj)); } catch (e) { /* ignore */ } }
  function chargerCodeExo(id) {
    if (cacheExos[id]) return Promise.resolve(cacheExos[id]);
    return srv('chargerExercice', id, 0).then(function (premier) {
      var morceaux = [premier.data], reste = [];
      for (var i = 1; i < (premier.total || 1); i++) reste.push(srv('chargerExercice', id, i));
      return Promise.all(reste).then(function (suite) {
        suite.forEach(function (r) { morceaux.push(r.data); });
        cacheExos[id] = morceaux.join('');      /* code brut : le script de stockage est ajouté à chaque ouverture (valeurs à jour) */
        return cacheExos[id];
      });
    });
  }
  function coverPage() {
    var I = images();
    function box(t, kids) { return el('div', { class: 'card chap-box' }, t ? el('h2', null, t) : null, kids); }
    return el('div', { class: 'chap-cover' },
      box(null, el('p', { class: 'chap-big' }, 'Cette page rassemble des éléments dont tu pourrais avoir besoin pour créer la cover de ton jeu vidéo.')),
      box('Les différentes catégories PEGI', I.pegi ? el('img', { src: I.pegi, alt: 'Logos PEGI', class: 'chap-wide', loading: 'lazy', decoding: 'async' }) : null),
      box('Quelques exemples', I.jeux ? el('img', { src: I.jeux, alt: 'Exemples de jaquettes de jeux vidéo', class: 'chap-wide', loading: 'lazy', decoding: 'async' }) : null),
      box('Exemple de mention légale', el('div', { class: 'chap-mention', html: '© 2026 GAMESTUDIO ENTERTAINMENT. Tous droits réservés.<br>GAMESTUDIO et le logo GAMESTUDIO sont des marques déposées de GAMESTUDIO ENTERTAINMENT.<br>Ce jeu est protégé par les lois internationales sur le droit d’auteur. Toute reproduction, distribution ou modification non autorisée de ce produit est strictement interdite.<br>Développé par GAMESTUDIO STUDIOS' })));
  }

  function renderExo(container, ch, exo, tok) {
    var fil = filAriane([{ label: 'Accueil', go: '#/today' }, { label: ch.titre, go: '#/' + ch.id }, { label: exo.titre }]);
    if (exo.type === 'cover') { container.appendChild(el('div', { class: 'chap-page' }, fil, coverPage())); return; }

    var doneBox = el('span', { class: 'chap-done' });
    function drawDone() {
      Studio.ui.clear(doneBox);
      if (exoStatus(exo.id, P().progression) === 'fait') { doneBox.appendChild(el('span', { class: 'badge badge-mint', role: 'status' }, '✓ Terminé')); return; }
      if (exo.id === 'defis-docs') return;   /* les Défis Docs signalent eux-mêmes la réussite (mission finale) */
      doneBox.appendChild(el('button', { type: 'button', class: 'btn btn-ghost chap-done-btn', onclick: function () {
        note(exo.id, 'fait').then(function (r) {
          drawDone();
          toast(r.sent ? 'Bravo, exercice terminé ! ✓' : 'Noté ici. On l’enverra à ton prof dès que la connexion revient.', r.sent ? 'success' : 'info');
          if (r.sent && Studio.bus) Studio.bus.emit('progress:changed', {});
        });
      } }, '✓ J’ai terminé'));
    }
    var cadre = el('div', { class: 'chap-frame', id: 'cadre' }, el('div', { class: 'chap-loading', role: 'status' }, el('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Chargement de « ' + exo.titre + ' »…'));
    container.appendChild(el('div', { class: 'chap-page chap-page-exo' }, el('div', { class: 'chap-bar' }, fil, doneBox), cadre));
    drawDone();

    var wasNew = !exoStatus(exo.id, P().progression);
    if (wasNew) note(exo.id, 'ouvert');
    function load() {
      Studio.ui.clear(cadre);
      cadre.appendChild(el('div', { class: 'chap-loading', role: 'status' }, el('span', { class: 'spinner', 'aria-hidden': 'true' }), 'Chargement de « ' + exo.titre + ' »…'));
      chargerCodeExo(exo.id).then(function (html) {
        if (tok !== renderToken || !cadre.isConnected) return;
        var f = document.createElement('iframe');
        f.id = 'iframe-exo'; f.title = exo.titre; f.setAttribute('data-exo', exo.id);
        f.setAttribute('allow', 'fullscreen; clipboard-write; autoplay');
        f.setAttribute('allowfullscreen', '');
        f.setAttribute('sandbox', SANDBOX);
        f.setAttribute('referrerpolicy', 'no-referrer');
        f.srcdoc = injecter(html, { stockage: lsRead(exo.id) });
        Studio.ui.clear(cadre); cadre.appendChild(f);
      }, function (err) {
        if (tok !== renderToken || !cadre.isConnected) return;
        Studio.ui.clear(cadre);
        cadre.appendChild(el('div', { class: 'chap-loading chap-error', role: 'alert' }, el('b', null, 'Impossible d’ouvrir cet exercice.'), el('span', null, err.message),
          el('button', { type: 'button', class: 'btn btn-primary', onclick: load }, 'Réessayer')));
      });
    }
    load();
  }

  /* ---------- messages venant des exercices (navigation + Défis Docs), comme sur le site ---------- */
  function onMessage(e) {
    var d = e.data || {}, f = document.getElementById('iframe-exo'), src = e.source;
    if (!src || src === root || !P().jeton) return;
    if (d.fnActif) { if (f && src === f.contentWindow && Studio.boot && Studio.boot.touch) Studio.boot.touch(); return; }
    if (d.fnLs) {
      if (f && src === f.contentWindow && f.getAttribute('data-exo')) { var cur = applyLsMessage(lsRead(f.getAttribute('data-exo')), d); if (cur) lsWrite(f.getAttribute('data-exo'), cur); }
      return;
    }
    if (d.fnNav) { if (f && src === f.contentWindow) { var r = resolveRoute(d.fnNav); Studio.go(r.module, r.params); } return; }
    if (!d.dd) return;
    if ((!f || src !== f.contentWindow) && d.action !== 'sauver') return;   /* une dernière sauvegarde peut arriver d'un exercice qu'on vient de quitter */
    function repondre(ok, data) { try { src.postMessage({ ddr: true, rid: d.rid, ok: ok, data: data }, '*'); } catch (x) { /* ignore */ } }
    var p;
    switch (d.action) {
      case 'info': p = Promise.resolve({ eleve: P().eleve, domaine: cfg().domaine, profEmail: cfg().profEmail }); break;
      case 'charger': p = srv('chargerDefis'); break;
      case 'sauver': p = srv('sauvegarderDefis', d.args[0]); break;
      case 'valider': p = null; break;   /* traité juste après */
      case 'bilan': p = srv('envoyerBilan', d.args[0]); break;
      case 'nav': { var rr = resolveRoute(d.args[0]); Studio.go(rr.module, rr.params); p = Promise.resolve(true); break; }
      default: p = Promise.reject(new Error('Action inconnue'));
    }
    if (d.action === 'valider') {
      p = srv.apply(null, ['validerDefi'].concat(d.args || [])).then(function (r) {
        if (d.args && d.args[0] === 'D17') note('defis-docs', 'fait', r && r.score);   /* mission finale réussie = Défis Docs terminés */
        return r;
      });
    }
    p.then(function (r) { repondre(true, r); }, function (err) { repondre(false, err.message); });
  }
  root.addEventListener('message', onMessage);

  /* ---------- bloc « Mes chapitres » de l'écran Accueil ---------- */
  function homeSection() {
    var grid = el('div', { class: 'chap-home-grid' });
    CHAPTERS.forEach(function (ch) {
      var locked = isLocked(ch.id, P().chapitres, isProf()), cnt = counts(ch.id, P().progression);
      var sub = locked ? 'Ton prof ouvrira ce chapitre bientôt' : (cnt.total ? cnt.fait + ' / ' + cnt.total + ' terminé' + (cnt.fait > 1 ? 's' : '') : (ch.evals ? 'Tes évaluations' : 'Ouvert'));
      grid.appendChild(el('a', { class: 'chap-tile' + (locked ? ' is-locked' : ''), href: '#/' + ch.id, 'aria-label': ch.long + (locked ? ' (fermé)' : '') },
        chapterImg(ch, 'chap-tile-img'),
        el('span', { class: 'chap-tile-title' }, (locked ? '🔒 ' : ch.icon + ' ') + ch.titre),
        el('span', { class: 'chap-tile-sub' }, sub)));
    });
    var t = totalCounts(P().progression);
    return el('section', { class: 'chap-home', 'aria-labelledby': 'chap-home-h' },
      el('h2', { id: 'chap-home-h' }, 'Mes chapitres'),
      t.total ? el('p', { class: 'muted' }, t.fait + ' exercice' + (t.fait > 1 ? 's' : '') + ' terminé' + (t.fait > 1 ? 's' : '') + ' sur ' + t.total + '.') : null,
      grid);
  }

  /* ---------- enregistrement ---------- */
  CHAPTERS.forEach(function (ch, i) {
    Studio.register({ id: ch.id, title: ch.titre, icon: ch.icon, order: 1 + i, needsDoc: false, render: function (container, ctx) { renderChapter(container, ctx, ch); } });
  });
  Studio.chapters = { logic: Studio.chaptersLogic, homeSection: homeSection, note: note, flushPending: flushPending, loadPending: loadPending,
    isChapterModule: function (id) { return !!chapterById(id); }, clearCache: function () { cacheExos = {}; } };
})();
