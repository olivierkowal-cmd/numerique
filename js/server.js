/* Studio — pont unique vers le serveur : Studio.server.call(nomFonction, ...args) -> Promise.
   Trois transports, un seul choisi au moment de l'appel (voir server.mode()) :
   - 'fetch'       : SITE WEB ordinaire. POST vers CONFIG_SITE.API_URL (l'adresse /exec d'Apps Script, qui ne sert plus que d'API JSON).
                     Corps JSON {"fn","args":[…],"origin"}, en-tête Content-Type: text/plain;charset=utf-8 (évite le préflight CORS d'Apps Script),
                     redirect:'follow'. Réponse {ok:true,result} ou {ok:false,error:"message français"}.
   - 'demo'        : le simulateur js/server-mock.js (fichier absent du site en ligne ; actif si la page est un fichier local, si config.js
                     contient DEMO:true ou si l'adresse contient ?demo). Il n'existe que dans site-web-demo/.
   - 'apps-script' : ANCIEN mode (google.script.run). Conservé, inactif tant que CONFIG_SITE.API_URL est renseignée.
   Les fonctions du serveur prennent le jeton de session en 1er argument (sauf connecter / inscrire / motDePasseOublie / configPublique).
   Fichier chargé AVANT la connexion : il ne contient aucun module d'étude. Pas de module ES, pas de service worker. */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var Studio = root.Studio = root.Studio || {};

  /* Nettoie un message d'erreur venu du serveur (« Exception: … », « Error: … »). */
  function cleanMessage(e) {
    var msg = (e && e.message) || String(e || '');
    return msg.replace(/^Exception:\s*/, '').replace(/^Error:\s*/, '') || 'Une erreur est survenue.';
  }
  function isExpired(msg) { return String(msg || '').indexOf('SESSION_EXPIREE') >= 0; }
  /* Une erreur « réseau » = le serveur n'a pas répondu (à réessayer), par opposition à un refus clair (« Mot de passe incorrect »). */
  function isNetworkError(e) { return !!(e && e.network); }

  var NETWORK_MSG = 'Pas de connexion. On réessaie.';
  var TIMEOUT_MSG = 'Le serveur met trop de temps à répondre. On réessaie.';
  var BAD_REPLY_MSG = 'Le serveur a répondu quelque chose d’inattendu. Vérifie que l’adresse du serveur (config.js) est la bonne et que l’accès est « Tout le monde ».';
  /* Appels sans effet de bord : on peut les refaire une fois si le réseau a coupé. Les envois (progression, sauvegarde, connexion…) ont
     leur propre file d'attente / leur propre bouton « Réessayer » et ne sont jamais rejoués en double ici. */
  var SAFE = { configPublique: 1, reprendre: 1, etatPlateforme: 1, chargerExercice: 1, chargerDefis: 1, chargerEtude: 1, tableauProf: 1 };

  function siteCfg() { return root.CONFIG_SITE || {}; }
  function apiUrl() { return String(siteCfg().API_URL || '').trim(); }
  function hasAppsScript() { return !!(root.google && root.google.script && root.google.script.run); }
  function demoWanted() { try { return !!root.location && /[?&]demo(=|&|$)/.test(root.location.search || ''); } catch (e) { return false; } }
  /* Le simulateur n'a le droit de tourner que s'il est présent (site-web-demo/ ou studio/ en local) ET demandé explicitement. */
  function mockAllowed() {
    if (!Studio.serverMock) return false;
    var loc = root.location;
    return !!loc && (loc.protocol === 'file:' || siteCfg().DEMO === true || demoWanted());
  }
  function mode() {
    if (mockAllowed() && demoWanted()) return 'demo';
    if (apiUrl()) return 'fetch';
    if (hasAppsScript()) return 'apps-script';
    if (mockAllowed()) return 'demo';
    return 'aucun';
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function netErr(msg) { var e = new Error(msg); e.network = true; return e; }

  /* Un seul aller-retour HTTP vers l'API. Rejette avec .network=true si le serveur n'a pas répondu. */
  function fetchOnce(fn, args) {
    var f = root.fetch;
    if (typeof f !== 'function') return Promise.reject(netErr('Ce navigateur est trop ancien pour cette page.'));
    var ctl = typeof root.AbortController === 'function' ? new root.AbortController() : null;
    var timedOut = false, timer = null;
    var body = JSON.stringify({ fn: fn, args: args, origin: (root.location && root.location.origin) || '' });
    var req = f(apiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body,
      redirect: 'follow',
      credentials: 'omit',
      cache: 'no-store',
      signal: ctl ? ctl.signal : undefined
    }).then(function (res) {
      if (!res.ok) throw netErr(res.status >= 500 || res.status === 429 ? 'Le serveur est occupé. On réessaie.' : NETWORK_MSG);
      return res.text();
    }, function () { throw netErr(timedOut ? TIMEOUT_MSG : NETWORK_MSG); }).then(function (txt) {
      var j;
      try { j = JSON.parse(txt); } catch (e) { throw new Error(BAD_REPLY_MSG); }
      if (!j || typeof j !== 'object' || typeof j.ok !== 'boolean') throw new Error(BAD_REPLY_MSG);
      if (!j.ok) throw new Error(typeof j.error === 'string' && j.error ? j.error : 'Une erreur est survenue.');
      return j.result;
    });
    var limit = new Promise(function (_, reject) {
      timer = setTimeout(function () { timedOut = true; if (ctl) { try { ctl.abort(); } catch (e) { /* ignore */ } } reject(netErr(TIMEOUT_MSG)); }, server.timeoutMs);
    });
    return Promise.race([req, limit]).then(function (v) { clearTimeout(timer); return v; }, function (e) { clearTimeout(timer); throw e; });
  }
  function viaFetch(fn, args) {
    return fetchOnce(fn, args).catch(function (e) {
      if (e && e.network && SAFE[fn]) return sleep(server.retryDelayMs).then(function () { return fetchOnce(fn, args); });
      throw e;
    });
  }

  function viaAppsScript(fn, args) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(netErr(NETWORK_MSG)); }, server.timeoutMs);
      try {
        var runner = root.google.script.run
          .withSuccessHandler(function (v) { clearTimeout(timer); resolve(v); })
          .withFailureHandler(function (e) { clearTimeout(timer); if (!((e && e.message) || '').length) reject(netErr(NETWORK_MSG)); else reject(e); });
        if (typeof runner[fn] !== 'function') { clearTimeout(timer); return reject(new Error('Fonction serveur inconnue : ' + fn)); }
        runner[fn].apply(runner, args);
      } catch (e) { clearTimeout(timer); reject(e); }
    });
  }

  var server = Studio.server = {
    mode: mode,
    timeoutMs: 30000,            /* délai d'attente d'une réponse (modifiable par les tests) */
    retryDelayMs: 1200,          /* pause avant le nouvel essai d'un appel sans effet de bord */
    onExpired: null,             /* callback posé par la connexion (session expirée) */
    cleanMessage: cleanMessage, isExpired: isExpired, isNetworkError: isNetworkError,
    needsApiUrl: function () { return mode() === 'aucun' && !apiUrl(); },
    call: function (fn) {
      var args = Array.prototype.slice.call(arguments, 1);
      var m = mode(), p;
      if (m === 'fetch') p = viaFetch(fn, args);
      else if (m === 'apps-script') p = viaAppsScript(fn, args);
      else if (m === 'demo') p = Studio.serverMock.call(fn, args);
      else p = Promise.reject(new Error('Il manque l’adresse du serveur : voir INSTALLATION (fichier config.js).'));
      return p.then(function (v) { return v; }, function (e) {
        var msg = cleanMessage(e);
        if (isExpired(msg)) { try { if (server.onExpired) server.onExpired(); } catch (x) { /* ignore */ } }
        var err = new Error(isExpired(msg) ? 'Ta connexion a expiré. Reconnecte-toi pour continuer.' : msg);
        err.network = !!(e && e.network); err.expired = isExpired(msg); err.fn = fn;
        throw err;
      });
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = { cleanMessage: cleanMessage, isExpired: isExpired, server: server };
})();
