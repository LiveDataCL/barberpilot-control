// Fails (exit 1) when a CLIENT deployment folder of the control panel carries anything that belongs to another business:
// a hard-coded production host, Salón Men names, or a page that talks to a server without reading config.js.
// Usage: node scripts/verificar-despliegue-cliente.cjs <folder of the client deployment>
// Run it in the build of every client deployment (tampico-control etc.), never against this repository itself (Salón Men is its own client).
'use strict';
const fs = require('fs');
const path = require('path');

// Hosts and names of the first business. Add every other business's host here when it exists.
const FORBIDDEN = [
  { re: /barberpilot-api-production\.up\.railway\.app/i, why: "Salón Men's production API host" },
  { re: /livedatacl\.github\.io/i, why: 'the shared GitHub Pages origin (shares browser storage with Salón Men)' },
  { re: /salonmensf/i, why: "Salón Men's public address" },
  { re: /sal[oó]n\s+men/i, why: 'the name "Salón Men"' },
  { re: /sa[uú]l\s+fino/i, why: 'the name "Saúl Fino"' },
  { re: /saulfino777/i, why: "Salón Men's bank e-mail" },
];
const TEXT = /\.(html?|js|cjs|mjs|css|json|xml|webmanifest)$|(^|[\\/])CNAME$/i;   // code and served files; README/VERSION notes are documentation

function listar(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    if (e.name === '.git' || e.name === 'node_modules') return;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listar(p, out); else out.push(p);
  });
  return out;
}

function verificar(dir) {
  const fallas = [];
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return ['folder not found: ' + dir];
  const cfgPath = path.join(dir, 'config.js');
  if (!fs.existsSync(cfgPath)) fallas.push('config.js is missing (every page must read its settings from it)');
  else {
    const c = fs.readFileSync(cfgPath, 'utf8');
    if (!/["']?apiUrl["']?\s*:\s*["']https:\/\/[^"']+["']/.test(c)) fallas.push('config.js has no apiUrl');
    if (!/["']?nombre["']?\s*:\s*["'][^"']+["']/.test(c)) fallas.push('config.js has no nombre');
  }
  if (fs.existsSync(cfgPath) && /["']?agenda["']?\s*:\s*true/.test(fs.readFileSync(cfgPath, 'utf8')) && !fs.existsSync(path.join(dir, 'agenda-admin.html'))) fallas.push('config.js turns the Agenda on (agenda: true) but agenda-admin.html is not in this deployment');
  listar(dir, []).forEach(function (f) {
    const rel = path.relative(dir, f).replace(/\\/g, '/');
    if (!TEXT.test(f)) return;
    const s = fs.readFileSync(f, 'utf8');
    FORBIDDEN.forEach(function (r) { if (r.re.test(s)) fallas.push(rel + ': contains ' + r.why); });
    if (rel !== 'config.js') {
      const h = s.match(/https?:\/\/[a-z0-9.-]+\.up\.railway\.app/i);
      if (h) fallas.push(rel + ': hard-coded server address ' + h[0] + ' (read it from config.js)');
    }
    if (/\.html?$/i.test(rel) && /\bfetch\s*\(/.test(s) && !/<script[^>]+src=["']config\.js/i.test(s)) fallas.push(rel + ': talks to a server but does not load config.js');
  });
  return fallas;
}

module.exports = { verificar };
if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) { console.error('usage: node verificar-despliegue-cliente.cjs <folder>'); process.exit(2); }
  const fallas = verificar(path.resolve(dir));
  if (fallas.length) { console.error('FAIL: ' + fallas.length + ' problem(s) in ' + dir); fallas.forEach(function (x) { console.error(' - ' + x); }); process.exit(1); }
  console.log('OK: no foreign hosts, names or config-less pages in ' + dir);
}
