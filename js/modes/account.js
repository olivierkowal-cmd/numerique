/* Studio — « Mon compte » (mêmes textes et mêmes appels serveur que l'ancien site). Accessible par le menu de l'avatar en haut. */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var Studio = root.Studio = root.Studio || {};
  if (typeof document === 'undefined' || typeof Studio.register !== 'function') return;
  var el = function () { return Studio.ui.el.apply(null, arguments); };

  function render(container) {
    var e = (Studio.platform && Studio.platform.eleve) || {};
    var msg = el('div', { id: 'msg-compte', role: 'status' });
    var ancien = el('input', { class: 'input', type: 'password', id: 'm-ancien', required: true, autocomplete: 'current-password' });
    var nouveau = el('input', { class: 'input', type: 'password', id: 'm-nouveau', required: true, minlength: '6', autocomplete: 'new-password' });
    var btn = el('button', { type: 'submit', class: 'btn btn-primary btn-lg', id: 'b-mdp' }, 'Changer mon mot de passe');
    function show(text, ok) { Studio.ui.clear(msg); if (text) msg.appendChild(el('p', { class: 'acc-msg ' + (ok ? 'acc-ok' : 'acc-err') }, text)); }
    var form = el('form', { class: 'acc-form', onsubmit: function (ev) {
      ev.preventDefault(); btn.disabled = true; btn.textContent = 'Un instant…';
      Studio.server.call('changerMotDePasse', Studio.platform.jeton, ancien.value, nouveau.value).then(function (r) {
        show(r.message, r.ok); if (r.ok) { ancien.value = ''; nouveau.value = ''; }
      }, function (err) { show(err.message, false); }).then(function () { btn.disabled = false; btn.textContent = 'Changer mon mot de passe'; });
    } },
      el('label', { for: 'm-ancien', class: 'acc-label' }, 'Mot de passe actuel'), ancien,
      el('label', { for: 'm-nouveau', class: 'acc-label' }, 'Nouveau mot de passe (6 caractères minimum)'), nouveau, btn);
    container.appendChild(el('div', { class: 'acc-page' }, el('h1', null, 'Mon compte'),
      el('div', { class: 'card' }, el('p', null, el('b', null, (e.prenom || '') + ' ' + (e.nom || '')), ' · classe ' + (e.classe || ''), el('br'), e.email || '')),
      el('div', { class: 'card' }, el('h2', null, 'Changer mon mot de passe'), msg, form)));
  }
  Studio.register({ id: 'account', title: 'Mon compte', icon: '👤', order: 90, needsDoc: false, render: render });
})();
