// Xifratge de punta a punta amb el codi de la família (WebCrypto).
//  - id de la família  = SHA-256('onsoc-id:' + codi), 24 xifres hex  -> on es guarda al servidor
//  - clau              = PBKDF2(codi, 'xoriguer-onsoc-v1', 150000, SHA-256) -> AES-GCM 256
// El codi no surt mai del mòbil: al servidor només hi ha l'id (no reversible) i dades xifrades.
(function (g) {
  'use strict';
  const LLETRES = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sense 0/O ni 1/I/L
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function nouCodi() {
    const b = crypto.getRandomValues(new Uint8Array(16));
    let s = '';
    for (let i = 0; i < 16; i++) s += LLETRES[b[i] & 31];
    return s.match(/.{4}/g).join('-'); // 16 x 5 bits = 80 bits
  }

  function normalitza(codi) {
    return String(codi || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function valid(codi) {
    const s = normalitza(codi);
    return s.length === 16 && [...s].every((c) => LLETRES.includes(c)) ? s.match(/.{4}/g).join('-') : null;
  }

  const b64 = (u8) => btoa(String.fromCharCode(...u8));
  const deb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');

  async function obre(codi) {
    const net = valid(codi);
    if (!net) throw new Error('Codi no vàlid');
    const id = hex(await crypto.subtle.digest('SHA-256', enc.encode('onsoc-id:' + net))).slice(0, 24);
    const base = await crypto.subtle.importKey('raw', enc.encode(net), 'PBKDF2', false, ['deriveKey']);
    const clau = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode('xoriguer-onsoc-v1'), iterations: 150000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    // tema d'ntfy: un altre hash del codi (des del tema no es pot treure ni el codi ni l'id)
    const tema = 'onsoc-' + hex(await crypto.subtle.digest('SHA-256', enc.encode('onsoc-ntfy:' + net))).slice(0, 20);
    return { codi: net, id, clau, tema };
  }

  async function xifra(clau, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const d = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, clau, enc.encode(JSON.stringify(obj))));
    return { iv: b64(iv), d: b64(d) };
  }

  async function desxifra(clau, x) {
    if (!x || !x.iv || !x.d) return null;
    try {
      const p = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: deb64(x.iv) }, clau, deb64(x.d));
      return JSON.parse(dec.decode(p));
    } catch { return null; } // clau equivocada o dades alterades
  }

  // Enllaç temporal per a algú de fora: id aleatori (24 hex, on es desa) + clau aleatòria de 256 bits.
  // La clau va al fragment de l'URL (#...), que el navegador no envia mai al servidor.
  const b64url = (u8) => b64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const deb64url = (s) => deb64(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  async function nouEnllac() {
    const id = hex(crypto.getRandomValues(new Uint8Array(12)));
    const crua = crypto.getRandomValues(new Uint8Array(32));
    return { id, text: b64url(crua) };
  }
  async function clauEnllac(text) {
    const crua = deb64url(text);
    if (crua.length !== 32) throw new Error('Clau no vàlida');
    return crypto.subtle.importKey('raw', crua, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  g.Cripto = { nouCodi, valid, obre, xifra, desxifra, nouEnllac, clauEnllac };
})(typeof window !== 'undefined' ? window : globalThis);
