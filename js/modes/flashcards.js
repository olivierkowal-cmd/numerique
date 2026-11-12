/* Studio — mode Flashcards (répétition espacée SM-2). Dépend uniquement du contrat Studio.* */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var Studio = root.Studio = root.Studio || {};

  var DAY = 86400000;

  /* ---------- SM-2 pur et testable ----------
     grade : 0 À revoir, 1 Difficile, 2 Bien, 3 Facile
     Retourne une NOUVELLE carte (ne modifie pas l'entrée). now optionnel (ms). */
  function sm2(card, grade, now) {
    now = typeof now === 'number' ? now : Date.now();
    grade = Math.max(0, Math.min(3, grade | 0));
    var c = {};
    for (var k in card) c[k] = card[k];
    var ease = typeof c.ease === 'number' ? c.ease : 2.5;
    var reps = c.reps || 0;
    var interval = c.interval || 0;
    var lapses = c.lapses || 0;

    if (grade === 0) {
      reps = 0; lapses += 1; interval = 0;
      ease = Math.max(1.3, ease - 0.2);
      c.due = now + 10 * 60000; // revue dans 10 minutes
    } else {
      if (grade === 1) {
        ease = Math.max(1.3, ease - 0.15);
        interval = reps === 0 ? 1 : Math.max(interval + 1, Math.round(interval * 1.2));
      } else if (grade === 2) {
        interval = reps === 0 ? 1 : reps === 1 ? 6 : Math.round(interval * ease);
      } else {
        ease = ease + 0.15;
        interval = reps === 0 ? 3 : reps === 1 ? 8 : Math.round(interval * ease * 1.3);
      }
      reps += 1;
      c.due = now + interval * DAY;
    }
    c.ease = Math.round(ease * 100) / 100;
    c.reps = reps; c.interval = interval; c.lapses = lapses;
    c.box = interval === 0 ? 0 : interval < 3 ? 1 : interval < 7 ? 2 : interval < 21 ? 3 : interval < 60 ? 4 : 5;
    c.last = now;
    return c;
  }
  Studio.sm2 = sm2;

  function isDue(card, now) { return (card.due || 0) <= (now || Date.now()); }
  function dueCards(cards, now) {
    return cards.filter(function (c) { return isDue(c, now); })
      .sort(function (a, b) { return (a.due || 0) - (b.due || 0); });
  }
  function previewInterval(card, grade) {
    var n = sm2(card, grade, 0);
    if (grade === 0) return '10 min';
    return n.interval <= 1 ? '1 j' : n.interval + ' j';
  }
  Studio._flashLogic = { sm2: sm2, isDue: isDue, dueCards: dueCards, previewInterval: previewInterval };

  if (typeof module !== 'undefined' && module.exports) module.exports = Studio._flashLogic;
  if (typeof document === 'undefined' || typeof Studio.register !== 'function') return;

  /* ---------- helpers DOM ---------- */
  function h(tag, attrs) {
    var e = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'value') e.value = v;
      else e.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) append(e, arguments[i]);
    return e;
  }
  function append(e, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) return c.forEach(function (x) { append(e, x); });
    e.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function uid() { return Studio.ui && Studio.ui.uid ? Studio.ui.uid() : 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function toast(m, t) { if (Studio.ui && Studio.ui.toast) Studio.ui.toast(m, t); }
  function confirmP(msg) { return Promise.resolve(Studio.ui.confirm(msg)); }
  function plural(n, s, p) { return n + ' ' + (n > 1 ? (p || s + 's') : s); }
  function newCard(front, back, hint) {
    return { id: uid(), front: front, back: back, hint: hint || '', box: 0, ease: 2.5, interval: 0, reps: 0, lapses: 0, due: Date.now() };
  }
  function saveCards(deck) { if (!Studio.store.update('decks', deck.id, { cards: deck.cards })) toast('Modification non enregistrée : plus de place.', 'error'); }

  var keyHandler = null;
  function unbindKeys() { if (keyHandler) { document.removeEventListener('keydown', keyHandler); keyHandler = null; } }

  Studio.register({
    id: 'flashcards', title: 'Flashcards', icon: '🃏', order: 4, needsDoc: false,
    render: function (container, ctx) {
      unbindKeys();
      var state = { view: 'list', deckId: null };
      /* Séance courte (écran « Aujourd'hui ») : params {deckId, limit, session:{onDone(result), cancel?}} */
      var sess = ctx && ctx.params && ctx.params.session && typeof ctx.params.session.onDone === 'function' ? ctx.params.session : null;
      var sessLimit = sess ? Math.max(1, parseInt(ctx.params.limit, 10) || 8) : 0;
      if (ctx && ctx.params && ctx.params.deckId) {
        var d0 = Studio.store.byId('decks', ctx.params.deckId);
        if (d0) { state.view = ctx.params.review || sess ? 'session' : 'list'; state.deckId = d0.id; state.all = false; }
      }
      show();

      function show() {
        unbindKeys();
        clear(container);
        if (state.view === 'session') return sessionView();
        if (state.view === 'edit') return editView();
        listView();
      }

      /* ----- Liste des decks ----- */
      function listView() {
        var doc = ctx && ctx.docId ? Studio.store.byId('docs', ctx.docId) : null;
        var decks = Studio.store.list('decks');
        var wrap = h('div', { class: 'flashcards' });
        var countIn = h('input', { type: 'number', min: 5, max: 60, value: 20, id: 'fc-count', style: 'width:5rem', 'aria-label': 'Nombre de cartes à générer' });
        var head = h('div', { class: 'card' },
          h('h2', { text: '🃏 Flashcards' }),
          h('p', { text: 'Révise avec la répétition espacée : les cartes difficiles reviennent plus souvent.' }),
          h('div', { style: 'display:flex;gap:.5rem;flex-wrap:wrap;align-items:center' },
            doc ? [h('label', { for: 'fc-count', text: 'Cartes :' }), countIn,
              h('button', { class: 'btn btn-primary', type: 'button', onclick: generate, title: 'À partir de « ' + doc.name + ' »' }, '✨ Fabriquer mes flashcards')] : null,
            h('button', { class: 'btn btn-ghost', type: 'button', onclick: createDeck }, '➕ Nouveau deck vide')),
          doc ? null : h('p', { class: 'badge', text: 'Choisis un document dans la bibliothèque pour générer des cartes automatiquement.' }));
        wrap.appendChild(head);
        container.appendChild(wrap);

        if (!decks.length) {
          var e = h('div'); wrap.appendChild(e);
          Studio.ui.empty(e, {
            icon: '🃏', title: 'Aucun deck pour l\'instant',
            text: doc ? 'Génère des flashcards depuis ton cours, ou crée un deck à la main.' : 'Dépose un cours dans la bibliothèque, ou crée un deck à la main.',
            cta: { label: 'Créer un deck', onClick: createDeck }
          });
          return;
        }
        var grid = h('div', { class: 'grid', style: 'margin-top:1rem' });
        decks.forEach(function (d) {
          var due = dueCards(d.cards || []).length, total = (d.cards || []).length;
          grid.appendChild(h('div', { class: 'card' },
            h('h3', { text: d.title }),
            h('p', null, h('span', { class: 'badge', text: plural(total, 'carte') }), ' ',
              h('span', { class: 'chip', text: due ? plural(due, 'à réviser', 'à réviser') : 'À jour ✔' })),
            h('div', { style: 'display:flex;gap:.5rem;flex-wrap:wrap' },
              h('button', { class: 'btn btn-primary', type: 'button', disabled: total ? null : true, onclick: function () { start(d.id, false); } }, due ? 'Réviser (' + due + ')' : 'Tout réviser'),
              due && due < total ? h('button', { class: 'btn btn-ghost', type: 'button', onclick: function () { start(d.id, true); } }, 'Tout le deck') : null,
              h('button', { class: 'btn btn-ghost', type: 'button', onclick: function () { state.view = 'edit'; state.deckId = d.id; show(); } }, '✏️ Modifier'),
              h('button', { class: 'btn btn-ghost', type: 'button', 'aria-label': 'Supprimer le deck ' + d.title, onclick: function () {
                confirmP('Supprimer le deck « ' + d.title + ' » ?').then(function (ok) { if (ok) { Studio.store.remove('decks', d.id); Studio.bus.emit('decks:changed'); show(); } });
              } }, '🗑️'))));
        });
        wrap.appendChild(grid);

        function start(id, all) { state.view = 'session'; state.deckId = id; state.all = all; show(); }
        function generate() {
          var n = Math.max(5, Math.min(60, parseInt(countIn.value, 10) || 20));
          clear(container);
          Studio.ui.loading(container, 'Création de tes flashcards…');
          Promise.resolve(Studio.gen.flashcards(doc, { count: n })).then(function (deck) {
            Studio.bus.emit('decks:changed');
            toast('Deck créé : ' + plural((deck.cards || []).length, 'carte'), 'success');
            state.view = 'list'; show();
          }).catch(function (err) { toast((err && err.message) || 'Génération impossible.', 'error'); show(); });
        }
        function createDeck() {
          var d = Studio.store.add('decks', { id: uid(), docId: doc ? doc.id : null, title: 'Nouveau deck', createdAt: Date.now(), cards: [] });
          if (!d) return toast('Plus de place : supprime un vieux cours ou exporte tes données.', 'error');   // rien n'a été enregistré
          Studio.bus.emit('decks:changed');
          state.view = 'edit'; state.deckId = d.id; show();
        }
      }

      /* ----- Édition manuelle ----- */
      function editView() {
        var deck = Studio.store.byId('decks', state.deckId);
        if (!deck) { state.view = 'list'; return show(); }
        deck.cards = deck.cards || [];
        var titleIn = h('input', { type: 'text', value: deck.title, 'aria-label': 'Titre du deck', style: 'width:100%', onchange: function () {
          deck.title = titleIn.value.trim() || 'Deck sans titre'; if (!Studio.store.update('decks', deck.id, { title: deck.title })) toast('Titre non enregistré : plus de place.', 'error'); Studio.bus.emit('decks:changed');
        } });
        var list = h('div', { class: 'grid', style: 'margin-top:1rem' });
        container.appendChild(h('div', null,
          h('div', { class: 'card' },
            h('button', { class: 'btn btn-ghost', type: 'button', onclick: function () { state.view = 'list'; show(); } }, '← Retour aux decks'),
            h('h2', { text: 'Modifier le deck' }), h('label', null, 'Titre ', titleIn)),
          list));

        function draw() {
          clear(list);
          var addFront = h('textarea', { rows: 2, placeholder: 'Question / terme', 'aria-label': 'Recto de la nouvelle carte' });
          var addBack = h('textarea', { rows: 2, placeholder: 'Réponse / définition', 'aria-label': 'Verso de la nouvelle carte' });
          var addHint = h('input', { type: 'text', placeholder: 'Indice (facultatif)', 'aria-label': 'Indice' });
          list.appendChild(h('form', { class: 'card', onsubmit: function (ev) {
            ev.preventDefault();
            if (!addFront.value.trim() || !addBack.value.trim()) { toast('Remplis le recto et le verso.', 'error'); return; }
            deck.cards.push(newCard(addFront.value.trim(), addBack.value.trim(), addHint.value.trim()));
            saveCards(deck); Studio.bus.emit('decks:changed'); draw();
          } }, h('h3', { text: '➕ Nouvelle carte' }), addFront, addBack, addHint,
            h('button', { class: 'btn btn-primary', type: 'submit' }, 'Ajouter la carte')));
          deck.cards.forEach(function (c, i) {
            var f = h('textarea', { rows: 2, 'aria-label': 'Recto carte ' + (i + 1) }, c.front); f.value = c.front;
            var b = h('textarea', { rows: 2, 'aria-label': 'Verso carte ' + (i + 1) }, c.back); b.value = c.back;
            var hi = h('input', { type: 'text', value: c.hint || '', placeholder: 'Indice', 'aria-label': 'Indice carte ' + (i + 1) });
            function persist() { if (c.flagged && (c.front !== f.value || c.back !== b.value)) c.flagged = false; c.front = f.value; c.back = b.value; c.hint = hi.value; saveCards(deck); }
            f.addEventListener('change', persist); b.addEventListener('change', persist); hi.addEventListener('change', persist);
            list.appendChild(h('div', { class: 'card' }, h('span', { class: 'badge', text: '#' + (i + 1) }),
              c.flagged ? h('span', { class: 'badge', text: ' 🚩 Signalée : modifie-la pour la remettre en jeu' }) : null,
              f, b, hi,
              c.flagged ? h('button', { class: 'btn btn-ghost', type: 'button', onclick: function () { c.flagged = false; saveCards(deck); draw(); } }, '✅ C’est correct, remettre en jeu') : null,
              h('button', { class: 'btn btn-ghost', type: 'button', onclick: function () {
                deck.cards.splice(i, 1); saveCards(deck); Studio.bus.emit('decks:changed'); draw();
              } }, '🗑️ Supprimer')));
          });
        }
        draw();
      }

      /* ----- Session de révision ----- */
      function sessionView() {
        var deck = Studio.store.byId('decks', state.deckId);
        if (!deck) { state.view = 'list'; return show(); }
        var cards = deck.cards || [];
        var queue = (state.all ? cards.slice() : dueCards(cards)).filter(function (c) { return !c.flagged; }).map(function (c) { return c.id; });   // cartes signalées : exclues jusqu'à correction
        var nFlagged = cards.filter(function (c) { return c.flagged; }).length;
        if (state.all) queue = shuffle(queue);
        if (sess) {
          if (!queue.length) queue = shuffle(cards.filter(function (c) { return !c.flagged; }).map(function (c) { return c.id; }));   /* rien de dû : on révise quand même quelques cartes */
          queue = queue.slice(0, sessLimit);
          if (!queue.length) { var sd = sess; sess = null; return sd.onDone({ kind: 'cards', reviewed: 0, total: 0, good: 0, skipped: true }); }
        }
        if (!queue.length) {
          var e = h('div'); container.appendChild(e);
          Studio.ui.empty(e, { icon: nFlagged ? '🚩' : '🎉', title: 'Rien à réviser', text: nFlagged ? 'Des cartes signalées sont mises de côté. Corrige-les dans « Modifier » pour les remettre en jeu.' : 'Toutes les cartes de ce deck sont à jour. Reviens plus tard !',
            cta: { label: 'Réviser tout le deck', onClick: function () { if (cards.length) { state.all = true; show(); } } } });
          container.appendChild(h('button', { class: 'btn btn-ghost', type: 'button', onclick: function () { state.view = 'list'; show(); } }, '← Retour'));
          return;
        }
        var total = queue.length, done = 0, reviewed = 0, counts = [0, 0, 0, 0], flipped = false, finished = false;
        var bar = h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': 0 }, h('div', { class: 'progress-bar', style: 'width:0%' }));
        var counter = h('p', { 'aria-live': 'polite' });
        var stage = h('div');
        container.appendChild(h('div', null,
          h('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:.5rem' },
            sess ? h('span') : h('button', { class: 'btn btn-ghost', type: 'button', onclick: quit }, '← Quitter'), h('strong', { text: deck.title })),
          Studio.trust && Studio.trust.badge ? Studio.trust.badge(deck.engine) : null,
          nFlagged ? h('p', { class: 'badge', text: '🚩 ' + nFlagged + ' carte(s) signalée(s) mise(s) de côté' }) : null,
          bar, counter, stage));

        function current() { return cards.filter(function (c) { return c.id === queue[0]; })[0]; }
        function updateBar() {
          var p = Math.round(done / total * 100);
          var inner = bar.firstChild; inner.style.width = p + '%';
          bar.setAttribute('aria-valuenow', done);
          counter.textContent = done + ' / ' + total + ' cartes' + (queue.length > total - done ? ' (+ ' + (queue.length - (total - done)) + ' à retenter)' : '');
        }
        function showCard() {
          clear(stage); flipped = false; updateBar();
          var c = current();
          if (!c) return finish();
          var card = h('div', { class: 'flip-card', tabindex: 0, role: 'button', 'aria-label': 'Carte. Appuie sur espace pour retourner.', onclick: flip, onkeydown: function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); flip(); } } },
            h('div', { class: 'flip-inner' },
              h('div', { class: 'flip-face flip-front' }, c.imgFront ? h('img', { class: 'card-img', src: c.imgFront, alt: 'Image de la carte' }) : null, h('div', { text: c.front }), c.hint ? h('small', { class: 'badge', text: '💡 ' + c.hint }) : null),
              h('div', { class: 'flip-face flip-back', 'aria-hidden': 'true' }, c.imgBack ? h('img', { class: 'card-img', src: c.imgBack, alt: 'Image de la réponse' }) : null, h('div', { text: c.back }), c.mnemo ? h('small', { class: 'badge', text: '🧠 ' + c.mnemo }) : null)));
          var showBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: flip }, 'Retourner la carte ', h('span', { class: 'kbd', text: 'Espace' }));
          var grades = h('div', { class: 'grid', role: 'group', 'aria-label': 'Note ta réponse', style: 'display:none;margin-top:1rem' });
          [['À revoir', 'btn btn-ghost'], ['Difficile', 'btn btn-ghost'], ['Bien', 'btn btn-primary'], ['Facile', 'btn btn-ghost']].forEach(function (g, i) {
            grades.appendChild(h('button', { class: g[1], type: 'button', onclick: function () { grade(i); } },
              g[0] + ' ', h('span', { class: 'kbd', text: String(i + 1) }), h('small', { text: ' · ' + previewInterval(c, i) })));
          });
          stage.appendChild(card); stage.appendChild(h('div', { style: 'text-align:center;margin-top:1rem' }, showBtn)); stage.appendChild(grades);
          if (Studio.trust && Studio.trust.tools) stage.appendChild(Studio.trust.tools(c, { kind: 'card', parentId: deck.id,
            canViewSource: function () { return flipped; },
            onFlagged: function () {
              queue.shift(); total--; nFlagged++;
              if (!queue.length && !reviewed && !sess) { finished = true; unbindKeys(); state.view = 'list'; show(); } else showCard();
            } }));
          stage._card = card; stage._grades = grades; stage._show = showBtn;
          card.focus();
        }
        function flip() {
          if (!stage._card) return;
          flipped = !flipped;
          stage._card.classList.toggle('is-flipped', flipped);
          stage._card.querySelector('.flip-back').setAttribute('aria-hidden', flipped ? 'false' : 'true');
          stage._grades.style.display = flipped ? '' : 'none';
          stage._show.parentNode.style.display = flipped ? 'none' : '';
        }
        function grade(g) {
          if (!flipped || finished) return;
          var id = queue.shift(), idx = -1;
          cards.forEach(function (c, i) { if (c.id === id) idx = i; });
          cards[idx] = sm2(cards[idx], g);
          saveCards(deck);
          counts[g]++; reviewed++;
          if (g === 0) queue.push(id); else done++;
          showCard();
        }
        function finish() {
          finished = true; unbindKeys(); clear(stage);
          var knew = counts[2] + counts[3];
          if (reviewed) {
            if (Studio.stats) { Studio.stats.touch(reviewed); Studio.stats.addXp(reviewed * 2 + (knew >= reviewed * 0.8 ? 10 : 0)); }
            Studio.bus.emit('activity', { type: 'cards', count: reviewed, score: knew, total: reviewed, perfect: knew === reviewed });
            Studio.bus.emit('decks:changed');
          }
          if (sess) { updateBar(); return sess.onDone({ kind: 'cards', reviewed: reviewed, total: total, good: knew, counts: counts.slice() }); }
          if (Studio.ui.confetti) Studio.ui.confetti();
          updateBar();
          stage.appendChild(h('div', { class: 'card', style: 'text-align:center' },
            h('h2', { text: '🎉 Session terminée !' }),
            h('p', { text: plural(total, 'carte révisée', 'cartes révisées') + ' · ' + Math.round(knew / Math.max(1, reviewed) * 100) + ' % de bonnes réponses.' }),
            h('p', null, h('span', { class: 'badge', text: 'À revoir : ' + counts[0] }), ' ', h('span', { class: 'badge', text: 'Difficile : ' + counts[1] }), ' ',
              h('span', { class: 'badge', text: 'Bien : ' + counts[2] }), ' ', h('span', { class: 'badge', text: 'Facile : ' + counts[3] }),
              ' ', h('span', { class: 'chip', text: '+' + (reviewed * 2) + ' XP' })),
            h('div', { style: 'display:flex;gap:.5rem;justify-content:center;flex-wrap:wrap' },
              h('button', { class: 'btn btn-primary', type: 'button', onclick: function () { state.view = 'list'; show(); } }, 'Retour aux decks'),
              h('button', { class: 'btn btn-ghost', type: 'button', onclick: function () { state.all = true; show(); } }, 'Rejouer tout le deck'))));
        }
        function quit() {
          if (!finished && reviewed && Studio.stats) { Studio.stats.touch(reviewed); Studio.stats.addXp(reviewed); }
          finished = true; state.view = 'list'; show();
        }
        /* arrêt demandé par l'écran « Aujourd'hui » : on garde le progrès (cartes déjà notées) et on rend le résultat partiel */
        if (sess) sess.cancel = function () {
          if (finished) return { kind: 'cards', reviewed: reviewed, total: total, good: counts[2] + counts[3], counts: counts.slice() };
          finished = true; unbindKeys();
          if (reviewed && Studio.stats) { Studio.stats.touch(reviewed); Studio.stats.addXp(reviewed); }
          return { kind: 'cards', reviewed: reviewed, total: total, good: counts[2] + counts[3], counts: counts.slice(), stopped: true };
        };
        keyHandler = function (ev) {
          if (!container.isConnected) return unbindKeys();
          var t = ev.target && ev.target.tagName;
          if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
          if (ev.key === ' ' || ev.code === 'Space') { ev.preventDefault(); if (!finished) flip(); }
          else if (ev.key >= '1' && ev.key <= '4') grade(parseInt(ev.key, 10) - 1);
          else if (ev.key === 'Escape' && !sess) quit();
        };
        document.addEventListener('keydown', keyHandler);
        showCard();
      }

      function shuffle(a) {
        if (Studio.ui && Studio.ui.shuffle) return Studio.ui.shuffle(a);
        a = a.slice();
        for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
        return a;
      }
    }
  });
})();
