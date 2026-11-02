// Self-test of the client-deployment check: node scripts/verificar-despliegue-cliente.test.cjs
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { verificar } = require('./verificar-despliegue-cliente.cjs');

const CFG = 'window.BP_CONFIG = { "apiUrl": "https://api-otro.up.railway.app", "tenantSlug": "x", "nombre": "Otro Negocio" };\n';
let n = 0, bad = 0;
function caso(nombre, archivos, esperaFalla) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'vdc-'));
  Object.keys(archivos).forEach(function (k) { fs.writeFileSync(path.join(d, k), archivos[k]); });
  const f = verificar(d); n++;
  const ok = esperaFalla ? f.length > 0 : f.length === 0;
  if (!ok) { bad++; console.error('FAIL: ' + nombre + ' -> ' + JSON.stringify(f)); } else console.log('ok: ' + nombre);
  fs.rmSync(d, { recursive: true, force: true });
}
const PAG = '<script src="config.js"></script><script>fetch(window.BP_CONFIG.apiUrl+"/x")</script>';
caso('clean deployment passes', { 'config.js': CFG, 'index.html': PAG }, false);
caso('missing config.js fails (closed)', { 'index.html': PAG }, true);
caso('config without apiUrl fails', { 'config.js': 'window.BP_CONFIG = { nombre: "X" };', 'index.html': PAG }, true);
caso("Salón Men's host in a page fails", { 'config.js': CFG, 'agenda-admin.html': PAG + "<script>const API='https://barberpilot-api-production.up.railway.app'</script>" }, true);
caso('any other hard-coded railway host in a page fails', { 'config.js': CFG, 'a.html': PAG + "<script>var u='https://otra-api.up.railway.app'</script>" }, true);
caso('Salón Men name in a page fails', { 'config.js': CFG, 'index.html': PAG + '<title>Agenda · Salon Men Saúl Fino</title>' }, true);
caso('shared Pages origin fails', { 'config.js': CFG, 'index.html': PAG + '<a href="https://livedatacl.github.io/x">x</a>' }, true);
caso('page with fetch but no config.js fails', { 'config.js': CFG, 'dash.html': '<script>fetch("/x")</script>' }, true);
caso('the internal tenant id alone is allowed', { 'config.js': CFG.replace('"x"', '"saulfino"'), 'index.html': PAG }, false);
caso('Agenda on without its page fails', { 'config.js': CFG.replace('"nombre"', 'agenda: true, "nombre"'), 'index.html': PAG }, true);
caso('Agenda on with its page passes', { 'config.js': CFG.replace('"nombre"', 'agenda: true, "nombre"'), 'index.html': PAG, 'agenda-admin.html': PAG }, false);
const SELF = fs.readFileSync(path.join(__dirname, 'verificar-despliegue-cliente.cjs'), 'utf8');
const SELFT = fs.readFileSync(__filename, 'utf8');
const dS = fs.mkdtempSync(path.join(os.tmpdir(), 'vdc-')); fs.mkdirSync(path.join(dS, 'scripts'));
fs.writeFileSync(path.join(dS, 'config.js'), CFG); fs.writeFileSync(path.join(dS, 'index.html'), PAG);
fs.writeFileSync(path.join(dS, 'scripts', 'verificar-despliegue-cliente.cjs'), SELF); fs.writeFileSync(path.join(dS, 'scripts', 'verificar-despliegue-cliente.test.cjs'), SELFT);
fs.writeFileSync(path.join(dS, 'scripts', 'otro.cjs'), '// Salón Men');
const fS = verificar(dS); n++;
if (fS.length === 1 && /scripts\/otro\.cjs/.test(fS[0])) console.log('ok: the check and its self-test are not flagged for naming the forbidden names, any other script is'); else { bad++; console.error('FAIL: self-skip -> ' + JSON.stringify(fS)); }
fs.rmSync(dS, { recursive: true, force: true });
if (bad) { console.error(bad + ' of ' + n + ' cases failed'); process.exit(1); }
console.log('all ' + n + ' cases pass');
