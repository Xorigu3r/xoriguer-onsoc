/* Xoriguer On Sóc — ubicació compartida de la família, llocs amb avís, acompanya'm, recorregut i SOS.
 * Una sola web: PWA (només envia mentre és oberta) i app Android/iOS amb Capacitor (envia també amb l'app tancada,
 * amb el plugin BackgroundGeolocation, que manté un avís fix a la barra).
 * Servidor: Firebase Realtime Database per REST + EventSource. Tot el que s'hi desa va xifrat (cripto.js):
 *   onsoc/<fam>/m/<membre>            estat de cada membre (posició, bateria, SOS, acompanya'm, fitxa mèdica)
 *   onsoc/<fam>/l                     llista de llocs de la família
 *   onsoc/<fam>/e/<id>                avisos (arribades, sortides, SOS, estic bé, on ets?...), 7 dies
 *   onsoc/<fam>/h/<membre>/<dia>/<id> recorregut, 7 dies
 *   onsoc/<enllaç>/p                  enllaç temporal per a algú de fora (xifrat amb una clau pròpia que va al #)
 * Avisos amb l'app tancada: ntfy (tema derivat del codi; només nom i què ha passat, mai la ubicació).
 * Idiomes: i18n.js + traduccions.js (la clau és el text català). Text nou -> fila nova a traduccions.js.
 */
'use strict';
const VERSIO = '1.4.1';

// ---------- idioma ----------
const T_ = (s, v) => (typeof I18N !== 'undefined' ? I18N.t(s, v)
  : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));
const LOC = () => ({ ca: 'ca', es: 'es', fr: 'fr', en: 'en-GB' }[typeof I18N !== 'undefined' ? I18N.llengua : 'ca'] || 'ca');

// ---------- constants ----------
const COLORS = ['#F2650F', '#2F80ED', '#27AE60', '#C2185B', '#8E44AD', '#00A3A3', '#D4A017', '#6D4C41'];
const VELL_MIN = 30;              // més minuts que això sense notícies -> gris
const SOS_VIGENT_H = 24;          // un SOS de fa més hores ja no s'avisa
const ENVIA_DIST_M = 25;          // envia si s'ha mogut més que això...
const ENVIA_CADA_S = 120;         // ...o si fa més d'aquests segons
const ENVIA_MIN_S = 10;           // mai més sovint que això (tret de l'SOS)
const BATEC_S = 300;              // amb el mòbil quiet, torna a dir "sóc aquí" cada 5 min
const HIST_DIST_M = 75;           // recorregut: un punt cada 75 m...
const HIST_CADA_S = 900;          // ...o cada 15 min
const GUARDA_DIES = 7;            // recorregut i avisos
const BAT_BAIXA = 15, BAT_REARMA = 25;
const LLOC_HISTERESI_M = 40;      // per sortir d'un lloc cal allunyar-se'n radi + això (evita avisos per salts del GPS)
const LLOC_PRECISIO_M = 150;      // posicions pitjors que això no compten per als llocs
const ACOMP_MARGE_S = 120;        // acompanya'm: després de l'hora, 2 min per respondre abans de l'SOS automàtic
const ACOMP_ALTRES_S = 300;       // els altres el veuen "no ha arribat" 5 min després de l'hora
const DEMANA_ESPERA_S = 180;      // "on ets?": temps d'espera abans de dir "no respon"
const RADIS = [100, 200, 500];
const TEMPS_ACOMP = [10, 15, 20, 30, 45, 60];
const HORES_INACTIU = [0, 3, 6, 12, 24];   // 0 = sense avís
const HORES_ENLLAC = [1, 8, 24];

// ---------- lògica pura ----------
function distanciaM(a, b) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function textDistancia(m) {
  if (m < 1000) return T_('a {n} m', { n: Math.round(m / 10) * 10 });
  return T_('a {n} km', { n: (m / 1000).toLocaleString(LOC(), { maximumFractionDigits: m < 10000 ? 1 : 0 }) });
}
function textFa(t, ara = Date.now()) {
  const s = Math.max(0, Math.round((ara - t) / 1000));
  if (s < 60) return T_('ara mateix');
  const m = Math.round(s / 60);
  if (m < 60) return T_('fa {n} min', { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return T_('fa {n} h', { n: h });
  const d = Math.round(h / 24);
  return d === 1 ? T_('fa 1 dia') : T_('fa {n} dies', { n: d });
}
const textHora = (t) => new Date(t).toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit' });
function calEnviar(ultim, nou, ara) {
  if (!ultim) return true;
  const s = (ara - ultim.t) / 1000;
  if (s < ENVIA_MIN_S) return false;
  return s >= ENVIA_CADA_S || distanciaM(ultim, nou) >= ENVIA_DIST_M;
}
function calHistoric(ultim, nou, ara) {
  if (!ultim) return true;
  return distanciaM(ultim, nou) >= HIST_DIST_M || (ara - ultim.t) / 1000 >= HIST_CADA_S;
}
// Estat respecte d'un lloc amb histèresi: 'dins', 'fora' o l'anterior si no és clar.
function estatLloc(anterior, dist, radi, precisio) {
  if (precisio > LLOC_PRECISIO_M) return anterior;
  if (dist <= radi) return 'dins';
  if (dist > radi + LLOC_HISTERESI_M) return 'fora';
  return anterior || 'fora';
}
// Hores sense notícies a partir de les quals cal avisar (0 = no)
function esInactiu(vist, hores, ara = Date.now()) {
  return !!(hores && vist && ara - vist > hores * 3600e3);
}
function diaLocal(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function textEvent(e) {
  const n = e.nom || '?';
  switch (e.tipus) {
    case 'sos': return T_('{n} ha demanat ajuda (SOS)', { n });
    case 'sosfi': return T_("{n} està bé: ha tret l'SOS", { n });
    case 'arriba': return T_('{n} ha arribat a {l}', { n, l: e.lloc });
    case 'surt': return /^[aeiouàèéíïòóúüh]/i.test(e.lloc || '')
      ? T_("{n} ha sortit d'{l}", { n, l: e.lloc }) : T_('{n} ha sortit de {l}', { n, l: e.lloc });
    case 'estic': return e.lloc ? T_('{n}: estic bé (a {l})', { n, l: e.lloc }) : T_('{n}: estic bé', { n });
    case 'bateria': return T_('{n} té la bateria al {b}%', { n, b: e.bat });
    case 'acomp': return T_('{n} va cap a {l} i hi arriba abans de les {h}', { n, l: e.desti, h: textHora(e.fins) });
    case 'arribat': return e.desti ? T_('{n} ha arribat bé a {l}', { n, l: e.desti }) : T_('{n} ha arribat bé', { n });
    case 'acompfi': return T_("{n} ha deixat l'acompanya'm", { n });
    case 'tard': return T_("{n} no ha arribat a {l} a l'hora i no respon: SOS automàtic", { n, l: e.desti });
    case 'demana': return T_('{n} vol saber on és {a}', { n, a: e.aNom || '?' });
    case 'enllac': return T_('{n} comparteix la ubicació amb algú de fora fins a les {h}', { n, h: textHora(e.fins) });
    case 'enllacfi': return T_('{n} ha deixat de compartir la ubicació amb algú de fora', { n });
    default: return `${n}: ${e.tipus}`;
  }
}
const URGENTS = new Set(['sos', 'tard']);
const inicial = (nom) => (String(nom || '?').trim()[0] || '?').toUpperCase();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const telNet = (t) => String(t || '').replace(/[^\d+]/g, '');
const nouId = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/-/g, '').slice(0, 20);
const teFitxa = (f) => !!(f && Object.values(f).some((v) => String(v || '').trim()));
// Enllaç de «Compartir ubicació» de Google Maps (per als iPhone, que amb la web no envien en segon pla).
// Només acceptem adreces de Google Maps: evita que algú hi posi un enllaç qualsevol.
function enllacGmaps(u) {
  const s = String(u || '').trim();
  return /^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)\/\S*$/i.test(s) ? s : '';
}
// Membre que fa servir la web: només envia la ubicació quan té l'app oberta
const esWeb = (m) => String(m.plat || '').startsWith('web');

// ---------- estat ----------
const $ = (id) => document.getElementById(id);
const desa = (k, v) => { try { localStorage.setItem('onsoc.' + k, JSON.stringify(v)); } catch {} };
const llegeix = (k, def) => { try { const v = localStorage.getItem('onsoc.' + k); return v == null ? def : JSON.parse(v); } catch { return def; } };

const Cap = typeof window !== 'undefined' ? window.Capacitor : null;
const NATIU = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
const PLATAFORMA = Cap && Cap.getPlatform ? Cap.getPlatform() : 'web';
const IPHONE_WEB = !NATIU && typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
const INSTALLADA = typeof window !== 'undefined' && !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches || navigator.standalone);
const PLAT = NATIU ? PLATAFORMA : (IPHONE_WEB ? 'web-ios' : 'web');
const BG = NATIU ? Cap.registerPlugin('BackgroundGeolocation') : null;
const Avisos = NATIU ? Cap.registerPlugin('LocalNotifications') : null;
const Dispositiu = NATIU ? Cap.registerPlugin('Device') : null;
const AppCap = NATIU ? Cap.registerPlugin('App') : null;
const Sms = NATIU && PLATAFORMA === 'android' ? Cap.registerPlugin('SmsSos') : null;

let perfil = null, codiFamilia = null, comparteixo = true, sosMeu = 0, avisatsSos = {}, avisatsTard = {}, avisatsInactiu = {};
let estatsLlocs = {}, acomp = null, ultimHist = null, batAvisat = false, ultimEvent = null, enllac = null;
let ntfyEnvia = true, ntfyRebo = false, smsActiu = false, inactiuH = 12;
function carregaEstatLocal() {
  perfil = llegeix('perfil', null);            // {id, nom, tel, color, fitxa}
  codiFamilia = llegeix('familia', null);      // 'XXXX-XXXX-XXXX-XXXX'
  comparteixo = llegeix('comparteixo', true);
  sosMeu = llegeix('sos', 0);                  // instant de l'SOS actiu (0 = cap)
  avisatsSos = llegeix('avisatsSos', {});      // {idMembre: instant SOS ja avisat}
  avisatsTard = llegeix('avisatsTard', {});    // {idMembre:fins: true}
  avisatsInactiu = llegeix('avisatsInactiu', {}); // {idMembre: vist ja avisat}
  estatsLlocs = llegeix('estatsLlocs', {});    // {idLloc: 'dins'|'fora'}
  acomp = llegeix('acomp', null);              // {desti, llocId, fins, inici, avisat}
  enllac = llegeix('enllac', null);            // {id, clau, fins}
  ultimHist = llegeix('ultimHist', null);
  batAvisat = llegeix('batAvisat', false);
  ultimEvent = llegeix('ultimEvent', null);    // hora (servidor) de l'últim avís vist
  ntfyEnvia = llegeix('ntfyEnvia', true);
  ntfyRebo = llegeix('ntfyRebo', false);
  smsActiu = llegeix('smsActiu', false);
  inactiuH = llegeix('inactiuH', 12);
}

let fam = null;                                // {codi, id, clau, tema}
let jo = null;                                 // última posició pròpia {lat, lng, acc, t}
let ultimEnviat = null;
let membres = {};                              // id -> dades desxifrades + vist
let llocs = [];                                // [{id, nom, lat, lng, radi}]
let events = {};                               // id -> avís desxifrat + ts (hora del servidor)
const demanats = {};                           // "on ets?" pendents: id -> hora
let mapa = null, marcadors = {}, capaLlocs = null, capaRec = null, encaixat = false;
let mapaLlocs = null, nouLloc = null, radiTriat = 200;
const fonts = {};
let idVigilant = null, idWatchWeb = null, batec = null;

// ---------- servidor (Firebase REST) ----------
const arrel = () => `${window.ONSOC_DB}/${window.ONSOC_ARREL}`;
const base = () => `${arrel()}/${fam.id}`;

async function desaXifrat(cami, obj, metode = 'PUT', url) {
  const cos = { ...(await Cripto.xifra(fam.clau, obj)), t: { '.sv': 'timestamp' } };
  const r = await fetch(url || `${base()}/${cami}.json`, { method: metode, body: JSON.stringify(cos) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
const llegeixServidor = async (cami) => (await fetch(`${base()}/${cami}.json`)).json();
const esborra = (cami) => fetch(`${base()}/${cami}.json`, { method: 'DELETE' }).catch(() => {});

function escoltaCami(nom, cami, enDades) {
  if (fonts[nom]) fonts[nom].close();
  const es = new EventSource(`${base()}/${cami}.json`);
  const tracta = (ev, patch) => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (!m) return;
    enDades((m.path || '/').split('/').filter(Boolean), m.data, patch);
  };
  es.addEventListener('put', (e) => tracta(e, false));
  es.addEventListener('patch', (e) => tracta(e, true));
  fonts[nom] = es;
}
function escoltaTot() {
  escoltaCami('m', 'm', async (parts, data, patch) => {
    if (!parts.length) {
      if (!patch) membres = {};
      await Promise.all(Object.entries(data || {}).map(([id, x]) => rebMembre(id, x)));
    } else if (parts.length === 1) await rebMembre(parts[0], data);
    else await carregaMembres();
    pinta();
  });
  escoltaCami('l', 'l', async () => { await carregaLlocs(); pinta(); pintaLlocs(); });
  escoltaCami('e', 'e', async (parts, data, patch) => {
    if (!parts.length) {
      if (!patch) events = {};
      await Promise.all(Object.entries(data || {}).map(([id, x]) => rebEvent(id, x)));
    } else if (parts.length === 1) await rebEvent(parts[0], data);
    else await carregaEvents();
    processaEvents();
  });
}

async function envia(extra = {}) {
  if (!fam || !perfil) return;
  const dades = { nom: perfil.nom, tel: perfil.tel || '', color: perfil.color, sos: sosMeu || 0, pausa: !comparteixo, v: VERSIO,
    acomp: acomp ? { desti: acomp.desti, fins: acomp.fins } : null, fitxa: teFitxa(perfil.fitxa) ? perfil.fitxa : null,
    gmaps: enllacGmaps(perfil.gmaps) || null, plat: PLAT, ...extra };
  if (comparteixo && jo) Object.assign(dades, { lat: jo.lat, lng: jo.lng, acc: jo.acc, tp: jo.t });
  try {
    const bat = await bateria();
    if (bat) { Object.assign(dades, bat); revisaBateria(bat); }
  } catch {}
  try {
    await desaXifrat(`m/${perfil.id}`, dades);
    estatEnvio(comparteixo ? 'ok' : 'pausa');
    if (jo) ultimEnviat = { ...jo, t: Date.now() };
    if (comparteixo && jo && calHistoric(ultimHist, jo, Date.now())) {
      ultimHist = { ...jo, t: Date.now() };
      desa('ultimHist', ultimHist);
      desaXifrat(`h/${perfil.id}/${diaLocal(jo.t)}`, { lat: jo.lat, lng: jo.lng, acc: jo.acc, t: jo.t }, 'POST').catch(() => {});
    }
  } catch (e) {
    estatEnvio('error', T_("No s'ha pogut enviar (sense connexió?)"));
  }
  enviaEnllac(dades.bat);
}

async function rebMembre(id, x) {
  if (!x) { delete membres[id]; return; }
  const d = await Cripto.desxifra(fam.clau, x);
  if (!d) return; // no és de la nostra família o està malmès
  membres[id] = { ...d, id, vist: x.t || d.tp || 0 };
}
async function carregaMembres() {
  const tot = (await llegeixServidor('m')) || {};
  membres = {};
  await Promise.all(Object.entries(tot).map(([id, x]) => rebMembre(id, x)));
}
async function carregaLlocs() {
  const x = await llegeixServidor('l');
  const d = x ? await Cripto.desxifra(fam.clau, x) : null;
  llocs = (d && Array.isArray(d.llista)) ? d.llista : [];
}
const desaLlocs = () => desaXifrat('l', { llista: llocs });
async function rebEvent(id, x) {
  if (!x) { delete events[id]; return; }
  const d = await Cripto.desxifra(fam.clau, x);
  if (d) events[id] = { ...d, id, ts: x.t || 0 };
}
async function carregaEvents() {
  const tot = (await llegeixServidor('e')) || {};
  events = {};
  await Promise.all(Object.entries(tot).map(([id, x]) => rebEvent(id, x)));
}

// ---------- avisos (esdeveniments) ----------
async function creaEvent(tipus, extra = {}) {
  if (!fam || !perfil) return;
  const e = { tipus, qui: perfil.id, nom: perfil.nom, color: perfil.color, t: Date.now(), ...extra };
  desaXifrat('e', e, 'POST').catch(() => {});
  enviaNtfy(e);
}

function processaEvents() {
  const llista = Object.values(events).sort((a, b) => a.ts - b.ts);
  if (ultimEvent == null) { // primer cop en aquest mòbil: no avisem del que ja havia passat
    ultimEvent = llista.length ? llista[llista.length - 1].ts : Date.now();
  } else {
    for (const e of llista) {
      if (e.ts <= ultimEvent) continue;
      ultimEvent = e.ts;
      if (e.qui === perfil.id) continue;
      if (e.tipus === 'demana') { if (e.a === perfil.id) responOnEts(e); continue; } // només el destinatari
      const urgent = URGENTS.has(e.tipus);
      if (urgent || !ntfyRebo) avisLocal(urgent ? T_('SOS: {n}', { n: e.nom }) : 'On Sóc', textEvent(e), urgent);
      if (urgent) vibra([500, 200, 500, 200, 500]);
    }
  }
  desa('ultimEvent', ultimEvent);
  // neteja: avisos de fa més d'una setmana (qualsevol membre ho pot fer)
  const limit = Date.now() - GUARDA_DIES * 864e5;
  for (const e of llista) if (e.ts && e.ts < limit) { esborra(`e/${e.id}`); delete events[e.id]; }
  pintaAvisos();
}

let idNotif = 1000;
function avisLocal(titol, cos, urgent, quan, id) {
  if (Avisos) {
    const n = { id: id || (1000 + (idNotif++ % 100000)), title: titol, body: cos, channelId: urgent ? 'sos' : 'familia' };
    if (quan) n.schedule = { at: new Date(quan), allowWhileIdle: true };
    Avisos.schedule({ notifications: [n] }).catch(() => {});
  } else if (!quan && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try { new Notification(titol, { body: cos, icon: 'icons/icon-192.png' }); } catch {}
  }
}
async function preparaAvisos() {
  if (!Avisos) return;
  try {
    await Avisos.createChannel({ id: 'sos', name: T_('SOS de la família'), description: T_('Quan algú de la família demana ajuda'),
      importance: 5, visibility: 1, vibration: true });
    await Avisos.createChannel({ id: 'familia', name: T_('Avisos de la família'), description: T_('Arribades, sortides, estic bé, bateria'),
      importance: 3, visibility: 1 });
    const p = await Avisos.checkPermissions();
    if (p.display !== 'granted') await Avisos.requestPermissions();
  } catch {}
}

// ntfy: avisos amb l'app tancada (Android i iPhone). Només text, mai coordenades.
const ETIQUETES = { sos: 'rotating_light', tard: 'rotating_light', arriba: 'house', surt: 'wave', estic: 'white_check_mark',
  bateria: 'battery', acomp: 'walking', arribat: 'white_check_mark', acompfi: 'walking', sosfi: 'white_check_mark',
  demana: 'question', enllac: 'link', enllacfi: 'link' };
function enviaNtfy(e) {
  if (!ntfyEnvia || !fam) return;
  const urgent = URGENTS.has(e.tipus);
  // «On ets?» a algú que fa servir la web (iPhone): l'avís ha de sonar i, en tocar-lo, obrir On Sóc perquè enviï la posició
  const aWeb = e.tipus === 'demana' && membres[e.a] && esWeb(membres[e.a]);
  const baixa = ['bateria', 'acomp', 'demana', 'enllacfi'].includes(e.tipus) && !aWeb;
  const cos = { topic: fam.tema, title: urgent ? T_('SOS: {n}', { n: e.nom }) : 'On Sóc', message: textEvent(e),
    priority: urgent ? 5 : aWeb ? 4 : (baixa ? 2 : 3), tags: [ETIQUETES[e.tipus] || 'round_pushpin'] };
  if (aWeb) { cos.click = window.ONSOC_WEB; cos.message += ' — ' + T_('Toca aquí per obrir On Sóc i enviar-la.'); }
  fetch(window.ONSOC_NTFY || 'https://ntfy.sh/', { method: 'POST', body: JSON.stringify(cos) }).catch(() => {});
}

function pintaAvisos() {
  const ul = $('avisos');
  if (!ul) return;
  const ll = Object.values(events).sort((a, b) => b.ts - a.ts).slice(0, 15);
  ul.innerHTML = ll.length ? ll.map((e) => `<li class="${URGENTS.has(e.tipus) ? 'urgent' : ''}"><span class="punt-color" style="background:${esc(e.color)}"></span>
    <div>${esc(textEvent(e))}<small>${esc(textFa(e.t || e.ts))} · ${esc(textHora(e.t || e.ts))}</small></div></li>`).join('')
    : `<li class="buit">${esc(T_('Encara no hi ha cap avís.'))}</li>`;
}

// ---------- ubicació ----------
function novaPosicio(lat, lng, acc) {
  jo = { lat, lng, acc: Math.round(acc || 0), t: Date.now() };
  if (comparteixo && calEnviar(ultimEnviat, jo, Date.now())) envia();
  comprovaLlocs();
  revisaAcomp();
  pintaJo();
}

async function comencaUbicacio() {
  aturaUbicacio();
  if (!comparteixo) { envia(); return; }
  if (NATIU) {
    try {
      idVigilant = await BG.addWatcher({
        backgroundTitle: 'Xoriguer On Sóc',
        backgroundMessage: T_('Compartint la ubicació amb la família'),
        requestPermissions: true,
        stale: false,
        distanceFilter: 20,
      }, (loc, err) => {
        if (err) {
          if (err.code === 'NOT_AUTHORIZED') avisPermis(true);
          return;
        }
        avisPermis(false);
        novaPosicio(loc.latitude, loc.longitude, loc.accuracy);
      });
    } catch (e) { avisPermis(true); }
  } else if ('geolocation' in navigator) {
    idWatchWeb = navigator.geolocation.watchPosition(
      (p) => { avisPermis(false); novaPosicio(p.coords.latitude, p.coords.longitude, p.coords.accuracy); },
      (e) => { if (e.code === 1) avisPermis(true); },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 60000 });
  } else avisPermis(true, T_('Aquest navegador no dona la ubicació.'));
  // batec: amb el mòbil quiet no arriben posicions noves, però volem que la família vegi "fa 2 min"
  batec = setInterval(() => { if (comparteixo && jo) envia(); }, BATEC_S * 1000);
}

function aturaUbicacio() {
  if (idVigilant != null) { BG.removeWatcher({ id: idVigilant }).catch(() => {}); idVigilant = null; }
  if (idWatchWeb != null) { navigator.geolocation.clearWatch(idWatchWeb); idWatchWeb = null; }
  if (batec) { clearInterval(batec); batec = null; }
}

// Una posició nova ara mateix (web). Al natiu el vigilant ja té l'última bona: no cal.
function posicioFresca() {
  if (NATIU || !navigator.geolocation) return Promise.resolve();
  return new Promise((ok) => navigator.geolocation.getCurrentPosition(
    (p) => { jo = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy), t: Date.now() }; ok(); },
    () => ok(), { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }));
}

function avisPermis(mostra, text) {
  $('avis-permis').hidden = !mostra;
  if (!mostra) return;
  $('avis-permis-text').innerHTML = text || (NATIU
    ? T_("L'app no té permís d'ubicació. Dona-li permís <b>«Permet sempre»</b> (o «Mentre s'usa l'app») perquè la família et vegi.")
    : T_("El navegador no deixa veure la ubicació. Permet-la a la icona del cadenat de la barra d'adreces."));
  estatEnvio('error', T_("Sense permís d'ubicació"));
}

async function bateria() {
  if (Dispositiu) {
    const b = await Dispositiu.getBatteryInfo();
    if (b && b.batteryLevel != null && b.batteryLevel >= 0) return { bat: Math.round(b.batteryLevel * 100), carrega: !!b.isCharging };
  } else if (typeof navigator !== 'undefined' && navigator.getBattery) {
    const b = await navigator.getBattery();
    return { bat: Math.round(b.level * 100), carrega: b.charging };
  }
  return null;
}
function revisaBateria({ bat, carrega }) {
  if (!carrega && bat <= BAT_BAIXA && !batAvisat) { batAvisat = true; desa('batAvisat', true); creaEvent('bateria', { bat }); }
  else if (batAvisat && (carrega || bat >= BAT_REARMA)) { batAvisat = false; desa('batAvisat', false); }
}

// ---------- "on ets?" ----------
function demanaOnEts(id) {
  const m = membres[id];
  if (!m) return;
  demanats[id] = Date.now();
  creaEvent('demana', { a: id, aNom: m.nom });
  vibra(30);
  pinta();
}
async function responOnEts(e) {
  avisLocal(T_('{n} vol saber on ets', { n: e.nom }),
    comparteixo ? T_('Ja li hem enviat la teva ubicació.') : T_('Tens la ubicació en pausa: obre On Sóc si la vols compartir.'), false);
  if (!comparteixo) return;
  await posicioFresca();
  envia();
}

// ---------- llocs ----------
function comprovaLlocs() {
  if (!jo || !comparteixo || !llocs.length) return;
  let canvi = false;
  for (const l of llocs) {
    const abans = estatsLlocs[l.id];
    const ara = estatLloc(abans, distanciaM(jo, l), l.radi, jo.acc);
    if (ara === abans) continue;
    estatsLlocs[l.id] = ara; canvi = true;
    if (abans === undefined) continue; // primer cop: només apuntem on som, sense avisar
    if (ara === 'dins' && acomp && acomp.llocId === l.id) { acabaAcomp(true); continue; } // ja diu «ha arribat bé»
    creaEvent(ara === 'dins' ? 'arriba' : 'surt', { lloc: l.nom, llocId: l.id });
  }
  if (canvi) desa('estatsLlocs', estatsLlocs);
}
const llocActual = () => llocs.find((l) => estatsLlocs[l.id] === 'dins');
const llocDe = (m) => (m.lat == null ? null : llocs.find((l) => distanciaM(m, l) <= l.radi));

function preparaVistaLlocs() {
  if (!mapaLlocs) {
    mapaLlocs = L.map('mapa-llocs').setView(jo ? [jo.lat, jo.lng] : [41.7, 1.8], jo ? 16 : 8);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(mapaLlocs);
    mapaLlocs.on('click', (e) => posaNouLloc(e.latlng.lat, e.latlng.lng));
    const xips = $('l-radi');
    xips.innerHTML = RADIS.map((r) => `<button type="button" data-r="${r}" class="${r === radiTriat ? 'triat' : ''}">${r} m</button>`).join('');
    xips.querySelectorAll('button').forEach((b) => (b.onclick = () => {
      radiTriat = +b.dataset.r;
      xips.querySelectorAll('button').forEach((x) => x.classList.toggle('triat', x === b));
      if (nouLloc) nouLloc.circle.setRadius(radiTriat);
    }));
    $('l-aqui').onclick = () => {
      if (!jo) { errLloc(T_('Encara no sé on ets: espera que arribi la ubicació.')); return; }
      posaNouLloc(jo.lat, jo.lng); mapaLlocs.setView([jo.lat, jo.lng], 17);
    };
    $('l-desa').onclick = async () => {
      const nom = $('l-nom').value.trim();
      if (!nouLloc) { errLloc(T_('Toca el mapa per triar on és.')); return; }
      if (!nom) { errLloc(T_('Posa-li un nom.')); $('l-nom').focus(); return; }
      errLloc('');
      const ll = nouLloc.marker.getLatLng();
      llocs.push({ id: nouId(), nom, lat: ll.lat, lng: ll.lng, radi: radiTriat });
      try { await desaLlocs(); } catch { errLloc(T_("No s'ha pogut desar (sense connexió?)")); llocs.pop(); return; }
      $('l-nom').value = '';
      mapaLlocs.removeLayer(nouLloc.marker); mapaLlocs.removeLayer(nouLloc.circle); nouLloc = null;
      pintaLlocs(); pinta(); comprovaLlocs();
    };
  }
  setTimeout(() => mapaLlocs.invalidateSize(), 60);
  pintaLlocs();
}
function errLloc(t) { $('l-error').textContent = t; $('l-error').hidden = !t; }
function posaNouLloc(lat, lng) {
  if (nouLloc) { nouLloc.marker.setLatLng([lat, lng]); nouLloc.circle.setLatLng([lat, lng]); return; }
  nouLloc = {
    marker: L.marker([lat, lng], { draggable: true }).addTo(mapaLlocs),
    circle: L.circle([lat, lng], { radius: radiTriat, color: '#FFA82E', weight: 2, fillOpacity: 0.15 }).addTo(mapaLlocs),
  };
  nouLloc.marker.on('drag', (e) => nouLloc.circle.setLatLng(e.target.getLatLng()));
}
let capaLlocsPetit = null;
function pintaLlocs() {
  const ul = $('llocs');
  if (!ul) return;
  const vius = Object.values(membres).filter((m) => !m.pausa);
  ul.innerHTML = llocs.length ? llocs.map((l) => {
    const dins = vius.filter((m) => m.lat != null && distanciaM(m, l) <= l.radi).map((m) => m.nom);
    return `<li><svg viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
      <div><b>${esc(l.nom)}</b><small>${esc(T_('Zona de {r} m', { r: l.radi }))}${dins.length ? ' · ' + esc(T_('hi és: {n}', { n: dins.join(', ') })) : ''}</small></div>
      <button data-veu="${esc(l.id)}">${esc(T_('Mapa'))}</button><button class="perill" data-treu="${esc(l.id)}">${esc(T_('Treu'))}</button></li>`;
  }).join('') : `<li class="buit">${esc(T_('Encara no hi ha cap lloc. Afegeix-ne un a sota (Casa, Escola, Feina...).'))}</li>`;
  ul.querySelectorAll('[data-treu]').forEach((b) => (b.onclick = async () => {
    const l = llocs.find((x) => x.id === b.dataset.treu);
    if (!l || !confirm(T_('Treure «{l}»? Ja no avisarà de qui hi arriba o en surt.', { l: l.nom }))) return;
    llocs = llocs.filter((x) => x !== l);
    delete estatsLlocs[l.id]; desa('estatsLlocs', estatsLlocs);
    try { await desaLlocs(); } catch {}
    pintaLlocs(); pinta();
  }));
  ul.querySelectorAll('[data-veu]').forEach((b) => (b.onclick = () => {
    const l = llocs.find((x) => x.id === b.dataset.veu);
    if (l && mapaLlocs) mapaLlocs.setView([l.lat, l.lng], 16);
  }));
  if (mapaLlocs) {
    if (capaLlocsPetit) mapaLlocs.removeLayer(capaLlocsPetit);
    capaLlocsPetit = L.layerGroup(llocs.map((l) => L.circle([l.lat, l.lng], { radius: l.radi, color: '#FFA82E', weight: 2, fillOpacity: 0.12 })
      .bindTooltip(esc(l.nom), { permanent: true, direction: 'center', className: 'etiqueta-lloc' }))).addTo(mapaLlocs);
  }
}

// ---------- acompanya'm ----------
function obreAcomp() {
  $('enllac-nou').hidden = true;
  const sel = $('acomp-desti');
  sel.innerHTML = llocs.map((l) => `<option value="${esc(l.id)}">${esc(l.nom)}</option>`).join('') +
    `<option value="">${esc(T_('Un altre lloc (diré jo quan arribi)'))}</option>`;
  const casa = llocs.find((l) => /casa|home|maison/i.test(l.nom));
  if (casa) sel.value = casa.id;
  let min = 20;
  const xips = $('acomp-temps');
  xips.innerHTML = TEMPS_ACOMP.map((m) => `<button type="button" data-m="${m}" class="${m === min ? 'triat' : ''}">${m} min</button>`).join('');
  xips.querySelectorAll('button').forEach((b) => (b.onclick = () => {
    min = +b.dataset.m;
    xips.querySelectorAll('button').forEach((x) => x.classList.toggle('triat', x === b));
  }));
  $('acomp-comenca').onclick = () => comencaAcomp(sel.value, min);
  $('acomp-nou').hidden = false;
  $('acomp-nou').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function comencaAcomp(llocId, min) {
  const l = llocs.find((x) => x.id === llocId);
  acomp = { desti: l ? l.nom : T_('destí'), llocId: l ? l.id : null, fins: Date.now() + min * 60e3, inici: Date.now(), avisat: false };
  desa('acomp', acomp);
  $('acomp-nou').hidden = true;
  if (!comparteixo) { comparteixo = true; desa('comparteixo', true); pintaComparteixo(); comencaUbicacio(); }
  programaAvisAcomp();
  creaEvent('acomp', { desti: acomp.desti, fins: acomp.fins });
  envia();
  pintaAcomp();
}
function programaAvisAcomp() {
  if (!Avisos) return;
  Avisos.cancel({ notifications: [{ id: 777 }] }).catch(() => {});
  if (acomp) avisLocal(T_('Ja has arribat?'), T_('Si no respons en 2 minuts, On Sóc avisarà la família amb un SOS.'), true, acomp.fins, 777);
}
function acabaAcomp(arribat) {
  if (!acomp) return;
  const d = acomp.desti;
  acomp = null; desa('acomp', null);
  if (Avisos) Avisos.cancel({ notifications: [{ id: 777 }] }).catch(() => {});
  creaEvent(arribat ? 'arribat' : 'acompfi', { desti: d });
  envia();
  pintaAcomp();
}
function revisaAcomp() {
  if (!acomp) return;
  const ara = Date.now();
  if (ara > acomp.fins && !acomp.avisat) {
    acomp.avisat = true; desa('acomp', acomp);
    vibra([400, 150, 400, 150, 400]);
    if (!Avisos) avisLocal(T_('Ja has arribat?'), T_('Si no respons en 2 minuts, On Sóc avisarà la família amb un SOS.'), true);
  }
  if (ara > acomp.fins + ACOMP_MARGE_S * 1000) {
    const d = acomp.desti;
    acomp = null; desa('acomp', null);
    creaEvent('tard', { desti: d });
    activaSos(false);
  }
  pintaAcomp();
}
function pintaAcomp() {
  const ara = Date.now();
  $('acomp-actiu').hidden = !acomp;
  $('b-acompanya').disabled = !!acomp;
  if (!acomp) return;
  $('acomp-titol').textContent = T_('De camí cap a {l}', { l: acomp.desti });
  $('acomp-text').textContent = ara < acomp.fins
    ? T_("Hi has d'arribar abans de les {h} (queden {n} min). La família ho veu.", { h: textHora(acomp.fins), n: Math.max(1, Math.ceil((acomp.fins - ara) / 60e3)) })
    : T_("Havies d'arribar a les {h}.", { h: textHora(acomp.fins) });
  const tard = ara > acomp.fins;
  $('acomp-tard').hidden = !tard;
  if (tard) $('acomp-queda').textContent = `${Math.max(0, Math.ceil((acomp.fins + ACOMP_MARGE_S * 1000 - ara) / 1000))} s`;
}
// Els altres: si algú porta 5 min de retard i no ha dit res (potser se li ha apagat el mòbil)
function comprovaTardAltres() {
  const ara = Date.now();
  for (const m of Object.values(membres)) {
    if (m.id === perfil.id || !m.acomp || ara < m.acomp.fins + ACOMP_ALTRES_S * 1000) continue;
    const k = `${m.id}:${m.acomp.fins}`;
    if (avisatsTard[k]) continue;
    avisatsTard[k] = true; desa('avisatsTard', avisatsTard);
    vibra([500, 200, 500]);
    avisLocal(T_('{n} no ha arribat', { n: m.nom }),
      T_("Havia d'arribar a {l} a les {h} i no ha dit res.", { l: m.acomp.desti, h: textHora(m.acomp.fins) }), true);
  }
}

// ---------- "fa massa que no en sabem res" ----------
function comprovaInactius() {
  if (!inactiuH) return;
  for (const m of Object.values(membres)) {
    // els de la web (iPhone) només envien amb l'app oberta: «no en sabem res» seria normal cada dia
    if (m.id === perfil.id || m.pausa || esWeb(m) || !esInactiu(m.vist, inactiuH)) continue;
    if (avisatsInactiu[m.id] === m.vist) continue;
    avisatsInactiu[m.id] = m.vist; desa('avisatsInactiu', avisatsInactiu);
    vibra([300, 150, 300]);
    avisLocal(T_('{n}: fa {h} h que no en sabem res', { h: Math.floor((Date.now() - m.vist) / 3600e3), n: m.nom }),
      T_('Potser té el mòbil apagat, sense bateria o sense cobertura. Prova de trucar-li.'), true);
  }
}
function pintaInactiu() {
  const xips = $('i-hores');
  xips.innerHTML = HORES_INACTIU.map((h) => `<button type="button" data-h="${h}" class="${h === inactiuH ? 'triat' : ''}">${esc(h ? T_('{n} h', { n: h }) : T_('Mai'))}</button>`).join('');
  xips.querySelectorAll('button').forEach((b) => (b.onclick = () => {
    inactiuH = +b.dataset.h; desa('inactiuH', inactiuH);
    pintaInactiu(); pinta();
  }));
}

// ---------- enllaç temporal per a algú de fora ----------
const urlEnllac = () => (enllac ? `${window.ONSOC_WEB}veure.html#${enllac.id}.${enllac.clau}` : '');
function obreEnllac() {
  $('acomp-nou').hidden = true;
  let h = 1;
  const xips = $('enllac-durada');
  xips.innerHTML = HORES_ENLLAC.map((x) => `<button type="button" data-h="${x}" class="${x === h ? 'triat' : ''}">${esc(T_('{n} h', { n: x }))}</button>`).join('');
  xips.querySelectorAll('button').forEach((b) => (b.onclick = () => {
    h = +b.dataset.h;
    xips.querySelectorAll('button').forEach((x) => x.classList.toggle('triat', x === b));
  }));
  $('enllac-crea').onclick = () => creaEnllac(h);
  $('enllac-nou').hidden = false;
  $('enllac-nou').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
async function creaEnllac(hores) {
  const { id, text } = await Cripto.nouEnllac();
  enllac = { id, clau: text, fins: Date.now() + hores * 3600e3 };
  desa('enllac', enllac);
  $('enllac-nou').hidden = true;
  if (!comparteixo) { comparteixo = true; desa('comparteixo', true); pintaComparteixo(); comencaUbicacio(); }
  creaEvent('enllac', { fins: enllac.fins });
  await envia();
  pintaEnllac();
}
async function enviaEnllac(bat) {
  if (!enllac) return;
  if (Date.now() > enllac.fins) { aturaEnllac(); return; }
  try {
    const clau = await Cripto.clauEnllac(enllac.clau);
    const d = { nom: perfil.nom, color: perfil.color, fins: enllac.fins, pausa: !comparteixo, vist: Date.now(), bat: bat ?? null, sos: sosMeu || 0 };
    if (comparteixo && jo) Object.assign(d, { lat: jo.lat, lng: jo.lng, acc: jo.acc, tp: jo.t });
    const cos = { ...(await Cripto.xifra(clau, d)), t: { '.sv': 'timestamp' } };
    await fetch(`${arrel()}/${enllac.id}/p.json`, { method: 'PUT', body: JSON.stringify(cos) });
  } catch {}
}
function aturaEnllac() {
  if (!enllac) return;
  fetch(`${arrel()}/${enllac.id}/p.json`, { method: 'DELETE' }).catch(() => {});
  enllac = null; desa('enllac', null);
  creaEvent('enllacfi');
  pintaEnllac();
}
function pintaEnllac() {
  $('enllac-actiu').hidden = !enllac;
  $('b-enllac').disabled = !!enllac;
  if (!enllac) return;
  $('enllac-text').textContent = T_("Qui tingui aquest enllaç veu on ets fins a les {h}. Envia'l només a qui vulguis.", { h: textHora(enllac.fins) });
  $('enllac-url').textContent = urlEnllac();
}

// ---------- fitxa mèdica ----------
const CAMPS_FITXA = [['grup', 'Grup sanguini'], ['alergies', 'Al·lèrgies'], ['medicacio', 'Medicació'],
  ['malalties', 'Malalties o altres coses a saber'], ['contacte', "Contacte d'emergència"], ['contacteTel', 'Telèfon del contacte']];
function pintaFitxaPropia() {
  const f = perfil.fitxa || {};
  $('m-grup').value = f.grup || '';
  $('m-alergies').value = f.alergies || '';
  $('m-medicacio').value = f.medicacio || '';
  $('m-malalties').value = f.malalties || '';
  $('m-contacte').value = f.contacte || '';
  $('m-contacte-tel').value = f.contacteTel || '';
}
function desaFitxa() {
  perfil = { ...perfil, fitxa: {
    grup: $('m-grup').value, alergies: $('m-alergies').value.trim(), medicacio: $('m-medicacio').value.trim(),
    malalties: $('m-malalties').value.trim(), contacte: $('m-contacte').value.trim(), contacteTel: $('m-contacte-tel').value.trim(),
  } };
  desa('perfil', perfil);
  envia();
  $('m-desat').hidden = false; setTimeout(() => ($('m-desat').hidden = true), 1500);
}
function mostraFitxa(id) {
  const m = membres[id];
  if (!m || !teFitxa(m.fitxa)) return;
  $('df-titol').textContent = T_('Fitxa mèdica · {n}', { n: m.nom });
  $('df-cos').innerHTML = `<dl class="fitxa">${CAMPS_FITXA.filter(([k]) => String(m.fitxa[k] || '').trim())
    .map(([k, et]) => `<dt>${esc(T_(et))}</dt><dd>${esc(m.fitxa[k])}</dd>`).join('')}</dl>`;
  const t = telNet(m.fitxa.contacteTel);
  $('df-truca').hidden = !t;
  if (t) { $('df-truca').href = 'tel:' + t; $('df-truca').textContent = T_('Truca a {n}', { n: m.fitxa.contacte || t }); }
  $('dialeg-fitxa').showModal();
}

// ---------- estic bé ----------
function esticBe() {
  const l = llocActual();
  creaEvent('estic', l ? { lloc: l.nom } : {});
  envia();
  const p = $('estic-be-fet');
  p.textContent = T_('Enviat «estic bé» a la família a les {h}.', { h: textHora(Date.now()) });
  p.hidden = false;
  vibra(40);
}

// ---------- SOS ----------
function preparaSos() {
  const boto = $('sos');
  let inici = 0, raf = 0;
  const posa = (p) => boto.style.setProperty('--p', p);
  const atura = () => { inici = 0; cancelAnimationFrame(raf); posa(0); };
  const pas = () => {
    if (!inici) return;
    const p = Math.min(100, (performance.now() - inici) / 20);
    posa(p);
    if (p >= 100) { atura(); activaSos(); return; }
    raf = requestAnimationFrame(pas);
  };
  boto.addEventListener('pointerdown', (e) => { e.preventDefault(); inici = performance.now(); vibra(30); raf = requestAnimationFrame(pas); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => boto.addEventListener(t, atura));
  boto.addEventListener('contextmenu', (e) => e.preventDefault());
  $('sos-cancela').onclick = () => { sosMeu = 0; desa('sos', 0); pintaSosMeu(); creaEvent('sosfi'); envia(); };
}

async function activaSos(ambEvent = true) {
  vibra([200, 100, 200, 100, 400]);
  sosMeu = Date.now();
  desa('sos', sosMeu);
  pintaSosMeu();
  mostraVista('v-mapa');
  if (!comparteixo) { comparteixo = true; desa('comparteixo', true); pintaComparteixo(); comencaUbicacio(); }
  await posicioFresca();
  if (ambEvent) creaEvent('sos');
  enviaSms();
  envia();
}

function enviaSms() {
  if (!Sms || !smsActiu) return;
  const numeros = Object.values(membres).filter((m) => m.id !== perfil.id).map((m) => telNet(m.tel)).filter(Boolean);
  if (!numeros.length) return;
  let text = T_('SOS de {n} (Xoriguer On Sóc): necessito ajuda.', { n: perfil.nom });
  text += ' ' + (jo ? T_('Sóc aquí: {u} ({f})', { u: `https://maps.google.com/?q=${jo.lat.toFixed(5)},${jo.lng.toFixed(5)}`, f: textFa(jo.t) })
    : T_('No tinc la ubicació.'));
  Sms.envia({ numeros, text }).catch(() => {});
}

// Compte enrere (botó de la persiana, drecera de la icona o ?sos=1): 5 s per cancel·lar
let compteInterval = null;
function compteSos() {
  if (!perfil || !codiFamilia || sosMeu) return;
  let n = 5;
  $('compte-num').textContent = n;
  $('compte-sos').hidden = false;
  vibra([100, 100, 100]);
  clearInterval(compteInterval);
  const fi = (enviar) => { clearInterval(compteInterval); $('compte-sos').hidden = true; if (enviar) activaSos(); };
  compteInterval = setInterval(() => { n--; $('compte-num').textContent = n; vibra(60); if (n <= 0) fi(true); }, 1000);
  $('compte-ara').onclick = () => fi(true);
  $('compte-cancela').onclick = () => fi(false);
}
function obreUrl(url) {
  if (/sos/i.test(String(url || '').split('://').pop())) compteSos();
}

function pintaSosMeu() {
  $('sos-actiu').hidden = !sosMeu;
  $('sos').hidden = !!sosMeu;
  $('accions').hidden = !!sosMeu;
  document.querySelector('.sos-ajuda').hidden = !!sosMeu;
}

function vibra(p) { try { navigator.vibrate && navigator.vibrate(p); } catch {} }

function comprovaSosAltres() {
  const ara = Date.now();
  const actius = Object.values(membres).filter((m) => m.id !== perfil.id && m.sos && ara - m.sos < SOS_VIGENT_H * 3600e3)
    .sort((a, b) => b.sos - a.sos);
  const al = $('alerta-sos');
  if (!actius.length) { al.hidden = true; return; }
  const m = actius[0];
  al.hidden = false;
  $('alerta-nom').textContent = T_('{n} demana ajuda!', { n: m.nom });
  $('alerta-quan').textContent = T_('SOS {f}', { f: textFa(m.sos) }) + (m.lat != null ? ' · ' + T_('ubicació {f}', { f: textFa(m.vist) }) : '');
  $('alerta-veure').onclick = () => { mostraVista('v-mapa'); centra(m.id); };
  $('alerta-fitxa').hidden = !teFitxa(m.fitxa);
  $('alerta-fitxa').onclick = () => mostraFitxa(m.id);
  const t = telNet(m.tel);
  $('alerta-truca').hidden = !t;
  if (t) $('alerta-truca').href = 'tel:' + t;
  for (const x of actius) { // l'avís del sistema el fa processaEvents; aquí només hi som per si l'avís s'ha perdut
    if (avisatsSos[x.id] === x.sos) continue;
    avisatsSos[x.id] = x.sos;
    desa('avisatsSos', avisatsSos);
    vibra([500, 200, 500, 200, 500]);
  }
}

// ---------- mapa ----------
function preparaMapa() {
  if (mapa) return;
  mapa = L.map('mapa', { zoomControl: true, attributionControl: true }).setView([41.7, 1.8], 8);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap',
  }).addTo(mapa);
  const Tots = L.Control.extend({
    onAdd() {
      const b = L.DomUtil.create('button', 'leaflet-bar boto-mapa');
      b.textContent = T_('Tots');
      L.DomEvent.on(b, 'click', (e) => { L.DomEvent.stop(e); encaixa(); });
      return b;
    },
  });
  new Tots({ position: 'topright' }).addTo(mapa);
}

function icona(m, vell) {
  return L.divIcon({
    className: '', iconSize: [40, 40], iconAnchor: [20, 46], popupAnchor: [0, -44],
    html: `<div class="agulla${vell ? ' vell' : ''}${m.sos ? ' alerta' : ''}" style="background:${esc(m.color)}"><span>${esc(inicial(m.nom))}</span></div>`,
  });
}

function pintaMarcadors() {
  if (!mapa) return;
  const ara = Date.now();
  const vius = new Set();
  for (const m of Object.values(membres)) {
    if (m.lat == null || m.pausa) continue;
    vius.add(m.id);
    const vell = ara - m.vist > VELL_MIN * 60e3;
    const txt = `<b>${esc(m.nom)}</b><br>${esc(textFa(m.vist))}${m.acc ? ` · ±${m.acc} m` : ''}`;
    if (marcadors[m.id]) {
      marcadors[m.id].setLatLng([m.lat, m.lng]).setIcon(icona(m, vell)).setPopupContent(txt);
    } else {
      marcadors[m.id] = L.marker([m.lat, m.lng], { icon: icona(m, vell), zIndexOffset: 500 }).bindPopup(txt).addTo(mapa);
    }
  }
  for (const id of Object.keys(marcadors)) if (!vius.has(id)) { mapa.removeLayer(marcadors[id]); delete marcadors[id]; }
  if (capaLlocs) mapa.removeLayer(capaLlocs);
  capaLlocs = L.layerGroup(llocs.map((l) => L.circle([l.lat, l.lng], { radius: l.radi, color: '#FFA82E', weight: 1.5, fillOpacity: 0.08, interactive: false })
    .bindTooltip(esc(l.nom), { permanent: true, direction: 'center', className: 'etiqueta-lloc' }))).addTo(mapa);
  if (!encaixat && vius.size) { encaixat = true; encaixa(); }
}

function encaixa() {
  const pts = Object.values(membres).filter((m) => m.lat != null && !m.pausa).map((m) => [m.lat, m.lng]);
  if (jo && comparteixo) pts.push([jo.lat, jo.lng]);
  if (!pts.length) return;
  if (pts.length === 1) mapa.setView(pts[0], 15);
  else mapa.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
}

function centra(id) {
  const m = membres[id];
  if (!m || m.lat == null || !mapa) return;
  mapa.setView([m.lat, m.lng], 16);
  marcadors[id] && marcadors[id].openPopup();
  $('mapa').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function pintaJo() {
  // la meva agulla surt quan el servidor ens torna les dades; fins llavors, la posem amb les dades locals
  if (!perfil || !comparteixo || !jo) return;
  const m = membres[perfil.id] || {};
  membres[perfil.id] = { ...m, id: perfil.id, nom: perfil.nom, color: perfil.color, tel: perfil.tel, lat: jo.lat, lng: jo.lng, acc: jo.acc,
    tp: jo.t, vist: Math.max(m.vist || 0, jo.t), pausa: false, sos: sosMeu, acomp: acomp ? { desti: acomp.desti, fins: acomp.fins } : null };
  pinta();
}

// ---------- recorregut ----------
async function obreRecorregut(id) {
  const m = membres[id];
  if (!m) return;
  $('recorregut').hidden = false;
  $('rec-titol').textContent = T_('Recorregut · {n}', { n: m.nom });
  const xips = $('rec-dies');
  const dies = [...Array(GUARDA_DIES)].map((_, i) => Date.now() - i * 864e5);
  const nomDia = (t, i) => (i === 0 ? T_('Avui') : i === 1 ? T_('Ahir') : new Date(t).toLocaleDateString(LOC(), { weekday: 'short', day: 'numeric' }));
  xips.innerHTML = dies.map((t, i) => `<button type="button" data-dia="${diaLocal(t)}" class="${i === 0 ? 'triat' : ''}">${esc(nomDia(t, i))}</button>`).join('');
  xips.querySelectorAll('button').forEach((b) => (b.onclick = () => {
    xips.querySelectorAll('button').forEach((x) => x.classList.toggle('triat', x === b));
    pintaRecorregut(m, b.dataset.dia);
  }));
  $('rec-tanca').onclick = tancaRecorregut;
  $('recorregut').scrollIntoView({ behavior: 'smooth', block: 'start' });
  pintaRecorregut(m, diaLocal(Date.now()));
}
async function pintaRecorregut(m, dia) {
  $('rec-info').textContent = T_('Carregant...');
  if (capaRec) { mapa.removeLayer(capaRec); capaRec = null; }
  let pts = [];
  try {
    const tot = (await llegeixServidor(`h/${m.id}/${dia}`)) || {};
    pts = (await Promise.all(Object.values(tot).map((x) => Cripto.desxifra(fam.clau, x)))).filter(Boolean).sort((a, b) => a.t - b.t);
  } catch { $('rec-info').textContent = T_("No s'ha pogut carregar (sense connexió?)"); return; }
  if (!pts.length) { $('rec-info').textContent = T_('Aquest dia no hi ha recorregut.'); return; }
  let km = 0;
  for (let i = 1; i < pts.length; i++) km += distanciaM(pts[i - 1], pts[i]) / 1000;
  const ll = pts.map((p) => [p.lat, p.lng]);
  const capes = [L.polyline(ll, { color: m.color, weight: 4, opacity: 0.85 })];
  pts.forEach((p, i) => capes.push(L.circleMarker([p.lat, p.lng], {
    radius: i === 0 || i === pts.length - 1 ? 7 : 4, color: '#F6EFE2', weight: 2, fillColor: m.color, fillOpacity: 1,
  }).bindPopup(`${esc(textHora(p.t))}${i === 0 ? ' · ' + esc(T_('inici')) : i === pts.length - 1 ? ' · ' + esc(T_('últim')) : ''}`)));
  capaRec = L.layerGroup(capes).addTo(mapa);
  mapa.fitBounds(ll, { padding: [30, 30], maxZoom: 16 });
  $('rec-info').textContent = T_('{p} punts · de {a} a {b} · uns {k} km', {
    p: pts.length, a: textHora(pts[0].t), b: textHora(pts[pts.length - 1].t), k: km.toLocaleString(LOC(), { maximumFractionDigits: 1 }) });
}
function tancaRecorregut() {
  $('recorregut').hidden = true;
  if (capaRec) { mapa.removeLayer(capaRec); capaRec = null; }
}
async function netejaHistoric() {
  try {
    const r = await fetch(`${base()}/h/${perfil.id}.json?shallow=true`);
    const dies = Object.keys((await r.json()) || {});
    const limit = diaLocal(Date.now() - GUARDA_DIES * 864e5);
    for (const d of dies) if (d <= limit) esborra(`h/${perfil.id}/${d}`);
  } catch {}
}

// ---------- llista ----------
function urlRuta(m) {
  return PLATAFORMA === 'ios' ? `https://maps.apple.com/?daddr=${m.lat},${m.lng}`
    : `https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lng}`;
}

function pinta() {
  if (!perfil) return;
  pintaMarcadors();
  const ara = Date.now();
  const llista = Object.values(membres).sort((a, b) => (b.sos || 0) - (a.sos || 0) || (a.id === perfil.id ? -1 : b.id === perfil.id ? 1 : String(a.nom).localeCompare(b.nom)));
  const ul = $('membres');
  if (llista.length <= 1) {
    ul.innerHTML = (llista.length ? fila(llista[0], ara) : '') +
      `<li class="buit">${T_('Encara no hi ha ningú més. Passa el <b>codi de la família</b> (pestanya Família) als altres mòbils.')}</li>`;
  } else ul.innerHTML = llista.map((m) => fila(m, ara)).join('');
  ul.querySelectorAll('[data-centra]').forEach((b) => (b.onclick = () => centra(b.dataset.centra)));
  ul.querySelectorAll('[data-rec]').forEach((b) => (b.onclick = () => obreRecorregut(b.dataset.rec)));
  ul.querySelectorAll('[data-demana]').forEach((b) => (b.onclick = () => demanaOnEts(b.dataset.demana)));
  ul.querySelectorAll('[data-fitxa]').forEach((b) => (b.onclick = () => mostraFitxa(b.dataset.fitxa)));
  comprovaSosAltres();
  comprovaTardAltres();
  comprovaInactius();
  pintaAcomp();
  pintaEnllac();
  if ($('v-llocs').classList.contains('activa')) pintaLlocs();
}

function fila(m, ara) {
  const soc = m.id === perfil.id;
  const vell = ara - m.vist > VELL_MIN * 60e3;
  const parts = [];
  if (m.pausa) parts.push(T_('ubicació en pausa'));
  else if (m.lat == null) parts.push(T_('sense ubicació encara'));
  else {
    const l = llocDe(m);
    if (l) parts.push(T_('a {l}', { l: l.nom }));
    parts.push(textFa(m.vist));
    if (!soc && jo && !l) parts.push(textDistancia(distanciaM(jo, m)));
  }
  if (m.bat != null) parts.push(`${m.carrega ? '⚡' : m.bat <= BAT_BAIXA ? '🪫' : '🔋'} ${m.bat}%`);
  const sos = m.sos && ara - m.sos < SOS_VIGENT_H * 3600e3;
  const notes = [];
  if (m.acomp && !sos) {
    const tard = ara > m.acomp.fins + (soc ? 0 : ACOMP_ALTRES_S * 1000);
    notes.push(`<small class="${tard ? 'error' : 'cami'}">${esc(tard
      ? T_("⚠ No ha arribat a {l} · havia d'arribar a les {h}", { l: m.acomp.desti, h: textHora(m.acomp.fins) })
      : T_('🚶 Va cap a {l} · abans de les {h}', { l: m.acomp.desti, h: textHora(m.acomp.fins) }))}</small>`);
  }
  const web = esWeb(m), gm = enllacGmaps(m.gmaps);
  if (!soc && !m.pausa && !web && esInactiu(m.vist, inactiuH, ara)) {
    notes.push(`<small class="error">${esc(T_('⚠ Fa {h} h que no en sabem res', { h: Math.floor((ara - m.vist) / 3600e3) }))}</small>`);
  }
  if (!soc && web && vell) {
    notes.push(`<small class="web">${esc(gm ? T_("📱 Fa servir la web: només s'actualitza quan obre On Sóc. Ara, mira'l a Google Maps.")
      : T_("📱 Fa servir la web: només s'actualitza quan obre On Sóc."))}</small>`);
  }
  if (demanats[m.id]) {
    if (m.vist >= demanats[m.id]) delete demanats[m.id];
    else if (ara - demanats[m.id] < DEMANA_ESPERA_S * 1000) notes.push(`<small class="cami">${esc(T_('⏳ Demanat, esperant resposta…'))}</small>`);
    else notes.push(`<small class="error">${esc(web ? T_("Encara no ha obert On Sóc. Mira'l a Google Maps o truca-li.")
      : T_('No respon: potser té el mòbil apagat o sense connexió.'))}</small>`);
  }
  const t = telNet(m.tel);
  const botons = [];
  if (!soc && gm) botons.push(`<a class="boto${web ? ' gmaps' : ''}" href="${esc(gm)}" target="_blank" rel="noopener">Google Maps</a>`);
  if (m.lat != null && !m.pausa) botons.push(`<button data-centra="${esc(m.id)}">${esc(T_('Mapa'))}</button>`);
  if (!soc) botons.push(`<button data-demana="${esc(m.id)}">${esc(T_('On ets?'))}</button>`);
  botons.push(`<button data-rec="${esc(m.id)}">${esc(T_('Recorregut'))}</button>`);
  if (teFitxa(m.fitxa)) botons.push(`<button data-fitxa="${esc(m.id)}">${esc(T_('Fitxa'))}</button>`);
  if (!soc && m.lat != null && !m.pausa) botons.push(`<a class="boto" href="${urlRuta(m)}" target="_blank" rel="noopener">${esc(T_('Ruta'))}</a>`);
  if (!soc && t) botons.push(`<a class="boto" href="tel:${esc(t)}">${esc(T_('Truca'))}</a>`);
  return `<li class="membre${sos ? ' en-sos' : ''}">
    <span class="membre-color" style="background:${esc(m.color)};${vell ? 'filter:grayscale(.8)' : ''}">${esc(inicial(m.nom))}</span>
    <div class="membre-info"><b>${esc(m.nom)}${soc ? ' ' + esc(T_('(tu)')) : ''}${sos ? ' — SOS!' : ''}</b><small>${esc(parts.join(' · '))}${vell && !web && !m.pausa && m.lat != null ? ' · ' + esc(T_('sense senyal recent')) : ''}</small>${notes.join('')}</div>
    <div class="membre-botons">${botons.join('')}</div></li>`;
}

function estatEnvio(cl, titol) {
  const e = $('estat-envio');
  e.className = 'estat-envio ' + cl;
  e.title = titol || { ok: T_('Compartint la ubicació'), pausa: T_('Ubicació en pausa'), error: T_('Error') }[cl] || '';
}

// ---------- vistes ----------
function mostraVista(id) {
  document.querySelectorAll('.vista').forEach((v) => v.classList.toggle('activa', v.id === id));
  document.querySelectorAll('#pestanyes button').forEach((b) => b.classList.toggle('activa', b.dataset.vista === id));
  if (id === 'v-mapa' && mapa) setTimeout(() => mapa.invalidateSize(), 50);
  if (id === 'v-llocs') preparaVistaLlocs();
  if (id === 'v-opcions') pintaSms();
  window.scrollTo(0, 0);
}

// ---------- actualitzacions ----------
// L'APK mira https://xoriguer.dev/versions/onsoc/versio.json ({versio, apk}; abans les Releases de GitHub, suspès el 14/11/2026);
// la web s'actualitza sola amb el service worker.
const URL_VERSIO = 'https://xoriguer.dev/versions/onsoc/versio.json';
function versioMesNova(a, b) { // a > b ?
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0), pb = String(b).split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}
async function buscaActualitzacio(manual) {
  const res = $('o-versio-res');
  const diu = (t) => { if (manual) { res.textContent = t; res.hidden = false; } };
  // app d'Android: s'actualitza sense reinstal·lar (xoriguer-actualitza.js)
  if (window.XActualitza?.natiu) { await window.XActualitza.comprova(manual, (t) => { if (t || manual) diu(t); }); return; }
  if (!NATIU) {
    diu(T_("La web s'actualitza sola: quan l'obres amb connexió ja tens la darrera versió."));
    if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {});
    return;
  }
  if (!manual && Date.now() - llegeix('ultimaCerca', 0) < 20 * 3600e3) return; // un cop al dia
  if (manual) diu(T_('Buscant...'));
  try {
    const r = await (await fetch(URL_VERSIO, { cache: 'no-store' })).json();
    desa('ultimaCerca', Date.now());
    if (!r || !r.versio) { diu(T_("No s'ha pogut comprovar (sense connexió?)")); return; }
    const versio = String(r.versio).replace(/^v/, '');
    const apk = r.apk ? { browser_download_url: r.apk } : null;
    if (!versioMesNova(versio, VERSIO) || !apk) { diu(T_('Ja tens la darrera versió ({v}).', { v: VERSIO })); return; }
    $('o-baixa').href = apk.browser_download_url; $('o-baixa').hidden = false;
    diu(T_('Hi ha la versió {v}. Baixa-la i instal·la-la per sobre: no es perd res.', { v: versio }));
    if (manual || llegeix('versioTancada', '') !== versio) {
      $('avis-versio-text').textContent = T_("Hi ha una versió nova d'On Sóc ({v}).", { v: versio });
      $('avis-versio-baixa').href = apk.browser_download_url;
      $('avis-versio').hidden = false;
      $('avis-versio-tanca').onclick = () => { desa('versioTancada', versio); $('avis-versio').hidden = true; };
    }
  } catch { diu(T_("No s'ha pogut comprovar (sense connexió?)")); }
}

function selectorColors(cont, triat, enCanvi) {
  cont.innerHTML = COLORS.map((c) => `<button type="button" data-c="${c}" style="background:${c}" class="${c === triat ? 'triat' : ''}" aria-label="${esc(T_('Color'))} ${c}"></button>`).join('');
  cont.querySelectorAll('button').forEach((b) => (b.onclick = () => {
    cont.querySelectorAll('button').forEach((x) => x.classList.toggle('triat', x === b));
    enCanvi(b.dataset.c);
  }));
}

function pintaComparteixo() {
  $('f-comparteixo').checked = comparteixo;
  $('f-comparteixo-text').textContent = comparteixo
    ? (NATIU ? T_("La família veu on ets, també amb l'app tancada (avís fix a la barra).")
      : T_("La família veu on ets mentre aquesta pàgina és oberta. Per compartir amb l'app tancada, instal·la l'app."))
    : T_('En pausa: la família veu que has pausat, però no on ets.');
}

function pintaSms() {
  if (!Sms) return;
  $('f-sms').hidden = false;
  $('s-actiu').checked = smsActiu;
  const amb = Object.values(membres).filter((m) => m.id !== perfil.id && telNet(m.tel));
  $('s-numeros').innerHTML = amb.length
    ? esc(T_("S'enviaria a:")) + ' ' + amb.map((m) => `<b>${esc(m.nom)}</b> (${esc(m.tel)})`).join(', ')
    : esc(T_("Ningú de la família té el telèfon posat al seu perfil: cal que el posin perquè els arribi l'SMS."));
}

// ---------- inici ----------
function preparaBenvinguda() {
  let color = COLORS[Math.floor(Math.random() * COLORS.length)];
  selectorColors($('b-colors'), color, (c) => (color = c));
  const err = (t) => { $('b-error').textContent = t; $('b-error').hidden = !t; };
  const perfilNou = () => {
    const nom = $('b-nom').value.trim();
    if (!nom) { err(T_('Escriu el teu nom.')); $('b-nom').focus(); return null; }
    return { id: nouId(), nom, tel: $('b-tel').value.trim(), color };
  };
  $('b-crea').onclick = async () => {
    err('');
    const p = perfilNou(); if (!p) return;
    await entra(p, Cripto.nouCodi());
    mostraVista('v-familia');
  };
  $('b-uneix').onclick = async () => {
    err('');
    const p = perfilNou(); if (!p) return;
    const c = Cripto.valid($('b-codi').value);
    if (!c) { err(T_('El codi ha de tenir 16 lletres i xifres (XXXX-XXXX-XXXX-XXXX).')); return; }
    await entra(p, c);
  };
}

async function entra(p, codi) {
  perfil = p; codiFamilia = codi;
  desa('perfil', perfil); desa('familia', codiFamilia);
  await arrenca();
}

async function arrenca() {
  if (!perfil || !codiFamilia) {
    $('pestanyes').hidden = true;
    mostraVista('v-benvinguda');
    preparaBenvinguda();
    return;
  }
  fam = await Cripto.obre(codiFamilia);
  $('pestanyes').hidden = false;
  mostraVista('v-mapa');
  preparaMapa();
  pintaFamilia();
  pintaSosMeu();
  pintaAcomp();
  pintaEnllac();
  await preparaAvisos();
  try {
    await Promise.all([carregaMembres(), carregaLlocs(), carregaEvents()]);
    processaEvents();
    pinta();
  } catch { estatEnvio('error', T_('Sense connexió')); }
  escoltaTot();
  comencaUbicacio();
  netejaHistoric();
  if (compteDemanat) compteSos();
}

function pintaFamilia() {
  $('f-codi').textContent = codiFamilia;
  $('n-tema').textContent = fam.tema;
  $('n-envia').checked = ntfyEnvia;
  $('n-rebo').checked = ntfyRebo;
  $('f-nom').value = perfil.nom;
  $('f-tel').value = perfil.tel || '';
  $('f-gmaps').value = perfil.gmaps || '';
  let color = perfil.color;
  selectorColors($('f-colors'), color, (c) => (color = c));
  $('f-desa').onclick = () => {
    const nom = $('f-nom').value.trim();
    if (!nom) return;
    const gmTxt = $('f-gmaps').value.trim(), gm = enllacGmaps(gmTxt);
    $('f-gmaps-error').hidden = !gmTxt || !!gm;
    if (gmTxt && !gm) { $('f-gmaps').focus(); return; }
    perfil = { ...perfil, nom, tel: $('f-tel').value.trim(), color, gmaps: gm };
    $('avis-iphone').hidden = !(IPHONE_WEB && !gm);
    desa('perfil', perfil);
    envia(); pinta();
    $('f-desat').hidden = false; setTimeout(() => ($('f-desat').hidden = true), 1500);
  };
  pintaComparteixo();
  pintaInactiu();
  pintaFitxaPropia();
  $('f-android').hidden = !(NATIU && PLATAFORMA === 'android');
  $('f-iphone').hidden = !IPHONE_WEB;
  $('f-iphone-inici').hidden = INSTALLADA;
  // a l'iPhone (web), si encara no ha posat l'enllaç de Google Maps, un recordatori al mapa
  $('avis-iphone').hidden = !(IPHONE_WEB && !enllacGmaps(perfil.gmaps));
  $('versio').textContent = `Xoriguer On Sóc ${VERSIO} · ${NATIU ? PLATAFORMA : 'web'}`;
  $('o-versio-text').textContent = NATIU ? T_('Tens la versió {v}.', { v: VERSIO }) : T_('Versió web {v}.', { v: VERSIO });
  window.XActualitza?.inicia({ app: 'onsoc', versio: VERSIO });
  buscaActualitzacio(false);
}

async function copia(boto, text) {
  const abans = boto.textContent;
  try { await navigator.clipboard.writeText(text); boto.textContent = T_('Copiat!'); } catch { boto.textContent = T_("Selecciona'l i copia"); }
  setTimeout(() => (boto.textContent = abans), 1500);
}

let compteDemanat = false;
function preparaControls() {
  document.querySelectorAll('#pestanyes button').forEach((b) => (b.onclick = () => mostraVista(b.dataset.vista)));
  $('avis-permis-boto').onclick = () => {
    if (NATIU && BG) BG.openSettings().catch(() => {});
    else comencaUbicacio();
  };
  $('f-comparteixo').onchange = (e) => {
    comparteixo = e.target.checked; desa('comparteixo', comparteixo);
    pintaComparteixo();
    if (comparteixo) comencaUbicacio(); else { aturaUbicacio(); envia(); estatEnvio('pausa'); }
  };
  $('f-copia').onclick = () => copia($('f-copia'), codiFamilia);
  $('f-comparteix').onclick = async () => {
    const text = T_('Codi de la família per a Xoriguer On Sóc: {c}', { c: codiFamilia });
    if (navigator.share) navigator.share({ title: 'Xoriguer On Sóc', text }).catch(() => {});
    else copia($('f-copia'), codiFamilia);
  };
  $('f-mostra').onclick = () => {
    const c = $('f-codi').classList.toggle('amagat');
    $('f-mostra').textContent = c ? T_('Mostra') : T_('Amaga');
  };
  $('f-avisos').onclick = async () => {
    if (Avisos) { const r = await Avisos.requestPermissions().catch(() => null); if (r && r.display === 'granted') $('f-avisos').textContent = T_('Fet'); }
  };
  for (const id of ['f-idioma', 'b-idioma']) {
    $(id).value = llegeix('idioma', '');
    $(id).onchange = (e) => { desa('idioma', e.target.value); location.reload(); };
  }
  $('o-busca').onclick = () => buscaActualitzacio(true);
  $('m-desa').onclick = desaFitxa;
  $('avis-iphone-boto').onclick = () => { mostraVista('v-familia'); $('f-iphone').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  $('df-tanca').onclick = () => $('dialeg-fitxa').close();
  $('n-copia').onclick = () => copia($('n-copia'), fam.tema);
  $('n-obre').onclick = () => { location.href = `ntfy://ntfy.sh/${fam.tema}`; };
  $('n-envia').onchange = (e) => { ntfyEnvia = e.target.checked; desa('ntfyEnvia', ntfyEnvia); };
  $('n-rebo').onchange = (e) => { ntfyRebo = e.target.checked; desa('ntfyRebo', ntfyRebo); };
  $('s-actiu').onchange = async (e) => {
    if (e.target.checked && Sms) {
      const r = await Sms.demanaPermis().catch(() => ({ sms: 'denied' }));
      if (r.sms !== 'granted') { e.target.checked = false; alert(T_("Sense el permís d'SMS no es pot enviar. Pots donar-lo a Configuració → Aplicacions → On Sóc → Permisos.")); return; }
    }
    smsActiu = e.target.checked; desa('smsActiu', smsActiu);
  };
  $('b-estic-be').onclick = esticBe;
  $('b-acompanya').onclick = obreAcomp;
  $('b-enllac').onclick = obreEnllac;
  $('acomp-tanca').onclick = () => ($('acomp-nou').hidden = true);
  $('enllac-tanca').onclick = () => ($('enllac-nou').hidden = true);
  $('enllac-copia').onclick = () => copia($('enllac-copia'), urlEnllac());
  $('enllac-comparteix').onclick = () => {
    const url = urlEnllac();
    if (navigator.share) navigator.share({ title: 'Xoriguer On Sóc', text: T_('On sóc ara (enllaç temporal):'), url }).catch(() => {});
    else copia($('enllac-copia'), url);
  };
  $('enllac-atura').onclick = () => { if (confirm(T_("Aturar l'enllaç? Qui el tingui deixarà de veure't."))) aturaEnllac(); };
  $('acomp-arribat').onclick = () => acabaAcomp(true);
  $('acomp-cancela').onclick = () => { if (confirm(T_("Deixar l'acompanya'm?"))) acabaAcomp(false); };
  $('acomp-mes').onclick = () => {
    if (!acomp) return;
    acomp.fins = Math.max(acomp.fins, Date.now()) + 10 * 60e3; acomp.avisat = false; desa('acomp', acomp);
    programaAvisAcomp(); envia(); pintaAcomp();
  };
  $('f-surt').onclick = async () => {
    if (!confirm(T_('Segur? Hauràs de tornar a escriure el codi per tornar a entrar.'))) return;
    aturaUbicacio();
    if (enllac) aturaEnllac();
    Object.values(fonts).forEach((f) => f.close());
    try { await fetch(`${base()}/m/${perfil.id}.json`, { method: 'DELETE' }); } catch {}
    await esborra(`h/${perfil.id}`);
    ['familia', 'sos', 'avisatsSos', 'avisatsTard', 'avisatsInactiu', 'estatsLlocs', 'acomp', 'enllac', 'ultimHist', 'ultimEvent', 'batAvisat']
      .forEach((k) => localStorage.removeItem('onsoc.' + k));
    location.reload();
  };
  preparaSos();
  // en tornar a primer pla: llegeix-ho tot de nou (les connexions poden haver dormit)
  const repren = () => {
    if (!fam) return;
    Promise.all([carregaMembres(), carregaLlocs(), carregaEvents()]).then(() => { processaEvents(); pinta(); }).catch(() => {});
    escoltaTot();
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') repren(); });
  setInterval(() => {
    if (!fam) return;
    revisaAcomp();
    if (enllac && Date.now() > enllac.fins) aturaEnllac();
    pinta();
  }, 15000);
  if (!NATIU && typeof Notification !== 'undefined' && Notification.permission === 'default') {
    document.addEventListener('click', () => Notification.requestPermission().catch(() => {}), { once: true });
  }
  // botó de la persiana / drecera de la icona (natiu) o ?sos=1 (web)
  if (AppCap) {
    AppCap.addListener('appUrlOpen', (d) => obreUrl(d.url));
    AppCap.getLaunchUrl().then((r) => { if (r && r.url && /sos/i.test(r.url.split('://').pop())) compteDemanat = true; }).catch(() => {});
  }
  if (new URLSearchParams(location.search).get('sos')) { compteDemanat = true; history.replaceState(null, '', location.pathname); }
}

function posaIdioma() {
  if (typeof I18N === 'undefined') return;
  I18N.posa(llegeix('idioma', ''));
  document.documentElement.lang = I18N.llengua;
  I18N.tradueix(document.body);
}

if (typeof document !== 'undefined' && document.getElementById('mapa')) {
  document.addEventListener('DOMContentLoaded', async () => {
    posaIdioma();
    carregaEstatLocal();
    preparaControls();
    if (AppCap) await new Promise((r) => setTimeout(r, 0)); // deixa arribar getLaunchUrl
    arrenca();
  });
  if (!NATIU && 'serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
if (typeof module !== 'undefined') module.exports = { distanciaM, textDistancia, textFa, calEnviar, calHistoric, estatLloc, esInactiu, diaLocal, textEvent, enllacGmaps };
