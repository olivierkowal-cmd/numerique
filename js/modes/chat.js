/* Studio — mode Chat avec ton cours (dev-modes2). IIFE, pas de module ES. */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  root.Studio = root.Studio || {};
  var S = root.Studio;

  // ---------- logique pure ----------
  function normalizeSources(src) {
    if (!src) return [];
    if (!Array.isArray(src)) src = [src];
    return src.map(function (s) {
      if (typeof s === 'string') return s.trim();
      return String((s && (s.text || s.extrait || s.excerpt)) || '').trim();
    }).filter(Boolean);
  }
  function suggestQuestions(text, n) {
    // à partir de titres markdown ou de lignes courtes ; sans invention
    var out = [], seen = {};
    String(text || '').split(/\n/).forEach(function (l) {
      var m = l.match(/^\s{0,3}#{1,4}\s+(.{3,70})$/);
      if (m) {
        var t = m[1].replace(/[#*_`]/g, '').trim();
        if (t && !seen[t.toLowerCase()]) { seen[t.toLowerCase()] = 1; out.push('Peux-tu m’expliquer « ' + t + ' » ?'); }
      }
    });
    return out.slice(0, n || 3);
  }
  S.chatLogic = { normalizeSources: normalizeSources, suggestQuestions: suggestQuestions };
  if (typeof module !== 'undefined' && module.exports) module.exports = S.chatLogic;
  if (typeof document === 'undefined' || !S.register) return;

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
  function esc(s) { return S.ui && S.ui.escape ? S.ui.escape(s) : String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // historique de session (mémoire, par document)
  var histories = {};

  function render(container, ctx) {
    container.innerHTML = '';
    var doc = S.store.byId('docs', ctx.docId);
    if (!doc) {
      return empty(container, { icon: '💬', title: 'Choisis un document', text: 'Pose ensuite tes questions : les réponses citent les extraits du cours.', cta: { label: 'Aller à la bibliothèque', onClick: function () { ctx.go('home'); } } });
    }
    var hist = histories[doc.id] = histories[doc.id] || [];
    var busy = false;
    var av = S.gen.available ? S.gen.available() : { ai: false };

    var wrap = h('div', { class: 'chat-mode' });
    wrap.appendChild(h('h1', {}, 'Pose une question à ton cours'));
    wrap.appendChild(h('p', { style: 'opacity:.85' }, 'Document : ' + doc.name + (av.ai ? ' · IA : ' + av.provider : ' · recherche par mots-clés (hors-ligne)')));
    wrap.appendChild(h('p', { class: 'trust-chat-note', role: 'note' }, '🛡️ Je réponds seulement avec ton cours. Je ne parle pas de toi et je ne te demande rien de personnel. Pour un sujet sérieux, parle à un adulte.'));
    var log = h('div', { class: 'card', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversation', style: 'min-height:200px;max-height:55vh;overflow:auto;display:flex;flex-direction:column;gap:.75rem' });
    var sugg = h('div', { style: 'display:flex;gap:.5rem;flex-wrap:wrap;margin:.75rem 0' });
    var input = h('input', { type: 'text', id: 'chat-q', placeholder: 'Ex. : Quelle est la définition de… ?', autocomplete: 'off', style: 'flex:1;min-width:0' });
    var send = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Envoyer');
    var form = h('form', { style: 'display:flex;gap:.5rem;margin-top:.75rem', onsubmit: function (e) { e.preventDefault(); ask(input.value); } },
      h('label', { for: 'chat-q', style: 'position:absolute;left:-9999px' }, 'Ta question'), input, send);
    var clear = h('button', { class: 'btn btn-ghost', type: 'button', onclick: function () { histories[doc.id] = hist = []; paint(); } }, 'Effacer l’historique');
    wrap.appendChild(log); wrap.appendChild(sugg); wrap.appendChild(form);
    wrap.appendChild(h('div', { style: 'margin-top:.5rem' }, clear));
    container.appendChild(wrap);

    function bubble(m) {
      var me = m.role === 'user';
      var b = h('div', { class: me ? 'chat-msg chat-user' : 'chat-msg chat-bot', style: 'align-self:' + (me ? 'flex-end' : 'flex-start') + ';max-width:90%;padding:.6rem .9rem;border-radius:14px;' + (me ? 'background:var(--primary,#6c5ce7);color:#fff' : 'background:rgba(127,127,127,.12)') });
      b.appendChild(h('span', { class: 'sr-only', style: 'position:absolute;left:-9999px' }, me ? 'Toi : ' : 'Studio : '));
      if (me) b.appendChild(document.createTextNode(m.text));
      else {
        var body = h('div'); body.innerHTML = S.ui && S.ui.md ? S.ui.md(m.text) : esc(m.text); b.appendChild(body);
        if (m.sources && m.sources.length) {
          var d = h('details', { style: 'margin-top:.5rem;font-size:.9em' }, h('summary', {}, 'Sources dans le cours (' + m.sources.length + ')'));
          var ul = h('ol'); m.sources.forEach(function (s) { ul.appendChild(h('li', { style: 'margin:.3rem 0' }, '« ' + (s.length > 400 ? s.slice(0, 400) + '…' : s) + ' »')); });
          d.appendChild(ul); b.appendChild(d);
        } else if (!m.error && !m.guard) b.appendChild(h('p', { style: 'font-size:.85em;opacity:.8' }, 'Aucune source trouvée dans le cours.'));
        if (!m.error && !m.guard && S.trust && S.trust.badge) b.appendChild(S.trust.badge(m.ai ? 'ia' : 'hors-ligne'));
      }
      return b;
    }
    function paint() {
      log.innerHTML = '';
      if (!hist.length) log.appendChild(h('p', { style: 'opacity:.7' }, 'Aucune question pour l’instant. Écris la tienne ci-dessous.'));
      hist.forEach(function (m) { log.appendChild(bubble(m)); });
      if (busy) log.appendChild(h('p', { style: 'opacity:.7' }, 'Recherche dans le cours…'));
      log.scrollTop = log.scrollHeight;
      clear.disabled = !hist.length;
      send.disabled = busy;
    }
    function ask(q) {
      q = (q || '').trim();
      if (!q || busy) return;
      input.value = '';
      // Garde-fous : filtre côté entrée, la question n'est jamais envoyée à l'IA si elle est bloquée
      var g = S.trust && S.trust.screen ? S.trust.screen(q) : null;
      if (g && g.blocked) {
        hist.push({ role: 'user', text: g.kind === 'personal-info' || g.kind === 'inappropriate' ? '(message masqué)' : q });
        hist.push({ role: 'bot', guard: true, text: g.reply, sources: [] }); paint(); return;
      }
      busy = true;
      hist.push({ role: 'user', text: q }); paint();
      Promise.resolve(S.gen.ask(doc, q)).then(function (r) {
        hist.push({ role: 'bot', text: (r && r.answer) || 'Je n’ai rien trouvé à ce sujet dans le cours.', sources: normalizeSources(r && r.sources), ai: av.ai, guard: !!(r && r.blocked) });
      }).catch(function (e) {
        hist.push({ role: 'bot', error: true, text: (e && e.message) || 'Une erreur est survenue.' });
      }).then(function () { busy = false; paint(); input.focus(); });
    }
    suggestQuestions(doc.text, 4).forEach(function (q) {
      sugg.appendChild(h('button', { class: 'chip', type: 'button', onclick: function () { ask(q); } }, q));
    });
    paint();
  }

  S.register({ id: 'chat', title: 'Chat avec ton cours', icon: '💬', order: 9, needsDoc: true, render: render });
})();
