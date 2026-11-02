/* diseno-v2.js: loader for the new visual system. FAIL-CLOSED to the current design.
   The new design is only switched on when ALL of these hold; anything else leaves the page exactly as it is today:
     1. config.js says diseno: "v2" (a missing, misspelled or malformed value means "clasico": this file does nothing and requests nothing)
     2. the optional tema block is well formed (only --brand-* keys with #RRGGBB values)
     3. diseno-v2.css loaded
     4. the two self-hosted fonts loaded within 2.5 seconds
   Only then are the --brand-* values applied and html[data-diseno="v2"] set. A failure writes ONE line to the console and shows nothing to staff.
   The testing-only override ?diseno=clasico|v2 is honoured only when config.js has permitirOverrideDiseno: true (set in test configs, never in a deployment). */
(function () {
  'use strict';
  var root = document.documentElement, FONT_TIMEOUT_MS = 2500, CSS_TIMEOUT_MS = 5000;
  var SCREENS = ['config', 'historico', 'ingresar-historico', 'administracion', 'registrar', 'clientes', 'agenda', 'horarios', 'shell', 'login', 'kpis', 'resumen', 'sala', 'registros', 'sillas', 'caja'];
  function done(estado, motivo) { if (window.BP_DISENO) return; window.BP_DISENO = { estado: estado, motivo: motivo || '' }; if (estado !== 'v2' && motivo) { try { console.warn('[diseno-v2] se queda el diseño actual: ' + motivo); } catch (e) {} } }

  var cfg = window.BP_CONFIG, want = cfg && typeof cfg === 'object' ? cfg.diseno : undefined;
  if (cfg && cfg.permitirOverrideDiseno === true) { try { var q = new URLSearchParams(location.search).get('diseno'); if (q === 'clasico' || q === 'v2') want = q; } catch (e) {} }
  if (want !== 'v2') { done('clasico', ''); return; }                    // the normal, silent, zero-work path
  if (root.getAttribute('data-diseno')) { done('v2', ''); return; }

  // 2. tema: only --brand-* keys with #RRGGBB values; anything else rejects the whole block
  var tema = cfg.tema, brand = {}, logo = null;
  if (tema !== undefined) {
    var src = tema && typeof tema === 'object' ? tema.brand : null;
    if (!src || typeof src !== 'object') { done('clasico', 'tema mal formado'); return; }
    if (tema.logo !== undefined && !(typeof tema.logo === 'string' && /^brand\/[a-z0-9._-]+\.svg$/i.test(tema.logo))) { done('clasico', 'tema.logo mal formado'); return; }
    logo = tema.logo || null;
    for (var k in src) { if (!/^--brand-[a-z0-9-]+$/.test(k) || typeof src[k] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(src[k])) { done('clasico', 'tema mal formado (' + k + ')'); return; } brand[k] = src[k]; }
  }
  // pantallasV2: a list of known screen ids; missing means none (the tokens alone change nothing visible per screen)
  var pantallas = [];
  if (cfg.pantallasV2 !== undefined) {
    if (!Array.isArray(cfg.pantallasV2)) { done('clasico', 'pantallasV2 mal formado'); return; }
    for (var i = 0; i < cfg.pantallasV2.length; i++) { if (SCREENS.indexOf(cfg.pantallasV2[i]) < 0) { done('clasico', 'pantalla desconocida: ' + cfg.pantallasV2[i]); return; } pantallas.push(cfg.pantallasV2[i]); }
  }

  function timeout(ms, what) { return new Promise(function (_, rej) { setTimeout(function () { rej(new Error(what + ' tardó más de ' + ms + ' ms')); }, ms); }); }
  function loadCss() {
    return new Promise(function (res, rej) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'diseno-v2.css'; l.setAttribute('data-diseno-v2', ''); l.onload = function () { res(l); }; l.onerror = function () { l.remove(); rej(new Error('diseno-v2.css no cargó')); }; document.head.appendChild(l); });
  }
  function loadFonts() {
    if (!document.fonts || !document.fonts.load) return Promise.reject(new Error('el navegador no puede cargar fuentes'));
    return Promise.all([document.fonts.load('400 14px Inter'), document.fonts.load('700 16px Bitter')]).then(function (r) {
      if (!r[0].length || !r[1].length || !document.fonts.check('400 14px Inter') || !document.fonts.check('700 16px Bitter')) throw new Error('las fuentes no están disponibles');
    });
  }

  /* Emoji become icons only while the new design is on (the current design's markup is never touched). Works on the static markup and on what the panel's
     scripts draw later (a MutationObserver per enabled pane). The icon is a decorative span; the visible words stay, so nothing loses its label. */
  var EMOJI = { '\u{1F4CB}': 'file-text', '\u{1F517}': 'link', '\u2601': 'cloud-upload', '\u{1F4F8}': 'camera', '\u{1F511}': 'key-round', '\u{1F4C5}': 'calendar', '\u{1F4C6}': 'calendar', '\u{1F5D3}': 'calendar', '\u{1F50D}': 'search', '\u{1F4C2}': 'folder-open', '\u{1F4C1}': 'folder-open', '\u{1F4B0}': 'banknote', '\u270F': 'pencil', '\u23F1': 'clock', '\u{1F464}': 'user-round', '\u21BA': 'refresh-cw', '\u2715': 'x', '\u{1F504}': 'refresh-cw', '\u{1F4BE}': 'save', '✚': 'plus', '\u{1F552}': 'clock', '\u{1F9E0}': 'user-round', '✓': 'check' };
  var PANES = { sala: 'pSala', registros: 'pReg', resumen: 'pSum', sillas: 'pSillas', config: 'pConfig', historico: 'pHist', 'ingresar-historico': 'pHistorico', administracion: 'pStaff' };
  var EMOJI_RE = new RegExp('(' + Object.keys(EMOJI).join('|') + ')\\uFE0F?', 'gu');
  function iconizar(raiz) {
    if (!raiz) return;
    if (raiz.nodeType === 3) { if (EMOJI_RE.test(raiz.nodeValue)) { EMOJI_RE.lastIndex = 0; reemplazar(raiz); } EMOJI_RE.lastIndex = 0; return; }
    if (raiz.nodeType !== 1 || /^(SCRIPT|STYLE|TEXTAREA|OPTION)$/.test(raiz.tagName) || (raiz.classList && raiz.classList.contains('ds-i'))) return;
    var w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, null), lista = [], t;
    while ((t = w.nextNode())) { if (t.parentNode && !/^(SCRIPT|STYLE|TEXTAREA|OPTION)$/.test(t.parentNode.tagName) && EMOJI_RE.test(t.nodeValue)) lista.push(t); EMOJI_RE.lastIndex = 0; }
    lista.forEach(reemplazar);
  }
  function reemplazar(t) {
    var s = t.nodeValue, f = document.createDocumentFragment(), ult = 0, m; EMOJI_RE.lastIndex = 0;
    while ((m = EMOJI_RE.exec(s))) { if (m.index > ult) f.appendChild(document.createTextNode(s.slice(ult, m.index))); var sp = document.createElement('span'); sp.className = 'ds-i'; sp.setAttribute('data-i', EMOJI[m[1]]); sp.setAttribute('aria-hidden', 'true'); f.appendChild(sp); ult = m.index + m[0].length; }
    if (ult < s.length) f.appendChild(document.createTextNode(s.slice(ult)));
    if (t.parentNode) t.parentNode.replaceChild(f, t);
  }
  /* ── Stage A: shell, Registrar servicio, Administración. DOM touches that run only while the new design is on; the current design's markup is never touched. ── */
  var ETIQUETA_ICONO = { 'registros del día': 'clipboard-list', 'resumen': 'layout-grid', 'sillas': 'armchair', 'sala de espera': 'hourglass', 'cierre de caja': 'wallet', 'horarios': 'clock', 'administración': 'settings', 'clientes': 'users', 'agenda': 'calendar', 'kpis': 'chart-column', 'más ▾': 'ellipsis', 'más': 'ellipsis', 'aprobar': 'check', 'cierre jornada': 'clock', 'histórico': 'folder-open', 'ingresar histórico': 'folder-open', 'config': 'settings' };
  var LETRA = /[A-Za-zÁÉÍÓÚáéíóúÑñ]/;
  function iconoDeEtiqueta(el) {                   // "📋 Sillas" -> icon + "Sillas" (the emoji is dropped, the words stay)
    if (!el || el.getAttribute('data-ds-i')) return;
    var t = el.firstChild; while (t && !(t.nodeType === 3 && LETRA.test(t.nodeValue))) t = t.nextSibling;
    if (!t) return;
    var txt = t.nodeValue, i = 0; while (i < txt.length && !LETRA.test(txt.charAt(i))) i++;
    var nombre = ETIQUETA_ICONO[txt.slice(i).trim().toLowerCase()]; if (!nombre) return;
    t.nodeValue = txt.slice(i);
    var sp = document.createElement('span'); sp.className = 'ds-i'; sp.setAttribute('data-i', nombre); sp.setAttribute('aria-hidden', 'true'); el.insertBefore(sp, t); el.setAttribute('data-ds-i', '1');
  }
  function iconoNuevo(nombre) { var sp = document.createElement('span'); sp.className = 'ds-i'; sp.setAttribute('data-i', nombre); sp.setAttribute('aria-hidden', 'true'); return sp; }
  function dsShell() {
    [].forEach.call(document.querySelectorAll('.tabs .tab, .hdr-hist'), iconoDeEtiqueta);
    var br = document.querySelector('.hdr-brand');
    if (br && !br.querySelector('.ds-menu-btn')) {                  // phones and tablets: the menu button opens the Registrar servicio drawer
      var b = document.createElement('button'); b.type = 'button'; b.className = 'ds-menu-btn'; b.setAttribute('aria-label', 'Registrar servicio'); b.setAttribute('aria-expanded', 'false'); b.appendChild(iconoNuevo('menu'));
      b.addEventListener('click', function () { cajon(root.getAttribute('data-ds-drawer') !== 'open'); }); br.insertBefore(b, br.firstChild);
      var sc = document.createElement('div'); sc.className = 'ds-scrim'; sc.addEventListener('click', function () { cajon(false); }); document.body.appendChild(sc);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cajon(false); });
      function cajon(abrir) { if (abrir) root.setAttribute('data-ds-drawer', 'open'); else root.removeAttribute('data-ds-drawer'); b.setAttribute('aria-expanded', String(!!abrir)); }
    }
  }
  var ICONO_RIEL = { 'ir a barbero': 'user-round', 'ir a servicio': 'scissors', 'ir a forma de pago': 'credit-card', 'ir a propina': 'heart', 'ir a venta de producto': 'shopping-bag' };
  function dsMontos() {                            // what the barber receives with each method for the chosen service: the panel's own formula (Math.round(precio * tasa))
    var s = (typeof find === 'function' && typeof sel === 'object' && typeof SS !== 'undefined') ? find(SS, sel.s) : null;
    [].forEach.call(document.querySelectorAll('#secPago .pbtn[data-pay]'), function (b) {
      var pc = b.querySelector('.pc'), pn = b.querySelector('.pn'); if (!pc) return;
      var tasa = (typeof tasaComision === 'function') ? tasaComision(b.getAttribute('data-pay')) : null;
      if (s && tasa != null && typeof fmt === 'function') { pc.textContent = '$' + fmt(Math.round(s.precio * tasa)) + ' al barbero'; b.setAttribute('aria-label', (pn ? pn.textContent : '') + ', ' + pc.textContent); }
      else { pc.textContent = ''; b.removeAttribute('aria-label'); }
    });
  }
  function dsRegistrar() {
    var inner = document.getElementById('plInner'); if (!inner || inner.querySelector('.ds-h')) return;
    var h = document.createElement('h2'); h.className = 'ds-h'; h.textContent = 'Registrar servicio'; inner.insertBefore(h, inner.firstChild);
    [].forEach.call(inner.querySelectorAll('.slbl'), function (l) { var m = /^([0-9]+) · (.*)$/.exec(l.textContent); if (m) { l.textContent = ''; var n = document.createElement('span'); n.className = 'ds-n'; n.textContent = m[1]; l.appendChild(n); l.appendChild(document.createTextNode(m[2])); } });
    [].forEach.call(document.querySelectorAll('.pl-rail-btn'), function (b) { var ic = ICONO_RIEL[(b.getAttribute('aria-label') || '').toLowerCase()]; if (ic) { b.textContent = ''; b.appendChild(iconoNuevo(ic)); } });
    [].forEach.call(document.querySelectorAll('#secProductoSale span'), function (s) { if (s.textContent.trim() === 'Ceras') s.textContent = 'Productos'; });
    ['updPrev', 'aplicarMetodosPagoUI'].forEach(function (n) { var f = window[n]; if (typeof f === 'function' && !f.__ds) { var g = function () { var r = f.apply(this, arguments); try { dsMontos(); } catch (e) {} return r; }; g.__ds = true; window[n] = g; } });
    dsMontos();
  }
  var COLUMNA = { 'personal': 0, 'períodos de trabajo': 0, 'meta mensual del local': 1, 'comisiones': 1, 'servicios': 1, 'productos': 2, 'amenities': 2 };
  function dsAdmin() {                              // Administración: sections go into 3 columns (CSS shows them as 3, 2 or 1 depending on the width)
    var cont = document.querySelector('#pStaff > div'); if (!cont || cont.querySelector('.ds-cols')) return;
    var tok = document.getElementById('staffTokenSection');
    if (tok && !tok.querySelector('.ds-tok-toggle')) {
      tok.classList.add('ds-tok', 'ds-closed'); var b = document.createElement('button'); b.type = 'button'; b.className = 'ds-tok-toggle'; b.setAttribute('aria-expanded', 'false'); b.appendChild(iconoNuevo('settings')); b.appendChild(document.createTextNode('Token de administrador')); b.appendChild(iconoNuevo('chevron-down'));
      b.addEventListener('click', function () { var c = tok.classList.toggle('ds-closed'); b.setAttribute('aria-expanded', String(!c)); }); tok.insertBefore(b, tok.firstChild);
    }
    var cols = [0, 1, 2].map(function () { var c = document.createElement('div'); c.className = 'ds-col'; return c; }), wrap = document.createElement('div'); wrap.className = 'ds-cols';
    [].slice.call(cont.children).forEach(function (k) {
      if (k === tok) return;
      var hd = k.querySelector('.staff-section-hdr'), titulo = hd ? hd.textContent.replace('✓ Guardado', '').trim().toLowerCase() : '', c = COLUMNA[titulo.split('\n')[0].trim()];
      if (hd) k.classList.add('ds-sec');
      cols[c === undefined ? 2 : c].appendChild(k);
    });
    cols.forEach(function (c) { wrap.appendChild(c); }); cont.appendChild(wrap);
  }
  function dsSala() {                               // Sala de espera: the check-in cards go in a left column, the live queue and the client search in a right one
    var p = document.getElementById('pSala'); if (!p || p.querySelector('.ds-cols2')) return;
    var w = document.createElement('div'), l = document.createElement('div'), r = document.createElement('div'); w.className = 'ds-cols2'; l.className = 'ds-col'; r.className = 'ds-col';
    [].slice.call(p.children).forEach(function (k, i) { (i < 3 ? l : r).appendChild(k); });
    w.appendChild(l); w.appendChild(r); p.appendChild(w);
  }
  function iconos(lista) {
    var pend = { shell: dsShell, registrar: dsRegistrar, administracion: dsAdmin, sala: dsSala };
    function etapaA() { lista.forEach(function (p) { if (pend[p]) { try { pend[p](); } catch (e) { try { console.warn('[diseno-v2] ' + p + ': ' + e.message); } catch (x) {} } } }); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', etapaA); else etapaA();
    function iniciar() { lista.forEach(function (p) { var id = PANES[p], el = id && document.getElementById(id); if (!el) return; iconizar(el); try { new MutationObserver(function (ms) { ms.forEach(function (m) { for (var i = 0; i < m.addedNodes.length; i++) iconizar(m.addedNodes[i]); if (m.type === 'characterData') iconizar(m.target); }); }).observe(el, { childList: true, subtree: true, characterData: true }); } catch (e) {} }); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
  }
  var link = null;
  loadCss().then(function (l) { link = l; return Promise.race([loadFonts(), timeout(FONT_TIMEOUT_MS, 'carga de fuentes')]); })
    .then(function () {
      if (window.BP_DISENO) return;                                     // the overall guard already settled: stay as it is
      for (var k in brand) root.style.setProperty(k, brand[k]);           // --brand-* only
      if (logo) { try { root.style.setProperty('--ds-logo', 'url("' + new URL(logo, location.href).href + '")'); } catch (e) {} }
      if (pantallas.length) root.setAttribute('data-diseno-pantallas', pantallas.join(' '));
      root.setAttribute('data-diseno', 'v2'); done('v2', ''); iconos(pantallas);
    })
    .catch(function (e) { if (link && link.parentNode) link.parentNode.removeChild(link); done('clasico', e && e.message ? e.message : 'error'); });
  // overall guard: if neither branch settled (a stalled stylesheet request), the page simply stays as it is
  setTimeout(function () { if (!window.BP_DISENO) { if (link && link.parentNode) link.parentNode.removeChild(link); done('clasico', 'diseno-v2.css tardó más de ' + CSS_TIMEOUT_MS + ' ms'); } }, CSS_TIMEOUT_MS);
})();
