// Servidor de proves: serveix www/ i imita la Realtime Database de Firebase (REST + EventSource) a /db, en memòria.
// Així es pot provar l'app sense tocar el servidor de veritat:  node scripts/servidor-prova.mjs [port]
// Obre dues pestanyes (o una normal i una d'incògnit) i fes servir el mateix codi de família.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../www/', import.meta.url));
const port = +process.argv[2] || 8797;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };

let arbre = {};
const ntfy = []; // missatges que l'app hauria enviat a ntfy.sh
const oients = new Set(); // {parts, res}

const trossos = (p) => p.split('/').filter(Boolean);
function obte(parts) { let n = arbre; for (const k of parts) { if (n == null || typeof n !== 'object') return null; n = n[k]; } return n ?? null; }
function posa(parts, v) {
  if (!parts.length) { arbre = v ?? {}; return; }
  let n = arbre;
  for (const k of parts.slice(0, -1)) { if (typeof n[k] !== 'object' || n[k] == null) n[k] = {}; n = n[k]; }
  if (v == null) delete n[parts.at(-1)]; else n[parts.at(-1)] = v;
}
const resol = (v) => (v && typeof v === 'object') ? (v['.sv'] === 'timestamp' ? Date.now()
  : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resol(x)]))) : v;

function avisa(parts, data) {
  for (const o of oients) {
    const n = o.parts.length;
    if (parts.slice(0, n).join('/') !== o.parts.join('/')) continue; // només canvis dins del que escolta
    const rel = '/' + parts.slice(n).join('/');
    o.res.write(`event: put\ndata: ${JSON.stringify({ path: rel, data })}\n\n`);
  }
}

createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (u.pathname === '/ntfy' || u.pathname === '/ntfy/') {
    if (req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(ntfy)); return; }
    let cos = '';
    for await (const c of req) cos += c;
    ntfy.push(JSON.parse(cos || '{}'));
    console.log('ntfy:', cos);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end('{}');
    return;
  }
  if (u.pathname.startsWith('/db/')) {
    const parts = trossos(decodeURIComponent(u.pathname.slice(4).replace(/\.json$/, '')));
    if (req.method === 'GET' && (req.headers.accept || '').includes('text/event-stream')) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(`event: put\ndata: ${JSON.stringify({ path: '/', data: obte(parts) })}\n\n`);
      const o = { parts, res };
      oients.add(o);
      req.on('close', () => oients.delete(o));
      return;
    }
    if (req.method === 'GET') {
      let v = obte(parts);
      if (u.searchParams.get('shallow') && v && typeof v === 'object') v = Object.fromEntries(Object.keys(v).map((k) => [k, true]));
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(v));
      return;
    }
    if (req.method === 'POST') { // push: id nou ordenat per temps, com Firebase
      let cos = '';
      for await (const c of req) cos += c;
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const v = resol(JSON.parse(cos || 'null'));
      posa([...parts, id], v);
      avisa([...parts, id], v);
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ name: id }));
      return;
    }
    if (req.method === 'PUT' || req.method === 'DELETE') {
      let cos = '';
      for await (const c of req) cos += c;
      const v = req.method === 'DELETE' ? null : resol(JSON.parse(cos || 'null'));
      posa(parts, v);
      avisa(parts, v);
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(v));
      return;
    }
    res.writeHead(405).end(); return;
  }
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index.html';
  if (p === '/config.js') { // apunta l'app al servidor de proves
    res.writeHead(200, { 'Content-Type': types['.js'], 'Cache-Control': 'no-cache' })
      .end(`window.ONSOC_DB = location.origin + '/db'; window.ONSOC_ARREL = 'onsoc'; window.ONSOC_NTFY = location.origin + '/ntfy'; window.ONSOC_WEB = location.origin + '/';`);
    return;
  }
  const file = normalize(join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  let cos;
  try { cos = await readFile(file); } catch { res.writeHead(404).end('No trobat'); return; }
  res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(cos);
}).listen(port, () => console.log(`Proves: http://localhost:${port}  (servidor fals a /db)`));
