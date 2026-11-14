import test from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { differenze } from '../js/store.js';

const applica = (base, upd) => {
  const d = structuredClone(base);
  for (const [p, v] of Object.entries(upd)) {
    const k = p.split('/'); let o = d;
    for (let i = 0; i < k.length - 1; i++) { o[k[i]] = o[k[i]] || {}; o = o[k[i]]; }
    if (v === null) delete o[k.at(-1)]; else o[k.at(-1)] = v;
  }
  return d;
};
const torneo = () => {
  const t = E.nuovoTorneo();
  ['Vla', 'Pip', 'Pat', 'Nat', 'Mat', 'Lin', 'Seb', 'Sil'].forEach((n, i) => { t.players['g' + i] = { name: n, present: true }; });
  return t;
};

test('giocatoriDoppi trova chi è in più coppie', () => {
  const t = E.confermaCoppie(torneo(), [['g0', 'g1'], ['g2', 'g3'], ['g4', 'g5'], ['g6', 'g7']]);
  assert.deepEqual(E.giocatoriDoppi(t), []);
  t.pairs.C = { ...t.pairs.C, p1: 'g3' };
  assert.deepEqual(E.giocatoriDoppi(t), ['g3']);
});

test('la bozza con doppioni viene rilevata', () => {
  const t = torneo();
  t.draft.coppie = { a: { p1: 'g0', p2: 'g1' }, b: { p1: 'g1', p2: 'g2' } };
  assert.deepEqual(E.giocatoriDoppi(t), ['g1']);
});

test('conferma e avvio rifiutano i doppioni', () => {
  assert.throws(() => E.confermaCoppie(torneo(), [['g0', 'g1'], ['g1', 'g2']]));
  const t = E.confermaCoppie(torneo(), [['g0', 'g1'], ['g2', 'g3'], ['g4', 'g5'], ['g6', 'g7']]);
  t.pairs.D = { ...t.pairs.D, p2: 'g0' };
  assert.throws(() => E.avviaTorneo(t), /più di una coppia/);
});

test('due admin che salvano coppie diverse non mescolano le versioni', () => {
  const base = E.confermaCoppie(torneo(), [['g0', 'g1'], ['g2', 'g3'], ['g4', 'g5'], ['g6', 'g7']]);
  // A e B partono dallo stesso torneo e cambiano coppie in modo diverso, ognuno valido da solo
  const A = { ...base, pairs: { ...base.pairs, B: { ...base.pairs.B, p2: 'g5' }, C: { ...base.pairs.C, p2: 'g3' } } };
  const B = { ...base, pairs: { ...base.pairs, B: { ...base.pairs.B, p2: 'g7' }, D: { ...base.pairs.D, p2: 'g3' } } };
  assert.deepEqual(E.giocatoriDoppi(A), []); assert.deepEqual(E.giocatoriDoppi(B), []);
  let db = applica(base, differenze(base, A));
  db = applica(db, differenze(base, B));
  assert.deepEqual(E.giocatoriDoppi(E.normalizza(db)), []);
  assert.deepEqual(db.pairs, B.pairs);
});

test('due coppie: sfida allo stesso tavolo per tutti i turni', () => {
  for (const sistema of ['danese', 'danese_mod', 'italiana', 'mitchell']) {
    let t = E.confermaCoppie(torneo(), [['g0', 'g1'], ['g2', 'g3']]);
    for (const k of ['g4', 'g5', 'g6', 'g7']) t.players[k].present = false;
    t = { ...t, config: { ...t.config, sistema, turni: 3, smazzate: 4 } };
    assert.deepEqual(E.verificaAvvio(t), [], sistema);
    t = E.avviaTorneo(t);
    for (let n = 1; n <= 3; n++) {
      const r = t.rounds[n];
      assert.deepEqual(Object.values(r.tables).map((x) => [x.a, x.b].sort()), [['A', 'B']], `${sistema} turno ${n}`);
      assert.deepEqual(r.byes, {});
      const tav = Object.keys(r.tables)[0];
      t = { ...t, rounds: { ...t.rounds, [n]: { ...r, results: { [tav]: E.calcolaPartita(1500 - n * 100, 900, t.config.smazzate) } } } };
      t = E.chiudiTurno(t);
    }
    assert.equal(t.status, 'finished', sistema);
    const cl = E.classifica(t, 3);
    assert.equal(cl.length, 2);
  }
});

test('meno di 2 coppie non si avvia', () => {
  const t = E.confermaCoppie(torneo(), [['g0', 'g1']]);
  assert.ok(E.verificaAvvio(t).length);
});
