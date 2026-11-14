// Valori del regolamento, tenuti in un solo posto per poterli aggiornare facilmente.
// Fonti:
// - Tempi per turno: codice di gara FIBur Burraco italiano (edizione aprile 2024).
// - Tabelle V.P.: codice FIBur Burraco Internazionale (aprile 2024) e codice FGB (febbraio 2025),
//   identiche su questi valori.
// - Punteggio di riposo: codici FGB 2025 e ASC BurracoUp 2024 (DA VERIFICARE sul codice FIBur).
// - Scelta della coppia a riposo con sistema danese: codice ASC BurracoUp 2016
//   ("riposerà la penultima, terzultima ecc.").

export const SMAZZATE_AMMESSE = [2, 3, 4];

// Minuti per turno in base alle smazzate.
export const TEMPI = { 2: 25, 3: 32, 4: 42 };

// Riduzione massima dei tempi consentita all'organizzatore (minuti).
export const RIDUZIONE_MAX = 2;

// Tabelle V.P.: [differenza massima M.P. della fascia, V.P. della coppia che ha fatto più punti].
// L'altra coppia prende 20 meno quel valore.
export const TABELLE_VP = {
  4: [[100, 10], [300, 11], [500, 12], [700, 13], [900, 14], [1100, 15], [1300, 16], [1500, 17], [1700, 18], [2000, 19], [Infinity, 20]],
  3: [[50, 10], [150, 11], [250, 12], [350, 13], [500, 14], [650, 15], [800, 16], [1000, 17], [1250, 18], [1500, 19], [Infinity, 20]],
  2: [[40, 10], [120, 11], [200, 12], [300, 13], [400, 14], [500, 15], [620, 16], [740, 17], [870, 18], [1000, 19], [Infinity, 20]],
};

// Punteggio assegnato alla coppia a riposo.
export const RIPOSO = {
  4: { vp: 12, mp: 305 },
  3: { vp: 14, mp: 355 },
  2: { vp: 14, mp: 305 },
};

export const SISTEMI = {
  danese_mod: {
    nome: 'Danese modificato',
    descrizione: 'Si gioca contro chi ha una posizione vicina in classifica, ma non contro chi si è appena incontrato (salvo all\'ultimo turno).',
  },
  danese: {
    nome: 'Danese',
    descrizione: 'In base alla classifica: la prima contro la seconda, la terza contro la quarta, e così via.',
  },
  italiana: {
    nome: 'All\'italiana',
    descrizione: 'Ogni coppia incontra una volta tutte le altre, con un calendario fissato all\'inizio.',
  },
  mitchell: {
    nome: 'Mitchell',
    descrizione: 'Metà delle coppie resta sempre allo stesso tavolo, l\'altra metà avanza di un tavolo a ogni turno.',
  },
};

export const CRITERI_PARITA = [
  'Somma dei V.P.',
  'Somma dei M.P.',
  'Scontro diretto, se c\'è stato',
  'Partita vinta con il punteggio più alto',
  'Partita persa con il punteggio più favorevole',
  'Sorteggio',
];

export const FONTI = [
  'Codice di gara FIBur Burraco italiano, aprile 2024 (tempi dei turni)',
  'Codice di gara FIBur Burraco Internazionale, aprile 2024, e codice FGB, febbraio 2025 (tabelle V.P., criteri di parità)',
  'Codici FGB 2025 e ASC BurracoUp 2024 (punteggio di riposo)',
  'Codice ASC BurracoUp 2016 (coppia a riposo con sistema danese)',
];
