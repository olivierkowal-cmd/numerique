/* Studio — démarrage de la plateforme : connexion par mail (reprise de l'ancien site), session par jeton, puis chargement de Studio.
   Ce fichier est chargé AVANT la connexion. Aucun module d'étude n'est chargé ni affiché tant que l'élève n'est pas connecté :
   les fichiers de Studio (CSS + JS) sont injectés ici, après la connexion, dans l'ordre (dev : balises src ; Apps Script : texte intégré window.__SB).
   Tous les textes et tous les appels serveur de la connexion sont ceux de l'ancien site (connecter, inscrire, motDePasseOublie, reprendre, deconnecter).
   Site web ordinaire : les réglages viennent de config.js (window.CONFIG_SITE) puis de l'appel serveur configPublique ; les fichiers de Studio sont de vrais
   fichiers (css/, js/, content/) chargés avec un paramètre ?v=<empreinte> pour le cache ; déconnexion automatique après inactivité. */
(function () {
  'use strict';
  var root = window;
  var Studio = root.Studio = root.Studio || {};

  var MANIFEST = {
    css: ['css/style.css', 'css/office.css', 'css/crew.css', 'css/game.css', 'css/a11y.css', 'css/today.css', 'css/templates.css', 'css/ocr.css', 'css/trust.css', 'css/chapters.css'],
    stage1: ['content/methods.js', 'content/ui-text.js', 'content/demo-course.js', 'content/parents.js', 'content/subjects.js', 'js/core.js', 'js/sync.js'],
    stage2: ['js/files.js', 'js/gen.js', 'js/modes/flashcards.js', 'js/modes/memory.js', 'js/modes/mnemo.js', 'js/modes/mindmap.js', 'js/modes/dashboard.js', 'js/modes/chat.js',
      'js/office-sprites.js', 'js/office-skins.js', 'js/modes/office.js', 'js/modes/crew.js', 'js/game.js', 'js/a11y.js', 'js/ocr.js', 'js/trust.js',
      'js/modes/today.js', 'js/modes/templates.js', 'js/modes/chapters.js', 'js/modes/prof.js', 'js/modes/account.js'],
    stage3: ['js/app.js']
  };
  Studio.manifest = MANIFEST;

  /* ---------- outils ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function stocker(cle, val) { try { if (val == null) localStorage.removeItem(cle); else localStorage.setItem(cle, val); } catch (e) { /* stockage indisponible */ } }
  function lire(cle) { try { return localStorage.getItem(cle); } catch (e) { return null; } }
  function message(zone, texte, type) { $(zone).innerHTML = texte ? '<div class="message ' + (type || 'erreur') + '" role="alert">' + esc(texte) + '</div>' : ''; }
  function occupe(bouton, oui, texte) {
    var b = $(bouton);
    if (oui) { b.dataset.t = b.textContent; b.textContent = texte || 'Un instant…'; b.disabled = true; }
    else { b.textContent = b.dataset.t || b.textContent; b.disabled = false; }
  }
  function call() { return Studio.server.call.apply(Studio.server, arguments); }
  function config() { return root.CONFIG || {}; }
  function site() { return root.CONFIG_SITE || {}; }
  function images() { return root.IMAGES || {}; }
  /* Paramètre de version des fichiers (cache) : posé par le build dans <meta name="studio-version">. */
  var VQ = '';
  try { var mv = document.querySelector('meta[name="studio-version"]'); if (mv && mv.content) VQ = '?v=' + encodeURIComponent(mv.content); } catch (e) { VQ = ''; }
  var configPrete = Promise.resolve();
  function appliquerConfig() {
    var t = $('titre-connexion'); if (t) t.textContent = config().nomSite || 'Formation numérique';
    var dom = config().domaine || 'ismreves.net';
    Array.prototype.forEach.call(document.querySelectorAll('input[type=email]'), function (i) { i.placeholder = 'prenom.nom@' + dom; });
    try { document.title = config().nomSite || document.title; } catch (e) { /* ignore */ }
  }
  function chargerConfig() {
    configPrete = call('configPublique').then(function (c) {
      if (c && typeof c === 'object') { root.CONFIG = Object.assign({}, root.CONFIG, c); appliquerConfig(); }
    }, function () { /* serveur lent ou absent : on garde les réglages de config.js */ });
    return configPrete;
  }

  /* ---------- données locales de l'appareil + inactivité ---------- */
  function cleUtilisateur(email) { return String(email == null ? '' : email).trim().toLowerCase().replace(/[^a-z0-9@._-]/g, '_').slice(0, 120); }
  /* Vrai si l'élève a du travail pas encore envoyé au serveur (sauvegarde en attente ou progression en file d'attente). */
  function nonEnvoye(email) {
    var k = cleUtilisateur(email); if (!k) return false;
    try {
      var m = JSON.parse(lire('studio-sync|' + k) || '{}'); if (m && m.dirty) return true;
      var q = JSON.parse(lire('fn_pending|' + k) || '[]'); if (q && q.length) return true;
    } catch (e) { /* illisible : on suppose rien */ }
    return false;
  }
  /* Efface de CET appareil les données de l'élève (tout est aussi sur le serveur). Ne touche pas aux autres élèves. */
  function effacerDonneesLocales(email) {
    var k = cleUtilisateur(email);
    var prefixes = k ? ['studio-' + k + '|', 'studiob-' + k + '|', 'studio-sync|' + k, 'fn_pending|' + k, 'fn_ex|' + k + '|'] : [];
    try {
      var del = [];
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && prefixes.some(function (p) { return key.indexOf(p) === 0; })) del.push(key);
      }
      del.forEach(function (key) { localStorage.removeItem(key); });
    } catch (e) { /* stockage indisponible */ }
    ['fn_jeton', 'fn_email', 'fn_activite'].forEach(function (key) { stocker(key, null); });
    try { if (k && root.indexedDB) root.indexedDB.deleteDatabase('studio-blobs-' + k); } catch (e) { /* ignore */ }
  }
  function prefEffacer() {
    var v = lire('fn_effacer');
    if (v === '1') return true; if (v === '0') return false;
    return site().EFFACER_PAR_DEFAUT !== false;       /* par défaut : case cochée (ordinateur partagé) */
  }
  function limiteInactiviteMs() {
    var m = site().INACTIVITE_MIN; m = m === undefined || m === null || m === '' ? 30 : Number(m);
    return isFinite(m) && m > 0 ? Math.round(m * 60000) : 0;      /* 0 = désactivée */
  }
  /* Surveillance d'inactivité : logique pure (testable). now() donne l'heure en ms. */
  function creerSurveillance(o) {
    var last = o.now();
    return {
      touch: function () { last = o.now(); },
      last: function () { return last; },
      idle: function () { return !!o.limitMs && o.now() - last >= o.limitMs; },
      check: function () { if (o.limitMs && o.now() - last >= o.limitMs) { o.onIdle(); return true; } return false; }
    };
  }

  var session = null;   /* { jeton, email } */

  /* ---------- plateforme : données du serveur utiles à Studio ---------- */
  function makePlatform(jeton, eleve) {
    var plat = {
      jeton: jeton, eleve: eleve, chapitres: [], progression: {}, defis: null, loaded: false,
      isProf: function () { return !!(plat.eleve && plat.eleve.estProf); },
      apply: function (etat) {
        if (!etat) return;
        if (etat.eleve) plat.eleve = Object.assign({}, plat.eleve, etat.eleve);
        /* Pour le prof, le serveur met ouvert=true partout et donne l'état réel pour les élèves dans « ouvertEleves » (liste de chapitres au niveau du résultat).
           On accepte aussi un champ ouvertEleves directement dans chaque chapitre. */
        var list = (etat.chapitres || []).map(function (c) { return Object.assign({}, c); });
        if (Array.isArray(etat.ouvertEleves)) etat.ouvertEleves.forEach(function (r) { list.forEach(function (c) { if (r && c.id === r.id) c.ouvertEleves = !!r.ouvert; }); });
        plat.chapitres = list; plat.progression = etat.progression || {}; plat.defis = etat.defis || null; plat.loaded = true;
      },
      refresh: function () { return call('etatPlateforme', plat.jeton).then(function (etat) { plat.apply(etat); return plat; }); }
    };
    return plat;
  }

  /* ---------- connexion ---------- */
  function montrerOnglet(quoi) {
    ['connexion', 'inscription', 'oubli'].forEach(function (n) { $('form-' + n).classList.toggle('cache', n !== quoi); });
    $('onglet-connexion').classList.toggle('actif', quoi !== 'inscription');
    $('onglet-inscription').classList.toggle('actif', quoi === 'inscription');
    message('msg-connexion', '');
    var em = $('c-email').value || $('i-email').value || $('o-email').value;
    if (em) ['c-email', 'i-email', 'o-email'].forEach(function (i) { if (!$(i).value) $(i).value = em; });
  }
  function seConnecter(e) {
    e.preventDefault();
    occupe('b-connexion', true, 'Connexion…');
    call('connecter', $('c-email').value, $('c-mdp').value).then(function (r) {
      if (!r.ok) { message('msg-connexion', r.message); return; }
      var eleve = Object.assign({}, r.eleve); if (r.estProf !== undefined) eleve.estProf = !!r.estProf;
      stocker('fn_jeton', r.jeton); stocker('fn_email', eleve.email); stocker('fn_activite', String(Date.now()));
      $('c-mdp').value = '';
      ouvrirApp(r.jeton, eleve);
    }, function (err) { message('msg-connexion', err.message); }).then(function () { occupe('b-connexion', false); });
    return false;
  }
  function sInscrire(e) {
    e.preventDefault();
    occupe('b-inscription', true, 'Envoi du mail…');
    call('inscrire', $('i-email').value, $('i-prenom').value, $('i-nom').value, $('i-classe').value).then(function (r) {
      if (!r.ok) { message('msg-connexion', r.message); return; }
      var em = $('i-email').value;
      montrerOnglet('connexion'); $('c-email').value = em;
      message('msg-connexion', r.message, 'ok'); $('c-mdp').focus();
    }, function (err) { message('msg-connexion', err.message); }).then(function () { occupe('b-inscription', false); });
    return false;
  }
  function oubli(e) {
    e.preventDefault();
    occupe('b-oubli', true, 'Envoi du mail…');
    call('motDePasseOublie', $('o-email').value).then(function (r) {
      if (!r.ok) { message('msg-connexion', r.message); return; }
      var em = $('o-email').value;
      montrerOnglet('connexion'); $('c-email').value = em;
      message('msg-connexion', r.message, 'ok');
    }, function (err) { message('msg-connexion', err.message); }).then(function () { occupe('b-oubli', false); });
    return false;
  }

  /* ---------- barre du haut : nom, avatar, menu ---------- */
  function afficherTopbar(eleve) {
    var prenom = eleve.prenom || '?';
    $('avatar').textContent = prenom.charAt(0).toUpperCase();
    $('nom-utilisateur').textContent = prenom;
    $('info-utilisateur').innerHTML = '<b>' + esc(prenom) + ' ' + esc(eleve.nom) + '</b><br>' + esc(eleve.email) + '<br>Classe : ' + esc(eleve.classe) + (eleve.estProf ? '<br>🧑‍🏫 Professeur' : '');
    $('nom-site').textContent = config().nomSite || 'Formation numérique';
    var logo = images().logo; if (logo) $('logo-entete').src = logo; else $('logo-entete').style.display = 'none';
  }
  function basculerMenuUtilisateur(e) {
    e.stopPropagation();
    var m = $('menu-utilisateur'), ouvert = m.classList.toggle('cache') === false;
    $('btn-utilisateur').setAttribute('aria-expanded', ouvert ? 'true' : 'false');
  }
  function fermerMenu() { var m = $('menu-utilisateur'); if (m) { m.classList.add('cache'); $('btn-utilisateur').setAttribute('aria-expanded', 'false'); } }

  /* Fin de session : envoi de la dernière sauvegarde, effacement facultatif des données de l'appareil, déconnexion côté serveur, retour à l'écran de connexion. */
  var fermeture = false;
  function terminerSession(o) {
    if (fermeture) return; fermeture = true;
    o = o || {};
    var j = session && session.jeton, email = session && session.email;
    var flush = (Studio.sync && Studio.sync.flush) ? Studio.sync.flush() : Promise.resolve();
    var lent = new Promise(function (r) { setTimeout(r, 4000); });
    Promise.race([flush, lent]).catch(function () { /* la copie locale reste */ }).then(function () {
      var msg = o.message || '';
      if (o.effacer) {
        if (nonEnvoye(email)) msg = (msg ? msg + ' ' : '') + 'Une partie de ton travail n’a pas pu être envoyée : elle est restée sur cet ordinateur et sera envoyée à ta prochaine connexion.';
        else effacerDonneesLocales(email);
      }
      stocker('fn_jeton', null); stocker('fn_activite', null);
      if (msg) stocker('fn_msg', msg);
      var fin = function () { root.location.reload(); };
      if (j) call('deconnecter', j).then(fin, fin); else fin();
    });
  }
  function seDeconnecter() {
    fermerMenu();
    var d = $('dlg-deconnexion'), c = $('dlg-effacer'), al = $('dlg-deco-alerte');
    c.checked = prefEffacer();
    var email = session && session.email, enAttente = nonEnvoye(email) || !!(Studio.sync && Studio.sync.meta && Studio.sync.meta().dirty);
    al.classList.toggle('cache', !enAttente);
    al.textContent = enAttente ? 'Ton dernier travail n’est pas encore envoyé : on essaie avant de te déconnecter. S’il ne part pas, tes données restent sur cet ordinateur.' : '';
    d.classList.remove('cache'); $('dlg-ok').focus();
  }
  function fermerDlg() { $('dlg-deconnexion').classList.add('cache'); var b = $('btn-deconnexion'); if (b) b.focus(); }
  function confirmerDeconnexion() {
    var effacer = $('dlg-effacer').checked;
    stocker('fn_effacer', effacer ? '1' : '0');
    $('dlg-deconnexion').classList.add('cache');
    terminerSession({ effacer: effacer });
  }

  /* Déconnexion automatique après inactivité (ordinateur laissé ouvert à l'école). */
  var veille = null, derniereEcriture = 0;
  function activite() {
    if (!veille) return;
    veille.touch();
    var t = Date.now();
    if (t - derniereEcriture > 10000) { derniereEcriture = t; stocker('fn_activite', String(t)); }
  }
  function armerInactivite() {
    var limite = limiteInactiviteMs(); if (!limite || veille) return;
    veille = creerSurveillance({ now: function () { return Date.now(); }, limitMs: limite, onIdle: function () {
      terminerSession({ effacer: prefEffacer(), message: 'Tu as été déconnecté(e) après ' + Math.round(limite / 60000) + ' minutes sans activité, pour protéger tes données.' });
    } });
    activite();
    ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'].forEach(function (ev) { document.addEventListener(ev, activite, { capture: true, passive: true }); });
    setInterval(function () { if (session) veille.check(); }, 20000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && session) veille.check(); });
    root.addEventListener('focus', function () { if (session) veille.check(); });
  }
  function sessionExpiree() {
    if (!session) return;
    stocker('fn_jeton', null);
    stocker('fn_msg', 'Ta connexion a expiré. Reconnecte-toi pour continuer (ton travail sauvegardé est conservé).');
    session = null;
    root.location.reload();
  }

  /* ---------- chargement de Studio (après connexion) ---------- */
  function bundle() { return root.__SB || null; }
  function addCss(name) {
    return new Promise(function (resolve) {
      var b = bundle();
      if (b && b[name] != null) { var st = document.createElement('style'); st.setAttribute('data-src', name); st.textContent = b[name]; document.head.appendChild(st); return resolve(); }
      var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = name + VQ; l.onload = resolve; l.onerror = resolve; document.head.appendChild(l);
    });
  }
  function addScript(name) {
    return new Promise(function (resolve, reject) {
      var b = bundle(), s = document.createElement('script');
      if (b && b[name] != null) { s.text = b[name] + '\n//# sourceURL=' + name; document.head.appendChild(s); return resolve(); }
      s.src = name + VQ; s.async = false; s.onload = resolve; s.onerror = function () { reject(new Error('Fichier introuvable : ' + name)); };
      document.head.appendChild(s);
    });
  }
  function seq(list, fn) { return list.reduce(function (p, n) { return p.then(function () { return fn(n); }); }, Promise.resolve()); }

  function ouvrirApp(jeton, eleve) {
    session = { jeton: jeton, email: eleve.email };
    $('ecran-connexion').classList.add('cache');
    var ch = $('ecran-chargement'); ch.classList.remove('cache'); $('chargement-txt').textContent = 'Chargement de ton espace…'; $('chargement-actions').classList.add('cache');
    var plat = Studio.platform = makePlatform(jeton, eleve);
    afficherTopbar(eleve);
    armerInactivite();
    var serverUnknown = false, etudeTexte = '';
    Promise.all([
      configPrete.then(function () { afficherTopbar(eleve); }),
      call('etatPlateforme', jeton).then(function (etat) { plat.apply(etat); }),
      call('chargerEtude', jeton).then(function (r) { etudeTexte = (r && r.json) || ''; }, function (err) { if (err.expired) throw err; serverUnknown = true; })
    ]).then(function () {
      root.__STUDIO_USER__ = eleve.email;
      document.body.setAttribute('data-prof', eleve.estProf ? '1' : '0');
      return seq(MANIFEST.css, addCss);
    }).then(function () { return seq(MANIFEST.stage1, addScript); }).then(function () {
      Studio.sync.init({ jeton: jeton, email: eleve.email }, etudeTexte, { serverUnknown: serverUnknown });   /* avant le jeu : il lit ses données au chargement */
      return seq(MANIFEST.stage2, addScript);
    }).then(function () {
      Studio.sync.start();
      $('ecran-chargement').classList.add('cache');
      $('studio-shell').classList.remove('cache');
      return seq(MANIFEST.stage3, addScript);
    }).then(function () {
      Studio.chapters.loadPending(); Studio.chapters.flushPending();
      setInterval(function () { Studio.chapters.flushPending(); }, 45000);
      if (serverUnknown && Studio.ui) Studio.ui.toast('Pas de connexion pour récupérer ta sauvegarde. Tes données de cet appareil sont là, on réessaiera.', 'info');
    }).catch(function (err) {
      if (err && err.expired) return;
      $('ecran-chargement').classList.remove('cache'); $('studio-shell').classList.add('cache');
      $('chargement-txt').textContent = 'Impossible de charger ton espace. ' + ((err && err.message) || '');
      $('chargement-actions').classList.remove('cache');
    });
  }

  /* ---------- démarrage ---------- */
  function demarrer() {
    Studio.server.onExpired = sessionExpiree;
    /* Réglages locaux (config.js) d'abord ; configPublique les complète dès que le serveur répond. */
    root.CONFIG = Object.assign({ nomSite: site().NOM_SITE || 'Formation numérique', domaine: site().DOMAINE || 'ismreves.net' }, root.CONFIG);
    $('logo-connexion').src = images().logo || '';
    if (!images().logo) $('logo-connexion').style.display = 'none';
    appliquerConfig();
    if (Studio.server.mode() === 'aucun') {            /* adresse du serveur manquante : message clair pour le prof, jamais une page blanche */
      $('ecran-connexion').classList.add('cache'); $('ecran-chargement').classList.add('cache'); $('ecran-config').classList.remove('cache');
      return;
    }
    if (Studio.server.mode() === 'demo') {
      var bd = $('bandeau-demo'); bd.textContent = (Studio.serverMock && Studio.serverMock.banner) || 'MODE DÉMO : faux serveur.'; bd.classList.remove('cache');
    }
    chargerConfig();
    var email = lire('fn_email'); if (email) $('c-email').value = email;
    $('form-connexion').addEventListener('submit', seConnecter);
    $('form-inscription').addEventListener('submit', sInscrire);
    $('form-oubli').addEventListener('submit', oubli);
    $('onglet-connexion').addEventListener('click', function () { montrerOnglet('connexion'); });
    $('onglet-inscription').addEventListener('click', function () { montrerOnglet('inscription'); });
    $('lien-oubli').addEventListener('click', function () { montrerOnglet('oubli'); });
    $('lien-retour').addEventListener('click', function () { montrerOnglet('connexion'); });
    $('btn-utilisateur').addEventListener('click', basculerMenuUtilisateur);
    $('menu-compte').addEventListener('click', function () { fermerMenu(); Studio.go('account'); });
    $('menu-deconnexion').addEventListener('click', seDeconnecter);
    $('btn-deconnexion').addEventListener('click', seDeconnecter);
    $('dlg-ok').addEventListener('click', confirmerDeconnexion);
    $('dlg-annuler').addEventListener('click', fermerDlg);
    $('dlg-deconnexion').addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { fermerDlg(); return; }
      if (e.key === 'Tab') {   /* le focus reste dans la fenêtre */
        var f = [$('dlg-effacer'), $('dlg-ok'), $('dlg-annuler')], i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[2].focus(); } else if (!e.shiftKey && i === 2) { e.preventDefault(); f[0].focus(); }
      }
    });
    $('btn-recharger').addEventListener('click', function () { root.location.reload(); });
    document.addEventListener('click', fermerMenu);
    $('logo-entete').addEventListener('click', function () { if (Studio.go) Studio.go('today'); });
    $('nom-site').addEventListener('click', function () { if (Studio.go) Studio.go('today'); });
    /* Les liens internes « #/… » passent par Studio.go : fiable même si le navigateur ne signale pas le changement de #. */
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href^="#/"]') : null;
      if (!a || !Studio.go || !Studio.router) return;
      e.preventDefault();
      var p = Studio.router.parseHash(a.getAttribute('href'));
      Studio.go(p.id || 'today', p.params);
    });

    var msg = lire('fn_msg'); if (msg) { stocker('fn_msg', null); message('msg-connexion', msg); }
    var j = lire('fn_jeton');
    /* Ordinateur laissé ouvert depuis plus que la limite d'inactivité : on ne reprend PAS la session de la personne précédente. */
    var limite = limiteInactiviteMs(), derniere = Number(lire('fn_activite')) || 0;
    if (j && limite && derniere && Date.now() - derniere > limite) {
      var em = lire('fn_email');
      if (prefEffacer() && em && !nonEnvoye(em)) effacerDonneesLocales(em);
      stocker('fn_jeton', null); stocker('fn_activite', null);
      Studio.server.call('deconnecter', j).then(function () {}, function () {});
      j = null;
      message('msg-connexion', 'Tu as été déconnecté(e) après un long moment sans activité, pour protéger tes données. Reconnecte-toi.');
    }
    if (j) {
      $('ecran-chargement').classList.remove('cache'); $('chargement-txt').textContent = 'Reprise de ta connexion…';
      call('reprendre', j).then(function (r) {
        if (r && r.ok) {
          stocker('fn_activite', String(Date.now()));
          var eleve = Object.assign({}, r.eleve); if (r.estProf !== undefined) eleve.estProf = !!r.estProf;
          ouvrirApp(j, eleve); return;
        }
        stocker('fn_jeton', null); $('ecran-chargement').classList.add('cache'); $('ecran-connexion').classList.remove('cache');
      }, function (err) {
        /* serveur injoignable : on garde le jeton et on propose de réessayer (pas de déconnexion par erreur) */
        $('chargement-txt').textContent = 'Impossible de joindre le serveur pour l’instant. ' + err.message;
        $('chargement-actions').classList.remove('cache');
      });
    } else $('ecran-connexion').classList.remove('cache');
  }
  Studio.boot = { start: demarrer, manifest: MANIFEST, esc: esc, touch: activite, creerSurveillance: creerSurveillance, effacerDonneesLocales: effacerDonneesLocales, nonEnvoye: nonEnvoye,
    limiteInactiviteMs: limiteInactiviteMs, terminerSession: terminerSession };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
