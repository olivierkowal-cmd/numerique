/* Studio — Le jeu (dev-game) : niveaux, pièces, quêtes du jour, badges, série douce, coach, boutique et « Mon bureau ».
 * Parties :
 *   1. logique pure (jours, niveaux, série douce, quêtes, économie, badges, placement) : testable sous Node, sans DOM ;
 *   2. état persistant (clé 'game' du store), enveloppe de Studio.stats, écoute du bus 'activity' et 'gen:end' ;
 *   3. interface : coach, bulles, barre de la sidebar, module « Mon bureau », réglage « effets de jeu ».
 * Règles : aucune punition, aucun classement, aucun compteur qui « meurt ». Tout Studio.xxx d'un autre agent est utilisé de façon défensive.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  root.Studio = root.Studio || {};
  var Studio = root.Studio;

  /* =====================================================================
   * 1. LOGIQUE PURE
   * ===================================================================== */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dayNum(key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
    if (!m) return NaN;
    return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5);
  }
  function keyFromNum(n) {
    var d = new Date(n * 864e5);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }
  function localKey(d) { d = d || new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function todayKey() { return (Studio.stats && Studio.stats.dayKey) ? Studio.stats.dayKey() : localKey(); }
  // Lundi de la semaine du jour donné (clé de semaine pour les jours de repos).
  function weekKey(key) { var n = dayNum(key); return keyFromNum(n - ((n + 3) % 7)); }

  /* ---- niveaux : seuil du niveau L = 40(L-1) + 10(L-1)(L-2) → 0, 40, 100, 180, 280, 400… ---- */
  function xpForLevel(L) { L = Math.max(1, Math.floor(L)); return 40 * (L - 1) + 10 * (L - 1) * (L - 2); }
  function levelFromXp(xp) {
    xp = Math.max(0, Math.floor(+xp || 0));
    var L = 1;
    while (xpForLevel(L + 1) <= xp) L++;
    var base = xpForLevel(L), next = xpForLevel(L + 1);
    return { level: L, xp: xp, base: base, next: next, into: xp - base, need: next - base, pct: Math.round(((xp - base) / (next - base)) * 100) };
  }

  /* ---- série douce ---- */
  function newStreak() { return { count: 0, best: 0, last: '', rest: {} }; }
  // 1 jour de repos gratuit par semaine (lundi → dimanche). Un jour manqué couvert par un repos ne casse rien.
  // Si trop de jours manqués : la série est divisée par deux (jamais remise à zéro brutalement).
  function advanceStreak(s, today) {
    s = JSON.parse(JSON.stringify(s || newStreak()));
    s.rest = s.rest || {};
    var res = { streak: s, event: 'same', rested: 0, gap: 0 };
    if (!s.last) { s.count = 1; s.last = today; s.best = Math.max(s.best || 0, 1); res.event = 'first'; return res; }
    var gap = dayNum(today) - dayNum(s.last);
    res.gap = gap;
    if (!(gap > 0)) return res;
    if (gap === 1) { s.count = (s.count || 0) + 1; res.event = 'next'; }
    else {
      var rest = JSON.parse(JSON.stringify(s.rest)), used = 0, broke = false, i;
      for (i = 1; i < gap; i++) {
        var day = keyFromNum(dayNum(s.last) + i), wk = weekKey(day);
        if (!rest[wk]) { rest[wk] = day; used++; } else { broke = true; break; }
      }
      if (!broke) { s.rest = rest; s.count = (s.count || 0) + 1; res.event = 'rested'; res.rested = used; }
      else { s.count = Math.floor((s.count || 0) / 2) + 1; res.event = 'softreset'; }
    }
    s.last = today; s.best = Math.max(s.best || 0, s.count);
    var keepFrom = dayNum(today) - 70;
    Object.keys(s.rest).forEach(function (k) { if (dayNum(k) < keepFrom) delete s.rest[k]; });
    return res;
  }
  function restAvailable(s, today) { return !(s && s.rest && s.rest[weekKey(today)]); }
  // Aperçu sans enregistrer : { count, status:'ok'|'rest'|'soft'|'none' }
  function streakPreview(s, today) {
    if (!s || !s.last) return { count: 0, status: 'none' };
    var r = advanceStreak(s, today);
    if (r.event === 'same' || r.event === 'next') return { count: s.count, status: 'ok' };
    if (r.event === 'rested') return { count: s.count, status: 'rest' };
    return { count: s.count, status: 'soft' };
  }

  /* ---- quêtes du jour (tirage stable) ---- */
  var QUEST_POOL = [
    { id: 'cards10', stat: 'cards', target: 10, label: 'Révise 10 cartes', coins: 8, xp: 15 },
    { id: 'cards20', stat: 'cards', target: 20, label: 'Révise 20 cartes', coins: 12, xp: 25 },
    { id: 'memory1', stat: 'memory', target: 1, label: 'Joue 1 memory', coins: 6, xp: 12 },
    { id: 'mnemo1', stat: 'mnemo', target: 1, label: 'Trouve une astuce mémo', coins: 6, xp: 12 },
    { id: 'mindmap1', stat: 'mindmap', target: 1, label: 'Dessine une carte mentale', coins: 6, xp: 12 },
    { id: 'today1', stat: 'today', target: 1, label: 'Fais une séance de 5 minutes', coins: 10, xp: 20 },
    { id: 'import1', stat: 'import', target: 1, label: 'Ajoute un cours', coins: 6, xp: 12 }
  ];
  function hashStr(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry32(a) {
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  // 3 quêtes de types différents, toujours les mêmes pour un même jour.
  function pickQuests(day, n, pool) {
    n = n || 3; pool = pool || QUEST_POOL;
    var rng = mulberry32(hashStr('studio-quetes-' + day)), arr = pool.slice(), i, j, t;
    for (i = arr.length - 1; i > 0; i--) { j = Math.floor(rng() * (i + 1)); t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    var out = [], stats = {};
    arr.forEach(function (q) { if (out.length < n && !stats[q.stat]) { stats[q.stat] = 1; out.push(q.id); } });
    return out;
  }
  function questById(id) { for (var i = 0; i < QUEST_POOL.length; i++) if (QUEST_POOL[i].id === id) return QUEST_POOL[i]; return null; }

  /* ---- économie ---- */
  var DAILY_COIN_CAP = 60;      // pièces gagnées par jour grâce aux activités (les quêtes et badges s'ajoutent, une seule fois)
  var EVENT_CAP = { cards: 12, memory: 8, mnemo: 4, mindmap: 4, import: 4, today: 4, ocr: 4 };
  var DAILY_XP_CAP = 100;       // XP bonus du jeu par jour (les modes donnent leur propre XP via Studio.stats)
  var XP_BONUS = { mnemo: 8, mindmap: 8, import: 5, today: 10, ocr: 5 };
  var TYPES = ['cards', 'memory', 'mnemo', 'mindmap', 'import', 'ocr', 'today'];
  function coinRule(type, d) {
    switch (type) {
      case 'cards': return Math.min(10, Math.ceil(Math.min(100, d.count || 0) / 5));
      case 'memory': return 3;
      case 'today': return 6;
      default: return 2;
    }
  }

  function newState() {
    return { v: 1, coins: 0, earned: 0, spent: 0, days: {}, counters: {}, streak: newStreak(),
      quests: { day: '', ids: [], done: {} }, badges: {}, inv: {}, placed: [], equipped: { hat: {}, skin: {} }, welcomed: '', lastLevel: 1, bought: 0 };
  }
  function normalizeState(s) {
    var d = newState();
    if (!s || typeof s !== 'object') return d;
    Object.keys(d).forEach(function (k) { if (s[k] !== undefined && s[k] !== null) d[k] = s[k]; });
    d.equipped = { hat: (s.equipped && s.equipped.hat) || {}, skin: (s.equipped && s.equipped.skin) || {} };
    d.streak = Object.assign(newStreak(), s.streak || {});
    d.quests = Object.assign({ day: '', ids: [], done: {} }, s.quests || {});
    ['coins', 'earned', 'spent', 'bought'].forEach(function (k) { d[k] = Math.max(0, Math.floor(+d[k] || 0)); });
    if (!Array.isArray(d.placed)) d.placed = [];
    return d;
  }
  function ensureDay(S, today) {
    if (S.quests.day !== today) { S.quests = { day: today, ids: pickQuests(today), done: {} }; }
    if (!S.days[today]) S.days[today] = { coins: 0, xp: 0, ev: {}, n: {} };
    var keys = Object.keys(S.days);
    if (keys.length > 21) keys.sort().slice(0, keys.length - 21).forEach(function (k) { delete S.days[k]; });
    return S.days[today];
  }
  function bump(o, k, n) { o[k] = (o[k] || 0) + n; }

  /* ---- badges ---- */
  var BADGES = [
    { id: 'first_card', icon: '🃏', name: 'Première carte', desc: 'Tu as révisé ta première carte.', stat: 'cards', target: 1 },
    { id: 'cards_50', icon: '📚', name: '50 cartes', desc: 'Tu as révisé 50 cartes.', stat: 'cards', target: 50 },
    { id: 'cards_200', icon: '🧠', name: 'Super mémoire', desc: 'Tu as révisé 200 cartes.', stat: 'cards', target: 200 },
    { id: 'memory_1', icon: '🎮', name: 'Joueur de memory', desc: 'Tu as joué à un jeu de memory.', stat: 'memory', target: 1 },
    { id: 'memory_10', icon: '🕹️', name: 'Champion du memory', desc: 'Tu as joué 10 fois.', stat: 'memory', target: 10 },
    { id: 'mnemo_1', icon: '💡', name: 'Astuce géniale', desc: 'Tu as trouvé une astuce mémo.', stat: 'mnemo', target: 1 },
    { id: 'mindmap_1', icon: '🗺️', name: 'Cartographe', desc: 'Tu as dessiné une carte mentale.', stat: 'mindmap', target: 1 },
    { id: 'import_1', icon: '📥', name: 'Premier cours', desc: 'Tu as ajouté un cours.', stat: 'import', target: 1 },
    { id: 'today_1', icon: '⏱️', name: 'Séance éclair', desc: 'Tu as fait une séance de 5 minutes.', stat: 'today', target: 1 },
    { id: 'streak_3', icon: '🔥', name: '3 jours de suite', desc: 'Tu as révisé 3 jours d’affilée.', stat: 'streak', target: 3 },
    { id: 'streak_7', icon: '🔥', name: 'Une semaine !', desc: 'Tu as révisé 7 jours d’affilée.', stat: 'streak', target: 7 },
    { id: 'streak_14', icon: '🌋', name: 'Deux semaines', desc: 'Tu as tenu 14 jours d’affilée.', stat: 'streak', target: 14 },
    { id: 'level_3', icon: '⭐', name: 'Niveau 3', desc: 'Tu as atteint le niveau 3.', stat: 'level', target: 3 },
    { id: 'level_5', icon: '🌠', name: 'Niveau 5', desc: 'Tu as atteint le niveau 5.', stat: 'level', target: 5 },
    { id: 'level_10', icon: '🏅', name: 'Niveau 10', desc: 'Tu as atteint le niveau 10.', stat: 'level', target: 10 },
    { id: 'quest_1', icon: '🧭', name: 'Première quête', desc: 'Tu as réussi une quête du jour.', stat: 'quests', target: 1 },
    { id: 'quest_10', icon: '🏆', name: '10 quêtes', desc: 'Tu as réussi 10 quêtes du jour.', stat: 'quests', target: 10 },
    { id: 'shopper', icon: '🛍️', name: 'Première boutique', desc: 'Tu as acheté un objet.', stat: 'bought', target: 1 },
    { id: 'decorator', icon: '🪴', name: 'Décorateur', desc: 'Tu as placé 3 objets dans ton bureau.', stat: 'placed', target: 3 },
    { id: 'comeback', icon: '💪', name: 'Retour en force', desc: 'Tu es revenu réviser après une pause.', stat: 'comeback', target: 1 }
  ];
  var BADGE_SPR = { first_card: 'book', cards_50: 'brain', cards_200: 'owl',
    memory_1: 'heart', memory_10: 'trophy', mnemo_1: 'bulb', mindmap_1: 'key', import_1: 'sprout', today_1: 'clock', streak_3: 'flame',
    streak_7: 'flame', streak_14: 'rocket', level_3: 'bronze', level_5: 'silver', level_10: 'gold', quest_1: 'calendar', quest_10: 'trophy', shopper: 'gem',
    decorator: 'heart', comeback: 'rocket' };
  BADGES.forEach(function (b) { b.spr = 'badge_' + BADGE_SPR[b.id]; });
  function mergeBadges(ext) {
    var list = BADGES.map(function (b) { return Object.assign({}, b); });
    if (!Array.isArray(ext)) return list;
    ext.forEach(function (e) {
      if (!e || !e.id) return;
      var base = null;
      list.forEach(function (b) { if (b.id === e.id) base = b; });
      var upd = { name: e.name || e.titre, desc: e.desc || e.description || e.texte, icon: e.icon || e.emoji };
      if (base) { Object.keys(upd).forEach(function (k) { if (upd[k]) base[k] = upd[k]; }); if (e.stat) base.stat = e.stat; if (e.target) base.target = e.target; }
      else if (e.stat && e.target && (e.name || e.titre)) list.push({ id: String(e.id), icon: upd.icon || '🏅', name: upd.name, desc: upd.desc || '', stat: e.stat, target: +e.target });
    });
    return list;
  }
  function statValue(S, ctx, stat) {
    switch (stat) {
      case 'streak': return Math.max((S.streak && S.streak.best) || 0, (S.streak && S.streak.count) || 0);
      case 'level': return ctx.level || 1;
      case 'bought': return S.bought || 0;
      case 'placed': return (S.placed || []).length;
      default: return (S.counters && S.counters[stat]) || 0;
    }
  }
  // Retourne la liste des badges nouvellement gagnés (et les inscrit dans S.badges).
  function checkBadges(S, ctx, today, list) {
    var won = [];
    (list || BADGES).forEach(function (b) {
      if (S.badges[b.id]) return;
      if (statValue(S, ctx, b.stat) >= b.target) { S.badges[b.id] = today; S.coins += 5; S.earned += 5; won.push(b); }
    });
    return won;
  }

  /* ---- application d'une activité (cœur de l'économie) ---- */
  function applyActivity(S, d, today, ctx, badgeList) {
    ctx = ctx || {};
    var out = { coins: 0, xp: 0, capped: false, quests: [], badges: [], streak: null, ignored: false };
    var type = d && d.type;
    if (TYPES.indexOf(type) < 0) { out.ignored = true; return out; }
    var count = type === 'cards' ? Math.max(0, Math.min(200, Math.floor(+d.count || 0))) : 1;
    if (!count) { out.ignored = true; return out; }
    var day = ensureDay(S, today);
    // série douce
    var adv = advanceStreak(S.streak, today);
    S.streak = adv.streak; out.streak = adv;
    if (adv.event === 'rested' || adv.event === 'softreset') bump(S.counters, 'comeback', 1);
    if (adv.event !== 'same') bump(S.counters, 'days', 1);
    // compteurs (du jour pour les quêtes, à vie pour les badges)
    var inc = [[type, count]];
    inc.forEach(function (p) { bump(day.n, p[0], p[1]); bump(S.counters, p[0], p[1]); });
    // pièces (avec plafonds anti-abus)
    bump(day.ev, type, 1);
    var cap = EVENT_CAP[type] || 4, c = 0;
    if (day.ev[type] <= cap) {
      c = coinRule(type, d);
      var room = Math.max(0, DAILY_COIN_CAP - day.coins);
      if (c > room) { c = room; out.capped = true; }
    } else out.capped = true;
    day.coins += c; S.coins += c; S.earned += c; out.coins = c;
    // XP bonus du jeu
    var xp = XP_BONUS[type] || 0;
    xp = Math.max(0, Math.min(xp, DAILY_XP_CAP - (day.xp || 0)));
    day.xp = (day.xp || 0) + xp; out.xp = xp;
    // quêtes terminées (récompenses : une seule fois par jour et par quête)
    S.quests.ids.forEach(function (id) {
      var q = questById(id);
      if (!q || S.quests.done[id]) return;
      if ((day.n[q.stat] || 0) >= q.target) {
        S.quests.done[id] = true; S.coins += q.coins; S.earned += q.coins; out.xp += q.xp;
        bump(S.counters, 'quests', 1); out.quests.push(q);
      }
    });
    var lvl = levelFromXp((ctx.xp || 0) + out.xp);
    out.badges = checkBadges(S, { level: lvl.level }, today, badgeList);
    return out;
  }

  /* ---- boutique : objets de repli (utilisés si Studio.skins.items est absent) ---- */
  // Dimensions des décors en cases de 16 px (comme Studio.skins.items). Chapeaux : 16x8 px ; looks : agent 16x24 px.
  var FALLBACK_ITEMS = [
    { id: 'fb_plante', name: 'Grande plante', price: 20, slot: 'decor', w: 1, h: 2, emoji: '🪴' },
    { id: 'fb_cactus', name: 'Cactus rigolo', price: 20, slot: 'decor', w: 1, h: 1, emoji: '🌵' },
    { id: 'fb_lampe', name: 'Lampe', price: 25, slot: 'decor', w: 1, h: 2, emoji: '💡' },
    { id: 'fb_globe', name: 'Globe terrestre', price: 35, slot: 'decor', w: 1, h: 1, emoji: '🌍' },
    { id: 'fb_aquarium', name: 'Aquarium', price: 60, slot: 'decor', w: 2, h: 1, emoji: '🐠', color: '#7de3ff' },
    { id: 'fb_tapis', name: 'Tapis bleu', price: 30, slot: 'decor', w: 2, h: 1, flat: true, color: '#5aa7e8' },
    { id: 'fb_piano', name: 'Piano', price: 80, slot: 'decor', w: 2, h: 1, emoji: '🎹', color: '#3a3358' },
    { id: 'fb_trophee', name: 'Trophée', price: 60, slot: 'decor', w: 1, h: 1, emoji: '🏆' },
    { id: 'fb_casquette', name: 'Casquette', price: 25, slot: 'hat', w: 1, h: 1, emoji: '🧢' },
    { id: 'fb_diplome', name: 'Chapeau de diplômé', price: 35, slot: 'hat', w: 1, h: 1, emoji: '🎓' },
    { id: 'fb_hautdeforme', name: 'Haut-de-forme', price: 45, slot: 'hat', w: 1, h: 1, emoji: '🎩' },
    { id: 'fb_couronne', name: 'Couronne', price: 90, slot: 'hat', w: 1, h: 1, emoji: '👑' },
    { id: 'fb_rose', name: 'Teinte rose', price: 40, slot: 'skin', w: 1, h: 2, tint: '#ff7aa8' },
    { id: 'fb_menthe', name: 'Teinte menthe', price: 40, slot: 'skin', w: 1, h: 2, tint: '#2fcf9c' },
    { id: 'fb_or', name: 'Teinte dorée', price: 60, slot: 'skin', w: 1, h: 2, tint: '#ffc83d' },
    { id: 'fb_nuit', name: 'Teinte nuit', price: 50, slot: 'skin', w: 1, h: 2, tint: '#3b2c94' }
  ];
  var COLS = 20, ROWS = 13, TILE = 16;
  function isFlat(it) { return !!(it && (it.flat || /tapis|rug/i.test(it.id || ''))); }
  // Objets accrochés au mur (rangées 0 et 1) : poster, horloge, guirlande.
  function isWall(it) { return !!(it && (it.wall || /poster|clock|garland/i.test(it.id || ''))); }
  function footprint(it) {
    var fw = it.fw || Math.max(1, it.w || 1);
    var fh = it.fh || ((isFlat(it) || isWall(it)) ? Math.max(1, it.h || 1) : Math.max(1, (it.h || 1) - 1));   // un meuble haut n'occupe que sa base
    return { w: fw, h: fh };
  }
  // Cases occupées d'un objet posé en (x, y) : le coin haut-gauche de l'emprise.
  function cellsOf(it, x, y) {
    var f = footprint(it), out = [];
    for (var j = 0; j < f.h; j++) for (var i = 0; i < f.w; i++) out.push({ x: x + i, y: y + j });
    return out;
  }
  function layerOf(it) { return isWall(it) ? 'wall' : isFlat(it) ? 'flat' : 'floor'; }
  // Vérifie qu'on peut poser `it` en (x, y). Retourne { ok, why }.
  // ctx : { grid (buildGrid), placed:[{id,x,y}], items(id)->item, pois:[{x,y}], walls:[{x,y,w,h}] (étagères, tableau) }
  function canPlaceAt(it, x, y, ctx, ignoreIdx) {
    if (!it || it.slot !== 'decor') return { ok: false, why: 'Cet objet ne se pose pas dans la salle.' };
    var cells = cellsOf(it, x, y), layer = layerOf(it), i;
    for (i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (c.x < 0 || c.x >= COLS || c.y < 0 || c.y >= ROWS) return { ok: false, why: 'C’est en dehors de la salle.' };
      if (layer === 'wall') {
        if (c.y > 1) return { ok: false, why: 'Cet objet se pose sur le mur du haut.' };
        var hit = (ctx.walls || []).some(function (r) { return c.x >= r.x && c.x < r.x + r.w && c.y >= r.y && c.y < r.y + r.h; });
        if (hit) return { ok: false, why: 'Il y a déjà un meuble ici.' };
      } else {
        if (c.y < 2) return { ok: false, why: 'Pose cet objet sur le sol de la salle.' };
        if (ctx.grid && !ctx.grid.free(c.x, c.y)) return { ok: false, why: 'Il y a déjà un meuble ici.' };
      }
    }
    var taken = {};
    (ctx.placed || []).forEach(function (p, idx) {
      if (idx === ignoreIdx) return;
      var o = ctx.items(p.id); if (!o) return;
      if (layerOf(o) !== layer) return;      // un tapis peut passer sous un meuble
      cellsOf(o, p.x, p.y).forEach(function (cc) { taken[cc.x + ',' + cc.y] = 1; });
    });
    for (i = 0; i < cells.length; i++) if (taken[cells[i].x + ',' + cells[i].y]) return { ok: false, why: 'Il y a déjà un objet ici.' };
    if (layer === 'floor' && ctx.grid && ctx.pois && ctx.pois.length) {
      var blocked = {};
      (ctx.placed || []).forEach(function (p, idx) {
        if (idx === ignoreIdx) return; var o = ctx.items(p.id);
        if (o && layerOf(o) === 'floor') cellsOf(o, p.x, p.y).forEach(function (cc) { blocked[cc.x + ',' + cc.y] = 1; });
      });
      cells.forEach(function (cc) { blocked[cc.x + ',' + cc.y] = 1; });
      if (!allReachable(ctx.grid, blocked, ctx.pois)) return { ok: false, why: 'Ça bloquerait le passage des agents.' };
    }
    return { ok: true, why: '' };
  }
  function allReachable(grid, blocked, pois) {
    var start = pois[0], seen = {}, q = [start], D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    function free(x, y) { return grid.free(x, y) && !blocked[x + ',' + y]; }
    if (!free(start.x, start.y)) return false;
    seen[start.x + ',' + start.y] = 1;
    while (q.length) {
      var c = q.pop();
      for (var i = 0; i < 4; i++) {
        var nx = c.x + D[i][0], ny = c.y + D[i][1], k = nx + ',' + ny;
        if (!seen[k] && free(nx, ny)) { seen[k] = 1; q.push({ x: nx, y: ny }); }
      }
    }
    return pois.every(function (p) { return seen[p.x + ',' + p.y]; });
  }

  /* ---- coach : 4 coachs, 6 situations ---- */
  var COACHES = [
    { id: 'max', name: 'Max', emoji: '🧭', trait: 'Calme et sûr de lui' },
    { id: 'chercheur', name: 'Léa', emoji: '🔎', trait: 'Curieuse et malicieuse' },
    { id: 'developpeur', name: 'Théo', emoji: '💻', trait: 'Blagueur et tranquille' },
    { id: 'designer', name: 'Zoé', emoji: '🎨', trait: 'Énergique et créative' }
  ];
  var COACH_ALIAS = { max: 'max', lea: 'chercheur', 'léa': 'chercheur', chercheur: 'chercheur', theo: 'developpeur', 'théo': 'developpeur', developpeur: 'developpeur',
    zoe: 'designer', 'zoé': 'designer', designer: 'designer' };
  function coachId(v) { return COACH_ALIAS[String(v || '').toLowerCase()] || 'max'; }
  var LINES = {
    max: {
      start: ['On s’y met ? Une petite séance suffit.', 'Je suis là. On commence doucement.', 'Un pas à la fois. C’est parti !', 'Prêt ? Je te suis.'],
      good: ['Beau travail ! Tu progresses bien.', 'Bravo, c’est du solide.', 'Tu as bien retenu. Garde ce rythme.', 'Très bien joué !'],
      bad: ['Ce n’est pas grave. On apprend en se trompant.', 'Pas de souci. On revoit ça ensemble.', 'Une erreur, c’est une information utile.', 'Tu y étais presque. On réessaie quand tu veux.'],
      done: ['Séance terminée. Tu peux être fier de toi.', 'C’est dans la boîte. Bien joué !', 'Mission accomplie. Repose-toi un peu.', 'Chaque séance compte. Merci d’avoir révisé !'],
      streak: ['{n} jours de suite ! Quelle belle habitude.', 'Ta série grandit : {n} jours !', '{n} jours d’affilée. Je suis fier de toi.', 'Tu tiens le rythme : {n} jours !'],
      comeback: ['Content de te revoir ! On reprend tranquillement.', 'Bon retour ! Rien n’est perdu.', 'Te voilà ! Une pause, ça arrive à tout le monde.', 'On repart ensemble, sans pression.']
    },
    chercheur: {
      start: ['Qu’est-ce qu’on va découvrir aujourd’hui ?', 'J’ai hâte de voir ce que tu sais déjà !', 'Allez, on part à la chasse aux bonnes réponses.', 'Un petit tour dans ton cours ?'],
      good: ['Bien vu ! Tu as l’œil.', 'Excellent ! Tu as trouvé le bon fil.', 'Waouh, tu retiens vite !', 'Bravo, belle enquête !'],
      bad: ['Hmm, mystère. Cherchons où ça cloche.', 'Pas grave ! Les erreurs aident à comprendre.', 'On relit l’indice et on retente ?', 'Tout chercheur se trompe. Même moi !'],
      done: ['Enquête terminée ! Tu as bien travaillé.', 'Voilà, tu as fait le tour. Bravo !', 'Quelle belle séance ! Tu l’as bien méritée.', 'Dossier classé pour aujourd’hui.'],
      streak: ['{n} jours de suite ! Tu es un vrai explorateur.', 'Série de {n} jours. Impressionnant !', '{n} jours d’affilée, quelle constance !', 'Tu enchaînes : {n} jours !'],
      comeback: ['Tiens, te revoilà ! Ça me fait plaisir.', 'Bon retour, explorateur ! On reprend ?', 'Une pause, et hop, de retour. Bravo.', 'Je gardais ta place au chaud !']
    },
    developpeur: {
      start: ['Allez, on lance le programme !', 'Prêt à faire tourner ce cerveau ?', 'Je démarre la machine. Toi aussi ?', 'Mode révision : activé.'],
      good: ['Ça compile ! Tu as tout bon.', 'Zéro bug, bravo !', 'Propre et efficace. J’adore.', 'Excellent, ton cerveau tourne à fond !'],
      bad: ['Un petit bug, rien de grave. On corrige !', 'Erreur 404 : réponse introuvable. On réessaie ?', 'Même les meilleurs codeurs ont des bugs.', 'On relance et ça ira mieux.'],
      done: ['Programme terminé sans plantage. Bravo !', 'Séance enregistrée. Tu peux souffler.', 'Mission réussie. Ctrl+S sur ton cerveau !', 'Fin de la séance. Beau boulot.'],
      streak: ['{n} jours de suite ! Un vrai script qui tourne.', 'Série de {n} jours. Aucun bug !', '{n} jours d’affilée. La classe.', 'Tu bats ton record : {n} jours !'],
      comeback: ['Rebonjour ! Le serveur t’attendait.', 'Bon retour ! On redémarre en douceur.', 'Pause terminée, on relance !', 'Pas de panique, rien n’a été perdu.']
    },
    designer: {
      start: ['On met de la couleur dans ta journée ?', 'C’est parti, on révise avec le sourire !', 'Hop hop hop, on s’y met !', 'Prêt·e à briller ?'],
      good: ['Magnifique ! C’est un chef-d’œuvre !', 'Waouh, bravo, c’est super !', 'Tu rayonnes ! Continue comme ça.', 'Génial, tu as tout compris !'],
      bad: ['Oups, pas de panique ! On essaie autrement.', 'Même un brouillon rate parfois. On recommence !', 'Une erreur, un nouveau coup de crayon.', 'Courage ! La prochaine sera plus belle.'],
      done: ['Quelle belle séance ! Bravo !', 'Terminé ! Tu peux être très fier·e.', 'Bravo, tu as colorié ta journée !', 'C’est fini, tu as assuré !'],
      streak: ['{n} jours de suite, c’est magnifique !', 'Ta série brille : {n} jours !', '{n} jours d’affilée ! Bravo, artiste !', 'Waouh, {n} jours consécutifs !'],
      comeback: ['Te voilà ! Ça me rend super contente.', 'Bon retour ! On repart avec le sourire.', 'Une pause ? Pas de souci, on reprend.', 'Contente de te revoir !']
    }
  };
  var SITUATIONS = ['start', 'good', 'bad', 'done', 'streak', 'comeback'];
  function asciiKey(s) { return String(s || '').toLowerCase().normalize ? String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') : String(s || '').toLowerCase(); }
  // Cherche les phrases dans Studio.content.subjects.coachLines (formats acceptés : [coach][situation] ou [situation][coach] ou [situation]).
  function extLines(ext, id, sit) {
    if (!ext || typeof ext !== 'object') return null;
    var c = COACHES.filter(function (x) { return x.id === id; })[0];
    var keys = [id, c && c.name, c && c.name.toLowerCase(), c && asciiKey(c.name)];
    var i, k, v;
    for (i = 0; i < keys.length; i++) {
      k = keys[i]; if (!k || !ext[k]) continue;
      v = ext[k][sit]; if (Array.isArray(v) && v.length) return v;
    }
    v = ext[sit];
    if (Array.isArray(v) && v.length) return v;
    if (v && typeof v === 'object') for (i = 0; i < keys.length; i++) { if (keys[i] && Array.isArray(v[keys[i]]) && v[keys[i]].length) return v[keys[i]]; }
    return null;
  }
  var lastLine = {};
  function pickLine(id, sit, ext, vars, rng) {
    if (SITUATIONS.indexOf(sit) < 0) sit = 'done';
    var arr = extLines(ext, id, sit) || (LINES[id] || LINES.max)[sit];
    var key = id + ':' + sit, i = Math.floor((rng || Math.random)() * arr.length);
    if (arr.length > 1 && lastLine[key] === i) i = (i + 1) % arr.length;
    lastLine[key] = i;
    var t = String(arr[i]);
    Object.keys(vars || {}).forEach(function (k) { t = t.split('{' + k + '}').join(vars[k]); });
    return t;
  }

  var logic = {
    dayNum: dayNum, keyFromNum: keyFromNum, weekKey: weekKey, xpForLevel: xpForLevel, levelFromXp: levelFromXp,
    newStreak: newStreak, advanceStreak: advanceStreak, restAvailable: restAvailable, streakPreview: streakPreview,
    QUEST_POOL: QUEST_POOL, pickQuests: pickQuests, questById: questById,
    DAILY_COIN_CAP: DAILY_COIN_CAP, EVENT_CAP: EVENT_CAP, coinRule: coinRule, newState: newState, normalizeState: normalizeState,
    ensureDay: ensureDay, applyActivity: applyActivity, BADGES: BADGES, mergeBadges: mergeBadges, checkBadges: checkBadges,
    FALLBACK_ITEMS: FALLBACK_ITEMS, footprint: footprint, cellsOf: cellsOf, canPlaceAt: canPlaceAt, isFlat: isFlat, isWall: isWall, layerOf: layerOf,
    COACHES: COACHES, LINES: LINES, SITUATIONS: SITUATIONS, pickLine: pickLine, coachId: coachId
  };
  Studio.gameLogic = logic;
  if (typeof module !== 'undefined' && module.exports) module.exports = logic;
  if (typeof document === 'undefined' || !Studio.store || !Studio.bus) return;

  /* =====================================================================
   * 2. ÉTAT, ENVELOPPE DES STATS, ÉVÉNEMENTS
   * ===================================================================== */
  var S = normalizeState(Studio.store.get('game', null));
  var listeners = [];
  function save() { Studio.store.set('game', S); }
  function notify() { listeners.slice().forEach(function (fn) { try { fn(S); } catch (e) { /* un écouteur ne doit jamais casser le jeu */ } }); }
  function settings() { return Studio.store.get('settings', {}) || {}; }
  function effectsOn() { return settings().gameEffects !== false; }
  function reduced() { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function statsXp() { try { return (Studio.stats && Studio.stats.get().xp) || 0; } catch (e) { return 0; } }
  function curLevel() { return levelFromXp(statsXp()); }
  function badgeList() { return mergeBadges(Studio.content && Studio.content.subjects && Studio.content.subjects.badges); }

  var rawAddXp = null;
  function bonusXp(n) { if (n > 0 && Studio.stats) { if (rawAddXp) rawAddXp(n); else Studio.stats.addXp(n); } }

  /* ---- boutique : catalogue ---- */
  function items() {
    var ext = Studio.skins && Studio.skins.items;
    var ok = Array.isArray(ext) ? ext.filter(function (i) { return i && i.id && /^(decor|hat|skin)$/.test(i.slot) && typeof i.price === 'number'; }) : [];
    return ok.length ? ok : FALLBACK_ITEMS;
  }
  function itemById(id) { var l = items(); for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; }
  function owned(id) { return S.inv[id] || 0; }
  function placedCount(id) { return S.placed.filter(function (p) { return p.id === id; }).length; }

  /* ---- images des objets (sprite du designer si présent, sinon dessin de secours) ---- */
  var imgCache = {};
  function spriteData(name) {
    return (Studio.skins && Studio.skins.sprites && Studio.skins.sprites[name]) || (Studio.sprites && Studio.sprites[name]) || null;
  }
  function renderSprite(s, f) {
    var rows = s && s.frames && (s.frames[f || 0] || s.frames[0]);
    if (!rows || !rows.length) return null;
    var w = 0; rows.forEach(function (r) { if (r.length > w) w = r.length; });
    var c = document.createElement('canvas'); c.width = w; c.height = rows.length;
    var g = c.getContext('2d'), pal = s.pal || {};
    for (var y = 0; y < rows.length; y++) for (var x = 0; x < rows[y].length; x++) {
      var col = pal[rows[y].charAt(x)];
      if (rows[y].charAt(x) === '.' || !col) continue;
      g.fillStyle = col; g.fillRect(x, y, 1, 1);
    }
    return { c: c, w: w, h: rows.length };
  }
  // Dimensions en pixels d'un objet (decor : w,h en cases ; chapeau : 16x8 ; look : 16x24).
  function pixelSize(it) { return it.slot === 'hat' ? { w: 16, h: 8 } : it.slot === 'skin' ? { w: 16, h: 24 } : { w: (it.w || 1) * 16, h: (it.h || 1) * 16 }; }
  function fallbackCanvas(it) {
    var d = pixelSize(it), w = d.w, h = d.h, c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d');
    if (it.tint) {                                    // aperçu d'une teinte : petit personnage coloré
      g.fillStyle = it.tint; g.fillRect(4, 10, 8, 12); g.fillStyle = '#f2c9a0'; g.fillRect(5, 3, 6, 6);
      g.fillStyle = '#2b1d2a'; g.fillRect(5, 2, 6, 2); g.fillRect(6, 6, 1, 1); g.fillRect(9, 6, 1, 1);
      return { c: c, w: w, h: h };
    }
    if (isFlat(it) || it.color) {
      g.fillStyle = it.color || '#c9c3e0'; g.fillRect(0, isFlat(it) ? 2 : h - 16, w, isFlat(it) ? h - 4 : 16);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, isFlat(it) ? 2 : h - 16, w, 2);
      g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(0, h - 2, w, 2);
    }
    if (it.emoji) {
      var fs = Math.round(Math.min(w, h) * (it.slot === 'hat' ? 1 : it.color ? 0.75 : 0.9));
      g.font = fs + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(it.emoji, w / 2, it.slot === 'decor' ? h - 9 : h / 2 + 1);
    }
    return { c: c, w: w, h: h };
  }
  function frameCount(it) { return Math.max(1, it.frames || 1); }
  // { c: canvas, w, h } pour un objet de la boutique (frame : image d'animation, ex. aquarium).
  function itemCanvas(it, frame) {
    if (!it) return null;
    var f = frame ? frame % frameCount(it) : 0, k = it.id + '#' + f;
    if (imgCache[k]) return imgCache[k];
    var r = null;
    try {
      var data = (it.slot === 'skin' && Studio.skins && Studio.skins.skinned) ? Studio.skins.skinned(it.id, it.sprite) : (it.sprite ? spriteData(it.sprite) : null);
      r = data ? renderSprite(data, f) : null;
    } catch (e) { r = null; }
    if (!r) { try { r = fallbackCanvas(it); } catch (e2) { r = null; } }
    if (r) imgCache[k] = r;
    return r;
  }
  // Sprite nommé (avatar de coach, badge) dessiné dans un <canvas> ; repli : emoji.
  function spriteEl(name, cls, fallbackEmoji) {
    var r = null;
    try { r = renderSprite(spriteData(name), 0); } catch (e) { r = null; }
    if (!r) return h('span', { class: cls, 'aria-hidden': 'true' }, fallbackEmoji || '•');
    var c = h('canvas', { class: cls + ' game-sprite', width: r.w, height: r.h, 'aria-hidden': 'true' });
    var g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(r.c, 0, 0);
    return c;
  }
  var COACH_SPR = { max: 'coach_max', chercheur: 'coach_lea', developpeur: 'coach_theo', designer: 'coach_zoe' };
  function coachAvatar(id, cls) { return spriteEl(COACH_SPR[id] || 'coach_max', cls || 'game-avatar', (COACHES.filter(function (c) { return c.id === id; })[0] || COACHES[0]).emoji); }
  function badgeIcon(b, cls) { return spriteEl(b.spr || '', cls || 'game-badge-ico', b.icon); }

  /* ---- placement ---- */
  var gridCache = null, poiCache = null;
  function baseGrid() {
    if (!gridCache && Studio.officeLogic) gridCache = Studio.officeLogic.buildGrid();
    return gridCache;
  }
  function pois() {
    if (poiCache) return poiCache;
    var L = Studio.officeLogic; if (!L) return [];
    var out = [{ x: 10, y: 6 }];
    Object.keys(L.POI).forEach(function (k) { L.POI[k].forEach(function (t) { out.push(t); }); });
    L.ROLES.forEach(function (r) { out.push(L.seatOf(r)); });
    poiCache = out; return out;
  }
  function placeCtx() {
    var F = Studio.officeLogic && Studio.officeLogic.FURNITURE, walls = [];
    if (F) { (F.shelves || []).forEach(function (r) { walls.push(r); }); if (F.whiteboard) walls.push(F.whiteboard); }
    return { grid: baseGrid(), placed: S.placed, items: itemById, pois: pois(), walls: walls };
  }
  function canPlace(id, x, y, ignoreIdx) {
    var it = itemById(id);
    if (!it) return { ok: false, why: 'Objet inconnu.' };
    var left = owned(id) - placedCount(id) + (ignoreIdx != null ? 1 : 0);
    if (left <= 0) return { ok: false, why: 'Tu n’as plus cet objet en stock.' };
    return canPlaceAt(it, x, y, placeCtx(), ignoreIdx);
  }
  // Cases bloquantes pour les agents (les tapis ne bloquent pas) : utilisé par office.js.
  function blockedCells() {
    var out = [];
    S.placed.forEach(function (p) { var it = itemById(p.id); if (it && layerOf(it) === 'floor') out = out.concat(cellsOf(it, p.x, p.y)); });
    return out;
  }

  /* ---- coach ---- */
  function coachObj() {
    var id = coachId(settings().coach), c = COACHES.filter(function (x) { return x.id === id; })[0] || COACHES[0];
    var info = Studio.officeLogic && Studio.officeLogic.INFO && Studio.officeLogic.INFO[c.id];
    return { id: c.id, name: (info && info.name) || c.name, emoji: (info && info.icon) || c.emoji, trait: c.trait,
      say: function (situation, vars) { return pickLine(c.id, situation, Studio.content && Studio.content.subjects && Studio.content.subjects.coachLines, vars); } };
  }

  /* ---- bulles et fêtes ---- */
  var bubbleHost = null, bubbleQueue = [], bubbleShowing = false;
  function ensureBubbleHost() {
    if (bubbleHost && bubbleHost.isConnected) return bubbleHost;
    bubbleHost = h('div', { class: 'game-bubbles', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(bubbleHost);
    return bubbleHost;
  }
  function showNext() {
    if (bubbleShowing || !bubbleQueue.length) return;
    var b = bubbleQueue.shift(); bubbleShowing = true;
    var host = ensureBubbleHost(), done = false;
    var node = h('div', { class: 'game-bubble' + (b.kind ? ' is-' + b.kind : '') + (reduced() ? ' is-static' : '') }, [
      b.coachId ? coachAvatar(b.coachId, 'game-bubble-avatar') : b.spr ? spriteEl(b.spr, 'game-bubble-avatar', b.icon) : h('span', { class: 'game-bubble-avatar', 'aria-hidden': 'true' }, b.icon || '💬'),
      h('span', { class: 'game-bubble-body' }, [
        b.title ? h('strong', { class: 'game-bubble-title' }, b.title) : null,
        h('span', { class: 'game-bubble-text' }, b.text || ''),
        b.chips && b.chips.length ? h('span', { class: 'game-bubble-chips' }, b.chips.map(function (c) { return h('span', { class: 'chip' }, c); })) : null
      ]),
      h('button', { type: 'button', class: 'game-bubble-close', 'aria-label': 'Fermer ce message', onclick: close }, '×')
    ]);
    host.appendChild(node);
    var timer = setTimeout(close, b.ms || 6500);
    function close() {
      if (done) return; done = true; clearTimeout(timer);
      if (node.parentNode) node.parentNode.removeChild(node);
      bubbleShowing = false; setTimeout(showNext, 250);
    }
  }
  function bubble(b) {
    if (!effectsOn()) return;
    if (bubbleQueue.length >= 4) bubbleQueue.shift();
    bubbleQueue.push(b); showNext();
  }
  function party() { if (effectsOn() && Studio.ui && Studio.ui.confetti) { try { Studio.ui.confetti(); } catch (e) { /* facultatif */ } } }

  /* ---- traitement d'une activité ---- */
  var recent = {};           // anti-doublon : même activité vue par deux chemins (modes + enveloppe/gen:end)
  var lastActivityAt = 0;
  function handle(d, src) {
    if (!d || TYPES.indexOf(d.type) < 0) return null;
    var now = Date.now(), key = d.type;
    if (src !== 'touch' && recent[key] && recent[key].src !== src && now - recent[key].t < 4000) { recent[key] = { t: now, src: recent[key].src }; return null; }
    recent[key] = { t: now, src: src };
    lastActivityAt = now;
    var today = todayKey(), before = S.lastLevel || curLevel().level;
    var res = applyActivity(S, d, today, { xp: statsXp() }, badgeList());
    if (res.ignored) return null;
    bonusXp(res.xp);
    var lv = curLevel();
    var levelUp = lv.level > before;
    if (lv.level !== S.lastLevel) S.lastLevel = lv.level;
    var late = checkBadges(S, { level: lv.level }, today, badgeList());   // badges de niveau
    res.badges = res.badges.concat(late);
    save(); notify();
    try { Studio.bus.emit('stats:changed', Studio.stats.get()); } catch (e) { /* rafraîchit la série de la barre latérale */ }
    announce(d, res, levelUp ? lv.level : 0);
    return res;
  }
  function announce(d, res, newLevel) {
    var coach = coachObj(), sit = 'done', chips = [];
    if (res.coins) chips.push('+' + res.coins + ' 💰');
    var st = res.streak && res.streak.event, n = S.streak.count;
    if ((st === 'rested' || st === 'softreset') ) sit = 'comeback';
    else if (st === 'next' && [3, 5, 7, 10, 14, 21, 30, 50, 100].indexOf(n) >= 0) sit = 'streak';
    var text = coach.say(sit, { n: n });
    if (st === 'rested') text += ' Ton jour de repos a protégé ta série.';
    else if (st === 'softreset') text += ' Ta série continue : ' + n + ' jours.';
    if (res.capped && !res.coins) text = 'Tu as déjà gagné beaucoup de pièces aujourd’hui. Reviens demain !';
    bubble({ text: text, chips: chips, kind: 'coach', coachId: coach.id });
    res.quests.forEach(function (q) { bubble({ title: 'Quête réussie !', text: q.label + '  ·  +' + q.coins + ' 💰', icon: '🎯', spr: 'badge_target', kind: 'quest', ms: 6000 }); party(); });
    res.badges.forEach(function (b) { bubble({ title: 'Nouveau badge : ' + b.name, text: b.desc, icon: b.icon, spr: b.spr, kind: 'badge', ms: 6500 }); });
    if (newLevel) { bubble({ title: 'Niveau ' + newLevel + ' !', text: 'Bravo, tu montes de niveau.', icon: '⭐', spr: 'badge_star', kind: 'level', ms: 6500 }); party(); }
  }

  // Enveloppe de Studio.stats : on ne rate rien, même si un mode n'émet pas 'activity'.
  var wrapped = false;
  function wrapStats() {
    if (wrapped || !Studio.stats || Studio.stats.__gameWrapped) return;
    wrapped = true; Studio.stats.__gameWrapped = true;
    var rawTouch = Studio.stats.touch, rawXp = Studio.stats.addXp, rawScore = Studio.stats.addQuizScore;
    rawAddXp = function (n) { return rawXp.call(Studio.stats, n); };
    Studio.stats.touch = function (n) {
      var r = rawTouch.apply(Studio.stats, arguments), cnt = n == null ? 1 : n, t = Date.now();
      // La série douce avance dès qu'on étudie. Les pièces viennent de 'activity' ; sinon, filet de sécurité 0,7 s plus tard.
      setTimeout(function () {
        if (lastActivityAt >= t) return;
        handle({ type: 'cards', count: cnt }, 'touch');
      }, 700);
      return r;
    };
    Studio.stats.addXp = function () {
      var r = rawXp.apply(Studio.stats, arguments);
      var lv = curLevel();
      if (lv.level !== S.lastLevel) {
        var up = lv.level > (S.lastLevel || 1); S.lastLevel = lv.level;
        var won = checkBadges(S, { level: lv.level }, todayKey(), badgeList());
        save();
        if (up) { bubble({ title: 'Niveau ' + lv.level + ' !', text: 'Bravo, tu montes de niveau.', icon: '⭐', spr: 'badge_star', kind: 'level' }); party(); }
        won.forEach(function (b) { bubble({ title: 'Nouveau badge : ' + b.name, text: b.desc, icon: b.icon, spr: b.spr, kind: 'badge' }); });
      }
      notify();
      return r;
    };
    if (rawScore) Studio.stats.addQuizScore = function () { var r = rawScore.apply(Studio.stats, arguments); notify(); return r; };
  }

  var KIND_MAP = { mnemonics: 'mnemo', mindmap: 'mindmap' };
  Studio.bus.on('activity', function (d) { if (d) handle(d, 'activity'); });
  Studio.bus.on('gen:end', function (d) {
    if (!d || d.ok === false) return;
    if (KIND_MAP[d.kind]) handle({ type: KIND_MAP[d.kind] }, 'gen');
  });

  /* ---- API publique ---- */
  function questsView() {
    var today = todayKey(); ensureDay(S, today);
    var day = S.days[today];
    return S.quests.ids.map(function (id) {
      var q = questById(id), p = Math.min(q.target, (day.n[q.stat] || 0));
      return { id: q.id, label: q.label, target: q.target, progress: p, done: !!S.quests.done[id], coins: q.coins, xp: q.xp };
    });
  }
  function badgesView() {
    var lv = curLevel();
    return badgeList().map(function (b) {
      var v = statValue(S, { level: lv.level }, b.stat);
      return { id: b.id, name: b.name, desc: b.desc, icon: b.icon, spr: b.spr, earned: !!S.badges[b.id], date: S.badges[b.id] || '', progress: Math.min(b.target, v), target: b.target };
    });
  }
  function streakView() {
    var today = todayKey(), p = streakPreview(S.streak, today);
    var v = { count: p.count, best: S.streak.best || 0, status: p.status, restAvailable: restAvailable(S.streak, today), studiedToday: S.streak.last === today };
    Object.defineProperty(v, 'valueOf', { value: function () { return v.count; } });   // Number(Studio.game.streak()) = nombre de jours
    return v;
  }
  function buy(id) {
    var it = itemById(id);
    if (!it) return { ok: false, why: 'Objet inconnu.' };
    if (it.slot !== 'decor' && owned(id) >= 1) return { ok: false, why: 'Tu l’as déjà.' };
    if (S.coins < it.price) return { ok: false, why: 'Il te manque ' + (it.price - S.coins) + ' pièces.' };
    S.coins -= it.price; S.spent += it.price; S.inv[id] = owned(id) + 1; S.bought = (S.bought || 0) + 1;
    var won = checkBadges(S, { level: curLevel().level }, todayKey(), badgeList());
    save(); notify();
    won.forEach(function (b) { bubble({ title: 'Nouveau badge : ' + b.name, text: b.desc, icon: b.icon, spr: b.spr, kind: 'badge' }); });
    return { ok: true };
  }
  function place(id, x, y) {
    var r = canPlace(id, x, y);
    if (!r.ok) return r;
    S.placed.push({ id: id, x: x, y: y });
    var won = checkBadges(S, { level: curLevel().level }, todayKey(), badgeList());
    save(); notify();
    won.forEach(function (b) { bubble({ title: 'Nouveau badge : ' + b.name, text: b.desc, icon: b.icon, spr: b.spr, kind: 'badge' }); });
    return { ok: true };
  }
  function unplace(idx) { if (idx >= 0 && idx < S.placed.length) { S.placed.splice(idx, 1); save(); notify(); return true; } return false; }
  function equip(slot, role, id) {
    if (slot !== 'hat' && slot !== 'skin') return false;
    if (id && (!itemById(id) || owned(id) < 1 || itemById(id).slot !== slot || (itemById(id).role && itemById(id).role !== role))) return false;
    if (id) S.equipped[slot][role] = id; else delete S.equipped[slot][role];
    save(); notify(); return true;
  }
  function itemFor(slot, role) { var id = S.equipped[slot] && S.equipped[slot][role]; return id ? itemById(id) : null; }
  function setCoach(id) {
    var st = settings(); st.coach = coachId(id); Studio.store.set('settings', st);
    Studio.bus.emit('settings:changed', st); notify();
  }

  Studio.game = {
    award: function (kind, n) {
      var d = (n && typeof n === 'object') ? Object.assign({ type: kind }, n) : { type: kind, count: n == null ? 1 : n };
      return handle(d, 'award');
    },
    coins: function () { return S.coins; },
    level: function () { return curLevel(); },
    quests: questsView, badges: badgesView, streak: streakView, coach: coachObj,
    onChange: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (f) { return f !== fn; }); }; },
    get state() { return S; },
    coachAvatar: coachAvatar, badgeIcon: badgeIcon, effectsOn: effectsOn, items: items, itemById: itemById, itemCanvas: itemCanvas, itemFor: itemFor,
    owned: owned, placedCount: placedCount, blockedCells: blockedCells, canPlace: canPlace, buy: buy, place: place, unplace: unplace,
    equip: equip, setCoach: setCoach, coaches: function () { return COACHES.slice(); }, say: function (s, v) { return coachObj().say(s, v); },
    bubble: bubble, reload: function () { S = normalizeState(Studio.store.get('game', null)); notify(); },
    DAILY_COIN_CAP: DAILY_COIN_CAP, logic: logic
  };

  /* =====================================================================
   * 3. INTERFACE
   * ===================================================================== */
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k]; if (v == null || v === false) return;
      if (k === 'class') e.className = v; else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
    });
    [].concat(kids == null ? [] : kids).forEach(function (c) { if (c == null) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }

  /* ---- barre de niveau + pièces dans la sidebar ---- */
  var widget = null, wLevel, wBar, wFill, wCoins, wXp;
  function ensureWidget() {
    if (widget && widget.isConnected) return;
    var footer = document.getElementById('sidebar-footer') || document.querySelector('.sidebar-footer');
    var sb = document.getElementById('sidebar') || document.querySelector('.sidebar');
    var host = footer || sb;
    if (!host) return;
    wLevel = h('span', { class: 'game-w-level' }); wCoins = h('span', { class: 'game-w-coins' }); wXp = h('span', { class: 'game-w-xp small muted' });
    wFill = h('div', { class: 'progress-bar' });
    wBar = h('div', { class: 'progress progress-sm', role: 'progressbar', 'aria-label': 'Progression vers le prochain niveau', 'aria-valuemin': '0', 'aria-valuemax': '100' }, wFill);
    widget = h('a', { class: 'game-widget', href: '#/room', 'aria-label': 'Mon bureau : niveau et pièces' },
      [h('div', { class: 'game-w-row' }, [wLevel, wCoins]), wBar, wXp]);
    host.insertBefore(widget, host.firstChild);
    renderWidget();
  }
  function renderWidget() {
    if (!widget) return;
    var lv = curLevel();
    wLevel.textContent = '⭐ Niveau ' + lv.level;
    wCoins.textContent = '💰 ' + S.coins;
    wFill.style.width = lv.pct + '%';
    wBar.setAttribute('aria-valuenow', String(lv.pct));
    wXp.textContent = lv.into + ' / ' + lv.need + ' XP';
    widget.setAttribute('aria-label', 'Mon bureau : niveau ' + lv.level + ', ' + S.coins + ' pièces, ' + lv.into + ' sur ' + lv.need + ' XP');
  }
  Studio.game.onChange(function () { ensureWidget(); renderWidget(); });
  Studio.bus.on('stats:changed', function () { ensureWidget(); renderWidget(); });
  Studio.bus.on('nav', function () { ensureWidget(); renderWidget(); });

  /* ---- réglages : effets de jeu + coach ---- */
  Studio.settingsSections = Studio.settingsSections || [];
  Studio.settingsSections.push({
    id: 'game', title: 'Jeu et coach',
    render: function (box) {
      var cb = h('input', { type: 'checkbox', id: 'set-game-effects' });
      cb.checked = effectsOn();
      cb.addEventListener('change', function () { var st = settings(); st.gameEffects = cb.checked; Studio.store.set('settings', st); notify(); });
      box.appendChild(h('label', { class: 'game-set-row', for: 'set-game-effects' }, [cb, h('span', null, ' Effets de jeu (confettis, messages du coach, fêtes)')]));
      box.appendChild(h('p', { class: 'small muted' }, 'Si tu les désactives, tu gardes tes pièces et ton niveau, mais sans les animations ni les messages.'));
      var sel = h('select', { class: 'select', id: 'set-game-coach', 'aria-label': 'Ton coach' }, COACHES.map(function (c) {
        return h('option', { value: c.id, selected: coachId(settings().coach) === c.id ? 'selected' : null }, c.emoji + ' ' + (coachObjFor(c.id).name));
      }));
      sel.addEventListener('change', function () { setCoach(sel.value); });
      box.appendChild(h('label', { class: 'small muted', for: 'set-game-coach' }, 'Ton coach'));
      box.appendChild(sel);
    }
  });
  function coachObjFor(id) {
    var info = Studio.officeLogic && Studio.officeLogic.INFO && Studio.officeLogic.INFO[id], c = COACHES.filter(function (x) { return x.id === id; })[0];
    return { name: (info && info.name) || c.name, emoji: (info && info.icon) || c.emoji };
  }

  /* ---- module « Mon bureau » ---- */
  var roomCleanup = null;
  function renderRoom(container) {
    if (roomCleanup) { roomCleanup(); roomCleanup = null; }
    var tab = 'shop', filter = 'decor', placing = null, cursor = { x: 10, y: 8 }, offs = [], roomView = null;
    var L = Studio.officeLogic;

    var coinsEl = h('span', { class: 'chip game-room-coins', 'aria-live': 'polite' });
    var levelEl = h('span', { class: 'chip' });
    container.appendChild(h('div', { class: 'page-header' }, [
      h('div', null, [h('h1', null, '🪴 Mon bureau'), h('p', { class: 'text-muted muted' }, 'Gagne des pièces en révisant. Achète des objets et décore ton bureau.')]),
      h('div', { class: 'page-actions game-room-head' }, [levelEl, coinsEl])
    ]));

    var msg = h('p', { class: 'game-room-msg small', role: 'status', 'aria-live': 'polite' });
    var board = h('div', { class: 'room-board' });
    var overlay = h('div', { class: 'room-overlay', tabindex: '-1', role: 'application', 'aria-label': 'Choisis où poser l’objet : flèches pour bouger, Entrée pour poser, Échap pour annuler' });
    var ghost = h('div', { class: 'room-ghost' });
    overlay.appendChild(ghost);
    var banner = h('div', { class: 'room-banner', hidden: 'hidden' });
    var left = h('div', { class: 'room-left' }, [board, banner, msg]);
    var panel = h('div', { class: 'room-panel card' });
    container.appendChild(h('div', { class: 'room-layout' }, [left, panel]));

    if (Studio.office && Studio.office.mountRoom) {
      roomView = Studio.office.mountRoom(board, { focusable: false, maxFrac: 0.6, label: 'Aperçu de ton bureau avec les objets que tu as placés.' });
      board.appendChild(overlay);
      if (root.ResizeObserver) { var ro = new ResizeObserver(align); ro.observe(board); ro.observe(roomView.canvas); offs.push(function () { ro.disconnect(); }); }
      setTimeout(align, 60);
    } else board.appendChild(h('p', { class: 'muted' }, 'L’aperçu du bureau n’est pas disponible.'));

    function align() {
      if (!roomView) return;
      var c = roomView.canvas;
      overlay.style.left = c.offsetLeft + 'px'; overlay.style.top = c.offsetTop + 'px';
      overlay.style.width = c.offsetWidth + 'px'; overlay.style.height = c.offsetHeight + 'px';
      updateGhost();
    }
    function say(t, bad) { msg.textContent = t || ''; msg.className = 'game-room-msg small' + (bad ? ' is-bad' : ''); }

    /* --- placement --- */
    function updateGhost() {
      if (!placing) { ghost.hidden = true; return; }
      var it = itemById(placing.id), f = footprint(it), ok = canPlace(placing.id, cursor.x, cursor.y).ok;
      ghost.hidden = false;
      ghost.style.left = (cursor.x / COLS * 100) + '%'; ghost.style.top = (cursor.y / ROWS * 100) + '%';
      ghost.style.width = (f.w / COLS * 100) + '%'; ghost.style.height = (f.h / ROWS * 100) + '%';
      ghost.className = 'room-ghost ' + (ok ? 'is-ok' : 'is-bad');
    }
    function startPlacing(id) {
      placing = { id: id };
      overlay.classList.add('is-active'); banner.hidden = false;
      var it = itemById(id);
      banner.textContent = 'Pose « ' + it.name + ' » : clique sur une case, ou flèches puis Entrée. Échap pour annuler.';
      cursor = { x: Math.min(cursor.x, COLS - 1), y: Math.max(2, cursor.y) };
      updateGhost(); overlay.focus({ preventScroll: true });
      say('');
    }
    function stopPlacing() { placing = null; overlay.classList.remove('is-active'); banner.hidden = true; updateGhost(); }
    function tryPlace() {
      if (!placing) return;
      var id = placing.id, r = place(id, cursor.x, cursor.y);
      if (!r.ok) { say(r.why, true); return; }
      say('Posé ! Ton bureau est plus joli.');
      if (owned(id) - placedCount(id) <= 0) stopPlacing(); else updateGhost();
    }
    function cellFromEvent(e) {
      var r = overlay.getBoundingClientRect();
      return { x: Math.max(0, Math.min(COLS - 1, Math.floor((e.clientX - r.left) / r.width * COLS))), y: Math.max(0, Math.min(ROWS - 1, Math.floor((e.clientY - r.top) / r.height * ROWS))) };
    }
    overlay.addEventListener('mousemove', function (e) { if (!placing) return; cursor = cellFromEvent(e); updateGhost(); });
    overlay.addEventListener('click', function (e) { if (!placing) return; cursor = cellFromEvent(e); updateGhost(); tryPlace(); });
    overlay.addEventListener('keydown', function (e) {
      if (!placing) return;
      var k = e.key, d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
      if (d) { cursor = { x: Math.max(0, Math.min(COLS - 1, cursor.x + d[0])), y: Math.max(2, Math.min(ROWS - 1, cursor.y + d[1])) }; updateGhost(); e.preventDefault(); }
      else if (k === 'Enter' || k === ' ') { tryPlace(); e.preventDefault(); }
      else if (k === 'Escape') { stopPlacing(); e.preventDefault(); }
    });

    /* --- onglets --- */
    var TABS = [['shop', '🛍️ Boutique'], ['stock', '🎒 Mon stock'], ['team', '🧑‍🤝‍🧑 Équipe'], ['coach', '🧭 Coach'], ['quests', '🎯 Quêtes'], ['badges', '🏅 Badges']];
    var tabBar = h('div', { class: 'room-tabs', role: 'tablist', 'aria-label': 'Sections de Mon bureau' });
    var tabBtns = {};
    TABS.forEach(function (t) {
      var b = h('button', { type: 'button', class: 'chip room-tab', role: 'tab', id: 'room-tab-' + t[0], onclick: function () { tab = t[0]; renderPanel(); b.focus(); } }, t[1]);
      b.addEventListener('keydown', function (e) {
        var i = TABS.map(function (x) { return x[0]; }).indexOf(t[0]), n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
        if (n == null) return; n = (n + TABS.length) % TABS.length; tab = TABS[n][0]; renderPanel(); tabBtns[tab].focus(); e.preventDefault();
      });
      tabBtns[t[0]] = b; tabBar.appendChild(b);
    });
    var body = h('div', { class: 'room-body', role: 'tabpanel' });
    panel.appendChild(tabBar); panel.appendChild(body);

    function thumb(it) {
      var r = itemCanvas(it), c = h('canvas', { class: 'room-thumb', width: r ? r.w : 16, height: r ? r.h : 16, 'aria-hidden': 'true' });
      if (r) { var g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(r.c, 0, 0); }
      return c;
    }
    function empty(t) { return h('p', { class: 'muted' }, t); }

    function shopView() {
      var chips = h('div', { class: 'chip-list', role: 'group', 'aria-label': 'Catégorie' }, [['decor', 'Décors'], ['hat', 'Chapeaux'], ['skin', 'Looks']].map(function (f) {
        return h('button', { type: 'button', class: 'chip' + (filter === f[0] ? ' is-active' : ''), 'aria-pressed': filter === f[0] ? 'true' : 'false', onclick: function () { filter = f[0]; renderPanel(); } }, f[1]);
      }));
      var list = items().filter(function (i) { return i.slot === filter; });
      var grid = h('div', { class: 'room-items' }, list.map(function (it) {
        var have = owned(it.id), single = it.slot !== 'decor', can = S.coins >= it.price && !(single && have);
        var btn = h('button', { type: 'button', class: 'btn btn-sm ' + (can ? 'btn-primary' : 'btn-ghost'), 'aria-disabled': can ? null : 'true',
          onclick: function () {
            if (!can) { say(single && have ? 'Tu as déjà cet objet.' : 'Il te manque ' + (it.price - S.coins) + ' pièces. Continue à réviser !', true); return; }
            var r = buy(it.id); say(r.ok ? 'Acheté : ' + it.name + ' ! Retrouve-le dans « Mon stock ».' : r.why, !r.ok);
          } }, single && have ? 'Déjà à toi' : '💰 ' + it.price);
        return h('div', { class: 'room-item' }, [thumb(it), h('div', { class: 'room-item-name' }, it.name),
          have ? h('span', { class: 'badge badge-mint' }, single ? 'Possédé' : 'x' + have) : null, btn]);
      }));
      return [chips, list.length ? grid : empty('Rien dans cette catégorie pour le moment.')];
    }
    function stockView() {
      var decor = items().filter(function (i) { return i.slot === 'decor' && owned(i.id) > 0; });
      var out = [h('h3', null, 'Objets à poser')];
      if (!decor.length) out.push(empty('Tu n’as pas encore de décor. Va faire un tour à la boutique !'));
      decor.forEach(function (it) {
        var rest = owned(it.id) - placedCount(it.id);
        out.push(h('div', { class: 'room-row' }, [thumb(it), h('span', { class: 'room-row-name' }, it.name + ' (' + rest + ' à poser)'),
          h('button', { type: 'button', class: 'btn btn-sm btn-primary', 'aria-disabled': rest > 0 ? null : 'true',
            onclick: function () { if (rest > 0) startPlacing(it.id); else say('Tout est déjà posé. Retire-en un pour le déplacer.', true); } }, 'Placer')]));
      });
      out.push(h('h3', null, 'Dans ton bureau'));
      if (!S.placed.length) out.push(empty('Rien n’est posé pour l’instant.'));
      S.placed.forEach(function (p, idx) {
        var it = itemById(p.id); if (!it) return;
        out.push(h('div', { class: 'room-row' }, [thumb(it), h('span', { class: 'room-row-name' }, it.name),
          h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onclick: function () { unplace(idx); say('Objet rangé dans ton stock.'); } }, 'Retirer')]));
      });
      return out;
    }
    function teamView() {
      var out = [h('p', { class: 'small muted' }, 'Choisis un chapeau et un look pour chaque agent. Tu les vois tout de suite dans la salle.')];
      var hats = items().filter(function (i) { return i.slot === 'hat' && owned(i.id) > 0; }), allSkins = items().filter(function (i) { return i.slot === 'skin' && owned(i.id) > 0; });
      if (!hats.length && !allSkins.length) out.push(empty('Achète un chapeau ou un look à la boutique pour habiller tes agents.'));
      (L ? L.ROLES : []).forEach(function (r) {
        var info = L.INFO[r], skins = allSkins.filter(function (i) { return !i.role || i.role === r; });
        function select(slot, list, label) {
          var sel = h('select', { class: 'select', 'aria-label': label + ' de ' + info.name }, [h('option', { value: '' }, 'Aucun')].concat(list.map(function (i) {
            return h('option', { value: i.id, selected: S.equipped[slot][r] === i.id ? 'selected' : null }, i.name);
          })));
          sel.addEventListener('change', function () { equip(slot, r, sel.value); });
          return sel;
        }
        out.push(h('div', { class: 'room-agent' }, [h('span', { class: 'room-agent-name' }, info.icon + ' ' + info.name),
          h('label', { class: 'small' }, ['Chapeau ', select('hat', hats, 'Chapeau')]), h('label', { class: 'small' }, ['Look ', select('skin', skins, 'Look')])]));
      });
      return out;
    }
    function coachView() {
      var cur = coachObj();
      return [h('p', { class: 'small muted' }, 'Ton coach t’encourage pendant et après tes révisions.')]
        .concat(h('div', { class: 'room-coaches' }, COACHES.map(function (c) {
          var o = coachObjFor(c.id), sel = cur.id === c.id;
          return h('button', { type: 'button', class: 'room-coach' + (sel ? ' is-selected' : ''), 'aria-pressed': sel ? 'true' : 'false',
            onclick: function () { setCoach(c.id); say(pickLine(c.id, 'start', Studio.content && Studio.content.subjects && Studio.content.subjects.coachLines)); } },
            [coachAvatar(c.id, 'room-coach-emoji'), h('strong', null, o.name), h('span', { class: 'small muted' }, c.trait),
              sel ? h('span', { class: 'badge badge-primary' }, 'Ton coach') : null]);
        })));
    }
    function questsView2() {
      var sv = streakView(), out = [];
      var msgS = sv.count ? '🔥 Série : ' + sv.count + ' jour' + (sv.count > 1 ? 's' : '') + (sv.best > sv.count ? ' (record : ' + sv.best + ')' : '') : '🔥 Ta série commence quand tu révises.';
      var note = sv.status === 'rest' ? 'Ton jour de repos protège ta série. Révise aujourd’hui pour continuer !'
        : sv.status === 'soft' ? 'Reviens quand tu veux : ta série repart sans tout perdre.'
        : sv.restAvailable ? '😴 Tu as 1 jour de repos gratuit cette semaine.' : '😴 Ton jour de repos de la semaine est utilisé.';
      out.push(h('div', { class: 'room-streak' }, [h('strong', null, msgS), h('span', { class: 'small muted' }, note)]));
      out.push(h('h3', null, 'Quêtes du jour'));
      questsView().forEach(function (q) {
        var pct = Math.round(q.progress / q.target * 100);
        out.push(h('div', { class: 'room-quest' + (q.done ? ' is-done' : '') }, [
          h('div', { class: 'room-quest-top' }, [h('span', null, (q.done ? '✅ ' : '🎯 ') + q.label), h('span', { class: 'chip' }, '+' + q.coins + ' 💰')]),
          h('div', { class: 'progress progress-sm', role: 'progressbar', 'aria-label': q.label, 'aria-valuemin': '0', 'aria-valuemax': String(q.target), 'aria-valuenow': String(q.progress) },
            h('div', { class: 'progress-bar', style: 'width:' + pct + '%' })),
          h('span', { class: 'small muted' }, q.progress + ' / ' + q.target)]));
      });
      out.push(h('p', { class: 'small muted' }, 'De nouvelles quêtes arrivent chaque jour.'));
      return out;
    }
    function badgesView2() {
      var list = badgesView(), n = list.filter(function (b) { return b.earned; }).length;
      return [h('p', { class: 'small muted' }, n + ' badge' + (n > 1 ? 's' : '') + ' sur ' + list.length), h('div', { class: 'room-badges' }, list.map(function (b) {
        return h('div', { class: 'room-badge' + (b.earned ? ' is-earned' : ''), title: b.desc }, [b.earned ? badgeIcon(b, 'room-badge-icon') : h('span', { class: 'room-badge-icon', 'aria-hidden': 'true' }, '🔒'),
          h('strong', null, b.name), h('span', { class: 'small muted' }, b.desc),
          b.earned ? h('span', { class: 'badge badge-mint' }, 'Gagné') : h('span', { class: 'small' }, b.progress + ' / ' + b.target)]);
      }))];
    }

    function renderPanel() {
      var keep = document.activeElement && body.contains(document.activeElement) ? null : null;
      coinsEl.textContent = '💰 ' + S.coins + ' pièce' + (S.coins > 1 ? 's' : '');
      var lv = curLevel(); levelEl.textContent = '⭐ Niveau ' + lv.level;
      TABS.forEach(function (t) { var on = tab === t[0]; tabBtns[t[0]].classList.toggle('is-active', on); tabBtns[t[0]].setAttribute('aria-selected', on ? 'true' : 'false'); tabBtns[t[0]].tabIndex = on ? 0 : -1; });
      body.setAttribute('aria-labelledby', 'room-tab-' + tab);
      while (body.firstChild) body.removeChild(body.firstChild);
      var v = { shop: shopView, stock: stockView, team: teamView, coach: coachView, quests: questsView2, badges: badgesView2 }[tab]();
      [].concat(v).forEach(function (n) { body.appendChild(n); });
      updateGhost();
    }
    var off = Studio.game.onChange(function () { if (!container.isConnected) { cleanup(); return; } renderPanel(); });
    function cleanup() { off(); offs.forEach(function (f) { f(); }); if (roomView) roomView.destroy(); roomView = null; if (roomCleanup === cleanup) roomCleanup = null; }
    roomCleanup = cleanup;
    renderPanel();
    if (Studio.game.effectsOn()) { var c = coachObj(); say(c.emoji + ' ' + c.name + ' : ' + c.say('start')); }
  }
  Studio.bus.on('nav', function (d) { if (d && d.moduleId !== 'room' && roomCleanup) { roomCleanup(); roomCleanup = null; } });
  Studio.register({ id: 'room', title: 'Mon bureau', icon: '🪴', order: 3, needsDoc: false, render: renderRoom });

  /* ---- accueil du jour ---- */
  var greeted = false, greetTries = 0;
  function sessionGreeted() { try { return greeted || root.sessionStorage.getItem('studio.greeted') === '1'; } catch (e) { return greeted; } }
  function markGreeted() { greeted = true; try { root.sessionStorage.setItem('studio.greeted', '1'); } catch (e) { /* ignore */ } }
  function welcome() {
    var today = todayKey();
    if (sessionGreeted()) return;                                   // une seule salutation par session, quelle que soit la page
    if (document.body && document.body.classList.contains('modal-open')) {   // jamais par-dessus une fenêtre ouverte : on réessaie plus tard
      if (++greetTries <= 10) setTimeout(welcome, 3000);
      return;
    }
    markGreeted();
    if (S.welcomed === today) return;
    S.welcomed = today; ensureDay(S, today); save();
    var gap = S.streak.last ? dayNum(today) - dayNum(S.streak.last) : 0, c = coachObj();
    if (gap >= 2) bubble({ text: c.say('comeback'), coachId: c.id, kind: 'coach', ms: 4000, chips: restAvailable(S.streak, today) ? ['😴 Ton jour de repos protège ta série'] : [] });
    else bubble({ text: c.say('start'), coachId: c.id, kind: 'coach', ms: 4000, chips: ['🎯 3 quêtes t’attendent'] });
  }

  wrapStats();
  function boot() { ensureWidget(); renderWidget(); setTimeout(welcome, 1800); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); }); else setTimeout(boot, 0);
})();
