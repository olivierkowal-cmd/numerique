/* Studio — Confiance et sécurité (dev-trust). IIFE, pas de module ES.
 *
 * Studio.trust :
 *   screen(question)        -> { blocked, kind, reply }   garde-fous du chat (filtre côté entrée)
 *   badge(engine)           -> élément « généré par l'IA… » / « généré automatiquement »
 *   engineLabel(engine)     -> texte du badge
 *   tools(item, opts)       -> boutons « Voir dans mon cours » + « Il y a une erreur »
 *   editItem(kind, item, cb)-> fenêtre pour corriger une carte / une question
 *   flagItem / unflagItem   -> persistance du signalement (cartes d'un deck, questions d'un quiz)
 *   hasConsent() / setConsent(bool) / showConsent()      consentement IA (settings.aiConsent)
 *   exportData() / eraseAll()                            export et effacement des données de l'élève
 *   parentsContent()        -> contenu normalisé de Studio.content.parents (avec repli)
 *   withdraw()              -> « Retirer mon accord » : aiConsent=false et clé effacée
 *   getCountry()/setCountry(c)   'be' | 'qc' | 'fr' | 'other' | '' (réglage settings.country)
 *   helpData(country) / helpText(country)   numéros d'aide du pays (par défaut les trois pays)
 *   providerNotice(provider) -> { level, text, url, linkLabel } avertissement sur les conditions du fournisseur
 *   ageNote(country)        -> âge du consentement numérique (à faire valider par un juriste)
 *   aiBanner()              -> bandeau « Tu parles à une IA, elle peut se tromper » (aussi injecté seul dans le chat et l'écran des agents)
 *
 * Aucune télémétrie : ce fichier ne fait aucun appel réseau. */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  root.Studio = root.Studio || {};
  var S = root.Studio;

  /* ================================================================ logique pure */

  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`´]/g, "'"); }
  function words(s) { return ' ' + norm(s).replace(/[^a-z0-9'@.+]+/g, ' ').replace(/\s+/g, ' ').trim() + ' '; }

  var REPLY_COURSE = 'Pose-moi plutôt une question sur ton cours. 😊';
  var ADULT_NOTE = 'Pour les sujets sérieux, parle à un adulte de confiance (parent, professeur).';

  /* Numéros d'aide : SEULE source des numéros dans le code (faits vérifiés le 2026-11-01). */
  var HELP = {
    be: { name: 'Belgique', lines: [
      { num: '103', tel: '103', label: 'Écoute-Enfants', detail: 'gratuit, tous les jours de 10 h à minuit (chat aux mêmes horaires). Pas 24 h/24 : la nuit, appelle le 112.', url: 'https://www.103ecoute.be' }],
      urgence: '112' },
    qc: { name: 'Québec', lines: [
      { num: '1 800 668-6868', tel: '18006686868', label: 'Jeunesse, J’écoute', detail: 'gratuit et confidentiel. Tu peux aussi envoyer le texto PARLER au 686868.', url: 'https://jeunessejecoute.ca' }],
      urgence: '911' },
    fr: { name: 'France', lines: [
      { num: '3114', tel: '3114', label: 'Prévention du suicide', detail: 'gratuit, 24 h/24.' },
      { num: '119', tel: '119', label: 'Allô Enfance en danger', detail: 'gratuit, 24 h/24.', url: 'https://www.allo119.gouv.fr' }],
      urgence: '112' }
  };
  var COUNTRIES = [['be', 'Belgique'], ['qc', 'Québec'], ['fr', 'France'], ['other', 'Autre pays']];
  function countryKeys(c) { return HELP[c] ? [c] : ['be', 'qc', 'fr']; }
  function helpData(country) { return countryKeys(country).map(function (k) { return Object.assign({ key: k }, HELP[k]); }); }
  function emergencyLine(country) {
    var ks = countryKeys(country), parts = [];
    if (ks.indexOf('be') >= 0 || ks.indexOf('fr') >= 0) parts.push('112 (' + (ks.indexOf('be') >= 0 && ks.indexOf('fr') >= 0 ? 'Belgique et France' : ks.indexOf('be') >= 0 ? 'Belgique' : 'France') + ')');
    if (ks.indexOf('qc') >= 0) parts.push('911 (Québec)');
    return 'En danger tout de suite : appelle le ' + parts.join(' ou le ') + '.';
  }
  function helpText(country) {
    var out = [];
    helpData(country).forEach(function (g) {
      out.push('**' + g.name + '**');
      g.lines.forEach(function (l) { out.push('- **' + l.num + '** ' + l.label + ' : ' + l.detail); });
      out.push('');
    });
    out.push(emergencyLine(country));
    return out.join('\n');
  }
  function seriousReply(country) {
    return 'Ça a l’air important. Je ne suis pas la bonne personne pour t’aider là-dessus. ' + ADULT_NOTE + '\n\nVoici des personnes qui écoutent, gratuitement :\n\n' + helpText(country) + '\n\nTu n’es pas seul(e). 💜';
  }

  var RULES = [
    { kind: 'serious',
      re: /\b(suicid\w*|me suicider|me tuer|veux mourir|envie de mourir|envie d'en finir|mettre fin a mes jours|plus envie de vivre|veux disparaitre|me faire du mal|me scarifie\w*|on me harcele|je suis harcele\w*|harcele a l'ecole|on me frappe|on m'a frappe|on me touche|on m'a touche|abuse de moi|violence a la maison|j'ai peur de rentrer|je me sens mal|je me sens seul\w*|je deprime|ca va pas du tout)\b/,
      reply: seriousReply('all') },
    { kind: 'personal-info',
      re: /([a-z0-9._-]+@[a-z0-9-]+\.[a-z]{2,})|(\+\d[\d .-]{8,}\d)|(\b0\d[\d .-]{7,}\d)|\b(j'habite|mon adresse|ma rue|mon numero|mon telephone|mon mot de passe|mon nom de famille|mon prenom est|je m'appelle|mon nom est|mon ecole s'appelle|je vais a l'ecole de|ma classe est)\b/,
      reply: 'Stop, ne partage jamais d’informations personnelles (nom, adresse, téléphone, mot de passe…). Je n’en ai pas besoin. ' + REPLY_COURSE },
    { kind: 'inappropriate',
      re: /\b(putain|merde|connard\w*|connasse|salope\w*|encule\w*|nique\w*|ntm|fdp|couilles?|bite|porno\w*|xxx|nudes?|fuck\w*|shit|bitch|asshole|porn|sexcam|comment tuer|fabriquer une (bombe|arme)|faire une bombe|pirater le compte)\b/,
      reply: 'Je ne peux pas répondre à ça, et je préfère rester poli. ' + REPLY_COURSE },
    { kind: 'off-topic',
      re: /\b(tu as quel age|quel age as[- ]tu|tu t'appelles comment|comment tu t'appelles|comment t'appelles[- ]tu|tu es qui|qui es[- ]tu|tu es un garcon|tu es une fille|tu as des amis|tu m'aimes|veux[- ]tu etre mon (ami|amie|copain|copine)|as[- ]tu un (copain|copine)|ta vie privee|ma vie privee|mon copain|ma copine|mon crush|mes parents m'ont|dis[- ]moi un secret)\b/,
      reply: 'Je suis là seulement pour t’aider avec ton cours, pas pour parler de toi ou de moi. ' + REPLY_COURSE }
  ];

  function screen(question, country) {
    var q = norm(question).replace(/\s+/g, ' ').trim();
    if (!q) return { blocked: false };
    var padded = ' ' + q + ' ';
    for (var i = 0; i < RULES.length; i++) {
      var r = RULES[i];
      var text = r.kind === 'personal-info' ? q : padded.replace(/[?!.,;:]+/g, ' ');
      if (r.re.test(text)) return { blocked: true, kind: r.kind, reply: r.kind === 'serious' ? seriousReply(country === undefined ? getCountry() : country) : r.reply };
    }
    return { blocked: false };
  }

  function engineLabel(engine) {
    if (engine === 'ia') return 'Généré par l’IA — vérifie avec ton cours';
    if (engine === 'hors-ligne') return 'Généré automatiquement — vérifie avec ton cours';
    return '';
  }

  /* --- signalement / correction : persistance dans le store ---------------------------------- */
  function patchChild(coll, listKey, parentId, itemId, patch) {
    if (!S.store || !S.store.byId) return false;
    var parent = S.store.byId(coll, parentId);
    if (!parent || !Array.isArray(parent[listKey])) return false;
    var changed = false;
    var list = parent[listKey].map(function (it) {
      if (it && it.id === itemId) { changed = true; return Object.assign({}, it, patch); }
      return it;
    });
    if (changed) { var p = {}; p[listKey] = list; S.store.update(coll, parentId, p); if (S.bus) S.bus.emit(coll + ':changed', { collection: coll }); }
    return changed;
  }
  function loc(kind, item, o) {
    return kind === 'card' ? ['decks', 'cards', o.parentId] : ['quizzes', 'questions', o.parentId];
  }
  function flagItem(kind, parentId, itemId, flagged, extra) {
    var l = loc(kind, null, { parentId: parentId });
    return patchChild(l[0], l[1], parentId, itemId, Object.assign({ flagged: !!flagged }, extra || {}));
  }
  function usable(list) { return (list || []).filter(function (x) { return x && !x.flagged; }); }

  /* --- consentement IA ---------------------------------------------------------------------- */
  function settings() { return (S.store && S.store.get('settings', {})) || {}; }
  function hasConsent() { return settings().aiConsent === true; }
  function consentAsked() { return settings().aiConsent !== undefined; }
  function saveSettings(patch) {
    var s = Object.assign({}, settings(), patch);
    S.store.set('settings', s);
    if (S.bus) S.bus.emit('settings:changed', s);
    return s;
  }
  function setConsent(v, extra) { return saveSettings(Object.assign({ aiConsent: !!v, aiConsentAt: Date.now() }, extra || {})); }
  /* « Retirer mon accord » : désactive l'IA ET efface la clé de cet appareil. */
  function withdraw() { return setConsent(false, { apiKey: '', aiConsentBy: '' }); }
  function getCountry() { var c = settings().country; return HELP[c] || c === 'other' ? c : ''; }
  function setCountry(c) { return saveSettings({ country: HELP[c] || c === 'other' ? c : '' }); }

  /* Conditions des fournisseurs (faits vérifiés le 2026-11-01) */
  var TERMS = { anthropic: 'https://www.anthropic.com/legal', openai: 'https://openai.com/policies', gemini: 'https://ai.google.dev/gemini-api/terms' };
  function providerNotice(p) {
    if (!TERMS[p]) return null;
    if (p === 'gemini') return { level: 'warn', text: 'Les conditions de Google demandent 18 ans pour l’API : fais valider cet usage par ton école ou un adulte responsable.', url: TERMS[p], linkLabel: 'Conditions de Google Gemini' };
    return { level: 'info', text: 'Vérifie les conditions du fournisseur.', url: TERMS[p], linkLabel: 'Conditions de ' + (p === 'openai' ? 'OpenAI' : 'Anthropic') };
  }
  /* Âge du consentement numérique : sources secondaires, à faire valider par un juriste. */
  var AGE = { be: ['Belgique', 13], qc: ['Québec', 14], fr: ['France', 15] };
  function ageNote(country) {
    var ks = countryKeys(country);
    return 'Âge du consentement numérique (sources secondaires, à faire valider) : ' + ks.map(function (k) { return AGE[k][0] + ' ' + AGE[k][1] + ' ans'; }).join(', ') +
      '. En dessous, l’accord d’un parent est nécessaire : un élève de 12-13 ans est concerné.';
  }

  /* --- données : export / effacement -------------------------------------------------------- */
  function exportData() {
    if (S.store && S.store.exportAll) return S.store.exportAll(false);   // sans la clé API
    var data = {};
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf('studio.') === 0) data[k.slice(7)] = JSON.parse(localStorage.getItem(k)); } } catch (e) { /* ignore */ }
    if (data.settings) data.settings.apiKey = '';
    return { app: 'studio', version: 1, exportedAt: new Date().toISOString(), data: data };
  }
  function eraseAll() {
    if (S.store && S.store.clear) S.store.clear();
    else { try { Object.keys(localStorage).filter(function (k) { return k.indexOf('studio.') === 0; }).forEach(function (k) { localStorage.removeItem(k); }); } catch (e) { /* ignore */ } }
  }

  /* --- contenu « parents » : accepte plusieurs formes, avec repli minimal -------------------- */
  var FALLBACK = {
    title: 'Pour les parents',
    intro: 'Studio aide votre enfant à réviser ses cours. Voici, en clair, ce qui se passe avec ses données.',
    sections: [
      { title: 'Où sont les données ?', text: 'Les cours, les cartes et la progression restent sur cet appareil, dans le navigateur, et sont sauvegardés dans l’espace Google de l’école (via ton compte avec l’adresse mail de l’école). Il n’y a pas de publicité et aucune statistique d’usage envoyée ailleurs.' },
      { title: 'Que fait la clé IA ?', text: 'La clé IA est facultative. Si elle est activée avec votre accord, le texte du cours est envoyé au fournisseur choisi (Anthropic, OpenAI ou Google) pour créer des cartes et répondre aux questions. La clé est gardée sur cet appareil. Sans clé, tout fonctionne hors-ligne.' },
      { title: 'Comment tout effacer ?', text: 'Avec le bouton « Effacer les données de l’élève » ci-dessous. Cela supprime les cours, les cartes, la progression et la clé IA de cet appareil.' },
      { title: 'Le chat est-il sûr ?', text: 'Le chat répond seulement à partir du cours. Il refuse les sujets personnels ou hors cours, ne demande jamais d’informations personnelles et invite l’élève à en parler à un adulte pour les sujets sérieux.' }
    ]
  };
  function parentsContent() {
    var c = S.content && S.content.parents, out = { title: FALLBACK.title, intro: '', sections: [] };
    function secOf(x) {
      if (typeof x === 'string') return { title: '', text: x };
      if (!x || typeof x !== 'object') return null;
      var t = x.text || x.texte || x.body || x.contenu || x.p || '';
      if (Array.isArray(t)) t = t.join('\n\n');
      return { title: x.title || x.titre || x.heading || '', text: String(t || ''), items: x.items || x.liste || x.points || null };
    }
    function fromObj(o) {
      var sections = o.sections || o.blocs || o.items || [];
      if (!Array.isArray(sections)) sections = Object.keys(sections).map(function (k) { var v = sections[k]; return typeof v === 'string' ? { title: k, text: v } : Object.assign({ title: k }, v); });
      out.title = o.title || o.titre || out.title;
      out.intro = o.intro || o.introduction || '';
      out.sections = sections.map(secOf).filter(function (x) { return x && (x.text || (x.items && x.items.length)); });
      if (!out.sections.length) {
        var order = [['donnees', 'Où sont les données ?'], ['cle', 'Que fait la clé IA ?'], ['effacer', 'Comment tout effacer ?'], ['ia', 'L’IA'], ['chat', 'Le chat'], ['securite', 'Sécurité']];
        order.forEach(function (p) { if (o[p[0]]) { var s = secOf(o[p[0]]); if (s) { if (!s.title) s.title = p[1]; out.sections.push(s); } } });
      }
    }
    if (typeof c === 'string') out.sections = [{ title: '', text: c }];
    else if (Array.isArray(c)) out.sections = c.map(secOf).filter(Boolean);
    else if (c && typeof c === 'object') fromObj(c);
    if (!out.sections.length) return FALLBACK;
    return out;
  }

  var api = {
    screen: screen, engineLabel: engineLabel, flagItem: flagItem, usable: usable,
    hasConsent: hasConsent, consentAsked: consentAsked, setConsent: setConsent,
    exportData: exportData, eraseAll: eraseAll, parentsContent: parentsContent,
    withdraw: withdraw, getCountry: getCountry, setCountry: setCountry, helpData: helpData, helpText: helpText,
    providerNotice: providerNotice, ageNote: ageNote, countries: COUNTRIES,
    _rules: RULES, _fallback: FALLBACK
  };
  S.trust = Object.assign(S.trust || {}, api);
  if (typeof module !== 'undefined' && module.exports) module.exports = S.trust;
  if (typeof document === 'undefined') return;

  /* ================================================================ interface */

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
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) e.appendChild(typeof x === 'string' ? document.createTextNode(x) : x); });
      else e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return e;
  }
  function toast(m, t) { if (S.ui && S.ui.toast) S.ui.toast(m, t); }

  function badge(engine) {
    var label = engineLabel(engine);
    if (!label) return null;
    var ia = engine === 'ia';
    return h('span', { class: 'trust-badge ' + (ia ? 'trust-badge-ia' : 'trust-badge-auto'), role: 'note' },
      h('span', { 'aria-hidden': 'true' }, ia ? '🤖 ' : '⚙️ '), label);
  }

  /* Fenêtre de correction d'une carte ou d'une question. cb(patch) est appelé à l'enregistrement. */
  function editItem(kind, item, cb) {
    var f = {};
    var body = h('div', { class: 'trust-edit' });
    function field(id, label, value, multi) {
      var inp = multi ? h('textarea', { id: id, rows: 3 }) : h('input', { id: id, type: 'text' });
      inp.value = value == null ? '' : String(value);
      f[id] = inp;
      body.appendChild(h('label', { for: id }, label)); body.appendChild(inp);
      return inp;
    }
    var fix = function () { return item.flagged ? 'Corrige ce qui est faux, puis enregistre.' : ''; };
    body.appendChild(h('p', { class: 'trust-hint' }, fix() || 'Modifie le texte comme tu veux.'));
    if (kind === 'card') {
      field('tr-front', 'Recto (la question)', item.front, true);
      field('tr-back', 'Verso (la réponse)', item.back, true);
    } else {
      field('tr-q', 'Question', item.q, true);
      if (item.type === 'qcm' && Array.isArray(item.choices)) {
        item.choices.forEach(function (c, i) { field('tr-c' + i, 'Choix ' + (i + 1) + (Number(item.answer) === i ? ' (bonne réponse)' : ''), c, false); });
      } else if (item.type === 'vf') {
        var sel = h('select', { id: 'tr-vf' }, h('option', { value: 'true' }, 'Vrai'), h('option', { value: 'false' }, 'Faux'));
        sel.value = String(item.answer === true || item.answer === 'true'); f['tr-vf'] = sel;
        body.appendChild(h('label', { for: 'tr-vf' }, 'Bonne réponse')); body.appendChild(sel);
      } else field('tr-a', 'Bonne réponse', item.answer, item.type === 'open');
      field('tr-e', 'Explication', item.explain, true);
    }
    S.ui.modal({
      title: kind === 'card' ? 'Corriger la carte' : 'Corriger la question', body: body,
      actions: [{ label: 'Annuler' }, { label: 'Enregistrer', kind: 'primary', onClick: function () {
        var patch;
        if (kind === 'card') {
          patch = { front: f['tr-front'].value.trim(), back: f['tr-back'].value.trim() };
          if (!patch.front || !patch.back) { toast('Écris quelque chose au recto et au verso.', 'error'); return false; }
        } else {
          patch = { q: f['tr-q'].value.trim(), explain: f['tr-e'].value.trim() };
          if (!patch.q) { toast('La question ne peut pas être vide.', 'error'); return false; }
          if (item.type === 'qcm' && Array.isArray(item.choices)) {
            patch.choices = item.choices.map(function (c, i) { return f['tr-c' + i].value.trim(); });
            if (patch.choices.some(function (c) { return !c; })) { toast('Chaque choix doit contenir du texte.', 'error'); return false; }
          } else if (item.type === 'vf') patch.answer = f['tr-vf'].value === 'true';
          else {
            patch.answer = f['tr-a'].value.trim();
            if (!patch.answer) { toast('Écris la bonne réponse.', 'error'); return false; }
            if (item.type === 'fill' && patch.q.indexOf('____') < 0) { toast('Garde « ____ » à la place du mot manquant.', 'error'); return false; }
          }
        }
        patch.flagged = false;
        cb(patch);
        toast('Merci, c’est corrigé !', 'success');
      } }]
    });
  }

  /* Boutons de session. opts : { kind:'card'|'question', parentId, canViewSource():bool, onFlagged(item), onFixed(patch) } */
  function tools(item, opts) {
    opts = opts || {};
    var kind = opts.kind || 'card';
    var wrap = h('div', { class: 'trust-tools', role: 'group', 'aria-label': 'Vérifier cet élément' });
    var panel = h('div', { class: 'trust-source', role: 'region', 'aria-live': 'polite', hidden: true });
    if (item.source) {
      var sb = h('button', { class: 'btn btn-ghost trust-btn', type: 'button', 'aria-expanded': 'false', onclick: function () {
        if (opts.canViewSource && !opts.canViewSource()) { toast('Réponds d’abord, puis regarde ton cours.', 'info'); return; }
        var open = panel.hasAttribute('hidden');
        if (open) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', '');
        sb.setAttribute('aria-expanded', open ? 'true' : 'false');
      } }, '📖 Voir dans mon cours');
      wrap.appendChild(sb);
      panel.appendChild(h('strong', null, 'Dans ton cours :'));
      panel.appendChild(h('blockquote', null, '« ' + item.source + ' »'));
    }
    var fb = h('button', { class: 'btn btn-ghost trust-btn trust-flag', type: 'button', onclick: function () {
      if (opts.persist) opts.persist({ flagged: true });
      else if (!flagItem(kind, opts.parentId, item.id, true)) toast('Signalement impossible à enregistrer.', 'error');
      item.flagged = true;
      if (opts.onFlagged) opts.onFlagged(item);
      S.ui.modal({ title: '🚩 Merci !', body: (kind === 'card' ? 'J’ai mis cette carte de côté.' : 'J’ai mis cette question de côté.') + '\nElle ne reviendra pas tant qu’elle n’est pas corrigée. Veux-tu la corriger maintenant ?',
        actions: [{ label: 'Plus tard' }, { label: '✏️ Corriger', kind: 'primary', onClick: function () {
          setTimeout(function () {
            editItem(kind, item, function (patch) {
              Object.assign(item, patch);
              if (opts.persist) opts.persist(patch); else flagItem(kind, opts.parentId, item.id, false, patch);
              if (opts.onFixed) opts.onFixed(patch);
            });
          }, 0);
        } }] });
    } }, '🚩 Il y a une erreur');
    wrap.appendChild(fb);
    var box = h('div', { class: 'trust-tools-box' }, wrap, panel);
    return box;
  }
  Object.assign(S.trust, { badge: badge, tools: tools, editItem: function (kind, item, parentId, cb) {
    editItem(kind, item, function (patch) { flagItem(kind, parentId, item.id, false, patch); if (cb) cb(patch); });
  } });

  /* --- Blocs réutilisables : aides, avertissement fournisseur, bandeau IA ----------------------- */
  function link(url, label) { return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, label); }
  function helpBlock(country, opts) {
    opts = opts || {};
    var box = h('div', { class: 'trust-help' });
    helpData(country).forEach(function (g) {
      box.appendChild(h('div', { class: 'trust-help-country' }, h('strong', null, g.name),
        h('ul', null, g.lines.map(function (l) {
          return h('li', null, h('a', { class: 'trust-tel', href: 'tel:' + l.tel }, l.num), ' ', h('strong', null, l.label), ' : ' + l.detail + ' ', l.url ? link(l.url, 'Site') : null);
        }))));
    });
    box.appendChild(h('p', { class: 'trust-help-urgence' }, emergencyLine(country)));
    if (country === 'other') box.appendChild(h('p', { class: 'trust-hint' }, 'Pays non listé : demande à un adulte le numéro d’urgence local.'));
    return box;
  }
  function noticeEl(provider) {
    var n = providerNotice(provider);
    if (!n) return null;
    return h('p', { class: 'trust-provider-note trust-provider-' + n.level, role: n.level === 'warn' ? 'alert' : 'note' },
      h('span', { 'aria-hidden': 'true' }, n.level === 'warn' ? '⚠️ ' : 'ℹ️ '), n.text + ' ', link(n.url, n.linkLabel));
  }
  function countrySelect(id, value, onchange) {
    var sel = h('select', { class: 'select', id: id }, h('option', { value: '' }, 'Choisis un pays'),
      COUNTRIES.map(function (c) { return h('option', { value: c[0] }, c[1]); }));
    sel.value = value || '';
    sel.addEventListener('change', function () { onchange(sel.value); });
    return sel;
  }
  function aiBanner() {
    return h('p', { class: 'trust-ai-banner', role: 'note', 'data-trust-banner': '1' }, h('span', { 'aria-hidden': 'true' }, '🤖 '), 'Tu parles à une IA, elle peut se tromper');
  }
  function aiOn() { try { return !!(S.gen && S.gen.available && S.gen.available().ai); } catch (e) { return false; } }

  /* --- Consentement : adulte d'abord, version courte pour l'élève ensuite ------------------- */
  var consentOpen = false;
  function consentContent() { return (S.content && S.content.parents && S.content.parents.consent) || {}; }
  function showConsent(opts) {
    opts = opts || {};
    if (consentOpen || !S.ui || !S.ui.modal) return;
    consentOpen = true;
    var C = consentContent(), A = C.adulte || {}, E = C.eleve || {};
    var st = settings();
    var form = { country: getCountry(), provider: TERMS[st.provider] ? st.provider : 'anthropic' };
    var box = h('div', { class: 'trust-consent' });
    var handle;
    function title(t) { var t2 = handle && handle.el && handle.el.querySelector('.modal-header h2'); if (t2) t2.textContent = t; }
    function btns() {
      var row = h('div', { class: 'trust-consent-actions' });
      for (var i = 0; i < arguments.length; i++) row.appendChild(arguments[i]);
      return row;
    }
    function btn(label, primary, fn) { return h('button', { type: 'button', class: 'btn ' + (primary ? 'btn-primary' : 'btn-ghost'), onclick: fn }, label); }
    function finish() { if (handle) handle.close(); }
    function without() { setConsent(false); toast('D’accord : tout sera créé sans IA, sur ton appareil.', 'info'); finish(); }
    function paras(list) { return (Array.isArray(list) ? list : [list]).filter(Boolean).map(function (t) { return h('p', null, t); }); }
    function go(step) { box.innerHTML = ''; steps[step](); var f = box.querySelector('button.btn-primary, input, select'); if (f) f.focus(); }

    var steps = {
      intro: function () {
        title('🔒 L’IA : un adulte décide');
        box.appendChild(h('p', { class: 'trust-strong' }, 'C’est un parent ou un professeur qui active l’IA.'));
        box.appendChild(h('p', null, 'Studio marche très bien sans IA. Alors rien n’est envoyé à une IA.'));
        box.appendChild(h('p', null, 'Avec une IA, le texte du cours part chez une entreprise. Ça ne se décide pas tout(e) seul(e).'));
        box.appendChild(btns(btn('Continuer sans IA', false, without), btn('Activer l’IA (avec un adulte)', true, function () { go('handoff'); })));
      },
      handoff: function () {
        title('🤝 Donne l’appareil à un adulte');
        box.appendChild(h('p', { class: 'trust-handoff', 'aria-hidden': 'true' }, '📱 ➜ 🧑'));
        box.appendChild(h('p', { class: 'trust-strong' }, 'Donne l’appareil à un adulte (parent ou professeur).'));
        box.appendChild(h('p', null, 'L’adulte lit la suite, choisit le pays et saisit lui-même la clé. Élève : ne continue pas tout(e) seul(e).'));
        box.appendChild(btns(btn('Retour', false, function () { go('intro'); }), btn('Je suis un adulte, je continue', true, function () { go('adult'); })));
      },
      adult: function () {
        title('🔒 ' + (A.titre || 'Activation de l’IA : information et accord'));
        var texts = Array.isArray(A.texte) && A.texte.length ? A.texte : [
          'L’IA est désactivée par défaut. Studio fonctionne sans elle, sur l’appareil.',
          'Si vous l’activez, les extraits de cours et les questions sont envoyés au fournisseur choisi. Ses conditions s’appliquent.',
          'La clé est stockée dans le navigateur de cet appareil. Vous pouvez retirer votre accord à tout moment dans les Réglages.',
          'Une IA peut se tromper : l’élève est invité à vérifier avec son cours.'];
        paras(texts).forEach(function (p) { box.appendChild(p); });
        var ageEl = h('p', { class: 'trust-hint', id: 'trust-age' }, ageNote(form.country));
        var noteHolder = h('div', { 'aria-live': 'polite' });
        function drawNote() { noteHolder.innerHTML = ''; var n = noticeEl(form.provider); if (n) noteHolder.appendChild(n); }
        var ctry = countrySelect('trust-country', form.country, function (v) { form.country = v; ageEl.textContent = ageNote(v); });
        var prov = h('select', { class: 'select', id: 'trust-provider' }, [['anthropic', 'Anthropic (Claude)'], ['openai', 'OpenAI'], ['gemini', 'Google Gemini']].map(function (o) { return h('option', { value: o[0] }, o[1]); }));
        prov.value = form.provider; prov.addEventListener('change', function () { form.provider = prov.value; drawNote(); });
        var key = h('input', { class: 'input', type: 'password', id: 'trust-key', autocomplete: 'off', spellcheck: 'false', placeholder: 'Clé API saisie par l’adulte' });
        var cb = h('input', { type: 'checkbox', id: 'trust-consent-cb' });
        box.appendChild(h('div', { class: 'trust-fields' },
          h('label', { for: 'trust-country' }, 'Pays (pour afficher les bonnes aides)'), ctry,
          h('label', { for: 'trust-provider' }, 'Fournisseur d’IA'), prov, noteHolder,
          h('label', { for: 'trust-key' }, 'Clé API (à saisir par l’adulte)'), key));
        box.appendChild(ageEl);
        drawNote();
        box.appendChild(h('label', { class: 'trust-check', for: 'trust-consent-cb' }, cb,
          h('span', null, 'J’ai lu où vont les données (le texte du cours part chez le fournisseur choisi) et je suis responsable de cet accord.')));
        var yes = btn(A.boutonOui || 'J’ai lu et j’active l’IA', true, function () {
          if (!form.country) { toast('Choisis un pays pour afficher les bonnes aides.', 'info'); ctry.focus(); return; }
          if (!key.value.trim()) { toast('L’adulte doit saisir la clé API.', 'info'); key.focus(); return; }
          if (!cb.checked) { toast('Coche d’abord la case : l’adulte est responsable de l’accord.', 'info'); cb.focus(); return; }
          setConsent(true, { aiConsentBy: 'adult', country: form.country, provider: form.provider, apiKey: key.value.trim() });
          go('student');
        });
        yes.setAttribute('aria-disabled', 'true'); yes.classList.add('trust-disabled');
        cb.addEventListener('change', function () { yes.setAttribute('aria-disabled', cb.checked ? 'false' : 'true'); yes.classList.toggle('trust-disabled', !cb.checked); });
        box.appendChild(btns(btn(A.boutonNon || 'Garder l’IA désactivée', false, without), yes));
      },
      student: function () {
        title('📌 Avant d’utiliser l’IA');
        paras(Array.isArray(E.texte) && E.texte.length ? E.texte : [
          'L’IA peut créer de meilleures cartes.',
          'Pour ça, des morceaux de ton cours sont envoyés par Internet.',
          'Une IA peut se tromper. Vérifie avec ton cours.',
          'Un adulte peut l’arrêter quand il veut dans Réglages.']).forEach(function (p) { box.appendChild(p); });
        box.appendChild(h('p', null, 'Si ça ne va pas, parle à un adulte. Tu peux aussi appeler :'));
        box.appendChild(helpBlock(form.country));
        box.appendChild(btns(btn('J’ai compris', true, function () { toast('IA activée par un adulte.', 'success'); finish(); })));
      }
    };
    handle = S.ui.modal({
      title: '🔒 Avant de commencer', body: box, dismissable: false, actions: [],
      onClose: function () { consentOpen = false; if (opts.onDone) opts.onDone(hasConsent()); }
    });
    var acts = handle && handle.el && handle.el.querySelector('.modal-actions'); if (acts) acts.style.display = 'none';
    go('intro');
  }
  S.trust.showConsent = showConsent;
  S.trust.aiBanner = aiBanner;
  S.trust.helpBlock = helpBlock;

  function scheduleConsent() {
    if (S.platform) return;   /* plateforme de l'école : jamais de proposition d'IA toute seule ; l'accord d'un adulte n'est demandé que si une clé est saisie dans Réglages */
    if (consentAsked()) return;
    var tries = 0;
    (function wait() {
      // laisse d'abord l'accueil (onboarding) se terminer, puis demande le consentement
      if (document.querySelector('.modal-backdrop') && tries++ < 600) return setTimeout(wait, 500);
      if (!consentAsked()) showConsent();
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(scheduleConsent, 300); });
  else setTimeout(scheduleConsent, 300);

  /* --- Bandeau « Tu parles à une IA » dans le chat et l'écran des agents + avertissement fournisseur dans Réglages --- */
  function decorate(node) {
    if (!node || node.nodeType !== 1) return;
    var chat = node.matches('.chat-mode') ? node : node.querySelector('.chat-mode');
    if (chat && !chat.querySelector('[data-trust-banner]') && aiOn()) {
      var h1 = chat.querySelector('h1');
      chat.insertBefore(aiBanner(), h1 ? h1.nextSibling : chat.firstChild);
    }
    var crew = node.matches('.crew-panel') ? node : node.querySelector('.crew-panel');
    if (crew && !crew.querySelector('[data-trust-banner]') && aiOn()) {
      var head = crew.querySelector('.crew-head');
      if (head) head.appendChild(aiBanner()); else crew.insertBefore(aiBanner(), crew.firstChild);
    }
    var sel = node.matches('#set-provider') ? node : node.querySelector('#set-provider');
    if (sel && !sel.getAttribute('data-trust-warn')) {
      sel.setAttribute('data-trust-warn', '1');
      var holder = h('div', { class: 'trust-provider-holder', 'aria-live': 'polite' });
      var field = sel.parentNode;
      field.parentNode.insertBefore(holder, field.nextSibling);
      var paint = function () { holder.innerHTML = ''; var n = noticeEl(sel.value); if (n) holder.appendChild(n); };
      sel.addEventListener('change', paint); paint();
    }
  }
  if (typeof MutationObserver !== 'undefined') {
    new MutationObserver(function (muts) {
      muts.forEach(function (m) { for (var i = 0; i < m.addedNodes.length; i++) decorate(m.addedNodes[i]); });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  S.trust.decorate = decorate;

  /* --- Retrait de l'accord (Réglages et page parents) -------------------------------------- */
  function doWithdraw(after) {
    return Promise.resolve(S.ui.confirm('Retirer ton accord ? L’IA sera désactivée et la clé API sera effacée de cet appareil. Studio continuera de marcher sans IA.',
      { title: 'Retirer mon accord', ok: 'Retirer mon accord', danger: true })).then(function (ok) {
      if (!ok) return;
      withdraw();
      var k = document.getElementById('set-key'); if (k) k.value = '';
      toast('Accord retiré : IA désactivée, clé effacée.', 'info');
      if (after) after();
    });
  }
  S.trust.confirmWithdraw = doWithdraw;

  /* --- Réglages : section « IA et confidentialité » ---------------------------------------- */
  S.settingsSections = S.settingsSections || [];
  S.settingsSections.push({ id: 'trust-ai', title: 'IA et confidentialité', render: function (c) {
    function draw() {
      c.innerHTML = '';
      var on = hasConsent();
      c.appendChild(h('p', null, on ? '✅ Un adulte a donné son accord : l’IA peut être utilisée avec la clé enregistrée.' : '🔒 L’IA est désactivée. Tout est créé sans IA.'));
      var n = noticeEl(settings().provider); if (n) c.appendChild(n);
      c.appendChild(h('label', { for: 'trust-set-country', class: 'trust-label' }, 'Pays (pour les aides et urgences)'));
      c.appendChild(countrySelect('trust-set-country', getCountry(), function (v) { setCountry(v); toast('Pays enregistré.', 'success'); }));
      c.appendChild(h('div', { class: 'trust-actions' }, on
        ? h('button', { class: 'btn btn-ghost btn-danger', type: 'button', onclick: function () { doWithdraw(draw); } }, 'Retirer mon accord')
        : h('button', { class: 'btn btn-primary', type: 'button', onclick: function () { showConsent({ onDone: draw }); } }, 'Activer l’IA (avec un adulte)')));
    }
    draw();
  } });

  /* --- Module « Pour les parents » ---------------------------------------------------------- */
  function download(name, text) {
    var a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); if (a.parentNode) a.parentNode.removeChild(a); }, 500);
  }
  function renderParents(container) {
    container.innerHTML = '';
    var P = parentsContent();
    var wrap = h('div', { class: 'trust-parents' }, h('h1', null, '👪 ' + P.title));
    if (P.intro) wrap.appendChild(h('p', { class: 'trust-lead' }, P.intro));
    var helpSec = null;
    var raw = S.content && S.content.parents;
    P.sections = P.sections.filter(function (x) { if (!helpSec && /aide|urgence/i.test(x.title || '')) { helpSec = x; return false; } return true; });
    if (!helpSec && raw && typeof raw === 'object' && (raw.aide || raw.urgences)) { var rs = raw.aide || raw.urgences; helpSec = typeof rs === 'string' ? { text: rs } : { text: Array.isArray(rs.texte || rs.text) ? (rs.texte || rs.text).join('\n\n') : String(rs.texte || rs.text || '') }; }
    P.sections.forEach(function (s) {
      var card = h('section', { class: 'card trust-section' });
      if (s.title) card.appendChild(h('h2', null, s.title));
      String(s.text || '').split(/\n{2,}/).filter(Boolean).forEach(function (para) { card.appendChild(h('p', null, para)); });
      if (Array.isArray(s.items) && s.items.length) card.appendChild(h('ul', null, s.items.map(function (it) { return h('li', null, typeof it === 'string' ? it : (it.text || it.texte || it.title || '')); })));
      wrap.appendChild(card);
    });
    var helpCard = h('section', { class: 'card trust-section', id: 'trust-aide' }, h('h2', null, 'Aide et urgences'));
    var helpText0 = helpSec && helpSec.text ? helpSec.text : 'Si un élève va mal, un adulte de confiance doit être prévenu. Ces services écoutent les jeunes (et les adultes qui s’inquiètent). Choisis le pays pour voir les bons numéros.';
    String(helpText0).split(/\n{2,}/).filter(Boolean).forEach(function (para) { helpCard.appendChild(h('p', null, para)); });
    var helpHolder = h('div');
    function drawHelp(v) { helpHolder.innerHTML = ''; helpHolder.appendChild(helpBlock(v || 'all')); }
    helpCard.appendChild(h('label', { for: 'trust-par-country', class: 'trust-label' }, 'Pays'));
    helpCard.appendChild(countrySelect('trust-par-country', getCountry(), function (v) { if (v) setCountry(v); drawHelp(v); }));
    helpCard.appendChild(helpHolder); drawHelp(getCountry());
    wrap.appendChild(helpCard);
    var legal = h('section', { class: 'card trust-section', id: 'trust-legal' }, h('h2', null, 'Âge et conditions des fournisseurs d’IA'),
      h('p', null, ageNote(getCountry() || 'all')),
      h('p', null, 'Conditions des fournisseurs : l’API Gemini de Google exige 18 ans et interdit les services « likely to be accessed by individuals under the age of 18 ». Anthropic demande 18 ans pour les comptes grand public ; son API commerciale peut servir des mineurs si l’organisation met des garde-fous (vérification d’âge, modération, signalement) et informe que c’est une IA. Pour OpenAI : à vérifier.'),
      h('p', { class: 'trust-hint' }, 'Ces informations viennent de sources secondaires : faites-les valider par l’école ou un juriste avant tout usage avec des élèves.'),
      h('p', null, link(TERMS.gemini, 'Google Gemini'), ' · ', link(TERMS.anthropic, 'Anthropic'), ' · ', link(TERMS.openai, 'OpenAI')));
    if (!P.sections.some(function (x) { return /conditions des fournisseurs/i.test(x.title || ''); })) wrap.appendChild(legal);
    var st = hasConsent();
    var data = h('section', { class: 'card trust-section' }, h('h2', null, 'Les données de l’élève'),
      h('p', null, 'IA : ' + (st ? 'autorisée par un adulte.' : 'désactivée.')),
      h('div', { class: 'trust-actions' },
        st ? h('button', { class: 'btn btn-ghost', type: 'button', onclick: function () { doWithdraw(function () { renderParents(container); }); } }, 'Retirer mon accord') : null,
        h('button', { class: 'btn btn-primary', type: 'button', onclick: function () {
          var d = exportData(); download('studio-donnees-eleve.json', JSON.stringify(d, null, 2));
          toast('Fichier téléchargé (sans la clé IA).', 'success');
        } }, '⬇️ Exporter les données de l’élève'),
        h('button', { class: 'btn btn-ghost btn-danger', type: 'button', onclick: function () {
          Promise.resolve(S.ui.confirm('Effacer TOUTES les données de l’élève sur cet appareil (cours, cartes, progression, clé IA) ? Tu ne pourras pas revenir en arrière.',
            { title: 'Effacer les données', ok: 'Tout effacer', danger: true })).then(function (ok) {
            if (!ok) return;
            eraseAll(); toast('Toutes les données ont été effacées.', 'success');
            setTimeout(function () { location.reload(); }, 700);
          });
        } }, '🗑️ Effacer les données de l’élève')));
    wrap.appendChild(data);
    container.appendChild(wrap);
  }
  if (S.register) S.register({ id: 'parents', title: 'Pour les parents', icon: '👪', order: 13, needsDoc: false, render: renderParents });
})();
