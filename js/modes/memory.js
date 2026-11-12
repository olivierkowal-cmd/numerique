/* Studio — Memory & jeux : Memory classique, Associations, Vrai ou faux chrono (données issues des decks) */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var Studio = root.Studio = root.Studio || {};

  /* ---------- logique pure ---------- */
  function shuffleArr(a, rng) {
    rng = rng || Math.random; a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function clip(s, max) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > max ? s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : s; }
  /* paires {id, term, def} uniques, textes non vides */
  function pickPairs(cards, n, rng, maxLen) {
    var seen = {}, ok = [];
    (cards || []).forEach(function (c) {
      var f = clip(c.front, maxLen || 60), b = clip(c.back, maxLen || 60);
      var key = f.toLowerCase(), key2 = 'b:' + b.toLowerCase();
      if (!f || !b || seen[key] || seen[key2]) return;
      seen[key] = seen[key2] = true; ok.push({ id: c.id || key, term: f, def: b });
    });
    return shuffleArr(ok, rng).slice(0, n);
  }
  function buildTiles(pairs, rng) {
    var t = [];
    pairs.forEach(function (p) {
      t.push({ key: p.id + ':t', pairId: p.id, text: p.term, side: 'term' });
      t.push({ key: p.id + ':d', pairId: p.id, text: p.def, side: 'def' });
    });
    return shuffleArr(t, rng);
  }
  function isMatch(a, b) { return !!a && !!b && a.key !== b.key && a.pairId === b.pairId; }
  function stars(moves, pairs) { return moves <= pairs * 1.5 ? 3 : moves <= pairs * 2.5 ? 2 : 1; }
  /* affirmations vrai/faux : moitié vraies, moitié fausses (fausse = définition d'une autre carte) */
  function buildTF(cards, n, rng) {
    rng = rng || Math.random;
    var pool = pickPairs(cards, 1000, rng, 90);
    if (pool.length < 2) return [];
    var out = [];
    for (var i = 0; i < n; i++) {
      var p = pool[i % pool.length], truth = rng() < 0.5;
      var other = p;
      if (!truth) { do { other = pool[Math.floor(rng() * pool.length)]; } while (other.id === p.id); }
      out.push({ term: p.term, shown: truth ? p.def : other.def, truth: truth, def: p.def });
    }
    return out;
  }
  function tfPoints(streak) { return 10 + 2 * (Math.min(Math.max(streak, 1), 10) - 1); }
  function fmtTime(s) { return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  Studio._memoryLogic = { shuffle: shuffleArr, clip: clip, pickPairs: pickPairs, buildTiles: buildTiles, isMatch: isMatch, stars: stars, buildTF: buildTF, tfPoints: tfPoints, fmtTime: fmtTime };

  if (typeof module !== 'undefined' && module.exports) module.exports = Studio._memoryLogic;
  if (typeof document === 'undefined' || typeof Studio.register !== 'function') return;

  /* ---------- DOM ---------- */
  function h(tag, attrs) {
    var e = document.createElement(tag); attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) app(e, arguments[i]);
    return e;
  }
  function app(e, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) return c.forEach(function (x) { app(e, x); });
    e.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  var timers = [], keyHandler = null;
  function cleanup() {
    timers.forEach(function (t) { clearInterval(t); clearTimeout(t); }); timers = [];
    if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; }
  }
  function best(key) { return (Studio.store.get('memoryBest', {}) || {})[key]; }
  function setBest(key, val) { var b = Studio.store.get('memoryBest', {}) || {}; b[key] = val; Studio.store.set('memoryBest', b); }
  function reward(xp) { if (Studio.stats) { Studio.stats.touch(1); Studio.stats.addXp(xp); } Studio.bus.emit('activity', { type: 'memory', count: 1 }); }

  Studio.register({
    id: 'memory', title: 'Memory & jeux', icon: '🎮', order: 6, needsDoc: false,
    render: function (container, ctx) {
      cleanup();
      var deckId = '';
      if (ctx && ctx.docId) {
        var dd = Studio.store.list('decks').filter(function (d) { return d.docId === ctx.docId; })[0];
        if (dd) deckId = dd.id;
      }
      /* Séance courte (écran « Aujourd'hui ») : params {deckId, pairs, session:{onDone(result), cancel?}} */
      var sess = ctx && ctx.params && ctx.params.session && typeof ctx.params.session.onDone === 'function' ? ctx.params.session : null;
      if (sess) {
        if (ctx.params.deckId) deckId = ctx.params.deckId;
        var np = Math.max(3, parseInt(ctx.params.pairs, 10) || 4);
        if (uniqueCount(pool()) < 3) { var sd = sess; sess = null; sd.onDone({ kind: 'memory', skipped: true }); }
        else { sess.cancel = function () { cleanup(); return { kind: 'memory', stopped: true }; }; memoryGame(np); }
      } else hub();

      function pool() {
        var decks = Studio.store.list('decks');
        if (deckId) decks = decks.filter(function (d) { return d.id === deckId; });
        var cards = []; decks.forEach(function (d) { cards = cards.concat(d.cards || []); });
        return cards;
      }
      function uniqueCount(cards) { return pickPairs(cards, 1000).length; }

      function hub() {
        cleanup(); clear(container);
        var decks = Studio.store.list('decks'), cards = pool(), avail = uniqueCount(cards);
        container.appendChild(h('div', { class: 'card' }, h('h2', { text: '🎮 Memory & jeux' }),
          h('p', { text: 'Révise en jouant : les jeux utilisent les cartes de tes decks.' })));
        if (!decks.length || avail < 3) {
          var e = h('div'); container.appendChild(e);
          Studio.ui.empty(e, { icon: '🎮', title: decks.length ? 'Il faut au moins 3 cartes' : 'Pas encore de deck',
            text: decks.length ? 'Ajoute quelques cartes à un deck pour débloquer les jeux.' : 'Génère des flashcards depuis un cours : elles serviront de matière aux jeux.',
            cta: { label: 'Aller aux flashcards', onClick: function () { Studio.go('flashcards'); } } });
          return;
        }
        var sel = h('select', { id: 'mem-deck', 'aria-label': 'Deck utilisé', onchange: function () { deckId = sel.value; hub(); } },
          h('option', { value: '' }, 'Tous les decks'));
        decks.forEach(function (d) { var o = h('option', { value: d.id }, d.title + ' (' + (d.cards || []).length + ')'); if (d.id === deckId) o.selected = true; sel.appendChild(o); });
        container.appendChild(h('p', null, h('label', { for: 'mem-deck', text: 'Deck : ' }), sel, ' ', h('span', { class: 'badge', text: avail + ' paires utilisables' })));

        var diffBox = h('div', { role: 'group', 'aria-label': 'Difficulté du memory', style: 'display:flex;gap:.5rem;flex-wrap:wrap' });
        [[6, 'Facile'], [8, 'Moyen'], [12, 'Difficile']].forEach(function (d) {
          var b = best('memory' + d[0]);
          diffBox.appendChild(h('button', { class: d[0] === 6 ? 'btn btn-primary' : 'btn', type: 'button', disabled: avail < d[0] ? true : null, title: avail < d[0] ? 'Pas assez de cartes' : null,
            onclick: function () { memoryGame(d[0]); } }, d[1] + ' · ' + d[0] + ' paires' + (b ? ' (record ' + fmtTime(b.time) + ', ' + b.moves + ' coups)' : '')));
        });
        if (avail < 6) diffBox.appendChild(h('button', { class: 'btn btn-ghost', type: 'button', onclick: function () { memoryGame(avail); } }, 'Mini · ' + avail + ' paires'));
        var bestTf = best('tf');
        container.appendChild(h('div', { class: 'grid' },
          h('div', { class: 'card' }, h('h3', { text: '🧩 Memory' }), h('p', { text: 'Retrouve les paires terme / définition en un minimum de coups.' }), diffBox),
          h('div', { class: 'card' }, h('h3', { text: '🔗 Associations' }), h('p', { text: 'Relie chaque terme à sa définition.' }),
            h('button', { class: 'btn btn-primary', type: 'button', onclick: matching }, 'Jouer')),
          h('div', { class: 'card' }, h('h3', { text: '⚡ Vrai ou faux chrono' }), h('p', { text: '60 secondes, enchaîne les bonnes réponses pour faire grimper ta série.' }),
            h('button', { class: 'btn btn-primary', type: 'button', onclick: trueFalse }, 'Jouer' + (bestTf ? ' (record ' + bestTf.score + ' pts)' : '')))));
      }

      function gameShell(title, extra) {
        cleanup(); clear(container);
        var stage = h('div');
        container.appendChild(h('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:.5rem;flex-wrap:wrap' },
          sess ? h('span') : h('button', { class: 'btn btn-ghost', type: 'button', onclick: hub }, '← Jeux'), h('strong', { text: title }), extra || null));
        container.appendChild(stage);
        return stage;
      }
      function endCard(stage, titre, lines, again) {
        if (Studio.ui.confetti) Studio.ui.confetti();
        var c = h('div', { class: 'card', style: 'text-align:center' }, h('h2', { text: titre, tabindex: '-1' }), lines.map(function (l) { return h('p', { text: l }); }),
          h('div', { style: 'display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap' },
            h('button', { class: 'btn btn-primary', type: 'button', onclick: again }, 'Rejouer'), h('button', { class: 'btn btn-ghost', type: 'button', onclick: hub }, 'Autres jeux')));
        stage.appendChild(c); c.querySelector('h2').focus();
      }

      /* ----- Memory classique ----- */
      function memoryGame(n) {
        var pairs = pickPairs(pool(), n);
        if (pairs.length < 3) return hub();
        n = pairs.length;
        var tiles = buildTiles(pairs), open = [], matched = 0, moves = 0, secs = 0, locked = false, started = false;
        var info = h('span', { 'aria-live': 'off' });
        var stage = gameShell('Memory · ' + n + ' paires', info);
        function upd() { info.textContent = '⏱ ' + fmtTime(secs) + ' · ' + moves + ' coups · ' + matched + '/' + n; }
        upd();
        var live = h('p', { class: 'badge', role: 'status', 'aria-live': 'polite' });
        var grid = h('div', { class: 'memory-grid', style: 'grid-template-columns:repeat(' + (n <= 6 ? 3 : 4) + ',minmax(0,1fr))' });
        var btns = tiles.map(function (t, i) {
          var b = h('button', { class: 'tile', type: 'button', 'aria-label': 'Tuile ' + (i + 1) + ' face cachée', style: 'min-height:4.5rem;overflow:hidden;word-break:break-word;font-size:.85rem', onclick: function () { flipTile(i); } });
          b.textContent = '?';
          grid.appendChild(b); return b;
        });
        stage.appendChild(live); stage.appendChild(grid);
        function show(i, on) {
          var b = btns[i];
          b.classList.toggle('is-flipped', on);
          b.textContent = on ? tiles[i].text : '?';
          b.setAttribute('aria-label', on ? (tiles[i].side === 'term' ? 'Terme : ' : 'Définition : ') + tiles[i].text : 'Tuile ' + (i + 1) + ' face cachée');
        }
        function flipTile(i) {
          if (locked || open.indexOf(i) >= 0 || btns[i].classList.contains('is-found')) return;
          if (!started) { started = true; timers.push(setInterval(function () { secs++; upd(); }, 1000)); }
          show(i, true); open.push(i);
          if (open.length < 2) return;
          moves++; var a = open[0], b = open[1]; open = [];
          if (isMatch(tiles[a], tiles[b])) {
            [a, b].forEach(function (k) { btns[k].classList.add('is-found'); btns[k].setAttribute('aria-disabled', 'true'); });
            matched++; live.textContent = 'Paire trouvée !'; upd();
            if (matched === n) win();
          } else {
            locked = true; live.textContent = 'Raté, réessaie.'; upd();
            btns[a].classList.add('is-error'); btns[b].classList.add('is-error');
            timers.push(setTimeout(function () { [a, b].forEach(function (k) { btns[k].classList.remove('is-error'); show(k, false); }); locked = false; }, 1000));
          }
        }
        function win() {
          cleanup();
          var s = stars(moves, n), b = best('memory' + n), rec = !b || secs < b.time || (secs === b.time && moves < b.moves);
          if (rec) setBest('memory' + n, { time: secs, moves: moves });
          reward(n * 3 + s * 5);
          if (sess) return sess.onDone({ kind: 'memory', pairs: n, moves: moves, secs: secs, stars: s, xp: n * 3 + s * 5 });
          endCard(stage, '🎉 Bravo ! ' + new Array(s + 1).join('⭐'), [fmtTime(secs) + ' · ' + moves + ' coups' + (rec ? ' · nouveau record !' : ''), '+' + (n * 3 + s * 5) + ' XP'], function () { memoryGame(n); });
        }
      }

      /* ----- Associations à relier ----- */
      function matching() {
        var pairs = pickPairs(pool(), 6); n0();
        function n0() {
          var n = pairs.length; if (n < 3) return hub();
          var stage = gameShell('Associations');
          var left = shuffleArr(pairs.map(function (p) { return { key: p.id + ':t', pairId: p.id, text: p.term }; }));
          var right = shuffleArr(pairs.map(function (p) { return { key: p.id + ':d', pairId: p.id, text: p.def }; }));
          var selL = null, selR = null, done = 0, errors = 0;
          var live = h('p', { class: 'badge', role: 'status', 'aria-live': 'polite', text: 'Choisis un terme puis sa définition.' });
          var colL = h('div', { style: 'display:grid;gap:.5rem;align-content:start' }), colR = h('div', { style: 'display:grid;gap:.5rem;align-content:start' });
          var bl = [], br = [];
          function mk(item, col, list, side) {
            var b = h('button', { class: 'match-item', type: 'button', 'aria-pressed': 'false', onclick: function () { choose(side, item, b); } }, item.text);
            list.push(b); col.appendChild(b);
          }
          left.forEach(function (it) { mk(it, colL, bl, 'L'); }); right.forEach(function (it) { mk(it, colR, br, 'R'); });
          stage.appendChild(live);
          stage.appendChild(h('div', { class: 'grid' }, h('div', null, h('h3', { text: 'Termes' }), colL), h('div', null, h('h3', { text: 'Définitions' }), colR)));
          function mark(b, on) { b.className = on ? 'match-item is-selected' : 'match-item'; b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
          function choose(side, item, b) {
            if (b.disabled) return;
            if (side === 'L') { if (selL) mark(selL.b, false); selL = { item: item, b: b }; mark(b, true); }
            else { if (selR) mark(selR.b, false); selR = { item: item, b: b }; mark(b, true); }
            if (!selL || !selR) return;
            var l = selL, r = selR; selL = selR = null;
            if (l.item.pairId === r.item.pairId) {
              [l.b, r.b].forEach(function (x) { x.disabled = true; x.className = 'match-item is-found'; x.textContent = '✅ ' + x.textContent; });
              done++; live.textContent = 'Bien vu ! ' + done + '/' + n;
              if (done === n) {
                var pts = Math.max(0, n * 10 - errors * 3); reward(pts);
                endCard(stage, '🎉 Toutes les associations sont bonnes !', [errors ? errors + ' erreur(s)' : 'Sans faute !', '+' + pts + ' XP'], function () { pairs = pickPairs(pool(), 6); n0(); });
              }
            } else {
              errors++; l.b.className = r.b.className = 'match-item is-error'; live.textContent = 'Ce n\'est pas la bonne association (' + errors + ' erreur(s)).';
              timers.push(setTimeout(function () { mark(l.b, false); mark(r.b, false); }, 500));
            }
          }
        }
      }

      /* ----- Vrai ou faux chrono ----- */
      function trueFalse() {
        var items = buildTF(pool(), 200);
        if (!items.length) return hub();
        var left = 60, i = 0, streak = 0, bestStreak = 0, score = 0, good = 0, ended = false;
        var info = h('span');
        var stage = gameShell('Vrai ou faux', info);
        var box = h('div', { class: 'card', style: 'text-align:center' }); stage.appendChild(box);
        var live = h('p', { role: 'status', 'aria-live': 'polite' });
        function upd() { info.textContent = '⏱ ' + left + ' s · ' + score + ' pts · série ' + streak + ' 🔥'; }
        timers.push(setInterval(function () { left--; upd(); if (left <= 0) end(); }, 1000));
        keyHandler = function (ev) {
          if (!container.isConnected) return cleanup();
          if (ended) return;
          var k = ev.key.toLowerCase();
          if (k === 'v' || k === '1' || k === 'arrowleft') answer(true); else if (k === 'f' || k === '2' || k === 'arrowright') answer(false);
        };
        document.addEventListener('keydown', keyHandler);
        function draw() {
          clear(box); var it = items[i % items.length];
          box.appendChild(h('p', { class: 'badge', text: 'Cette définition correspond-elle au terme ?' }));
          box.appendChild(h('h3', { text: it.term })); box.appendChild(h('p', { text: '« ' + it.shown + ' »' }));
          box.appendChild(h('div', { style: 'display:flex;gap:.5rem;justify-content:center' },
            h('button', { class: 'btn btn-primary', type: 'button', onclick: function () { answer(true); } }, '✅ Vrai ', h('span', { class: 'kbd', text: 'V' })),
            h('button', { class: 'btn btn-ghost', type: 'button', onclick: function () { answer(false); } }, '❌ Faux ', h('span', { class: 'kbd', text: 'F' }))));
          box.appendChild(live);
        }
        function answer(v) {
          if (ended) return; var it = items[i % items.length], ok = v === it.truth;
          if (ok) { streak++; bestStreak = Math.max(bestStreak, streak); score += tfPoints(streak); good++; live.textContent = ''; }
          else { streak = 0; live.textContent = ''; }
          var msg = ok ? '✅ Bonne réponse !' : '❌ Raté : la bonne définition de « ' + it.term + ' » est « ' + it.def + ' »';
          i++; upd(); draw(); live.textContent = msg;
        }
        function end() {
          if (ended) return; ended = true; cleanup(); clear(box);
          var b = best('tf'), rec = !b || score > b.score;
          if (rec) setBest('tf', { score: score, streak: bestStreak });
          reward(Math.round(score / 5));
          endCard(box, '⏱ Temps écoulé !', [score + ' points · ' + good + ' bonnes réponses sur ' + i, 'Meilleure série : ' + bestStreak + (rec ? ' · nouveau record !' : ''), '+' + Math.round(score / 5) + ' XP'], trueFalse);
        }
        upd(); draw();
      }
    }
  });
})();
