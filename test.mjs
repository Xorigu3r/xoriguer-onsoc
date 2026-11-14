// Proves de la lògica pura i del xifratge: node test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { distanciaM, textDistancia, textFa, calEnviar } = require('./www/app.js');
await import('./www/cripto.js');
const C = globalThis.Cripto;

const bcn = { lat: 41.3874, lng: 2.1686 }, gi = { lat: 41.9794, lng: 2.8214 };
assert.ok(Math.abs(distanciaM(bcn, gi) - 85500) < 2000, 'BCN-Girona ~85 km');
assert.equal(textDistancia(234), 'a 230 m');
assert.equal(textDistancia(3456), 'a 3,5 km');
assert.equal(textFa(Date.now() - 5 * 60e3), 'fa 5 min');
assert.equal(textFa(Date.now() - 3 * 3600e3), 'fa 3 h');
const ara = Date.now();
assert.equal(calEnviar(null, bcn, ara), true);
assert.equal(calEnviar({ ...bcn, t: ara - 5000 }, gi, ara), false, 'massa aviat');
assert.equal(calEnviar({ ...bcn, t: ara - 30000 }, bcn, ara), false, 'quiet i recent');
assert.equal(calEnviar({ ...bcn, t: ara - 30000 }, gi, ara), true, "s'ha mogut");
assert.equal(calEnviar({ ...bcn, t: ara - 130000 }, bcn, ara), true, 'temps');

const codi = C.nouCodi();
assert.match(codi, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
assert.equal(C.valid(codi.toLowerCase().replace(/-/g, ' ')), codi);
assert.equal(C.valid('ABCD-EFGH'), null);
assert.equal(C.valid('OOOO-0000-1111-IIII'), null);
const f = await C.obre(codi), f2 = await C.obre(codi), altra = await C.obre(C.nouCodi());
assert.equal(f.id, f2.id);
assert.notEqual(f.id, altra.id);
const x = await C.xifra(f.clau, { nom: 'Mama', lat: 41.1 });
assert.ok(!JSON.stringify(x).includes('Mama'));
assert.deepEqual(await C.desxifra(f2.clau, x), { nom: 'Mama', lat: 41.1 });
assert.equal(await C.desxifra(altra.clau, x), null, 'una altra família no ho pot llegir');
console.log('Totes les proves OK');

// 1.1: llocs, recorregut, avisos
const { calHistoric, estatLloc, diaLocal, textEvent } = require('./www/app.js');
assert.equal(estatLloc(undefined, 50, 100, 20), 'dins');
assert.equal(estatLloc('dins', 120, 100, 20), 'dins', 'histèresi: encara no ha sortit');
assert.equal(estatLloc('dins', 150, 100, 20), 'fora');
assert.equal(estatLloc('fora', 50, 100, 400), 'fora', 'posició imprecisa: no canvia');
assert.equal(estatLloc(undefined, 120, 100, 20), 'fora');
assert.equal(calHistoric(null, bcn, ara), true);
assert.equal(calHistoric({ ...bcn, t: ara - 60e3 }, bcn, ara), false);
assert.equal(calHistoric({ ...bcn, t: ara - 1000e3 }, bcn, ara), true);
assert.match(diaLocal(ara), /^\d{4}-\d{2}-\d{2}$/);
assert.equal(textEvent({ tipus: 'arriba', nom: 'Marta', lloc: 'Escola' }), 'Marta ha arribat a Escola');
assert.equal(textEvent({ tipus: 'surt', nom: 'Marta', lloc: 'Escola' }), "Marta ha sortit d'Escola");
assert.equal(textEvent({ tipus: 'surt', nom: 'Marta', lloc: 'Casa' }), 'Marta ha sortit de Casa');
assert.ok(textEvent({ tipus: 'tard', nom: 'Joan', desti: 'Casa' }).includes('SOS'));
assert.match(f.tema, /^onsoc-[0-9a-f]{20}$/);
assert.equal(f.tema, f2.tema);
console.log('Proves 1.1 OK');

// 1.2: inactivitat, enllaç
const { esInactiu } = require('./www/app.js');
assert.equal(esInactiu(ara - 13 * 3600e3, 12, ara), true);
assert.equal(esInactiu(ara - 11 * 3600e3, 12, ara), false);
assert.equal(esInactiu(ara - 99 * 3600e3, 0, ara), false, '0 = sense avís');
const en = await C.nouEnllac();
assert.match(en.id, /^[0-9a-f]{24}$/);
const ce = await C.clauEnllac(en.text);
const xe = await C.xifra(ce, { nom: 'Pare', lat: 1 });
assert.deepEqual(await C.desxifra(await C.clauEnllac(en.text), xe), { nom: 'Pare', lat: 1 });
assert.equal(await C.desxifra(f.clau, xe), null, 'la clau de família no obre l\'enllaç');
console.log('Proves 1.2 OK');
