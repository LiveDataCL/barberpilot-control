// Shared by every page of the panel (index.html, dashboard_kpis_barberia.html,
// agenda-admin.html, pago.html). The ONE place that turns data into text a
// page shows (security fix 2026-10-15): a name or any value that came from
// the server or a form is always shown as plain text, never run as code.
//
// escHtml — for text and for quoted attributes (title="…", value="…"):
//   & < > " ' are all escaped. null/undefined show as empty.
// escJsAttr — for a value inside a JavaScript string in an event attribute,
//   e.g. onclick="f('…')". The browser decodes the attribute (&#39; → ')
//   before running the JavaScript, so HTML escaping alone is not enough:
//   first escape for a single-quoted JS string, then for the attribute.
function escHtml(s){
  return (s==null?'':String(s)).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function escJsAttr(s){
  return escHtml((s==null?'':String(s)).replace(/\\/g,'\\\\').replace(/'/g,"\\'")
    .replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/</g,'\\x3c')
    .replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029'));
}
