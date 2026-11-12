/* Studio — mode Mnémotechniques (dev-modes2). IIFE, pas de module ES. */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  root.Studio = root.Studio || {};
  var S = root.Studio;

  // ---------- logique pure ----------
  function parseList(text) {
    return String(text || '').split(/\n|;/).map(function (s) { return s.replace(/^\s*[-*•\d.)]+\s+/, '').trim(); }).filter(Boolean);
  }
  function firstLetter(w) {
    var t = String(w).normalize ? String(w).normalize('NFD').replace(/[̀-ͯ]/g, '') : String(w);
    var m = t.match(/[A-Za-z0-9]/);
    return m ? m[0].toUpperCase() : '';
  }
  function initials(words) { return words.map(firstLetter).join(''); }
  // « prononçable » : proportion de voyelles et absence de longues suites de consonnes
  function pronounceScore(acr) {
    var s = acr.toLowerCase(), v = (s.match(/[aeiouy]/g) || []).length, n = s.length;
    if (!n) return 0;
    var ratio = v / n, maxC = 0, run = 0;
    for (var i = 0; i < n; i++) { if (/[aeiouy]/.test(s[i])) run = 0; else { run++; if (run > maxC) maxC = run; } }
    return Math.round((Math.min(ratio, 0.5) * 100) - Math.max(0, maxC - 2) * 25);
  }
  function permutations(arr, limit) {
    var out = [];
    (function rec(cur, rest) {
      if (out.length >= limit) return;
      if (!rest.length) { out.push(cur); return; }
      for (var i = 0; i < rest.length; i++) rec(cur.concat([rest[i]]), rest.slice(0, i).concat(rest.slice(i + 1)));
    })([], arr);
    return out;
  }
  // propose jusqu'à `n` ordres (≤ 7 éléments) classés par prononçabilité
  function bestAcronyms(words, n) {
    if (!words.length || words.length > 7) return [];
    var seen = {}, res = [];
    permutations(words, 5040).forEach(function (p) {
      var a = initials(p);
      if (seen[a]) return; seen[a] = 1;
      res.push({ acronym: a, order: p, score: pronounceScore(a) });
    });
    res.sort(function (x, y) { return y.score - x.score; });
    return res.slice(0, n || 5);
  }
  function chunkItems(items, size) {
    var out = []; size = Math.max(2, size || 3);
    for (var i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
  }
  function chunkDigits(str, size) {
    var d = String(str || '').replace(/\s+/g, '').split('');
    return chunkItems(d, size || 3).map(function (g) { return g.join(''); });
  }
  function palaceRoute(items, places) {
    return items.map(function (it, i) { return { place: places[i % places.length] || ('Étape ' + (i + 1)), item: it, n: i + 1 }; });
  }
  function storySkeleton(items) {
    var starts = ['Il était une fois', 'Puis', 'Ensuite', 'Soudain', 'Enfin'];
    return items.map(function (it, i) { return (starts[Math.min(i, starts.length - 1)]) + ' ' + it + '…'; }).join('\n');
  }
  function methodsList(m) {
    if (!m) return [];
    var arr = Array.isArray(m) ? m : Object.keys(m).map(function (k) { var v = m[k]; return typeof v === 'object' && v ? Object.assign({ id: k }, v) : { id: k, title: k, body: String(v) }; });
    return arr.filter(function (x) { return x && typeof x === 'object'; });
  }
  S.mnemoLogic = { parseList: parseList, initials: initials, pronounceScore: pronounceScore, bestAcronyms: bestAcronyms, chunkItems: chunkItems, chunkDigits: chunkDigits, palaceRoute: palaceRoute, storySkeleton: storySkeleton, methodsList: methodsList };
  if (typeof module !== 'undefined' && module.exports) module.exports = S.mnemoLogic;
  if (typeof document === 'undefined' || !S.register) return;

  // ---------- DOM ----------
  function h(tag, attrs) {
    var e = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
  }
  function empty(c, o) {
    if (S.ui && S.ui.empty) return S.ui.empty(c, o);
    c.innerHTML = ''; c.appendChild(h('div', { class: 'empty' }, h('h3', {}, o.title), h('p', {}, o.text || '')));
  }
  function toast(m, t) { if (S.ui && S.ui.toast) S.ui.toast(m, t); }
  function field(label, control, help) {
    return h('label', { style: 'display:block;margin:.6rem 0' }, h('span', { style: 'display:block;font-weight:600' }, label), help ? h('span', { style: 'display:block;font-size:.85em;opacity:.8' }, help) : null, control);
  }
  function area(rows, ph) { return h('textarea', { rows: rows, placeholder: ph || '', style: 'width:100%;box-sizing:border-box' }); }
  function btn(label, fn, cls) { return h('button', { class: 'btn ' + (cls || 'btn-ghost'), type: 'button', onclick: fn }, label); }

  function saveItems(doc, title, items) {
    if (!items.length) return toast('Rien à enregistrer.', 'error');
    if (!S.store.add('mnemos', { id: S.ui.uid(), docId: doc ? doc.id : null, title: title, createdAt: Date.now(), items: items })) return toast('Plus de place : supprime un vieux cours ou exporte tes données.', 'error');
    toast('Technique enregistrée', 'success');
  }

  function render(container, ctx) {
    container.innerHTML = '';
    var doc = S.store.byId('docs', ctx.docId) || null;
    var tab = (ctx.params && ctx.params.tab) || (doc ? 'generated' : 'workshop');
    var TABS = [['generated', 'Générées'], ['workshop', 'Atelier'], ['library', 'Bibliothèque']];
    var wrap = h('div', { class: 'mnemo-mode' });
    container.appendChild(wrap);
    var panel = h('div', { id: 'mnemo-panel', role: 'tabpanel' });
    var tabs = h('div', { role: 'tablist', 'aria-label': 'Sections mnémotechniques', style: 'display:flex;gap:.5rem;flex-wrap:wrap;margin:1rem 0' });
    wrap.appendChild(h('h1', {}, 'Mnémotechniques'));
    wrap.appendChild(tabs); wrap.appendChild(panel);

    function show(t) {
      tab = t; tabs.innerHTML = '';
      TABS.forEach(function (x) {
        tabs.appendChild(h('button', { class: 'chip' + (x[0] === t ? ' is-active' : ''), type: 'button', role: 'tab', 'aria-selected': x[0] === t ? 'true' : 'false', onclick: function () { show(x[0]); } }, x[1]));
      });
      panel.innerHTML = '';
      ({ generated: generated, workshop: workshop, library: library })[t](panel);
    }

    // --- générées ---
    function generated(p) {
      if (!doc) return empty(p, { icon: '🧠', title: 'Choisis un document', text: 'Les techniques générées partent d’un de tes cours. Tu peux aussi utiliser l’atelier sans document.', cta: { label: 'Ouvrir l’atelier', onClick: function () { show('workshop'); } } });
      var list = S.store.list('mnemos').filter(function (m) { return m.docId === doc.id; });
      var cur = list[list.length - 1] || null, busy = false;
      var out = h('div');
      var gen = btn('Générer des techniques', function () {
        if (busy) return; busy = true; gen.disabled = true; gen.textContent = 'Génération…';
        Promise.resolve(S.gen.mnemonics(doc, { count: 10 })).then(function (m) { cur = m; toast('Techniques générées', 'success'); }, function (e) { toast((e && e.message) || 'Échec de la génération', 'error'); })
          .then(function () { busy = false; gen.disabled = false; gen.textContent = 'Générer de nouvelles techniques'; draw(); });
      }, 'btn-primary');
      if (cur) gen.textContent = 'Générer de nouvelles techniques';
      p.appendChild(gen); p.appendChild(out);
      function draw() {
        out.innerHTML = '';
        if (!cur || !cur.items || !cur.items.length) return empty(out, { icon: '🧠', title: 'Pas encore de technique', text: 'Lance la génération : acronymes, associations et astuces tirés de ton cours.' });
        var g = h('div', { class: 'grid', style: 'margin-top:1rem' });
        cur.items.forEach(function (it) {
          g.appendChild(h('div', { class: 'card' }, h('span', { class: 'badge' }, it.technique || 'astuce'), h('h3', {}, it.concept || ''), h('p', {}, it.tip || '')));
        });
        out.appendChild(g);
      }
      draw();
    }

    // --- atelier ---
    function workshop(p) {
      var tools = [['acro', 'Acronyme'], ['palace', 'Palais de la mémoire'], ['story', 'Histoire'], ['rhyme', 'Rime'], ['chunk', 'Chunking']];
      var cur = 'acro', box = h('div', { class: 'card', style: 'margin-top:1rem' });
      var bar = h('div', { style: 'display:flex;gap:.5rem;flex-wrap:wrap' });
      p.appendChild(bar); p.appendChild(box);
      function pick(t) {
        cur = t; bar.innerHTML = '';
        tools.forEach(function (x) { bar.appendChild(h('button', { class: 'chip' + (x[0] === t ? ' is-active' : ''), type: 'button', 'aria-pressed': x[0] === t ? 'true' : 'false', onclick: function () { pick(x[0]); } }, x[1])); });
        box.innerHTML = '';
        ({ acro: acro, palace: palace, story: story, rhyme: rhyme, chunk: chunk })[t](box);
      }
      function result(b) { var r = h('div', { 'aria-live': 'polite', style: 'margin-top:1rem' }); b.appendChild(r); return r; }
      function saver(b, title, getItems) { b.appendChild(btn('Enregistrer', function () { saveItems(doc, title, getItems()); }, 'btn-primary')); }

      // acronyme pas à pas
      function acro(b) {
        var step = 1, words = [], chosen = null, phrase = '';
        var area_ = h('div'); b.appendChild(h('h2', {}, 'Créer mon acronyme')); b.appendChild(area_);
        function draw() {
          area_.innerHTML = '';
          area_.appendChild(h('p', { style: 'font-weight:600' }, 'Étape ' + step + ' sur 3'));
          if (step === 1) {
            var ta = area(6, 'Un élément par ligne\nEx. :\nMercure\nVénus\nTerre'); ta.value = words.join('\n');
            area_.appendChild(field('1. Liste à retenir', ta, 'Écris chaque élément sur une ligne (7 maximum pour proposer des réarrangements).'));
            area_.appendChild(btn('Suivant', function () {
              words = parseList(ta.value);
              if (words.length < 2) return toast('Ajoute au moins 2 éléments.', 'error');
              chosen = { acronym: initials(words), order: words.slice(), score: pronounceScore(initials(words)) }; step = 2; draw();
            }, 'btn-primary'));
          } else if (step === 2) {
            area_.appendChild(h('p', {}, '2. Choisis un acronyme. Le premier garde ton ordre ; les autres réarrangent les éléments pour faciliter la prononciation.'));
            var opts = [{ acronym: initials(words), order: words.slice(), score: pronounceScore(initials(words)), orig: true }].concat(bestAcronyms(words, 5).filter(function (x) { return x.acronym !== initials(words); }));
            var g = h('div', { role: 'radiogroup', 'aria-label': 'Acronymes proposés', style: 'display:flex;flex-direction:column;gap:.5rem' });
            opts.forEach(function (o) {
              var on = chosen && chosen.acronym === o.acronym;
              g.appendChild(h('button', { class: 'chip' + (on ? ' is-active' : ''), type: 'button', role: 'radio', 'aria-checked': on ? 'true' : 'false', style: 'text-align:left', onclick: function () { chosen = o; draw(); } },
                o.acronym + ' — ' + o.order.join(', ') + (o.orig ? ' (ton ordre)' : '')));
            });
            area_.appendChild(g);
            area_.appendChild(h('p', { style: 'font-size:.85em;opacity:.8' }, 'Note de prononçabilité : estimation par proportion de voyelles, à juger à l’oreille.'));
            area_.appendChild(btn('Retour', function () { step = 1; draw(); }));
            area_.appendChild(btn('Suivant', function () { step = 3; draw(); }, 'btn-primary'));
          } else {
            area_.appendChild(h('p', { style: 'font-size:1.6rem;font-weight:700;letter-spacing:.15em' }, chosen.acronym));
            var ul = h('ul'); chosen.order.forEach(function (w) { ul.appendChild(h('li', {}, h('strong', {}, firstLetter(w)), ' : ' + w)); }); area_.appendChild(ul);
            var inp = h('input', { type: 'text', style: 'width:100%;box-sizing:border-box', placeholder: 'Ex. : phrase dont chaque mot commence par ces lettres' }); inp.value = phrase;
            area_.appendChild(field('3. (Facultatif) Une phrase-acrostiche à toi', inp, 'Chaque mot commence par une des lettres, dans l’ordre : ' + chosen.acronym.split('').join(' · ')));
            area_.appendChild(btn('Retour', function () { phrase = inp.value; step = 2; draw(); }));
            area_.appendChild(btn('Enregistrer', function () {
              phrase = inp.value.trim();
              saveItems(doc, 'Acronyme ' + chosen.acronym, [{ technique: 'acronyme', concept: chosen.acronym + ' = ' + chosen.order.join(', '), tip: phrase || 'Récite l’acronyme puis retrouve chaque mot.' }]);
            }, 'btn-primary'));
            area_.appendChild(btn('Recommencer', function () { step = 1; words = []; chosen = null; phrase = ''; draw(); }));
          }
        }
        draw();
      }

      function palace(b) {
        b.appendChild(h('h2', {}, 'Palais de la mémoire'));
        b.appendChild(h('p', {}, 'Choisis un trajet que tu connais par cœur (chez toi, ton collège…). Place chaque élément dans une étape, avec une image vive et exagérée.'));
        var pl = area(5, 'Étapes du trajet, une par ligne\nPorte d’entrée\nCouloir\nCuisine'), it = area(5, 'Éléments à retenir, un par ligne');
        b.appendChild(field('1. Les étapes de ton trajet', pl)); b.appendChild(field('2. Les éléments', it));
        var res = result(b), route = [];
        b.insertBefore(btn('Construire le parcours', function () {
          var places = parseList(pl.value), items = parseList(it.value);
          res.innerHTML = '';
          if (!places.length || !items.length) return toast('Remplis les étapes et les éléments.', 'error');
          route = palaceRoute(items, places);
          if (items.length > places.length) res.appendChild(h('p', { role: 'alert' }, 'Il y a plus d’éléments que d’étapes : certaines étapes sont réutilisées. Ajoute des étapes pour de meilleurs résultats.'));
          var ol = h('ol'); route.forEach(function (r) { ol.appendChild(h('li', {}, h('strong', {}, r.place), ' → imagine « ', r.item, ' » de façon absurde et très visuelle.')); });
          res.appendChild(ol);
        }, 'btn-primary'), res);
        saver(b, 'Palais de la mémoire', function () { return route.map(function (r) { return { technique: 'palais de la mémoire', concept: r.item, tip: 'Étape ' + r.n + ' : ' + r.place }; }); });
      }

      function story(b) {
        b.appendChild(h('h2', {}, 'Raconte une histoire'));
        b.appendChild(h('p', {}, 'Relie tes éléments dans l’ordre par une histoire courte et surprenante. Le squelette ci-dessous est à compléter.'));
        var it = area(5, 'Éléments à retenir, un par ligne'), out = area(8, 'Ton histoire'), cc = h('p');
        b.appendChild(field('1. Les éléments', it));
        b.appendChild(btn('Générer le squelette', function () { var l = parseList(it.value); if (!l.length) return toast('Ajoute des éléments.', 'error'); out.value = storySkeleton(l); }, 'btn-primary'));
        b.appendChild(field('2. Ton histoire', out));
        b.appendChild(btn('Vérifier', function () {
          var l = parseList(it.value), t = out.value.toLowerCase();
          var miss = l.filter(function (x) { return t.indexOf(x.toLowerCase()) < 0; });
          cc.textContent = miss.length ? 'Il manque : ' + miss.join(', ') : 'Tous les éléments sont dans ton histoire.'; cc.setAttribute('role', 'status');
        }));
        b.appendChild(cc);
        saver(b, 'Histoire mnémotechnique', function () { var l = parseList(it.value); return out.value.trim() ? [{ technique: 'histoire', concept: l.join(' → '), tip: out.value.trim() }] : []; });
      }

      function rhyme(b) {
        b.appendChild(h('h2', {}, 'Compose une rime'));
        b.appendChild(h('p', {}, 'Une règle rimée ou rythmée se retient mieux. Écris l’idée clé, puis ta version rimée : fais-la finir par le même son, avec un rythme régulier.'));
        var k = h('input', { type: 'text', style: 'width:100%;box-sizing:border-box' }), r = area(4, 'Ta rime');
        b.appendChild(field('1. L’idée à retenir', k)); b.appendChild(field('2. Ta rime', r));
        var st = h('p', { role: 'status' });
        b.appendChild(btn('Compter les syllabes (approximatif)', function () {
          var lines = r.value.split('\n').filter(function (x) { return x.trim(); });
          st.textContent = lines.length ? lines.map(function (l, i) { return 'Vers ' + (i + 1) + ' : ≈ ' + ((l.toLowerCase().match(/[aeiouyàâéèêëîïôûù]+/g) || []).length) + ' syllabes'; }).join(' · ') : 'Écris au moins un vers.';
        }));
        b.appendChild(st);
        saver(b, 'Rime', function () { return r.value.trim() ? [{ technique: 'rime', concept: k.value.trim() || 'Rime', tip: r.value.trim() }] : []; });
      }

      function chunk(b) {
        b.appendChild(h('h2', {}, 'Chunking : découper pour retenir'));
        b.appendChild(h('p', {}, 'La mémoire de travail retient peu d’éléments à la fois : regroupe-les par paquets de 3 à 4.'));
        var t = area(4, 'Chiffres (ex. 14071789) ou liste d’éléments, un par ligne'), sz = h('input', { type: 'number', min: 2, max: 6, value: 3, style: 'width:5rem' });
        b.appendChild(field('1. Ce que tu veux retenir', t)); b.appendChild(field('2. Taille des paquets', sz));
        var res = result(b), groups = [];
        b.insertBefore(btn('Découper', function () {
          var size = parseInt(sz.value, 10) || 3, raw = t.value.trim(); res.innerHTML = '';
          if (!raw) return toast('Écris quelque chose à découper.', 'error');
          groups = /^[\d\s]+$/.test(raw) ? chunkDigits(raw, size) : chunkItems(parseList(raw), size).map(function (g) { return g.join(' · '); });
          var ol = h('ol'); groups.forEach(function (g) { ol.appendChild(h('li', { style: 'font-size:1.2rem' }, g)); }); res.appendChild(ol);
          res.appendChild(h('p', {}, groups.length + ' paquet(s). Donne à chaque paquet un sens ou une image.'));
        }, 'btn-primary'), res);
        saver(b, 'Chunking', function () { return groups.map(function (g, i) { return { technique: 'chunking', concept: 'Paquet ' + (i + 1), tip: g }; }); });
      }
      pick(cur);
    }

    // --- bibliothèque ---
    function library(p) {
      var list = methodsList(S.content && S.content.methods);
      if (!list.length) return empty(p, { icon: '📚', title: 'Bibliothèque indisponible', text: 'Les fiches méthodes n’ont pas pu être chargées.' });
      var g = h('div', { class: 'grid' });
      list.forEach(function (m) {
        var c = h('div', { class: 'card' }), title = m.title || m.titre || m.name || m.id;
        c.appendChild(h('h3', {}, ((m.icon || m.emoji) ? (m.icon || m.emoji) + ' ' : '') + title));
        Object.keys(m).forEach(function (k) {
          var v = m[k];
          if (['id', 'title', 'titre', 'name', 'icon', 'emoji'].indexOf(k) >= 0 || v == null) return;
          if (typeof v === 'string') { var d = h('div'); d.innerHTML = S.ui && S.ui.md ? S.ui.md(v) : ''; if (!d.innerHTML) d.textContent = v; c.appendChild(d); }
          else if (Array.isArray(v)) { var ul = h('ul'); v.forEach(function (x) { ul.appendChild(h('li', {}, typeof x === 'string' ? x : JSON.stringify(x))); }); c.appendChild(ul); }
        });
        g.appendChild(c);
      });
      p.appendChild(g);
    }

    show(TABS.some(function (x) { return x[0] === tab; }) ? tab : 'workshop');
  }

  S.register({ id: 'mnemo', title: 'Mnémotechniques', icon: '🧠', order: 7, needsDoc: false, render: render });
})();
