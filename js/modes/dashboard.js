/* Studio — tableau de bord (dev-modes2). IIFE, pas de module ES. */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  root.Studio = root.Studio || {};
  var S = root.Studio;

  // ---------- logique pure ----------
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(d) { d = d instanceof Date ? d : new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseDay(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
  function addDays(d, n) { var r = new Date(d.getFullYear(), d.getMonth(), d.getDate()); r.setDate(r.getDate() + n); return r; }
  function daysBetween(a, b) { return Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000); }

  function lastDays(reviews, n, today) {
    reviews = reviews || {}; today = today || new Date();
    var out = [];
    for (var i = n - 1; i >= 0; i--) { var d = addDays(today, -i), k = dayKey(d); out.push({ day: k, date: d, count: +reviews[k] || 0 }); }
    return out;
  }
  function dueCards(decks, now) {
    now = now == null ? Date.now() : now;
    var out = [];
    (decks || []).forEach(function (dk) { (dk.cards || []).forEach(function (c) { if (!c.due || c.due <= now) out.push({ deckId: dk.id, deckTitle: dk.title, card: c }); }); });
    return out;
  }
  function endOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime(); }

  // répartit les cartes entre aujourd'hui et la veille de l'examen ; les plus fragiles d'abord
  function planSchedule(cards, examDay, today) {
    today = today || new Date();
    var exam = typeof examDay === 'string' ? parseDay(examDay) : examDay;
    if (!exam) return { error: 'Date invalide', days: [] };
    var n = daysBetween(today, exam);
    if (n < 1) return { error: 'La date d’examen doit être dans le futur.', days: [] };
    var sorted = (cards || []).slice().sort(function (a, b) {
      var A = a.card || a, B = b.card || b;
      return ((A.box || 0) - (B.box || 0)) || ((A.due || 0) - (B.due || 0));
    });
    var days = [];
    for (var i = 0; i < n; i++) days.push({ day: dayKey(addDays(today, i)), date: addDays(today, i), cards: [] });
    var base = Math.floor(sorted.length / n), extra = sorted.length % n, p = 0;
    for (var j = 0; j < n; j++) {
      var take = base + (j < extra ? 1 : 0);
      days[j].cards = sorted.slice(p, p + take); p += take;
    }
    days.forEach(function (d) { d.count = d.cards.length; });
    return { days: days, total: sorted.length, perDay: sorted.length / n, daysLeft: n };
  }

  function recommend(o) {
    // o: {stats, decks, now, exam}
    var st = o.stats || {}, now = o.now == null ? Date.now() : o.now, rec = [];
    var due = dueCards(o.decks, now).length, total = (o.decks || []).reduce(function (a, d) { return a + (d.cards || []).length; }, 0);
    var today = dayKey(new Date(now)), done = (st.reviews || {})[today] || 0;
    if (!total) rec.push({ text: 'Crée ton premier paquet de flashcards à partir d’un cours.', go: 'flashcards' });
    else if (due > 0) rec.push({ text: 'Révise tes ' + due + ' carte' + (due > 1 ? 's' : '') + ' due' + (due > 1 ? 's' : '') + ' aujourd’hui : c’est le moment optimal pour les retenir.', go: 'flashcards' });
    else if (total) rec.push({ text: 'Aucune carte due : bravo ! Tu peux jouer au memory pour t’entraîner.', go: 'memory' });
    var lsd = parseDay(st.lastStudyDay);
    if (st.streak > 0 && lsd && daysBetween(lsd, new Date(now)) === 1 && !done) rec.push({ text: 'Ta série de ' + st.streak + ' jour(s) est en jeu : fais au moins une révision aujourd’hui.', go: 'flashcards' });
    if (o.exam) { var left = daysBetween(new Date(now), parseDay(o.exam) || new Date(now)); if (left > 0 && left <= 7) rec.push({ text: 'Examen dans ' + left + ' jour(s) : concentre-toi sur les cartes les plus fragiles.', go: 'flashcards' }); }
    return rec;
  }
  S.dashboardLogic = { dayKey: dayKey, parseDay: parseDay, lastDays: lastDays, dueCards: dueCards, planSchedule: planSchedule, recommend: recommend, daysBetween: daysBetween };
  if (typeof module !== 'undefined' && module.exports) module.exports = S.dashboardLogic;
  if (typeof document === 'undefined' || !S.register) return;

  // ---------- DOM ----------
  var NS = 'http://www.w3.org/2000/svg';
  function h(tag, attrs) {
    var e = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c == null || c === false) continue; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
    return e;
  }
  function empty(c, o) {
    if (S.ui && S.ui.empty) return S.ui.empty(c, o);
    c.innerHTML = ''; c.appendChild(h('div', { class: 'empty' }, h('h3', {}, o.title), h('p', {}, o.text || '')));
  }
  function stat(label, value, sub) {
    return h('div', { class: 'card' }, h('div', { style: 'font-size:.9em;opacity:.8' }, label), h('div', { style: 'font-size:2rem;font-weight:700' }, String(value)), sub ? h('div', { style: 'font-size:.85em;opacity:.8' }, sub) : null);
  }
  var JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

  function chart(days) {
    var W = 560, H = 190, pl = 28, pb = 28, pt = 12, max = Math.max(5, Math.max.apply(null, days.map(function (d) { return d.count; })));
    var bw = (W - pl) / days.length, svg = document.createElementNS(NS, 'svg');
    var total = days.reduce(function (a, d) { return a + d.count; }, 0);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('role', 'img'); svg.style.cssText = 'width:100%;height:auto;display:block';
    svg.setAttribute('aria-label', 'Révisions des 14 derniers jours : ' + total + ' au total. ' + days.map(function (d) { return d.day + ' : ' + d.count; }).join(', '));
    function el(n, a, t) { var e = document.createElementNS(NS, n); Object.keys(a).forEach(function (k) { e.setAttribute(k, a[k]); }); if (t != null) e.textContent = t; svg.appendChild(e); return e; }
    [0, 0.5, 1].forEach(function (f) { var y = pt + (H - pb - pt) * (1 - f); el('line', { x1: pl, x2: W, y1: y, y2: y, stroke: 'currentColor', 'stroke-opacity': '.15' }); el('text', { x: pl - 4, y: y + 4, 'text-anchor': 'end', 'font-size': 10, fill: 'currentColor', 'fill-opacity': '.7' }, Math.round(max * f)); });
    days.forEach(function (d, i) {
      var bh = (H - pb - pt) * d.count / max, x = pl + i * bw + bw * 0.15, y = H - pb - bh;
      var r = el('rect', { x: x, y: y, width: bw * 0.7, height: Math.max(bh, d.count ? 2 : 0), rx: 4, fill: i === days.length - 1 ? '#e17055' : '#6c5ce7' });
      var t = document.createElementNS(NS, 'title'); t.textContent = d.day + ' : ' + d.count + ' révision(s)'; r.appendChild(t);
      el('text', { x: x + bw * 0.35, y: H - 14, 'text-anchor': 'middle', 'font-size': 9, fill: 'currentColor', 'fill-opacity': '.8' }, JOURS[d.date.getDay()]);
      el('text', { x: x + bw * 0.35, y: H - 3, 'text-anchor': 'middle', 'font-size': 9, fill: 'currentColor', 'fill-opacity': '.8' }, d.date.getDate());
    });
    return svg;
  }

  function render(container, ctx) {
    container.innerHTML = '';
    var stats = S.store.get('stats', {}) || {}, decks = S.store.list('decks'), docs = S.store.list('docs');
    var plan = S.store.get('plan', null) || {};
    var wrap = h('div', { class: 'dashboard-mode' });
    container.appendChild(wrap);
    wrap.appendChild(h('h1', {}, 'Tableau de bord'));

    var days = lastDays(stats.reviews, 14), week = days.slice(7).reduce(function (a, d) { return a + d.count; }, 0);
    var due = dueCards(decks);
    var totalCards = decks.reduce(function (a, d) { return a + (d.cards || []).length; }, 0);

    if (!docs.length && !totalCards && !days.some(function (d) { return d.count; })) {
      var e = h('div'); wrap.appendChild(e);
      return empty(e, { icon: '📊', title: 'Ton tableau de bord t’attend', text: 'Ajoute un cours et commence à réviser : ta progression apparaîtra ici.', cta: { label: 'Ajouter un cours', onClick: function () { ctx.go('home'); } } });
    }

    var top = h('div', { class: 'grid' });
    top.appendChild(stat('Jours d’affilée', (stats.streak || 0) + ' j', stats.streak ? 'Continue comme ça !' : 'Révise aujourd’hui pour démarrer une série'));
    top.appendChild(stat('Points d’expérience', stats.xp || 0));
    top.appendChild(stat('Cartes dues aujourd’hui', due.length, totalCards + ' carte(s) au total'));
    top.appendChild(stat('Révisions cette semaine', week));
    wrap.appendChild(top);

    var c1 = h('section', { class: 'card', style: 'margin-top:1rem', 'aria-labelledby': 'dash-h-rev' }, h('h2', { id: 'dash-h-rev' }, 'Révisions des 14 derniers jours'));
    c1.appendChild(chart(days)); wrap.appendChild(c1);

    // cartes dues par paquet
    var c2 = h('section', { class: 'card', style: 'margin-top:1rem' }, h('h2', {}, 'À réviser aujourd’hui'));
    if (!due.length) c2.appendChild(h('p', {}, totalCards ? 'Rien à réviser pour l’instant. 🎉' : 'Aucun paquet de cartes pour l’instant.'));
    else {
      var by = {}; due.forEach(function (d) { (by[d.deckId] = by[d.deckId] || { t: d.deckTitle, n: 0 }).n++; });
      var ul = h('ul', { style: 'list-style:none;padding:0;margin:0' });
      Object.keys(by).forEach(function (id) {
        ul.appendChild(h('li', { style: 'display:flex;justify-content:space-between;align-items:center;gap:.5rem;padding:.4rem 0;flex-wrap:wrap' },
          h('span', {}, by[id].t + ' — ', h('span', { class: 'badge' }, by[id].n + ' carte' + (by[id].n > 1 ? 's' : ''))),
          h('button', { class: 'btn btn-primary', type: 'button', onclick: function () { ctx.go('flashcards', { deckId: id, review: 1 }); } }, 'Réviser')));
      });
      c2.appendChild(ul);
    }
    wrap.appendChild(c2);

    // planificateur
    var c4 = h('section', { class: 'card', style: 'margin-top:1rem' }, h('h2', {}, 'Planificateur de révision'));
    c4.appendChild(h('p', {}, 'Indique la date de ton examen : Studio répartit tes cartes jour par jour, les plus fragiles d’abord.'));
    var inp = h('input', { type: 'date', id: 'dash-exam', value: plan.exam || '', min: dayKey(addDays(new Date(), 1)) });
    var out = h('div', { 'aria-live': 'polite', style: 'margin-top:.75rem' });
    function showPlan() {
      out.innerHTML = '';
      if (!inp.value) return;
      if (!totalCards) return empty(out, { icon: '🃏', title: 'Pas de cartes à planifier', text: 'Crée d’abord un paquet de flashcards.' });
      var all = []; decks.forEach(function (d) { (d.cards || []).forEach(function (c) { all.push({ deckId: d.id, card: c }); }); });
      var p = planSchedule(all, inp.value, new Date());
      if (p.error) return out.appendChild(h('p', { role: 'alert' }, p.error));
      out.appendChild(h('p', {}, p.daysLeft + ' jour(s) avant l’examen : environ ' + Math.ceil(p.perDay) + ' carte(s) par jour (' + p.total + ' au total).'));
      var ul = h('ol', { style: 'padding-left:1.2rem;max-height:320px;overflow:auto' });
      p.days.forEach(function (d, i) { ul.appendChild(h('li', {}, (i === 0 ? 'Aujourd’hui' : JOURS[d.date.getDay()] + ' ' + d.date.toLocaleDateString('fr-FR')) + ' : ' + d.count + ' carte(s)')); });
      out.appendChild(ul);
    }
    var save = h('button', { class: 'btn btn-primary', type: 'button', onclick: function () { S.store.set('plan', { exam: inp.value }); showPlan(); } }, 'Planifier');
    c4.appendChild(h('div', { style: 'display:flex;gap:.5rem;flex-wrap:wrap;align-items:center' }, h('label', { for: 'dash-exam' }, 'Date de l’examen'), inp, save));
    c4.appendChild(out); wrap.appendChild(c4); showPlan();

    // recommandations
    var rec = recommend({ stats: stats, decks: decks, exam: plan.exam });
    var c5 = h('section', { class: 'card', style: 'margin-top:1rem' }, h('h2', {}, 'Recommandations'));
    if (!rec.length) c5.appendChild(h('p', {}, 'Tout est à jour, continue ainsi !'));
    var ul5 = h('ul', { style: 'list-style:none;padding:0' });
    rec.forEach(function (r) { ul5.appendChild(h('li', { style: 'display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin:.4rem 0' }, h('span', {}, r.text), h('button', { class: 'btn btn-ghost', type: 'button', onclick: function () { ctx.go(r.go); } }, 'Y aller'))); });
    c5.appendChild(ul5); wrap.appendChild(c5);
  }

  S.register({ id: 'dashboard', title: 'Dashboard', icon: '📊', order: 2, needsDoc: false, render: render });
})();
