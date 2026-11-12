/* Studio a11y : lecture à voix haute, police lisible, taille du texte, contraste, mode simple.
   Logique pure dans Studio.a11y (testable sous node) ; branchement DOM seulement si `document` est complet. */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var Studio = root.Studio = root.Studio || {};

  /* ---------- logique pure ---------- */
  var SIZES = [1, 1.15, 1.3];
  var SIMPLE_IDS = ['today', 'chapitre-1', 'chapitre-2', 'chapitre-3', 'chapitre-4', 'evaluations', 'bonus', 'prof', 'library', 'flashcards', 'memory', 'mnemo', 'mindmap', 'chat', 'methods', 'room', 'settings', 'parents'];   /* = le menu demandé par le prof ; le mode simple masque seulement Matières, Progrès et le reste */
  var DEFAULTS = { simpleMode: true, tts: true, ttsRate: 0.9, font: 'default', textSize: 1, contrast: false };

  function normalize(s) {
    s = s || {};
    var size = Number(s.textSize);
    var rate = Number(s.ttsRate);
    return {
      simpleMode: s.simpleMode === undefined ? DEFAULTS.simpleMode : !!s.simpleMode,
      tts: s.tts === undefined ? DEFAULTS.tts : !!s.tts,
      ttsRate: isFinite(rate) && s.ttsRate !== undefined && s.ttsRate !== '' ? Math.min(1.4, Math.max(0.5, rate)) : DEFAULTS.ttsRate,
      font: s.font === 'dyslexia' ? 'dyslexia' : 'default',
      textSize: SIZES.indexOf(size) >= 0 ? size : 1,
      contrast: !!s.contrast
    };
  }

  /* Texte propre pour la synthèse vocale : sans markdown, emojis ni symboles. */
  function cleanText(t) {
    return String(t == null ? '' : t)
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`#>~|]+/g, ' ')
      .replace(/^\s*[-•]\s+/gm, '')
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, ' ')
      .replace(/\s+/g, ' ').trim();
  }

  /* Découpe en morceaux ≤ max caractères, à la fin des phrases (Chrome coupe les longs textes). */
  function splitText(t, max) {
    max = max || 180;
    t = cleanText(t);
    if (!t) return [];
    var sentences = t.match(/[^.!?…:;\n]+[.!?…:;]*\s*/g) || [t], out = [], cur = '';
    sentences.forEach(function (s) {
      while (s.length > max) {
        var cut = s.lastIndexOf(' ', max); if (cut < 20) cut = max;
        if (cur) { out.push(cur.trim()); cur = ''; }
        out.push(s.slice(0, cut).trim()); s = s.slice(cut);
      }
      if ((cur + s).length > max) { out.push(cur.trim()); cur = s; } else cur += s;
    });
    if (cur.trim()) out.push(cur.trim());
    return out.filter(Boolean);
  }

  /* Voix : fr-FR/fr-BE/fr-CA… ; préférence aux voix locales, puis « Google/Thomas/Amélie… » connues. */
  function pickVoice(voices) {
    var fr = (voices || []).filter(function (v) { return v && /^fr([-_]|$)/i.test(v.lang || ''); });
    if (!fr.length) return null;
    function score(v) {
      var n = 0;
      if (/^fr[-_](FR|BE|CA)$/i.test(v.lang)) n += 2;
      if (v.localService) n += 1;
      if (/amélie|amelie|thomas|audrey|google|natural|premium|enhanced/i.test(v.name || '')) n += 1;
      return n;
    }
    return fr.slice().sort(function (a, b) { return score(b) - score(a); })[0];
  }

  /* Éléments du menu visibles en mode simple : les 5 essentiels (+ le module courant, pour se repérer).
     Les autres outils sont dans la grille « Tous mes outils » de l'écran Aujourd'hui : aucun bouton « Plus ». */
  function navVisibility(ids, current, simple) {
    var out = {};
    ids.forEach(function (id) { out[id] = !simple || SIMPLE_IDS.indexOf(id) >= 0 || id === current; });
    return out;
  }

  function classesFor(s) {
    s = normalize(s);
    return { font: s.font, textSize: String(s.textSize), contrast: s.contrast ? '1' : '0', simple: s.simpleMode ? '1' : '0' };
  }

  var A = Studio.a11y = {
    DEFAULTS: DEFAULTS, SIZES: SIZES, SIMPLE_IDS: SIMPLE_IDS,
    normalize: normalize, cleanText: cleanText, splitText: splitText, pickVoice: pickVoice,
    navVisibility: navVisibility, classesFor: classesFor
  };

  /* ---------- DOM ---------- */
  var hasDom = typeof document !== 'undefined' && document.readyState && typeof document.createElement === 'function' && typeof MutationObserver !== 'undefined';
  var synth = root.speechSynthesis, canSpeak = !!(synth && root.SpeechSynthesisUtterance);

  function getSettings() {
    var raw = {};
    try { raw = (Studio.store && Studio.store.get('settings', {})) || {}; } catch (e) {}
    return normalize(raw);
  }
  function save(patch) {
    if (Studio.app && Studio.app.saveSettings) Studio.app.saveSettings(patch);
    else if (Studio.store) { var cur = Studio.store.get('settings', {}) || {}; Studio.store.set('settings', Object.assign({ theme: 'auto', provider: 'none' }, cur, patch)); }
    apply();
  }
  A.get = getSettings; A.save = save;

  /* --- lecture --- */
  var queue = [], speaking = false, paused = false, voice = null, bar = null, token = 0;
  function loadVoice() { if (canSpeak) voice = pickVoice(synth.getVoices()); }
  function updateBar() {
    if (!bar) return;
    bar.hidden = !speaking;
    var p = bar.querySelector('[data-act="pause"]');
    if (p) p.textContent = paused ? '▶ Reprendre' : '⏸ Pause';
    document.querySelectorAll('.tts-btn.is-on').forEach(function (b) { if (!speaking) b.classList.remove('is-on'); });
  }
  function next(my) {
    if (my !== token) return;
    var chunk = queue.shift();
    if (!chunk) { speaking = false; paused = false; updateBar(); return; }
    var u = new root.SpeechSynthesisUtterance(chunk);
    u.lang = (voice && voice.lang) || 'fr-FR'; if (voice) u.voice = voice;
    u.rate = getSettings().ttsRate;
    u.onend = function () { next(my); };
    u.onerror = function () { if (my === token) { speaking = false; paused = false; updateBar(); } };
    synth.speak(u);
  }
  Studio.speak = function (text) {
    if (!canSpeak) { if (Studio.ui && Studio.ui.toast) Studio.ui.toast('La lecture à voix haute n’est pas disponible sur ce navigateur.'); return false; }
    var parts = splitText(text);
    if (!parts.length) return false;
    Studio.stopSpeak();
    if (!voice) loadVoice();
    token++; queue = parts; speaking = true; paused = false; updateBar();
    next(token);
    return true;
  };
  Studio.stopSpeak = function () {
    token++; queue = []; speaking = false; paused = false;
    if (canSpeak) { try { synth.cancel(); } catch (e) {} }
    updateBar();
  };
  Studio.pauseSpeak = function () {
    if (!canSpeak || !speaking) return;
    if (paused) { synth.resume(); paused = false; } else { synth.pause(); paused = true; }
    updateBar();
  };

  function buildBar() {
    var el = Studio.ui.el;
    bar = el('div', { class: 'tts-bar', role: 'group', 'aria-label': 'Lecture à voix haute', hidden: true },
      el('span', { 'aria-hidden': 'true' }, '🔊'),
      el('button', { type: 'button', class: 'btn btn-sm', 'data-act': 'pause', onclick: Studio.pauseSpeak }, '⏸ Pause'),
      el('button', { type: 'button', class: 'btn btn-sm', 'data-act': 'stop', onclick: Studio.stopSpeak }, '⏹ Stop'));
    document.body.appendChild(bar);
  }

  function ttsButton(getText, label) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'tts-btn'; b.setAttribute('aria-label', label || 'Écouter'); b.title = label || 'Écouter';
    b.textContent = '🔊';
    b.addEventListener('click', function (e) {
      e.stopPropagation(); e.preventDefault();
      if (b.classList.contains('is-on') && speaking) { Studio.stopSpeak(); return; }
      document.querySelectorAll('.tts-btn.is-on').forEach(function (x) { x.classList.remove('is-on'); });
      if (Studio.speak(getText())) b.classList.add('is-on');
    });
    return b;
  }
  function txt(n) { return n ? (n.innerText || n.textContent || '') : ''; }

  /* Pose les boutons 🔊 : jamais deux fois (data-tts), jamais dans un élément cliquable (on met le bouton à côté). */
  function inject(scope) {
    if (!canSpeak || !getSettings().tts) return;
    scope = scope && scope.querySelectorAll ? scope : document;
    function each(sel, fn) {
      if (scope.matches && scope.matches(sel)) fn(scope);
      scope.querySelectorAll(sel).forEach(fn);
    }
    each('.flip-card:not([data-tts])', function (card) {
      card.setAttribute('data-tts', '1');
      var wrap = document.createElement('div'); wrap.className = 'tts-row';
      wrap.appendChild(ttsButton(function () {
        var f = txt(card.querySelector('.flip-front')), bk = txt(card.querySelector('.flip-back'));
        return card.classList.contains('is-flipped') ? f + '. ' + bk : f;
      }, 'Écouter la carte'));
      if (card.parentNode) card.parentNode.insertBefore(wrap, card.nextSibling);
    });
    each('#qz-q:not([data-tts])', function (h) {
      h.setAttribute('data-tts', '1');
      var wrap = document.createElement('div'); wrap.className = 'tts-row tts-left';
      wrap.appendChild(ttsButton(function () {
        var box = h.parentNode, opts = box ? Array.prototype.map.call(box.querySelectorAll('[role="group"] .btn'), txt) : [];
        return txt(h) + (opts.length ? '. ' + opts.join('. ') : '');
      }, 'Écouter la question'));
      if (h.parentNode) h.parentNode.insertBefore(wrap, h.nextSibling);
    });
    each('.studio-print-area:not([data-tts])', function (a) {
      a.setAttribute('data-tts', '1');
      var wrap = document.createElement('div'); wrap.className = 'tts-row tts-left';
      wrap.appendChild(ttsButton(function () { return txt(a); }, 'Écouter la fiche'));
      a.insertBefore(wrap, a.firstChild);
    });
    each('.chat-bot:not([data-tts])', function (m) {
      m.setAttribute('data-tts', '1');
      m.appendChild(ttsButton(function () {
        var c = m.cloneNode(true);
        Array.prototype.forEach.call(c.querySelectorAll('.tts-btn,details,.sr-only'), function (x) { x.remove(); });
        return txt(c);
      }, 'Écouter la réponse'));
    });
    each('.lead:not([data-tts]), [data-tts-text]:not([data-tts]), .modal .center > p:not([data-tts]):not(.small)', function (p) {
      p.setAttribute('data-tts', '1');
      if (!txt(p).trim()) return;
      p.appendChild(document.createTextNode(' '));
      p.appendChild(ttsButton(function () { return txt(p); }, 'Écouter ce texte'));
    });
  }
  function removeButtons() {
    document.querySelectorAll('.tts-btn').forEach(function (b) { var r = b.parentNode; b.remove(); if (r && r.classList && r.classList.contains('tts-row')) r.remove(); });
    document.querySelectorAll('[data-tts]').forEach(function (n) { n.removeAttribute('data-tts'); });
  }

  /* --- apparence --- */
  var fontLink = null;
  function apply() {
    if (!hasDom) return;
    var s = getSettings(), c = classesFor(s), h = document.documentElement;
    h.setAttribute('data-a11y-font', c.font);
    h.setAttribute('data-a11y-size', c.textSize);
    h.setAttribute('data-a11y-contrast', c.contrast);
    h.setAttribute('data-a11y-simple', c.simple);
    h.style.setProperty('--a11y-scale', String(s.textSize));
    if (s.font === 'dyslexia' && !fontLink && document.head) {
      fontLink = document.createElement('link'); fontLink.rel = 'stylesheet';
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&display=swap';
      document.head.appendChild(fontLink);
    }
    if (canSpeak) { if (s.tts) inject(document); else { removeButtons(); Studio.stopSpeak(); } }
    filterNav();
  }

  /* --- mode simple : filtre de la barre latérale (attributs seulement : aucun nœud ajouté) --- */
  var filtering = false;
  function filterNav() {
    var nav = document.getElementById('nav');
    if (!nav || filtering) return;
    filtering = true;
    try {
      var simple = getSettings().simpleMode;
      var items = Array.prototype.slice.call(nav.querySelectorAll('.nav-item[data-module]'));
      var ids = items.map(function (a) { return a.getAttribute('data-module'); });
      var cur = (Studio.current && Studio.current().moduleId) || '';
      var vis = navVisibility(ids, cur, simple);
      items.forEach(function (a) {
        var id = a.getAttribute('data-module');
        a.hidden = !vis[id];
        if (simple && SIMPLE_IDS.indexOf(id) < 0) a.setAttribute('data-extra', '1'); else a.removeAttribute('data-extra');
      });
    } finally { filtering = false; }
  }

  /* --- section Réglages « Confort de lecture » --- */
  function renderSettings(box) {
    var el = Studio.ui.el, s = getSettings();
    function row(label, ctrl, help) { return el('div', { class: 'a11y-row' }, el('label', { class: 'a11y-label' }, label, ctrl), help ? el('p', { class: 'small muted' }, help) : null); }
    function check(key, label, help) {
      var i = el('input', { type: 'checkbox', checked: !!s[key], onchange: function () { var p = {}; p[key] = i.checked; save(p); s = getSettings(); } });
      return el('div', { class: 'a11y-row' }, el('label', { class: 'a11y-check' }, i, ' ', label), help ? el('p', { class: 'small muted' }, help) : null);
    }
    var font = el('select', { class: 'select', onchange: function () { save({ font: font.value }); } },
      [['default', 'Normale'], ['dyslexia', 'Facile à lire (dyslexie)']].map(function (o) { return el('option', { value: o[0], selected: s.font === o[0] }, o[1]); }));
    var size = el('select', { class: 'select', onchange: function () { save({ textSize: Number(size.value) }); } },
      [[1, 'Normal'], [1.15, 'Grand'], [1.3, 'Très grand']].map(function (o) { return el('option', { value: String(o[0]), selected: s.textSize === o[0] }, o[1]); }));
    var rate = el('input', { type: 'range', min: '0.5', max: '1.4', step: '0.1', value: String(s.ttsRate), 'aria-label': 'Vitesse de lecture', onchange: function () { save({ ttsRate: Number(rate.value) }); } });
    var test = el('button', { type: 'button', class: 'btn btn-sm', onclick: function () { Studio.speak('Bonjour ! Je peux te lire tes cours à voix haute.'); } }, '🔊 Tester la voix');
    var preview = el('div', { class: 'a11y-preview', 'aria-live': 'off' },
      el('strong', null, 'Aperçu'),
      el('p', null, 'Voici un exemple de texte. Tu peux changer la police, la taille et le contraste, et voir tout de suite le résultat ici.'));
    box.appendChild(el('div', { class: 'a11y-settings' },
      check('simpleMode', 'Mode simple', 'Montre seulement l’essentiel dans le menu. Tous les outils sont dans « Tous mes outils », sur l’écran Aujourd’hui.'),
      row('Police', font), row('Taille du texte', size),
      check('contrast', 'Contraste renforcé', 'Texte plus foncé et bordures plus marquées.'),
      check('tts', 'Boutons de lecture à voix haute 🔊', canSpeak ? null : 'Pas disponible sur ce navigateur.'),
      row('Vitesse de la voix', rate), el('div', { class: 'a11y-row' }, test),
      preview));
  }

  Studio.settingsSections = Studio.settingsSections || [];
  Studio.settingsSections.push({ id: 'a11y', title: 'Confort de lecture', render: renderSettings });

  if (hasDom) {
    var init = function () {
      if (canSpeak) { loadVoice(); if (synth.addEventListener) synth.addEventListener('voiceschanged', loadVoice); }
      if (canSpeak) buildBar();
      apply();
      var timer = null, pending = [];
      new MutationObserver(function (muts) {
        pending.push.apply(pending, muts);
        if (timer) return;
        timer = setTimeout(function () {
          var ms = pending; pending = []; timer = null;
          var navTouched = ms.some(function (m) { var t = m.target; return t && t.id === 'nav'; });
          if (navTouched) filterNav();
          inject(document);
        }, 60);
      }).observe(document.body, { childList: true, subtree: true });
      if (Studio.bus && Studio.bus.on) Studio.bus.on('nav', function () { setTimeout(filterNav, 0); });
      window.addEventListener('pagehide', Studio.stopSpeak);
      Studio.bus && Studio.bus.on && Studio.bus.on('nav', Studio.stopSpeak);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = A;
})();
