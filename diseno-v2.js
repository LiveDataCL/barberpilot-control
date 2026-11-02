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
  var SCREENS = ['config', 'historico', 'ingresar-historico', 'administracion', 'clientes', 'agenda', 'horarios', 'shell', 'login', 'kpis', 'resumen', 'sala', 'registros', 'sillas', 'caja'];
  function done(estado, motivo) { if (window.BP_DISENO) return; window.BP_DISENO = { estado: estado, motivo: motivo || '' }; if (estado !== 'v2' && motivo) { try { console.warn('[diseno-v2] se queda el diseño actual: ' + motivo); } catch (e) {} } }

  var cfg = window.BP_CONFIG, want = cfg && typeof cfg === 'object' ? cfg.diseno : undefined;
  if (cfg && cfg.permitirOverrideDiseno === true) { try { var q = new URLSearchParams(location.search).get('diseno'); if (q === 'clasico' || q === 'v2') want = q; } catch (e) {} }
  if (want !== 'v2') { done('clasico', ''); return; }                    // the normal, silent, zero-work path
  if (root.getAttribute('data-diseno')) { done('v2', ''); return; }

  // 2. tema: only --brand-* keys with #RRGGBB values; anything else rejects the whole block
  var tema = cfg.tema, brand = {};
  if (tema !== undefined) {
    var src = tema && typeof tema === 'object' ? tema.brand : null;
    if (!src || typeof src !== 'object') { done('clasico', 'tema mal formado'); return; }
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
  var link = null;
  loadCss().then(function (l) { link = l; return Promise.race([loadFonts(), timeout(FONT_TIMEOUT_MS, 'carga de fuentes')]); })
    .then(function () {
      if (window.BP_DISENO) return;                                     // the overall guard already settled: stay as it is
      for (var k in brand) root.style.setProperty(k, brand[k]);           // --brand-* only
      if (pantallas.length) root.setAttribute('data-diseno-pantallas', pantallas.join(' '));
      root.setAttribute('data-diseno', 'v2'); done('v2', '');
    })
    .catch(function (e) { if (link && link.parentNode) link.parentNode.removeChild(link); done('clasico', e && e.message ? e.message : 'error'); });
  // overall guard: if neither branch settled (a stalled stylesheet request), the page simply stays as it is
  setTimeout(function () { if (!window.BP_DISENO) { if (link && link.parentNode) link.parentNode.removeChild(link); done('clasico', 'diseno-v2.css tardó más de ' + CSS_TIMEOUT_MS + ' ms'); } }, CSS_TIMEOUT_MS);
})();
