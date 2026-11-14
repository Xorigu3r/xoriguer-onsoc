/* Xoriguer On Sóc — pàgina de l'enllaç temporal (per a algú de fora de la família, sense instal·lar res).
 * URL: veure.html#<id>.<clau>. El fragment (#) no arriba mai al servidor: només aquest navegador pot desxifrar. */
'use strict';
(async function () {
  const T_ = (s, v) => I18N.t(s, v);
  const LOC = () => ({ ca: 'ca', es: 'es', fr: 'fr', en: 'en-GB' }[I18N.llengua] || 'ca');
  I18N.posa('');
  document.documentElement.lang = I18N.llengua;
  I18N.tradueix(document.body);
  const $ = (id) => document.getElementById(id);
  const hora = (t) => new Date(t).toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit' });
  const fa = (t) => {
    const m = Math.round((Date.now() - t) / 60e3);
    return m < 1 ? T_('ara mateix') : m < 60 ? T_('fa {n} min', { n: m }) : T_('fa {n} h', { n: Math.round(m / 60) });
  };
  const fi = (titol, info) => { $('v-titol').textContent = titol; $('v-info').textContent = info || ''; };

  const [id, text] = location.hash.slice(1).split('.');
  if (!/^[0-9a-f]{24}$/.test(id || '') || !text) { fi(T_('Enllaç no vàlid'), T_("Comprova que l'has copiat sencer.")); return; }
  let clau;
  try { clau = await Cripto.clauEnllac(text); } catch { fi(T_('Enllaç no vàlid'), T_("Comprova que l'has copiat sencer.")); return; }

  const mapa = L.map('mapa').setView([41.7, 1.8], 8);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(mapa);
  let marc = null, cercle = null, primer = true, ultim = null;

  // sense ubicació a mostrar: fora l'agulla i el botó de la ruta (no ensenyem una posició vella)
  function amaga() {
    if (marc) { mapa.removeLayer(marc); mapa.removeLayer(cercle); marc = cercle = null; }
    $('v-ruta-p').hidden = true;
  }
  function pinta() {
    const d = ultim;
    if (!d) { amaga(); $('v-sos').hidden = true; fi(T_('Aquest enllaç ja no està actiu'), T_("La persona que el va compartir l'ha aturat o ha caducat.")); return; }
    if (Date.now() > d.fins) { amaga(); $('v-sos').hidden = true; fi(T_('Aquest enllaç ha caducat'), T_('Ha caducat a les {h}.', { h: hora(d.fins) })); return; }
    $('v-titol').textContent = T_('On és {n}', { n: d.nom });
    $('v-sos').hidden = !d.sos;
    if (d.sos) $('v-sos-text').textContent = T_('{n} ha demanat ajuda (SOS)', { n: d.nom });
    if (d.pausa || d.lat == null) {
      amaga();
      $('v-info').textContent = T_('Ara mateix no comparteix la ubicació.');
      return;
    }
    $('v-info').textContent = T_('Actualitzat {f}', { f: fa(d.vist) }) + (d.acc ? ` · ±${d.acc} m` : '') +
      (d.bat != null ? ` · 🔋 ${d.bat}%` : '') + ' · ' + T_("L'enllaç caduca a les {h}", { h: hora(d.fins) });
    const ll = [d.lat, d.lng];
    const icona = L.divIcon({ className: '', iconSize: [40, 40], iconAnchor: [20, 46],
      html: `<div class="agulla${d.sos ? ' alerta' : ''}" style="background:${String(d.color).replace(/[^#0-9A-Fa-f]/g, '')}"><span></span></div>` });
    if (!marc) { marc = L.marker(ll, { icon: icona }).addTo(mapa); cercle = L.circle(ll, { radius: d.acc || 0, color: '#FFA82E', weight: 1, fillOpacity: 0.1 }).addTo(mapa); }
    else { marc.setLatLng(ll).setIcon(icona); cercle.setLatLng(ll).setRadius(d.acc || 0); }
    marc.getElement().querySelector('span').textContent = (d.nom || '?').trim()[0].toUpperCase();
    if (primer) { mapa.setView(ll, 16); primer = false; }
    $('v-ruta-p').hidden = false;
    $('v-ruta').href = /iPhone|iPad|Mac/.test(navigator.userAgent) ? `https://maps.apple.com/?daddr=${d.lat},${d.lng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}`;
  }

  async function reb(x) {
    ultim = x ? await Cripto.desxifra(clau, x) : null;
    if (x && !ultim) { fi(T_('Enllaç no vàlid'), T_("Comprova que l'has copiat sencer.")); return; }
    pinta();
  }
  const url = `${window.ONSOC_DB}/${window.ONSOC_ARREL}/${id}/p.json`;
  try { await reb(await (await fetch(url)).json()); } catch { fi(T_('Sense connexió'), ''); }
  const es = new EventSource(url);
  es.addEventListener('put', async (e) => {
    try { const m = JSON.parse(e.data); if (m.path === '/') await reb(m.data); else await reb(await (await fetch(url)).json()); } catch {}
  });
  setInterval(pinta, 30000);
})();
