/* Studio — « Espace prof » : ouvrir / fermer les chapitres pour les élèves + tableau de progression des élèves.
   Visible seulement si eleve.estProf. Le serveur refuse de toute façon ces appels à un élève. */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var Studio = root.Studio = root.Studio || {};

  /* ---------- logique pure ---------- */
  /* « 11/11 10:03 » (serveur) ou « 2026-11-11 10:03 » (démo) -> clé triable */
  function dateKey(v) {
    v = String(v || '');
    var m = /^(\d\d)\/(\d\d) (\d\d:\d\d)$/.exec(v);
    return m ? m[2] + m[1] + ' ' + m[3] : v.replace(/^\d{4}-/, '').replace(/^(\d\d)-(\d\d)/, '$1$2');
  }
  function sortStudents(list, key, dir) {
    var k = key || 'nom', d = dir === 'desc' ? -1 : 1;
    function val(e) {
      if (k === 'nom') return ((e.nom || '') + ' ' + (e.prenom || '')).toLowerCase();
      if (k === 'derniereActivite') return dateKey(e.derniereActivite);
      return +e[k] || 0;
    }
    return (list || []).slice().sort(function (a, b) {
      var x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * d || String(a.email).localeCompare(String(b.email));
    });
  }
  function filterClass(list, classe) { return !classe ? (list || []) : (list || []).filter(function (e) { return e.classe === classe; }); }
  function classesOf(list) {
    var seen = {}; (list || []).forEach(function (e) { if (e.classe) seen[e.classe] = 1; });
    return Object.keys(seen).sort();
  }
  Studio.profLogic = { dateKey: dateKey, sortStudents: sortStudents, filterClass: filterClass, classesOf: classesOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = Studio.profLogic;
  if (typeof document === 'undefined' || typeof Studio.register !== 'function') return;

  /* ---------- page ---------- */
  var el = function () { return Studio.ui.el.apply(null, arguments); };
  var CL = function () { return Studio.chaptersLogic; };
  function P() { return Studio.platform; }
  function srv(fn) { var a = Array.prototype.slice.call(arguments, 1); return Studio.server.call.apply(Studio.server, [fn, P().jeton].concat(a)); }

  var sortKey = 'nom', sortDir = 'asc', classFilter = '';

  function render(container) {
    if (!P() || !P().isProf()) {
      Studio.ui.empty(container, { icon: '🔒', title: 'Espace réservé au prof', text: 'Cette page est réservée à ton professeur.', cta: { label: 'Retour à l’accueil', go: 'today' } });
      return;
    }
    var state = { chapitres: null, eleves: null, error: '' };
    var chapBox = el('section', { class: 'card prof-card', 'aria-labelledby': 'prof-h1' }, el('h2', { id: 'prof-h1' }, 'Ouvrir ou fermer les chapitres'),
      el('p', { class: 'muted' }, 'Un chapitre fermé reste visible pour les élèves avec un cadenas 🔒. Ils ne peuvent pas ouvrir ses exercices.'));
    var listBox = el('div', { class: 'prof-chaps' });
    chapBox.appendChild(listBox);
    var tableBox = el('section', { class: 'card prof-card', 'aria-labelledby': 'prof-h2' });
    container.appendChild(el('div', { class: 'prof-page' }, el('h1', null, '🧑‍🏫 Espace prof'), chapBox, tableBox));

    function drawChapters() {
      Studio.ui.clear(listBox);
      CL().CHAPTERS.forEach(function (ch) {
        var c = CL().findChapter(state.chapitres, ch.id), open = CL().realOpen(c);
        var sw = el('button', { type: 'button', class: 'prof-switch' + (open ? ' is-on' : ''), role: 'switch', 'aria-checked': open ? 'true' : 'false',
          'aria-label': ch.long + ' : ' + (open ? 'ouvert' : 'fermé') + ' pour les élèves', onclick: function () { toggle(ch, !open, sw); } },
          el('span', { class: 'prof-switch-knob', 'aria-hidden': 'true' }), el('span', { class: 'prof-switch-text' }, open ? 'Ouvert' : 'Fermé'));
        listBox.appendChild(el('div', { class: 'prof-chap' }, el('span', { class: 'prof-chap-name' }, ch.icon + ' ' + ch.long),
          open && c && c.dateOuverture ? el('span', { class: 'small muted' }, 'depuis le ' + c.dateOuverture) : null, sw));
      });
    }
    function toggle(ch, wanted, btn) {
      btn.disabled = true;
      srv('definirChapitre', ch.id, wanted).then(function (list) {
        /* l'appel a réussi : l'état réel est celui demandé (le serveur peut renvoyer ouvert=true pour le prof dans la liste) */
        var found = false;
        state.chapitres = (state.chapitres || []).map(function (c) { if (c.id !== ch.id) return c; found = true; return Object.assign({}, c, { ouvert: true, ouvertEleves: wanted, dateOuverture: wanted ? (c.dateOuverture || 'à l’instant') : '' }); });
        if (!found) state.chapitres.push({ id: ch.id, ouvert: true, ouvertEleves: wanted });
        P().chapitres = state.chapitres.map(function (c) { return Object.assign({}, c, { ouvert: true, ouvertEleves: c.ouvertEleves }); });
        Studio.ui.toast(ch.titre + (wanted ? ' : ouvert pour les élèves.' : ' : fermé pour les élèves.'), 'success');
        drawChapters();
      }, function (err) { btn.disabled = false; Studio.ui.toast(err.message, 'error'); });
    }

    function drawTable() {
      Studio.ui.clear(tableBox);
      tableBox.appendChild(el('div', { class: 'prof-head' }, el('h2', { id: 'prof-h2' }, 'Mes élèves'),
        el('button', { type: 'button', class: 'btn btn-ghost', onclick: load }, '↻ Actualiser')));
      if (state.error) { tableBox.appendChild(el('p', { role: 'alert', class: 'prof-error' }, state.error, ' ', el('button', { type: 'button', class: 'btn btn-primary', onclick: load }, 'Réessayer'))); return; }
      if (!state.eleves) { tableBox.appendChild(el('p', { class: 'muted', role: 'status' }, 'Chargement…')); return; }
      var classes = classesOf(state.eleves);
      if (classes.length > 1) {
        var sel = el('select', { class: 'select prof-class', 'aria-label': 'Filtrer par classe', onchange: function () { classFilter = sel.value; drawTable(); } },
          el('option', { value: '' }, 'Toutes les classes'), classes.map(function (c) { return el('option', { value: c, selected: c === classFilter }, c); }));
        tableBox.appendChild(sel);
      }
      var total = CL().totalCounts({}).total;
      var rows = sortStudents(filterClass(state.eleves, classFilter), sortKey, sortDir);
      if (!rows.length) { tableBox.appendChild(el('p', { class: 'muted' }, 'Aucun élève inscrit pour le moment.')); return; }
      function th(label, key) {
        var cur = sortKey === key;
        return el('th', { scope: 'col', 'aria-sort': cur ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none' },
          el('button', { type: 'button', class: 'prof-th', onclick: function () { if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc'; else { sortKey = key; sortDir = key === 'nom' ? 'asc' : 'desc'; } drawTable(); } },
            label + (cur ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '')));
      }
      var table = el('table', { class: 'prof-table' },
        el('thead', null, el('tr', null, th('Élève', 'nom'), th('Classe', 'classe'), th('Niveau', 'niveau'), th('Points', 'xp'), th('Série', 'serie'), th('Exercices faits', 'exosFaits'), th('Dernière activité', 'derniereActivite'))),
        el('tbody', null, rows.map(function (e) {
          return el('tr', null, el('th', { scope: 'row' }, (e.prenom || '') + ' ' + (e.nom || ''), el('div', { class: 'small muted' }, e.email)), el('td', null, e.classe || ''),
            el('td', null, String(e.niveau || 1)), el('td', null, String(e.xp || 0)), el('td', null, (e.serie || 0) + ' j'),
            el('td', null, el('div', { class: 'progress progress-sm', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(e.exosFaits || 0), 'aria-label': 'Exercices faits' },
              el('div', { class: 'progress-bar', style: 'width:' + Math.min(100, Math.round(100 * (e.exosFaits || 0) / (total || 1))) + '%' }), ),
              el('span', { class: 'small' }, (e.exosFaits || 0) + ' / ' + total)),
            el('td', null, e.derniereActivite || '—'));
        })));
      tableBox.appendChild(el('div', { class: 'prof-scroll', tabindex: '0', role: 'region', 'aria-label': 'Tableau des élèves' }, table));
    }

    function load() {
      state.error = ''; state.eleves = null; drawTable();
      srv('tableauProf').then(function (r) {
        state.eleves = r.eleves || [];
        if (r.chapitres) state.chapitres = r.chapitres.map(function (c) { return Object.assign({}, c); });
        drawChapters(); drawTable();
      }, function (err) { state.error = err.message; drawTable(); });
    }
    state.chapitres = (P().chapitres || []).map(function (c) { return Object.assign({}, c); });
    drawChapters(); load();
  }

  Studio.register({ id: 'prof', title: 'Espace prof', icon: '🧑‍🏫', order: 7, needsDoc: false, render: render });
})();
