/* Studio — mode Mind map (dev-modes2). SVG sans librairie. IIFE, pas de module ES. */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  root.Studio = root.Studio || {};
  var S = root.Studio;

  var COLORS = ['#6c5ce7', '#e17055', '#00b894', '#f9a825', '#0984e3', '#e84393', '#2d3436', '#00cec9'];

  // ---------- logique pure ----------
  function wrapLabel(label, max) {
    max = max || 22;
    var words = String(label || '').split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) {
      if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
    });
    if (cur) lines.push(cur);
    if (lines.length > 3) { lines = lines.slice(0, 3); lines[2] = lines[2].replace(/.{0,2}$/, '') + '…'; }
    return lines.length ? lines : [''];
  }
  function nodeSize(label, depth) {
    var lines = wrapLabel(label), lw = 0;
    lines.forEach(function (l) { lw = Math.max(lw, l.length); });
    var fs = depth === 0 ? 17 : depth === 1 ? 14 : 12;
    return { lines: lines, fs: fs, w: Math.max(60, lw * fs * 0.6 + 20), h: lines.length * (fs + 3) + 14 };
  }
  function countLeaves(n) {
    var c = n.children || [];
    if (!c.length) return (n._leaves = 1);
    return (n._leaves = c.reduce(function (a, k) { return a + countLeaves(k); }, 0));
  }
  function build(root0, mode) {
    // retourne {nodes, edges, bounds}; ne modifie pas l'arbre d'origine (copie)
    var tree = JSON.parse(JSON.stringify(root0 || { label: '' }));
    countLeaves(tree);
    var nodes = [], edges = [];
    function add(n, depth, branch, parent) {
      var sz = nodeSize(n.label, depth);
      var node = { label: n.label, depth: depth, branch: branch, x: 0, y: 0, w: sz.w, h: sz.h, lines: sz.lines, fs: sz.fs, parent: parent };
      nodes.push(node);
      if (parent) edges.push({ from: parent, to: node, branch: branch });
      (n.children || []).forEach(function (c, i) { add(c, depth + 1, depth === 0 ? i : branch, node); });
      n._node = node; return node;
    }
    add(tree, 0, -1, null);
    var maxDepth = 0; nodes.forEach(function (n) { if (n.depth > maxDepth) maxDepth = n.depth; });
    if (mode === 'tree') {
      var colW = 0; nodes.forEach(function (n) { colW = Math.max(colW, n.w); });
      colW += 70; var row = 0, rowH = 0; nodes.forEach(function (n) { rowH = Math.max(rowH, n.h); }); rowH += 14;
      (function place(n, depth) {
        var c = n.children || [];
        if (!c.length) { n._node.y = row * rowH; row++; }
        else { c.forEach(function (k) { place(k, depth + 1); }); n._node.y = (c[0]._node.y + c[c.length - 1]._node.y) / 2; }
        n._node.x = depth * colW;
      })(tree, 0);
    } else {
      var ring = 0; nodes.forEach(function (n) { ring = Math.max(ring, n.w); });
      ring = Math.max(ring * 0.9, 150);
      (function place(n, a0, a1, depth) {
        var mid = (a0 + a1) / 2;
        if (depth > 0) { n._node.x = Math.cos(mid) * ring * depth; n._node.y = Math.sin(mid) * ring * depth; }
        var c = n.children || [], a = a0, tot = n._leaves;
        c.forEach(function (k) { var span = (a1 - a0) * k._leaves / tot; place(k, a, a + span, depth + 1); a += span; });
      })(tree, -Math.PI / 2, Math.PI * 1.5, 0);
    }
    var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    nodes.forEach(function (n) {
      b.x0 = Math.min(b.x0, n.x - n.w / 2); b.x1 = Math.max(b.x1, n.x + n.w / 2);
      b.y0 = Math.min(b.y0, n.y - n.h / 2); b.y1 = Math.max(b.y1, n.y + n.h / 2);
    });
    return { nodes: nodes, edges: edges, bounds: b, maxDepth: maxDepth };
  }
  function countNodes(n) { return 1 + (n.children || []).reduce(function (a, k) { return a + countNodes(k); }, 0); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function color(branch) { return branch < 0 ? '#4a3fb5' : COLORS[branch % COLORS.length]; }

  // sérialisation SVG autonome (pour export)
  function toSvgString(layout, pad) {
    pad = pad == null ? 30 : pad;
    var b = layout.bounds, W = Math.ceil(b.x1 - b.x0 + pad * 2), H = Math.ceil(b.y1 - b.y0 + pad * 2);
    var ox = pad - b.x0, oy = pad - b.y0, o = [];
    o.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family="Arial, Helvetica, sans-serif">');
    o.push('<rect width="100%" height="100%" fill="#ffffff"/>');
    layout.edges.forEach(function (e) {
      var x1 = e.from.x + ox, y1 = e.from.y + oy, x2 = e.to.x + ox, y2 = e.to.y + oy, mx = (x1 + x2) / 2;
      o.push('<path d="M' + x1 + ' ' + y1 + ' C' + mx + ' ' + y1 + ' ' + mx + ' ' + y2 + ' ' + x2 + ' ' + y2 + '" fill="none" stroke="' + color(e.branch) + '" stroke-width="' + Math.max(1.5, 4 - e.to.depth) + '" opacity="0.7"/>');
    });
    layout.nodes.forEach(function (n) {
      var c = color(n.branch), fill = n.depth <= 1 ? c : '#ffffff', tx = n.depth <= 1 ? '#ffffff' : '#222222';
      o.push('<rect x="' + (n.x + ox - n.w / 2) + '" y="' + (n.y + oy - n.h / 2) + '" width="' + n.w + '" height="' + n.h + '" rx="' + Math.min(14, n.h / 2) + '" fill="' + fill + '" stroke="' + c + '" stroke-width="2"/>');
      n.lines.forEach(function (l, i) {
        var y = n.y + oy - n.h / 2 + 7 + (i + 1) * (n.fs + 3) - 3;
        o.push('<text x="' + (n.x + ox) + '" y="' + y + '" text-anchor="middle" font-size="' + n.fs + '" font-weight="' + (n.depth <= 1 ? 700 : 400) + '" fill="' + tx + '">' + esc(l) + '</text>');
      });
    });
    o.push('</svg>');
    return { svg: o.join(''), width: W, height: H };
  }
  function zoomAt(view, factor, cx, cy) {
    var k = Math.min(4, Math.max(0.2, view.k * factor)), f = k / view.k;
    return { k: k, x: cx - (cx - view.x) * f, y: cy - (cy - view.y) * f };
  }
  S.mindmapLogic = { wrapLabel: wrapLabel, build: build, countNodes: countNodes, toSvgString: toSvgString, zoomAt: zoomAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = S.mindmapLogic;
  if (typeof document === 'undefined' || !S.register) return;

  // ---------- DOM ----------
  var NS = 'http://www.w3.org/2000/svg';
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
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c == null || c === false) continue; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); }
    return e;
  }
  function empty(c, o) {
    if (S.ui && S.ui.empty) return S.ui.empty(c, o);
    c.innerHTML = ''; c.appendChild(h('div', { class: 'empty' }, h('h3', {}, o.title), h('p', {}, o.text || '')));
  }
  function toast(m, t) { if (S.ui && S.ui.toast) S.ui.toast(m, t); }
  function download(name, blob) {
    var url = URL.createObjectURL(blob), a = h('a', { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function slug(s) { return String(s || 'carte').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'carte'; }

  function render(container, ctx) {
    container.innerHTML = '';
    var doc = S.store.byId('docs', ctx.docId);
    if (!doc) return empty(container, { icon: '🗺️', title: 'Choisis un document', text: 'La carte mentale est générée à partir des titres et idées de ton cours.', cta: { label: 'Aller à la bibliothèque', onClick: function () { ctx.go('home'); } } });
    var maps = S.store.list('mindmaps').filter(function (m) { return m.docId === doc.id; });
    var st = { map: maps[maps.length - 1] || null, mode: 'radial', busy: false, view: { k: 1, x: 0, y: 0 }, layout: null };
    var wrap = h('div', { class: 'mindmap-mode' });
    container.appendChild(wrap);

    function generate() {
      st.busy = true; draw();
      Promise.resolve(S.gen.mindmap(doc)).then(function (m) { st.map = m; toast('Carte générée', 'success'); }, function (e) { toast((e && e.message) || 'Échec de la génération', 'error'); })
        .then(function () { st.busy = false; draw(); });
    }

    function draw() {
      wrap.innerHTML = '';
      wrap.appendChild(h('h1', {}, 'Carte mentale'));
      var bar = h('div', { role: 'toolbar', 'aria-label': 'Outils de la carte', style: 'display:flex;gap:.5rem;flex-wrap:wrap;margin:1rem 0' });
      function b(label, fn, cls, extra) { var e = h('button', { class: 'btn ' + (cls || 'btn-ghost'), type: 'button', onclick: fn }); e.textContent = label; if (extra) Object.keys(extra).forEach(function (k) { e.setAttribute(k, extra[k]); }); return e; }
      var g = b(st.busy ? 'Génération…' : (st.map ? 'Régénérer' : 'Générer la carte'), generate, 'btn-primary'); g.disabled = st.busy; bar.appendChild(g);
      wrap.appendChild(bar);
      if (!st.map || !st.map.root) {
        var e = h('div'); wrap.appendChild(e);
        return st.busy ? (S.ui && S.ui.loading ? S.ui.loading(e, 'Construction de la carte…') : (e.textContent = 'Construction de la carte…')) : empty(e, { icon: '🗺️', title: 'Pas encore de carte', text: 'Génère une carte pour voir la structure de ton cours d’un coup d’œil.' });
      }
      if (!(st.map.root.children || []).length) {
        wrap.appendChild(h('p', { role: 'status' }, 'La carte ne contient qu’un nœud : le cours n’a pas de structure détectable. Essaie avec une clé IA ou un cours avec des titres.'));
      }
      st.layout = build(st.map.root, st.mode);
      bar.appendChild(b(st.mode === 'radial' ? 'Mise en page : radiale' : 'Mise en page : arbre', function () { st.mode = st.mode === 'radial' ? 'tree' : 'radial'; st.view = null; draw(); }));
      bar.appendChild(b('Zoom +', function () { zoom(1.25); }, null, { 'aria-label': 'Zoom avant' }));
      bar.appendChild(b('Zoom −', function () { zoom(0.8); }, null, { 'aria-label': 'Zoom arrière' }));
      bar.appendChild(b('Recentrer', function () { fit(); apply(); }));
      bar.appendChild(b('Export SVG', function () { download(slug(st.map.title || doc.name) + '.svg', new Blob([toSvgString(st.layout).svg], { type: 'image/svg+xml' })); }));
      bar.appendChild(b('Export PNG', exportPng));
      wrap.appendChild(h('p', { style: 'font-size:.85em;opacity:.8' }, countNodes(st.map.root) + ' nœuds · glisse pour déplacer, molette ou boutons pour zoomer, flèches et +/− au clavier.'));

      var box = h('div', { class: 'card', style: 'padding:0;overflow:hidden;touch-action:none' });
      var svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('role', 'img'); svg.setAttribute('tabindex', '0');
      svg.setAttribute('aria-label', 'Carte mentale : ' + (st.map.root.label || doc.name) + '. ' + (st.map.root.children || []).map(function (c) { return c.label; }).join(', '));
      svg.style.cssText = 'width:100%;height:65vh;min-height:320px;display:block;cursor:grab;background:var(--surface,transparent)';
      var gEl = document.createElementNS(NS, 'g'); svg.appendChild(gEl);
      st.layout.edges.forEach(function (ed) {
        var p = document.createElementNS(NS, 'path'), mx = (ed.from.x + ed.to.x) / 2;
        p.setAttribute('d', 'M' + ed.from.x + ' ' + ed.from.y + ' C' + mx + ' ' + ed.from.y + ' ' + mx + ' ' + ed.to.y + ' ' + ed.to.x + ' ' + ed.to.y);
        p.setAttribute('fill', 'none'); p.setAttribute('stroke', color(ed.branch)); p.setAttribute('stroke-width', Math.max(1.5, 4 - ed.to.depth)); p.setAttribute('opacity', '.7');
        gEl.appendChild(p);
      });
      st.layout.nodes.forEach(function (n) {
        var c = color(n.branch), gg = document.createElementNS(NS, 'g'), r = document.createElementNS(NS, 'rect');
        r.setAttribute('x', n.x - n.w / 2); r.setAttribute('y', n.y - n.h / 2); r.setAttribute('width', n.w); r.setAttribute('height', n.h);
        r.setAttribute('rx', Math.min(14, n.h / 2)); r.setAttribute('fill', n.depth <= 1 ? c : '#ffffff'); r.setAttribute('stroke', c); r.setAttribute('stroke-width', 2);
        gg.appendChild(r);
        n.lines.forEach(function (l, i) {
          var t = document.createElementNS(NS, 'text');
          t.setAttribute('x', n.x); t.setAttribute('y', n.y - n.h / 2 + 4 + (i + 1) * (n.fs + 3)); t.setAttribute('text-anchor', 'middle');
          t.setAttribute('font-size', n.fs); t.setAttribute('font-weight', n.depth <= 1 ? 700 : 400); t.setAttribute('fill', n.depth <= 1 ? '#ffffff' : '#222222');
          t.textContent = l; gg.appendChild(t);
        });
        var ti = document.createElementNS(NS, 'title'); ti.textContent = n.label; gg.appendChild(ti);
        gEl.appendChild(gg);
      });
      box.appendChild(svg); wrap.appendChild(box);

      // liste textuelle accessible
      var det = h('details', { style: 'margin-top:1rem' }, h('summary', {}, 'Version texte de la carte'));
      (function list(n, parent) { var ul = h('ul'); (n.children || []).forEach(function (c) { var li = h('li', {}, c.label); list(c, li); ul.appendChild(li); }); if (ul.childNodes.length) parent.appendChild(ul); })(st.map.root, det);
      det.insertBefore(h('p', {}, st.map.root.label), det.childNodes[1]);
      wrap.appendChild(det);

      function size() { var r = svg.getBoundingClientRect(); return { w: r.width || 800, h: r.height || 500 }; }
      function fit() {
        var s = size(), bd = st.layout.bounds, bw = bd.x1 - bd.x0, bh = bd.y1 - bd.y0, k = Math.min(1.5, Math.min((s.w - 40) / bw, (s.h - 40) / bh));
        st.view = { k: k, x: s.w / 2 - ((bd.x0 + bd.x1) / 2) * k, y: s.h / 2 - ((bd.y0 + bd.y1) / 2) * k };
      }
      function apply() { gEl.setAttribute('transform', 'translate(' + st.view.x + ' ' + st.view.y + ') scale(' + st.view.k + ')'); }
      function zoom(f) { var s = size(); st.view = zoomAt(st.view, f, s.w / 2, s.h / 2); apply(); }
      requestAnimationFrame(function () { if (!st.view) fit(); apply(); });
      if (!st.view) st.view = { k: 1, x: 0, y: 0 };
      fit(); apply();

      var drag = null;
      svg.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, vx: st.view.x, vy: st.view.y }; svg.setPointerCapture(e.pointerId); svg.style.cursor = 'grabbing'; });
      svg.addEventListener('pointermove', function (e) { if (!drag) return; st.view.x = drag.vx + e.clientX - drag.x; st.view.y = drag.vy + e.clientY - drag.y; apply(); });
      function up() { drag = null; svg.style.cursor = 'grab'; }
      svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
      svg.addEventListener('wheel', function (e) { e.preventDefault(); var r = svg.getBoundingClientRect(); st.view = zoomAt(st.view, e.deltaY < 0 ? 1.1 : 0.9, e.clientX - r.left, e.clientY - r.top); apply(); }, { passive: false });
      svg.addEventListener('keydown', function (e) {
        var step = 40, hit = true;
        if (e.key === 'ArrowLeft') st.view.x += step; else if (e.key === 'ArrowRight') st.view.x -= step;
        else if (e.key === 'ArrowUp') st.view.y += step; else if (e.key === 'ArrowDown') st.view.y -= step;
        else if (e.key === '+' || e.key === '=') zoom(1.2); else if (e.key === '-') zoom(0.83); else if (e.key === '0') fit(); else hit = false;
        if (hit) { e.preventDefault(); apply(); }
      });
    }

    function exportPng() {
      var o = toSvgString(st.layout), scale = 2, img = new Image();
      var url = URL.createObjectURL(new Blob([o.svg], { type: 'image/svg+xml;charset=utf-8' }));
      img.onload = function () {
        var cv = document.createElement('canvas'); cv.width = o.width * scale; cv.height = o.height * scale;
        var c = cv.getContext('2d'); c.scale(scale, scale); c.drawImage(img, 0, 0); URL.revokeObjectURL(url);
        cv.toBlob(function (bl) { if (bl) download(slug(st.map.title || doc.name) + '.png', bl); else toast('Export PNG impossible', 'error'); }, 'image/png');
      };
      img.onerror = function () { URL.revokeObjectURL(url); toast('Export PNG impossible, utilise l’export SVG.', 'error'); };
      img.src = url;
    }
    draw();
  }

  S.register({ id: 'mindmap', title: 'Mind map', icon: '🗺️', order: 8, needsDoc: true, render: render });
})();
