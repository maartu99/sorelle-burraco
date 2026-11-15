import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';

function torneo(n, seed = 7) {
  let t = E.nuovoTorneo();
  t.seed = seed;
  t.config.formato = 'eliminazione';
  const coppie = [];
  for (let i = 0; i < n; i++) {
    t.players['x' + i] = { name: 'X' + i, present: true }; t.players['y' + i] = { name: 'Y' + i, present: true };
    coppie.push(['x' + i, 'y' + i]);
  }
  return E.confermaCoppie(t, coppie);
}
// Forza: la coppia con indice più basso vince sempre (A batte B ...). Punti: 1000 - indice*10.
const forza = (t, id) => 10000 - t.order.indexOf(id) * 37;
function gioca(t, punti = forza) {
  while (t.status === 'running') {
    const n = E.turnoCorrente(t); const r = t.rounds[n];
    const results = {};
    for (const [k, tb] of Object.entries(r.tables)) results[k] = { a: punti(t, tb.a), b: punti(t, tb.b) };
    t = E.chiudiTurno({ ...t, rounds: { ...t.rounds, [n]: { ...r, results } } });
  }
  return t;
}

test('8 coppie: 3 turni, tutti giocano sempre, finali per ogni posto', () => {
  let t = E.avviaTorneo(torneo(8));
  assert.equal(t.config.turni, 3);
  t = gioca(t);
  assert.equal(t.status, 'finished');
  for (const r of Object.values(t.rounds)) assert.equal(Object.keys(r.tables).length, 4);
  // Nessuno incontra due volte lo stesso avversario
  const vs = new Set();
  for (const r of Object.values(t.rounds)) for (const tb of Object.values(r.tables)) {
    const k = [tb.a, tb.b].sort().join('|'); assert.ok(!vs.has(k), 'rivincita ' + k); vs.add(k);
  }
  const et = Object.keys(t.rounds[3].tables).map((k) => E.etichettaTavolo(t, 3, k));
  assert.deepEqual(et, ['Finale 1° e 2° posto', 'Finale 3° e 4° posto', 'Finale 5° e 6° posto', 'Finale 7° e 8° posto']);
  assert.deepEqual(Object.keys(t.rounds[2].tables).map((k) => E.etichettaTavolo(t, 2, k)), ['Semifinale', 'Semifinale', 'Per il 5°-8° posto', 'Per il 5°-8° posto']);
  const cl = E.classificaEliminazione(t);
  assert.equal(cl.length, 8);
  // vince sempre la più forte: la più forte è 1ª, la più debole 8ª, e le vittorie scendono con la posizione
  assert.equal(cl[0].id, t.order[0]); assert.equal(cl[7].id, t.order[7]);
  assert.deepEqual(cl.map((r) => r.vinte), [3, 2, 2, 1, 2, 1, 1, 0]);
});

test('il 3° e 4° posto va a chi perde la semifinale', () => {
  let t = gioca(E.avviaTorneo(torneo(8, 99)));
  const cl = E.classificaEliminazione(t);
  // 3ª e 4ª: hanno vinto il primo turno e perso la semifinale (poi una vince la finale per il 3° posto)
  assert.ok(cl[2].gruppo.startsWith('VP') && cl[3].gruppo.startsWith('VP'));
  assert.equal(cl[2].vinte, 2); assert.equal(cl[3].vinte, 1);
  // 5ª-8ª: hanno perso il primo turno
  for (const r of cl.slice(4)) assert.ok(r.gruppo.startsWith('P'));
});

test('10 coppie: ripescaggio della perdente con più punti, tavoli sempre pieni', () => {
  let t = E.avviaTorneo(torneo(10, 3));
  assert.equal(t.config.turni, 4);
  // turno 1 con punteggi noti
  const r1 = t.rounds[1];
  const results = {}; let k = 0;
  for (const [tav, tb] of Object.entries(r1.tables)) { results[tav] = { a: 2000, b: 1000 + (k++) * 100 }; }
  t = E.chiudiTurno({ ...t, rounds: { ...t.rounds, 1: { ...r1, results } } });
  const perdenti = Object.values(r1.tables).map((tb) => tb.b);
  const migliore = perdenti[perdenti.length - 1]; // 1400 punti
  const { gruppi, ripescate } = E.gruppiEliminazione(t, 1);
  assert.equal(gruppi[0][1].length, 6, 'vincenti + 1 ripescata');
  assert.ok(gruppi[0][1].includes(migliore));
  assert.equal(ripescate[migliore], 2);
  t = gioca(t);
  for (const r of Object.values(t.rounds)) assert.equal(Object.keys(r.tables).length, 5);
  assert.equal(E.classificaEliminazione(t).length, 10);
});

test('pareggio: senza spareggio non c\'è vincitore, con spareggio sì', () => {
  assert.equal(E.vincitore({ a: 900, b: 900 }), null);
  assert.equal(E.vincitore({ a: 900, b: 900, spareggio: 'b' }), 'b');
  assert.equal(E.vincitore({ a: 1200, b: 900 }), 'a');
  assert.equal(E.vincitore({ a: -50, b: 100 }), 'b');
});

test('coppie dispari bloccate, 2, 4 e 6 coppie funzionano', () => {
  assert.ok(E.verificaAvvio(torneo(7)).length);
  for (const [n, turni] of [[2, 1], [4, 2], [6, 3], [12, 4], [16, 4]]) {
    let t = E.avviaTorneo(torneo(n, n));
    assert.equal(t.config.turni, turni, `${n} coppie`);
    t = gioca(t);
    assert.equal(t.status, 'finished');
    for (const r of Object.values(t.rounds)) assert.equal(Object.keys(r.tables).length, n / 2, `${n} coppie, turno ${r.n}`);
    assert.equal(new Set(E.classificaEliminazione(t).map((r) => r.id)).size, n);
  }
});

test('nell\'eliminazione il ritiro è bloccato, il formato a punti resta uguale', () => {
  const t = E.avviaTorneo(torneo(8));
  assert.throws(() => E.ritiraCoppia(t, 'A'));
  assert.equal(E.durataTurnoMin(t.config), 45);
  assert.equal(E.durataTurnoMin(E.nuovoTorneo().config), 42);
});

test('nessun ripescaggio con 8 coppie, nemmeno dopo le finali', () => {
  const t = gioca(E.avviaTorneo(torneo(8, 5)));
  for (const n of [1, 2, 3]) assert.deepEqual(E.gruppiEliminazione(t, n).ripescate, {});
  assert.ok(E.classificaEliminazione(t).every((r) => !r.ripescata));
});

test('risultati letti da Firebase (liste diventate oggetti) restano utilizzabili', async () => {
  const { senzaArray } = await import('../js/store.js');
  let t = E.avviaTorneo(torneo(8));
  const r = t.rounds[1];
  const results = {};
  for (const k of Object.keys(r.tables)) results[k] = { a: 1000, b: 900, mani: { a: [550, 450], b: [600, 300] } };
  t = { ...t, rounds: { ...t.rounds, 1: { ...r, results } } };
  const daFirebase = E.normalizza(senzaArray(JSON.parse(JSON.stringify(t))));
  const m = daFirebase.rounds[1].results[1].mani;
  assert.ok(Array.isArray(m.a) && Array.isArray(m.b));
  assert.deepEqual(m.a, [550, 450]);
});
