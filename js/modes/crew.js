/* Studio — L'écran de travail (« équipe au travail ») :
 * à chaque gen:start (flashcards, quiz, synthèse, astuces, carte mentale) une grande fenêtre montre le bureau en pixel art,
 * les agents concernés avec leur tâche, une liste d'étapes qui se coche, une barre de progression et un « Le saviez-vous ».
 * - réutilise le moteur de office.js (Studio.office.mountRoom, simulation partagée) ;
 * - durée minimale d'affichage ~3,5 s (seul l'affichage du résultat est retardé, jamais la génération) ;
 * - progression réelle si l'IA est utilisée (gen:progress) ;
 * - réglage settings.showTeam (défaut : activé) ; Studio.crew.reading() = mise en scène courte à l'import d'un cours.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  if (typeof document === 'undefined') return;
  var Studio = root.Studio;
  if (!Studio || !Studio.bus || !Studio.office) return;

  var MIN_MS = 3500, READING_MS = 1500;
  var KINDS = ['flashcards', 'quiz', 'summary', 'mnemonics', 'mindmap'];   // « ask » (chat) : bandeau seulement
  var NOUN = { flashcards: 'tes flashcards', quiz: 'ton quiz', summary: 'ta synthèse', mnemonics: 'tes astuces mémo', mindmap: 'ta carte mentale', reading: 'ton cours' };
  var TITLE = {
    flashcards: 'L’équipe fabrique tes flashcards', quiz: 'L’équipe prépare ton quiz', summary: 'L’équipe rédige ta synthèse',
    mnemonics: 'L’équipe cherche des astuces mémo', mindmap: 'L’équipe dessine ta carte mentale', reading: 'L’équipe lit ton cours'
  };
  var CREATE = { flashcards: 'Rédaction des cartes', quiz: 'Rédaction des questions', summary: 'Rédaction de la synthèse', mnemonics: 'Création des astuces', mindmap: 'Construction de la carte', reading: 'Rédaction des notes' };
  var MODULE = { flashcards: 'flashcards', quiz: 'quiz', summary: 'summary', mnemonics: 'mnemo', mindmap: 'mindmap' };
  var THR = [0, 0.18, 0.42, 0.72];   // seuils de progression des 4 premières étapes
  var ROLE_TASKS = {
    max: ['prépare l’atelier pour {x}', 'répartit le travail dans l’équipe', 'suit l’avancement de {x}', 'prépare la livraison de {x}'],
    chercheur: ['lit ton cours en entier', 'repère les définitions et les notions clés', 'retrouve les passages importants', 'vérifie les sources dans ton cours'],
    developpeur: ['prépare les outils de fabrication', 'trie les informations repérées', 'assemble {x}', 'teste que tout fonctionne'],
    designer: ['choisit les couleurs et la mise en page', 'esquisse la structure', 'met en forme {x}', 'peaufine les détails'],
    redacteur: ['relit les passages clés', 'choisit les mots justes', 'rédige {x}', 'corrige les fautes'],
    analyste: ['mesure la longueur du cours', 'classe ce qu’il faut retenir', 'dose la difficulté', 'contrôle la cohérence de {x}']
  };
  var FALLBACK_FACTS = [
    'Se tester soi-même (avec des flashcards) fait mieux retenir que relire le cours.',
    'Réviser en plusieurs fois, un peu chaque jour, bat une grosse séance la veille de l’examen.',
    'Expliquer une notion avec tes propres mots, c’est le meilleur test pour savoir si tu l’as comprise.',
    'Dormir après avoir révisé aide le cerveau à fixer les souvenirs.'
  ];

  function el(tag, attrs) {
    var e = document.createElement(tag), kids = Array.prototype.slice.call(arguments, 2);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k]; if (v == null || v === false) return;
      if (k === 'class') e.className = v; else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
    });
    [].concat.apply([], kids).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function enabled() { var s = Studio.store.get('settings', {}) || {}; return s.showTeam !== false; }
  function reduced() { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function pickFact() {
    var T = Studio.content && Studio.content.text, tips = (T && T.tips && T.tips.length) ? T.tips : FALLBACK_FACTS;
    return tips[Math.floor(Math.random() * tips.length)];
  }

  var cur = null;   // écran ouvert : voir open()

  function open(kind, opts) {
    opts = opts || {};
    var L = Studio.officeLogic, sim = Studio.office.sim, reading = kind === 'reading';
    var minMs = opts.minMs || MIN_MS;
    var roles = ['max'].concat((L.JOB_ROLES[kind] || []).filter(function (r) { return r !== 'max'; }));
    var prevFocus = document.activeElement;
    var st = { kind: kind, t0: performance.now(), last: performance.now(), shown: 0, real: 0, ended: false, end: null, done: false, closed: false, proceed: null, factAt: 0, stepIdx: -1 };

    var stepNames = ['Lecture du cours', 'Repérage des notions', CREATE[kind] || 'Rédaction', 'Vérification', 'Prêt !'];
    var titleEl = el('h2', { id: 'crew-title', class: 'crew-title' }, TITLE[kind] || 'L’équipe est au travail');
    var docs = Studio.store.byId && Studio.store.byId('docs', Studio.activeDocId && Studio.activeDocId());
    var subEl = el('p', { class: 'crew-sub', id: 'crew-sub' }, opts.subtitle || (docs ? 'À partir de « ' + docs.name + ' »' : 'À partir de ton cours'));
    var stageWrap = el('div', { class: 'crew-stage-wrap' });
    var agentEls = {}, taskEls = {};
    var agentList = el('ul', { class: 'crew-agents', 'aria-label': 'L’équipe au travail' });
    roles.forEach(function (r) {
      var i = L.INFO[r];
      taskEls[r] = el('span', { class: 'crew-task' });
      agentEls[r] = el('li', { class: 'crew-agent is-working', style: '--agent:' + i.color },
        el('span', { class: 'crew-agent-icon', 'aria-hidden': 'true' }, i.icon),
        el('span', { class: 'crew-agent-text' },
          el('span', { class: 'crew-agent-name' }, i.name + ' · ' + i.title), ' ', el('span', { class: 'crew-dash', 'aria-hidden': 'true' }, '—'), ' ', taskEls[r]));
      agentList.appendChild(agentEls[r]);
    });
    var stepEls = stepNames.map(function (n) {
      return el('li', { class: 'crew-step' }, el('span', { class: 'crew-check', 'aria-hidden': 'true' }), el('span', { class: 'crew-step-label' }, n));
    });
    var stepList = el('ol', { class: 'crew-steps', 'aria-label': 'Étapes' }, stepEls);
    var bar = el('div', { class: 'progress-bar crew-bar' });
    var pct = el('span', { class: 'crew-pct' }, '0 %');
    var progress = el('div', { class: 'crew-progress', role: 'progressbar', 'aria-label': 'Progression', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' },
      el('div', { class: 'progress progress-lg' }, bar), pct);
    var factText = el('span', { class: 'crew-fact-text' }, pickFact());
    var fact = el('p', { class: 'crew-fact' }, el('strong', null, '💡 Le saviez-vous ? '), factText);
    // Le coach choisi (Studio.game) encourage pendant le travail et à la fin ; rien s'il est absent ou si les effets de jeu sont coupés.
    var coach = null;
    try { if (Studio.game && Studio.game.coach && Studio.game.effectsOn() && !reading) coach = Studio.game.coach(); } catch (e) { coach = null; }
    var coachText = el('span', { class: 'crew-coach-text' }, coach ? coach.say('start') : '');
    var coachEl = coach ? el('p', { class: 'crew-coach' }, el('strong', null, coach.emoji + ' ' + coach.name + ' : '), coachText) : null;
    var resIcon = el('div', { class: 'crew-result-icon', 'aria-hidden': 'true' }, '🎉');
    var resTitle = el('h3', { class: 'crew-result-title' });
    var resText = el('p', { class: 'crew-result-text' });
    var result = el('div', { class: 'crew-result', hidden: 'hidden' }, resIcon, el('div', null, resTitle, resText));
    var live = el('div', { class: 'sr-only crew-live', 'aria-live': 'polite', role: 'status' });
    var skipBtn = el('button', { type: 'button', class: 'btn btn-ghost crew-skip', onclick: function () { close(); } }, 'Passer');
    var goBtn = el('button', { type: 'button', class: 'btn btn-primary crew-go', hidden: 'hidden', onclick: function () { close(true); } }, 'Voir mon résultat');
    var actions = el('div', { class: 'crew-actions' }, skipBtn, goBtn);
    var side = el('div', { class: 'crew-side' }, agentList, stepList);
    var panel = el('div', { class: 'crew-panel' + (reading ? ' is-reading' : '') + (reduced() ? ' is-static' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'crew-title', 'aria-describedby': 'crew-sub', tabindex: '-1' },
      el('header', { class: 'crew-head' }, titleEl, subEl),
      el('div', { class: 'crew-body' }, stageWrap, side),
      progress, result, fact, coachEl, live, actions);
    var back = el('div', { class: 'crew-backdrop' }, panel);
    document.body.appendChild(back);
    document.body.classList.add('modal-open');
    var narrow = root.matchMedia && root.matchMedia('(max-width: 719px)').matches;
    var room = Studio.office.mountRoom(stageWrap, { hostClass: 'crew-stage', maxFrac: narrow ? 0.3 : 0.6, focusable: false,
      label: 'Le bureau en pixel art : ' + roles.map(function (r) { return L.INFO[r].name + ' (' + L.INFO[r].title + ')'; }).join(', ') + ' travaillent.' });
    skipBtn.focus();

    function key(e) {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); }
      else if (e.key === 'Tab') {
        var f = Array.prototype.filter.call(panel.querySelectorAll('button'), function (b) { return !b.hidden; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', key, true);
    // Changement de page pendant l'écran : on le ferme (la génération continue, close() libère l'équipe).
    var hash0 = root.location ? root.location.hash : '';
    function onRoute() { if (root.location && root.location.hash !== hash0) close(); }
    root.addEventListener('hashchange', onRoute);
    var offNav = Studio.bus.on && Studio.bus.on('nav', onRoute);

    function say(t) { live.textContent = t; }
    function setStep(i) {
      if (i === st.stepIdx) return;
      st.stepIdx = i;
      stepEls.forEach(function (li, n) {
        li.classList.toggle('is-done', n < i || st.done);
        li.classList.toggle('is-active', n === i && !st.done);
        if (n === i && !st.done) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
      });
      roles.forEach(function (r) {
        var k = Math.min(i, 3), tpl = ROLE_TASKS[r][k];
        taskEls[r].textContent = tpl.replace('{x}', NOUN[kind] || 'le travail');
      });
      if (!st.done && i < 4) say('Étape ' + (i + 1) + ' sur 5 : ' + stepNames[i]);
    }
    setStep(0);

    function finish() {
      if (st.done) return;
      st.done = true;
      var ok = !st.end || st.end.ok !== false;
      if (st.proceed) { var p = st.proceed; st.proceed = null; p(); }
      else if (reading) { sim.endJob('reading', true); Studio.office.ensureLoop(); }
      stepEls.forEach(function (li) { li.classList.remove('is-active'); li.removeAttribute('aria-current'); li.classList.toggle('is-done', ok); });
      if (!ok) { stepEls.forEach(function (li) { li.classList.remove('is-done'); }); }
      Object.keys(agentEls).forEach(function (r) { agentEls[r].classList.remove('is-working'); agentEls[r].classList.add(ok ? 'is-finished' : 'is-failed'); taskEls[r].textContent = ok ? 'a terminé !' : 'a rencontré un souci'; });
      var msg = L.describe(kind, ok, st.end && st.end.result);
      panel.classList.add(ok ? 'is-success' : 'is-failed'); panel.classList.remove('is-working');
      if (ok) { setBar(1); } 
      if (ok && !reading) {
        titleEl.textContent = 'C’est prêt !';
        resIcon.textContent = '🎉'; resTitle.textContent = msg;
        resText.textContent = 'Tout est enregistré dans ta bibliothèque. Bravo à l’équipe !';
        goBtn.hidden = false; skipBtn.textContent = 'Fermer';
        try { Studio.ui.confetti(); } catch (e) { /* facultatif */ }
        if (coach) coachText.textContent = coach.say('good');
        goBtn.focus();
      } else if (!ok) {
        var er = st.end && st.end.error;
        titleEl.textContent = 'Oups…';
        resIcon.textContent = '😕'; resTitle.textContent = msg;
        resText.textContent = (er && (er.userMessage || er.message)) || 'Réessaie dans un instant.';
        skipBtn.textContent = 'Fermer';
      } else {
        titleEl.textContent = 'Cours lu !'; resIcon.textContent = '📖'; resTitle.textContent = msg; resText.textContent = '';
      }
      result.hidden = false; fact.hidden = true;
      say(titleEl.textContent + ' ' + msg);
      if (reading) setTimeout(function () { close(); }, 600);
    }

    function setBar(p) {
      var v = Math.round(Math.max(0, Math.min(1, p)) * 100);
      bar.style.width = v + '%'; pct.textContent = v + ' %'; progress.setAttribute('aria-valuenow', String(v));
    }

    function tick() {
      if (st.closed) return;
      var now = performance.now(), dt = Math.min(0.25, (now - st.last) / 1000), el0 = now - st.t0; st.last = now;
      if (!st.done) {
        var target;
        if (st.ended) target = Math.max(el0 / minMs, 0);
        else target = Math.min(0.92, Math.max(0.85 * (1 - Math.exp(-el0 / 12000)), st.real ? 0.12 + 0.78 * st.real : 0));
        var speed = st.ended ? 1.2 : 0.6;
        st.shown = Math.max(st.shown, Math.min(Math.min(1, target), st.shown + dt * speed));
        setBar(st.shown);
        var idx = st.shown < THR[1] ? 0 : st.shown < THR[2] ? 1 : st.shown < THR[3] ? 2 : 3;
        setStep(idx);
        if (st.ended && el0 >= minMs && st.shown >= 0.985) finish();
        else if (st.ended && st.end && st.end.ok === false) finish();
        if (!st.ended && now - st.factAt > 7000) { if (st.factAt) factText.textContent = pickFact(); st.factAt = now; }
      }
    }
    var timer = setInterval(tick, 100);

    function close(go) {
      if (st.closed) return;
      st.closed = true; clearInterval(timer);
      document.removeEventListener('keydown', key, true);
      root.removeEventListener('hashchange', onRoute);
      if (typeof offNav === 'function') offNav(); else if (Studio.bus.off) { try { Studio.bus.off('nav', onRoute); } catch (e) { /* ignore */ } }
      var proceed = st.proceed; st.proceed = null;
      room.destroy();
      if (back.parentNode) back.parentNode.removeChild(back);
      if (!document.querySelector('.modal-backdrop, .crew-backdrop')) document.body.classList.remove('modal-open');
      if (cur === api) cur = null;
      if (proceed) proceed();   // fermé avant la fin : on libère l'équipe tout de suite
      else if (!st.done && reading) sim.endJob('reading', true);
      if (go && MODULE[kind] && !(Studio.crew && Studio.crew.stay) && Studio.current().moduleId !== MODULE[kind]) Studio.go(MODULE[kind]);   /* crew.stay : l'écran « Aujourd'hui » reste affiché */
      else if (prevFocus && prevFocus.focus && document.body.contains(prevFocus)) { try { prevFocus.focus(); } catch (e) { /* ignore */ } }
      var main = document.getElementById('main'); if (go && main && main.focus) { try { main.focus(); } catch (e) { /* ignore */ } }
      Studio.office.ensureLoop();
    }

    var api = {
      kind: kind, state: st, el: back, close: close,
      progress: function (d) { if (d && d.total) st.real = Math.max(st.real, Math.min(1, d.done / d.total)); },
      end: function (d, proceed) { st.ended = true; st.end = d; st.proceed = proceed || null; }
    };
    cur = api;
    tick();
    return api;
  }

  /* gen:start / gen:progress / gen:end */
  Studio.bus.on('gen:start', function (d) {
    var kind = d && d.kind;
    if (KINDS.indexOf(kind) < 0 || cur || !enabled()) return;
    open(kind);
  });
  Studio.bus.on('gen:progress', function (d) { if (cur && d && d.kind === cur.kind) cur.progress(d); });
  // Porte de sortie : tant que l'écran est ouvert, c'est lui qui décide quand l'équipe « termine » (sim.endJob).
  Studio.office.gate = function (d, proceed) {
    if (!cur || cur.state.done || d.kind !== cur.kind || cur.kind === 'reading') return false;
    cur.end(d, proceed);
    return true;
  };

  // Mise en scène courte à l'import d'un cours.
  function reading(label) {
    if (cur || !enabled()) return null;
    var sim = Studio.office.sim;
    sim.startJob('reading');
    Studio.office.ensureLoop();
    var a = open('reading', { minMs: READING_MS, subtitle: label || 'Ton nouveau cours' });
    a.end({ ok: true });
    return a;
  }

  Studio.crew = { open: open, reading: reading, enabled: enabled, current: function () { return cur; }, MIN_MS: MIN_MS };
})();
