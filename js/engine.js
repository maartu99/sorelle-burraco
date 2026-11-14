// Logica pura del torneo: nessun accesso a Firebase o al DOM.
import { TABELLE_VP, RIPOSO, TEMPI, SISTEMI } from './regolamento.js';

export const GHOST = '__riposo__';

// ---------- Utilità ----------

export function lettera(i) {
  // A..Z, poi AA, AB...
  let s = '';
  i += 1;
  while (i > 0) {
    const r = (i - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

// Generatore pseudo-casuale con seme, per sorteggi ripetibili.
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mescola(arr, random = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const asList = (o) => (o ? Object.values(o) : []);

// ---------- Punteggi ----------

export function vpDaDifferenza(diff, smazzate) {
  const d = Math.abs(diff);
  for (const [max, vp] of TABELLE_VP[smazzate]) if (d <= max) return vp;
  return 20;
}

// Punti totali delle due coppie nel turno -> M.P. e V.P.
export function calcolaPartita(puntiA, puntiB, smazzate) {
  const mpA = puntiA - puntiB;
  const alto = vpDaDifferenza(mpA, smazzate);
  const basso = 20 - alto;
  return mpA >= 0
    ? { mpA, mpB: puntiB - puntiA, vpA: alto, vpB: basso }
    : { mpA, mpB: puntiB - puntiA, vpA: basso, vpB: alto };
}

export function durataTurnoMin(config) {
  return TEMPI[config.smazzate] - (config.riduzione || 0);
}

// ---------- Stato ----------

export function nuovoTorneo() {
  return {
    status: 'setup',
    config: {
      smazzate: 4, turni: 4, sistema: 'danese_mod', riduzione: 0,
      data: '', inizio: '21:00', spiegazione: 15, cambio: 5, premiazione: 10,
    },
    players: {},
    draft: {},
    pairs: {},
    order: [],
    rounds: {},
    seed: Math.floor(Math.random() * 2 ** 31),
  };
}

export function normalizza(t) {
  const base = nuovoTorneo();
  const out = { ...base, ...(t || {}) };
  out.config = { ...base.config, ...((t && t.config) || {}) };
  out.players = out.players || {};
  out.draft = out.draft || {};
  out.pairs = out.pairs || {};
  out.order = Array.isArray(out.order) ? out.order : asList(out.order);
  out.rounds = out.rounds || {};
  for (const r of Object.values(out.rounds)) {
    r.tables = r.tables || {};
    r.byes = r.byes || {};
    r.results = r.results || {};
  }
  return out;
}

export function nomeCoppia(t, id) {
  const p = t.pairs[id];
  if (!p) return id;
  const n1 = t.players[p.p1]?.name || '?';
  const n2 = t.players[p.p2]?.name || '?';
  return `${n1} e ${n2}`;
}

export function coppieAttive(t, turno) {
  // Una coppia ritirata "dal turno n" non gioca più dal turno n in poi.
  return t.order.filter((id) => {
    const w = t.pairs[id]?.ritiroDalTurno;
    return !w || turno < w;
  });
}

export function turniChiusi(t) {
  return Object.values(t.rounds).filter((r) => r.closed).map((r) => r.n).sort((a, b) => a - b);
}

// ---------- Limiti e suggerimenti ----------

export function maxTurni(sistema, nCoppie) {
  if (nCoppie < 3) return 0;
  const dispari = nCoppie % 2 === 1;
  if (sistema === 'italiana') return dispari ? nCoppie : nCoppie - 1;
  if (sistema === 'mitchell') return Math.ceil(nCoppie / 2);
  // Danese: con coppie dispari ogni coppia può riposare una sola volta.
  return dispari ? nCoppie : 20;
}

export function sistemaSuggerito(nCoppie, turni) {
  if (nCoppie >= 3 && turni === maxTurni('italiana', nCoppie)) return 'italiana';
  return 'danese_mod';
}

export function durataPrevista(config, nTurni) {
  const turno = durataTurnoMin(config);
  const tot = (config.spiegazione || 0) + nTurni * turno + Math.max(0, nTurni - 1) * (config.cambio || 0) + (config.premiazione || 0);
  return tot;
}

export function cronoprogramma(config, nTurni, inizioReale = {}) {
  // Restituisce gli orari previsti di inizio di ogni turno (minuti dalla mezzanotte).
  const [h, m] = (config.inizio || '21:00').split(':').map(Number);
  let t = h * 60 + m + (config.spiegazione || 0);
  const out = [];
  for (let n = 1; n <= nTurni; n++) {
    if (inizioReale[n] != null) t = inizioReale[n];
    out.push({ n, inizio: t, fine: t + durataTurnoMin(config) });
    t += durataTurnoMin(config) + (config.cambio || 0);
  }
  const ultimo = out[out.length - 1];
  const fineTorneo = (ultimo ? ultimo.fine : t) + (config.premiazione || 0);
  return { turni: out, fine: fineTorneo };
}

export function formatOra(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export function formatDurata(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

// ---------- Classifica ----------

function statistiche(t, finoAlTurno) {
  const sm = t.config.smazzate;
  const s = {};
  for (const id of t.order) {
    s[id] = { id, vp: 0, mp: 0, giocate: 0, riposi: 0, partite: [] };
  }
  const turni = Object.values(t.rounds)
    .filter((r) => r.closed && (!finoAlTurno || r.n <= finoAlTurno))
    .sort((a, b) => a.n - b.n);
  for (const r of turni) {
    for (const [tav, tb] of Object.entries(r.tables)) {
      const res = r.results[tav];
      if (!res) continue;
      const c = calcolaPartita(res.a, res.b, sm);
      if (s[tb.a]) {
        s[tb.a].vp += c.vpA; s[tb.a].mp += c.mpA; s[tb.a].giocate++;
        s[tb.a].partite.push({ turno: r.n, avv: tb.b, vp: c.vpA, mp: c.mpA });
      }
      if (s[tb.b]) {
        s[tb.b].vp += c.vpB; s[tb.b].mp += c.mpB; s[tb.b].giocate++;
        s[tb.b].partite.push({ turno: r.n, avv: tb.a, vp: c.vpB, mp: c.mpB });
      }
    }
    for (const id of Object.keys(r.byes)) {
      if (!s[id]) continue;
      s[id].vp += RIPOSO[sm].vp; s[id].mp += RIPOSO[sm].mp; s[id].riposi++;
    }
  }
  return s;
}

// Criteri di parità a pari V.P. e M.P. Interpretazione dei codici:
// - scontro diretto: chi ha preso più V.P. nella partita tra le coppie (per gruppi di 3 o più,
//   somma dei V.P. negli scontri tra loro, solo se si sono incontrate tutte);
// - partita vinta con il punteggio più alto: miglior V.P. (poi M.P.) tra le partite vinte;
// - partita persa con il punteggio più favorevole: miglior V.P. (poi M.P.) tra le partite perse;
// - sorteggio: con seme fisso del torneo, quindi sempre lo stesso risultato.
const CRITERI = [
  {
    nome: 'scontro diretto',
    chiave(st, gruppo) {
      const ids = new Set(gruppo.map((g) => g.id));
      if (gruppo.length > 2) {
        // Tutti devono essersi incontrati.
        for (const g of gruppo) {
          const avv = new Set(g.partite.map((p) => p.avv));
          for (const o of gruppo) if (o.id !== g.id && !avv.has(o.id)) return null;
        }
      }
      const m = new Map();
      for (const g of gruppo) {
        const vs = g.partite.filter((p) => ids.has(p.avv));
        if (!vs.length) return null;
        m.set(g.id, [vs.reduce((a, p) => a + p.vp, 0)]);
      }
      return m;
    },
  },
  {
    nome: 'partita vinta con il punteggio più alto',
    chiave(st, gruppo) {
      const m = new Map();
      for (const g of gruppo) {
        const v = g.partite.filter((p) => p.vp > 10).sort((a, b) => b.vp - a.vp || b.mp - a.mp)[0];
        m.set(g.id, v ? [v.vp, v.mp] : [-1, -Infinity]);
      }
      return m;
    },
  },
  {
    nome: 'partita persa con il punteggio più favorevole',
    chiave(st, gruppo) {
      const m = new Map();
      for (const g of gruppo) {
        const v = g.partite.filter((p) => p.vp < 10).sort((a, b) => b.vp - a.vp || b.mp - a.mp)[0];
        // Chi non ha mai perso è davanti.
        m.set(g.id, v ? [v.vp, v.mp] : [99, Infinity]);
      }
      return m;
    },
  },
  {
    nome: 'sorteggio',
    chiave(st, gruppo, seed) {
      const m = new Map();
      for (const g of gruppo) m.set(g.id, [hashStr(`${seed}:${g.id}`)]);
      return m;
    },
  },
];

function confronta(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (b[i] ?? 0) > (a[i] ?? 0) ? 1 : -1;
  }
  return 0;
}

function risolvi(gruppo, criterio, st, seed, decisi) {
  if (gruppo.length < 2 || criterio >= CRITERI.length) return gruppo;
  const crit = CRITERI[criterio];
  const chiavi = crit.chiave(st, gruppo, seed);
  if (!chiavi) return risolvi(gruppo, criterio + 1, st, seed, decisi);
  const ord = gruppo.slice().sort((x, y) => confronta(chiavi.get(x.id), chiavi.get(y.id)));
  // Suddivide in sottogruppi a pari chiave.
  const out = [];
  let i = 0;
  const separato = new Set(ord.map((g) => JSON.stringify(chiavi.get(g.id)))).size > 1;
  while (i < ord.length) {
    let j = i + 1;
    while (j < ord.length && confronta(chiavi.get(ord[i].id), chiavi.get(ord[j].id)) === 0) j++;
    const sotto = ord.slice(i, j);
    if (separato) for (const g of sotto) if (!decisi[g.id]) decisi[g.id] = crit.nome;
    out.push(...risolvi(sotto, criterio + 1, st, seed, decisi));
    i = j;
  }
  return out;
}

export function classifica(t, finoAlTurno) {
  const st = statistiche(t, finoAlTurno);
  const tutti = Object.values(st).sort((a, b) => b.vp - a.vp || b.mp - a.mp);
  const decisi = {};
  const out = [];
  let i = 0;
  while (i < tutti.length) {
    let j = i + 1;
    while (j < tutti.length && tutti[j].vp === tutti[i].vp && tutti[j].mp === tutti[i].mp) j++;
    out.push(...risolvi(tutti.slice(i, j), 0, st, t.seed, decisi));
    i = j;
  }
  return out.map((r, k) => ({
    ...r,
    pos: k + 1,
    decisoDa: decisi[r.id] || null,
    ritirata: !!t.pairs[r.id]?.ritiroDalTurno,
  }));
}

// ---------- Abbinamenti ----------

// Calendario all'italiana con il metodo del cerchio.
export function calendarioItaliana(ids) {
  const lista = ids.slice();
  if (lista.length % 2 === 1) lista.push(GHOST);
  const n = lista.length;
  const giri = [];
  let rot = lista.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const giro = [];
    const cerchio = [lista[0], ...rot];
    for (let i = 0; i < n / 2; i++) giro.push([cerchio[i], cerchio[n - 1 - i]]);
    giri.push(giro);
    rot = [rot[rot.length - 1], ...rot.slice(0, -1)];
  }
  return giri;
}

export function schemaMitchell(ids, turno) {
  const lista = ids.slice();
  if (lista.length % 2 === 1) lista.push(GHOST);
  const k = lista.length / 2;
  const fisse = lista.slice(0, k);
  const mobili = lista.slice(k);
  const tavoli = [];
  for (let tav = 0; tav < k; tav++) {
    const m = mobili[((tav - (turno - 1)) % k + k) % k];
    tavoli.push([fisse[tav], m]);
  }
  return tavoli;
}

function avversarioPrecedente(t, turno) {
  const r = t.rounds[turno - 1];
  const m = {};
  if (!r) return m;
  for (const tb of Object.values(r.tables)) { m[tb.a] = tb.b; m[tb.b] = tb.a; }
  return m;
}

function riposati(t, primaDel) {
  const s = new Set();
  for (const r of Object.values(t.rounds)) {
    if (r.n < primaDel) for (const id of Object.keys(r.byes)) s.add(id);
  }
  return s;
}

function accoppiaInOrdine(lista, vietati) {
  // Accoppia in ordine di classifica evitando le coppie vietate, con ricerca all'indietro.
  if (!lista.length) return [];
  const [primo, ...resto] = lista;
  for (let i = 0; i < resto.length; i++) {
    if (vietati && vietati[primo] === resto[i]) continue;
    const sotto = accoppiaInOrdine(resto.filter((_, k) => k !== i), vietati);
    if (sotto) return [[primo, resto[i]], ...sotto];
  }
  return null;
}

// Restituisce { tables: {1:{a,b}}, byes: {id: motivo}, avvisi: [] }
export function generaTurno(t, turno) {
  const sistema = t.config.sistema;
  const avvisi = [];
  const tables = {};
  const byes = {};
  const attive = new Set(coppieAttive(t, turno));
  let coppie = [];

  if (sistema === 'italiana' || sistema === 'mitchell') {
    const schema = sistema === 'italiana'
      ? (calendarioItaliana(t.order)[turno - 1] || [])
      : schemaMitchell(t.order, turno);
    for (const [x, y] of schema) {
      const xa = x !== GHOST && attive.has(x);
      const ya = y !== GHOST && attive.has(y);
      if (xa && ya) coppie.push([x, y]);
      else if (xa) byes[x] = y === GHOST ? 'dispari' : 'ritiro';
      else if (ya) byes[y] = x === GHOST ? 'dispari' : 'ritiro';
    }
  } else {
    let ordine;
    if (turno === 1) ordine = t.order.filter((id) => attive.has(id));
    else ordine = classifica(t, turno - 1).map((r) => r.id).filter((id) => attive.has(id));
    if (ordine.length % 2 === 1) {
      let bye;
      if (turno === 1) bye = ordine[ordine.length - 1];
      else {
        const gia = riposati(t, turno);
        bye = [...ordine].reverse().find((id) => !gia.has(id));
        if (!bye) {
          bye = ordine[ordine.length - 1];
          avvisi.push('Tutte le coppie hanno già riposato: riposa di nuovo l\'ultima in classifica.');
        }
      }
      byes[bye] = 'dispari';
      ordine = ordine.filter((id) => id !== bye);
    }
    const ultimo = turno >= t.config.turni;
    const vietati = sistema === 'danese_mod' && turno > 1 && !ultimo ? avversarioPrecedente(t, turno) : null;
    let acc = accoppiaInOrdine(ordine, vietati);
    if (!acc) {
      acc = accoppiaInOrdine(ordine, null);
      avvisi.push('Non è stato possibile evitare un incontro del turno precedente.');
    }
    coppie = acc;
  }

  coppie.forEach(([a, b], i) => { tables[i + 1] = { a, b }; });
  return { tables, byes, avvisi };
}

// ---------- Azioni (restituiscono un nuovo stato) ----------

export function formaCoppieCasuali(presenti, bloccate = [], random = Math.random) {
  // bloccate: [[p1,p2], ...] già formate a mano.
  const usati = new Set(bloccate.flat());
  const liberi = mescola(presenti.filter((p) => !usati.has(p)), random);
  const nuove = [];
  for (let i = 0; i + 1 < liberi.length; i += 2) nuove.push([liberi[i], liberi[i + 1]]);
  const avanzati = liberi.length % 2 ? [liberi[liberi.length - 1]] : [];
  return { nuove, avanzati };
}

// Controlla che ogni giocatore sia in una sola coppia e che le coppie siano di due persone presenti.
// Con soloDoppioni, ignora i giocatori presenti ancora da abbinare.
export function verificaCoppie(coppie, presenti, soloDoppioni = false) {
  const visti = new Map();
  for (const [p1, p2] of coppie) {
    if (!p1 || !p2 || p1 === p2) return 'C\'è una coppia non valida.';
    for (const p of [p1, p2]) visti.set(p, (visti.get(p) || 0) + 1);
  }
  const doppi = [...visti.entries()].filter(([, n]) => n > 1).map(([p]) => p);
  if (doppi.length) return `${doppi.length === 1 ? 'Un giocatore è' : `${doppi.length} giocatori sono`} in più di una coppia.`;
  const pres = new Set(presenti);
  if ([...visti.keys()].some((p) => !pres.has(p))) return 'C\'è una coppia con un giocatore non presente.';
  if (!soloDoppioni && presenti.some((p) => !visti.has(p))) return 'Ci sono giocatori presenti senza coppia.';
  return null;
}

// Conferma le coppie: assegna le lettere e un ordine casuale (seme del torneo).
export function confermaCoppie(t, coppie) {
  const err = verificaCoppie(coppie, coppie.flat());
  if (err) throw new Error(err);
  const pairs = {};
  coppie.forEach(([p1, p2], i) => {
    const id = lettera(i);
    pairs[id] = { id, p1, p2 };
  });
  const order = mescola(Object.keys(pairs), rng(t.seed));
  return { ...t, pairs, order };
}

export function verificaAvvio(t) {
  const n = t.order.length;
  const errori = [];
  if (n < 3) errori.push('Servono almeno 3 coppie.');
  const max = maxTurni(t.config.sistema, n);
  if (t.config.turni < 1) errori.push('Serve almeno un turno.');
  if (t.config.turni > max) errori.push(`Con ${n} coppie e il sistema ${SISTEMI[t.config.sistema].nome} si possono fare al massimo ${max} turni.`);
  return errori;
}

// Giocatori presenti in più di una coppia (tra le coppie attive e nella bozza).
// Restituisce gli id dei giocatori doppi: deve essere sempre vuoto.
export function giocatoriDoppi(t) {
  const doppi = new Set();
  const controlla = (coppie) => {
    const visti = new Set();
    for (const c of coppie) for (const p of [c.p1, c.p2]) { if (!p) continue; if (visti.has(p)) doppi.add(p); visti.add(p); }
  };
  const attive = (t.order || []).filter((id) => t.pairs[id] && !t.pairs[id].ritiroDalTurno).map((id) => t.pairs[id]);
  controlla(attive.length ? attive : Object.values(t.pairs || {}));
  controlla(Object.values((t.draft && t.draft.coppie) || {}));
  return [...doppi];
}

export function avviaTorneo(t) {
  if (giocatoriDoppi(t).length) throw new Error('Un giocatore è in più di una coppia: correggi le coppie prima di avviare.');
  const errori = verificaAvvio(t);
  if (errori.length) throw new Error(errori.join(' '));
  const g = generaTurno(t, 1);
  return {
    ...t,
    status: 'running',
    rounds: { 1: { n: 1, tables: g.tables, byes: g.byes, results: {}, closed: false, avvisi: g.avvisi } },
  };
}

export function turnoCorrente(t) {
  const ns = Object.keys(t.rounds).map(Number);
  return ns.length ? Math.max(...ns) : 0;
}

export function risultatiMancanti(r) {
  return Object.keys(r.tables).filter((k) => !r.results[k]).length;
}

export function chiudiTurno(t) {
  const n = turnoCorrente(t);
  const r = t.rounds[n];
  if (!r || r.closed) throw new Error('Nessun turno aperto.');
  if (risultatiMancanti(r)) throw new Error('Mancano dei risultati.');
  const rounds = { ...t.rounds, [n]: { ...r, closed: true } };
  let next = { ...t, rounds };
  if (n >= t.config.turni) return { ...next, status: 'finished' };
  const g = generaTurno(next, n + 1);
  rounds[n + 1] = { n: n + 1, tables: g.tables, byes: g.byes, results: {}, closed: false, avvisi: g.avvisi };
  return next;
}

// Ritiro di una coppia a torneo iniziato: non gioca più dal turno indicato.
export function ritiraCoppia(t, id) {
  const n = turnoCorrente(t);
  const r = t.rounds[n];
  const pairs = { ...t.pairs, [id]: { ...t.pairs[id], ritiroDalTurno: r && !r.closed ? n : n + 1 } };
  let out = { ...t, pairs };
  // Se il turno in corso è aperto e la coppia non ha ancora un risultato, si rigenera il turno
  // solo se nessun risultato è stato inserito; altrimenti l'avversario prende il riposo.
  if (r && !r.closed) {
    const nessunRisultato = Object.keys(r.results).length === 0;
    if (nessunRisultato && t.config.sistema.startsWith('danese')) {
      const g = generaTurno(out, n);
      out = { ...out, rounds: { ...out.rounds, [n]: { ...r, tables: g.tables, byes: g.byes, avvisi: g.avvisi } } };
    } else {
      const tables = {};
      const byes = { ...r.byes };
      let k = 1;
      const results = {};
      for (const [tav, tb] of Object.entries(r.tables)) {
        if (tb.a === id) byes[tb.b] = 'ritiro';
        else if (tb.b === id) byes[tb.a] = 'ritiro';
        else { tables[k] = tb; if (r.results[tav]) results[k] = r.results[tav]; k++; }
      }
      delete byes[id];
      out = { ...out, rounds: { ...out.rounds, [n]: { ...r, tables, byes, results } } };
    }
  }
  return out;
}

export function avvisoRiposiRitiro(t) {
  // Con coppie dispari dopo un ritiro, verifica se restano abbastanza coppie mai a riposo.
  const n = turnoCorrente(t);
  const restanti = t.config.turni - n;
  if (restanti <= 0) return null;
  const att = coppieAttive(t, n + 1);
  if (att.length % 2 === 0) return null;
  const gia = riposati(t, n + 1);
  const libere = att.filter((id) => !gia.has(id)).length;
  if (libere < restanti) return `Restano ${restanti} turni ma solo ${libere} coppie non hanno ancora riposato: qualcuna dovrà riposare due volte. Valuta di ridurre i turni.`;
  return null;
}

// ---------- Timer ----------

export function tempoResiduoMs(timer, now) {
  if (!timer || !timer.durataMs) return null;
  if (!timer.startedAt) return timer.durataMs;
  const pausa = (timer.pausedMs || 0) + (timer.pausedAt ? now - timer.pausedAt : 0);
  return timer.durataMs - (now - timer.startedAt - pausa);
}
