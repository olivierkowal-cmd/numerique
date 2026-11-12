/* Studio.files : lecture de fichiers de cours (txt, md, html, docx, pdf) + glisser-déposer. */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var Studio = root.Studio = root.Studio || {};

  var MAX_BYTES = 25 * 1024 * 1024;
  var CDN = {
    mammoth: 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
    pdf: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    pdfWorker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
  };
  var loaders = {};

  function loadScript(url) {
    if (loaders[url]) return loaders[url];
    loaders[url] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url; s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { delete loaders[url]; s.remove(); reject(new Error('cdn')); };
      document.head.appendChild(s);
    });
    return loaders[url];
  }

  function fail(msg) { var e = new Error(msg); e.userMessage = msg; return e; }

  function clean(text) {
    return String(text == null ? '' : text)
      .replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/ /g, ' ')
      .replace(/­/g, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  function countWords(t) { var m = String(t || '').match(/[^\s]+/g); return m ? m.length : 0; }

  function extOf(name) { var m = /\.([a-z0-9]+)$/i.exec(name || ''); return m ? m[1].toLowerCase() : ''; }
  function stripExt(name) { return String(name || '').replace(/\.[a-z0-9]+$/i, ''); }

  function readAs(file, how) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(fail('Impossible de lire « ' + file.name + ' ». Le fichier est peut-être corrompu.')); };
      if (how === 'buffer') r.readAsArrayBuffer(file); else r.readAsText(file, 'UTF-8');
    });
  }

  function htmlToText(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    ['script', 'style', 'noscript', 'template', 'iframe', 'svg'].forEach(function (t) {
      Array.prototype.forEach.call(doc.querySelectorAll(t), function (n) { n.remove(); });
    });
    var out = [];
    (function walk(n) {
      if (n.nodeType === 3) { out.push(n.nodeValue.replace(/\s+/g, ' ')); return; }
      if (n.nodeType !== 1) return;
      var tag = n.tagName.toLowerCase();
      if (tag === 'br') { out.push('\n'); return; }
      var block = /^(p|div|section|article|header|footer|li|ul|ol|table|tr|h[1-6]|blockquote|pre|figure|main|nav|aside)$/.test(tag);
      var h = /^h([1-6])$/.exec(tag);
      if (block) out.push('\n');
      if (h) out.push('\n' + new Array(+h[1] + 1).join('#') + ' ');
      if (tag === 'li') out.push('- ');
      Array.prototype.forEach.call(n.childNodes, walk);
      if (tag === 'td' || tag === 'th') out.push(' | ');
      if (block) out.push('\n');
    })(doc.body || doc.documentElement);
    return out.join('');
  }

  function readDocx(file) {
    return readAs(file, 'buffer').then(function (buf) {
      return (root.mammoth ? Promise.resolve() : loadScript(CDN.mammoth)).catch(function () {
        throw fail('Impossible de charger le lecteur Word (connexion internet nécessaire la première fois). Enregistre plutôt ton cours en .txt ou colle son texte.');
      }).then(function () {
        return root.mammoth.extractRawText({ arrayBuffer: buf });
      }).then(function (r) { return r.value; }, function (e) {
        if (e && e.userMessage) throw e;
        throw fail('Ce fichier Word n’a pas pu être lu. Le format .doc (ancien) n’est pas pris en charge : réenregistre-le en .docx.');
      });
    });
  }

  function readPdf(file) {
    return readAs(file, 'buffer').then(function (buf) {
      return (root.pdfjsLib ? Promise.resolve() : loadScript(CDN.pdf)).catch(function () {
        throw fail('Impossible de charger le lecteur PDF (connexion internet nécessaire la première fois). Essaie un fichier .txt ou colle le texte du cours.');
      }).then(function () {
        var lib = root.pdfjsLib;
        if (!lib) throw fail('Le lecteur PDF n’est pas disponible.');
        lib.GlobalWorkerOptions.workerSrc = CDN.pdfWorker;
        return lib.getDocument({ data: new Uint8Array(buf) }).promise.catch(function (e) {
          if (e && e.name === 'PasswordException') throw fail('Ce PDF est protégé par un mot de passe : retire la protection puis réessaie.');
          throw fail('Ce PDF n’a pas pu être ouvert. Il est peut-être abîmé.');
        });
      }).then(function (pdf) {
        var pages = [], chain = Promise.resolve();
        for (var i = 1; i <= pdf.numPages; i++) (function (n) {
          chain = chain.then(function () { return pdf.getPage(n); }).then(function (p) { return p.getTextContent(); }).then(function (tc) {
            var line = '', lastY = null, lines = [];
            tc.items.forEach(function (it) {
              if (typeof it.str !== 'string') return;
              var y = it.transform ? Math.round(it.transform[5]) : 0;
              if (lastY !== null && Math.abs(y - lastY) > 2) { lines.push(line); line = ''; }
              line += it.str + (it.hasEOL ? '\n' : ''); lastY = y;
            });
            lines.push(line);
            pages.push(lines.join('\n'));
          });
        })(i);
        return chain.then(function () {
          var t = pages.join('\n\n').replace(/(\w)-\n(\w)/g, '$1$2').replace(/([^\n.!?:;])\n(?=[a-zà-ÿ])/g, '$1 ');
          return t;
        });
      });
    });
  }

  function read(file) {
    return new Promise(function (resolve, reject) {
      if (!file || !file.name) return reject(fail('Aucun fichier reçu.'));
      var ext = extOf(file.name), type = file.type || '';
      if (file.size > MAX_BYTES) return reject(fail('« ' + file.name + ' » est trop lourd (' + Math.round(file.size / 1048576) + ' Mo, maximum 25 Mo).'));
      if (/^image\//.test(type) || /^(png|jpe?g|gif|webp|bmp|heic|svg)$/.test(ext))
        return reject(fail('Les images ne sont pas prises en charge. Recopie le texte ou utilise un PDF contenant du texte.'));
      var kind, p;
      if (ext === 'pdf' || type === 'application/pdf') { kind = 'pdf'; p = readPdf(file); }
      else if (ext === 'docx') { kind = 'docx'; p = readDocx(file); }
      else if (ext === 'doc' || ext === 'odt' || ext === 'rtf' || ext === 'pptx' || ext === 'xlsx')
        return reject(fail('Le format .' + ext + ' n’est pas pris en charge. Enregistre-le en .docx, .pdf ou .txt.'));
      else if (ext === 'html' || ext === 'htm') { kind = 'html'; p = readAs(file, 'text').then(htmlToText); }
      else if (ext === 'md' || ext === 'markdown') { kind = 'md'; p = readAs(file, 'text'); }
      else if (ext === 'txt' || ext === '' || /^text\//.test(type)) { kind = 'txt'; p = readAs(file, 'text'); }
      else return reject(fail('Le format .' + ext + ' n’est pas pris en charge. Formats acceptés : PDF, Word (.docx), HTML, Markdown, texte.'));
      p.then(function (raw) {
        var text = clean(raw);
        if (!text) throw fail(kind === 'pdf'
          ? '« ' + file.name + ' » ne contient pas de texte sélectionnable (PDF scanné ?). Utilise un PDF avec du texte ou recopie le cours.'
          : '« ' + file.name + ' » est vide.');
        resolve({ name: stripExt(file.name) || file.name, kind: kind, text: text, words: countWords(text) });
      }).catch(function (e) { reject(e && e.userMessage ? e : fail('Lecture impossible : ' + (e && e.message || 'erreur inconnue'))); });
    });
  }

  function fromText(name, text) {
    var t = clean(text);
    if (!t) throw fail('Le texte est vide.');
    return { name: String(name || '').trim() || 'Cours collé', kind: 'paste', text: t, words: countWords(t) };
  }

  /* Lit plusieurs fichiers séquentiellement ; renvoie {docs:[], errors:[{name,message}]} */
  function readMany(files) {
    var docs = [], errors = [], chain = Promise.resolve();
    var list = Array.prototype.slice.call(files || []);
    /* Images déposées : envoyées vers « Photographier mon cahier » (js/ocr.js) si disponible, sinon erreur habituelle. */
    var imgs = list.filter(function (f) { return /^image\//.test(f.type || '') || /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i.test(f.name || ''); });
    if (imgs.length && root.Studio && root.Studio.ocr && root.Studio.ocr.open) {
      list = list.filter(function (f) { return imgs.indexOf(f) < 0; });
      root.Studio.ocr.open(imgs);
    }
    list.forEach(function (f) {
      chain = chain.then(function () { return read(f); }).then(function (d) { docs.push(d); }, function (e) { errors.push({ name: f.name, message: e.userMessage || e.message }); });
    });
    return chain.then(function () { return { docs: docs, errors: errors }; });
  }

  /* Rend `target` zone de dépôt. onFiles(FileList). Ajoute la classe is-dragover. */
  function dropzone(target, onFiles) {
    var depth = 0;
    function stop(e) { e.preventDefault(); e.stopPropagation(); }
    target.addEventListener('dragenter', function (e) { stop(e); depth++; target.classList.add('is-dragover'); });
    target.addEventListener('dragover', function (e) { stop(e); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });
    target.addEventListener('dragleave', function (e) { stop(e); if (--depth <= 0) { depth = 0; target.classList.remove('is-dragover'); } });
    target.addEventListener('drop', function (e) {
      stop(e); depth = 0; target.classList.remove('is-dragover');
      var f = e.dataTransfer && e.dataTransfer.files;
      if (f && f.length) onFiles(f);
    });
  }

  Studio.files = {
    read: read, readMany: readMany, fromText: fromText, clean: clean, countWords: countWords,
    htmlToText: htmlToText, dropzone: dropzone, accept: '.pdf,.docx,.txt,.md,.markdown,.html,.htm'
  };
})();
