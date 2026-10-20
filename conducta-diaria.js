// Stage 9 — November scoring, panel side.
//   · Conducta de hoy (Horarios tab): the encargado and the admin score TODAY only; a day nobody changes is carried
//     forward by the server and marked "copiado". The admin can correct a PAST day, with a mandatory reason.
//   · KPI tab pieces for the November model (points computed by the server; nothing is computed here).
//   · Reminder before printing the A4 summary, and its per-user switch (kept in the server, not in the browser).
// Every value shown comes from the server; every refusal is shown with the server's own message.
// Depends on index.html / reportes-api.js / texto-seguro.js: API_URL, fechaHoy, _panelRole, getAuthHeaders,
// getJsonAuthHeaders, fetchConReintentos, toast, avisoDatosHtml, _escHtml, showTabById.

var _cdHoy = null;          // last server answer for today: { ok, indicadores, barberos, … } or { inactivo, detalle } or { error }
var _cdCargadoEn = 0;
var _cdCargando = false;
var _cdPend = {};           // bid → { indicador: valor } edited and not yet saved
var _cdGuardando = false;
var _cdDia = null;          // admin: the past day loaded for correction
var _cdDiaFecha = '';
var _cdMsg = '';
var _cdPrefA4 = null;       // true | false | null (unknown)

function _cdEsc(t){ return _escHtml(String(t == null ? '' : t)); }

// POST/PUT with the panel login; resolves { ok, status, j, motivo } — the server's detail is kept for the screen.
function _cdEnviar(metodo, url, cuerpo){
  return fetch(API_URL + url, { method: metodo, headers: getJsonAuthHeaders(), body: JSON.stringify(cuerpo) }).then(function(r){
    return r.json().then(function(j){
      if(r.ok && j && j.ok) return { ok: true, status: r.status, j: j };
      return { ok: false, status: r.status, j: j, motivo: (j && j.detalle) || (r.status === 401 ? 'tu sesión expiró; vuelve a ingresar' : 'el servidor respondió ' + r.status) };
    }, function(){ return { ok: false, status: r.status, motivo: 'respuesta ilegible del servidor (' + r.status + ')' }; });
  }, function(){ return { ok: false, status: 0, motivo: 'sin conexión con el servidor' }; });
}

function _cdFechaAnterior(f){   // YYYY-MM-DD → previous calendar day
  var d = new Date(f + 'T12:00:00'); d.setDate(d.getDate() - 1);
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

var _CD_ESTADOS = { inicial: 'sin evaluar (0)', copiado: 'copiado', evaluado: 'evaluado', corregido: 'corregido' };

// ── Conducta de hoy ───────────────────────────────────────────────────────────────────────────────
function cdCargarHoy(){
  if(!API_URL || _cdCargando) return Promise.resolve();
  _cdCargando = true;
  return fetchConReintentos(API_URL + '/api/v2/kpi/conducta/hoy').then(function(r){
    _cdCargando = false; _cdCargadoEn = Date.now();
    if(r.ok) _cdHoy = r.json;
    else if(r.status === 409) _cdHoy = { inactivo: true, detalle: r.motivo };
    else _cdHoy = { error: r.motivo };
  });
}

function renderConductaHoy(forzar){
  var box = document.getElementById('conductaHoyBox');
  if(!box) return;
  if(!API_URL || !Object.keys(getAuthHeaders()).length){ box.innerHTML = ''; return; }   // not logged in yet: nothing to ask
  if(forzar || !_cdHoy || _cdHoy.error || Date.now() - _cdCargadoEn > 60000){
    if(!_cdHoy) box.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:10px 0">Cargando la conducta de hoy…</div>';
    cdCargarHoy().then(function(){ renderSeguro('conductaHoyBox', _cdDibujar, function(){ renderConductaHoy(true); }); });
    return;
  }
  renderSeguro('conductaHoyBox', _cdDibujar, function(){ renderConductaHoy(true); });
}

function _cdSelect(bid, ind, valor, max, extra){
  var h = '<select class="cd-sel" data-bid="' + _cdEsc(bid) + '" data-ind="' + _cdEsc(ind) + '" ' + (extra || '') + ' style="padding:4px 6px;border:1px solid var(--border);border-radius:var(--r);font-family:var(--mono);font-size:13px">';
  for(var v = 0; v <= max; v++) h += '<option value="' + v + '"' + (v === valor ? ' selected' : '') + '>' + v + '</option>';
  return h + '</select>';
}

function _cdTarjeta(b, hoyOCorr, d){   // hoyOCorr: 'hoy' | 'corr'
  var pend = hoyOCorr === 'hoy' ? (_cdPend[b.bid] || {}) : {};
  var h = '<div class="cd-card" data-bid="' + _cdEsc(b.bid) + '" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:12px 14px">'
    + '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:8px"><b>' + _cdEsc(b.nombre) + '</b>'
    + '<span class="cd-estado" style="font-size:11px;color:' + (b.estado === 'copiado' || b.estado === 'inicial' ? 'var(--text3)' : 'var(--ok)') + '">'
    + _cdEsc(_CD_ESTADOS[b.estado] || b.estado) + (b.modificado_por ? ' · ' + _cdEsc(b.modificado_por) + ' ' + _cdEsc(b.modificado_en || '') : '') + '</span></div>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:6px 18px">';
  d.indicadores.forEach(function(ind){
    var v = pend[ind.id] != null ? pend[ind.id] : b.valores[ind.id];
    h += '<label style="display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px"><span>' + _cdEsc(ind.nombre) + '</span>'
      + _cdSelect(b.bid, ind.id, v, d.escala_max, 'onchange="cdCambio(this)" data-modo="' + hoyOCorr + '"') + '</label>';
  });
  h += '</div>';
  if(hoyOCorr === 'hoy'){
    h += '<div style="margin-top:10px"><button class="cd-guardar" data-bid="' + _cdEsc(b.bid) + '" onclick="cdGuardarHoy(this.dataset.bid)" '
      + 'style="padding:6px 14px;background:var(--text);color:#fff;border:none;border-radius:var(--r);font-size:12px;font-weight:600;cursor:pointer"' + (Object.keys(pend).length ? '' : ' disabled') + '>Guardar conducta de ' + _cdEsc(b.nombre) + '</button></div>';
  }
  return h + '</div>';
}

function _cdDibujar(){
  var box = document.getElementById('conductaHoyBox');
  if(!box) return;
  var d = _cdHoy, h = '<div style="margin-top:26px;border-top:1px solid var(--border);padding-top:18px">'
    + '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);margin-bottom:8px">Conducta de hoy</div>';
  if(!d){ box.innerHTML = ''; return; }
  if(d.inactivo){ box.innerHTML = h + '<div style="font-size:12px;color:var(--text3)">' + _cdEsc(d.detalle) + '</div></div>'; return; }
  if(d.error){ box.innerHTML = h + avisoDatosHtml('No se pudo cargar la conducta de hoy (' + d.error + ').')
    + '<button onclick="renderConductaHoy(true)" style="padding:6px 12px;font-size:12px;cursor:pointer">Reintentar</button></div>'; return; }
  h += '<p style="font-size:12px;color:var(--text2);margin:0 0 10px;line-height:1.6">Califica a cada barbero de 0 a ' + d.escala_max + ' en cada indicador. '
    + 'Si hoy no cambias nada, el servidor guarda para hoy los valores del día anterior, marcados «copiado». Solo se puede evaluar el día de hoy.</p>';
  if(_cdMsg) h += '<div id="cdMsg" style="font-size:12px;margin-bottom:8px;color:var(--text2)">' + _cdEsc(_cdMsg) + '</div>';
  h += '<div style="display:flex;flex-direction:column;gap:10px">';
  if(!d.barberos.length) h += '<div style="font-size:12px;color:var(--text3)">Hoy no hay barberos con día de trabajo.</div>';
  d.barberos.forEach(function(b){ h += _cdTarjeta(b, 'hoy', d); });
  h += '</div>';
  h += '<div id="cdPrefA4Horarios" style="margin-top:14px"></div>';
  if(d.puede_corregir_pasado) h += _cdCorreccionHtml(d);
  box.innerHTML = h + '</div>';
  cdPintarPref();
}

function cdCambio(el){
  var bid = el.dataset.bid, ind = el.dataset.ind, v = parseInt(el.value, 10);
  if(el.dataset.modo === 'corr') return;   // the correction form reads its selects when saving
  var orig = _cdHoy.barberos.filter(function(b){ return b.bid === bid; })[0];
  var p = _cdPend[bid] || (_cdPend[bid] = {});
  if(orig && orig.valores[ind] === v) delete p[ind]; else p[ind] = v;
  var card = el.closest('.cd-card'), btn = card && card.querySelector('.cd-guardar');
  if(btn) btn.disabled = Object.keys(p).length === 0;
}

function cdGuardarHoy(bid){
  if(_cdGuardando) return;
  var p = _cdPend[bid];
  if(!p || !Object.keys(p).length) return;
  _cdGuardando = true;
  _cdEnviar('POST', '/api/v2/kpi/conducta', { bid: bid, valores: p }).then(function(r){
    _cdGuardando = false;
    if(r.ok){ delete _cdPend[bid]; _cdMsg = r.j.cambios ? '✓ Conducta guardada.' : 'No había cambios que guardar.'; toast('✓ Conducta guardada'); }
    else { _cdMsg = '⚠ No se guardó: ' + r.motivo; toast('⚠ No se guardó: ' + r.motivo); }
    return cdCargarHoy();
  }).then(function(){ renderSeguro('conductaHoyBox', _cdDibujar, function(){ renderConductaHoy(true); }); });
}

// ── Admin: correct a past day (reason mandatory), and the change history ───────────────────────────
function _cdCorreccionHtml(d){
  var ayer = _cdFechaAnterior(fechaHoy);
  var h = '<div id="cdCorreccion" style="margin-top:22px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--rl);padding:14px 16px">'
    + '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text3);margin-bottom:8px">Corregir un día anterior (solo administración)</div>'
    + '<p style="font-size:12px;color:var(--text2);margin:0 0 10px;line-height:1.6">Cada corrección guarda quién la hizo, cuándo, el valor anterior, el nuevo y tu justificación, que es obligatoria. '
    + 'Corregir un día no cambia los días siguientes: cada día conserva su propio valor.</p>'
    + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">'
    + '<input type="date" id="cdDiaFecha" max="' + _cdEsc(ayer) + '" value="' + _cdEsc(_cdDiaFecha) + '" style="padding:6px 8px;border:1px solid var(--border);border-radius:var(--r);font-size:13px">'
    + '<button onclick="cdCargarDia()" style="padding:6px 12px;font-size:12px;cursor:pointer">Cargar ese día</button>'
    + '<button onclick="cdVerHistorial()" style="padding:6px 12px;font-size:12px;cursor:pointer">Ver historial de cambios</button></div>'
    + '<div id="cdDiaBox">' + _cdDiaHtml(d) + '</div><div id="cdHistorialBox"></div></div>';
  return h;
}

function _cdDiaHtml(d){
  if(!_cdDia) return '';
  if(_cdDia.error) return avisoDatosHtml(_cdDia.error);
  var h = '<div style="font-size:12px;margin-bottom:8px;color:var(--text2)">Día cargado: <b>' + _cdEsc(_cdDia.fecha) + '</b></div><div style="display:flex;flex-direction:column;gap:10px">';
  if(!_cdDia.barberos.length) h += '<div style="font-size:12px;color:var(--text3)">Ese día no hay registros de conducta (nadie tenía día de trabajo).</div>';
  _cdDia.barberos.forEach(function(b){
    h += _cdTarjeta(b, 'corr', _cdDia)
      + '<div class="cd-motivo-box" data-bid="' + _cdEsc(b.bid) + '" style="margin:-4px 0 4px;display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap">'
      + '<textarea class="cd-motivo" data-bid="' + _cdEsc(b.bid) + '" rows="2" maxlength="300" placeholder="Justificación de la corrección (obligatoria)" style="flex:1;min-width:220px;padding:6px 8px;border:1px solid var(--border);border-radius:var(--r);font-size:12px;font-family:var(--sans)"></textarea>'
      + '<button data-bid="' + _cdEsc(b.bid) + '" onclick="cdGuardarCorreccion(this.dataset.bid)" style="padding:6px 12px;background:var(--err);color:#fff;border:none;border-radius:var(--r);font-size:12px;font-weight:600;cursor:pointer">Guardar corrección de ' + _cdEsc(b.nombre) + '</button></div>';
  });
  return h + '</div>';
}

function cdCargarDia(){
  var f = (document.getElementById('cdDiaFecha') || {}).value || '';
  if(!f){ toast('Elige la fecha del día a corregir'); return; }
  _cdDiaFecha = f;
  fetchConReintentos(API_URL + '/api/v2/kpi/conducta/dia?fecha=' + encodeURIComponent(f)).then(function(r){
    _cdDia = r.ok ? r.json : { error: 'No se pudo cargar ese día: ' + r.motivo };
    var b = document.getElementById('cdDiaBox'); if(b) renderSeguro('cdDiaBox', function(){ b.innerHTML = _cdDiaHtml(_cdHoy); }, cdCargarDia);
  });
}

function cdGuardarCorreccion(bid){
  if(_cdGuardando || !_cdDia || !_cdDia.barberos) return;
  var b = _cdDia.barberos.filter(function(x){ return x.bid === bid; })[0]; if(!b) return;
  var tarjeta = document.querySelector('#cdDiaBox .cd-card[data-bid="' + bid.replace(/"/g, '') + '"]');
  var motivoEl = document.querySelector('#cdDiaBox .cd-motivo[data-bid="' + bid.replace(/"/g, '') + '"]');
  var motivo = ((motivoEl && motivoEl.value) || '').trim();
  if(motivo.length < 5){ toast('Escribe la justificación de la corrección (mínimo 5 caracteres)'); if(motivoEl) motivoEl.focus(); return; }
  var valores = {};
  Array.prototype.forEach.call(tarjeta.querySelectorAll('.cd-sel'), function(s){
    var v = parseInt(s.value, 10); if(b.valores[s.dataset.ind] !== v) valores[s.dataset.ind] = v;
  });
  if(!Object.keys(valores).length){ toast('No cambiaste ningún valor'); return; }
  if(!window.confirm('¿Corregir la conducta de ' + b.nombre + ' del ' + _cdDia.fecha + '?\n\nQuedará registrado con tu nombre y la justificación.')) return;
  _cdGuardando = true;
  _cdEnviar('POST', '/api/v2/kpi/conducta/corregir', { fecha: _cdDia.fecha, bid: bid, valores: valores, motivo: motivo }).then(function(r){
    _cdGuardando = false;
    toast(r.ok ? '✓ Corrección guardada' : '⚠ No se guardó: ' + r.motivo);
    if(!r.ok){ _cdMsg = '⚠ No se guardó la corrección: ' + r.motivo; var m = document.getElementById('cdMsg'); if(m) m.textContent = _cdMsg; return; }
    _cdMsg = '✓ Corrección guardada.'; cdCargarDia(); cdCargarHoy().then(function(){ renderSeguro('conductaHoyBox', _cdDibujar, function(){ renderConductaHoy(true); }); });
  });
}

function cdVerHistorial(){
  var box = document.getElementById('cdHistorialBox'); if(!box) return;
  box.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:8px 0">Cargando el historial…</div>';
  fetchConReintentos(API_URL + '/api/v2/kpi/conducta/historial').then(function(r){
    if(!r.ok){ box.innerHTML = avisoDatosHtml('No se pudo cargar el historial: ' + r.motivo); return; }
    var rows = r.json.historial, h = '<div style="margin-top:12px;font-size:12px;font-weight:600">Historial de cambios (los más recientes primero)</div>'
      + '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:6px"><thead><tr>'
      + ['Cuándo', 'Día', 'Barbero', 'Indicador', 'Antes', 'Ahora', 'Quién', 'Tipo', 'Justificación'].map(function(t){ return '<th style="text-align:left;padding:4px 8px;border-bottom:1px solid var(--border);color:var(--text3);font-size:10px;text-transform:uppercase">' + t + '</th>'; }).join('')
      + '</tr></thead><tbody>';
    if(!rows.length) h += '<tr><td colspan="9" style="padding:8px;color:var(--text3)">Todavía no hay cambios registrados.</td></tr>';
    rows.forEach(function(x){
      h += '<tr style="border-bottom:1px solid var(--border)"><td style="padding:4px 8px;font-family:var(--mono)">' + _cdEsc(x.creado_en) + '</td><td style="padding:4px 8px;font-family:var(--mono)">' + _cdEsc(x.fecha) + '</td><td style="padding:4px 8px">' + _cdEsc(x.nombre || x.bid) + '</td><td style="padding:4px 8px">' + _cdEsc(x.indicador) + '</td>'
        + '<td style="padding:4px 8px;font-family:var(--mono)">' + _cdEsc(x.valor_anterior) + '</td><td style="padding:4px 8px;font-family:var(--mono)">' + _cdEsc(x.valor_nuevo) + '</td><td style="padding:4px 8px">' + _cdEsc(x.actor_nombre) + '</td>'
        + '<td style="padding:4px 8px">' + (x.origen === 'correccion' ? 'corrección' : 'hoy') + '</td><td style="padding:4px 8px">' + _cdEsc(x.motivo || '—') + '</td></tr>';
    });
    box.innerHTML = h + '</tbody></table></div>';
  });
}

// ── Per-user switch: reminder before printing the A4 (stored on the server) ───────────────────────
function cdCargarPref(){
  if(!API_URL) return Promise.resolve(null);
  return fetchConReintentos(API_URL + '/api/v2/panel/preferencias').then(function(r){
    _cdPrefA4 = r.ok ? r.json.preferencias.recordatorio_a4 !== false : null;
    return _cdPrefA4;
  });
}
function cdPintarPref(){
  var ids = ['cdPrefA4Horarios', 'cdPrefA4Kpi'];
  cdCargarPref().then(function(v){
    ids.forEach(function(id){
      var el = document.getElementById(id); if(!el) return;
      if(v === null){ el.innerHTML = '<div style="font-size:12px;color:var(--text3)">No se pudo leer tu preferencia del recordatorio del A4.</div>'; return; }
      el.innerHTML = '<label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text2);cursor:pointer">'
        + '<input type="checkbox" class="cd-pref-a4" ' + (v ? 'checked' : '') + ' onchange="cdCambiarPref(this.checked)"> Mostrar el recordatorio de revisión antes de imprimir el resumen A4 (se guarda para tu usuario)</label>'
        + '<span class="cd-pref-msg" style="font-size:11px;color:var(--text3)"></span>';
    });
  });
}
function cdCambiarPref(valor){
  _cdEnviar('PUT', '/api/v2/panel/preferencias/recordatorio_a4', { valor: !!valor }).then(function(r){
    if(r.ok){ _cdPrefA4 = !!valor; toast('✓ Preferencia guardada'); }
    else { toast('⚠ No se guardó la preferencia: ' + r.motivo); cdPintarPref(); }
  });
}

// ── Reminder before printing the A4 summary ───────────────────────────────────────────────────────
// continuar() prints. The reminder asks for a review (missing entry/exit marks; barbers whose conduct has not changed
// for several days). If it cannot be checked, printing needs an explicit yes (it never prints silently without a check).
function a4Recordatorio(continuar){
  if(!API_URL){ continuar(); return; }
  fetchConReintentos(API_URL + '/api/v2/resumen/recordatorio?fecha=' + encodeURIComponent(fechaHoy)).then(function(r){
    if(!r.ok){
      if(window.confirm('No se pudo revisar si faltan marcas de entrada/salida (' + r.motivo + ').\n\n¿Imprimir el resumen A4 de todos modos?')) continuar();
      return;
    }
    var j = r.json;
    if(!j.hay_avisos){ continuar(); return; }
    return cdCargarPref().then(function(v){ if(v === false){ continuar(); return; } _cdMostrarRecordatorio(j, continuar); });
  });
}
function _cdMostrarRecordatorio(j, continuar){
  var prev = document.getElementById('cdRecordatorioA4'); if(prev) prev.remove();
  var ov = document.createElement('div'); ov.id = 'cdRecordatorioA4';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px';
  function lista(titulo, arr, sufijo){
    if(!arr.length) return '';
    return '<div style="margin-top:10px"><div style="font-weight:600;font-size:13px">' + _cdEsc(titulo) + '</div><ul style="margin:4px 0 0 18px;padding:0;font-size:13px">'
      + arr.map(function(x){ return '<li>' + _cdEsc(x.nombre) + (sufijo ? sufijo(x) : '') + '</li>'; }).join('') + '</ul></div>';
  }
  var cuerpo = '<div style="font-weight:700;font-size:15px;margin-bottom:4px">Antes de imprimir el resumen A4</div>'
    + '<div style="font-size:12px;color:var(--text2)">Revisa estos puntos del día ' + _cdEsc(j.fecha) + ':</div>'
    + lista('Sin marca de ENTRADA', j.sin_entrada) + lista('Sin marca de SALIDA', j.sin_salida)
    + (j.aplica_conducta ? lista('Sin ninguna evaluación de conducta este mes (parten en 0 hasta que se evalúen)', j.sin_evaluar_mes || []) + lista('Conducta sin cambios hace ' + j.umbral_dias_sin_cambios + ' o más días de trabajo', j.sin_cambios_conducta, function(x){ return ' — ' + x.dias + ' días'; }) : '');
  var card = document.createElement('div');
  card.style.cssText = 'background:var(--surface);border-radius:var(--rl);padding:20px 22px;max-width:460px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,.3)';
  card.innerHTML = cuerpo
    + '<label style="display:flex;gap:8px;align-items:center;font-size:12px;margin-top:14px;cursor:pointer"><input type="checkbox" id="cdNoMostrar"> No volver a mostrar este recordatorio</label>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap">'
    + '<button id="cdRevisar" style="padding:8px 14px;background:var(--text);color:#fff;border:none;border-radius:var(--r);font-size:13px;font-weight:600;cursor:pointer">Revisar horarios y conducta</button>'
    + '<button id="cdImprimir" style="padding:8px 14px;background:var(--surface);border:1.5px solid var(--text);border-radius:var(--r);font-size:13px;font-weight:600;cursor:pointer">Imprimir de todos modos</button></div>';
  ov.appendChild(card); document.body.appendChild(ov);
  function cerrar(){
    var nm = document.getElementById('cdNoMostrar');
    if(nm && nm.checked) _cdEnviar('PUT', '/api/v2/panel/preferencias/recordatorio_a4', { valor: false }).then(function(r){ if(!r.ok) toast('⚠ No se guardó la preferencia: ' + r.motivo); else _cdPrefA4 = false; });
    ov.remove();
  }
  document.getElementById('cdRevisar').onclick = function(){ cerrar(); showTabById('pHorarios'); renderHorarios(); };
  document.getElementById('cdImprimir').onclick = function(){ cerrar(); continuar(); };
}

// ── KPI tab: November model (points come from the server) ─────────────────────────────────────────
function kpiTablaV2Html(k, periodo){
  var r = k.reglas, bs = k.barberos;
  var prodMax = r.produccion.pts_servicios + r.produccion.pts_facturacion + r.produccion.pts_ticket;
  var puntMax = r.puntualidad.pts_entrada + r.puntualidad.pts_salida, propMax = r.propinas.pts_cantidad + r.propinas.pts_monto;
  function th(t, sub){ return '<th class="r">' + t + '<br><small style="font-weight:400;text-transform:none;color:var(--text3)">' + sub + '</small></th>'; }
  var h = '<div class="kpi-table-wrap"><div class="kpi-table-head"><span>Resumen del período</span><small>' + _cdEsc(periodo) + '</small></div>'
    + '<table class="kpi-rt" id="kpiTabla"><thead><tr><th>Barbero</th><th class="r">Servicios</th><th class="r">Tkt prom.</th>'
    + th('Producción', prodMax + ' pts') + th('Conducta', r.conducta.pts + ' pts') + th('Puntualidad', puntMax + ' pts') + th('Venta adicional', r.venta_adicional.pts + ' pts') + th('Propinas', propMax + ' pts')
    + '<th class="r">Total</th><th class="r">Estrato</th><th class="r">Bono potencial</th><th class="r">Bono a pagar</th></tr></thead><tbody>';
  if(!bs.length) h += '<tr><td colspan="12" style="color:var(--text3)">Ningún barbero trabajó en este mes.</td></tr>';
  bs.forEach(function(b){
    var p = b.puntos, d = b.detalle || {};
    h += '<tr data-bid="' + _cdEsc(b.bid) + '"' + (b.disq ? ' style="opacity:.6"' : '') + '>'
      + '<td><strong>' + _cdEsc(b.nombre) + '</strong>' + (b.disq ? '<span class="kpi-disq-badge">🚫 Descalif.</span>' : '') + '</td>'
      + '<td class="r"><span style="font-family:var(--mono);font-weight:600">' + b.ventas.servicios + '</span></td>'
      + '<td class="r"><span style="font-family:var(--mono)">$' + fmt(b.ventas.ticket_promedio) + '</span></td>'
      + '<td class="r"><span class="kpi-score-num">' + p.produccion + '</span></td>'
      + '<td class="r"><span class="kpi-score-num">' + p.conducta + '</span><br><span style="font-size:10px;color:var(--text3)">nota ' + String(d.nota_conducta).replace('.', ',') + ' / ' + r.conducta.escala_max + '</span></td>'
      + '<td class="r"><span class="kpi-score-num">' + p.puntualidad + '</span><br><span style="font-size:10px;color:var(--text3)">' + (d.dias_sin_entrada || 0) + ' sin entrada · ' + (d.dias_sin_salida || 0) + ' sin salida</span></td>'
      + '<td class="r"><span class="kpi-score-num">' + p.venta_adicional + '</span><br><span style="font-size:10px;color:var(--text3)">' + (d.pct_atenciones_con_producto == null ? '—' : String(d.pct_atenciones_con_producto).replace('.', ',') + ' % con producto') + '</span></td>'
      + '<td class="r"><span style="font-family:var(--mono);color:#8b5e00">' + p.propinas + '</span></td>'
      + '<td class="r"><span class="kpi-total" style="font-family:var(--mono);font-weight:700;font-size:16px">' + p.total + '</span></td>'
      + '<td class="r">' + _kpiGradeHtml(b.estrato) + '</td>'
      + '<td class="r"><span class="kpi-potencial" style="font-family:var(--mono)">$' + fmt(b.bono_potencial) + '</span></td>'
      + '<td class="r"><span class="kpi-apagar" style="font-family:var(--mono);font-weight:700;color:' + (b.bono_a_pagar > 0 ? 'var(--ok)' : 'var(--text3)') + '">$' + fmt(b.bono_a_pagar) + '</span></td></tr>';
  });
  return h + '</tbody></table></div>';
}

function kpiConductaV2Html(k, periodo){
  var r = k.reglas;
  return '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--rl);padding:14px 16px;margin-bottom:16px;font-size:12px;color:var(--text2);line-height:1.7">'
    + '<b>Conducta diaria.</b> Desde el ' + _cdEsc(r.conducta.desde) + ' la conducta se evalúa cada día (pestaña Horarios → «Conducta de hoy»), por el encargado o la administración. '
    + 'El puntaje del mes es el promedio de los días de trabajo de cada barbero; un día sin cambios conserva el valor anterior (marcado «copiado»). '
    + 'Las correcciones de días anteriores las hace solo la administración, con justificación, y quedan en el historial.</div>'
    + '<div id="cdPrefA4Kpi" style="margin-bottom:16px"></div>';
}

function kpiMetodologiaV2Html(r){
  var pr = r.produccion, pp = r.propinas, pu = r.puntualidad, va = r.venta_adicional;
  var prodMax = pr.pts_servicios + pr.pts_facturacion + pr.pts_ticket, propMax = pp.pts_cantidad + pp.pts_monto;
  return '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--rl);padding:16px;font-size:12px;color:var(--text2);line-height:1.7">'
    + '<div style="font-weight:700;font-size:13px;margin-bottom:8px;color:var(--text)">📋 Metodología de cálculo (' + _cdEsc(r.nombre) + ')</div>'
    + '<b>Producción (' + prodMax + ' pts):</b> servicios (hasta ' + pr.pts_servicios + ' pts, vs meta individual en servicios a ticket de referencia $' + fmt(pr.ticket_meta_ref) + ') + facturación (hasta ' + pr.pts_facturacion + ' pts, vs meta individual) + ticket promedio (hasta ' + pr.pts_ticket + ' pts, ref. $' + fmt(pr.ticket_ref) + ').<br>'
    + '<b>Conducta (' + r.conducta.pts + ' pts):</b> promedio ponderado de ' + r.conducta.indicadores.length + ' indicadores de 0 a ' + r.conducta.escala_max + ', evaluados cada día; el mes es el promedio de los días de trabajo.<br>'
    + '<b>Puntualidad (' + (pu.pts_entrada + pu.pts_salida) + ' pts):</b> entrada ' + pu.pts_entrada + ' + salida ' + pu.pts_salida + ', con las marcas del servidor contra el horario del local de cada día (tolerancia de entrada ' + pu.gracia_min + ' min; cada bloque de ' + pu.bloque_min + ' min de atraso o salida anticipada resta 1/' + pu.sextos + '; desde ' + pu.cero_min + ' min, cero). Un día sin marca vale 0.<br>'
    + '<b>Venta adicional (' + va.pts + ' pts):</b> todo o nada: al menos ' + String(Math.round(va.umbral * 100)) + ' % de sus servicios con un producto vendido a su nombre.<br>'
    + '<b>Propinas (' + propMax + ' pts):</b> cantidad (hasta ' + pp.pts_cantidad + ') + monto (hasta ' + pp.pts_monto + '), por día trabajado contra el promedio del local del mismo mes.<br>'
    + 'Puntaje máximo: ' + r.puntaje_max + '. Reglas guardadas en el servidor (configuración del local), versionadas por mes.</div>';
}
