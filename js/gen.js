/* Studio.gen : génération de contenus pédagogiques.
 * Deux moteurs :
 *   - IA (Anthropic / OpenAI / Gemini) par fetch direct, si Settings.provider != 'none' et apiKey renseignée ;
 *   - hors-ligne : heuristiques (définitions, TF, dates/nombres, listes → acronymes, titres → mindmap).
 * Options communes : { offline:true } force le moteur hors-ligne.
 * Les objets retournés portent une propriété non persistante utile à l'UI : le moteur est indiqué dans `engine`
 * ('ia' | 'hors-ligne') de la valeur retournée (champ ajouté, ignoré par le modèle de données).
 * En cas d'échec IA, la Promise est rejetée avec une Error au message lisible en français (err.code, err.status) ;
 * l'appelant peut proposer de relancer avec { offline:true }.
 */
(function () {
  'use strict';

  var root = (typeof window !== 'undefined') ? window : globalThis;
  root.Studio = root.Studio || {};
  var Studio = root.Studio;

  /* ------------------------------------------------------------------ utilitaires */

  function uid() {
    if (Studio.ui && typeof Studio.ui.uid === 'function') return Studio.ui.uid();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function lowerFirst(s) { return s ? s.charAt(0).toLowerCase() + s.slice(1) : s; }
  function clean(s) { return String(s).replace(/\s+/g, ' ').trim(); }
  function stripEnd(s) { return clean(s).replace(/[\s.;:,!…]+$/, ''); }
  function shorten(s, n) {
    s = clean(s);
    if (s.length <= n) return s;
    var cut = s.slice(0, n);
    var k = Math.max(cut.lastIndexOf(','), cut.lastIndexOf(';'), cut.lastIndexOf(' '));
    if (k < n * 0.5) k = n;
    return cut.slice(0, k).replace(/[\s,;:]+$/, '') + '…';
  }
  function wordsCount(s) { var m = String(s).match(/\S+/g); return m ? m.length : 0; }
  function settings() {
    var s = null;
    try { s = Studio.store && Studio.store.get('settings', null); } catch (e) { s = null; }
    return s || {};
  }
  function save(coll, obj) {
    if (Studio.store && typeof Studio.store.add === 'function') {
      var r = Studio.store.add(coll, obj);
      if (r === null) throw GenError('Plus de place : supprime un vieux cours ou exporte tes données.', 'quota');   // écriture refusée : rien n'est affiché comme enregistré
      return (r && typeof r === 'object') ? r : obj;
    }
    return obj;
  }
  function GenError(message, code, status) {
    var e = new Error(message); e.code = code || 'gen'; if (status) e.status = status; e.userMessage = message; return e;
  }
  function docTitleName(doc) { return (doc && doc.name ? String(doc.name) : 'Cours').replace(/\.[a-z0-9]{2,5}$/i, ''); }
  function docText(doc) {
    var t = (doc && typeof doc === 'object') ? (doc.text || '') : String(doc || '');
    t = String(t).trim();
    if (!t) throw GenError('Ce document est vide : il n’y a rien à analyser.', 'empty');
    return t;
  }

  /* ------------------------------------------------------------------ découpage */

  function splitSentences(text) {
    var t = String(text).replace(/(\d)\.(?=\d)/g, '$1\u0001')
      .replace(/\b(etc|env|cf|fig|pp?|M|Mme|Mlle|Dr|St|av|apr|ex|vs|n°|sec|min|éd|vol)\./gi, function (m) { return m.slice(0, -1) + '\u0002'; })
      .replace(/J\.-C\./g, 'J\u0002-C\u0002');
    var m = t.match(/[^.!?…]+(?:[.!?…]+|$)/g) || [];
    return m.map(function (s) { return clean(s.replace(/[\u0001\u0002]/g, '.')); }).filter(function (s) { return s.length > 1; });
  }

  function chunks(text, size) {
    size = size || 4000;
    text = String(text || '').replace(/\r/g, '').trim();
    if (!text) return [];
    var paras = text.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean);
    var units = [];
    paras.forEach(function (p) {
      if (p.length <= size) { units.push(p); return; }
      var cur = '';
      splitSentences(p).forEach(function (s) {
        while (s.length > size) { // phrase géante : coupe dure
          if (cur) { units.push(cur); cur = ''; }
          units.push(s.slice(0, size)); s = s.slice(size);
        }
        if ((cur + ' ' + s).length > size) { units.push(cur); cur = s; } else cur = cur ? cur + ' ' + s : s;
      });
      if (cur) units.push(cur);
    });
    var out = [], buf = '';
    units.forEach(function (u) {
      if (buf && (buf.length + u.length + 2) > size) { out.push(buf); buf = u; }
      else buf = buf ? buf + '\n\n' + u : u;
    });
    if (buf) out.push(buf);
    return out;
  }

  /* ------------------------------------------------------------------ analyse linguistique */

  var STOP = ('le la les l un une des de du d et ou mais donc or ni car que qui quoi dont ou où quand comme si ' +
    'a au aux en dans sur sous par pour avec sans chez vers entre contre depuis pendant avant apres selon ' +
    'ce cet cette ces cela ca ceci celui celle ceux celles il elle ils elles on nous vous je tu me te se leur leurs lui ' +
    'son sa ses mon ma mes ton ta tes notre nos votre vos y ne pas plus moins tres trop aussi alors ainsi puis ' +
    'est sont etre ete etait etaient sera seront soit sont ai as avons avez ont avoir avait avaient aura eu ' +
    'fait faire font peut peuvent doit doivent faut permet permettent chaque tout tous toute toutes autre autres meme memes ' +
    'bien tel telle tels telles certain certains certaines plusieurs quelques deux trois lorsque puisque ' +
    'afin cependant toutefois ensuite enfin donc dessus ici la ou ' +
    'the of and to in is').split(/\s+/).reduce(function (o, w) { o[w] = 1; return o; }, {});

  function stem(w) { return w.length > 4 ? w.replace(/[sx]$/, '') : w; }
  function tokens(s) { return (norm(s).match(/[a-z0-9]+/g) || []); }
  function contentStems(s) {
    return tokens(s).filter(function (w) { return w.length > 2 && !STOP[w] && !/^\d+$/.test(w); }).map(stem);
  }

  var HEAD_WORDS = /^(chapitre|partie|section|leçon|lecon|séquence|sequence|thème|theme|introduction|conclusion)\b/i;
  var HEAD_MAJOR = /^(chapitre|partie|section|leçon|lecon|séquence|sequence|thème|theme)\b/i;
  var BULLET = /^\s*(?:[-*•–·▪●]|\d{1,2}[.)]|[a-z][.)])\s+(\S.*)$/;

  function parseStructure(text) {
    var lines = String(text).replace(/\r/g, '').split('\n');
    var sections = [], cur = { title: null, level: 1, paras: [], lists: [] };
    var para = [], list = null;
    function flushPara() { if (para.length) { cur.paras.push(clean(para.join(' '))); para = []; } }
    function flushList() { if (list && list.items.length) cur.lists.push(list); list = null; }
    function newSection(title, level) {
      flushPara(); flushList();
      if (cur.title !== null || cur.paras.length || cur.lists.length) sections.push(cur);
      cur = { title: clean(title), level: level, paras: [], lists: [] };
    }
    function nextNonBlank(i) { for (var k = i + 1; k < lines.length; k++) if (lines[k].trim()) return lines[k].trim(); return ''; }

    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i], t = raw.trim();
      if (!t) { flushPara(); flushList(); continue; }
      var prevBlank = (i === 0) || !lines[i - 1].trim();
      var nxt = nextNonBlank(i), m;
      if ((m = t.match(/^(#{1,6})\s+(.+?)\s*#*$/))) { newSection(m[2], m[1].length); continue; }
      if (/^[-=_*]{3,}$/.test(t)) { flushPara(); flushList(); continue; }
      var isBullet = BULLET.test(t) && !/^\d+(?:\.\d+)+\s/.test(t);
      if ((m = t.match(/^(\d+(?:\.\d+)*)[.)]?\s+(\S.{1,70})$/)) && !/[.;,!?:]$/.test(t) && /^[A-ZÀ-Ý«"]/.test(m[2])) {
        var sub = (m[1].match(/\./g) || []).length;
        var nextNum = /^\d+[.)]\s/.test(nxt);
        if (sub > 0 || !nextNum) { newSection(m[2], Math.min(sub + 1, 4)); continue; }
      }
      if (!isBullet && t.length < 80 && HEAD_WORDS.test(t) && !/[.;,!?]$/.test(t)) { newSection(t, HEAD_MAJOR.test(t) ? 1 : 2); continue; }
      if (!isBullet && t.length < 70 && /[A-ZÀ-Ý]{3}/.test(t) && t === t.toUpperCase() && !/[.;,!?]$/.test(t) && /\s|^[A-ZÀ-Ý]{6,}$/.test(t)) { newSection(cap(t.toLowerCase()), 1); continue; }
      if (!isBullet && prevBlank && nxt && t.length <= 60 && wordsCount(t) <= 8 && !/[.;,!?:]$/.test(t) && /^[A-ZÀ-Ý0-9«]/.test(t) && nxt.length > t.length && !BULLET.test(nxt) && !/^[A-ZÀ-Ý]{2,6}$/.test(t)) {
        newSection(t, 2); continue;
      }
      if (isBullet) {
        flushPara();
        if (!list) {
          var intro = '';
          if (cur.paras.length && /:\s*$/.test(cur.paras[cur.paras.length - 1])) intro = cur.paras.pop().replace(/\s*:\s*$/, '').replace(/\s+(sont|est|comprennent|suivants?)$/i, '');
          list = { intro: intro, items: [] };
        }
        list.items.push(clean(t.match(BULLET)[1]));
        continue;
      }
      if (list && /^\s{2,}/.test(raw)) { list.items[list.items.length - 1] += ' ' + t; continue; }
      flushList();
      para.push(t);
    }
    flushPara(); flushList();
    if (cur.title !== null || cur.paras.length || cur.lists.length) sections.push(cur);
    var minL = Math.min.apply(null, sections.filter(function (s) { return s.title; }).map(function (s) { return s.level; }).concat([9]));
    sections.forEach(function (s) { s.level = minL === 9 ? 1 : Math.max(1, s.level - minL + 1); s.pos = 0; });
    sections.forEach(function (s, i) { s.pos = i; });
    return sections;
  }

  var DEF_VERBS = '(est|sont|désigne|désignent|signifie|signifient|correspond à|correspondent à|se définit comme|se définissent comme|est défini(?:e|s|es)? comme|représente|représentent|consiste en|consiste à|consistent en|permet de|permettent de|renvoie à|se caractérise par|s’appelle|s\'appelle)';
  var SUBJ_BAD = /^(il|elle|ils|elles|ce|cet|cette|ces|cela|ça|ceci|on|nous|vous|je|tu|tout|toute|tous|toutes|qui|que|car|mais|donc|et|ou|ni|or|si|quand|lorsque|ici|là|voici|voilà|c|ç|y|en|d|l’on|l'on)(\s|’|'|$)/i;
  var ARTICLE = /^(le|la|les|l['’]|un|une|des|du|de la|d['’])\s*/i;

  function extractDefs(sentenceObj, boldSet) {
    var s = sentenceObj.s.replace(/^(?:[-•–]\s*)/, '');
    var m, term, def, verb;
    var re = new RegExp('^((?:[A-ZÀ-Ý«"][^,.;:()!?]{1,60}?)|(?:[a-zà-ÿ][^,.;:()!?]{1,45}?))\\s+' + DEF_VERBS + '\\s+(.{12,})$');
    if ((m = s.match(re))) { term = m[1]; verb = m[2]; def = m[3]; }
    else if ((m = s.match(/^(?:On|on)\s+(?:appelle|nomme)\s+(.{2,60}?)\s+((?:l[ea’']|un|une|le|la|les|des)\b.{12,})$/))) { term = m[1]; verb = 'appelle'; def = m[2]; }
    else if ((m = s.match(/^([^:]{2,50}?)\s*[:–—]\s+(.{14,})$/)) && wordsCount(m[1]) <= 6 && !/(suivant|ci-dessous|exemple|attention|rappel|remarque|note|important|retenir|résumé|par exemple)/i.test(m[1]) && !/[.!?]/.test(m[1])) {
      term = m[1]; def = m[2]; verb = ':';
    }
    if (!term) return null;
    term = clean(term.replace(/[«»"]/g, ''));
    if (SUBJ_BAD.test(term) || wordsCount(term) > 7 || wordsCount(def) < 4) return null;
    if (/\b(qui|que|dont|où)\b/i.test(term) || /^[:;,]/.test(def)) return null;
    if (/^(est|sont)$/.test(verb) && !/^(un|une|le|la|les|l['’]|des|du|de la|ce|cet|cette|ces|l’ensemble|tout|toute|chaque|plusieurs|environ)\b/i.test(def)) return null;
    def = stripEnd(def);
    var base = term.replace(ARTICLE, '');
    if (!base || base.length < 2) return null;
    return { term: cap(term), base: base, verb: verb, def: def, sentence: sentenceObj.s, sec: sentenceObj.sec, bold: boldSet.has(norm(base)) };
  }

  var cacheKey = null, cacheVal = null;

  /* analyseG : même analyse, mais en générateur : chaque « yield » est une pause possible (utilisée par analyseAsync
     pour rendre la main à l'interface entre deux étapes). analyse() l'exécute d'un seul trait (comportement inchangé). */
  function* analyseG(text) {
    if (cacheKey === text && cacheVal) return cacheVal;
    var bold = new Set(), boldList = [];
    var re = /\*\*([^*\n]{2,60})\*\*|__([^_\n]{2,60})__/g, m;
    while ((m = re.exec(text))) { var b = clean(m[1] || m[2]); if (!bold.has(norm(b))) { bold.add(norm(b)); boldList.push(b); } }
    var plain = text.replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/__([^_\n]+)__/g, '$1')
      .replace(/(^|[\s(])\*(\S[^*\n]*?\S|\S)\*(?=[\s).,;:!?]|$)/g, '$1$2').replace(/`([^`\n]+)`/g, '$1');
    var sections = parseStructure(plain);
    yield 8;

    var sentences = [];
    sections.forEach(function (sec) {
      sec.paras.forEach(function (p, pi) {
        splitSentences(p).forEach(function (s, si) {
          if (/[?:]$/.test(s)) return;
          sentences.push({ s: s, sec: sec.pos, first: (pi === 0 && si === 0), score: 0 });
        });
      });
    });
    yield 16;
    // fréquences
    var tf = {}, surf = {};
    plain.split(/\s+/).forEach(function (w) {
      var wl = w.replace(/^[^\wÀ-ÿ]+|[^\wÀ-ÿ]+$/g, '').replace(/^(?:[ldjmtsnc]|qu)['’]/i, '');
      var n = norm(wl);
      if (n.length < 3 || STOP[n] || /^\d+$/.test(n)) return;
      var st = stem(n);
      tf[st] = (tf[st] || 0) + 1;
      surf[st] = surf[st] || {}; var lw = wl.toLowerCase(); surf[st][lw] = (surf[st][lw] || 0) + 1;
    });
    function surface(st) {
      var o = surf[st] || {}, best = st, bc = -1;
      Object.keys(o).forEach(function (k) { if (o[k] > bc) { bc = o[k]; best = k; } });
      return best;
    }
    var maxTf = 1; Object.keys(tf).forEach(function (k) { if (tf[k] > maxTf) maxTf = tf[k]; });

    yield 24;
    // définitions
    var defs = [], seenDef = {};
    sentences.forEach(function (so) {
      var d = extractDefs(so, bold);
      if (d && !seenDef[norm(d.base)]) { seenDef[norm(d.base)] = 1; defs.push(d); so.isDef = true; }
    });
    // listes "intro : a, b" dans un paragraphe → aussi dans les listes à puces
    var lists = [];
    sections.forEach(function (sec) {
      sec.lists.forEach(function (l) { if (l.items.length >= 3) lists.push({ intro: l.intro || sec.title || '', items: l.items, sec: sec.pos }); });
    });
    sentences.forEach(function (so) {
      var mm = so.s.match(/^(.{6,140}?)(?::|\b(?:comme|notamment|tels? que|telles? que|à savoir|dont|sont))\s+([^.;:]{8,200})[.!]?$/);
      if (!mm) return;
      var items = mm[2].split(/\s*,\s*|\s*;\s*|\s+et\s+|\s+ou\s+/).map(clean).filter(Boolean);
      if (items.length >= 3 && items.length <= 9 && items.every(function (x) { return wordsCount(x) <= 4 && x.length >= 2 && !/^(qui|que|dont|car|mais)\b/i.test(x); })) {
        lists.push({ intro: stripEnd(mm[1]).replace(/\s+(sont|est)$/i, ''), items: items.map(function (x) { return x.replace(/^(l['’]|le |la |les |un |une |des )/i, function (a) { return ''; }); }), sec: so.sec, inline: true, raw: items });
      }
    });

    yield 30;
    // dates et nombres
    var years = [], nums = [];
    sentences.forEach(function (so) {
      var y = so.s.match(/\b(1[0-9]{3}|20[0-9]{2})\b/g);
      if (y) y.forEach(function (v) { if (years.indexOf(v) < 0) years.push(v); });
      var nm = so.s.match(/\b\d+(?:[  ]\d{3})*(?:[.,]\d+)?(?:\s?(?:%|°C|°|km\/h|m\/s|km²|km|m²|cm²|m|cm|mm|kg|g|mg|mL|L|Hz|W|V|J|€|ans|siècles?|millions?|milliards?|heures?|minutes?|jours?|mois|euros?))?(?![\w])/g);
      if (nm) nm.forEach(function (v) {
        v = clean(v);
        if (/^(1[0-9]{3}|20[0-9]{2})$/.test(v)) return;
        if (nums.indexOf(v) < 0) nums.push(v);
      });
    });

    yield 34;
    // score des phrases (TF normalisé)
    sentences.forEach(function (so) {
      var st = contentStems(so.s), uniq = {}, sum = 0;
      st.forEach(function (w) { if (!uniq[w]) { uniq[w] = 1; sum += (tf[w] || 0) / maxTf; } });
      var len = Math.max(st.length, 1);
      so.score = sum / Math.sqrt(len + 3);
      if (so.first) so.score *= 1.25;
      if (so.isDef) so.score *= 1.3;
      if (/\b(1[0-9]{3}|20[0-9]{2})\b/.test(so.s)) so.score *= 1.1;
      var L = so.s.length; if (L < 35) so.score *= 0.5; else if (L > 260) so.score *= 0.6;
      so.words = len;
    });

    yield 38;
    // pool de termes
    var terms = [], seenT = {};
    function addTerm(t, kind) {
      var n = norm(t); if (n.length < 3 || seenT[n]) return; seenT[n] = 1; terms.push({ t: t, n: n, kind: kind });
    }
    defs.forEach(function (d) { addTerm(cap(d.base), 'def'); });
    boldList.forEach(function (b) { addTerm(cap(b), 'bold'); });
    Object.keys(tf).sort(function (a, b) { return tf[b] - tf[a]; }).filter(function (k) { return k.length >= 5 && tf[k] >= 2; }).slice(0, 40)
      .forEach(function (k) { addTerm(cap(surface(k)), 'tf'); });

    var keywords = Object.keys(tf).sort(function (a, b) { return tf[b] - tf[a]; }).filter(function (k) { return k.length >= 4; }).slice(0, 14).map(surface);

    cacheKey = text;
    cacheVal = { text: text, plain: plain, sections: sections, sentences: sentences, defs: defs, lists: lists, years: years, nums: nums,
      bold: bold, boldList: boldList, tf: tf, surface: surface, terms: terms, keywords: keywords };
    return cacheVal;
  }
  function drive(g) { var r; while (!(r = g.next()).done) { /* tout d'un trait */ } return r.value; }
  function analyse(text) { return drive(analyseG(text)); }
  /* rend la main à l'interface (setTimeout 0 : fonctionne aussi dans un onglet caché et sous Node) */
  function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }
  function driveAsync(g, onStep) {
    return new Promise(function (resolve, reject) {
      (function step() {
        var r; try { r = g.next(); } catch (e) { return reject(e); }
        if (r.done) return resolve(r.value);
        if (onStep) onStep(r.value);
        setTimeout(step, 0);
      })();
    });
  }
  function analyseAsync(text, onStep) { return driveAsync(analyseG(text), onStep); }

  /* ------------------------------------------------------------------ outils hors-ligne communs */

  function secTitle(A, idx) { var s = A.sections[idx]; return s && s.title ? s.title : ''; }

  function informative(A) {
    return A.sentences.filter(function (x) { return x.s.length >= 35 && x.s.length <= 240 && wordsCount(x.s) >= 6 && !/^(voir|cf|exemple\s*:)/i.test(x.s); });
  }

  // choisit le mot à masquer dans une phrase → {answer, kind}
  function pickBlank(A, so) {
    var s = so.s, m, i;
    var boldIn = A.boldList.filter(function (b) { return norm(s).indexOf(norm(b)) >= 0 && s.length > b.length + 15; })
      .sort(function (a, b) { return b.length - a.length; });
    if (boldIn.length) return { answer: s.substr(norm(s).indexOf(norm(boldIn[0])), boldIn[0].length), kind: 'term' };
    if ((m = s.match(/\b(1[0-9]{3}|20[0-9]{2})\b/))) return { answer: m[1], kind: 'year' };
    if ((m = s.match(/\b\d+(?:[.,]\d+)?\s?(?:%|°C|km\/h|km²|km|cm²|cm|m²|kg|mg|mm|ans|siècles?|millions?|milliards?|heures?|jours?|mois|euros?|€)(?![\wÀ-ÿ])/))) return { answer: clean(m[0]), kind: 'num' };
    if ((m = s.match(/\b\d+(?:[.,]\d+)?\b/)) && !/^\d$/.test(m[0]) ) return { answer: m[0], kind: 'num' };
    for (i = 0; i < A.defs.length; i++) {
      var d = A.defs[i];
      if (norm(s).indexOf(norm(d.base)) >= 0 && s.length > d.base.length + 20) {
        return { answer: s.substr(norm(s).indexOf(norm(d.base)), d.base.length), kind: 'term' };
      }
    }
    var best = null, bs = 0, tset = {};
    A.terms.forEach(function (t) { tset[t.n] = 1; });
    (s.match(/[A-Za-zÀ-ÿ-]+/g) || []).forEach(function (w) {
      var n = norm(w); if (n.length < 6 || STOP[n] || /ment$/.test(n)) return;
      var sc = (A.tf[stem(n)] || 0) + n.length / 10 + (tset[n] ? 2 : 0);
      if (sc > bs) { bs = sc; best = w; }
    });
    return best ? { answer: best, kind: 'word' } : null;
  }

  function blankOut(s, answer) {
    var re = new RegExp('(^|[^A-Za-zÀ-ÿ0-9])' + esc(answer) + '(?![A-Za-zÀ-ÿ0-9])', 'i');
    if (!re.test(s)) return null;
    return s.replace(re, '$1____');
  }

  function distractors(A, answer, kind, n) {
    var an = norm(answer), pool = [];
    if (kind === 'year') pool = A.years.filter(function (y) { return y !== answer; });
    else if (kind === 'num') {
      var unit = (answer.match(/[^\d\s.,]+$/) || [''])[0];
      pool = A.nums.filter(function (v) { return v !== answer && ((v.match(/[^\d\s.,]+$/) || [''])[0] === unit); });
    } else if (kind === 'word') { return null;
    } else {
      pool = A.terms.filter(function (t) { return t.n !== an && t.n.indexOf(an) < 0 && an.indexOf(t.n) < 0; }).map(function (t) { return t.t; });
      var cased = /^[A-ZÀ-Ý]/.test(answer);
      pool = pool.map(function (t) { return cased ? t : lowerFirst(t); });
      pool.sort(function (a, b) { return Math.abs(a.length - answer.length) - Math.abs(b.length - answer.length) + (Math.random() - .5) * 4; });
    }
    var out = [], seen = {}; seen[an] = 1;
    pool.forEach(function (p) { var k = norm(p); if (!seen[k] && out.length < n) { seen[k] = 1; out.push(p); } });
    return out.length === n ? out : null;
  }

  function mkQcm(q, answer, wrong, explain, diff) {
    var choices = shuffle([answer].concat(wrong));
    return { id: uid(), type: 'qcm', q: q, choices: choices, answer: choices.indexOf(answer), explain: explain || '', difficulty: diff || 2 };
  }

  var NEG = [
    [/\b(est)\b(?! (?:pas|aussi|ainsi))/, 'n’est pas'], [/\b(sont)\b(?! pas)/, 'ne sont pas'],
    [/\b(permet|permettent)\b/, null], [/\b(peut)\b/, 'ne peut pas'], [/\b(peuvent)\b/, 'ne peuvent pas'], [/\b(doit)\b/, 'ne doit pas'],
    [/\b(contient|contiennent)\b/, null], [/\b(produit|produisent)\b/, null]
  ];
  function negate(s) {
    if (/\b(n’|n'|ne |jamais|aucun|sans)\b/i.test(s)) return null;
    var m;
    if ((m = s.match(/\best\b/))) return s.replace(/\best\b/, 'n’est pas');
    if ((m = s.match(/\bsont\b/))) return s.replace(/\bsont\b/, 'ne sont pas');
    if ((m = s.match(/\b(peut|peuvent|doit|doivent)\b/))) return s.replace(/\b(peut|peuvent|doit|doivent)\b/, function (v) { return 'ne ' + v + ' pas'; });
    if ((m = s.match(/\b(permet|permettent|contient|contiennent|produit|produisent|favorise|favorisent|provoque|provoquent|nécessite|nécessitent)\b/))) {
      return s.replace(m[0], function (v) { return 'ne ' + v + ' pas'; });
    }
    return null;
  }

  // fabrique une affirmation fausse → {text, how} ou null
  function falsify(A, so) {
    var s = so.s, m, i;
    var d = null;
    for (i = 0; i < A.defs.length; i++) if (A.defs[i].sentence === s) { d = A.defs[i]; break; }
    if (d && A.defs.length > 1 && Math.random() < 0.6) {
      var others = A.defs.filter(function (x) { return x !== d && norm(x.def) !== norm(d.def); });
      if (others.length) {
        var o = others[Math.floor(Math.random() * others.length)];
        var sep = d.verb === ':' ? ' : ' : ' ' + d.verb + ' ';
        return { text: d.term + sep + shorten(o.def, 160) + '.', how: 'subst' };
      }
    }
    if ((m = s.match(/\b(1[0-9]{3}|20[0-9]{2})\b/)) && A.years.length > 1) {
      var ys = A.years.filter(function (y) { return y !== m[1]; });
      if (ys.length) return { text: s.replace(m[1], ys[Math.floor(Math.random() * ys.length)]), how: 'subst' };
    }
    if ((m = s.match(/\b\d+(?:[.,]\d+)?\s?(?:%|°C|km\/h|km²|km|cm²|cm|m²|kg|mg|mm|ans|siècles?|millions?|milliards?|heures?|jours?|mois|euros?|€)?(?![\wÀ-ÿ])/)) && A.nums.length > 1) {
      var unit = (m[0].match(/[^\d\s.,]+$/) || [''])[0];
      var ns = A.nums.filter(function (v) { return v !== clean(m[0]) && ((v.match(/[^\d\s.,]+$/) || [''])[0] === unit); });
      if (ns.length) return { text: s.replace(m[0].trim(), ns[Math.floor(Math.random() * ns.length)]), how: 'subst' };
    }
    var n = negate(s);
    if (n) return { text: n, how: 'neg' };
    var bl = pickBlank(A, so);
    if (bl && bl.kind === 'term') {
      var ds = distractors(A, bl.answer, 'term', 1);
      if (ds) return { text: s.replace(bl.answer, ds[0]), how: 'subst' };
    }
    return null;
  }

  function acronymOf(items) {
    var letters = items.map(function (x) {
      var w = clean(x).replace(/^(l['’]|le |la |les |un |une |des |du |de |d['’])/i, '');
      var ch = (w.match(/[A-Za-zÀ-ÿ0-9]/) || [''])[0];
      return norm(ch).toUpperCase();
    });
    var word = letters.join('');
    var vowels = (word.match(/[AEIOUY]/g) || []).length;
    var pronounceable = vowels >= 1 && !/[^AEIOUY]{4,}/.test(word) && word.length >= 3 && word.length <= 8 && /[^0-9]/.test(word) && !/\d/.test(word);
    return { word: word, letters: letters, pronounceable: pronounceable };
  }

  /* ------------------------------------------------------------------ moteur hors-ligne : générateurs */

  var OFF = {};

  OFF.flashcards = function (doc, opts) {
    var A = analyse(docText(doc)), count = opts.count || 20;
    var defsC = [], listC = [], clozeC = [], used = {};
    A.defs.forEach(function (d) {
      used[d.sentence] = 1;
      var front = /permet de/.test(d.verb) ? 'À quoi sert ' + lowerFirst(d.term) + ' ?' : 'Que signifie « ' + d.term + ' » ?';
      var back = d.verb === ':' ? d.term + ' : ' + d.def + '.' : d.term + ' ' + d.verb + ' ' + d.def + '.';
      defsC.push({ front: front, back: cap(back), hint: secTitle(A, d.sec) ? 'Chapitre : ' + secTitle(A, d.sec) : undefined, sec: d.sec });
    });
    A.lists.forEach(function (l) {
      var ac = acronymOf(l.items), items = l.items;
      var c = {
        front: 'Cite les éléments de la liste : ' + (stripEnd(l.intro) || secTitle(A, l.sec) || 'liste du cours') + ' (' + items.length + ' éléments).',
        back: items.map(function (x, i) { return (i + 1) + '. ' + cap(x); }).join('\n'),
        hint: 'Premières lettres : ' + ac.letters.join(' – '), sec: l.sec
      };
      if (ac.pronounceable) c.mnemo = 'Acronyme : ' + ac.word;
      listC.push(c);
    });
    informative(A).sort(function (a, b) { return b.score - a.score; }).some(function (so) {
      if (clozeC.length >= count) return true;       // assez de trous : inutile d'analyser tout le cours
      if (used[so.s]) return;
      var bl = pickBlank(A, so); if (!bl) return;
      var q = blankOut(so.s, bl.answer); if (!q) return;
      used[so.s] = 1;
      clozeC.push({ front: 'Complète : ' + q, back: bl.answer + '\n« ' + so.s + ' »',
        hint: bl.kind === 'term' ? 'Commence par « ' + bl.answer.charAt(0).toUpperCase() + ' » (' + bl.answer.length + ' lettres)' : (bl.kind === 'year' ? 'C’est une date.' : 'C’est une valeur chiffrée.'),
        sec: so.sec });
    });
    var nd = Math.min(defsC.length, Math.ceil(count * 0.5)), nl = Math.min(listC.length, Math.ceil(count * 0.2));
    var out = defsC.slice(0, nd).concat(listC.slice(0, nl));
    var pool = clozeC.concat(defsC.slice(nd), listC.slice(nl));
    for (var i = 0; out.length < count && i < pool.length; i++) out.push(pool[i]);
    out = out.slice(0, count).sort(function (a, b) { return a.sec - b.sec; });
    return out.map(function (c) { delete c.sec; return c; });
  };

  OFF.quiz = function (doc, opts) {
    var A = analyse(docText(doc)), count = opts.count || 10;
    var types = (opts.types && opts.types.length ? opts.types : ['qcm', 'vf', 'fill', 'open']);
    var diffForced = opts.difficulty ? Math.max(1, Math.min(3, +opts.difficulty || 2)) : 0;
    var pools = { qcm: [], vf: [], fill: [], open: [] }, used = {};
    var info = informative(A).sort(function (a, b) { return b.score - a.score; });

    // QCM : définitions
    if (A.terms.length >= 4) {
      A.defs.forEach(function (d) {
        if (d.def.length > 220) return;
        if (Math.random() < 0.5) {
          var w = distractors(A, cap(d.base), 'term', 3);
          if (w) { pools.qcm.push(mkQcm('Quel terme correspond à la définition suivante : « ' + cap(d.def) + ' » ?', cap(d.base), w, d.sentence, 1)); used[d.sentence] = 1; return; }
        }
        var others = shuffle(A.defs.filter(function (x) { return x !== d && norm(x.def) !== norm(d.def); })).slice(0, 3);
        if (others.length === 3) {
          var q = d.verb === ':' ? 'Quelle affirmation décrit correctement « ' + d.term + ' » ?' : 'Que désigne « ' + d.term + ' » ?';
          pools.qcm.push(mkQcm(q, cap(shorten(d.def, 130)), others.map(function (o) { return cap(shorten(o.def, 130)); }), d.sentence, 2));
          used[d.sentence] = 1;
        }
      });
    }
    // QCM + trous : phrases à blanc
    info.some(function (so) {
      if (pools.qcm.length >= count && pools.fill.length >= count * 3) return true;   // assez de matière : on s'arrête
      var bl = pickBlank(A, so); if (!bl) return;
      var q = blankOut(so.s, bl.answer); if (!q) return;
      var w = distractors(A, bl.answer, bl.kind, 3);
      if (w && !used[so.s] && pools.qcm.length < count) { pools.qcm.push(mkQcm('Complète la phrase : ' + q, bl.answer, w, so.s, bl.kind === 'term' ? 2 : 3)); used[so.s] = 'q'; }
      else if (!used[so.s] || used[so.s] === 1) {
        pools.fill.push({ id: uid(), type: 'fill', q: q, answer: bl.answer, explain: so.s, difficulty: bl.kind === 'term' ? 2 : 3 });
        used[so.s] = 'f';
      }
    });
    // VF : alterne vrai / faux
    var wantFalse = false;
    info.forEach(function (so) {
      if (pools.vf.length >= count) return;
      if (wantFalse) {
        var f = falsify(A, so);
        if (f && norm(f.text) !== norm(so.s)) {
          pools.vf.push({ id: uid(), type: 'vf', q: f.text, answer: false, explain: 'Affirmation modifiée. Dans le cours : « ' + so.s + ' »', difficulty: f.how === 'neg' ? 1 : 2 });
          wantFalse = false; return;
        }
      }
      pools.vf.push({ id: uid(), type: 'vf', q: so.s, answer: true, explain: 'Extrait du cours.', difficulty: 1 });
      wantFalse = true;
    });
    // questions ouvertes
    A.defs.forEach(function (d) {
      pools.open.push({ id: uid(), type: 'open', q: /permet de/.test(d.verb) ? 'À quoi sert ' + lowerFirst(d.term) + ' ? Explique avec tes mots.' : 'Explique avec tes mots : ' + d.term + '.',
        answer: cap(d.verb === ':' ? d.term + ' : ' + d.def : d.term + ' ' + d.verb + ' ' + d.def) + '.', explain: '', difficulty: 3 });
    });
    A.sections.forEach(function (sec) {
      if (!sec.title) return;
      var ss = A.sentences.filter(function (x) { return x.sec === sec.pos; }).sort(function (a, b) { return b.score - a.score; }).slice(0, 2);
      if (ss.length === 2) {
        ss.sort(function (a, b) { return A.sentences.indexOf(a) - A.sentences.indexOf(b); });
        pools.open.push({ id: uid(), type: 'open', q: 'Résume en deux ou trois phrases : « ' + sec.title + ' ».', answer: ss.map(function (x) { return x.s; }).join(' '), explain: '', difficulty: 3 });
      }
    });
    A.lists.forEach(function (l) {
      pools.open.push({ id: uid(), type: 'open', q: 'Cite les éléments de : ' + (stripEnd(l.intro) || 'la liste du cours') + '.', answer: l.items.map(cap).join(' ; '), explain: '', difficulty: 2 });
    });

    // répartition en tourniquet
    types.forEach(function (t) { pools[t] = t === 'vf' ? (pools[t] || []) : shuffle(pools[t] || []); });
    var out = [], guard = 0;
    while (out.length < count && guard++ < 1000) {
      var added = false;
      for (var i = 0; i < types.length && out.length < count; i++) {
        var p = pools[types[i]]; if (p && p.length) { out.push(p.shift()); added = true; }
      }
      if (!added) break;
    }
    if (diffForced) out.forEach(function (q) { q.difficulty = diffForced; });
    return shuffle(out);
  };

  OFF.mnemonics = function (doc, opts) {
    var text = doc && doc.cards ? doc.cards.map(function (c) { return c.front + '\n' + c.back; }).join('\n\n') : docText(doc);
    var A = analyse(text), count = opts.count || 8, items = [];
    var byTech = { acro: [], phrase: [], palais: [], hist: [], feyn: [], assoc: [] };
    A.lists.forEach(function (l) {
      var concept = stripEnd(l.intro) || (secTitle(A, l.sec)) || 'Liste du cours';
      var ac = acronymOf(l.items);
      var detail = l.items.map(function (x, i) { return ac.letters[i] + ' = ' + x; }).join(' ; ');
      if (ac.pronounceable) {
        byTech.acro.push({ technique: 'Acronyme', concept: cap(concept), tip: 'Retiens le mot « ' + ac.word + ' » : ' + detail + '. Répète-le à voix haute, puis retrouve chaque mot à partir de sa lettre.' });
      } else {
        byTech.phrase.push({ technique: 'Phrase-clé (acrostiche)', concept: cap(concept), tip: 'Les initiales sont ' + ac.letters.join('-') + ' (' + detail + '). Invente une phrase drôle dont chaque mot commence par ces lettres, dans l’ordre : ' + ac.letters.map(function (c) { return c + '…'; }).join(' ') + '.' });
      }
      if (l.items.length >= 4) {
        byTech.palais.push({ technique: 'Palais de la mémoire', concept: cap(concept), tip: 'Choisis un trajet que tu connais (ta chambre, ton chemin vers l’école). Place un élément par étape, sous forme d’image marquante : ' +
          l.items.slice(0, 8).map(function (x, i) { return (i + 1) + '. ' + x; }).join(' ; ') + '. Refais le trajet mentalement en les citant.' });
      }
    });
    informative(A).filter(function (so) { return /\b(1[0-9]{3}|20[0-9]{2})\b/.test(so.s); }).sort(function (a, b) { return b.score - a.score; }).forEach(function (so) {
      var y = so.s.match(/\b(1[0-9]{3}|20[0-9]{2})\b/)[1];
      byTech.hist.push({ technique: 'Histoire et découpage', concept: shorten(so.s, 110),
        tip: 'Découpe ' + y + ' en deux blocs (' + y.slice(0, 2) + ' et ' + y.slice(2) + ') et imagine une scène qui relie ces nombres à l’événement. Raconte-la en une phrase, puis vérifie la date.' });
    });
    A.defs.forEach(function (d) {
      byTech.feyn.push({ technique: 'Technique de Feynman', concept: d.term,
        tip: 'Explique « ' + d.term + ' » à voix haute comme à un élève de 10 ans, sans regarder le cours. Compare avec la définition du cours : ' + shorten(d.def, 140) + '. Reprends ce qui manque.' });
    });
    for (var i = 0; i + 1 < A.defs.length && byTech.assoc.length < 4; i += 2) {
      byTech.assoc.push({ technique: 'Association d’images', concept: A.defs[i].term + ' / ' + A.defs[i + 1].term,
        tip: 'Dessine ou imagine une scène qui réunit « ' + A.defs[i].term + ' » (' + shorten(A.defs[i].def, 70) + ') et « ' + A.defs[i + 1].term + ' » (' + shorten(A.defs[i + 1].def, 70) + '). Plus l’image est absurde, mieux tu t’en souviens.' });
    }
    var order = ['acro', 'phrase', 'palais', 'hist', 'feyn', 'assoc'], g = 0;
    while (items.length < count && g++ < 200) {
      var any = false;
      order.forEach(function (k) { if (items.length < count && byTech[k].length) { items.push(byTech[k].shift()); any = true; } });
      if (!any) break;
    }
    if (!items.length && A.keywords.length >= 3) {
      var kw = A.keywords.slice(0, 6), ac = acronymOf(kw);
      items.push({ technique: 'Regroupement (chunking)', concept: 'Mots-clés du cours', tip: 'Regroupe en deux ou trois paquets : ' + kw.join(', ') + '. Invente une courte histoire qui les enchaîne.' });
    }
    return items;
  };

  OFF.mindmap = function (doc) {
    var A = analyse(docText(doc));
    function sentLabel(s) { return cap(shorten(s.replace(/^(?:Le |La |Les |L['’])/, '').replace(/[.]$/, ''), 60)); }
    function topWords(str, n) {
      var seen = {}, arr = [];
      (str.match(/[A-Za-zÀ-ÿ’'-]+/g) || []).forEach(function (w) {
        var nn = norm(w); if (nn.length < 4 || STOP[nn]) return;
        var st = stem(nn); if (seen[st]) return; seen[st] = 1; arr.push({ w: w, sc: A.tf[st] || 0 });
      });
      arr.sort(function (a, b) { return b.sc - a.sc; });
      return arr.slice(0, n).map(function (x) { return x.w; });
    }
    function contentOf(sec) {
      var kids = [];
      A.defs.filter(function (d) { return d.sec === sec.pos; }).forEach(function (d) { kids.push({ label: d.term, children: [{ label: shorten(d.def, 60), children: [] }] }); });
      sec.lists.forEach(function (l) {
        if (l.intro) kids.push({ label: shorten(cap(l.intro), 50), children: l.items.slice(0, 8).map(function (x) { return { label: shorten(x, 50), children: [] }; }) });
        else l.items.slice(0, 8).forEach(function (x) { kids.push({ label: shorten(x, 50), children: [] }); });
      });
      if (kids.length < 3) {
        var defSents = {}; A.defs.forEach(function (d) { defSents[d.sentence] = 1; });
        A.sentences.filter(function (x) { return x.sec === sec.pos && !defSents[x.s] && x.s.length > 30; })
          .sort(function (a, b) { return b.score - a.score; }).slice(0, 4 - Math.min(kids.length, 2))
          .forEach(function (x) { kids.push({ label: sentLabel(x.s), children: [] }); });
      }
      return kids.slice(0, 8);
    }
    var heads = A.sections.filter(function (s) { return s.title; });
    var rootLabel = docTitleName(doc);
    var tree;
    if (heads.length >= 2) {
      var top = heads.filter(function (s) { return s.level === 1; });
      if (top.length === 1 && heads.length > 2 && !A.sections.some(function (s) { return !s.title && (s.paras.length || s.lists.length) && s.pos < top[0].pos; })) { rootLabel = top[0].title; }
      var stack = [], rootNode = { label: rootLabel, children: [] };
      var minLevel = rootLabel === (top[0] && top[0].title) && top.length === 1 ? 2 : 1;
      var intro = A.sections.filter(function (s) { return !s.title && (s.paras.length || s.lists.length); })[0];
      if (intro) { var ik = contentOf(intro); if (ik.length) rootNode.children.push({ label: 'Introduction', children: ik.slice(0, 4) }); }
      heads.forEach(function (s) {
        if (rootLabel === s.title && s.level === 1 && minLevel === 2) { var own = contentOf(s); if (own.length) rootNode.children.push({ label: 'Idées générales', children: own.slice(0, 4) }); return; }
        var node = { label: shorten(s.title, 50), children: contentOf(s) };
        var lvl = Math.max(1, s.level - (minLevel - 1));
        while (stack.length && stack[stack.length - 1].lvl >= lvl) stack.pop();
        var parent = stack.length ? stack[stack.length - 1].node : rootNode;
        parent.children.push(node);
        stack.push({ lvl: lvl, node: node });
      });
      tree = rootNode;
    } else {
      // pas de titres : groupes de paragraphes
      var paras = [];
      A.sections.forEach(function (s) { s.paras.forEach(function (p) { if (p.length > 40) paras.push(p); }); });
      var groups = Math.min(6, Math.max(2, Math.round(paras.length / 2)));
      var per = Math.ceil(paras.length / groups) || 1, children = [];
      for (var i = 0; i < paras.length; i += per) {
        var block = paras.slice(i, i + per).join(' ');
        var ss = splitSentences(block).map(function (s) { return { s: s, sc: contentStems(s).reduce(function (a, w) { return a + (A.tf[w] || 0); }, 0) / Math.sqrt(contentStems(s).length + 3) }; })
          .filter(function (x) { return x.s.length > 30; }).sort(function (a, b) { return b.sc - a.sc; }).slice(0, 3);
        var title = cap(topWords(block, 2).join(' et '));
        if (title) children.push({ label: title, children: ss.map(function (x) { return { label: sentLabel(x.s), children: [] }; }) });
      }
      tree = { label: rootLabel, children: children };
    }
    if (!tree.children.length) {
      tree.children = A.keywords.slice(0, 6).map(function (k) { return { label: cap(k), children: [] }; });
    }
    return tree;
  };

  var LEN = { court: { per: 1, defs: 6, dates: 4 }, moyen: { per: 2, defs: 12, dates: 8 }, long: { per: 4, defs: 24, dates: 14 } };

  OFF.summary = function (doc, opts) {
    var A = analyse(docText(doc)), L = LEN[opts.length] || LEN.moyen;
    var title = docTitleName(doc), md = ['# Fiche de synthèse : ' + title, ''];
    var boldTerms = A.defs.map(function (d) { return d.base; }).concat(A.boldList).filter(function (x) { return x.length >= 3; })
      .sort(function (a, b) { return b.length - a.length; }).slice(0, 40);
    function emph(s) {
      boldTerms.forEach(function (b) {
        var re = new RegExp('(^|[^A-Za-zÀ-ÿ0-9*])(' + esc(b) + ')(?![A-Za-zÀ-ÿ0-9*])', 'i');
        s = s.replace(re, '$1**$2**');
      });
      return s.replace(/\*\*\*\*/g, '');
    }
    var nSec = A.sections.filter(function (s) { return s.title; }).length;
    md.push('> Résumé automatique extractif : ' + A.sentences.length + ' phrases analysées, ' + (nSec || 1) + ' partie(s). Les phrases retenues sont celles du cours, dans l’ordre.', '');
    var sections = A.sections;
    if (nSec < 2) { // regroupe en parties artificielles
      var all = A.sentences, groups = Math.min(5, Math.max(1, Math.round(all.length / 6))), per = Math.ceil(all.length / groups) || 1;
      sections = [];
      for (var i = 0; i < all.length; i += per) {
        var part = all.slice(i, i + per);
        var kw = Object.keys(A.tf).filter(function () { return false; });
        var words = {}; part.forEach(function (x) { contentStems(x.s).forEach(function (w) { words[w] = (words[w] || 0) + (A.tf[w] || 0); }); });
        var top = Object.keys(words).sort(function (a, b) { return words[b] - words[a]; }).slice(0, 2).map(function (w) { return cap(A.surface(w)); });
        sections.push({ title: top.join(' et ') || 'Partie ' + (sections.length + 1), level: 2, sents: part, lists: [] });
      }
    }
    var hOff = (sections[0] && sections[0].title && sections[0].level === 1 && !sections[0].paras.length && !sections[0].lists.length && sections.length > 1 && sections.slice(1).every(function (x) { return x.level > 1; })) ? 1 : 0;
    sections.forEach(function (sec) {
      var sents = sec.sents || A.sentences.filter(function (x) { return x.sec === sec.pos; });
      var hasLists = sec.lists && sec.lists.length && opts.length !== 'court';
      if (!sents.length && !hasLists) return;
      var h = '#'.repeat(Math.min(4, Math.max(2, (sec.title ? sec.level : 1) + 1 - hOff)));
      md.push(h + ' ' + (sec.title || 'Introduction'), '');
      var k = L.per;
      sents.slice().sort(function (a, b) { return b.score - a.score; }).slice(0, k).sort(function (a, b) { return A.sentences.indexOf(a) - A.sentences.indexOf(b); })
        .forEach(function (x) { md.push('- ' + emph(x.s)); });
      if (hasLists) sec.lists.forEach(function (l) {
        if (l.intro) md.push('- ' + cap(l.intro) + ' :');
        l.items.slice(0, 10).forEach(function (it) { md.push('  - ' + it); });
      });
      md.push('');
    });
    if (A.defs.length) {
      md.push('## Définitions à retenir', '');
      A.defs.slice(0, L.defs).forEach(function (d) { md.push('- **' + d.term + '** : ' + d.def + '.'); });
      md.push('');
    }
    var dated = A.sentences.filter(function (x) { return /\b(1[0-9]{3}|20[0-9]{2})\b/.test(x.s) && x.s.length < 220; });
    if (dated.length) {
      md.push('## Dates et chiffres clés', '');
      dated.slice(0, L.dates).forEach(function (x) { md.push('- ' + x.s.replace(/\b(1[0-9]{3}|20[0-9]{2})\b/, '**$1**')); });
      md.push('');
    }
    if (A.keywords.length) { md.push('## Mots-clés', '', A.keywords.slice(0, 12).map(function (k) { return '`' + k + '`'; }).join(' · '), ''); }
    return md.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  };

  /* recherche par mots-clés (utilisée hors-ligne et pour sourcer l'IA) */
  function passages(text) {
    var out = [];
    chunks(text, 600).forEach(function (c) { out.push(c); });
    return out;
  }
  function relevant(text, question, n) {
    var A = analyse(text), q = contentStems(question), N = Math.max(A.sentences.length, 1);
    if (!q.length) return { passages: [], sentences: [] };
    var df = {};
    A.sentences.forEach(function (so) { var seen = {}; contentStems(so.s).forEach(function (w) { if (!seen[w]) { seen[w] = 1; df[w] = (df[w] || 0) + 1; } }); });
    function sc(str) {
      var st = {}; contentStems(str).forEach(function (w) { st[w] = 1; });
      var s = 0; q.forEach(function (w) { if (st[w]) s += Math.log(1 + N / (1 + (df[w] || 0))); });
      return s;
    }
    var sents = A.sentences.map(function (so, i) { return { s: so.s, i: i, sc: sc(so.s) }; }).filter(function (x) { return x.sc > 0; }).map(function (x) { if (A.sentences[x.i].isDef) x.sc += 0.3; return x; }).sort(function (a, b) { return b.sc - a.sc; });
    var ps = passages(A.plain).map(function (p) { return { p: p, sc: sc(p) }; }).filter(function (x) { return x.sc > 0; }).sort(function (a, b) { return b.sc - a.sc; });
    return { passages: ps.slice(0, n || 3).map(function (x) { return x.p; }), sentences: sents.slice(0, 4), A: A };
  }

  OFF.ask = function (doc, question) {
    var text = docText(doc), A = analyse(text), q = String(question || '').trim();
    if (!q) throw GenError('Pose une question pour que je cherche dans le cours.', 'empty');
    var mm = q.match(/(?:qu['’]est-ce que|qu['’]est ce que|que (?:signifie|désigne|veut dire)|c['’]est quoi|définis?|définition de|qui est|que sont)\s*(?:les?|la|l['’]|un|une|des)?\s*(.+?)\s*\??$/i);
    if (mm) {
      var key = norm(mm[1]);
      var d = A.defs.filter(function (x) { return norm(x.base) === key || norm(x.base).indexOf(key) === 0 || key.indexOf(norm(x.base)) === 0; })[0];
      if (d) return { answer: d.sentence, sources: [d.sentence] };
    }
    var r = relevant(text, q, 3);
    if (!r.sentences.length) return { answer: 'Je n’ai rien trouvé à ce sujet dans ce cours. Essaie avec d’autres mots-clés.', sources: [] };
    var top = r.sentences.slice(0, 3).filter(function (x) { return x.sc >= r.sentences[0].sc * 0.5; }).sort(function (a, b) { return a.i - b.i; });
    return { answer: top.map(function (x) { return x.s; }).join(' '), sources: r.passages.length ? r.passages : top.map(function (x) { return x.s; }) };
  };

  /* ------------------------------------------------------------------ réparation JSON */

  function repairJSON(raw) {
    if (raw && typeof raw === 'object') return raw;
    var s = String(raw || '').trim();
    s = s.replace(/^﻿/, '').replace(/```(?:json|JSON)?/g, '').trim();
    try { return JSON.parse(s); } catch (e) { /* suite */ }
    var a = s.search(/[\[{]/);
    if (a < 0) throw new Error('no json');
    s = s.slice(a);
    // parcours : nettoie guillemets typographiques hors chaînes, échappe retours ligne dans les chaînes, ferme ce qui manque
    var out = '', inStr = false, esc_ = false, stack = [];
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (inStr) {
        if (esc_) { out += c; esc_ = false; continue; }
        if (c === '\\') { out += c; esc_ = true; continue; }
        if (c === '"') {
          // guillemet fermant ? sinon (guillemet non échappé dans le texte) on l'échappe
          var rest = s.slice(i + 1).match(/^\s*(.)/);
          if (!rest || /[,}\]:]/.test(rest[1])) { inStr = false; out += c; } else out += '\\"';
          continue;
        }
        if (c === '\n') { out += '\\n'; continue; }
        if (c === '\r') continue;
        if (c === '\t') { out += ' '; continue; }
        out += c; continue;
      }
      if (c === '“' || c === '”') { c = '"'; }
      if (c === '"') { inStr = true; out += c; continue; }
      if (c === '{' || c === '[') { stack.push(c); out += c; continue; }
      if (c === '}' || c === ']') {
        out = out.replace(/,\s*$/, '');
        var top = stack[stack.length - 1];
        if ((c === '}' && top === '{') || (c === ']' && top === '[')) { stack.pop(); out += c; if (!stack.length) break; }
        continue;
      }
      out += c;
    }
    if (inStr) out += '"';
    out = out.replace(/,\s*$/, '').replace(/:\s*$/, ': null');
    // si fin tronquée au milieu d'une paire clé sans valeur
    out = out.replace(/,\s*"[^"]*"\s*$/, '');
    while (stack.length) { out = out.replace(/,\s*$/, ''); out += stack.pop() === '{' ? '}' : ']'; }
    out = out.replace(/,(\s*[}\]])/g, '$1');
    try { return JSON.parse(out); } catch (e2) { throw new Error('json illisible'); }
  }

  /* ------------------------------------------------------------------ moteur IA */

  var DEFAULT_MODEL = { anthropic: 'claude-haiku-4-5', openai: 'gpt-4o-mini', gemini: 'gemini-2.0-flash' };
  var PROVIDER_NAME = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Google Gemini' };

  function aiConfig() {
    var s = settings(), p = s.provider;
    // Confiance : sans accord d'un parent / professeur (settings.aiConsent === true), l'IA reste désactivée.
    if (p && p !== 'none' && PROVIDER_NAME[p] && s.apiKey && String(s.apiKey).trim() && s.aiConsent === true) {
      return { provider: p, key: String(s.apiKey).trim(), model: (s.model && String(s.model).trim()) || DEFAULT_MODEL[p] };
    }
    return null;
  }
  function useAI(opts) { return !(opts && opts.offline) && !!aiConfig(); }

  function httpMessage(provider, status, body) {
    var n = PROVIDER_NAME[provider] || provider, detail = '';
    try {
      var j = JSON.parse(body);
      detail = (j.error && (j.error.message || j.error.status)) || j.message || '';
      if (typeof detail !== 'string') detail = JSON.stringify(detail);
    } catch (e) { detail = String(body || '').slice(0, 160); }
    detail = detail ? ' (' + shorten(detail, 180) + ')' : '';
    if (status === 401) return 'La clé API a été refusée par ' + n + '. Vérifie-la dans Réglages' + detail + '.';
    if (status === 403) return 'Accès refusé par ' + n + ' : clé sans droits, région non autorisée ou facturation à activer' + detail + '.';
    if (status === 404) return 'Modèle introuvable chez ' + n + '. Vérifie le nom du modèle dans Réglages' + detail + '.';
    if (status === 400) return n + ' a refusé la requête (document trop long ou modèle incompatible ?)' + detail + '.';
    if (status === 413) return 'Le document est trop volumineux pour ' + n + '.';
    if (status === 429) return 'Limite de requêtes ou quota atteint chez ' + n + '. Attends un peu ou vérifie ton crédit' + detail + '.';
    if (status >= 500) return n + ' est momentanément indisponible (erreur ' + status + '). Réessaie dans un instant.';
    return 'Erreur ' + status + ' renvoyée par ' + n + detail + '.';
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function callAI(system, user, o) {
    o = o || {};
    var cfg = aiConfig();
    if (!cfg) return Promise.reject(GenError('Aucune clé API configurée. Ajoute-la dans Réglages ou utilise le mode hors-ligne.', 'nokey'));
    var url, headers = { 'Content-Type': 'application/json' }, body;
    if (cfg.provider === 'anthropic') {
      url = 'https://api.anthropic.com/v1/messages';
      headers['x-api-key'] = cfg.key; headers['anthropic-version'] = '2023-06-01'; headers['anthropic-dangerous-direct-browser-access'] = 'true';
      body = { model: cfg.model, max_tokens: o.maxTokens || 4096, temperature: 0.4, system: system, messages: [{ role: 'user', content: user }] };
    } else if (cfg.provider === 'openai') {
      url = 'https://api.openai.com/v1/chat/completions';
      headers['Authorization'] = 'Bearer ' + cfg.key;
      body = { model: cfg.model, temperature: 0.4, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
      if (o.json !== false) body.response_format = { type: 'json_object' };
    } else {
      url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(cfg.model) + ':generateContent';
      headers['x-goog-api-key'] = cfg.key;
      body = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: o.maxTokens || 8192, responseMimeType: o.json === false ? 'text/plain' : 'application/json' } };
    }
    var attempt = 0;
    function once() {
      attempt++;
      var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var timer = ctl ? setTimeout(function () { ctl.abort(); }, 120000) : null;
      return fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
        .then(function (res) {
          if (timer) clearTimeout(timer);
          return res.text().then(function (txt) {
            if (!res.ok) {
              if ((res.status === 429 || res.status >= 500) && attempt < 2) return sleep(2000).then(once);
              throw GenError(httpMessage(cfg.provider, res.status, txt), 'http', res.status);
            }
            var j; try { j = JSON.parse(txt); } catch (e) { throw GenError('Réponse inattendue de ' + PROVIDER_NAME[cfg.provider] + '.', 'format'); }
            var out = '';
            if (cfg.provider === 'anthropic') out = (j.content || []).map(function (b) { return b.text || ''; }).join('');
            else if (cfg.provider === 'openai') out = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '';
            else {
              if (j.promptFeedback && j.promptFeedback.blockReason) throw GenError('Gemini a bloqué la demande (' + j.promptFeedback.blockReason + ').', 'blocked');
              var parts = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts || [];
              out = parts.map(function (p) { return p.text || ''; }).join('');
            }
            if (!out.trim()) throw GenError('L’IA a renvoyé une réponse vide. Réessaie.', 'empty-response');
            return out;
          });
        }, function (err) {
          if (timer) clearTimeout(timer);
          if (err && err.name === 'AbortError') throw GenError('Le fournisseur IA met trop de temps à répondre. Réessaie avec un document plus court.', 'timeout');
          if (attempt < 2 && !(err && err.code)) return sleep(1500).then(once);
          throw GenError('Impossible de joindre ' + PROVIDER_NAME[cfg.provider] + '. Vérifie ta connexion Internet (ou une extension qui bloque la requête).', 'network');
        });
    }
    return once();
  }

  function callJSON(system, user, o) {
    return callAI(system, user, o).then(function (txt) {
      try { return repairJSON(txt); }
      catch (e) {
        // une seconde tentative demandant de corriger
        return callAI(system, user + '\n\nATTENTION : ta réponse précédente n’était pas du JSON valide. Réponds uniquement par un objet JSON valide.', o).then(function (t2) {
          try { return repairJSON(t2); } catch (e2) { throw GenError('L’IA a renvoyé une réponse illisible (JSON invalide). Réessaie.', 'json'); }
        });
      }
    });
  }

  var SYS = 'Tu es un assistant pédagogique pour des élèves et étudiants francophones. Tu réponds UNIQUEMENT par un objet JSON valide (guillemets doubles, pas de virgule finale), sans texte autour ni balises markdown. ' +
    'Tout le contenu est en français. Tu t’appuies exclusivement sur le texte du cours fourni : n’invente aucune information, date ou chiffre absents du cours.';

  var MAX_CHUNKS = 6, CHUNK_SIZE = 9000;

  // découpe un document pour l'IA : renvoie au plus MAX_CHUNKS blocs (échantillonnés régulièrement si le cours est énorme)
  function aiChunks(text) {
    var cs = chunks(text, CHUNK_SIZE);
    if (cs.length <= MAX_CHUNKS) return { list: cs, truncated: false };
    var pick = [];
    for (var i = 0; i < MAX_CHUNKS; i++) pick.push(cs[Math.floor(i * cs.length / MAX_CHUNKS)]);
    return { list: pick, truncated: true };
  }

  function perChunk(total, n) { return n <= 1 ? total : Math.ceil(total / n) + 1; }
  function dedupeBy(arr, keyFn) { var seen = {}; return arr.filter(function (x) { var k = norm(keyFn(x)).replace(/\W+/g, ' ').trim(); if (seen[k]) return false; seen[k] = 1; return true; }); }

  var progressKind = null;   // type de génération en cours (renseigné par l'enveloppe gen:start ci-dessous)
  function progress(done, total) { if (Studio.bus && progressKind) Studio.bus.emit('gen:progress', { kind: progressKind, done: done, total: total }); }
  function runChunks(text, makePrompt, extract) {
    var ch = aiChunks(text), results = [];
    var p = Promise.resolve();
    ch.list.forEach(function (c, i) {
      p = p.then(function () { return callJSON(SYS, makePrompt(c, ch.list.length, i)); }).then(function (j) { results = results.concat(extract(j) || []); progress(i + 1, ch.list.length); });
    });
    return p.then(function () { return results; });
  }

  /* ------------------------------------------------------------------ sources (confiance)
   * Chaque carte / question porte `source` : extrait du cours (≤ 240 car.) d'où elle vient.
   * Une source donnée par l'IA n'est gardée que si elle existe vraiment dans le texte ; sinon on
   * retombe sur la phrase du cours la plus proche. */
  var SRC_MAX = 240;
  function sqz(s) { return norm(s).replace(/[^a-z0-9]+/g, ' ').trim(); }
  function clipSrc(s) {
    s = clean(s);
    if (s.length <= SRC_MAX) return s;
    var cut = s.slice(0, SRC_MAX - 1), sp = cut.lastIndexOf(' ');
    return (sp > 120 ? cut.slice(0, sp) : cut).replace(/[\s.,;:]+$/, '') + '…';
  }
  /* Chercheur de sources : index inversé (racine de mot -> phrases) construit une fois ; chaque recherche ne regarde
     que les phrases qui partagent au moins un mot avec la question (au lieu de toutes les phrases du cours). */
  function* finderG(text) {
    var plainText = String(text || '').replace(/^[ \t]{0,3}#{1,6}[ \t]+(.*)$/gm, '$1.\n').replace(/^[ \t]*[-*•]\s+/gm, '');
    var sents = splitSentences(plainText).map(function (x) { return clean(x.replace(/\*\*|__/g, '')); }).filter(function (x) { return x.length >= 25; });
    yield 1;
    var info = [], post = Object.create(null), t0 = Date.now();
    for (var i = 0; i < sents.length; i++) {
      (function (x, idx) {
        var st = {}, n = 0; contentStems(x).forEach(function (w) { if (!st[w]) { st[w] = 1; n++; (post[w] = post[w] || []).push(idx); } });
        info.push({ s: x, z: sqz(x), n: n });
      })(sents[i], i);
      if ((i & 127) === 127 && Date.now() - t0 > 12) { yield 1; t0 = Date.now(); }
    }
    yield 1;
    var whole = ' ' + sqz(text) + ' ';
    function nearest(q) {
      var qs = {}, qk = []; contentStems(q).forEach(function (w) { if (!qs[w]) { qs[w] = 1; qk.push(w); } });
      var qz = ' ' + sqz(q) + ' ', best = null, bs = 0;
      // candidats : phrases qui partagent au moins un mot avec la question (index inversé)
      var cnt = {}, cand = [];
      qk.forEach(function (w) { var l = post[w]; if (l) for (var j = 0; j < l.length; j++) { var k = l[j]; if (cnt[k]) cnt[k]++; else { cnt[k] = 1; cand.push(k); } } });
      cand.sort(function (a, b) { return a - b; });
      // 1) phrase du cours entièrement contenue dans la question (prioritaire) : tous ses mots sont dans la question
      for (var c = 0; c < cand.length; c++) {
        var it = info[cand[c]];
        if (cnt[cand[c]] === it.n && it.z.length >= 15 && it.z.length + 2 <= qz.length && qz.indexOf(' ' + it.z + ' ') >= 0) { var sc = 100 + it.z.length; if (sc > bs) { bs = sc; best = it; } }
      }
      if (best) return clipSrc(best.s);
      // 2) sinon la phrase qui partage le plus de mots
      for (c = 0; c < cand.length; c++) {
        var it2 = info[cand[c]], sc2 = cnt[cand[c]] / Math.sqrt(it2.n + 2);
        if (sc2 > bs) { bs = sc2; best = it2; }
      }
      return best ? clipSrc(best.s) : '';
    }
    return {
      exists: function (ex) { var z = sqz(ex); return z.length >= 8 && whole.indexOf(' ' + z + ' ') >= 0; },
      find: function (claimed, fallbackQuery) {
        if (claimed && typeof claimed === 'string' && this.exists(claimed)) return clipSrc(claimed);
        return nearest((claimed ? claimed + ' ' : '') + (fallbackQuery || ''));
      }
    };
  }
  function makeSourceFinder(text) { return drive(finderG(text)); }
  function attachSources(doc, items, queryOf) {
    var text = (doc && typeof doc === 'object') ? (doc.text || '') : String(doc || '');
    var f = makeSourceFinder(text);
    items.forEach(function (it) {
      var src = f.find(it.source, queryOf(it));
      if (src) it.source = src; else delete it.source;
    });
    return items;
  }
  /* Version non bloquante : rend la main à l'interface toutes les ~12 ms et signale la progression (onProgress(fait, total)).
     Borne : au-delà de SRC_BUDGET_MS de recherche, les cartes restantes gardent seulement leur source déjà vérifiée. */
  var SRC_BUDGET_MS = 3000;
  function attachSourcesAsync(doc, items, queryOf, onProgress) {
    var text = (doc && typeof doc === 'object') ? (doc.text || '') : String(doc || '');
    return driveAsync(finderG(text)).then(function (f) {
      var t0 = Date.now(), last = t0, i = 0, n = items.length;
      return new Promise(function (resolve) {
        (function loop() {
          while (i < n) {
            var it = items[i++];
            if (Date.now() - t0 > SRC_BUDGET_MS) { if (!(typeof it.source === 'string' && f.exists(it.source))) delete it.source; else it.source = clipSrc(it.source); }
            else { var src = f.find(it.source, queryOf(it)); if (src) it.source = src; else delete it.source; }
            if (Date.now() - last > 12) { last = Date.now(); if (onProgress) onProgress(i, n); return setTimeout(loop, 0); }
          }
          if (onProgress) onProgress(n, n);
          resolve(items);
        })();
      });
    });
  }
  function cardQuery(c) { return [c.front, c.back, c.hint].join(' '); }
  function questionQuery(q) {
    var ans = q.type === 'qcm' && q.choices ? q.choices[q.answer] : (typeof q.answer === 'string' ? q.answer : '');
    return [q.q, q.explain, ans].join(' ');
  }

  /* Génération hors-ligne non bloquante : analyse du cours par étapes (pauses entre les étapes), puis génération,
     puis recherche des sources par lots. Progression réelle sur 100 : analyse 0-40, génération 50, sources 50-95, enregistrement 100. */
  function offRun(doc, gen) {
    return Promise.resolve().then(function () {
      var text = docText(doc);
      progress(0, 100);
      return analyseAsync(text, function (v) { progress(v, 100); });
    }).then(tick).then(function () { var r = gen(); progress(50, 100); return r; });
  }
  function srcProgress(i, n) { progress(50 + Math.round(45 * i / Math.max(1, n)), 100); }

  var AI = {};

  AI.flashcards = function (doc, o) {
    var text = docText(doc), total = o.count || 20, level = o.level ? ' Niveau des élèves : ' + o.level + '.' : '';
    return runChunks(text, function (c, n, i) {
      return 'Crée ' + perChunk(total, n) + ' flashcards de révision à partir de l’extrait de cours ci-dessous (partie ' + (i + 1) + '/' + n + ').' + level + '\n' +
        'Varie les types : définitions, concepts clés, causes/conséquences, dates, listes à retenir. Une seule idée par carte, question courte au recto, réponse concise au verso.\n' +
        'Format JSON strict : {"cards":[{"front":"question","back":"réponse","hint":"indice court (optionnel)","mnemo":"astuce mnémotechnique courte (optionnel)","source":"extrait EXACT du cours, copié mot pour mot (240 caractères max), d’où vient la carte"}]}\n\nCOURS :\n"""\n' + c + '\n"""';
    }, function (j) { return j.cards || j.flashcards || (Array.isArray(j) ? j : []); }).then(function (arr) {
      var cards = dedupeBy(arr.filter(function (c) { return c && typeof c.front === 'string' && typeof c.back === 'string' && c.front.trim() && c.back.trim(); }), function (c) { return c.front; })
        .slice(0, total).map(function (c) {
          var o2 = { front: clean(c.front), back: String(c.back).trim() };
          if (c.hint && typeof c.hint === 'string') o2.hint = clean(c.hint);
          if (c.mnemo && typeof c.mnemo === 'string') o2.mnemo = clean(c.mnemo);
          if (c.source && typeof c.source === 'string') o2.source = c.source;
          return o2;
        });
      if (!cards.length) throw GenError('L’IA n’a produit aucune carte exploitable. Réessaie.', 'json');
      return cards;
    });
  };

  function normQuestion(q) {
    if (!q || typeof q !== 'object' || typeof q.q !== 'string' || !q.q.trim()) return null;
    var type = String(q.type || '').toLowerCase();
    if (type === 'mcq' || type === 'qcm') type = 'qcm';
    if (type === 'vrai_faux' || type === 'tf' || type === 'truefalse' || type === 'vf') type = 'vf';
    if (type === 'trou' || type === 'cloze' || type === 'fill') type = 'fill';
    if (type === 'ouverte' || type === 'open') type = 'open';
    var out = { id: uid(), type: type, q: String(q.q).trim(), source: typeof q.source === 'string' ? q.source : undefined, explain: typeof q.explain === 'string' ? q.explain.trim() : '', difficulty: Math.max(1, Math.min(3, Math.round(+q.difficulty) || 2)) };
    if (type === 'qcm') {
      if (!Array.isArray(q.choices)) return null;
      var ch = q.choices.map(function (c) { return String(c).trim(); }).filter(Boolean);
      if (ch.length < 2) return null;
      var a = q.answer, idx = -1;
      if (typeof a === 'number') idx = a; else if (typeof a === 'string') { idx = /^\d+$/.test(a.trim()) ? +a : ch.findIndex(function (c) { return norm(c) === norm(a); }); if (idx < 0 && /^[A-Da-d]$/.test(a.trim())) idx = a.trim().toUpperCase().charCodeAt(0) - 65; }
      if (!(idx >= 0 && idx < ch.length)) return null;
      out.choices = ch; out.answer = idx;
    } else if (type === 'vf') {
      var v = q.answer;
      if (typeof v === 'string') v = /^(vrai|true|oui)$/i.test(v.trim()) ? true : (/^(faux|false|non)$/i.test(v.trim()) ? false : null);
      if (typeof v !== 'boolean') return null;
      out.answer = v;
    } else if (type === 'fill') {
      if (q.answer == null || !String(q.answer).trim()) return null;
      out.answer = String(q.answer).trim();
      if (!/_{3,}/.test(out.q)) { var b = blankOut(out.q, out.answer); if (!b) return null; out.q = b; }
      out.q = out.q.replace(/_{3,}/g, '____');
    } else if (type === 'open') {
      if (q.answer == null || !String(q.answer).trim()) return null;
      out.answer = String(q.answer).trim();
    } else return null;
    if (!out.source) delete out.source;
    return out;
  }

  AI.quiz = function (doc, o) {
    var text = docText(doc), total = o.count || 10, types = (o.types && o.types.length) ? o.types : ['qcm', 'vf', 'fill', 'open'];
    var diff = o.difficulty ? ' Difficulté visée : ' + o.difficulty + ' (1 facile, 3 difficile).' : '';
    return runChunks(text, function (c, n, i) {
      return 'Crée ' + perChunk(total, n) + ' questions de quiz à partir de l’extrait de cours ci-dessous (partie ' + (i + 1) + '/' + n + '). Types autorisés et répartis équitablement : ' + types.join(', ') + '.' + diff + '\n' +
        'Règles : qcm = 4 choix plausibles, "answer" = index (0 à 3) de la bonne réponse ; vf = "answer" est un booléen true/false ; fill = "q" contient exactement "____" à la place du mot manquant, "answer" = le mot ; open = "answer" est une réponse modèle de 1 à 3 phrases. ' +
        '"explain" justifie brièvement avec le cours. "difficulty" vaut 1, 2 ou 3.\n' +
        'Format JSON strict : {"questions":[{"type":"qcm","q":"...","choices":["...","...","...","..."],"answer":0,"explain":"...","difficulty":2,"source":"extrait EXACT du cours, copié mot pour mot (240 caractères max), d’où vient la question"}]}\n\nCOURS :\n"""\n' + c + '\n"""';
    }, function (j) { return j.questions || (Array.isArray(j) ? j : []); }).then(function (arr) {
      var qs = dedupeBy(arr.map(normQuestion).filter(function (q) { return q && types.indexOf(q.type) >= 0; }), function (q) { return q.q; });
      if (qs.length > total) { // garde un mélange équilibré
        var by = {}; qs.forEach(function (q) { (by[q.type] = by[q.type] || []).push(q); });
        var keep = [], g = 0;
        while (keep.length < total && g++ < 100) types.forEach(function (t) { if (keep.length < total && by[t] && by[t].length) keep.push(by[t].shift()); });
        qs = keep;
      }
      if (!qs.length) throw GenError('L’IA n’a produit aucune question exploitable. Réessaie.', 'json');
      return shuffle(qs);
    });
  };

  AI.summary = function (doc, o) {
    var text = docText(doc), len = o.length || 'moyen', style = o.style ? ' Style : ' + o.style + '.' : '';
    var lenTxt = { court: 'très concise (environ 150 à 250 mots)', moyen: 'équilibrée (environ 350 à 600 mots)', long: 'détaillée (environ 700 à 1100 mots)' }[len] || 'équilibrée';
    var fmt = 'Format JSON strict : {"markdown":"# Titre\\n## Partie\\n- point **terme clé** ..."}. Le markdown utilise des titres (#, ##), des listes à puces, du gras pour les termes clés, et se termine par une section « ## À retenir ».';
    return runChunks(text, function (c, n, i) {
      if (n === 1) return 'Rédige une fiche de synthèse ' + lenTxt + ' du cours ci-dessous, structurée et facile à réviser.' + style + '\n' + fmt + '\n\nCOURS :\n"""\n' + c + '\n"""';
      return 'Rédige une fiche de synthèse détaillée de la partie ' + (i + 1) + '/' + n + ' du cours ci-dessous (elle sera fusionnée ensuite).' + style + '\n' + fmt + '\n\nEXTRAIT :\n"""\n' + c + '\n"""';
    }, function (j) { return [typeof j.markdown === 'string' ? j.markdown : (typeof j.summary === 'string' ? j.summary : '')]; }).then(function (parts) {
      parts = parts.filter(function (p) { return p && p.trim(); });
      if (!parts.length) throw GenError('L’IA n’a pas produit de fiche. Réessaie.', 'json');
      if (parts.length === 1) return parts[0].trim() + '\n';
      return callJSON(SYS, 'Fusionne les fiches partielles ci-dessous en UNE seule fiche de synthèse ' + lenTxt + ', sans répétition, avec un plan cohérent.' + style + '\n' + fmt + '\n\nFICHES PARTIELLES :\n"""\n' + parts.join('\n\n---\n\n') + '\n"""')
        .then(function (j) { var m = typeof j.markdown === 'string' ? j.markdown : ''; return (m.trim() || parts.join('\n\n')).trim() + '\n'; });
    });
  };

  AI.mnemonics = function (doc, o) {
    var text = doc && doc.cards ? doc.cards.map(function (c) { return 'Q : ' + c.front + '\nR : ' + c.back; }).join('\n\n') : docText(doc);
    var total = o.count || 8;
    return runChunks(text, function (c, n) {
      return 'Propose ' + perChunk(total, n) + ' astuces mnémotechniques pour retenir les notions importantes du contenu ci-dessous. Techniques possibles : Acronyme, Phrase-clé (acrostiche), Palais de la mémoire, Histoire/association d’images, Rime, Découpage (chunking), Technique de Feynman. ' +
        'Chaque astuce doit s’appuyer sur des éléments réellement présents dans le cours (cite-les) et expliquer concrètement comment l’appliquer.\n' +
        'Format JSON strict : {"items":[{"technique":"Acronyme","concept":"notion à retenir","tip":"l’astuce détaillée"}]}\n\nCONTENU :\n"""\n' + c + '\n"""';
    }, function (j) { return j.items || (Array.isArray(j) ? j : []); }).then(function (arr) {
      var items = dedupeBy(arr.filter(function (x) { return x && typeof x.tip === 'string' && x.tip.trim() && x.concept; }), function (x) { return x.concept + x.technique; })
        .slice(0, total).map(function (x) { return { technique: clean(x.technique || 'Astuce'), concept: clean(x.concept), tip: String(x.tip).trim() }; });
      if (!items.length) throw GenError('L’IA n’a produit aucune astuce exploitable. Réessaie.', 'json');
      return items;
    });
  };

  function normNode(n, depth) {
    if (!n) return null;
    if (typeof n === 'string') return { label: shorten(n, 80), children: [] };
    var label = n.label || n.title || n.name; if (!label) return null;
    var kids = (depth < 4 && Array.isArray(n.children)) ? n.children.map(function (k) { return normNode(k, depth + 1); }).filter(Boolean) : [];
    return { label: shorten(String(label), 80), children: kids };
  }
  AI.mindmap = function (doc) {
    var text = docText(doc), title = docTitleName(doc);
    return runChunks(text, function (c, n, i) {
      return 'Construis une carte mentale ' + (n > 1 ? '(partie ' + (i + 1) + '/' + n + ' du cours) ' : '') + 'du cours ci-dessous : une racine, 3 à 7 branches principales, chacune avec 2 à 5 sous-branches (profondeur maximale 3). Libellés courts (moins de 8 mots).\n' +
        'Format JSON strict : {"root":{"label":"Sujet","children":[{"label":"Branche","children":[{"label":"Détail","children":[]}]}]}}\n\nCOURS :\n"""\n' + c + '\n"""';
    }, function (j) { return [j.root || j]; }).then(function (roots) {
      var nodes = roots.map(function (r) { return normNode(r, 0); }).filter(Boolean);
      if (!nodes.length) throw GenError('L’IA n’a pas produit de carte mentale exploitable. Réessaie.', 'json');
      if (nodes.length === 1) return nodes[0];
      return { label: title, children: nodes.reduce(function (a, n) { return a.concat(n.children.length ? n.children : [n]); }, []).slice(0, 14) };
    });
  };

  AI.ask = function (doc, question) {
    var text = docText(doc), r = relevant(text, question, 4);
    var ctx = text.length <= 14000 ? text : (r.passages.length ? r.passages.join('\n\n---\n\n') : chunks(text, 4000).slice(0, 3).join('\n\n---\n\n'));
    var sys = 'Tu es un tuteur bienveillant pour des élèves de 12-13 ans. Tu réponds en français, avec des phrases courtes et simples, UNIQUEMENT à partir du cours fourni. ' +
      'Si la réponse n’y figure pas, dis-le franchement au lieu d’inventer. Refuse poliment tout sujet hors du cours ou personnel (toi, l’élève, sa vie privée). ' +
      'Ne demande JAMAIS d’informations personnelles (nom, adresse, école, téléphone, photo…). Pour un sujet sérieux (santé, sécurité, mal-être, harcèlement), dis à l’élève d’en parler à un adulte de confiance. ' +
      'Tu peux utiliser du markdown simple.';
    return callAI(sys, 'COURS :\n"""\n' + ctx + '\n"""\n\nQUESTION : ' + question, { json: false, maxTokens: 1500 }).then(function (a) {
      return { answer: a.trim(), sources: r.passages.length ? r.passages : [shorten(ctx, 400)] };
    });
  };

  /* ------------------------------------------------------------------ API publique */

  function tag(obj, engine) { try { Object.defineProperty(obj, 'engine', { value: engine, enumerable: false, configurable: true }); } catch (e) { /* ignore */ } return obj; }
  function wrap(fn) { return function () { try { return Promise.resolve(fn.apply(null, arguments)); } catch (e) { return Promise.reject(e); } }; }

  var gen = {
    available: function () {
      var c = aiConfig(), s = settings();
      var keyed = !!(s.provider && s.provider !== 'none' && s.apiKey && String(s.apiKey).trim());
      return { ai: !!c, provider: c ? c.provider : 'none', needsConsent: keyed && !c && s.aiConsent !== true };
    },
    chunks: chunks,

    flashcards: wrap(function (doc, opts) {
      opts = opts || {}; var ia = useAI(opts);
      return (ia ? AI.flashcards(doc, opts) : offRun(doc, function () { return OFF.flashcards(doc, opts); })).then(function (list) {
        if (!list.length) throw GenError('Je n’ai pas trouvé assez de matière pour créer des flashcards. Ajoute un cours plus développé ou active l’IA dans Réglages.', 'nomaterial');
        var now = Date.now();
        return attachSourcesAsync(doc, list, cardQuery, ia ? null : srcProgress).then(function (withSrc) {
          var deck = { id: uid(), docId: doc.id, title: 'Flashcards : ' + docTitleName(doc), createdAt: now,
            engine: ia ? 'ia' : 'hors-ligne',
            cards: withSrc.map(function (c) {
              var card = { id: uid(), front: c.front, back: c.back, box: 0, ease: 2.5, interval: 0, reps: 0, lapses: 0, due: now };
              if (c.hint) card.hint = c.hint; if (c.mnemo) card.mnemo = c.mnemo; if (c.source) card.source = c.source; return card;
            }) };
          var saved = tag(save('decks', deck), ia ? 'ia' : 'hors-ligne'); progress(100, 100); return saved;
        });
      });
    }),

    quiz: wrap(function (doc, opts) {
      opts = opts || {}; var ia = useAI(opts);
      return (ia ? AI.quiz(doc, opts) : offRun(doc, function () { return OFF.quiz(doc, opts); })).then(function (qs) {
        if (!qs.length) throw GenError('Je n’ai pas trouvé assez de matière pour créer un quiz. Ajoute un cours plus développé ou active l’IA dans Réglages.', 'nomaterial');
        return attachSourcesAsync(doc, qs, questionQuery, ia ? null : srcProgress).then(function (withSrc) {
          var quiz = { id: uid(), docId: doc.id, title: 'Quiz : ' + docTitleName(doc), createdAt: Date.now(), engine: ia ? 'ia' : 'hors-ligne', questions: withSrc, history: [] };
          var saved = tag(save('quizzes', quiz), ia ? 'ia' : 'hors-ligne'); progress(100, 100); return saved;
        });
      });
    }),

    summary: wrap(function (doc, opts) {
      opts = opts || {}; var ia = useAI(opts);
      return (ia ? AI.summary(doc, opts) : Promise.resolve(OFF.summary(doc, opts))).then(function (md) {
        var s = { id: uid(), docId: doc.id, title: 'Synthèse : ' + docTitleName(doc), createdAt: Date.now(), markdown: md };
        return tag(save('summaries', s), ia ? 'ia' : 'hors-ligne');
      });
    }),

    mnemonics: wrap(function (src, opts) {
      opts = opts || {}; var ia = useAI(opts);
      var name = src && src.cards ? String(src.title || 'Cartes').replace(/^Flashcards\s*:\s*/, '') : docTitleName(src);
      return (ia ? AI.mnemonics(src, opts) : Promise.resolve(OFF.mnemonics(src, opts))).then(function (items) {
        if (!items.length) throw GenError('Je n’ai pas trouvé de listes, de dates ou de définitions sur lesquelles construire des astuces. Active l’IA dans Réglages pour de meilleurs résultats.', 'nomaterial');
        var m = { id: uid(), docId: src.docId || src.id, title: 'Mnémotechniques : ' + name, createdAt: Date.now(), items: items };
        if (src && src.cards) m.docId = src.docId;
        return tag(save('mnemos', m), ia ? 'ia' : 'hors-ligne');
      });
    }),

    mindmap: wrap(function (doc, opts) {
      opts = opts || {}; var ia = useAI(opts);
      return (ia ? AI.mindmap(doc) : Promise.resolve(OFF.mindmap(doc))).then(function (root) {
        var mm = { id: uid(), docId: doc.id, title: 'Mind map : ' + docTitleName(doc), root: root };
        return tag(save('mindmaps', mm), ia ? 'ia' : 'hors-ligne');
      });
    }),

    ask: wrap(function (doc, question, opts) {
      opts = opts || {};
      var q = String(question || '').trim();
      if (!q) throw GenError('Pose une question pour que je cherche dans le cours.', 'empty');
      // Garde-fous : filtre côté entrée, AVANT tout envoi à l'IA
      var guard = Studio.trust && Studio.trust.screen ? Studio.trust.screen(q) : null;
      if (guard && guard.blocked) return Promise.resolve({ answer: guard.reply, sources: [], blocked: guard.kind });
      return useAI(opts) ? AI.ask(doc, q) : Promise.resolve(OFF.ask(doc, q));
    })
  };

  // exposé pour les tests et pour un éventuel repli manuel
  gen._makeSourceFinder = makeSourceFinder; gen._attachSources = attachSources; gen._attachSourcesAsync = attachSourcesAsync; gen._analyseAsync = analyseAsync; gen._offline = OFF; gen._repairJSON = repairJSON; gen._analyse = analyse; gen._normQuestion = normQuestion; gen._splitSentences = splitSentences;
  // Bureau : événements gen:start / gen:end autour de chaque génération (écoutés par modes/office.js)
  ['flashcards', 'quiz', 'summary', 'mnemonics', 'mindmap', 'ask'].forEach(function (kind) {
    var fn = gen[kind];
    gen[kind] = function () {
      var bus = Studio.bus;
      progressKind = kind;
      if (bus) bus.emit('gen:start', { kind: kind });
      return fn.apply(null, arguments).then(function (r) {
        if (bus) bus.emit('gen:end', { kind: kind, ok: true, result: r });
        return r;
      }, function (e) {
        if (bus) bus.emit('gen:end', { kind: kind, ok: false, error: e });
        throw e;
      });
    };
  });
  Studio.gen = gen;
})();
