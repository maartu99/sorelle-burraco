import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { RIPOSO } from '../js/regolamento.js';

test('tabella VP 4 smazzate: confini delle fasce', () => {
  const casi = [[0, 10], [100, 10], [105, 11], [300, 11], [305, 12], [620, 13], [700, 13], [705, 14], [850, 14],
    [1105, 16], [1500, 17], [1505, 18], [2000, 19], [2005, 20], [5000, 20]];
  for (const [d, vp] of casi) assert.equal(E.vpDaDifferenza(d, 4), vp, `diff ${d}`);
});

test('tabella VP 3 e 2 smazzate', () => {
  assert.equal(E.vpDaDifferenza(50, 3), 10);
  assert.equal(E.vpDaDifferenza(55, 3), 11);
  assert.equal(E.vpDaDifferenza(1505, 3), 20);
  assert.equal(E.vpDaDifferenza(40, 2), 10);
  assert.equal(E.vpDaDifferenza(1000, 2), 19);
  assert.equal(E.vpDaDifferenza(1005, 2), 20);
});

test('calcolaPartita: esempio 1540 contro 920, e punteggi negativi', () => {
  assert.deepEqual(E.calcolaPartita(1540, 920, 4), { mpA: 620, mpB: -620, vpA: 13, vpB: 7 });
  assert.deepEqual(E.calcolaPartita(-150, 300, 4), { mpA: -450, mpB: 450, vpA: 8, vpB: 12 });
  assert.deepEqual(E.calcolaPartita(500, 500, 4), { mpA: 0, mpB: 0, vpA: 10, vpB: 10 });
});

test('calendario all\'italiana: tutti contro tutti una volta', () => {
  for (const n of [3, 4, 5, 6, 7, 8]) {
    const ids = Array.from({ length: n }, (_, i) => E.lettera(i));
    const cal = E.calendarioItaliana(ids);
    const visti = new Set();
    for (const giro of cal) {
      const nelGiro = new Set();
      for (const [a, b] of giro) {
        assert.ok(!nelGiro.has(a) && !nelGiro.has(b));
        nelGiro.add(a); nelGiro.add(b);
        if (a === E.GHOST || b === E.GHOST) continue;
        const k = [a, b].sort().join('-');
        assert.ok(!visti.has(k), `ripetuto ${k}`);
        visti.add(k);
      }
    }
    assert.equal(visti.size, (n * (n - 1)) / 2);
  }
});

test('Mitchell: le mobili incontrano fisse diverse, le fisse non si incontrano', () => {
  const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const visti = new Set();
  for (let n = 1; n <= 4; n++) {
    for (const [f, m] of E.schemaMitchell(ids, n)) {
      assert.ok(['A', 'B', 'C', 'D'].includes(f));
      assert.ok(['E', 'F', 'G', 'H'].includes(m));
      const k = f + m;
      assert.ok(!visti.has(k));
      visti.add(k);
    }
  }
});

function torneoConCoppie(n, sistema, turni, smazzate = 4) {
  let t = E.nuovoTorneo();
  t.seed = 12345;
  t.config = { ...t.config, sistema, turni, smazzate };
  for (let i = 0; i < n * 2; i++) t.players['p' + i] = { name: 'Giocatore ' + i, present: true };
  const coppie = [];
  for (let i = 0; i < n; i++) coppie.push(['p' + 2 * i, 'p' + (2 * i + 1)]);
  t = E.confermaCoppie(t, coppie);
  return E.avviaTorneo(t);
}

function giocaTurno(t, random) {
  const n = E.turnoCorrente(t);
  const r = t.rounds[n];
  const results = {};
  for (const k of Object.keys(r.tables)) {
    results[k] = { a: Math.round(random() * 400) * 5 - 200, b: Math.round(random() * 400) * 5 - 200 };
  }
  return { ...t, rounds: { ...t.rounds, [n]: { ...r, results } } };
}

function simula(n, sistema, turni, seed = 1) {
  const random = E.rng(seed);
  let t = torneoConCoppie(n, sistema, turni);
  while (t.status === 'running') {
    t = giocaTurno(t, random);
    t = E.chiudiTurno(t);
  }
  return t;
}

test('simulazione completa per molti numeri di coppie e sistemi', () => {
  for (const n of [3, 4, 5, 6, 7, 8, 9, 11, 13]) {
    for (const sistema of ['danese_mod', 'danese', 'italiana', 'mitchell']) {
      const turni = Math.min(E.maxTurni(sistema, n), sistema.startsWith('danese') ? 5 : 99);
      for (let seed = 1; seed <= 5; seed++) {
        const t = simula(n, sistema, turni, seed);
        assert.equal(t.status, 'finished');
        const rounds = Object.values(t.rounds);
        assert.equal(rounds.length, turni);
        const riposiPerCoppia = {};
        for (const r of rounds) {
          // Ogni coppia attiva compare esattamente una volta per turno.
          const viste = [];
          for (const tb of Object.values(r.tables)) viste.push(tb.a, tb.b);
          viste.push(...Object.keys(r.byes));
          assert.equal(new Set(viste).size, viste.length, `${n} ${sistema} turno ${r.n}: coppia ripetuta`);
          assert.equal(viste.length, n, `${n} ${sistema} turno ${r.n}: coppie mancanti`);
          assert.equal(Object.keys(r.byes).length, n % 2, 'un solo riposo con coppie dispari');
          for (const id of Object.keys(r.byes)) riposiPerCoppia[id] = (riposiPerCoppia[id] || 0) + 1;
        }
        for (const v of Object.values(riposiPerCoppia)) assert.equal(v, 1, `${n} ${sistema}: coppia a riposo due volte`);
        // Totale V.P. coerente: 20 per tavolo più i riposi.
        const cl = E.classifica(t);
        const totVP = cl.reduce((a, r) => a + r.vp, 0);
        const tavoli = rounds.reduce((a, r) => a + Object.keys(r.tables).length, 0);
        const byes = rounds.reduce((a, r) => a + Object.keys(r.byes).length, 0);
        assert.equal(totVP, tavoli * 20 + byes * RIPOSO[4].vp);
        // Somma M.P. = solo i riposi (le partite si compensano).
        assert.equal(cl.reduce((a, r) => a + r.mp, 0), byes * RIPOSO[4].mp);
      }
    }
  }
});

test('danese modificato: nessun incontro del turno precedente, salvo all\'ultimo', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const t = simula(8, 'danese_mod', 5, seed);
    for (let n = 2; n < 5; n++) {
      const prima = new Set(Object.values(t.rounds[n - 1].tables).map((x) => [x.a, x.b].sort().join()));
      for (const tb of Object.values(t.rounds[n].tables)) {
        assert.ok(!prima.has([tb.a, tb.b].sort().join()), `seed ${seed} turno ${n}`);
      }
    }
  }
});

test('danese: con coppie dispari riposa l\'ultima in classifica che non ha ancora riposato', () => {
  let t = torneoConCoppie(7, 'danese', 4);
  const random = E.rng(7);
  t = giocaTurno(t, random);
  t = E.chiudiTurno(t);
  const cl = E.classifica(t, 1);
  const r1bye = Object.keys(t.rounds[1].byes)[0];
  const atteso = [...cl].reverse().find((r) => r.id !== r1bye).id;
  assert.equal(Object.keys(t.rounds[2].byes)[0], atteso);
});

test('parità: scontro diretto decide tra due coppie a pari VP e MP', () => {
  let t = E.nuovoTorneo();
  t.seed = 1;
  t.order = ['A', 'B', 'C', 'D'];
  t.pairs = { A: { id: 'A' }, B: { id: 'B' }, C: { id: 'C' }, D: { id: 'D' } };
  t.config.smazzate = 4;
  // Turno 1: A batte B di 620 (13-7), C batte D di 620.
  // Turno 2: A perde con C di 620, B batte D di 620.
  // A: 13+7=20 VP, MP 0; B: 7+13=20, MP 0; C: 26 VP; D: 14 VP.
  t.rounds = {
    1: { n: 1, closed: true, byes: {}, tables: { 1: { a: 'A', b: 'B' }, 2: { a: 'C', b: 'D' } }, results: { 1: { a: 1620, b: 1000 }, 2: { a: 1620, b: 1000 } } },
    2: { n: 2, closed: true, byes: {}, tables: { 1: { a: 'A', b: 'C' }, 2: { a: 'B', b: 'D' } }, results: { 1: { a: 1000, b: 1620 }, 2: { a: 1620, b: 1000 } } },
  };
  const cl = E.classifica(t);
  const ia = cl.findIndex((r) => r.id === 'A');
  const ib = cl.findIndex((r) => r.id === 'B');
  assert.ok(ia < ib, 'A ha vinto lo scontro diretto');
  assert.equal(cl[ia].decisoDa, 'scontro diretto');
});

test('parità a tre senza scontri completi: si passa ai criteri successivi', () => {
  let t = E.nuovoTorneo();
  t.seed = 3;
  t.order = ['A', 'B', 'C', 'D', 'E', 'F'];
  t.pairs = Object.fromEntries(t.order.map((id) => [id, { id }]));
  // A, C, E vincono tutte di 620 nel turno 1 contro B, D, F.
  t.rounds = {
    1: { n: 1, closed: true, byes: {}, tables: { 1: { a: 'A', b: 'B' }, 2: { a: 'C', b: 'D' }, 3: { a: 'E', b: 'F' } },
      results: { 1: { a: 1620, b: 1000 }, 2: { a: 1620, b: 1000 }, 3: { a: 1620, b: 1000 } } },
  };
  const cl = E.classifica(t);
  assert.deepEqual(cl.slice(0, 3).map((r) => r.id).sort(), ['A', 'C', 'E']);
  assert.ok(cl.slice(0, 3).every((r) => r.decisoDa === 'sorteggio'));
  // Ripetibile.
  assert.deepEqual(E.classifica(t).map((r) => r.id), cl.map((r) => r.id));
});

test('ritiro a metà torneo: l\'avversario riposa, risultati precedenti validi', () => {
  let t = torneoConCoppie(8, 'italiana', 7);
  const random = E.rng(2);
  t = giocaTurno(t, random); t = E.chiudiTurno(t);
  const vittima = t.order[0];
  t = E.ritiraCoppia(t, vittima);
  const r2 = t.rounds[2];
  const inGioco = Object.values(r2.tables).flatMap((x) => [x.a, x.b]);
  assert.ok(!inGioco.includes(vittima));
  assert.equal(Object.values(r2.byes).filter((m) => m === 'ritiro').length, 1);
  while (t.status === 'running') { t = giocaTurno(t, random); t = E.chiudiTurno(t); }
  const cl = E.classifica(t);
  assert.ok(cl.find((r) => r.id === vittima).ritirata);
  assert.equal(cl.find((r) => r.id === vittima).giocate, 1);
});

test('ritiro con danese prima di inserire risultati: turno rigenerato con riposo', () => {
  let t = torneoConCoppie(8, 'danese_mod', 4);
  const random = E.rng(4);
  t = giocaTurno(t, random); t = E.chiudiTurno(t);
  t = E.ritiraCoppia(t, t.order[3]);
  const r2 = t.rounds[2];
  assert.equal(Object.keys(r2.tables).length, 3);
  assert.equal(Object.keys(r2.byes).length, 1);
});

test('limiti di turni e sistema suggerito', () => {
  assert.equal(E.maxTurni('italiana', 6), 5);
  assert.equal(E.maxTurni('italiana', 7), 7);
  assert.equal(E.maxTurni('mitchell', 8), 4);
  assert.equal(E.maxTurni('danese', 7), 7);
  assert.equal(E.sistemaSuggerito(6, 5), 'italiana');
  assert.equal(E.sistemaSuggerito(8, 4), 'danese_mod');
  const t = E.normalizza({ order: ['A', 'B', 'C', 'D'], config: { sistema: 'italiana', turni: 4 } });
  assert.ok(E.verificaAvvio(t).length > 0);
});

test('durata prevista: 8 coppie, 4 turni da 4 smazzate', () => {
  const c = E.nuovoTorneo().config;
  assert.equal(E.durataPrevista({ ...c, smazzate: 4 }, 4), 15 + 4 * 42 + 3 * 5 + 10);
  assert.equal(E.durataPrevista({ ...c, smazzate: 3 }, 5), 15 + 5 * 32 + 4 * 5 + 10);
});

test('timer: pausa e ripresa', () => {
  const timer = { durataMs: 42 * 60000, startedAt: 1000, pausedMs: 0, pausedAt: null };
  assert.equal(E.tempoResiduoMs(timer, 61000), 42 * 60000 - 60000);
  const inPausa = { ...timer, pausedAt: 61000 };
  assert.equal(E.tempoResiduoMs(inPausa, 121000), 42 * 60000 - 60000);
  const ripreso = { ...timer, pausedMs: 60000, pausedAt: null };
  assert.equal(E.tempoResiduoMs(ripreso, 181000), 42 * 60000 - 120000);
});

test('coppie: un giocatore non può stare in due coppie', () => {
  assert.match(E.verificaCoppie([['a', 'b'], ['a', 'c']], ['a', 'b', 'c', 'd']), /più di una coppia/);
  assert.match(E.verificaCoppie([['a', 'a']], ['a']), /non valida/);
  assert.match(E.verificaCoppie([['a', 'b']], ['a', 'b', 'c', 'd']), /senza coppia/);
  assert.equal(E.verificaCoppie([['a', 'b']], ['a', 'b', 'c', 'd'], true), null);
  assert.equal(E.verificaCoppie([['a', 'b'], ['c', 'd']], ['a', 'b', 'c', 'd']), null);
  assert.throws(() => E.confermaCoppie(E.nuovoTorneo(), [['a', 'b'], ['b', 'c']]));
  // L'estrazione non riusa mai giocatori già bloccati.
  for (let seed = 1; seed < 50; seed++) {
    const pres = Array.from({ length: 16 }, (_, i) => 'g' + i);
    const bloccate = [['g0', 'g5'], ['g3', 'g9']];
    const { nuove } = E.formaCoppieCasuali(pres, bloccate, E.rng(seed));
    assert.equal(E.verificaCoppie([...bloccate, ...nuove], pres), null);
  }
});
