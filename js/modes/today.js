/* Studio — écran « Aujourd'hui » : séance de 5 minutes (cartes → mini memory), reprise, quêtes, contrôle.
   Logique pure testable : Studio._todayLogic. Utilise Studio.game / Studio.gen / Studio.crew de façon défensive.
   Libellés : Studio.content.text.today.<clé> remplace les textes par défaut (voir TXT). */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var Studio = root.Studio = root.Studio || {};

  var DAY = 86400000;
  var SEC = { card: 20, question: 25, memory: 60 };   /* estimation : secondes par carte / question / memory de 4 paires */
  var NOT_RESUMABLE = ['today', 'library', 'settings', 'methods'];
  var MODULE_LABEL = { flashcards: 'tes flashcards', memory: 'tes jeux', mnemo: 'tes astuces mémo', mindmap: 'ta carte mentale', chat: 'le chat avec ton cours', dashboard: 'ta progression', templates: 'tes fiches par matière' };

  /* ---------- logique pure ---------- */
  function cardsOf(d) { return (d && d.cards) || []; }
  function dueCount(deck, now) { return cardsOf(deck).filter(function (c) { return (c.due || 0) <= now; }).length; }
  /* deck à utiliser : celui du document actif (le plus « dû »), sinon un autre deck non vide */
  function pickDeck(decks, docId, now) {
    now = now || Date.now();
    var ok = (decks || []).filter(function (d) { return cardsOf(d).length > 0; });
    var mine = ok.filter(function (d) { return d.docId === docId; });
    var list = mine.length ? mine : (docId ? [] : ok);   /* un doc actif sans deck : on en génère un (pas le deck d'un autre cours) */
    list = list.slice().sort(function (a, b) { return dueCount(b, now) - dueCount(a, now) || (b.createdAt || 0) - (a.createdAt || 0); });
    return list[0] || null;
  }
  function countPairsDefault(deck) {
    var seen = {}, n = 0;
    cardsOf(deck).forEach(function (c) {
      var f = String(c.front || '').trim().toLowerCase(), b = String(c.back || '').trim().toLowerCase();
      if (!f || !b || seen[f] || seen['b:' + b]) return;
      seen[f] = seen['b:' + b] = true; n++;
    });
    return n;
  }
  function estimateMinutes(steps) {
    var s = 0;
    (steps || []).forEach(function (st) {
      if (st.kind === 'cards') s += (st.n || 0) * SEC.card;
      else if (st.kind === 'memory') s += SEC.memory;
    });
    return s ? Math.max(1, Math.round(s / 60)) : 0;
  }
  /* Compose la mini-séance à partir de ce qui existe.
     o : {decks, docId, now, countPairs(deck)}
     → { steps:[{kind, label, n, params}], needs:{deck:bool}, minutes } */
  function composeSession(o) {
    o = o || {};
    var now = o.now || Date.now(), counter = o.countPairs || countPairsDefault;
    var deck = pickDeck(o.decks, o.docId, now), steps = [];
    if (deck) {
      var due = dueCount(deck, now), n = Math.min(8, due || cardsOf(deck).length);
      steps.push({ kind: 'cards', module: 'flashcards', label: 'Cartes', n: n, params: { deckId: deck.id, limit: 8 } });
    }
    if (deck) {
      var pairs = Math.min(4, counter(deck));
      if (pairs >= 3) steps.push({ kind: 'memory', module: 'memory', label: 'Memory', n: pairs, params: { deckId: deck.id, pairs: pairs } });
    }
    return { steps: steps, needs: { deck: !deck }, minutes: estimateMinutes(steps), deckId: deck ? deck.id : null };
  }
  /* étapes restant à faire après une pause (les étapes déjà finies, par genre, sont retirées) */
  function remainingSteps(steps, doneKinds) {
    doneKinds = doneKinds || [];
    return (steps || []).filter(function (s) { return doneKinds.indexOf(s.kind) < 0; });
  }
  /* séance enregistrée encore valable aujourd'hui ? */
  function resumableSession(saved, day) {
    if (!saved || saved.day !== day || saved.finished) return null;
    var d = saved.doneKinds || [];
    return d.length ? saved : null;
  }
  /* « Continuer là où j'étais » : dernière page d'étude utile, sinon null */
  function resumeTarget(last, docs, now) {
    now = now || Date.now();
    if (!last || !last.moduleId || NOT_RESUMABLE.indexOf(last.moduleId) >= 0) return null;
    if (now - (last.at || 0) > 14 * DAY) return null;
    var doc = null;
    if (last.docId) {
      doc = (docs || []).filter(function (d) { return d.id === last.docId; })[0];
      if (!doc) return null;
    }
    var what = MODULE_LABEL[last.moduleId] || 'ton activité';
    return { moduleId: last.moduleId, docId: last.docId || null, params: last.params || {}, label: 'Reprendre ' + what + (doc ? ' · ' + doc.name : '') };
  }
  function cleanParams(p) {
    var out = {};
    Object.keys(p || {}).forEach(function (k) { var v = p[k]; if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v; });
    return out;
  }
  /* bilan de séance à partir des résultats d'étapes */
  function summarize(results) {
    var s = { cards: 0, cardsGood: 0, memory: false, good: 0, total: 0 };
    (results || []).forEach(function (r) {
      if (!r) return;
      if (r.kind === 'cards') { s.cards += r.reviewed || 0; s.cardsGood += r.good || 0; }
      else if (r.kind === 'memory' && !r.skipped && !r.stopped) s.memory = true;
    });
    s.good = s.cardsGood + (s.memory ? 1 : 0);
    s.total = s.cards + (s.memory ? 1 : 0);
    return s;
  }
  function daysUntil(day, now) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
    if (!m) return null;
    var a = new Date(now || Date.now()); a = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    return Math.round((new Date(+m[1], +m[2] - 1, +m[3]) - a) / DAY);
  }
  function greeting(hour) { return hour < 6 ? 'Déjà debout ?' : hour < 12 ? 'Bonjour !' : hour < 18 ? 'Salut !' : 'Bonsoir !'; }
  function plural(n, s, p) { return n + ' ' + (n > 1 ? (p || s + 's') : s); }

  Studio._todayLogic = { pickDeck: pickDeck, composeSession: composeSession, estimateMinutes: estimateMinutes, remainingSteps: remainingSteps,
    resumableSession: resumableSession, resumeTarget: resumeTarget, summarize: summarize, daysUntil: daysUntil, greeting: greeting, cleanParams: cleanParams, countPairs: countPairsDefault };
  if (typeof module !== 'undefined' && module.exports) module.exports = Studio._todayLogic;
  if (typeof document === 'undefined' || typeof Studio.register !== 'function') return;

  /* ---------- textes (courts, 12-13 ans) ---------- */
  var TXT = {
    go: '▶ 5 minutes', goSub: 'Cartes et mini-jeu.',
    stop: 'Pause', stopped: 'Pause ! Ton progrès est gardé.', preparing: 'L’équipe prépare ta séance…',
    nothing: 'Je n’ai pas assez de matière pour une séance. Ajoute un cours plus long.',
    next: 'Continuer', done: 'Terminer', again: 'Encore 5 minutes',
    noDoc: { title: 'Ajoute un cours pour commencer', text: 'Dès que tu as un cours, ta séance de 5 minutes est prête.', cta: 'Ajouter un cours' }
  };
  /* Grille « Tous mes outils » : un emoji et un mot par outil (rien n'est caché derrière un bouton). */
  var TOOL_LABEL = { dashboard: 'Progrès', library: 'Bibliothèque', subjects: 'Matières', room: 'Mon bureau', flashcards: 'Flashcards', memory: 'Memory', mnemo: 'Astuces', mindmap: 'Mind map', chat: 'Chat', methods: 'Méthodes', settings: 'Réglages', office: 'Le Bureau', parents: 'Parents' };
  function toolsGrid() {
    var hidden = { today: 1, account: 1, prof: 1, office: 1 };
    var list = (Studio.modules ? Studio.modules() : []).filter(function (m) { return !hidden[m.id] && !(Studio.chapters && Studio.chapters.isChapterModule(m.id)); });
    var grid = el('div', { class: 'today-tools-grid' });
    list.forEach(function (m) {
      grid.appendChild(el('a', { class: 'today-tool', href: '#/' + m.id, 'data-module': m.id },
        el('span', { class: 'today-tool-icon', 'aria-hidden': 'true' }, m.icon || '🔹'),
        el('span', { class: 'today-tool-name' }, TOOL_LABEL[m.id] || m.title)));
    });
    return el('section', { class: 'today-tools', 'aria-labelledby': 'today-tools-h' }, el('h2', { id: 'today-tools-h' }, 'Tous mes outils'), grid);
  }
  /* « Mes chapitres » : les chapitres du site, avec verrous et progression (module js/modes/chapters.js) */
  function chaptersHome() { try { return Studio.chapters && Studio.chapters.homeSection ? Studio.chapters.homeSection() : null; } catch (e) { return null; } }
  function T(k) { var o = Studio.content && Studio.content.text && Studio.content.text.today; return (o && o[k] != null) ? o[k] : TXT[k]; }

  /* ---------- helpers DOM ---------- */
  var el = function () { return Studio.ui.el.apply(null, arguments); };
  function toast(m, t) { if (Studio.ui && Studio.ui.toast) Studio.ui.toast(m, t); }
  function day() { return Studio.stats.dayKey(); }
  function num(f, def) { try { var v = f(); return typeof v === 'number' && isFinite(v) ? v : def; } catch (e) { return def; } }
  function coins() { return Studio.game && Studio.game.coins ? num(function () { return Studio.game.coins(); }, null) : null; }
  function xp() { return num(function () { return Studio.stats.get().xp; }, 0); }
  function coachSay(sit) {
    try {
      var c = Studio.game && Studio.game.coach && Studio.game.coach();
      if (c && typeof c.say === 'function') {
        var t = c.say(sit);
        if (t) return { name: c.name || 'Ton coach', emoji: c.emoji || '', text: String(t) };
      }
    } catch (e) { /* le coach est facultatif */ }
    return null;
  }
  function fallbackLine(sit, pct) {
    var tx = Studio.content && Studio.content.text;
    try {
      if (sit === 'done' && tx && tx.encourage) return tx.encourage(pct == null ? 80 : pct);
      if (tx && tx.tipOfDay && sit === 'start') return 'Astuce du jour : ' + tx.tipOfDay();
    } catch (e) { /* ignore */ }
    return sit === 'done' ? 'Bravo, c’est fait !' : greeting(new Date().getHours()) + ' Une petite séance ?';
  }
  function saveSession(s) { Studio.store.set('todaySession', s); }
  function loadSession() { return Studio.store.get('todaySession', null); }

  /* mémorise la dernière page d'étude pour « Continuer là où j'étais » */
  Studio.bus.on('nav', function (d) {
    if (!d || !d.moduleId || NOT_RESUMABLE.indexOf(d.moduleId) >= 0) return;
    Studio.store.set('lastNav', { moduleId: d.moduleId, docId: d.docId || null, params: cleanParams(d.params), at: Date.now() });
  });

  /* ---------- module ---------- */
  Studio.register({
    id: 'today', title: 'Accueil', icon: '☀️', order: 0, needsDoc: false,
    render: function (container, ctx) {
      var runToken = 0;   /* invalide les callbacks d'une étape abandonnée */
      var docs = Studio.store.list('docs');
      if (!docs.length) {
        Studio.ui.empty(container, { icon: '☀️', title: T('noDoc').title, text: T('noDoc').text, cta: { label: T('noDoc').cta, go: 'library' } });
        var chapBlock = chaptersHome();   /* les chapitres d'abord, puis l'invitation à ajouter un cours (empty() vide le conteneur : on insère après) */
        if (chapBlock) container.insertBefore(el('div', { class: 'today' }, chapBlock), container.firstChild);
        container.appendChild(el('div', { class: 'today' }, toolsGrid()));
        return;
      }
      home();

      function composition() {
        var docId = Studio.activeDocId();
        return composeSession({ decks: Studio.store.list('decks'), docId: docId, now: Date.now(),
          countPairs: function (deck) {
            try { return Studio._memoryLogic.pickPairs(deck.cards || [], 1000).length; } catch (e) { return countPairsDefault(deck); }
          } });
      }

      /* ----- accueil ----- */
      function home() {
        runToken++;
        Studio.ui.clear(container);
        var comp = composition(), saved = resumableSession(loadSession(), day());
        var doc = Studio.activeDoc();
        var coach = coachSay('start'), line = coach ? coach.text : fallbackLine('start');
        var streak = num(function () { return Studio.stats.currentStreak(); }, 0);

        var wrap = el('div', { class: 'today' });
        wrap.appendChild(el('div', { class: 'today-coach card' },
          el('div', { class: 'today-coach-face', 'aria-hidden': 'true' }, coach && coach.emoji ? coach.emoji : null,
            coach && coach.emoji ? null : el('span', { html: '<svg class="mascot" viewBox="0 0 120 120" width="64" height="64" focusable="false"><use href="#studio-mascot"/></svg>' })),
          el('div', null, el('h1', { class: 'today-title' }, '☀️ Aujourd’hui'),
            el('p', { class: 'today-say' }, (coach && coach.name ? coach.name + ' : ' : '') + line),
            streak > 0 ? el('span', { class: 'chip' }, '🔥 ' + plural(streak, 'jour') + ' d’affilée') : null)));

        var goBtn = el('button', { type: 'button', class: 'btn btn-primary btn-lg today-go', onclick: function () { start(); } },
          el('span', { class: 'today-go-main' }, T('go')),
          el('span', { class: 'today-go-sub' }, comp.steps.length ? (comp.minutes ? '≈ ' + comp.minutes + ' min · ' : '') + T('goSub') : T('goSub')));
        wrap.appendChild(el('div', { class: 'today-go-wrap' }, goBtn,
          doc ? el('p', { class: 'today-doc' }, '📚 ' + doc.name) : null));

        var tiles = el('div', { class: 'today-tiles' });
        /* Continuer */
        var rt = resumeTarget(Studio.store.get('lastNav', null), docs, Date.now());
        if (saved) {
          var left = remainingSteps(composition().steps, saved.doneKinds);
          if (left.length) tiles.appendChild(tile('⏯️', 'Ma séance en pause', 'Il reste ' + plural(left.length, 'étape') + '.', 'Reprendre', function () { start(saved); }));
        }
        if (rt) tiles.appendChild(tile('📖', 'Continuer là où j’étais', rt.label, 'Continuer', function () {
          if (rt.docId && rt.docId !== Studio.activeDocId()) Studio.store.set('activeDoc', rt.docId);
          Studio.go(rt.moduleId, rt.params);
        }));
        /* Quêtes */
        var quests = [];
        try { quests = (Studio.game && Studio.game.quests && Studio.game.quests()) || []; } catch (e) { quests = []; }
        if (Array.isArray(quests) && quests.length) {
          var qt = el('div', { class: 'today-quests' });
          quests.slice(0, 3).forEach(function (q) {
            if (!q) return;
            var label = q.label || q.title || q.text || q.name || 'Quête', goal = +(q.goal || q.target || q.total || q.max || 0), prog = +(q.progress || q.done_n || q.value || q.n || 0);
            var ok = q.done === true || q.completed === true || (goal > 0 && prog >= goal);
            qt.appendChild(el('div', { class: 'today-quest' + (ok ? ' is-done' : '') },
              el('span', null, (ok ? '✔ ' : '◻ ') + label), goal > 0 ? el('small', null, Math.min(prog, goal) + '/' + goal) : null));
          });
          tiles.appendChild(tile('🎯', 'Mes quêtes du jour', qt, null, null));
        }
        /* Contrôle bientôt ? */
        var plan = Studio.store.get('plan', null), dl = plan && plan.exam ? daysUntil(plan.exam, Date.now()) : null;
        var ctrlText = dl == null || dl < 0 ? 'Dis-nous la date et on répartit tes révisions.'
          : dl === 0 ? 'C’est aujourd’hui. Tu es prêt·e !' : dl === 1 ? 'C’est demain. Fais ta séance !' : 'Dans ' + dl + ' jours. On s’organise.';
        tiles.appendChild(tile('📅', 'Contrôle bientôt ?', ctrlText, dl != null && dl >= 0 ? 'Voir mon planning' : 'Faire mon planning', function () { Studio.go('dashboard'); }));
        wrap.appendChild(chaptersHome());
        wrap.appendChild(tiles);
        wrap.appendChild(toolsGrid());
        container.appendChild(wrap);
        if (ctx && ctx.params && ctx.params.autostart) start();
      }

      function tile(icon, title, body, cta, onClick) {
        return el('section', { class: 'card today-tile' },
          el('h2', null, el('span', { 'aria-hidden': 'true' }, icon + ' '), title),
          typeof body === 'string' ? el('p', null, body) : body,
          cta ? el('button', { type: 'button', class: 'btn btn-ghost today-tile-btn', onclick: onClick }, cta) : null);
      }

      /* ----- préparation (génération des cartes manquantes) ----- */
      function start(saved) {
        var comp = composition();
        if (!comp.needs.deck) return begin(comp, saved);
        var docObj = Studio.activeDoc();
        if (!docObj || !Studio.gen) { if (comp.steps.length) return begin(comp, saved); toast(T('nothing'), 'error'); return; }
        var token = ++runToken;
        Studio.ui.loading(container, T('preparing'));
        if (Studio.crew) Studio.crew.stay = true;   /* l'écran des agents ne doit pas nous renvoyer vers Flashcards */
        var p = Promise.resolve();
        if (comp.needs.deck && Studio.gen.flashcards) p = p.then(function () { return Studio.gen.flashcards(docObj, { count: 12 }); }).catch(function (e) { toast((e && e.message) || 'Création des cartes impossible.', 'error'); });
        p.then(whenCrewClosed).then(function () {
          if (Studio.crew) Studio.crew.stay = false;
          if (token !== runToken) return;
          Studio.bus.emit('decks:changed');
          var c2 = composition();
          if (!c2.steps.length) { toast(T('nothing'), 'error'); return home(); }
          begin(c2, saved);
        });
      }

      /* on attend que l'élève ferme l'écran des agents avant de lancer la 1re étape */
      function whenCrewClosed() {
        return new Promise(function (res) {
          var n = 0;
          (function chk() {
            if (!Studio.crew || !Studio.crew.current || !Studio.crew.current() || n++ > 300) return res();
            setTimeout(chk, 200);
          })();
        });
      }

      /* ----- séance ----- */
      function begin(comp, saved) {
        var st = {
          steps: comp.steps, results: saved && saved.results ? saved.results.slice() : [], doneKinds: saved ? (saved.doneKinds || []).slice() : [],
          xp0: saved && typeof saved.xp0 === 'number' ? saved.xp0 : xp(), coins0: saved && saved.coins0 != null ? saved.coins0 : coins(), cur: null
        };
        if (!saved) saveSession({ day: day(), doneKinds: [], results: [], xp0: st.xp0, coins0: st.coins0, finished: false });
        nextStep(st);
      }
      function persist(st, finished) {
        saveSession({ day: day(), doneKinds: st.doneKinds, results: st.results, xp0: st.xp0, coins0: st.coins0, finished: !!finished });
      }
      function nextStep(st) {
        var left = remainingSteps(st.steps, st.doneKinds);
        if (!left.length) return finish(st);
        runStep(st, left[0]);
      }
      function shell(st, step) {
        Studio.ui.clear(container);
        var items = st.steps.map(function (s, i) {
          var done = st.doneKinds.indexOf(s.kind) >= 0, current = s === step;
          return el('li', { class: 'today-step' + (done ? ' is-done' : '') + (current ? ' is-current' : ''), 'aria-current': current ? 'step' : null },
            el('span', { class: 'today-step-dot', 'aria-hidden': 'true' }, done ? '✔' : String(i + 1)), el('span', { class: 'today-step-label' }, s.label));
        });
        var stage = el('div', { class: 'today-stage' });
        var idx = st.steps.indexOf(step) + 1;
        container.appendChild(el('div', { class: 'today-run' },
          el('div', { class: 'today-bar' },
            el('ol', { class: 'today-steps', 'aria-label': 'Étapes de ta séance' }, items),
            el('button', { type: 'button', class: 'btn btn-ghost today-stop', onclick: function () { stop(st); } }, '⏸ ' + T('stop'))),
          el('p', { class: 'today-meta', role: 'status' }, 'Étape ' + idx + ' sur ' + st.steps.length + ' · ≈ ' + estimateMinutes(remainingSteps(st.steps, st.doneKinds)) + ' min restantes'),
          stage));
        return stage;
      }
      function runStep(st, step) {
        var token = ++runToken, stage = shell(st, step), called = false;
        var sess = { onDone: function (r) {
          if (called || token !== runToken) return; called = true;
          r = r || {}; r.kind = r.kind || step.kind;
          st.cur = null; st.results.push(r); st.doneKinds.push(step.kind); persist(st);
          interlude(st, step, r);
        } };
        st.cur = sess;
        var mod = Studio.modules().filter(function (m) { return m.id === step.module; })[0];
        if (!mod) { sess.onDone({ kind: step.kind, skipped: true }); return; }
        try {
          mod.render(stage, { docId: Studio.activeDocId(), params: Object.assign({}, step.params, { session: sess }), go: Studio.go });
        } catch (e) { if (root.console) console.error('[today]', e); sess.onDone({ kind: step.kind, skipped: true }); }
      }
      /* petit écran entre deux étapes : une seule action */
      function interlude(st, step, r) {
        var left = remainingSteps(st.steps, st.doneKinds);
        if (!left.length) return finish(st);
        var nxt = left[0], msg = r.skipped ? 'On passe à la suite.' :
          step.kind === 'cards' ? '✔ ' + plural(r.reviewed || 0, 'carte révisée', 'cartes révisées') + ' !' :
          '✔ Bien joué !';
        var next = { cards: 'les cartes', memory: 'un mini memory' }[nxt.kind];
        var stage = shell(st, nxt), token = ++runToken;
        var b = el('button', { type: 'button', class: 'btn btn-primary btn-lg today-next', onclick: function () { if (token === runToken) runStep(st, nxt); } }, T('next') + ' →');
        stage.appendChild(el('div', { class: 'card today-inter' }, el('h2', { tabindex: '-1' }, msg), el('p', null, 'Ensuite : ' + next + '.'), b));
        b.focus();
      }
      function stop(st) {
        var partial = null;
        try { if (st.cur && st.cur.cancel) partial = st.cur.cancel(); } catch (e) { /* ignore */ }
        runToken++;
        if (partial && (partial.reviewed || partial.total || partial.stopped)) st.results.push(partial);
        persist(st);
        var s = summarize(partial ? [partial] : []);
        if (s.total > 0) Studio.bus.emit('activity', { type: 'today', count: s.total, score: s.good, total: s.total, perfect: false });
        toast(T('stopped'), 'success');
        home();
      }
      function finish(st) {
        runToken++;
        var s = summarize(st.results);
        var perfect = s.total > 0 && s.good === s.total;
        Studio.bus.emit('activity', { type: 'today', count: s.total, score: s.good, total: s.total, perfect: perfect });
        persist(st, true);
        var pts = Math.max(0, xp() - st.xp0), c1 = coins(), gain = c1 != null && st.coins0 != null ? Math.max(0, c1 - st.coins0) : null;
        var pct = s.total ? Math.round(s.good / s.total * 100) : 80;
        var coach = coachSay(pct >= 50 ? 'done' : 'good') || coachSay('done');
        if (Studio.ui.confetti) Studio.ui.confetti();
        Studio.ui.clear(container);
        var rows = [];
        if (s.cards) rows.push('✔ ' + plural(s.cards, 'carte révisée', 'cartes révisées'));
        if (s.memory) rows.push('✔ Mini memory réussi');
        rows.push('✔ ' + plural(pts, 'point'));
        if (gain != null) rows.push('💰 ' + (gain > 0 ? '+' : '') + plural(gain, 'pièce'));
        var title = el('h1', { tabindex: '-1' }, '🎉 Séance finie !');
        container.appendChild(el('div', { class: 'today today-end' },
          el('div', { class: 'card today-bilan' }, title,
            el('ul', { class: 'today-bilan-list' }, rows.map(function (t) { return el('li', null, t); })),
            el('p', { class: 'today-say' }, (coach ? (coach.emoji ? coach.emoji + ' ' : '') + coach.text : fallbackLine('done', pct)))),
          el('div', { class: 'today-end-actions' },
            el('button', { type: 'button', class: 'btn btn-primary btn-lg today-next', onclick: function () { home(); } }, T('done')),
            el('button', { type: 'button', class: 'btn btn-ghost', onclick: function () { saveSession({ day: day(), doneKinds: [], results: [], finished: false }); start(); } }, T('again')))));
        title.focus();
      }
    }
  });
})();
