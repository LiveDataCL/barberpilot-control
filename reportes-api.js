// Shared by index.html (control panel) and dashboard_kpis_barberia.html.
// Each page defines API_URL and getAuthHeaders() (panel login: Bearer
// panelJwt from sessionStorage) before using these functions.
//
// Sales/expenses reads: ONE authenticated request per period
// (/registros/rango, /gastos/rango, /resumen/rango) instead of one public
// request per day. The old per-day loops dropped any day that failed (e.g.
// rate limited) without a word, so totals came out low.
// fetchConReintentos retries 429 / 5xx / network failures up to
// REINTENTOS_MAX attempts (waits RateLimit-Reset when readable, else 1 s,
// 2 s, 4 s) and resolves to {ok:true,json} or {ok:false,motivo,status}.
// A period either loads completely or fails as a whole — never partially —
// and every caller must show the failure, never a total built from less.
var REINTENTOS_MAX = 4; // technical bound so a read never waits forever
function _esperaReintento(r,intento){
  var reset=r?parseInt(r.headers.get('RateLimit-Reset'),10):NaN;
  if(reset>0) return reset*1000;
  return 1000*Math.pow(2,intento-1);
}
function fetchConReintentos(url){
  var intento=0;
  function uno(){
    intento++;
    return fetch(url,{headers:getAuthHeaders()}).then(function(r){
      if(r.status===401) return {ok:false,status:401,motivo:'tu sesión expiró; vuelve a ingresar'};
      if(r.status===429||r.status>=500){
        if(intento<REINTENTOS_MAX){
          return new Promise(function(ok){setTimeout(ok,_esperaReintento(r,intento));}).then(uno);
        }
        return {ok:false,status:r.status,motivo:r.status===429?'el servidor rechazó la consulta por exceso de solicitudes':'el servidor respondió con un error ('+r.status+')'};
      }
      return r.json().then(function(j){
        if(r.ok&&j&&j.ok) return {ok:true,json:j};
        return {ok:false,status:r.status,motivo:(j&&j.detalle)||('respuesta inesperada del servidor ('+r.status+')')};
      },function(){ return {ok:false,status:r.status,motivo:'respuesta ilegible del servidor'}; });
    },function(){
      if(intento<REINTENTOS_MAX){
        return new Promise(function(ok){setTimeout(ok,_esperaReintento(null,intento));}).then(uno);
      }
      return {ok:false,status:0,motivo:'sin conexión con el servidor'};
    });
  }
  return uno();
}
// partes: {registros, gastos, resumen} — which of the three to load.
// Resolves {ok:true, registros, gastos, resumen} or {ok:false, motivo, status}.
function cargarPeriodoApi(desde,hasta,partes){
  if(!API_URL) return Promise.resolve({ok:false,status:0,motivo:'no hay servidor configurado'});
  var q='?desde='+encodeURIComponent(desde)+'&hasta='+encodeURIComponent(hasta);
  var nombres=[], pedidos=[];
  if(partes.registros){ nombres.push('registros'); pedidos.push(fetchConReintentos(API_URL+'/registros/rango'+q)); }
  if(partes.gastos){ nombres.push('gastos'); pedidos.push(fetchConReintentos(API_URL+'/gastos/rango'+q)); }
  if(partes.resumen){ nombres.push('resumen'); pedidos.push(fetchConReintentos(API_URL+'/resumen/rango'+q)); }
  return Promise.all(pedidos).then(function(res){
    var out={ok:true};
    for(var i=0;i<res.length;i++){
      if(!res[i].ok) return {ok:false,status:res[i].status,motivo:res[i].motivo};
      var dato=nombres[i]==='resumen'?res[i].json.data:res[i].json[nombres[i]];
      if(!dato) return {ok:false,status:200,motivo:'respuesta incompleta del servidor'};
      out[nombres[i]]=dato;
    }
    return out;
  });
}
function _fechaLegible(f){ var p=String(f).split('-'); return p.length===3?p[2]+'-'+p[1]+'-'+p[0]:String(f); }
function textoPeriodo(desde,hasta){
  return desde===hasta?'del '+_fechaLegible(desde):'del '+_fechaLegible(desde)+' al '+_fechaLegible(hasta);
}

// Panel login (POST /api/v2/panel/login). On success the token is stored
// under the same sessionStorage key the control panel uses, so both pages
// share one session per browser tab. Resolves the server's JSON; rejects on
// a network failure.
function solicitarLoginPanel(email,password){
  return fetch(API_URL+'/api/v2/panel/login',{
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:email,password:password})
  })
  .then(function(r){return r.json();})
  .then(function(j){
    if(j&&j.ok&&j.token) sessionStorage.setItem('panelJwt',j.token);
    return j;
  });
}
function mensajeErrorLogin(j){
  return (j&&j.message)||(j&&j.error==='invalid_credentials'?'Credenciales incorrectas':'Error al ingresar');
}

// Rendering guard for a page section (KPI tab, history, KPI dashboard): if
// the render throws, the section shows a visible Spanish error with a
// "Reintentar" button — never a blank or half-drawn pane — and the error is
// logged to the console. reintentar: the function the button calls.
function renderSeguro(contenedorId,render,reintentar){
  try { return render(); }
  catch(e){
    if(window.console) console.error('[renderSeguro] '+contenedorId+':',e);
    var el=document.getElementById(contenedorId);
    if(!el) return;
    var box=document.createElement('div');
    box.className='aviso-render';
    box.setAttribute('style','font-size:13px;line-height:1.5;border-radius:6px;padding:12px 14px;margin:8px 0;border:1px solid #f5b7b1;background:#fdecea;color:#7a1c12');
    box.textContent='⚠ No se pudo mostrar esta sección por un error interno ('+((e&&e.message)||e)+'). Los datos guardados no se modificaron. ';
    if(reintentar){
      var b=document.createElement('button');
      b.textContent='Reintentar';
      b.setAttribute('style','margin-left:8px;padding:5px 12px;cursor:pointer');
      b.onclick=function(){ reintentar(); };
      box.appendChild(b);
    }
    el.innerHTML='';
    el.appendChild(box);
  }
}
