/* Studio — Le Bureau : un bureau en pixel art où de petits agents circulent et travaillent pendant tes générations.
 * Parties :
 *   1. logique pure (grille, A*, machine à états des agents, jobs) : testable sous Node, sans DOM ;
 *   2. rendu canvas (sprites de Studio.sprites avec rectangles de secours), boucle rAF, vues « salle » et « bandeau » ;
 *   3. intégration : Studio.register, écoute de Studio.bus 'gen:start' / 'gen:end', Studio.office.mount(el).
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  root.Studio = root.Studio || {};
  var Studio = root.Studio;

  /* =====================================================================
   * 1. LOGIQUE PURE
   * ===================================================================== */
  var TILE = 16, COLS = 20, ROWS = 13, WORLD_W = COLS * TILE, WORLD_H = ROWS * TILE;
  var ROLES = ['max', 'chercheur', 'developpeur', 'designer', 'redacteur', 'analyste'];

  var INFO = {
    max:         { name: 'Max',  title: 'Chef de projet', icon: '🧭', color: '#6c57f2', hair: '#2a2069',
                   desc: 'Je coordonne l’équipe et je vérifie que tout est prêt pour tes révisions.' },
    chercheur:   { name: 'Léa',  title: 'Chercheuse',     icon: '🔎', color: '#2fa8d8', hair: '#5a3a22',
                   desc: 'Je fouille ton cours pour retrouver les idées et les définitions importantes.' },
    developpeur: { name: 'Théo', title: 'Développeur',    icon: '💻', color: '#2fcf9c', hair: '#222222',
                   desc: 'Je fais tourner la machine : je transforme ton cours en exercices.' },
    designer:    { name: 'Zoé',  title: 'Designeuse',     icon: '🎨', color: '#ff7aa8', hair: '#a13a6a',
                   desc: 'Je mets tout en forme : cartes, schémas et couleurs pour mieux retenir.' },
    redacteur:   { name: 'Jules', title: 'Rédacteur',     icon: '✍️', color: '#ffb347', hair: '#8a5a00',
                   desc: 'J’écris les questions, les fiches et les résumés.' },
    analyste:    { name: 'Nina', title: 'Analyste',       icon: '📊', color: '#ff6b6b', hair: '#3b2c94',
                   desc: 'Je repère ce qu’il faut absolument retenir et je suis ta progression.' }
  };

  // Plan de la pièce (en cases de 16 px). Les bureaux sont indiqués par leur case gauche ; le siège est juste au-dessus.
  var DESKS = {
    chercheur: { x: 2, y: 4 }, max: { x: 8, y: 4 }, developpeur: { x: 14, y: 4 },
    designer: { x: 2, y: 9 }, redacteur: { x: 8, y: 9 }, analyste: { x: 14, y: 9 }
  };
  var FURNITURE = {
    shelves: [{ x: 1, y: 0, w: 2, h: 2 }, { x: 10, y: 0, w: 2, h: 2 }, { x: 17, y: 0, w: 2, h: 2 }],
    whiteboard: { x: 6, y: 0, w: 2, h: 2 },
    coffee: { x: 13, y: 2 },
    printer: { x: 17, y: 2 },
    plants: [{ x: 0, y: 2 }, { x: 19, y: 2 }, { x: 0, y: 11 }, { x: 19, y: 11 }, { x: 4, y: 11 }, { x: 15, y: 11 }],
    rug: { x: 6, y: 6, w: 8, h: 2 }
  };
  var POI = {
    coffee: [{ x: 13, y: 3 }],
    printer: [{ x: 17, y: 3 }],
    board: [{ x: 6, y: 2 }, { x: 7, y: 2 }],
    lounge: [{ x: 10, y: 6 }, { x: 4, y: 6 }, { x: 16, y: 6 }, { x: 10, y: 11 }, { x: 7, y: 11 }, { x: 12, y: 11 }, { x: 10, y: 3 }]
  };

  function seatOf(role) { var d = DESKS[role]; return { x: d.x, y: d.y - 1 }; }

  function buildGrid() {
    var blocked = [], x, y;
    for (var i = 0; i < COLS * ROWS; i++) blocked.push(false);
    function block(cx, cy) { if (cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS) blocked[cy * COLS + cx] = true; }
    for (y = 0; y < 2; y++) for (x = 0; x < COLS; x++) block(x, y);
    Object.keys(DESKS).forEach(function (r) { block(DESKS[r].x, DESKS[r].y); block(DESKS[r].x + 1, DESKS[r].y); });
    block(FURNITURE.coffee.x, FURNITURE.coffee.y); block(FURNITURE.printer.x, FURNITURE.printer.y);
    FURNITURE.plants.forEach(function (p) { block(p.x, p.y); });
    return { w: COLS, h: ROWS, blocked: blocked, free: function (cx, cy) { return cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS && !blocked[cy * COLS + cx]; } };
  }

  // A* sur grille 4-voisins. Retourne [] si départ = arrivée, null si inaccessible, sinon la liste des cases (départ exclu).
  function astar(grid, start, goal) {
    if (!grid.free(goal.x, goal.y)) return null;
    if (start.x === goal.x && start.y === goal.y) return [];
    var W = grid.w, open = [], g = {}, from = {}, closed = {};
    function k(x, y) { return y * W + x; }
    function hh(x, y) { return Math.abs(x - goal.x) + Math.abs(y - goal.y); }
    var sk = k(start.x, start.y); g[sk] = 0; open.push({ x: start.x, y: start.y, f: hh(start.x, start.y) });
    var D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (open.length) {
      var bi = 0, i;
      for (i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      var cur = open.splice(bi, 1)[0], ck = k(cur.x, cur.y);
      if (closed[ck]) continue;
      closed[ck] = true;
      if (cur.x === goal.x && cur.y === goal.y) {
        var path = [], key = ck;
        while (key !== sk) { path.push({ x: key % W, y: Math.floor(key / W) }); key = from[key]; }
        return path.reverse();
      }
      for (i = 0; i < 4; i++) {
        var nx = cur.x + D[i][0], ny = cur.y + D[i][1];
        if (!grid.free(nx, ny)) continue;
        var nk = k(nx, ny), ng = g[ck] + 1;
        if (closed[nk] || (g[nk] !== undefined && g[nk] <= ng)) continue;
        g[nk] = ng; from[nk] = ck; open.push({ x: nx, y: ny, f: ng + hh(nx, ny) });
      }
    }
    return null;
  }

  function mulberry32(a) {
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }

  /* ---- textes ---- */
  var KIND_LABEL = { flashcards: 'tes flashcards', quiz: 'ton quiz', summary: 'ta synthèse', mnemonics: 'tes astuces mémo', mindmap: 'ta carte mentale', ask: 'ta réponse', reading: 'la lecture de ton cours' };
  var JOB_ROLES = {
    flashcards: ['redacteur', 'developpeur'], quiz: ['analyste', 'chercheur'], summary: ['redacteur', 'chercheur'],
    mnemonics: ['designer', 'redacteur'], mindmap: ['designer', 'analyste'], ask: ['chercheur', 'developpeur'], reading: ['chercheur', 'analyste']
  };
  var JOB_LINES = {
    flashcards: ['Je rédige les cartes, recto puis verso…', 'Je lance la fabrication des flashcards.'],
    quiz: ['Je dose la difficulté des questions…', 'Je cherche de bons pièges (mais justes).'],
    summary: ['Je résume en gardant l’essentiel…', 'Je repère les passages clés du cours.'],
    mnemonics: ['Je cherche une astuce qui reste en tête…', 'Un acrostiche, ça vous dit ?'],
    mindmap: ['Je dessine les branches de la carte…', 'Je relie les idées entre elles.'],
    ask: ['Je cherche dans ton cours…', 'Je compare les passages pertinents.'],
    reading: ['Je lis ton cours de la première à la dernière ligne…', 'Je repère les mots importants.']
  };
  var SOLO = {
    coffee: ['Pause café ! Ton cerveau adore les pauses.', 'Un petit café et je reviens en pleine forme.', 'Ce café est plus fort que mon mot de passe.'],
    printer: ['L’imprimante fait « bip ». C’est bon signe.', 'Papier coincé ? Jamais. (Je touche du bois.)', 'Une impression, et hop : de la révision sur papier !'],
    board: ['Un schéma, même moche, aide à retenir !', 'Je note au tableau : réviser un peu chaque jour.', 'Idée : s’interroger sans regarder le cours.'],
    desk: ['Je relis… puis je me teste sans regarder !', 'Hmm, intéressant…', 'Zzz… non non, je réfléchis !', 'Encore dix minutes et je fais une pause.'],
    lounge: ['Je me dégourdis les jambes, ça aide à mémoriser.', 'Marcher un peu fait du bien à la concentration.', 'Je réfléchis en marchant.']
  };
  var BANTER = [
    ['Tu sais pourquoi les flashcards marchent ? On se teste !', 'Se tester, c’est mieux que relire. J’adore.'],
    ['Ce bug est têtu…', 'Explique-le à un canard en plastique. Si, si, ça marche.'],
    ['Mon café est froid.', 'Le tien l’était déjà hier.'],
    ['Tu as vu ce graphique ?', 'Oui, il manque juste un peu de violet.'],
    ['On fait quoi aujourd’hui ?', 'Des révisions ! Comme tous les jours, chef.'],
    ['J’ai relu mon texte 3 fois.', 'Essaie plutôt de le réciter sans regarder !'],
    ['Quelle heure est-il ?', 'L’heure d’une pause de 5 minutes.'],
    ['L’imprimante ne répond plus…', 'Éteins, rallume. Ça marche une fois sur deux.'],
    ['J’ai eu une idée géniale. Je l’ai oubliée.', 'Note-la sur le tableau blanc, la prochaine fois.'],
    ['J’ai 37 onglets ouverts.', 'Ferme-en 36 et ta concentration te remerciera.']
  ];
  var REACT = ['Ah oui, je note !', 'Je l’écris au tableau blanc.', 'Super astuce, merci !', 'Je vais l’essayer tout de suite.', 'Ça, c’est bon à savoir !'];
  var ROLE_THOUGHTS = {
    max: ['Tout le monde est prêt ? On révise !', 'Une équipe, c’est comme un cerveau : chacun son rôle.'],
    chercheur: ['Où ai-je mis cette définition ?', 'Les sources, toujours vérifier les sources.'],
    developpeur: ['Ça marche… mais pourquoi ça marche ?', 'Un point-virgule peut tout changer.'],
    designer: ['Un peu plus de couleur ici…', 'Un bon schéma vaut mille mots.'],
    redacteur: ['Le mot juste, le mot juste…', 'Une phrase courte se retient mieux.'],
    analyste: ['Les chiffres ne mentent pas.', 'Répéter à intervalles réguliers : ça marche !']
  };

  function plural(n, s, p) { return n + ' ' + (n > 1 ? p : s); }
  function countNodes(n) { if (!n) return 0; var c = 1; (n.children || []).forEach(function (k) { c += countNodes(k); }); return c; }
  // Message « ce qui a été produit », d'après le résultat de la génération.
  function describe(kind, ok, result) {
    if (!ok) return 'Zut, ça n’a pas marché cette fois. On réessaie ?';
    try {
      var n;
      if (kind === 'flashcards' && result && result.cards) { n = result.cards.length; return plural(n, 'flashcard prête', 'flashcards prêtes') + ' !'; }
      if (kind === 'quiz' && result && result.questions) { n = result.questions.length; return 'Quiz prêt : ' + plural(n, 'question', 'questions') + ' !'; }
      if (kind === 'summary' && result && typeof result.markdown === 'string') { n = (result.markdown.match(/\S+/g) || []).length; return 'Synthèse rédigée : environ ' + plural(n, 'mot', 'mots') + '.'; }
      if (kind === 'mnemonics' && result && result.items) { n = result.items.length; return plural(n, 'astuce mémo', 'astuces mémo') + ' pour toi !'; }
      if (kind === 'mindmap' && result && result.root) { n = countNodes(result.root); return 'Carte mentale : ' + plural(n, 'idée reliée', 'idées reliées') + '.'; }
      if (kind === 'ask') return 'Réponse trouvée dans ton cours !';
      if (kind === 'reading') return 'Cours lu : on est prêts à t’aider !';
    } catch (e) { /* message générique */ }
    return 'C’est prêt !';
  }

  function dirFromStep(dx, dy, cur) {
    if (dx > 0) return 'right'; if (dx < 0) return 'left'; if (dy > 0) return 'down'; if (dy < 0) return 'up'; return cur;
  }
  function bubbleDuration(text) { return Math.max(2.6, Math.min(8, 2.2 + String(text).length * 0.055)); }

  /* ---- simulation ---- */
  function createSim(opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random;
    var grid = opts.grid || buildGrid();
    var tipsFn = opts.tips || function () { return []; };
    var sim = {
      grid: grid, now: 0, agents: [], jobs: [], particles: [], reduced: !!opts.reduced,
      printUntil: 0, log: [], onLog: opts.onLog || null, _ambient: 6
    };
    function pick(a) { return a[Math.floor(rng() * a.length)]; }
    function logLine(t) { sim.log.push(t); if (sim.log.length > 30) sim.log.shift(); if (sim.onLog) sim.onLog(t); }
    sim.pick = pick;

    ROLES.forEach(function (role, i) {
      var s = seatOf(role);
      sim.agents.push({
        role: role, info: INFO[role], tx: s.x, ty: s.y, x: s.x, y: s.y, prog: 0, dir: 'down', state: 'sit',
        path: [], then: null, timer: 1 + i * 1.7 + rng() * 3, typing: false, sitT: 0, anim: rng() * 5,
        job: null, bubble: null, queue: [], partner: null, sparkT: 0, seat: s
      });
    });
    function agentOf(role) { for (var i = 0; i < sim.agents.length; i++) if (sim.agents[i].role === role) return sim.agents[i]; return null; }
    sim.agent = agentOf;

    function say(a, text, kind, dur) {
      a.bubble = { text: text, kind: kind || 'say', until: sim.now + (dur || bubbleDuration(text)) };
    }
    sim.say = say;
    function sayLater(a, delay, text, kind) { a.queue.push({ at: sim.now + delay, text: text, kind: kind }); }

    function burst(px, py, n, colors) {
      for (var i = 0; i < n; i++) {
        var ang = rng() * Math.PI * 2, sp = 18 + rng() * 40;
        sim.particles.push({ x: px, y: py, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 35, g: 90, life: 0.9 + rng() * 0.6, max: 1.5, c: pick(colors) });
      }
    }
    var CONFETTI = ['#ff6b6b', '#ffc83d', '#2fcf9c', '#6c57f2', '#ff7aa8', '#7de3ff'];
    function footPx(a) { return { x: (a.x + 0.5) * TILE, y: (a.y + 1) * TILE - 1 }; }
    sim.footPx = footPx;

    function goTo(a, goal, then) {
      var path = null;
      if (a.state === 'walk' && a.path.length) {
        var first = a.path[0], rest = astar(grid, first, goal);
        if (rest) path = [first].concat(rest);
      } else path = astar(grid, { x: a.tx, y: a.ty }, goal);
      if (!path) { a.state = 'idle'; a.timer = 1; a.then = null; return false; }
      a.then = then || null; a.partner = null;
      if (a.state !== 'walk') a.prog = 0;
      a.path = path; a.state = 'walk'; a.typing = false;
      if (!path.length) arrive(a);
      return true;
    }
    sim.goTo = goTo;

    function sitDown(a) {
      a.state = 'sit'; a.tx = a.seat.x; a.ty = a.seat.y; a.x = a.tx; a.y = a.ty; a.dir = 'down'; a.sitT = 0; a.path = []; a.prog = 0;
      a.typing = !!a.job;
    }
    function arrive(a) {
      var t = a.then; a.then = null; a.path = []; a.prog = 0; a.x = a.tx; a.y = a.ty;
      if (!t || t.state === 'idle') { a.state = 'idle'; a.timer = (t && t.dur) || 1.2; if (t && t.line) say(a, t.line, 'think'); return; }
      if (t.state === 'sit') {
        sitDown(a); a.timer = t.dur || (5 + rng() * 6);
        if (a.job && a.job.line) { say(a, a.job.lines[a.job.roles.indexOf(a.role)] || a.job.lines[0], 'think'); }
        else if (t.line) say(a, t.line, 'think');
        return;
      }
      if (t.state === 'use') {
        a.state = 'use'; a.dir = t.face || 'up'; a.timer = t.dur || 3; a.typing = false;
        if (t.line) say(a, t.line, t.kind || 'say');
        if (t.print) sim.printUntil = sim.now + 3;
        return;
      }
      if (t.state === 'chat') { startChat(a, t.partner, t.script); return; }
      a.state = 'idle'; a.timer = 1;
    }

    function tileNear(b) {
      var cand = [{ x: b.tx - 1, y: b.ty }, { x: b.tx + 1, y: b.ty }, { x: b.tx, y: b.ty - 1 }, { x: b.tx, y: b.ty + 1 }];
      return cand.filter(function (c) { return grid.free(c.x, c.y); });
    }
    function startChat(a, b, script) {
      var close = b && Math.abs(b.tx - a.tx) + Math.abs(b.ty - a.ty) <= 2;
      if (!close || b.job) { a.state = 'idle'; a.timer = 1; if (script && script.solo) say(a, script.solo, 'think'); return; }
      var da = bubbleDuration(script.a), db = bubbleDuration(script.b);
      a.state = 'chat'; b.state = 'chat'; a.partner = b; b.partner = a; a.typing = b.typing = false; b.path = []; b.prog = 0;
      b.x = b.tx; b.y = b.ty;
      a.dir = dirFromStep(b.tx - a.tx, b.ty - a.ty, a.dir); b.dir = dirFromStep(a.tx - b.tx, a.ty - b.ty, b.dir);
      say(a, script.a, script.kind || 'say', da);
      sayLater(b, da * 0.85, script.b, 'say');
      a.timer = b.timer = da * 0.85 + db + 0.6;
    }

    function makeScript() {
      var tips = tipsFn() || [], tip = null;
      if (tips.length && rng() < 0.55) {
        var short = tips.filter(function (t) { return String(t).length <= 135; });
        tip = pick(short.length ? short : tips);
      }
      if (tip) return { a: 'Saviez-vous : ' + tip, b: pick(REACT), kind: 'tip' };
      var b = pick(BANTER); return { a: b[0], b: b[1] };
    }

    function decide(a) {
      if (a.job) return;
      var r = rng(), role = a.role;
      var wBoard = role === 'max' ? 0.30 : 0.12, wCoffee = role === 'developpeur' ? 0.32 : 0.22;
      var c = 0;
      function hit(w) { c += w; return r < c; }
      if (hit(wCoffee)) return visit(a, 'coffee', 4);
      if (hit(0.12)) return visit(a, 'printer', 3, true);
      if (hit(wBoard)) return visit(a, 'board', 4);
      if (hit(0.22)) {
        var others = sim.agents.filter(function (o) { return o !== a && !o.job && (o.state === 'idle' || o.state === 'sit' || o.state === 'use'); });
        if (others.length) {
          var b = pick(others), near = tileNear(b);
          if (near.length) {
            var script = makeScript(); script.solo = pick(ROLE_THOUGHTS[role]);
            return goTo(a, pick(near), { state: 'chat', partner: b, script: script });
          }
        }
      }
      if (hit(0.12)) { var l = pick(POI.lounge); return goTo(a, l, { state: 'idle', dur: 2 + rng() * 2, line: pick(SOLO.lounge) }); }
      return goTo(a, a.seat, { state: 'sit', dur: 6 + rng() * 6, line: rng() < 0.6 ? pick(SOLO.desk.concat(ROLE_THOUGHTS[role])) : null });
    }
    function visit(a, what, dur, print) {
      var spot = pick(POI[what]);
      goTo(a, spot, { state: 'use', dur: dur + rng() * 2, face: 'up', line: rng() < 0.8 ? pick(SOLO[what]) : null, kind: 'say', print: !!print });
    }

    /* ---- jobs ---- */
    function activeJobFor(role) {
      for (var i = 0; i < sim.jobs.length; i++) { var j = sim.jobs[i]; if (!j.done && j.roles.indexOf(role) >= 0) return j; }
      return null;
    }
    function assign(a, job) {
      a.job = job;
      if (sim.reduced) { sitDown(a); a.sitT = 0; say(a, job.lines[job.roles.indexOf(a.role)] || job.lines[0], 'think'); return; }
      goTo(a, a.seat, { state: 'sit', dur: 1 });
    }
    sim.startJob = function (kind) {
      var roles = JOB_ROLES[kind] || ['redacteur', 'developpeur'];
      var job = { id: sim.jobs.length + '-' + Math.floor(sim.now * 1000), kind: kind, roles: roles, lines: JOB_LINES[kind] || ['Au travail !'],
        line: true, t0: sim.now, ended: false, ok: null, msg: '', done: false };
      sim.jobs.push(job);
      roles.forEach(function (r) { var a = agentOf(r); if (a && !a.job) assign(a, job); });
      var max = agentOf('max');
      var label = KIND_LABEL[kind] || 'ça';
      logLine('Max lance la préparation de ' + label + '.');
      if (sim.reduced) say(max, 'C’est parti pour ' + label + ' !', 'say');
      else goTo(max, POI.board[0], { state: 'use', dur: 3.5, face: 'up', line: 'C’est parti pour ' + label + ' !', kind: 'say' });
      return job;
    };
    sim.endJob = function (kind, ok, result) {
      var job = null;
      for (var i = 0; i < sim.jobs.length; i++) if (!sim.jobs[i].ended && !sim.jobs[i].done && sim.jobs[i].kind === kind) { job = sim.jobs[i]; break; }
      if (!job) { job = sim.startJob(kind); }
      job.ended = true; job.ok = ok !== false; job.msg = describe(kind, job.ok, result); job.tEnd = sim.now;
      return job;
    };
    function finishJob(job) {
      job.done = true;
      var workers = sim.agents.filter(function (a) { return a.job === job; });
      var first = workers[0];
      workers.forEach(function (a, idx) {
        a.job = null; a.typing = false;
        var again = activeJobFor(a.role);
        if (again) { a.job = again; if (a.state !== 'sit') goTo(a, a.seat, { state: 'sit', dur: 1 }); else a.typing = true; return; }
        if (job.ok && !sim.reduced) {
          a.state = 'cheer'; a.timer = 2.4; a.anim = 0; a.path = []; a.prog = 0; a.dir = 'down'; a.x = a.tx; a.y = a.ty;
          var f = footPx(a); burst(f.x, f.y - 12, 14, CONFETTI);
        } else if (!sim.reduced) { a.state = 'idle'; a.timer = 2; a.dir = 'down'; }
        if (idx === 0) say(a, job.msg, job.ok ? 'say' : 'think', 5);
        else sayLater(a, 0.9, job.ok ? pick(['Bravo !', 'Hop, dans la boîte !', 'Et de un !', 'Mission accomplie !']) : 'La prochaine fois sera la bonne.', 'say');
      });
      logLine((first ? first.info.name + ' : ' : '') + job.msg);
      var max = agentOf('max');
      if (job.ok) {
        if (sim.reduced) sayLater(max, 1.5, 'Beau travail, l’équipe !', 'say');
        else if (!max.job) goTo(max, POI.printer[0], { state: 'use', dur: 3, face: 'up', line: 'Beau travail, l’équipe ! 🎉', kind: 'say', print: true });
      }
      sim.jobs = sim.jobs.filter(function (j) { return j !== job; });
    }
    sim.activeKinds = function () { return sim.jobs.filter(function (j) { return !j.done; }).map(function (j) { return j.kind; }); };
    sim.isBusy = function () { return sim.jobs.some(function (j) { return !j.done; }); };

    /* ---- interaction ---- */
    sim.hit = function (wx, wy) {
      var best = null;
      sim.agents.forEach(function (a) {
        var f = footPx(a), oy = a.state === 'sit' ? 6 : 0;
        if (wx >= f.x - 8 && wx <= f.x + 8 && wy >= f.y + oy - 24 && wy <= f.y + oy + 1) { if (!best || f.y > footPx(best).y) best = a; }
      });
      return best;
    };
    sim.click = function (a) {
      if (!a) return;
      say(a, a.info.icon + ' ' + a.info.name + ' · ' + a.info.title + '\n' + a.info.desc, 'say', 6);
      logLine(a.info.name + ' (' + a.info.title + ') : ' + a.info.desc);
      if (!a.job && !sim.reduced && a.state !== 'walk') { a.state = 'chat'; a.timer = 5.5; a.dir = 'down'; a.typing = false; }
    };
    sim.chatWith = function (role, text) { var a = agentOf(role); if (a) say(a, text, 'say'); };

    /* ---- mise à jour ---- */
    function emitSpark(a, dt) {
      a.sparkT -= dt;
      if (a.sparkT > 0) return;
      a.sparkT = 0.16 + rng() * 0.12;
      var d = DESKS[a.role], cx = d.x * TILE + 8 + (rng() * 8 - 4), cy = d.y * TILE + 4;
      sim.particles.push({ x: cx, y: cy, vx: rng() * 14 - 7, vy: -14 - rng() * 14, g: 0, life: 0.55, max: 0.55, c: pick(['#ffe27a', '#7de3ff', '#ff9ec4', '#ffffff']) });
    }
    function updateAgent(a, dt) {
      a.anim += dt;
      if (a.job && a.state !== 'walk' && a.state !== 'sit') { goTo(a, a.seat, { state: 'sit', dur: 1 }); }
      switch (a.state) {
        case 'walk': {
          var speed = (a.job ? 4.4 : 2.6) * dt;
          a.prog += speed;
          while (a.path.length && a.prog >= 1) {
            var n = a.path.shift(); a.dir = dirFromStep(n.x - a.tx, n.y - a.ty, a.dir);
            a.tx = n.x; a.ty = n.y; a.prog -= 1;
            if (a.path.length) { var m = a.path[0]; a.dir = dirFromStep(m.x - a.tx, m.y - a.ty, a.dir); }
          }
          if (!a.path.length) { arrive(a); break; }
          var nx = a.path[0];
          a.dir = dirFromStep(nx.x - a.tx, nx.y - a.ty, a.dir);
          a.x = a.tx + (nx.x - a.tx) * a.prog; a.y = a.ty + (nx.y - a.ty) * a.prog;
          break;
        }
        case 'sit':
          if (a.job) { a.typing = true; a.sitT += dt; emitSpark(a, dt); }
          else { a.timer -= dt; if (a.timer <= 0) decide(a); }
          break;
        case 'cheer':
          a.timer -= dt; if (a.timer <= 0) { a.state = 'idle'; a.timer = 0.5; }
          break;
        default: // idle, use, chat
          a.timer -= dt;
          if (a.timer <= 0) { a.partner = null; decide(a); }
      }
    }
    sim.update = function (dt) {
      if (dt > 0.1) dt = 0.1;
      sim.now += dt;
      sim.agents.forEach(function (a) {
        if (sim.reduced) {
          a.anim += dt;
          if (a.job) { a.typing = true; a.sitT += dt; if (a.state !== 'sit') sitDown(a); }
          else if (a.state !== 'sit') sitDown(a);
        } else updateAgent(a, dt);
        if (a.bubble && sim.now >= a.bubble.until) a.bubble = null;
        for (var i = a.queue.length - 1; i >= 0; i--) if (sim.now >= a.queue[i].at) { var q = a.queue.splice(i, 1)[0]; say(a, q.text, q.kind); }
      });
      sim.jobs.slice().forEach(function (job) {
        if (!job.ended || job.done) return;
        var workers = sim.agents.filter(function (a) { return a.job === job; });
        var ready = workers.every(function (a) { return a.state === 'sit' && a.sitT >= 1.4; });
        if (ready || sim.now - job.t0 >= 7.5 || !workers.length) finishJob(job);
      });
      var ps = sim.particles;
      for (var i = ps.length - 1; i >= 0; i--) {
        var p = ps[i]; p.life -= dt;
        if (p.life <= 0) { ps.splice(i, 1); continue; }
        p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      }
      // petites pensées spontanées
      sim._ambient -= dt;
      if (sim._ambient <= 0) {
        sim._ambient = 6 + rng() * 8;
        var cand = sim.agents.filter(function (a) { return !a.bubble && !a.job && (a.state === 'sit' || a.state === 'idle'); });
        if (cand.length) {
          var a = pick(cand), tips = tipsFn() || [];
          if (rng() < 0.35 && tips.length) say(a, 'Saviez-vous : ' + pick(tips), 'tip');
          else say(a, pick(rng() < 0.5 ? ROLE_THOUGHTS[a.role] : SOLO.desk), 'think');
        }
      }
    };
    sim.setReduced = function (r) {
      r = !!r; if (r === sim.reduced) return; sim.reduced = r;
      sim.agents.forEach(function (a) {
        a.path = []; a.then = null; a.prog = 0; a.partner = null;
        if (r) { sitDown(a); } else { a.state = a.job ? 'idle' : 'sit'; a.timer = 1 + rng() * 3; if (a.job) updateAgent(a, 0); }
      });
    };
    if (sim.reduced) sim.agents.forEach(sitDown);
    return sim;
  }

  var logic = {
    TILE: TILE, COLS: COLS, ROWS: ROWS, ROLES: ROLES, INFO: INFO, DESKS: DESKS, POI: POI, FURNITURE: FURNITURE, JOB_ROLES: JOB_ROLES,
    seatOf: seatOf, buildGrid: buildGrid, astar: astar, mulberry32: mulberry32, createSim: createSim, describe: describe, bubbleDuration: bubbleDuration
  };
  Studio.officeLogic = logic;
  if (typeof module !== 'undefined' && module.exports) module.exports = logic;
  if (typeof document === 'undefined') return;

  /* =====================================================================
   * 2. RENDU CANVAS
   * ===================================================================== */
  var reducedMQ = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function prefersReduced() { return !!(reducedMQ && reducedMQ.matches); }

  var sim = createSim({
    reduced: prefersReduced(),
    tips: function () { var T = Studio.content && Studio.content.text; return (T && T.tips) || []; },
    onLog: function (t) { Studio.bus && Studio.bus.emit('office:log', { text: t }); }
  });

  /* ---- sprites ---- */
  var spriteCache = {};
  function sprite(name) {
    if (name in spriteCache) return spriteCache[name];
    var out = null, s = root.Studio && Studio.sprites && Studio.sprites[name];
    try {
      var rows = s && s.frames && s.frames[0];
      if (rows && rows.length) {
        var w = 0; rows.forEach(function (r) { if (r.length > w) w = r.length; });
        var c = document.createElement('canvas'); c.width = w; c.height = rows.length;
        var cx = c.getContext('2d'), pal = s.pal || {};
        for (var y = 0; y < rows.length; y++) for (var x = 0; x < rows[y].length; x++) {
          var ch = rows[y].charAt(x), col = pal[ch];
          if (ch === '.' || !col) continue;
          cx.fillStyle = col; cx.fillRect(x, y, 1, 1);
        }
        out = { c: c, w: w, h: rows.length };
      }
    } catch (e) { out = null; }
    spriteCache[name] = out;
    return out;
  }

  /* ---- boutique « Mon bureau » (Studio.game) : looks, chapeaux, décors posés. Tout est défensif : sans Studio.game, rien ne change. ---- */
  function gameApi() { return root.Studio && Studio.game && Studio.game.state ? Studio.game : null; }
  function gameItem(slot, role) { var G = gameApi(); try { return G && G.itemFor ? G.itemFor(slot, role) : null; } catch (e) { return null; } }
  // Sprite d'agent recoloré par un look de Studio.skins (mis en cache).
  function skinSprite(skinId, name) {
    var k = skinId + '|' + name;
    if (k in spriteCache) return spriteCache[k];
    var out = null;
    try {
      var d = Studio.skins && Studio.skins.skinned && Studio.skins.skinned(skinId, name), rows = d && d.frames && d.frames[0];
      if (rows && rows.length) {
        var c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length;
        var cx = c.getContext('2d');
        for (var y = 0; y < rows.length; y++) for (var x = 0; x < rows[y].length; x++) {
          var col = d.pal[rows[y].charAt(x)]; if (rows[y].charAt(x) === '.' || !col) continue;
          cx.fillStyle = col; cx.fillRect(x, y, 1, 1);
        }
        out = { c: c, w: rows[0].length, h: rows.length };
      }
    } catch (e) { out = null; }
    spriteCache[k] = out; return out;
  }
  // Teinte simple (looks de secours sans palette) : on colore les pixels existants.
  function tintSprite(s, name, tint) {
    var k = 'tint|' + name + '|' + tint;
    if (k in spriteCache) return spriteCache[k];
    var c = document.createElement('canvas'); c.width = s.w; c.height = s.h;
    var cx = c.getContext('2d'); cx.drawImage(s.c, 0, 0);
    cx.globalCompositeOperation = 'source-atop'; cx.globalAlpha = 0.4; cx.fillStyle = tint; cx.fillRect(0, 0, s.w, s.h);
    spriteCache[k] = { c: c, w: s.w, h: s.h }; return spriteCache[k];
  }
  // Les décors bloquants rendent les cases infranchissables pour les agents (A*) ; les tapis et objets muraux ne bloquent pas.
  var decorSig = '';
  function syncDecor() {
    var G = gameApi(); if (!G) return;
    var sig = JSON.stringify(G.state.placed || []);
    if (sig === decorSig) return;
    decorSig = sig;
    var b = sim.grid.blocked;
    if (!sim.grid.baseBlocked) sim.grid.baseBlocked = b.slice();
    for (var i = 0; i < b.length; i++) b[i] = sim.grid.baseBlocked[i];
    (G.blockedCells ? G.blockedCells() : []).forEach(function (c) { if (c.x >= 0 && c.y >= 0 && c.x < COLS && c.y < ROWS) b[c.y * COLS + c.x] = true; });
  }

  var FALLBACK = {
    shelf: { w: 32, h: 32, c: '#8b5e3c' }, whiteboard: { w: 64, h: 32, c: '#f4f6fb' }, coffee: { w: 16, h: 24, c: '#4a4458' },
    printer: { w: 16, h: 16, c: '#b9b4c9' }, plant: { w: 16, h: 24, c: '#3fa66a' }, desk: { w: 32, h: 16, c: '#b98552' },
    computer_off: { w: 12, h: 10, c: '#2b3550' }, computer_on: { w: 12, h: 10, c: '#5cc9f5' }
  };
  // Dessine un sprite posé par son coin bas-gauche (x, bottom). Rectangle de couleur si le sprite manque.
  function drawSprite(g, name, x, bottom, fbName) {
    var s = sprite(name);
    if (s) { g.drawImage(s.c, Math.round(x), Math.round(bottom - s.h)); return s; }
    var f = FALLBACK[fbName || name] || { w: 16, h: 16, c: '#c9c3e0' };
    g.fillStyle = f.c; g.fillRect(Math.round(x), Math.round(bottom - f.h), f.w, f.h);
    g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(Math.round(x), Math.round(bottom - f.h), f.w, 2);
    g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(Math.round(x), Math.round(bottom - 2), f.w, 2);
    return { w: f.w, h: f.h, fallback: true };
  }

  var bgCanvas = null;
  function buildBg() {
    var c = document.createElement('canvas'); c.width = WORLD_W; c.height = WORLD_H;
    var g = c.getContext('2d'), fl = sprite('tile_floor'), wl = sprite('tile_wall'), x, y;
    for (y = 0; y < ROWS; y++) for (x = 0; x < COLS; x++) {
      if (y < 2) {
        if (wl) g.drawImage(wl.c, x * TILE, y * TILE);
        else { g.fillStyle = y === 0 ? '#d6cdee' : '#c2b7e0'; g.fillRect(x * TILE, y * TILE, TILE, TILE); if (y === 1) { g.fillStyle = '#6c57f2'; g.fillRect(x * TILE, y * TILE + 13, TILE, 3); } }
      } else if (fl) g.drawImage(fl.c, x * TILE, y * TILE);
      else { g.fillStyle = (x + y) % 2 ? '#efe9ff' : '#e2daf7'; g.fillRect(x * TILE, y * TILE, TILE, TILE); }
    }
    var r = FURNITURE.rug, rs = sprite('rug');
    if (rs) {
      for (y = 0; y < r.h * TILE; y += rs.h) for (x = 0; x < r.w * TILE; x += rs.w) g.drawImage(rs.c, r.x * TILE + x, r.y * TILE + y);
    } else {
      g.fillStyle = '#d96a6a'; g.fillRect(r.x * TILE, r.y * TILE + 4, r.w * TILE, r.h * TILE - 8);
      g.fillStyle = '#f2c14e'; g.fillRect(r.x * TILE + 3, r.y * TILE + 7, r.w * TILE - 6, 2); g.fillRect(r.x * TILE + 3, (r.y + r.h) * TILE - 9, r.w * TILE - 6, 2);
    }
    return c;
  }

  var AGENT_W = 16, AGENT_H = 24;
  function agentFrameName(a) {
    var f;
    if (a.state === 'sit') { f = Math.floor(a.anim / (a.typing ? 0.12 : 0.7)) % 2; if (sim.reduced) f = 0; return 'agent_' + a.role + '_work_' + f; }
    if (a.state === 'walk') return 'agent_' + a.role + '_' + a.dir + '_' + (Math.floor(a.anim / 0.16) % 2);
    if (a.state === 'cheer') return 'agent_' + a.role + '_down_' + (Math.floor(a.anim / 0.15) % 2);
    return 'agent_' + a.role + '_' + a.dir + '_0';
  }
  function drawAgent(g, a) {
    var f = sim.footPx(a), fx = Math.round(f.x), fy = f.y, hop = 0;
    if (a.state === 'sit') fy += 6;
    if (a.state === 'cheer') hop = Math.abs(Math.sin(a.anim * 9)) * 6;
    if (a.state === 'walk') hop = (Math.floor(a.anim / 0.16) % 2) ? 1 : 0;
    fy = Math.round(fy - hop);
    if (a.state !== 'sit') { g.fillStyle = 'rgba(40,30,80,.20)'; g.fillRect(fx - 5, Math.round(f.y) - 1, 10, 3); }
    var nm = agentFrameName(a), sk = gameItem('skin', a.role);
    var s = (sk && sk.map && skinSprite(sk.id, nm)) || sprite(nm);
    if (s) {
      var src = (sk && sk.tint) ? tintSprite(s, nm, sk.tint) : s;
      g.drawImage(src.c || src, fx - Math.floor(s.w / 2), fy - s.h);
      drawHat(g, a, fx - Math.floor(s.w / 2), fy - s.h);
      return;
    }
    var info = a.info;           // rectangle de secours : petit personnage en couleur
    g.fillStyle = info.color; g.fillRect(fx - 5, fy - 14, 10, 14);
    g.fillStyle = '#f2c9a0'; g.fillRect(fx - 4, fy - 22, 8, 8);
    g.fillStyle = info.hair; g.fillRect(fx - 4, fy - 23, 8, 3);
    g.fillStyle = '#1c1838';
    if (a.dir !== 'up') { g.fillRect(fx - 2, fy - 18, 1, 2); g.fillRect(fx + 1, fy - 18, 1, 2); }
  }

  // Chapeau acheté : sprite 16x8 posé en haut du sprite d'agent (les lunettes et nœuds ne se voient que de face).
  function drawHat(g, a, x, y) {
    var hat = gameItem('hat', a.role), G = gameApi();
    if (!hat || !G || !G.itemCanvas) return;
    if (/lunettes|noeud/.test(hat.id) && (a.state === 'sit' || a.dir === 'up')) return;
    var hc = G.itemCanvas(hat); if (hc) g.drawImage(hc.c, x, y);
  }

  function agentBase(a) { var f = sim.footPx(a); return a.state === 'sit' ? (DESKS[a.role].y * TILE + 6) : f.y; }

  // Dessine le monde (coordonnées « monde » 320×208) dans g.
  function drawWorld(g) {
    if (!bgCanvas) bgCanvas = buildBg();
    g.drawImage(bgCanvas, 0, 0);
    var items = [], busy = sim.isBusy();
    FURNITURE.shelves.forEach(function (s) { items.push({ b: 32, d: function () { for (var i = 0; i < s.w; i++) for (var j = 0; j < s.h; j++) drawSprite(g, 'shelf', (s.x + i) * TILE, (s.y + j + 1) * TILE); } }); });
    var wb = FURNITURE.whiteboard;
    items.push({ b: 32, d: function () {
      var s0 = sprite('whiteboard'), sw = s0 ? s0.w : 64, w = wb.w * TILE, h = s0 ? s0.h : 32, x0 = wb.x * TILE, y0 = 32 - h;
      for (var bx = 0; bx < w; bx += sw) drawSprite(g, 'whiteboard', x0 + bx, 32);
      if (busy) {            // gribouillis et post-it quand l'équipe travaille
        g.fillStyle = '#6c57f2'; g.fillRect(x0 + 5, y0 + 6, Math.floor(w * 0.45), 1);
        g.fillStyle = '#ff6b6b'; g.fillRect(x0 + 5, y0 + 10, Math.floor(w * 0.3), 1);
        g.fillStyle = '#2fcf9c'; g.fillRect(x0 + 5, y0 + 14, Math.floor(w * 0.5), 1);
        g.fillStyle = '#ffc83d'; g.fillRect(x0 + w - 14, y0 + 6, 7, 7);
      }
    } });
    items.push({ b: (FURNITURE.coffee.y + 1) * TILE, d: function () {
      drawSprite(g, 'coffee', FURNITURE.coffee.x * TILE, (FURNITURE.coffee.y + 1) * TILE);
      if (Math.floor(sim.now * 2) % 2 && sim.agents.some(function (a) { return a.state === 'use' && a.tx === POI.coffee[0].x && a.ty === POI.coffee[0].y; })) {
        g.fillStyle = 'rgba(255,255,255,.8)'; g.fillRect(FURNITURE.coffee.x * TILE + 7, (FURNITURE.coffee.y) * TILE - 6 - Math.floor(sim.now * 6) % 4, 1, 3);
      }
    } });
    items.push({ b: (FURNITURE.printer.y + 1) * TILE, d: function () {
      var px = FURNITURE.printer.x * TILE, pb = (FURNITURE.printer.y + 1) * TILE;
      drawSprite(g, 'printer', px, pb);
      if (sim.now < sim.printUntil) { var k = Math.min(1, (sim.printUntil - sim.now) / 3); g.fillStyle = '#fff'; g.fillRect(px + 4, pb - 15 - Math.round((1 - k) * 3), 8, 5); g.fillStyle = '#9a94b8'; g.fillRect(px + 5, pb - 14 - Math.round((1 - k) * 3), 5, 1); }
    } });
    FURNITURE.plants.forEach(function (p) { items.push({ b: (p.y + 1) * TILE, d: function () { drawSprite(g, 'plant', p.x * TILE, (p.y + 1) * TILE); } }); });
    Object.keys(DESKS).forEach(function (role) {
      var d = DESKS[role], a = sim.agent(role), base = (d.y + 1) * TILE;
      items.push({ b: base, d: function () {
        var s = sprite('desk');
        if (s && s.w <= TILE) { drawSprite(g, 'desk', d.x * TILE, base); drawSprite(g, 'desk', (d.x + 1) * TILE, base); }
        else drawSprite(g, 'desk', d.x * TILE, base);
      } });
      items.push({ b: base + 1, d: function () {
        var on = a.state === 'sit', nm = on ? 'computer_on' : 'computer_off', s = sprite(nm), w = s ? s.w : 12;
        drawSprite(g, nm, d.x * TILE + Math.floor((TILE - w) / 2), d.y * TILE + 10);
      } });
    });
    sim.agents.forEach(function (a) { items.push({ b: agentBase(a), d: function () { drawAgent(g, a); } }); });
    var G = gameApi();
    if (G && G.state.placed && G.state.placed.length) {
      syncDecor();
      G.state.placed.forEach(function (p) {
        var it = G.itemById(p.id); if (!it) return;
        var fp = Studio.gameLogic.footprint(it), layer = Studio.gameLogic.layerOf(it), bottom = (p.y + fp.h) * TILE;
        items.push({ b: layer === 'wall' ? -2 : layer === 'flat' ? -1 : bottom, d: function () {
          var fr = it.frames > 1 ? Math.floor(sim.now * 2) % it.frames : 0, ic = G.itemCanvas(it, fr);
          if (ic) g.drawImage(ic.c, p.x * TILE, bottom - ic.h);
        } });
      });
    } else syncDecor();
    items.sort(function (p, q) { return p.b - q.b; });
    items.forEach(function (it) { it.d(); });
    sim.particles.forEach(function (p) {
      g.globalAlpha = Math.max(0, Math.min(1, p.life / 0.4)); g.fillStyle = p.c; g.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
    });
    g.globalAlpha = 1;
  }

  /* ---- bulles (dessinées en haute résolution, par-dessus la mise à l'échelle) ---- */
  function wrapText(g, text, maxW) {
    var lines = [];
    String(text).split('\n').forEach(function (para) {
      var words = para.split(/\s+/), line = '';
      words.forEach(function (w) {
        var t = line ? line + ' ' + w : w;
        if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
      });
      lines.push(line);
    });
    return lines;
  }
  function drawBubbles(v) {
    var g = v.ctx, s = v.scale, dpr = v.dpr, compact = v.kind === 'strip';
    var fs = Math.round((compact ? 11 : 12.5) * dpr), pad = Math.round(5 * dpr), lh = Math.round(fs * 1.25);
    g.font = '600 ' + fs + 'px ui-rounded, system-ui, -apple-system, "Segoe UI", sans-serif';
    g.textBaseline = 'top';
    var placed = [], narrow = (v.canvas.width / dpr) <= 480;   // mobile : 2 bulles au plus, jamais l'une sur l'autre
    sim.agents.slice().sort(function (a, b) { return agentBase(a) - agentBase(b); }).forEach(function (a) {
      var b = a.bubble; if (!b) return;
      if (narrow && placed.length >= 2) return;
      var f = sim.footPx(a), ax = (f.x - v.camX) * s, ay = (f.y + (a.state === 'sit' ? 6 : 0) - AGENT_H - v.camY) * s;
      var think = b.kind === 'think', text = b.text, lines, w, h;
      if (compact) {
        text = b.kind === 'tip' ? '💡' : think ? '💭' : '💬';
        lines = [text]; w = Math.round(g.measureText(text).width) + pad * 2; h = lh + pad;
      } else {
        var maxW = Math.min(Math.round(210 * dpr), v.canvas.width - pad * 4);
        lines = wrapText(g, text, maxW);
        w = 0; lines.forEach(function (l) { w = Math.max(w, g.measureText(l).width); });
        w = Math.round(w) + pad * 2; h = lines.length * lh + pad * 2;
      }
      var x = Math.round(ax - w / 2), y = Math.round(ay - h - 8 * dpr);
      x = Math.max(2, Math.min(v.canvas.width - w - 2, x));
      if (y < 2) y = 2;
      placed.forEach(function (p) { if (x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y) y = p.y - h - 2; });
      if (narrow || !compact) {   // décalage vertical : si la bulle ne tient plus en haut, on la passe plutôt que de la superposer
        var clash = placed.some(function (p) { return x < p.x + p.w && x + w > p.x && Math.max(y, 2) < p.y + p.h && Math.max(y, 2) + h > p.y; });
        if (y < 2 && clash) return;
        if (y < 2) y = 2;
      }
      if (y < 0 && !compact) y = 2;
      placed.push({ x: x, y: y, w: w, h: h });
      var bw = Math.max(1, Math.round(dpr));
      g.fillStyle = '#2a2069'; g.fillRect(x - bw, y - bw, w + bw * 2, h + bw * 2);
      g.fillStyle = b.kind === 'tip' ? '#fff3cc' : '#ffffff'; g.fillRect(x, y, w, h);
      var tx = Math.max(x + 3 * dpr, Math.min(x + w - 6 * dpr, Math.round(ax - 2 * dpr)));
      if (think) {
        g.fillStyle = '#2a2069'; g.fillRect(tx, y + h + bw, 4 * dpr, 4 * dpr); g.fillRect(tx + 2 * dpr, y + h + 6 * dpr, 2 * dpr, 2 * dpr);
        g.fillStyle = '#fff'; g.fillRect(tx + bw, y + h + bw, 4 * dpr - 2 * bw, 4 * dpr - 2 * bw);
      } else {
        g.fillStyle = '#2a2069'; g.fillRect(tx, y + h + bw, 5 * dpr, 3 * dpr); g.fillRect(tx + dpr, y + h + 4 * dpr, 3 * dpr, 2 * dpr);
        g.fillStyle = b.kind === 'tip' ? '#fff3cc' : '#fff'; g.fillRect(tx + bw, y + h, 5 * dpr - 2 * bw, 3 * dpr);
      }
      g.fillStyle = '#1c1838';
      lines.forEach(function (l, i) { g.fillText(l, x + pad, y + (compact ? Math.round(pad / 2) : pad) + i * lh); });
    });
  }

  /* ---- vues ---- */
  var views = [];
  function makeView(kind, host, canvas, maxFrac) {
    var v = { kind: kind, host: host, canvas: canvas, ctx: canvas.getContext('2d'), buf: document.createElement('canvas'), W: WORLD_W, H: kind === 'strip' ? 64 : WORLD_H,
      scale: 1, dpr: 1, camX: 0, camY: kind === 'strip' ? 16 : 0, lastDraw: 0, maxFrac: maxFrac || 0.68 };
    v.bctx = v.buf.getContext('2d');
    return v;
  }
  function layoutView(v) {
    var dpr = root.devicePixelRatio || 1, avail = v.host.clientWidth;
    if (!avail) return false;
    v.dpr = dpr;
    if (v.kind === 'strip') {
      v.scale = Math.max(1, Math.round(dpr));
      v.W = Math.max(64, Math.min(WORLD_W, Math.floor(avail * dpr / v.scale)));
    } else {
      var sc = Math.floor(avail * dpr / WORLD_W), maxH = Math.max(WORLD_H, (root.innerHeight || 800) * v.maxFrac * dpr);
      v.scale = Math.max(1, Math.min(6, sc, Math.floor(maxH / WORLD_H)));
      v.W = WORLD_W;
    }
    v.canvas.width = v.W * v.scale; v.canvas.height = v.H * v.scale;
    v.canvas.style.width = (v.canvas.width / dpr) + 'px'; v.canvas.style.height = (v.canvas.height / dpr) + 'px';
    v.buf.width = v.W; v.buf.height = v.H;
    v.ctx.imageSmoothingEnabled = false; v.bctx.imageSmoothingEnabled = false;
    return true;
  }
  function viewVisible(v) {
    return v.canvas.isConnected && v.host.isConnected && v.canvas.getClientRects().length > 0 && v.canvas.width > 0;
  }
  function updateStripCamera(v, dt) {
    var workers = sim.agents.filter(function (a) { return a.job || a.state === 'cheer' || a.state === 'use'; });
    if (!workers.length) workers = sim.agents.filter(function (a) { return a.state === 'sit'; });
    var top = 0, bottom = 0, sx = 0;
    workers.forEach(function (a) { if (a.ty <= 5) top++; else bottom++; sx += (a.x + 0.5) * TILE; });
    var ty = bottom > top ? 96 : 16, tx = workers.length ? sx / workers.length - v.W / 2 : (WORLD_W - v.W) / 2;
    tx = Math.max(0, Math.min(WORLD_W - v.W, tx));
    var k = Math.min(1, dt * 6);
    v.camY += (ty - v.camY) * k; v.camX += (tx - v.camX) * k;
    if (Math.abs(ty - v.camY) < 0.5) v.camY = ty;
    v.camX = Math.round(v.camX * 2) / 2; v.camY = Math.round(v.camY);
  }
  function renderView(v, dt) {
    if (v.kind === 'strip') updateStripCamera(v, dt); else { v.camX = 0; v.camY = 0; }
    var g = v.bctx;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, v.W, v.H);
    g.fillStyle = '#1c1838'; g.fillRect(0, 0, v.W, v.H);
    g.save(); g.translate(-Math.round(v.camX), -Math.round(v.camY));
    drawWorld(g);
    g.restore();
    var c = v.ctx; c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, v.canvas.width, v.canvas.height);
    c.drawImage(v.buf, 0, 0, v.W, v.H, 0, 0, v.W * v.scale, v.H * v.scale);
    drawBubbles(v);
  }

  /* ---- boucle (arrêtée si rien n'est visible ou si l'onglet est caché) ----
   * Cadence : 30 images/s quand l'équipe travaille, ≈ 18 images/s (salle) ou 15 (bandeau) quand le bureau est calme, 4 images/s si
   * « réduire les animations ». Réglage « Bureau animé : non » : le bandeau devient une image fixe (la salle reste animée).
   * Boucle par setTimeout calé sur l'intervalle (plus de réveil à 60 Hz pour sauter des images). */
  var timer = 0, lastTs = 0, lastStaticDrawn = false, animCache = { t: -1e9, v: true };
  function animatedPref() {
    var n = Date.now();
    if (n - animCache.t > 1000) {
      animCache.t = n;
      try { var st = Studio.store && Studio.store.get('settings', null); animCache.v = !(st && st.animatedOffice === false); } catch (e) { animCache.v = true; }
    }
    return animCache.v;
  }
  var FPS_WORK = 30, FPS_CALM = 18, FPS_CALM_STRIP = 15;
  function interval(vs) {
    if (sim.reduced) return 250;
    if (!animatedPref() && !vs.some(function (v) { return v.kind === 'room'; })) return 1000;
    var calm = vs.some(function (v) { return v.kind === 'room'; }) ? FPS_CALM : FPS_CALM_STRIP;
    return Math.round(1000 / (sim.isBusy() ? FPS_WORK : calm));
  }
  function now() { return (root.performance && performance.now) ? performance.now() : Date.now(); }
  function loop() {
    timer = 0;
    if (document.hidden) return;
    views = views.filter(function (v) { return v.canvas.isConnected && v.host.isConnected; });
    var vis = views.filter(viewVisible);
    if (!vis.length) return;
    var t = now(), dt = lastTs ? (t - lastTs) / 1000 : 0;
    lastTs = t;
    var live = animatedPref() || vis.some(function (v) { return v.kind === 'room'; });
    if (live || !lastStaticDrawn) {
      sim.update(dt);
      vis.forEach(function (v) { renderView(v, dt); });
      updateLabels();
      lastStaticDrawn = true;
    }
    if (!live) return;                       // bandeau fixe (réglage « Bureau animé : non ») : une seule image, pas de boucle
    var wait = Math.max(0, interval(vis) - (now() - t));
    timer = setTimeout(loop, wait);
  }
  function ensureLoop() {
    if (document.hidden) return;
    if (!views.some(viewVisible)) return;
    animCache.t = -1e9; lastStaticDrawn = false;
    if (timer) return;
    lastTs = 0; timer = setTimeout(loop, 0);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (timer) { clearTimeout(timer); timer = 0; } } else ensureLoop();
  });
  function onReducedChange() { sim.setReduced(prefersReduced()); views.forEach(function (v) { layoutView(v); }); ensureLoop(); }
  if (reducedMQ) { if (reducedMQ.addEventListener) reducedMQ.addEventListener('change', onReducedChange); else if (reducedMQ.addListener) reducedMQ.addListener(onReducedChange); }

  function watchSize(v) {
    var fn = function () { if (layoutView(v)) { ensureLoop(); if (viewVisible(v)) renderView(v, 0); } };
    if (root.ResizeObserver) { var ro = new ResizeObserver(fn); ro.observe(v.host); v.stop = function () { ro.disconnect(); }; }
    else { root.addEventListener('resize', fn); v.stop = function () { root.removeEventListener('resize', fn); }; }
    fn();
  }

  /* =====================================================================
   * 3. INTÉGRATION
   * ===================================================================== */
  var labels = [];
  function statusText() {
    var kinds = sim.activeKinds();
    if (kinds.length) return '⌨️ L’équipe prépare ' + (KIND_LABEL[kinds[0]] || 'ton contenu') + '…';
    var uses = sim.agents.filter(function (a) { return a.state === 'use'; })[0];
    if (uses && uses.tx === POI.coffee[0].x) return '☕ Pause café au bureau';
    return '🏢 Le bureau est calme';
  }
  var lastStatus = '';
  function updateLabels() {
    var t = statusText();
    if (t === lastStatus) return;
    lastStatus = t;
    labels.forEach(function (l) { if (l.isConnected) l.textContent = t; });
    var busy = sim.isBusy();
    document.querySelectorAll('.office-strip').forEach(function (s) { s.classList.toggle('is-working', busy); });
  }

  // Studio.office.mount(el) : insère le bandeau (canvas) dans el. Retourne { destroy() }.
  function mount(el) {
    if (!el) return { destroy: function () {} };
    el.classList.add('office-strip');
    var a = document.createElement('a'); a.className = 'office-strip-link'; a.href = '#/office'; a.setAttribute('aria-label', 'Ouvrir Le Bureau : voir les agents au travail');
    var canvas = document.createElement('canvas'); canvas.className = 'office-canvas office-strip-canvas'; canvas.setAttribute('aria-hidden', 'true');
    a.appendChild(canvas);
    var label = document.createElement('div'); label.className = 'office-strip-label'; label.setAttribute('aria-hidden', 'true');
    el.appendChild(a); el.appendChild(label); labels.push(label);
    document.body.classList.add('has-office-strip');
    var v = makeView('strip', a, canvas);
    views.push(v); watchSize(v); lastStatus = ''; updateLabels();
    return { destroy: function () {
      if (v.stop) v.stop();
      views = views.filter(function (x) { return x !== v; }); labels = labels.filter(function (x) { return x !== label; });
      if (a.parentNode) a.parentNode.removeChild(a); if (label.parentNode) label.parentNode.removeChild(label);
      document.body.classList.remove('has-office-strip');
    } };
  }

  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var val = attrs[k]; if (val == null || val === false) return;
      if (k === 'class') e.className = val; else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), val); else e.setAttribute(k, val);
    });
    [].concat(kids == null ? [] : kids).forEach(function (c) { e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }

  // Studio.office.mountRoom(container, {maxFrac, label}) : monte la salle (canvas pixel art) dans un conteneur.
  // Retourne { host, canvas, destroy() }. Utilisé par la page « Le Bureau » et par l'écran de travail (crew.js).
  function mountRoom(container, opts) {
    opts = opts || {};
    var canvas = h('canvas', { class: 'office-canvas office-room-canvas', tabindex: opts.focusable === false ? null : '0', role: 'img',
      'aria-label': opts.label || 'Le bureau de l’équipe : six petits agents travaillent, discutent et boivent du café. Clique sur un agent pour en savoir plus.' });
    var host = h('div', { class: opts.hostClass || 'office-stage' }, canvas);
    container.appendChild(host);
    var v = makeView('room', host, canvas, opts.maxFrac);
    var onClick = function (e) {
      var r = canvas.getBoundingClientRect(), k = canvas.width / r.width;
      var wx = ((e.clientX - r.left) * k) / v.scale, wy = ((e.clientY - r.top) * k) / v.scale;
      var a = sim.hit(wx, wy);
      if (a) { sim.click(a); ensureLoop(); if (viewVisible(v)) renderView(v, 0); }
    };
    canvas.addEventListener('click', onClick);
    canvas.style.cursor = 'pointer';
    views.push(v); watchSize(v);
    return { host: host, canvas: canvas, destroy: function () {
      if (v.stop) v.stop();
      views = views.filter(function (x) { return x !== v; });
      if (host.parentNode) host.parentNode.removeChild(host);
    } };
  }

  var roomOff = null;
  function render(container) {
    if (roomOff) { roomOff(); roomOff = null; }
    var room = mountRoom(container);
    var host = room.host;
    container.removeChild(host);
    var logEl = h('ul', { class: 'office-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Journal du bureau' });
    function addLog(t) {
      logEl.appendChild(h('li', {}, t));
      while (logEl.children.length > 6) logEl.removeChild(logEl.firstChild);
    }
    sim.log.slice(-4).forEach(addLog);
    var offLog = Studio.bus.on('office:log', function (d) { addLog(d.text); });
    var buttons = h('div', { class: 'office-agents', role: 'group', 'aria-label': 'Les agents' }, ROLES.map(function (r) {
      var i = INFO[r];
      return h('button', { type: 'button', class: 'btn btn-ghost office-agent-btn', onclick: function () { sim.click(sim.agent(r)); ensureLoop(); } },
        [h('span', { 'aria-hidden': 'true' }, i.icon + ' '), i.name + ' · ' + i.title]);
    }));
    var kinds = ['flashcards', 'quiz', 'summary', 'mnemonics', 'mindmap', 'ask'], demoIdx = 0;
    var demoBtn = h('button', { type: 'button', class: 'btn btn-primary', onclick: function () { demo(kinds[demoIdx++ % kinds.length]); } }, '🎬 Mettre l’équipe au travail (démo)');
    container.appendChild(h('div', { class: 'page-header' }, [
      h('div', {}, [h('h1', {}, '🏢 Le Bureau'),
        h('p', { class: 'text-muted' }, 'Voici l’équipe de Studio. Quand tu génères des flashcards ou des astuces, ils se mettent au travail. Clique sur un agent pour faire connaissance !')]),
      h('div', { class: 'page-actions' }, demoBtn)
    ]));
    container.appendChild(h('div', { class: 'office-wrap' }, [host, buttons, logEl]));
    roomOff = function () { room.destroy(); offLog(); };
  }

  function demo(kind) {
    kind = kind || 'quiz';
    Studio.bus.emit('gen:start', { kind: kind });
    setTimeout(function () {
      var fake = { flashcards: { cards: new Array(12) }, quiz: { questions: new Array(8) }, summary: { markdown: 'mot '.repeat(180) },
        mnemonics: { items: new Array(5) }, mindmap: { root: { children: [{}, {}, { children: [{}, {}] }] } }, ask: {} };
      Studio.bus.emit('gen:end', { kind: kind, ok: true, result: fake[kind] });
    }, 2500);
  }

  Studio.bus.on('gen:start', function (d) { sim.startJob((d && d.kind) || 'ask'); ensureLoop(); });
  Studio.bus.on('gen:end', function (d) {
    var proceed = function () { sim.endJob((d && d.kind) || 'ask', !d || d.ok !== false, d && d.result); ensureLoop(); };
    // Studio.office.gate (écran de travail) peut différer la fin du job pour que le public voie l'équipe travailler.
    if (Studio.office && typeof Studio.office.gate === 'function' && Studio.office.gate(d || {}, proceed)) return;
    proceed();
  });
  Studio.bus.on('nav', function (d) {
    if (d && d.moduleId !== 'office' && roomOff) { roomOff(); roomOff = null; }
    ensureLoop();
  });

  Studio.office = { mount: mount, mountRoom: mountRoom, ensureLoop: ensureLoop, sim: sim, logic: logic, demo: demo, isReduced: prefersReduced };
  Studio.register({ id: 'office', title: 'Le Bureau', icon: '🏢', order: 12, needsDoc: false, render: render });

  /* Réglages : « Bureau animé » (settings.animatedOffice, oui par défaut) */
  Studio.settingsSections = Studio.settingsSections || [];
  Studio.settingsSections.push({ id: 'office-anim', title: 'Bureau animé', render: function (box) {
    var st = (Studio.store.get('settings', null)) || {};
    var cb = h('input', { type: 'checkbox', id: 'set-office-animated' });
    cb.checked = st.animatedOffice !== false;
    cb.addEventListener('change', function () {
      var cur = Studio.store.get('settings', null) || {}; cur.animatedOffice = cb.checked; Studio.store.set('settings', cur);
      animCache.t = -1e9; ensureLoop();
      if (Studio.ui && Studio.ui.toast) Studio.ui.toast(cb.checked ? 'Le bureau du haut est animé.' : 'Le bureau du haut est une image fixe : ton appareil se fatigue moins.');
    });
    box.appendChild(h('label', { for: 'set-office-animated', class: 'game-set-row' }, [cb, document.createTextNode(' Bureau animé (le petit bureau en haut des pages)')]));
    box.appendChild(h('p', { class: 'small muted' }, 'Désactive-le si ton appareil chauffe ou si ta batterie fond vite. La page « Le Bureau » reste animée.'));
  } });

  function autoMount() { var el = document.getElementById('office-strip'); if (el && !el.querySelector('canvas')) mount(el); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount); else autoMount();
})();
