/* Studio app : shell (sidebar), bibliothèque, méthodes, réglages, onboarding, démarrage. */
(function () {
  'use strict';
  var Studio = window.Studio;
  var el = Studio.ui.el;

  /* ---------- helpers ---------- */
  var DEFAULT_SETTINGS = { theme: 'auto', provider: 'none', apiKey: '', model: '', lang: 'fr', showTeam: true };
  function settings() { return Object.assign({}, DEFAULT_SETTINGS, Studio.store.get('settings', {}) || {}); }
  function saveSettings(patch) { var s = Object.assign(settings(), patch); Studio.store.set('settings', s); return s; }

  function applyTheme() {
    var t = settings().theme, dark = t === 'dark';
    if (t === 'auto') dark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', dark);
  }

  function fmtDate(ts) {
    try { return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; }
  }
  var KIND = { pdf: 'PDF', txt: 'Texte', md: 'Markdown', docx: 'Word', html: 'HTML', paste: 'Texte collé' };

  function addDoc(partial, opts) {
    var doc = Studio.store.add('docs', {
      id: Studio.ui.uid(), name: partial.name, kind: partial.kind, text: partial.text,
      words: partial.words, addedAt: Date.now(), subject: partial.subject || ''
    });
    if (!doc) return null;   // quota plein : core.js a déjà affiché « Plus de place… », rien n'est enregistré
    Studio.setActiveDoc(doc.id);
    return doc;
  }

  function demoPartial() {
    var d = Studio.content && Studio.content.demo;
    if (!d) return null;
    var text = typeof d === 'string' ? d : (d.text || d.texte || d.content || d.contenu || '');
    if (!text) return null;
    var name = typeof d === 'string' ? 'Cours d’exemple' : (d.name || d.title || d.titre || 'Cours d’exemple');
    var p = Studio.files.fromText(name, text);
    p.subject = (d && (d.subject || d.matiere)) || '';
    return p;
  }
  function loadDemo() {
    var p = demoPartial();
    if (!p) { Studio.ui.toast('Le cours d’exemple n’est pas disponible.', 'error'); return null; }
    var existing = Studio.store.list('docs').filter(function (d) { return d.name === p.name && d.text === p.text; })[0];
    if (existing) { Studio.setActiveDoc(existing.id); Studio.ui.toast('Le cours d’exemple est déjà dans ta bibliothèque.'); return existing; }
    var doc = addDoc(p);
    if (!doc) return null;
    Studio.ui.toast('Cours d’exemple ajouté ✨', 'success');
    return doc;
  }

  /* Mise en scène « L'équipe lit ton cours » (si Réglages > Montrer l'équipe au travail) */
  function teamReads(label) { if (Studio.crew && Studio.crew.reading && settings().showTeam !== false) Studio.crew.reading(label); }

  function importFiles(files, then) {
    Studio.files.readMany(files).then(function (r) {
      var saved = r.docs.filter(function (p) { return !!addDoc(p); });
      if (saved.length) Studio.bus.emit('activity', { type: 'import', count: saved.length });
      if (saved.length) Studio.ui.toast(saved.length === 1 ? 'Document ajouté : ' + saved[0].name : saved.length + ' documents ajoutés', 'success');
      if (saved.length) teamReads(saved.length === 1 ? saved[0].name : saved.length + ' documents');
      r.errors.forEach(function (e) { Studio.ui.toast(e.message, 'error'); });
      if (then) then(r);
    });
  }

  function deleteDoc(doc) {
    return Studio.ui.confirm('Supprimer « ' + doc.name + ' » ainsi que les cartes créées à partir de lui ? Cette action est définitive.',
      { title: 'Supprimer ce document', ok: 'Supprimer', danger: true }).then(function (ok) {
      if (!ok) return;
      ['decks', 'quizzes', 'summaries', 'mnemos', 'mindmaps'].forEach(function (c) {
        Studio.store.list(c).filter(function (x) { return x.docId === doc.id; }).forEach(function (x) { Studio.store.remove(c, x.id); });
      });
      Studio.store.remove('docs', doc.id);
      Studio.ui.toast('Document supprimé.');
    });
  }

  /* ---------- menu : ordre demandé par le prof ---------- */
  /* Accueil · Chapitre 1-4 · Évaluations · Bonus · (Espace prof) · outils d'étude de Studio. Les autres pages (Mon compte, Le Bureau…) restent
     accessibles par lien mais ne sont pas dans le menu. */
  var NAV_ORDER = ['today', 'chapitre-1', 'chapitre-2', 'chapitre-3', 'chapitre-4', 'evaluations', 'bonus', 'prof',
    'flashcards', 'memory', 'mnemo', 'mindmap', 'chat', 'methods', 'library', 'subjects', 'dashboard', 'room', 'settings', 'parents'];
  function navModules(mods, isProf) {
    var byId = {}; mods.forEach(function (m) { byId[m.id] = m; });
    return NAV_ORDER.filter(function (id) { return byId[id] && (id !== 'prof' || isProf); }).map(function (id) { return byId[id]; });
  }
  Studio.navOrder = NAV_ORDER;
  Studio.navModules = navModules;

  /* ---------- sidebar ---------- */
  /* La coquille (marque, <nav id="nav">, pied de barre) vient d'index.html : on la complète sans la remplacer. */
  var sidebar, docSelect, streakEl, navEl;

  function buildSidebar() {
    sidebar = document.getElementById('sidebar') || document.querySelector('.sidebar');
    if (!sidebar) { sidebar = el('aside', { class: 'sidebar', id: 'sidebar' }); document.body.insertBefore(sidebar, document.body.firstChild); }
    navEl = document.getElementById('nav') || sidebar.querySelector('.nav');
    if (!navEl) { navEl = el('nav', { class: 'nav', id: 'nav', 'aria-label': 'Navigation principale' }); sidebar.appendChild(navEl); }
    var brand = sidebar.querySelector('.brand');
    if (brand) brand.setAttribute('href', '#/');
    else sidebar.insertBefore(el('a', { class: 'brand', href: '#/library' }, el('span', { class: 'brand-name' }, 'Studio')), sidebar.firstChild);

    docSelect = el('select', { id: 'active-doc', class: 'select', 'aria-label': 'Document actif', onchange: function () {
      if (docSelect.value) Studio.setActiveDoc(docSelect.value);
    } });
    streakEl = el('div', { class: 'badge badge-coral', title: 'Jours consécutifs d’étude' });
    var footer = document.getElementById('sidebar-footer') || sidebar.querySelector('.sidebar-footer');
    if (!footer) { footer = el('div', { class: 'sidebar-footer', id: 'sidebar-footer' }); sidebar.appendChild(footer); }
    footer.insertBefore(el('label', { class: 'small muted', for: 'active-doc' }, 'Document actif'), footer.firstChild);
    footer.insertBefore(docSelect, footer.children[1] || null);
    footer.insertBefore(streakEl, footer.children[2] || null);
    refreshSidebar();
  }

  function refreshSidebar() {
    if (!sidebar) return;
    var cur = Studio.current().moduleId, docs = Studio.store.list('docs'), active = Studio.activeDocId();
    Studio.ui.clear(docSelect);
    if (!docs.length) docSelect.appendChild(el('option', { value: '' }, 'Aucun document'));
    docs.forEach(function (d) { docSelect.appendChild(el('option', { value: d.id, selected: d.id === active }, d.name)); });
    docSelect.disabled = !docs.length;

    Studio.ui.clear(navEl);
    var isProf = !!(Studio.platform && Studio.platform.isProf && Studio.platform.isProf());
    navModules(Studio.modules(), isProf).forEach(function (m) {
      if (m.id === 'flashcards' && navEl.lastChild && !navEl.querySelector('.nav-sep')) navEl.appendChild(el('div', { class: 'nav-sep', role: 'separator' }));
      var a = el('a', { href: '#/' + m.id, class: 'nav-item' + (m.id === cur ? ' is-active' : ''), 'data-module': m.id },
        el('span', { class: 'nav-icon', 'aria-hidden': 'true' }, m.icon || ''), el('span', { class: 'nav-label' }, m.title));
      if (m.id === cur) a.setAttribute('aria-current', 'page');
      navEl.appendChild(a);
    });
    var s = (Studio.game && Studio.game.streak) ? Studio.game.streak().count : Studio.stats.currentStreak();   // série douce si le jeu est chargé
    streakEl.textContent = '🔥 ' + s + ' jour' + (s > 1 ? 's' : '') + ' d’affilée';
  }

  /* ---------- bibliothèque ---------- */
  function renderLibrary(c) {
    var docs = Studio.store.list('docs'), active = Studio.activeDocId();
    var wrap = el('div', { class: 'library' });
    wrap.appendChild(el('h1', null, 'Ma bibliothèque'));
    wrap.appendChild(el('p', null, 'Dépose tes cours, Studio s’occupe du reste : flashcards, jeux et plus encore.'));

    var fileInput = el('input', { type: 'file', multiple: true, accept: Studio.files.accept, style: 'display:none', 'aria-label': 'Choisir des fichiers',
      onchange: function () { if (fileInput.files.length) importFiles(fileInput.files); fileInput.value = ''; } });
    var drop = el('div', { class: 'card dropzone', tabindex: '0', role: 'button', 'aria-label': 'Déposer ou choisir des fichiers de cours',
      style: 'text-align:center;cursor:pointer' },
      el('div', { 'aria-hidden': 'true', style: 'font-size:2rem' }, '📂'),
      el('h2', null, 'Glisse tes cours ici'),
      el('p', null, 'PDF, Word (.docx), HTML, Markdown ou texte — ou clique pour parcourir.'),
      fileInput);
    drop.addEventListener('click', function (e) { if (e.target !== fileInput) fileInput.click(); });
    drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } });
    Studio.files.dropzone(drop, function (f) { importFiles(f); });
    wrap.appendChild(drop);

    var nameIn = el('input', { class: 'input', type: 'text', id: 'paste-name', placeholder: 'Titre (ex. Chapitre 3 — La photosynthèse)', style: 'width:100%' });
    var textIn = el('textarea', { class: 'textarea', id: 'paste-text', rows: '6', placeholder: 'Colle ici le texte de ton cours…', style: 'width:100%' });
    var pasteCard = el('div', { class: 'card' },
      el('h2', null, 'Ou colle ton texte'),
      el('label', { for: 'paste-name' }, 'Titre'), nameIn,
      el('label', { for: 'paste-text' }, 'Texte du cours'), textIn,
      el('div', { style: 'margin-top:12px;display:flex;gap:8px;flex-wrap:wrap' },
        el('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
          try {
            var p = Studio.files.fromText(nameIn.value, textIn.value);
            if (addDoc(p)) { Studio.ui.toast('Document ajouté : ' + p.name, 'success'); teamReads(p.name); }
          } catch (e) { Studio.ui.toast(e.userMessage || e.message, 'error'); textIn.focus(); }
        } }, 'Ajouter ce texte'),
        el('button', { type: 'button', class: 'btn btn-ghost', onclick: function () { loadDemo(); } }, '✨ Charger le cours d’exemple'),
        (Studio.libraryActions || []).map(function (a) {
          return el('button', { type: 'button', class: 'btn btn-ghost', 'data-action': a.id, onclick: function () { try { a.onClick({ addDoc: addDoc }); } catch (e) { Studio.ui.toast(e.message, 'error'); } } }, (a.icon ? a.icon + ' ' : '') + a.label);
        })));
    wrap.appendChild(el('div', { style: 'margin-top:16px' }, pasteCard));

    wrap.appendChild(el('h2', { style: 'margin-top:24px' }, 'Mes documents (' + docs.length + ')'));
    if (!docs.length) {
      var holder = el('div');
      Studio.ui.empty(holder, { icon: '📚', title: 'Ta bibliothèque est vide', text: 'Ajoute un cours ci-dessus, ou essaie avec le cours d’exemple.', cta: { label: 'Charger le cours d’exemple', onClick: loadDemo } });
      wrap.appendChild(holder);
    } else {
      var grid = el('div', { class: 'grid' });
      docs.slice().reverse().forEach(function (d) {
        var isActive = d.id === active;
        var nDecks = Studio.store.list('decks').filter(function (x) { return x.docId === d.id; }).length;
        grid.appendChild(el('article', { class: 'card doc-card' + (isActive ? ' is-active' : ''), 'aria-label': d.name },
          el('div', { style: 'display:flex;justify-content:space-between;gap:8px;align-items:start' },
            el('h3', { style: 'margin:0;word-break:break-word' }, d.name),
            isActive ? el('span', { class: 'badge' }, 'Actif') : null),
          el('div', { style: 'margin:8px 0;display:flex;gap:6px;flex-wrap:wrap' },
            el('span', { class: 'chip' }, KIND[d.kind] || d.kind),
            el('span', { class: 'chip' }, (d.words || 0).toLocaleString('fr-FR') + ' mots'),
            el('span', { class: 'chip' }, nDecks + ' paquet' + (nDecks > 1 ? 's' : ''))),
          el('p', { style: 'opacity:.75;font-size:.85rem;margin:0 0 12px' }, 'Ajouté le ' + fmtDate(d.addedAt)),
          el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
            el('button', { type: 'button', class: 'btn btn-primary', onclick: function () { Studio.setActiveDoc(d.id); Studio.go('flashcards'); } }, 'Étudier'),
            isActive ? null : el('button', { type: 'button', class: 'btn btn-ghost', onclick: function () { Studio.setActiveDoc(d.id); } }, 'Sélectionner'),
            el('button', { type: 'button', class: 'btn btn-ghost', 'aria-label': 'Supprimer ' + d.name, onclick: function () { deleteDoc(d); } }, '🗑 Supprimer'))));
      });
      wrap.appendChild(grid);
    }
    c.appendChild(wrap);
  }

  /* ---------- méthodes (guide) ---------- */
  var METHOD_LABELS = { resume: '', pourquoi: 'Pourquoi ça marche', etapes: 'Comment faire', exemple: 'Exemple', duree: 'Durée', niveau: 'Niveau' };
  function renderMethods(c) {
    var data = Studio.content && Studio.content.methods;
    var wrap = el('div', { class: 'methods stack' }, el('div', { class: 'page-header' }, el('div', null, el('h1', null, 'Méthodes d’apprentissage'),
      el('p', { class: 'lead' }, 'Des techniques simples et prouvées pour mieux retenir.'))));
    if (!data || (Array.isArray(data) && !data.length)) {
      var holder = el('div'); wrap.appendChild(holder);
      Studio.ui.empty(holder, { icon: '🧠', title: 'Guide bientôt disponible', text: 'Les fiches méthodes ne sont pas chargées.' });
      c.appendChild(wrap); return;
    }
    var list = Array.isArray(data) ? data : Object.keys(data).map(function (k) { var v = data[k]; return typeof v === 'object' && v ? Object.assign({ id: k }, v) : { title: k, body: String(v) }; });
    var grid = el('div', { class: 'grid grid-2' });
    list.forEach(function (m) {
      if (typeof m === 'string') m = { body: m };
      var title = m.title || m.titre || m.name || m.nom || '';
      var card = el('article', { class: 'card stack-sm' }, (m.icon || m.emoji) ? el('div', { class: 'card-icon', 'aria-hidden': 'true' }, m.icon || m.emoji) : null, el('h2', null, title));
      var meta = [];
      Object.keys(m).forEach(function (k) {
        if (/^(id|title|titre|name|nom|icon|emoji)$/.test(k)) return;
        var v = m[k];
        if (v == null || v === '') return;
        if (k === 'duree' || k === 'niveau') { meta.push(el('span', { class: 'badge' }, (k === 'duree' ? '⏱ ' : '🎚 ') + v)); return; }
        var html;
        if (Array.isArray(v)) {
          var ordered = k === 'etapes' || k === 'steps';
          html = Studio.ui.md(v.map(function (x, n) { return (ordered ? (n + 1) + '. ' : '- ') + (typeof x === 'object' ? Object.keys(x).map(function (kk) { return x[kk]; }).join(' — ') : x); }).join('\n'));
        } else if (typeof v === 'object') return;
        else html = Studio.ui.md(String(v));
        var label = METHOD_LABELS[k];
        card.appendChild(el('div', { 'data-field': k }, label ? el('strong', null, label) : null, el('div', { class: 'md', html: html })));
      });
      if (meta.length) card.appendChild(el('div', { class: 'row wrap' }, meta));
      grid.appendChild(card);
    });
    wrap.appendChild(grid); c.appendChild(wrap);
  }

  /* ---------- réglages ---------- */
  function download(name, text) {
    var a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function field(label, id, control, help) {
    return el('div', { class: 'field', style: 'margin:12px 0' }, el('label', { for: id, style: 'display:block;font-weight:600;margin-bottom:4px' }, label), control,
      help ? el('p', { style: 'font-size:.85rem;opacity:.75;margin:4px 0 0' }, help) : null);
  }

  function renderSettings(c) {
    var s = settings();
    var theme = el('select', { class: 'select', id: 'set-theme', onchange: function () { saveSettings({ theme: theme.value }); applyTheme(); } },
      [['auto', 'Automatique (selon ton appareil)'], ['light', 'Clair'], ['dark', 'Sombre']].map(function (o) { return el('option', { value: o[0], selected: s.theme === o[0] }, o[1]); }));
    var provider = el('select', { class: 'select', id: 'set-provider', onchange: function () { saveSettings({ provider: provider.value }); Studio.ui.toast('Fournisseur enregistré.'); } },
      [['none', 'Aucun (mode hors-ligne)'], ['anthropic', 'Anthropic (Claude)'], ['openai', 'OpenAI'], ['gemini', 'Google Gemini']].map(function (o) { return el('option', { value: o[0], selected: s.provider === o[0] }, o[1]); }));
    var key = el('input', { class: 'input', type: 'password', id: 'set-key', value: s.apiKey, autocomplete: 'off', spellcheck: 'false', style: 'width:100%', placeholder: 'Colle ta clé API ici',
      onchange: function () { saveSettings({ apiKey: key.value.trim() }); Studio.ui.toast('Clé enregistrée sur cet appareil.'); } });
    var showKey = el('input', { type: 'checkbox', id: 'set-showkey', onchange: function () { key.type = showKey.checked ? 'text' : 'password'; } });
    var model = el('input', { class: 'input', type: 'text', id: 'set-model', value: s.model, style: 'width:100%', placeholder: 'Laisser vide pour le modèle par défaut',
      onchange: function () { saveSettings({ model: model.value.trim() }); Studio.ui.toast('Modèle enregistré.'); } });

    var showTeam = el('input', { type: 'checkbox', id: 'set-showteam', checked: s.showTeam !== false, onchange: function () { saveSettings({ showTeam: showTeam.checked }); Studio.ui.toast(showTeam.checked ? 'L’équipe sera visible pendant ses tâches.' : 'L’équipe restera discrète (bandeau seulement).'); } });
    var inclKey = el('input', { type: 'checkbox', id: 'exp-key' });
    var importIn = el('input', { type: 'file', accept: '.json,application/json', style: 'display:none', 'aria-label': 'Choisir une sauvegarde JSON',
      onchange: function () {
        var f = importIn.files[0]; importIn.value = '';
        if (!f) return;
        var r = new FileReader();
        r.onload = function () {
          var obj;
          try { obj = JSON.parse(r.result); if (!obj || obj.app !== 'studio' || !obj.data) throw new Error(); }
          catch (e) { Studio.ui.toast('Ce fichier n’est pas une sauvegarde Studio valide.', 'error'); return; }
          Studio.ui.confirm('Importer cette sauvegarde remplacera toutes tes données actuelles (documents, cartes, progression). Continuer ?',
            { title: 'Importer une sauvegarde', ok: 'Remplacer mes données', danger: true }).then(function (ok) {
            if (!ok) return;
            try { Studio.store.importAll(obj); } catch (e) { Studio.ui.toast(e.message, 'error'); return; }
            Studio.ui.toast('Sauvegarde importée.', 'success');
            setTimeout(function () { location.reload(); }, 600);
          });
        };
        r.onerror = function () { Studio.ui.toast('Impossible de lire ce fichier.', 'error'); };
        r.readAsText(f);
      } });

    var settingsBox = el('div', { class: 'settings' },
      el('h1', null, 'Réglages'),
      el('section', { class: 'card' }, el('h2', null, 'Apparence'), field('Thème', 'set-theme', theme),
        el('label', { style: 'display:inline-flex;gap:8px;align-items:center;font-weight:600' }, showTeam, 'Montrer l’équipe au travail'),
        el('p', { style: 'font-size:.85rem;opacity:.75;margin:4px 0 0' }, 'Une fenêtre montre les agents pendant la création de tes cartes, et quand tu ajoutes un cours.')),
      el('section', { class: 'card', style: 'margin-top:16px' }, el('h2', null, 'Intelligence artificielle (facultatif)'),
        el('p', null, 'Sans clé, Studio fonctionne hors-ligne avec des générateurs simples. Avec ta clé, les cartes sont bien plus pertinentes.'),
        field('Fournisseur', 'set-provider', provider),
        field('Clé API', 'set-key', key, 'La clé reste dans ton navigateur et n’est envoyée qu’au fournisseur choisi. Ne l’utilise pas sur un ordinateur partagé.'),
        el('label', { style: 'display:inline-flex;gap:6px;align-items:center' }, showKey, 'Afficher la clé'),
        field('Modèle', 'set-model', model)),
      el('section', { class: 'card', style: 'margin-top:16px' }, el('h2', null, 'Tes données'),
        el('p', null, 'Tes données sont sur cet appareil et sauvegardées sur la plateforme de ton école. Tu peux aussi exporter une copie dans un fichier.'),
        el('label', { style: 'display:inline-flex;gap:6px;align-items:center;margin-bottom:8px' }, inclKey, 'Inclure ma clé API dans l’export'),
        el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
          el('button', { type: 'button', class: 'btn btn-primary', onclick: function () {
            download('studio-sauvegarde-' + Studio.stats.dayKey() + '.json', JSON.stringify(Studio.store.exportAll(inclKey.checked), null, 2));
            Studio.ui.toast('Sauvegarde téléchargée.', 'success');
          } }, '⬇ Exporter mes données'),
          el('button', { type: 'button', class: 'btn btn-ghost', onclick: function () { importIn.click(); } }, '⬆ Importer une sauvegarde'),
          importIn,
          el('button', { type: 'button', class: 'btn btn-ghost', onclick: function () {
            Studio.ui.confirm('Effacer définitivement TOUTES tes données (documents, cartes, progression, réglages) ? Pense à exporter avant.',
              { title: 'Tout effacer', ok: 'Tout effacer', danger: true }).then(function (ok) {
              if (!ok) return;
              Studio.store.clear(); Studio.ui.toast('Données effacées.');
              setTimeout(function () { location.reload(); }, 500);
            });
          } }, '🗑 Tout effacer'))));
    (Studio.settingsSections || []).forEach(function (sec) {
      var box = el('section', { class: 'card', id: 'settings-' + sec.id, style: 'margin-top:16px' }, el('h2', null, sec.title));
      try { sec.render(box); } catch (e) { box.appendChild(el('p', null, 'Section indisponible.')); }
      settingsBox.appendChild(box);
    });
    c.appendChild(settingsBox);
  }

  /* ---------- onboarding ---------- */
  /* Studio.content.text.onboarding = [{emoji, titre, texte}], boutons : text.onboardingBoutons */
  function onboarding() {
    if (Studio.store.get('onboarded', false)) return;
    var T = (Studio.content && Studio.content.text) || {};
    var steps = Array.isArray(T.onboarding) ? T.onboarding : [];
    var B = Object.assign({ suivant: 'Suivant', precedent: 'Retour', passer: 'Passer', commencer: 'Commencer' }, T.onboardingBoutons || {});
    if (!steps.length) steps = [{ emoji: '🎓', titre: 'Bienvenue sur Studio', texte: 'Dépose tes cours et Studio crée pour toi fiches, flashcards, jeux et cartes mentales. Tes données sont sauvegardées sur la plateforme de ton école.' }];
    var idx = 0, handle = null, finished = false;
    var body = el('div', { class: 'center stack' });
    function done() { if (!finished) { finished = true; Studio.store.set('onboarded', true); } }
    function draw() {
      var s = steps[idx], last = idx === steps.length - 1;
      Studio.ui.clear(body);
      body.appendChild(el('div', { class: 'empty-icon', 'aria-hidden': 'true', style: 'font-size:3rem' }, s.emoji || '🎓'));
      body.appendChild(el('h3', null, s.titre || s.title || ''));
      body.appendChild(el('p', null, s.texte || s.text || ''));
      body.appendChild(el('p', { class: 'small muted' }, (idx + 1) + ' / ' + steps.length));
      var acts = handle && handle.el && handle.el.querySelector('.modal-actions');
      if (!acts) return;
      Studio.ui.clear(acts);
      if (idx > 0) acts.appendChild(el('button', { type: 'button', class: 'btn btn-ghost', onclick: function () { idx--; draw(); } }, B.precedent));
      else acts.appendChild(el('button', { type: 'button', class: 'btn btn-ghost', onclick: function () { handle.close(); } }, B.passer));
      if (last) {
        acts.appendChild(el('button', { type: 'button', class: 'btn', onclick: function () { done(); handle.close(); Studio.go('library'); } }, 'Ajouter mon cours'));
        acts.appendChild(el('button', { type: 'button', class: 'btn btn-primary', onclick: function () { done(); handle.close(); if (loadDemo()) Studio.go('flashcards'); } }, 'Essayer avec le cours d’exemple'));
      } else acts.appendChild(el('button', { type: 'button', class: 'btn btn-primary', onclick: function () { idx++; draw(); } }, B.suivant));
      var pb = acts.querySelector('.btn-primary'); if (pb) pb.focus();
    }
    handle = Studio.ui.modal({ title: 'Studio', body: body, onClose: done, actions: [{ label: B.passer }] });
    draw();
  }

  /* ---------- démarrage ---------- */
  Studio.register({ id: 'library', title: 'Bibliothèque', icon: '📚', order: 1, needsDoc: false, render: renderLibrary });
  Studio.register({ id: 'methods', title: 'Méthodes', icon: '🧠', order: 10, needsDoc: false, render: renderMethods });
  Studio.register({ id: 'settings', title: 'Réglages', icon: '⚙️', order: 11, needsDoc: false, render: renderSettings });

  Studio.app = { settings: settings, saveSettings: saveSettings, applyTheme: applyTheme, loadDemo: loadDemo, addDoc: addDoc, deleteDoc: deleteDoc };
  Studio.addDoc = Studio.app.addDoc;

  function start() {
    applyTheme();
    if (window.matchMedia) { var mq = window.matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', applyTheme); }
    buildSidebar();
    Studio.bus.on('docs:changed', function () { refreshSidebar(); if (Studio.current().moduleId === 'library') Studio.refresh(); });
    Studio.bus.on('doc:active', function () { refreshSidebar(); Studio.refresh(); });
    Studio.bus.on('nav', refreshSidebar);
    Studio.bus.on('stats:changed', refreshSidebar);
    Studio.router.start();
    onboarding();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
