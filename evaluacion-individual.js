// Vista individual (panel focus view): ONE barber's evaluation for the CURRENT month, read-only.
// Admin only. Opens a full-screen overlay that covers the whole panel. The content comes from GET /api/v2/kpi/evaluacion/:bid for that
// barber only (never from the all-barber data already loaded). There is no month selector and no way to move to another barber from
// inside. Closing ("Cerrar" or Esc) removes the overlay from the DOM and drops its data from memory.
// Amounts in pesos, revenue, the group-goal amount and goal progress are never shown: the API does not send them.

(function(){
  var css = ''
    + '#evalIndOverlay{position:fixed;inset:0;z-index:10000;background:var(--bg);color:var(--text);display:flex;flex-direction:column;'
    + 'overflow:auto;-webkit-overflow-scrolling:touch;font-family:var(--sans);font-size:15px;line-height:1.5;width:100%;height:100%}'
    + '#evalIndOverlay *{box-sizing:border-box}'
    + '.evi-top{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 24px;'
    + 'background:var(--brand-primary,#0E3B2E);color:#fff;flex-wrap:wrap}'
    + '.evi-titulo{font-size:18px;font-weight:700;letter-spacing:.01em;min-width:0;overflow-wrap:anywhere}'
    + '.evi-cerrar{padding:9px 18px;border:1px solid rgba(255,255,255,.6);border-radius:var(--r);background:transparent;color:#fff;font-size:14px;font-weight:600;cursor:pointer;min-height:44px}'
    + '.evi-cerrar:focus{outline:2px solid #fff;outline-offset:2px}'
    + '.evi-cuerpo{padding:18px 24px 32px;width:100%}'
    + '.evi-meta{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;margin-bottom:14px;font-size:14px;color:var(--text2)}'
    + '.evi-prov{background:#fff7e0;color:#7a5200;border:1px solid #efd38a;border-radius:999px;padding:2px 10px;font-size:13px;font-weight:600}'
    + '.evi-score{display:flex;flex-wrap:wrap;gap:12px 18px;align-items:center;margin-bottom:14px}'
    + '.evi-total{font-size:40px;font-weight:800;line-height:1;color:var(--brand-primary,#0E3B2E)}'
    + '.evi-total small{font-size:18px;font-weight:600;color:var(--text2)}'
    + '.evi-tier{font-size:18px;font-weight:800;padding:6px 14px;border-radius:var(--rl);background:var(--surface);border:1px solid var(--border)}'
    + '.evi-bono{font-size:15px;color:var(--text)}'
    + '.evi-bono small{display:block;color:var(--text2);font-size:13px}'
    + '.evi-disq{background:#fdecea;color:#8a2a1f;border:1px solid #f1b8b0;border-radius:var(--rl);padding:10px 14px;font-weight:600;margin-bottom:14px}'
    + '.evi-bloque{background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);padding:14px 16px;margin-bottom:14px}'
    + '.evi-bloque h3{margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:var(--text2)}'
    + '.evi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:12px}'
    + 'table.evi-t{width:100%;border-collapse:collapse;font-size:15px}'
    + 'table.evi-t th,table.evi-t td{padding:8px 6px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top}'
    + 'table.evi-t th{font-size:13px;color:var(--text2);font-weight:600}'
    + 'table.evi-t td.n,table.evi-t th.n{text-align:right;font-family:var(--mono);white-space:nowrap}'
    + '.evi-det{font-size:13px;color:var(--text2);display:block;margin-top:2px}'
    + '.evi-tend{font-weight:600;white-space:nowrap}'
    + '.evi-tend.up{color:var(--ok)}.evi-tend.down{color:var(--err)}.evi-tend.flat{color:var(--text2)}.evi-tend.insufficient{color:var(--text3);font-weight:500}'
    + '.evi-meta-local{margin:0 0 14px}.evi-meta-txt{font-size:15px;color:var(--text);margin-bottom:6px}'
    + '.evi-bar{height:10px;border-radius:999px;background:var(--surface2);border:1px solid var(--border);overflow:hidden}'
    + '.evi-bar span{display:block;height:100%;background:var(--warn)}.evi-bar.ok span{background:var(--ok)}'
    + '.evi-proy{background:var(--surface2);border:1px dashed var(--border2);border-radius:var(--rl);padding:12px 14px;margin-bottom:14px;font-size:15px}'
    + '.evi-proy small{display:block;color:var(--text2);font-size:13px}'
    + '.evi-hint{margin:0;padding-left:20px}.evi-hint li{margin-bottom:6px}'
    + '.evi-estado{padding:30px 0;color:var(--text2);font-size:16px}'
    + '.evi-error{background:#fdecea;color:#8a2a1f;border:1px solid #f1b8b0;border-radius:var(--rl);padding:14px 16px;margin:16px 0}'
    + '.evi-error button,.evi-abrir{margin-top:10px;padding:9px 16px;border:1px solid var(--border2);border-radius:var(--r);background:var(--surface);color:var(--text);font-size:14px;font-weight:600;cursor:pointer;min-height:40px}'
    + '.evi-abrir{margin-top:0;background:var(--text);color:#fff;border-color:var(--text);font-size:12px;padding:6px 12px;min-height:32px;white-space:nowrap}'
    + '@media (max-width:600px){.evi-top{padding:10px 14px}.evi-cuerpo{padding:14px 14px 28px}.evi-total{font-size:34px}table.evi-t{font-size:14px}}';
  var s = document.createElement('style');
  s.id = 'evalIndCss';
  s.textContent = css;
  document.head.appendChild(s);
})();

var _evalInd = null;     // { bid, seq, onKey } while the overlay is open; null otherwise
var _evalIndSeq = 0;     // an answer that arrives after the view was closed or replaced is ignored

function evalIndAbrir(bid){
  if(typeof _panelRole === 'undefined' || _panelRole !== 'admin') return;   // rendered only for the admin; the server refuses others too
  if(!bid) return;
  evalIndCerrar();
  var seq = ++_evalIndSeq;
  var ov = document.createElement('div');
  ov.id = 'evalIndOverlay';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.setAttribute('aria-labelledby', 'evalIndTitulo');
  ov.innerHTML = '<div class="evi-top"><div class="evi-titulo" id="evalIndTitulo">Evaluación individual</div>'
    + '<button type="button" class="evi-cerrar" id="evalIndCerrarBtn">Cerrar</button></div>'
    + '<div class="evi-cuerpo" id="evalIndCuerpo"><div class="evi-estado" role="status">Cargando la evaluación…</div></div>';
  document.body.appendChild(ov);
  var onKey = function(e){ if(e.key === 'Escape') evalIndCerrar(); };
  document.addEventListener('keydown', onKey);
  _evalInd = { bid: bid, seq: seq, onKey: onKey };
  document.getElementById('evalIndCerrarBtn').onclick = function(){ evalIndCerrar(); };
  document.getElementById('evalIndCerrarBtn').focus();
  fetchConReintentos(API_URL + '/api/v2/kpi/evaluacion/' + encodeURIComponent(bid)).then(function(r){
    if(!_evalInd || _evalInd.seq !== seq) return;          // closed or replaced meanwhile
    if(!r.ok){ evalIndMostrarError(r.motivo, bid); return; }
    if(r.json.disponible !== true){ evalIndMostrarSinEvaluacion(r.json.mensaje); return; }
    _evalInd.dto = r.json.evaluacion;
    evalIndRender(_evalInd.dto);
  });
}

// Closes the overlay: removes its DOM and drops its data.
function evalIndCerrar(){
  if(!_evalInd) return;
  document.removeEventListener('keydown', _evalInd.onKey);
  var ov = document.getElementById('evalIndOverlay');
  if(ov) ov.parentNode.removeChild(ov);
  _evalInd = null;
}

function evalIndMostrarError(motivo, bid){
  var c = document.getElementById('evalIndCuerpo');
  if(!c) return;
  c.innerHTML = '<div class="evi-error" role="alert">No se pudo cargar la evaluación: ' + _escHtml(motivo || 'error desconocido')
    + '. No se muestran datos parciales.<br><button type="button" id="evalIndReintentar">Reintentar</button></div>';
  document.getElementById('evalIndReintentar').onclick = function(){ evalIndCerrar(); evalIndAbrir(bid); };
}

function evalIndMostrarSinEvaluacion(mensaje){
  var c = document.getElementById('evalIndCuerpo');
  if(c) c.innerHTML = '<div class="evi-estado" role="status">' + _escHtml(mensaje || 'Sin evaluación este mes') + '</div>';
}

function evalIndFecha(iso){
  try{
    return new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  }catch(e){ return String(iso || ''); }
}
function evalIndPct(x){ return String(x).replace('.', ',') + ' %'; }
// a whole percentage from the DTO, clamped to 0..100 (the DTO already sends integers)
function evalIndEntero(x){ var n = Math.floor(Number(x)); return isFinite(n) ? Math.max(0, Math.min(100, n)) : 0; }
// conduct averages: always two decimals, a comma as the decimal mark ("4,00", "8,52")
function evalIndDos(x){ return Number(x).toFixed(2).replace('.', ','); }
// the days without a clock-in / clock-out mark, with the neutral wording the App shows too; empty when there are none
function evalIndSinMarca(det){
  var partes = [];
  if(det.diasSinEntrada > 0) partes.push((det.diasSinEntrada === 1 ? 'Día' : 'Días') + ' sin marca de entrada: ' + det.diasSinEntrada);
  if(det.diasSinSalida > 0) partes.push((det.diasSinSalida === 1 ? 'Día' : 'Días') + ' sin marca de salida: ' + det.diasSinSalida);
  return partes.length ? '<br>' + _escHtml(partes.join(' · ')) : '';
}
var EVI_TENDENCIA = {
  up: '▲ sube', flat: '● estable', down: '▼ baja', insufficient: 'sin tendencia aún'
};

// Draws the DTO. Every value comes from the DTO; nothing is computed here, and nothing from another barber is in it.
function evalIndRender(d){
  var c = document.getElementById('evalIndCuerpo');
  var t = document.getElementById('evalIndTitulo');
  if(!c || !d) return;
  var comp = d.components;
  var maxTotal = comp.production.max + comp.conduct.max + comp.punctuality.max + comp.upselling.max + comp.tips.max;
  if(t) t.textContent = d.barberName + ' · evaluación del mes';

  var h = '<div class="evi-meta"><span>Actualizado: ' + _escHtml(evalIndFecha(d.computedAt)) + '</span>'
    + '<span class="evi-prov">' + _escHtml('Provisional hasta el cierre del mes') + '</span></div>';

  h += '<div class="evi-score"><div class="evi-total">' + _escHtml(String(d.totalScore).replace('.', ','))
    + '<small> / ' + maxTotal + ' pts</small></div>'
    + '<div class="evi-tier">' + _escHtml(d.tierNombre ? d.tier + ' · ' + d.tierNombre : d.tier) + '</div>';
  if(d.bonusPct != null){
    h += '<div class="evi-bono">' + _escHtml('Estrato ' + d.bonusTier + ' · ' + evalIndPct(d.bonusPct))
      + '<small>Se paga solo si la meta del grupo se cumple.</small></div>';
  } else {
    h += '<div class="evi-bono">Sin bono este mes<small>Se paga solo si la meta del grupo se cumple.</small></div>';
  }
  h += '</div>';
  // the local's billing goal: percentages only (owner decision). No goal configured → no block.
  if(d.metaLocal){
    var ml = d.metaLocal, cum = evalIndEntero(ml.cumplidaPct), fal = evalIndEntero(ml.faltantePct);
    var txtMeta = ml.cumplida ? 'Meta cumplida · ' + fal + ' % faltante' : 'Meta del local: ' + cum + ' % cumplida · ' + fal + ' % faltante';
    h += '<div class="evi-meta-local"><div class="evi-meta-txt">' + _escHtml(txtMeta) + '</div>'
      + '<div class="evi-bar ' + (ml.cumplida ? 'ok' : 'pend') + '" role="progressbar" aria-label="' + _escHtml(txtMeta) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + cum + '"><span style="width:' + cum + '%"></span></div></div>';
  }

  if(d.disqualified && d.disqualified.active){
    h += '<div class="evi-disq" role="status">' + _escHtml(d.disqualified.reason || 'Descalificado este mes') + '</div>';
  }

  if(d.productionProjection){
    var p = d.productionProjection;
    h += '<div class="evi-proy">' + _escHtml('A este ritmo cierras el mes con ' + String(p.projectedPoints).replace('.', ',') + ' / ' + p.max + ' pts (estimación)')
      + '<small>Calculado con ' + p.basisDays + ' días de trabajo transcurridos. No cambia el puntaje oficial.</small></div>';
  }

  h += '<div class="evi-grid">';
  h += '<div class="evi-bloque"><h3>Puntaje por componente</h3><table class="evi-t"><thead><tr><th>Componente</th><th class="n">Puntos</th></tr></thead><tbody>'
    + '<tr><td>Producción<span class="evi-det">' + comp.production.detail.servicios + ' servicios · meta individual de servicios ' + comp.production.detail.metaServicios + '</span></td><td class="n">' + evalIndPts(comp.production) + '</td></tr>'
    + '<tr><td>Conducta diaria</td><td class="n">' + evalIndPts(comp.conduct) + '</td></tr>'
    + '<tr><td>Puntualidad<span class="evi-det">bloques de atraso o salida anticipada: ' + comp.punctuality.detail.lateBlocks
      + evalIndSinMarca(comp.punctuality.detail) + '</span></td><td class="n">' + evalIndPts(comp.punctuality) + '</td></tr>'
    + '<tr><td>Venta adicional<span class="evi-det">' + comp.upselling.detail.conProducto + ' de ' + comp.upselling.detail.servicios + ' servicios con producto (umbral ' + comp.upselling.detail.umbralPct + ' %)</span></td><td class="n">' + evalIndPts(comp.upselling) + '</td></tr>'
    + '<tr><td>Propinas</td><td class="n">' + evalIndPts(comp.tips) + '</td></tr>'
    + '</tbody></table></div>';

  h += '<div class="evi-bloque"><h3>Conducta por indicador (promedio del mes, de 0 a 10)</h3>';
  if(d.conductRows && d.conductRows.length){
    h += '<table class="evi-t"><thead><tr><th>Indicador</th><th class="n">Promedio</th><th>Tendencia</th></tr></thead><tbody>';
    d.conductRows.forEach(function(r){
      h += '<tr><td>' + _escHtml(r.label) + '</td><td class="n">' + _escHtml(evalIndDos(r.monthlyAvg)) + '</td>'
        + '<td><span class="evi-tend ' + _escHtml(r.trend) + '">' + _escHtml(EVI_TENDENCIA[r.trend] || '') + '</span></td></tr>';
    });
    h += '</tbody></table>';
  } else {
    h += '<div class="evi-estado">Sin indicadores este mes.</div>';
  }
  h += '<div class="evi-det" style="margin-top:8px">Días con conducta copiada (sin cambios): ' + _escHtml(String(d.carryOverDays)) + '</div></div>';
  h += '</div>';

  if(d.improvementHints && d.improvementHints.length){
    h += '<div class="evi-bloque"><h3>Qué mejorar</h3><ul class="evi-hint">';
    d.improvementHints.forEach(function(x){ h += '<li>' + _escHtml(x.text) + '</li>'; });
    h += '</ul></div>';
  }
  c.innerHTML = h;
}

function evalIndPts(x){
  return _escHtml(String(Math.round(x.earned * 10) / 10).replace('.', ',')) + ' / ' + x.max;
}
