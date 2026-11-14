import * as E from './engine.js';
import { TEMPI, SISTEMI, TABELLE_VP, RIPOSO, CRITERI_PARITA, FONTI, RIDUZIONE_MAX, SMAZZATE_AMMESSE } from './regolamento.js';
import { creaStore } from './store.js';
import { OMINO, MARCHIO, ICONE, GOOGLE, SEMI } from './grafica.js';

// ================= Stato =================
const S = {
  store: null,
  user: null,
  view: 'caricamento',
  tornei: [],
  tid: null,
  meta: {},
  members: {},
  data: null,
  tab: 'turno',
  setupTab: 'torneo',
  storicoTab: 'storico',
  login: { modo: 'accedi', errore: '' },
  selezione: null,
  sheet: null,
  offLista: null,
  offTorneo: null,
  codiceInSospeso: null,
  allarmi: {},
};

const $app = document.getElementById('app');
const $foglio = document.getElementById('foglio');

// ================= Utilità =================
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (n > 0 ? '+' : '') + new Intl.NumberFormat('it-IT').format(n);
const fmtN = (n) => new Intl.NumberFormat('it-IT').format(n);
const isAdmin = () => !!(S.user && S.members[S.user.uid]?.role === 'admin');
const nuovoId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function erroreLeggibile(e) {
  const c = e && e.code;
  const m = {
    'auth/invalid-email': 'Indirizzo email non valido.',
    'auth/invalid-credential': 'Email o password non corrette.',
    'auth/wrong-password': 'Email o password non corrette.',
    'auth/user-not-found': 'Nessun account con questa email.',
    'auth/email-already-in-use': 'Esiste già un account con questa email.',
    'auth/weak-password': 'La password deve avere almeno 6 caratteri.',
    'auth/popup-closed-by-user': 'Accesso annullato.',
    'auth/network-request-failed': 'Connessione assente. Riprova.',
    'auth/too-many-requests': 'Troppi tentativi. Riprova tra qualche minuto.',
    PERMISSION_DENIED: 'Non hai i permessi per questa operazione.',
  };
  return m[c] || (e && e.message && !e.message.startsWith('Firebase') ? e.message : 'Qualcosa non ha funzionato. Riprova.');
}

function nomiCoppia(id) {
  const t = S.data;
  const p = t.pairs[id];
  if (!p) return '';
  return `${esc(t.players[p.p1]?.name || '?')} e ${esc(t.players[p.p2]?.name || '?')}`;
}

function miaCoppia() {
  const pid = S.user && S.members[S.user.uid]?.player;
  if (!pid || !S.data) return null;
  return Object.values(S.data.pairs).find((p) => p.p1 === pid || p.p2 === pid)?.id || null;
}

function giocatoriPresenti() {
  return Object.entries(S.data.players).filter(([, p]) => p.present).map(([id]) => id);
}

function nCoppiePreviste() {
  const n = Object.keys(S.data.pairs).length;
  return n || Math.floor(giocatoriPresenti().length / 2);
}

// ================= Salvataggio =================
async function salva(nuovo, metaPatch) {
  const prima = S.data;
  S.data = E.normalizza(nuovo);
  render();
  try {
    await S.store.saveData(S.tid, prima, S.data);
    const patch = {
      status: S.data.status,
      turno: E.turnoCorrente(S.data),
      turni: S.data.config.turni,
      coppie: Object.keys(S.data.pairs).length,
      data: S.data.config.data || '',
      ...(metaPatch || {}),
    };
    const cambia = Object.entries(patch).some(([k, v]) => S.meta[k] !== v);
    if (cambia) await S.store.updateMeta(S.tid, patch);
  } catch (e) {
    toast(erroreLeggibile(e));
  }
}

// ================= Render principale =================
function render() {
  const att = document.activeElement;
  const focusId = att && att.id && $app.contains(att) ? att.id : null;
  const sel = focusId && 'selectionStart' in att ? [att.selectionStart, att.selectionEnd] : null;
  const scrollY = window.scrollY;

  let html = '';
  if (S.view === 'caricamento') html = `<div class="contenuto senza-nav"><p class="testo-muto">Caricamento...</p></div>`;
  else if (S.view === 'login') html = vistaLogin();
  else if (S.view === 'home') html = vistaHome();
  else if (S.view === 'torneo') html = vistaTorneo();
  $app.innerHTML = html;

  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) { el.focus({ preventScroll: true }); if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* */ } }
  }
  window.scrollTo(0, scrollY);
  aggiornaTimer();
}

// ================= Login =================
function vistaLogin() {
  const prova = S.store.mode === 'prova';
  const l = S.login;
  const hero = `<div class="hero"><div class="forma-rossa"></div>${OMINO}
    <div class="fascia"><h1 class="titolo">Sorelle Burraco</h1><p class="etichetta" style="color:var(--ink)">Tornei di burraco a coppie</p></div></div>`;
  if (prova) {
    return `<div class="contenuto senza-nav">${hero}
      <div class="avviso info"><strong>Modalità prova</strong><span>Firebase non è ancora collegato: i dati restano solo su questo browser.</span></div>
      <div class="scheda in-evidenza">
        <div class="campo"><label for="prova-nome">Il tuo nome</label><input id="prova-nome" class="input" autocomplete="name" maxlength="40" placeholder="Es. Natasha"></div>
        <button class="btn primario blocco" data-azione="entra-prova">Entra ${ICONE.freccia}</button>
      </div>${SEMI}</div>`;
  }
  const crea = l.modo === 'crea';
  return `<div class="contenuto senza-nav">${hero}
    <div class="scheda in-evidenza">
      <h2 class="titolo-s">${crea ? 'Crea un account' : 'Accedi'}</h2>
      <button class="btn blocco" data-azione="google">${GOOGLE.replace('<svg', '<svg width="20" height="20"')} Accedi con Google</button>
      <div class="separatore"><span class="etichetta">oppure</span></div>
      ${crea ? `<div class="campo"><label for="l-nome">Nome</label><input id="l-nome" class="input" autocomplete="name" maxlength="40"></div>` : ''}
      <div class="campo"><label for="l-email">Email</label><input id="l-email" class="input" type="email" autocomplete="email" inputmode="email"></div>
      <div class="campo"><label for="l-pw">Password</label><input id="l-pw" class="input" type="password" autocomplete="${crea ? 'new-password' : 'current-password'}"></div>
      ${l.errore ? `<div class="avviso">${esc(l.errore)}</div>` : ''}
      <button class="btn primario blocco" data-azione="${crea ? 'crea-account' : 'accedi'}">${crea ? 'Crea account' : 'Accedi'} ${ICONE.freccia}</button>
      <div class="riga spazio">
        <button class="link" data-azione="modo-login">${crea ? 'Ho già un account' : 'Crea un account'}</button>
        ${crea ? '' : '<button class="link" data-azione="reset-pw">Password dimenticata?</button>'}
      </div>
    </div>${SEMI}</div>`;
}

// ================= Home =================
function statoTorneo(m) {
  if (m.status === 'finished') return '<span class="tag muto">Concluso</span>';
  if (m.status === 'running') return `<span class="tag rosso">In corso - turno ${m.turno} di ${m.turni}</span>`;
  return '<span class="tag giallo">Da iniziare</span>';
}

function vistaHome() {
  const lista = S.tornei.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return `<header class="testata">${MARCHIO}<h1>Sorelle Burraco</h1>
      <button class="icona-btn" data-azione="esci" aria-label="Esci">${ICONE.esci}</button></header>
    <div class="contenuto senza-nav">
      <div class="hero compatto"><div class="forma-rossa"></div>${OMINO}
        <div class="fascia"><h2 class="titolo">I miei tornei</h2><p class="etichetta" style="color:var(--ink)">Ciao ${esc(S.user.name)}</p></div></div>
      <div class="griglia-2">
        <button class="btn primario" data-azione="apri-crea">${ICONE.piu} Crea torneo</button>
        <button class="btn blu" data-azione="apri-entra">Entra con codice</button>
      </div>
      ${lista.length ? lista.map((m) => `
        <button class="scheda ${m.status === 'running' ? 'in-evidenza' : ''}" style="text-align:left" data-azione="apri-torneo" data-tid="${esc(m.tid)}">
          <div class="riga spazio">${statoTorneo(m)}<span class="tag ${m.role === 'admin' ? 'blu' : 'muto'}">${m.role === 'admin' ? 'Admin' : 'Partecipante'}</span></div>
          <h3 class="titolo-s">${esc(m.name)}</h3>
          <p class="testo-muto">${m.data ? esc(new Date(m.data + 'T12:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })) + ' - ' : ''}${m.coppie ? `${m.coppie} coppie` : 'Coppie da formare'}</p>
        </button>`).join('') : `<div class="scheda crema"><p>Non hai ancora tornei. Creane uno, oppure entra con il codice che ti ha mandato chi organizza.</p></div>`}
      ${S.store.mode === 'prova' ? '<p class="piede">Modalità prova: i dati restano su questo browser.</p>' : ''}
    </div>`;
}

// ================= Torneo =================
function vistaTorneo() {
  if (!S.data) return `<div class="contenuto senza-nav"><p class="testo-muto">Caricamento torneo...</p></div>`;
  const tabs = [['turno', 'Turno', ICONE.turno], ['classifica', 'Classifica', ICONE.classifica], ['storico', 'Storico', ICONE.storico], ['altro', 'Altro', ICONE.altro]];
  let corpo = '';
  if (S.tab === 'turno') corpo = S.data.status === 'setup' ? vistaSetup() : S.data.status === 'finished' ? vistaFinale() : vistaTurno();
  else if (S.tab === 'classifica') corpo = vistaClassifica();
  else if (S.tab === 'storico') corpo = vistaStorico();
  else corpo = vistaAltro();
  return `<header class="testata">
      <button class="icona-btn" data-azione="home" aria-label="Torna ai tornei">${ICONE.indietro}</button>
      <h1>${esc(S.meta.name || 'Torneo')}</h1>
      <span class="tag ${isAdmin() ? 'blu' : 'muto'}">${isAdmin() ? 'Admin' : 'Partecipante'}</span>
    </header>
    <main class="contenuto">${corpo}</main>
    <nav class="nav">${tabs.map(([k, l, i]) => `<button class="${S.tab === k ? 'attivo' : ''}" data-azione="tab" data-tab="${k}">${i}${l}</button>`).join('')}</nav>`;
}

// ---------- Preparazione ----------
function vistaSetup() {
  if (!isAdmin()) {
    const pres = giocatoriPresenti().length;
    const conf = Object.keys(S.data.pairs).length;
    return `<div class="scheda gialla in-evidenza"><p class="etichetta" style="color:var(--ink)">In preparazione</p>
        <h2 class="titolo">Il torneo non è ancora iniziato</h2>
        <p>Quando l'organizzazione avvia il torneo, qui compaiono tavoli, timer e risultati.</p></div>
      <div class="scheda"><p class="etichetta">Giocatori presenti</p><p class="punteggio num">${pres}</p></div>
      ${conf ? `<div class="scheda"><p class="etichetta">Coppie</p>${elencoCoppie()}</div>` : ''}`;
  }
  const passi = [['torneo', 'Torneo'], ['giocatori', 'Giocatori'], ['coppie', 'Coppie']];
  let c = '';
  if (S.setupTab === 'torneo') c = setupTorneo();
  else if (S.setupTab === 'giocatori') c = setupGiocatori();
  else c = setupCoppie();
  return `<div class="segmenti">${passi.map(([k, l], i) => `<button class="${S.setupTab === k ? 'attivo' : ''}" data-azione="setup-tab" data-tab="${k}">${i + 1}. ${l}</button>`).join('')}</div>${c}`;
}

function setupTorneo() {
  const c = S.data.config;
  const n = nCoppiePreviste();
  const max = E.maxTurni(c.sistema, n);
  const sugg = E.sistemaSuggerito(n, c.turni);
  const durata = E.durataPrevista(c, c.turni);
  const crono = E.cronoprogramma(c, c.turni);
  const errTurni = n >= 3 && c.turni > max;
  return `
    <div class="scheda">
      <div class="campo"><label for="cfg-nome">Nome del torneo</label><input id="cfg-nome" class="input" maxlength="80" value="${esc(S.meta.name)}" data-campo="nome"></div>
      <div class="griglia-2">
        <div class="campo"><label for="cfg-data">Data</label><input id="cfg-data" class="input" type="date" value="${esc(c.data)}" data-campo="data"></div>
        <div class="campo"><label for="cfg-ora">Inizio</label><input id="cfg-ora" class="input" type="time" value="${esc(c.inizio)}" data-campo="inizio"></div>
      </div>
    </div>
    <div class="scheda">
      <p class="etichetta">Smazzate per turno</p>
      <div class="segmenti">${SMAZZATE_AMMESSE.map((s) => `<button class="${c.smazzate === s ? 'attivo' : ''}" data-azione="cfg" data-k="smazzate" data-v="${s}">${s}<small>${TEMPI[s]} minuti</small></button>`).join('')}</div>
      <p class="etichetta">Riduzione del tempo</p>
      <div class="segmenti">${Array.from({ length: RIDUZIONE_MAX + 1 }, (_, r) => `<button class="${(c.riduzione || 0) === r ? 'attivo' : ''}" data-azione="cfg" data-k="riduzione" data-v="${r}">${r ? `-${r} min` : 'Nessuna'}</button>`).join('')}</div>
      <p class="testo-muto">Il regolamento permette di ridurre il tempo fino a 2 minuti, avvisando all'inizio del torneo.</p>
    </div>
    <div class="scheda">
      <p class="etichetta">Numero di turni</p>
      <div class="stepper"><button data-azione="turni" data-d="-1" aria-label="Meno turni">-</button><output class="num">${c.turni}</output><button data-azione="turni" data-d="1" aria-label="Più turni">+</button></div>
      ${n >= 3 ? `<p class="testo-muto">Con ${n} coppie e il sistema scelto: massimo ${max >= 20 ? 'senza limite pratico' : max + ' turni'}.</p>` : '<p class="testo-muto">Il massimo dipende dal numero di coppie, che si conosce dopo le presenze.</p>'}
      ${errTurni ? `<div class="avviso">Troppi turni per ${SISTEMI[c.sistema].nome} con ${n} coppie: al massimo ${max}.</div>` : ''}
    </div>
    <div class="scheda">
      <p class="etichetta">Sistema di abbinamento</p>
      ${Object.entries(SISTEMI).map(([k, s]) => {
        const mk = E.maxTurni(k, n);
        const ok = n < 3 || c.turni <= mk;
        return `<button class="opzione" role="radio" aria-checked="${c.sistema === k}" data-azione="cfg" data-k="sistema" data-v="${k}">
          <span class="rombo"></span><span class="colonna cresce"><span class="riga spazio"><strong>${s.nome}</strong>${n >= 3 && k === sugg ? '<span class="tag verde">Consigliato</span>' : ''}</span>
          <span class="testo-muto">${s.descrizione}${n >= 3 && !ok ? ` Con ${n} coppie: massimo ${mk} turni.` : ''}</span></span></button>`;
      }).join('')}
    </div>
    <div class="scheda gialla in-evidenza">
      <p class="etichetta" style="color:var(--ink)">Durata prevista</p>
      <p class="titolo num">circa ${E.formatDurata(durata)}</p>
      <p>Fine prevista alle ${E.formatOra(crono.fine)}. Turni da ${E.durataTurnoMin(c)} minuti, ${c.cambio} minuti tra un turno e l'altro, ${c.spiegazione} di spiegazione iniziale e ${c.premiazione} di premiazione.</p>
    </div>`;
}

function setupGiocatori() {
  const pl = Object.entries(S.data.players).sort((a, b) => a[1].name.localeCompare(b[1].name, 'it'));
  const pres = pl.filter(([, p]) => p.present).length;
  const bloccate = Object.keys(S.data.pairs).length > 0;
  return `
    <div class="scheda"><div class="riga spazio"><p class="etichetta">Giocatori</p><span class="num"><strong>${pres}</strong> presenti su ${pl.length} iscritti</span></div>
      ${bloccate ? '<div class="avviso info">Le coppie sono confermate: iscritti e presenze sono bloccati.</div>' : `
      <div class="riga"><input id="nuovo-giocatore" class="input cresce" maxlength="40" placeholder="Nome e cognome" autocomplete="off" enterkeyhint="done">
      <button class="btn giallo" data-azione="aggiungi-giocatore" aria-label="Aggiungi">${ICONE.piu}</button></div>`}
    </div>
    ${pres % 2 === 1 ? '<div class="avviso"><strong>Numero di giocatori dispari</strong><span>Aggiungi un sostituto o togli un giocatore per formare le coppie.</span></div>' : ''}
    ${pl.length ? `<div class="elenco">${pl.map(([id, p]) => `
      <div class="voce ${p.present ? '' : 'spento'}"><span class="cresce">${esc(p.name)}</span>
        ${bloccate ? '' : `<button class="icona-btn" data-azione="rimuovi-giocatore" data-id="${id}" aria-label="Rimuovi ${esc(p.name)}">${ICONE.cestino}</button>`}
        <button class="interruttore" role="switch" aria-checked="${!!p.present}" aria-label="Presente" data-azione="presenza" data-id="${id}" ${bloccate ? 'disabled' : ''}></button>
      </div>`).join('')}</div>` : '<p class="testo-muto">Aggiungi gli iscritti. Il giorno del torneo segna chi è presente.</p>'}
    <button class="btn primario blocco" data-azione="setup-tab" data-tab="coppie" ${pres < 6 || pres % 2 ? 'disabled' : ''}>Forma le coppie ${ICONE.freccia}</button>
    ${pres < 6 ? '<p class="testo-muto">Servono almeno 6 giocatori presenti (3 coppie).</p>' : ''}`;
}

function elencoCoppie() {
  return `<div class="elenco">${S.data.order.slice().sort().map((id) => `
    <div class="voce ${S.data.pairs[id].ritiroDalTurno ? 'spento' : ''} ${miaCoppia() === id ? 'mia' : ''}"><span class="tag giallo">Coppia ${id}</span><span class="cresce">${nomiCoppia(id)}</span>
    ${S.data.pairs[id].ritiroDalTurno ? '<span class="tag muto">Ritirata</span>' : ''}</div>`).join('')}</div>`;
}

function setupCoppie() {
  const t = S.data;
  if (Object.keys(t.pairs).length) {
    const err = E.verificaAvvio(t);
    return `<div class="avviso ok"><strong>Coppie confermate</strong><span>${t.order.length} coppie${t.order.length % 2 ? ': a ogni turno una coppia riposa' : ''}.</span></div>
      ${elencoCoppie()}
      ${err.length ? `<div class="avviso">${err.map(esc).join('<br>')}<br>Correggi nella scheda "Torneo".</div>` : ''}
      <div class="scheda gialla in-evidenza"><p><strong>${SISTEMI[t.config.sistema].nome}</strong>, ${t.config.turni} turni da ${t.config.smazzate} smazzate (${E.durataTurnoMin(t.config)} minuti).</p>
      <button class="btn primario blocco" data-azione="avvia" ${err.length ? 'disabled' : ''}>Avvia il torneo ${ICONE.freccia}</button></div>
      <button class="btn blocco" data-azione="sblocca-coppie">Modifica le coppie</button>`;
  }
  const pres = giocatoriPresenti();
  const draft = Object.values(t.draft.coppie || {});
  const usati = new Set(draft.flatMap((c) => [c.p1, c.p2]));
  const liberi = pres.filter((id) => !usati.has(id));
  const modo = t.draft.modo || 'casuale';
  const nomi = (id) => esc(t.players[id]?.name || '?');
  return `
    <div class="segmenti">${[['casuale', 'Casuale'], ['manuale', 'Manuale'], ['mista', 'Mista']].map(([k, l]) => `<button class="${modo === k ? 'attivo' : ''}" data-azione="modo-coppie" data-v="${k}">${l}</button>`).join('')}</div>
    <p class="testo-muto">${modo === 'casuale' ? 'Tutte le coppie vengono estratte a sorte.' : modo === 'manuale' ? 'Tocca due giocatori per formare una coppia.' : 'Forma a mano le coppie che vuoi fissare, poi estrai a sorte le altre.'}</p>
    ${liberi.length ? `<div class="scheda"><p class="etichetta">Da abbinare (${liberi.length})</p>
      ${modo !== 'casuale' ? `<div class="chips">${liberi.map((id) => `<button class="chip ${S.selezione === id ? 'scelto' : ''}" data-azione="scegli" data-id="${id}">${nomi(id)}</button>`).join('')}</div>` : `<p>${liberi.map(nomi).join(', ')}</p>`}
      ${modo !== 'manuale' ? `<button class="btn giallo blocco" data-azione="estrai" ${liberi.length < 2 ? 'disabled' : ''}>${ICONE.sorteggio} ${modo === 'mista' ? 'Estrai le restanti' : 'Estrai le coppie'}</button>` : ''}
    </div>` : ''}
    ${draft.length ? `<div class="elenco">${Object.entries(t.draft.coppie).map(([k, c], i) => `
      <div class="voce"><span class="tag ${c.bloccata ? 'blu' : 'giallo'}">${c.bloccata ? ICONE.lucchetto.replace('<svg', '<svg width="14" height="14"') : ''} ${i + 1}</span>
        <span class="cresce">${nomi(c.p1)} e ${nomi(c.p2)}</span>
        <button class="icona-btn" data-azione="sciogli" data-k="${k}" aria-label="Sciogli la coppia">${ICONE.chiudi}</button></div>`).join('')}</div>` : ''}
    ${draft.length && modo !== 'manuale' ? `<button class="btn blocco" data-azione="ri-estrai">${ICONE.azzera} Estrai di nuovo</button>` : ''}
    ${pres.length % 2 ? '<div class="avviso">Numero di giocatori presenti dispari: sistema le presenze prima di confermare.</div>' : ''}
    <button class="btn primario blocco" data-azione="conferma-coppie" ${liberi.length || draft.length < 3 ? 'disabled' : ''}>Conferma coppie ${ICONE.freccia}</button>
    <p class="testo-muto">${draft.length ? `${draft.length} coppie${draft.length % 2 ? ': a ogni turno una coppia riposa' : ''}. ` : ''}Dopo la conferma le coppie restano fisse per tutto il torneo.</p>`;
}

// ---------- Turno in corso ----------
function vistaTurno() {
  const t = S.data;
  const n = E.turnoCorrente(t);
  const r = t.rounds[n];
  const mia = miaCoppia();
  const mancanti = E.risultatiMancanti(r);
  const sm = t.config.smazzate;
  const timer = r.timer;
  const adm = isAdmin();
  const tavoli = Object.entries(r.tables).sort((a, b) => a[0] - b[0]);
  return `
    <div class="scheda blu in-evidenza">
      <div class="riga spazio"><p class="etichetta">${SISTEMI[t.config.sistema].nome}</p><span class="tag giallo">${sm} smazzate</span></div>
      <h2 class="titolo">Turno ${n} di ${t.config.turni}</h2>
    </div>
    <div class="scheda">
      <div class="riga spazio"><p class="etichetta">Tempo residuo</p><span class="tag muto" id="timer-stato">${!timer || !timer.startedAt ? 'Da avviare' : timer.pausedAt ? 'In pausa' : 'In corso'}</span></div>
      <div class="timer num" id="timer-testo">${E.durataTurnoMin(t.config)}:00</div>
      <div class="barra"><div id="timer-barra" style="width:0%"></div></div>
      ${adm ? `<div class="griglia-2">
        ${!timer || !timer.startedAt ? `<button class="btn giallo" data-azione="timer" data-v="avvia">${ICONE.play} Avvia</button>`
          : timer.pausedAt ? `<button class="btn giallo" data-azione="timer" data-v="riprendi">${ICONE.play} Riprendi</button>`
          : `<button class="btn giallo" data-azione="timer" data-v="pausa">${ICONE.pausa} Pausa</button>`}
        <button class="btn" data-azione="timer" data-v="azzera" ${!timer || !timer.startedAt ? 'disabled' : ''}>${ICONE.azzera} Azzera</button>
      </div>` : ''}
    </div>
    ${(r.avvisi || []).length && adm ? `<div class="avviso info">${r.avvisi.map(esc).join('<br>')}</div>` : ''}
    ${tavoli.map(([k, tb]) => {
      const res = r.results[k];
      const c = res ? E.calcolaPartita(res.a, res.b, sm) : null;
      const miaQui = mia && (tb.a === mia || tb.b === mia);
      return `<div class="scheda ${miaQui ? 'mia' : ''}">
        <div class="riga spazio"><p class="etichetta">Tavolo ${k}${miaQui ? ' - il tuo tavolo' : ''}</p>
          ${c ? '<span class="tag verde">Risultato inserito</span>' : '<span class="tag muto">In attesa</span>'}</div>
        <div class="tavolo-vs">
          <div class="lato"><span class="lettera">Coppia ${tb.a}</span><span class="nomi">${nomiCoppia(tb.a)}</span></div>
          <span class="vs">VS</span>
          <div class="lato"><span class="lettera">Coppia ${tb.b}</span><span class="nomi">${nomiCoppia(tb.b)}</span></div>
        </div>
        ${c ? `<div class="riga spazio"><span class="testo-muto num">${fmtN(res.a)} - ${fmtN(res.b)} punti</span><span class="punteggio num">${c.vpA} - ${c.vpB} <small class="etichetta">V.P.</small></span></div>` : ''}
        ${adm ? `<button class="btn ${c ? '' : 'giallo'} piccolo" data-azione="apri-risultato" data-tav="${k}">${c ? `${ICONE.matita} Correggi` : `${ICONE.piu} Inserisci risultato`}</button>` : ''}
      </div>`;
    }).join('')}
    ${Object.entries(r.byes).map(([id, motivo]) => `<div class="scheda crema ${mia === id ? 'mia' : ''}"><p class="etichetta">A riposo</p>
      <p><strong>Coppia ${id}</strong> - ${nomiCoppia(id)}</p>
      <p class="testo-muto">${motivo === 'ritiro' ? 'L\'avversaria si è ritirata. ' : ''}Riceve ${RIPOSO[sm].vp} V.P. e ${RIPOSO[sm].mp} M.P.</p></div>`).join('')}
    ${adm ? `<button class="btn primario blocco" data-azione="apri-chiudi-turno" ${mancanti ? 'disabled' : ''}>${n >= t.config.turni ? 'Chiudi l\'ultimo turno' : 'Chiudi il turno'} ${ICONE.freccia}</button>
      <p class="testo-muto">${mancanti ? `Mancano ${mancanti} risultati.` : 'Tutti i risultati sono inseriti.'}</p>` : ''}`;
}

// ---------- Classifica ----------
function tabellaClassifica(cl) {
  const mia = miaCoppia();
  return `<table class="classifica num"><thead><tr><th style="text-align:center">#</th><th>Coppia</th><th>V.P.</th><th>M.P.</th><th>G</th></tr></thead><tbody>
    ${cl.map((r) => `<tr class="${r.pos === 1 ? 'primo' : ''} ${mia === r.id ? 'mia' : ''}">
      <td class="pos">${r.pos}</td>
      <td><strong>Coppia ${r.id}</strong>${r.ritirata ? ' <span class="tag muto">Ritirata</span>' : ''}<small>${nomiCoppia(r.id)}</small>${r.decisoDa ? `<small>Parità: ${r.decisoDa}</small>` : ''}</td>
      <td class="vp">${r.vp}</td><td>${fmt(r.mp)}</td><td>${r.giocate}${r.riposi ? `<small>+${r.riposi}R</small>` : ''}</td></tr>`).join('')}
  </tbody></table>`;
}

function vistaClassifica() {
  const t = S.data;
  const chiusi = E.turniChiusi(t);
  if (!chiusi.length) return `<h2 class="titolo">Classifica</h2><div class="scheda crema"><p>La classifica compare dopo la chiusura del primo turno.</p></div>`;
  const ult = chiusi[chiusi.length - 1];
  return `<div class="riga spazio"><h2 class="titolo">Classifica</h2><span class="tag ${t.status === 'finished' ? 'giallo' : 'muto'}">${t.status === 'finished' ? 'Finale' : `Dopo il turno ${ult}`}</span></div>
    ${tabellaClassifica(E.classifica(t))}
    <p class="testo-muto">Ordine: V.P., poi M.P. A parità di entrambi: scontro diretto, partita vinta con il punteggio più alto, partita persa con il punteggio più favorevole, sorteggio. G = partite giocate, R = riposi.</p>`;
}

// ---------- Finale ----------
function vistaFinale() {
  const cl = E.classifica(S.data);
  const podio = [cl[1], cl[0], cl[2]];
  const g = (r, cls, posto) => (r ? `<div class="gradino ${cls}"><span class="posto">${posto}</span><strong>Coppia ${r.id}</strong><span class="chi">${nomiCoppia(r.id)}</span><span class="num"><strong>${r.vp}</strong> V.P.</span></div>` : '<div></div>');
  return `<div class="hero compatto"><div class="forma-rossa"></div>${OMINO}<div class="fascia"><h2 class="titolo">Torneo concluso</h2></div></div>
    <div class="podio">${g(podio[0], 'g2', '2°')}${g(podio[1], 'g1', '1°')}${g(podio[2], 'g3', '3°')}</div>
    ${tabellaClassifica(cl)}
    <div class="griglia-2"><button class="btn giallo" data-azione="condividi-classifica">${ICONE.condividi} Condividi</button>
      <button class="btn" data-azione="esporta">${ICONE.scarica} Esporta</button></div>`;
}

// ---------- Storico e regolamento ----------
function vistaStorico() {
  const t = S.data;
  const seg = `<div class="segmenti"><button class="${S.storicoTab === 'storico' ? 'attivo' : ''}" data-azione="storico-tab" data-v="storico">Storico</button><button class="${S.storicoTab === 'regolamento' ? 'attivo' : ''}" data-azione="storico-tab" data-v="regolamento">Regolamento</button></div>`;
  if (S.storicoTab === 'regolamento') return seg + vistaRegolamento();
  const sm = t.config.smazzate;
  const turni = Object.values(t.rounds).sort((a, b) => b.n - a.n);
  const nomeMembro = (uid) => esc(S.members[uid]?.name || '');
  return seg + (turni.length ? turni.map((r) => `
    <div class="scheda"><div class="riga spazio"><h3 class="titolo-s">Turno ${r.n}</h3><span class="tag ${r.closed ? 'muto' : 'rosso'}">${r.closed ? 'Chiuso' : 'In corso'}</span></div>
      ${Object.entries(r.tables).sort((a, b) => a[0] - b[0]).map(([k, tb]) => {
        const res = r.results[k];
        const c = res ? E.calcolaPartita(res.a, res.b, sm) : null;
        return `<div class="colonna" style="border-top:1px solid var(--linea);padding-top:10px">
          <div class="riga spazio"><span><strong>Tav. ${k}</strong> - Coppia ${tb.a} contro ${tb.b}</span>${c ? `<span class="punteggio num" style="font-size:20px">${c.vpA}-${c.vpB}</span>` : '<span class="tag muto">In attesa</span>'}</div>
          ${c ? `<span class="testo-muto num">Punti ${fmtN(res.a)} - ${fmtN(res.b)} - M.P. ${fmt(c.mpA)}${res.by ? ` - inserito da ${nomeMembro(res.by)}` : ''}</span>` : ''}</div>`;
      }).join('')}
      ${Object.entries(r.byes).map(([id, m]) => `<p class="testo-muto">Riposo: Coppia ${id} (${m === 'ritiro' ? 'avversaria ritirata' : 'coppie dispari'}) - ${RIPOSO[sm].vp} V.P. e ${RIPOSO[sm].mp} M.P.</p>`).join('')}
      ${Object.values(t.pairs).filter((p) => p.ritiroDalTurno === r.n).map((p) => `<p class="testo-muto">Ritiro: Coppia ${p.id} non gioca dal turno ${r.n}.</p>`).join('')}
    </div>`).join('') : '<div class="scheda crema"><p>Le partite compaiono qui dopo l\'avvio del torneo.</p></div>');
}

function vistaRegolamento() {
  const c = S.data.config;
  const tab = TABELLE_VP[c.smazzate];
  let prec = -5;
  return `
    <div class="scheda"><h3 class="titolo-s">Questo torneo</h3>
      <p><strong>${SISTEMI[c.sistema].nome}</strong>: ${SISTEMI[c.sistema].descrizione}</p>
      <p>${c.turni} turni da ${c.smazzate} smazzate, ${E.durataTurnoMin(c)} minuti per turno${c.riduzione ? ` (tempo ridotto di ${c.riduzione} min)` : ''}.</p>
      <p>Allo scadere del tempo non si inizia una nuova smazzata: si gioca l'ultimo giro previsto dal regolamento e, se nessuno chiude, nessuna coppia prende i 100 punti di chiusura.</p></div>
    <div class="scheda"><h3 class="titolo-s">Punti vittoria</h3>
      <p>La differenza tra i punti delle due coppie (M.P.) si converte in V.P. Il totale per tavolo fa sempre 20.</p>
      <table class="classifica num"><thead><tr><th style="text-align:left">Differenza M.P.</th><th>V.P.</th></tr></thead><tbody>
      ${tab.map(([max, vp]) => { const da = prec + 5; prec = max; return `<tr><td style="text-align:left">${max === Infinity ? `${fmtN(da)} e oltre` : `${fmtN(da)} - ${fmtN(max)}`}</td><td>${vp} - ${20 - vp}</td></tr>`; }).join('')}
      </tbody></table></div>
    <div class="scheda"><h3 class="titolo-s">Riposo</h3>
      <p>Con coppie dispari, a ogni turno una coppia riposa e riceve ${RIPOSO[c.smazzate].vp} V.P. e ${RIPOSO[c.smazzate].mp} M.P. Una coppia può riposare una sola volta. Con il sistema danese riposa l'ultima in classifica che non ha ancora riposato (al primo turno, per sorteggio).</p>
      <p>Se una coppia si ritira, i risultati già giocati restano validi e chi doveva incontrarla riceve il punteggio di riposo.</p></div>
    <div class="scheda"><h3 class="titolo-s">Classifica e parità</h3><ol style="margin:0;padding-left:20px">${CRITERI_PARITA.map((x) => `<li>${x}</li>`).join('')}</ol></div>
    <div class="scheda crema"><p class="etichetta">Fonti</p>${FONTI.map((f) => `<p class="testo-muto">${f}</p>`).join('')}</div>`;
}

// ---------- Altro ----------
function vistaAltro() {
  const t = S.data;
  const adm = isAdmin();
  const membri = Object.entries(S.members).sort((a, b) => (a[1].role === 'admin' ? -1 : 1) - (b[1].role === 'admin' ? -1 : 1) || a[1].name.localeCompare(b[1].name, 'it'));
  const mioPlayer = S.members[S.user.uid]?.player || '';
  const giocatori = Object.entries(t.players).sort((a, b) => a[1].name.localeCompare(b[1].name, 'it'));
  const attive = t.status === 'running' ? E.coppieAttive(t, E.turnoCorrente(t)) : [];
  return `
    <div class="scheda blu in-evidenza"><p class="etichetta">Codice invito</p>
      <div class="codice num">${esc(S.meta.code || '')}</div>
      <div class="griglia-2"><button class="btn piccolo" data-azione="copia-codice">${ICONE.copia} Copia link</button><button class="btn giallo piccolo" data-azione="condividi-codice">${ICONE.condividi} Condividi</button></div>
    </div>
    <div class="scheda"><p class="etichetta">Chi sei?</p>
      <p class="testo-muto">Scegli il tuo nome per vedere evidenziati il tuo tavolo e la tua coppia.</p>
      <select class="input" data-campo="mio-player" id="mio-player"><option value="">Non gioco / non indicato</option>
        ${giocatori.map(([id, p]) => `<option value="${id}" ${mioPlayer === id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
    </div>
    <div class="scheda"><p class="etichetta">Partecipanti (${membri.length})</p>
      <div class="elenco">${membri.map(([uid, m]) => `<div class="voce"><span class="cresce">${esc(m.name)}${uid === S.user.uid ? ' (tu)' : ''}</span>
        <span class="tag ${m.role === 'admin' ? 'blu' : 'muto'}">${m.role === 'admin' ? 'Admin' : 'Partecipante'}</span>
        ${adm ? `<button class="btn piccolo" data-azione="ruolo" data-uid="${uid}">${m.role === 'admin' ? 'Togli admin' : 'Rendi admin'}</button>` : ''}</div>`).join('')}</div>
      ${adm ? '<p class="testo-muto">Deve restare almeno un admin.</p>' : ''}
    </div>
    ${adm && t.status === 'running' ? `<div class="scheda"><p class="etichetta">Ritiro di una coppia</p>
      <p class="testo-muto">I risultati già giocati restano validi; nei turni successivi chi doveva incontrarla riceve il punteggio di riposo.</p>
      <select class="input" id="ritiro-coppia"><option value="">Scegli la coppia</option>${attive.map((id) => `<option value="${id}">Coppia ${id} - ${nomiCoppia(id)}</option>`).join('')}</select>
      <button class="btn blocco" data-azione="apri-ritiro">Segna il ritiro</button></div>` : ''}
    <div class="scheda"><p class="etichetta">Dati</p>
      <button class="btn blocco" data-azione="esporta">${ICONE.scarica} Esporta il torneo (JSON)</button>
      ${adm ? `<button class="btn blocco" data-azione="apri-elimina">${ICONE.cestino} Elimina il torneo</button>` : `<button class="btn blocco" data-azione="lascia">Togli dai miei tornei</button>`}
    </div>`;
}

// ================= Fogli (modali) =================
function apriFoglio(tipo, dati = {}) { S.sheet = { tipo, ...dati }; renderFoglio(); }
function chiudiFoglio() { S.sheet = null; renderFoglio(); }

function renderFoglio() {
  const f = S.sheet;
  if (!f) { $foglio.innerHTML = ''; document.body.style.overflow = ''; return; }
  document.body.style.overflow = 'hidden';
  let c = '';
  if (f.tipo === 'crea') {
    c = `<h2 class="titolo">Nuovo torneo</h2>
      <div class="campo"><label for="crea-nome">Nome del torneo</label><input id="crea-nome" class="input" maxlength="80" placeholder="Es. Burraco del sabato"></div>
      <div class="campo"><label for="crea-data">Data</label><input id="crea-data" class="input" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
      <button class="btn primario blocco" data-azione="crea">Crea torneo ${ICONE.freccia}</button>`;
  } else if (f.tipo === 'entra') {
    c = `<h2 class="titolo">Entra con codice</h2>
      <div class="campo"><label for="entra-codice">Codice invito</label><input id="entra-codice" class="input grande" maxlength="7" placeholder="SB-XXXX" autocapitalize="characters" autocomplete="off" value="${esc(f.codice || '')}"></div>
      <button class="btn primario blocco" data-azione="entra">Entra ${ICONE.freccia}</button>`;
  } else if (f.tipo === 'risultato') {
    const r = S.data.rounds[f.turno];
    const tb = r.tables[f.tav];
    const res = r.results[f.tav];
    const sm = S.data.config.smazzate;
    c = `<h2 class="titolo">Tavolo ${f.tav} - Turno ${f.turno}</h2>
      <div class="griglia-2">
        <div class="campo"><label for="ris-a">Coppia ${tb.a}</label><input id="ris-a" class="input grande num" inputmode="numeric" pattern="-?[0-9]*" value="${res ? res.a : ''}" placeholder="0"><span class="testo-muto">${nomiCoppia(tb.a)}</span></div>
        <div class="campo"><label for="ris-b">Coppia ${tb.b}</label><input id="ris-b" class="input grande num" inputmode="numeric" pattern="-?[0-9]*" value="${res ? res.b : ''}" placeholder="0"><span class="testo-muto">${nomiCoppia(tb.b)}</span></div>
      </div>
      <button class="link" data-azione="dettaglio-smazzate">${f.dettaglio ? 'Nascondi il dettaglio' : 'Inserisci smazzata per smazzata'}</button>
      ${f.dettaglio ? `<div class="colonna" style="gap:8px">${Array.from({ length: sm }, (_, i) => `<div class="griglia-2"><input class="input num smz" data-lato="a" inputmode="numeric" placeholder="Smazzata ${i + 1}" aria-label="Coppia ${tb.a}, smazzata ${i + 1}"><input class="input num smz" data-lato="b" inputmode="numeric" placeholder="Smazzata ${i + 1}" aria-label="Coppia ${tb.b}, smazzata ${i + 1}"></div>`).join('')}</div>` : ''}
      <p class="testo-muto">Punti totali del turno, anche negativi. Il Burraco usa multipli di 5.</p>
      <div class="scheda gialla" id="anteprima"></div>
      <div class="griglia-2"><button class="btn" data-azione="chiudi-foglio">Annulla</button><button class="btn primario" data-azione="salva-risultato">Salva</button></div>`;
  } else if (f.tipo === 'conferma') {
    c = `<h2 class="titolo">${esc(f.titolo)}</h2><p>${esc(f.testo)}</p>
      ${f.digitare ? `<div class="campo"><label for="conferma-testo">Scrivi ${esc(f.digitare)} per confermare</label><input id="conferma-testo" class="input" autocomplete="off"></div>` : ''}
      <div class="griglia-2"><button class="btn" data-azione="chiudi-foglio">Annulla</button><button class="btn primario" data-azione="conferma-ok">${esc(f.ok || 'Conferma')}</button></div>`;
  }
  $foglio.innerHTML = `<div class="velo" data-azione="velo"><div class="foglio" role="dialog" aria-modal="true">
    <button class="icona-btn chiudi" data-azione="chiudi-foglio" aria-label="Chiudi">${ICONE.chiudi}</button>${c}</div></div>`;
  if (f.tipo === 'risultato') aggiornaAnteprima();
  const primo = $foglio.querySelector('input');
  if (primo && f.tipo !== 'risultato') setTimeout(() => primo.focus(), 50);
}

function leggiNumero(v) {
  const s = String(v ?? '').trim().replace(/\./g, '').replace(',', '.');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

function aggiornaAnteprima() {
  const el = document.getElementById('anteprima');
  if (!el) return;
  const f = S.sheet;
  const tb = S.data.rounds[f.turno].tables[f.tav];
  const a = leggiNumero(document.getElementById('ris-a').value);
  const b = leggiNumero(document.getElementById('ris-b').value);
  if (a === null || b === null || Number.isNaN(a) || Number.isNaN(b)) { el.innerHTML = '<p>Inserisci i punti delle due coppie per vedere M.P. e V.P.</p>'; return; }
  const c = E.calcolaPartita(a, b, S.data.config.smazzate);
  const multipli = a % 5 === 0 && b % 5 === 0;
  el.innerHTML = `<p class="etichetta" style="color:var(--ink)">Anteprima</p>
    <p class="num">Differenza: <strong>${fmtN(Math.abs(c.mpA))} M.P.</strong></p>
    <div class="anteprima-vp num"><div class="lato"><span class="etichetta" style="color:var(--ink)">Coppia ${tb.a}</span><span class="grande">${c.vpA}</span></div>
      <span class="etichetta" style="color:var(--ink)">V.P.</span>
      <div class="lato"><span class="etichetta" style="color:var(--ink)">Coppia ${tb.b}</span><span class="grande">${c.vpB}</span></div></div>
    ${multipli ? '' : '<p><strong>Attenzione:</strong> i punti non sono multipli di 5. Controlla.</p>'}`;
}

// ================= Timer =================
let audioCtx = null;
function suona(volte = 3) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < volte; i++) {
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.type = 'square'; o.frequency.value = 880; g.gain.value = 0.15;
      o.connect(g); g.connect(audioCtx.destination);
      const t0 = audioCtx.currentTime + i * 0.45; o.start(t0); o.stop(t0 + 0.25);
    }
  } catch (e) { /* audio non disponibile */ }
  if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
}

function aggiornaTimer() {
  const testo = document.getElementById('timer-testo');
  if (!testo || !S.data || S.data.status !== 'running') return;
  const n = E.turnoCorrente(S.data);
  const r = S.data.rounds[n];
  const durata = E.durataTurnoMin(S.data.config) * 60000;
  const timer = r.timer;
  const res = timer && timer.startedAt ? E.tempoResiduoMs(timer, S.store.now()) : durata;
  const pos = Math.max(0, res);
  const m = Math.floor(pos / 60000); const s = Math.floor((pos % 60000) / 1000);
  testo.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  testo.classList.toggle('allarme', timer && timer.startedAt && res <= 5 * 60000);
  const barra = document.getElementById('timer-barra');
  if (barra) barra.style.width = `${Math.min(100, Math.max(0, 100 - (pos / (timer?.durataMs || durata)) * 100))}%`;
  if (timer && timer.startedAt && !timer.pausedAt) {
    const chiave = `${S.tid}-${n}-${timer.startedAt}`;
    const a = S.allarmi[chiave] || (S.allarmi[chiave] = { cinque: res <= 5 * 60000, fine: res <= 0 });
    if (!a.cinque && res <= 5 * 60000 && res > 0) { a.cinque = true; suona(1); toast('Mancano 5 minuti.'); }
    if (!a.fine && res <= 0) { a.fine = true; suona(3); toast('Tempo scaduto: si gioca l\'ultimo giro.'); }
  }
}
setInterval(aggiornaTimer, 250);

// ================= Azioni =================
const azioni = {
  async google() { try { await S.store.signInGoogle(); } catch (e) { S.login.errore = erroreLeggibile(e); render(); } },
  async accedi() {
    const email = val('l-email'); const pw = val('l-pw');
    if (!email || !pw) { S.login.errore = 'Inserisci email e password.'; return render(); }
    try { await S.store.signInEmail(email, pw); } catch (e) { S.login.errore = erroreLeggibile(e); render(); }
  },
  async 'crea-account'() {
    const nome = val('l-nome'); const email = val('l-email'); const pw = val('l-pw');
    if (!nome || !email || !pw) { S.login.errore = 'Compila nome, email e password.'; return render(); }
    try { const u = await S.store.signUpEmail(nome, email, pw); S.user = u; avviaUtente(); } catch (e) { S.login.errore = erroreLeggibile(e); render(); }
  },
  'modo-login'() { S.login = { modo: S.login.modo === 'crea' ? 'accedi' : 'crea', errore: '' }; render(); },
  async 'reset-pw'() {
    const email = val('l-email');
    if (!email) { S.login.errore = 'Scrivi la tua email e poi tocca "Password dimenticata?".'; return render(); }
    try { await S.store.resetPassword(email); toast('Ti abbiamo mandato un\'email per reimpostare la password.'); } catch (e) { S.login.errore = erroreLeggibile(e); render(); }
  },
  async 'entra-prova'() { const n = val('prova-nome'); if (!n) return toast('Scrivi il tuo nome.'); await S.store.signInProva(n); },
  async esci() { chiudiTorneo(); await S.store.signOut(); },

  'apri-crea'() { apriFoglio('crea'); },
  'apri-entra'() { apriFoglio('entra'); },
  async crea() {
    const nome = val('crea-nome'); const data = val('crea-data');
    if (!nome) return toast('Dai un nome al torneo.');
    const t = E.nuovoTorneo(); t.config.data = data;
    try {
      const tid = await S.store.createTournament(S.user, nome, t);
      await S.store.updateMeta(tid, { data });
      chiudiFoglio(); vai(`#/t/${tid}/turno`);
    } catch (e) { toast(erroreLeggibile(e)); }
  },
  async entra() {
    const c = val('entra-codice');
    if (!c) return toast('Scrivi il codice.');
    try { const tid = await S.store.joinByCode(S.user, c); chiudiFoglio(); vai(`#/t/${tid}/turno`); } catch (e) { toast(erroreLeggibile(e)); }
  },
  'apri-torneo'(el) { vai(`#/t/${el.dataset.tid}/turno`); },
  home() { vai('#/'); },
  tab(el) { S.tab = el.dataset.tab; vai(`#/t/${S.tid}/${S.tab}`); },
  'setup-tab'(el) { S.setupTab = el.dataset.tab; render(); window.scrollTo(0, 0); },
  'storico-tab'(el) { S.storicoTab = el.dataset.v; render(); },

  cfg(el) {
    const k = el.dataset.k; let v = el.dataset.v;
    if (k !== 'sistema') v = Number(v);
    const t = { ...S.data, config: { ...S.data.config, [k]: v } };
    salva(t);
  },
  turni(el) {
    const n = Math.max(1, Math.min(20, S.data.config.turni + Number(el.dataset.d)));
    salva({ ...S.data, config: { ...S.data.config, turni: n } });
  },

  'aggiungi-giocatore'() {
    const input = document.getElementById('nuovo-giocatore');
    const nome = input.value.trim();
    if (!nome) return;
    const doppio = Object.values(S.data.players).some((p) => p.name.toLowerCase() === nome.toLowerCase());
    if (doppio) return toast('Questo nome c\'è già.');
    input.value = '';
    salva({ ...S.data, players: { ...S.data.players, [nuovoId('g')]: { name: nome, present: true } } });
  },
  'rimuovi-giocatore'(el) {
    const players = { ...S.data.players }; delete players[el.dataset.id];
    const coppie = Object.fromEntries(Object.entries(S.data.draft.coppie || {}).filter(([, c]) => c.p1 !== el.dataset.id && c.p2 !== el.dataset.id));
    salva({ ...S.data, players, draft: { ...S.data.draft, coppie } });
  },
  presenza(el) {
    const id = el.dataset.id; const p = S.data.players[id];
    const coppie = p.present ? Object.fromEntries(Object.entries(S.data.draft.coppie || {}).filter(([, c]) => c.p1 !== id && c.p2 !== id)) : (S.data.draft.coppie || {});
    salva({ ...S.data, players: { ...S.data.players, [id]: { ...p, present: !p.present } }, draft: { ...S.data.draft, coppie } });
  },

  'modo-coppie'(el) { S.selezione = null; salva({ ...S.data, draft: { ...S.data.draft, modo: el.dataset.v } }); },
  scegli(el) {
    const id = el.dataset.id;
    if (!S.selezione) { S.selezione = id; return render(); }
    if (S.selezione === id) { S.selezione = null; return render(); }
    const coppie = { ...(S.data.draft.coppie || {}), [nuovoId('c')]: { p1: S.selezione, p2: id, bloccata: true } };
    S.selezione = null;
    salva({ ...S.data, draft: { ...S.data.draft, coppie } });
  },
  estrai() {
    const pres = giocatoriPresenti();
    const esistenti = Object.values(S.data.draft.coppie || {});
    const { nuove } = E.formaCoppieCasuali(pres, esistenti.map((c) => [c.p1, c.p2]));
    const coppie = { ...(S.data.draft.coppie || {}) };
    nuove.forEach(([p1, p2]) => { coppie[nuovoId('c')] = { p1, p2, bloccata: false }; });
    S.selezione = null;
    salva({ ...S.data, draft: { ...S.data.draft, coppie } });
  },
  'ri-estrai'() {
    const restano = Object.fromEntries(Object.entries(S.data.draft.coppie || {}).filter(([, c]) => c.bloccata && (S.data.draft.modo || 'casuale') !== 'casuale'));
    const t = { ...S.data, draft: { ...S.data.draft, coppie: restano } };
    S.data = E.normalizza(t);
    azioni.estrai();
  },
  sciogli(el) {
    const coppie = { ...(S.data.draft.coppie || {}) }; delete coppie[el.dataset.k];
    salva({ ...S.data, draft: { ...S.data.draft, coppie } });
  },
  'conferma-coppie'() {
    const lista = Object.values(S.data.draft.coppie || {}).map((c) => [c.p1, c.p2]);
    const t = E.confermaCoppie(S.data, lista);
    const n = t.order.length;
    // Adatta i turni al massimo consentito, se serve.
    const max = E.maxTurni(t.config.sistema, n);
    if (t.config.turni > max) { t.config = { ...t.config, turni: max }; toast(`Turni ridotti a ${max}, il massimo con ${n} coppie.`); }
    salva(t);
  },
  'sblocca-coppie'() {
    const coppie = {};
    Object.values(S.data.pairs).forEach((p) => { coppie[nuovoId('c')] = { p1: p.p1, p2: p.p2, bloccata: true }; });
    salva({ ...S.data, pairs: {}, order: [], draft: { ...S.data.draft, coppie, modo: 'mista' } });
  },
  avvia() {
    try { const t = E.avviaTorneo(S.data); S.tab = 'turno'; salva(t); } catch (e) { toast(e.message); }
  },

  timer(el) {
    const n = E.turnoCorrente(S.data);
    const r = S.data.rounds[n];
    const now = S.store.now();
    let timer = r.timer || null;
    let inizio = r.inizio;
    const v = el.dataset.v;
    if (v === 'avvia') {
      timer = { durataMs: E.durataTurnoMin(S.data.config) * 60000, startedAt: now, pausedMs: 0, pausedAt: null };
      const d = new Date(now); inizio = d.getHours() * 60 + d.getMinutes();
      suona(0);
    } else if (v === 'pausa') timer = { ...timer, pausedAt: now };
    else if (v === 'riprendi') timer = { ...timer, pausedMs: (timer.pausedMs || 0) + (now - timer.pausedAt), pausedAt: null };
    else if (v === 'azzera') { timer = null; inizio = null; }
    salva({ ...S.data, rounds: { ...S.data.rounds, [n]: { ...r, timer, inizio } } });
  },

  'apri-risultato'(el) { apriFoglio('risultato', { turno: E.turnoCorrente(S.data), tav: el.dataset.tav, dettaglio: false }); },
  'dettaglio-smazzate'() { S.sheet.dettaglio = !S.sheet.dettaglio; const a = val('ris-a'); const b = val('ris-b'); renderFoglio(); document.getElementById('ris-a').value = a; document.getElementById('ris-b').value = b; aggiornaAnteprima(); },
  'salva-risultato'() {
    const f = S.sheet;
    const a = leggiNumero(val('ris-a')); const b = leggiNumero(val('ris-b'));
    if (a === null || b === null || Number.isNaN(a) || Number.isNaN(b)) return toast('Inserisci i punti di entrambe le coppie.');
    const r = S.data.rounds[f.turno];
    if (r.closed) return toast('Il turno è già chiuso.');
    const results = { ...r.results, [f.tav]: { a, b, by: S.user.uid, at: S.store.now() } };
    chiudiFoglio();
    salva({ ...S.data, rounds: { ...S.data.rounds, [f.turno]: { ...r, results } } });
  },
  'apri-chiudi-turno'() {
    const n = E.turnoCorrente(S.data);
    const ultimo = n >= S.data.config.turni;
    apriFoglio('conferma', {
      titolo: ultimo ? 'Chiudere il torneo?' : `Chiudere il turno ${n}?`,
      testo: ultimo ? 'Dopo la chiusura la classifica diventa definitiva.' : 'Dopo la chiusura i risultati di questo turno non si possono più correggere e vengono generati gli abbinamenti del turno successivo.',
      ok: 'Chiudi', azione: 'chiudi-turno',
    });
  },
  'apri-ritiro'() {
    const id = val('ritiro-coppia');
    if (!id) return toast('Scegli la coppia.');
    apriFoglio('conferma', { titolo: `Ritiro della coppia ${id}`, testo: `${S.data.players[S.data.pairs[id].p1]?.name} e ${S.data.players[S.data.pairs[id].p2]?.name} non giocheranno più. L'operazione non si può annullare.`, ok: 'Conferma il ritiro', azione: 'ritiro', id });
  },
  'apri-elimina'() {
    apriFoglio('conferma', { titolo: 'Eliminare il torneo?', testo: 'Il torneo verrà cancellato per tutti i partecipanti. Non si può annullare. Se vuoi conservarlo, esportalo prima.', ok: 'Elimina', azione: 'elimina', digitare: 'ELIMINA' });
  },
  async 'conferma-ok'() {
    const f = S.sheet;
    if (f.digitare && val('conferma-testo').trim().toUpperCase() !== f.digitare) return toast(`Scrivi ${f.digitare} per confermare.`);
    chiudiFoglio();
    if (f.azione === 'chiudi-turno') {
      try { const t = E.chiudiTurno(S.data); salva(t); window.scrollTo(0, 0); } catch (e) { toast(e.message); }
    } else if (f.azione === 'ritiro') {
      const t = E.ritiraCoppia(S.data, f.id);
      const avv = E.avvisoRiposiRitiro(t);
      salva(t);
      if (avv) toast(avv);
    } else if (f.azione === 'elimina') {
      try { const tid = S.tid; const meta = S.meta; const members = S.members; chiudiTorneo(); await S.store.deleteTournament(S.user, tid, meta, members); vai('#/'); toast('Torneo eliminato.'); } catch (e) { toast(erroreLeggibile(e)); }
    } else if (f.azione === 'ruolo') {
      await S.store.setMember(S.tid, f.uid, { role: f.ruolo }).catch((e) => toast(erroreLeggibile(e)));
    }
  },
  ruolo(el) {
    const uid = el.dataset.uid;
    const m = S.members[uid];
    const nuovo = m.role === 'admin' ? 'viewer' : 'admin';
    const admin = Object.values(S.members).filter((x) => x.role === 'admin').length;
    if (nuovo === 'viewer' && admin <= 1) return toast('Deve restare almeno un admin.');
    if (uid === S.user.uid && nuovo === 'viewer') {
      return apriFoglio('conferma', { titolo: 'Togliere a te il ruolo di admin?', testo: 'Non potrai più modificare il torneo, a meno che un altro admin non ti renda di nuovo admin.', ok: 'Conferma', azione: 'ruolo', uid, ruolo: nuovo });
    }
    S.store.setMember(S.tid, uid, { role: nuovo }).catch((e) => toast(erroreLeggibile(e)));
  },
  async lascia() { const tid = S.tid; chiudiTorneo(); await S.store.leaveTournament(S.user, tid); vai('#/'); },

  async 'copia-codice'() {
    const link = `${location.origin}${location.pathname}#/entra/${S.meta.code}`;
    try { await navigator.clipboard.writeText(link); toast('Link copiato.'); } catch (e) { toast(link); }
  },
  async 'condividi-codice'() {
    const link = `${location.origin}${location.pathname}#/entra/${S.meta.code}`;
    const testo = `Torneo "${S.meta.name}" su Sorelle Burraco. Codice: ${S.meta.code}`;
    if (navigator.share) { try { await navigator.share({ title: 'Sorelle Burraco', text: testo, url: link }); } catch (e) { /* annullato */ } } else azioni['copia-codice']();
  },
  async 'condividi-classifica'() {
    const cl = E.classifica(S.data);
    const testo = `${S.meta.name} - classifica finale\n` + cl.map((r) => `${r.pos}. Coppia ${r.id} (${S.data.players[S.data.pairs[r.id].p1]?.name} e ${S.data.players[S.data.pairs[r.id].p2]?.name}) ${r.vp} V.P., ${fmt(r.mp)} M.P.`).join('\n');
    if (navigator.share) { try { await navigator.share({ title: S.meta.name, text: testo }); } catch (e) { /* annullato */ } }
    else { try { await navigator.clipboard.writeText(testo); toast('Classifica copiata.'); } catch (e) { toast('Impossibile condividere da questo browser.'); } }
  },
  esporta() {
    const blob = new Blob([JSON.stringify({ meta: S.meta, data: S.data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(S.meta.name || 'torneo').replace(/[^\w\- ]+/g, '').trim() || 'torneo'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },

  'chiudi-foglio'() { chiudiFoglio(); },
  velo(el, ev) { if (ev.target === el) chiudiFoglio(); },
};

function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }

document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-azione]');
  if (!el || el.disabled) return;
  const f = azioni[el.dataset.azione];
  if (!f) return;
  if (el.dataset.azione === 'velo' && ev.target !== el) return;
  ev.preventDefault();
  f(el, ev);
});

document.addEventListener('change', (ev) => {
  const el = ev.target;
  const campo = el.dataset && el.dataset.campo;
  if (!campo || !S.data) return;
  if (campo === 'nome') { const v = el.value.trim(); if (v) S.store.updateMeta(S.tid, { name: v }).catch((e) => toast(erroreLeggibile(e))); }
  else if (campo === 'data' || campo === 'inizio') salva({ ...S.data, config: { ...S.data.config, [campo]: el.value } });
  else if (campo === 'mio-player') S.store.setMember(S.tid, S.user.uid, { player: el.value || null }).catch((e) => toast(erroreLeggibile(e)));
});

document.addEventListener('input', (ev) => {
  if (!S.sheet || S.sheet.tipo !== 'risultato') return;
  if (ev.target.classList.contains('smz')) {
    for (const lato of ['a', 'b']) {
      const vals = [...document.querySelectorAll(`.smz[data-lato="${lato}"]`)].map((i) => leggiNumero(i.value)).filter((x) => x !== null && !Number.isNaN(x));
      if (vals.length) document.getElementById(`ris-${lato}`).value = vals.reduce((x, y) => x + y, 0);
    }
  }
  aggiornaAnteprima();
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' && ev.target.id === 'nuovo-giocatore') { ev.preventDefault(); azioni['aggiungi-giocatore'](); }
  if (ev.key === 'Enter' && ev.target.id === 'entra-codice') azioni.entra();
  if (ev.key === 'Enter' && ev.target.id === 'crea-nome') azioni.crea();
  if (ev.key === 'Escape' && S.sheet) chiudiFoglio();
});

// ================= Navigazione =================
function vai(hash) { if (location.hash === hash) instrada(); else location.hash = hash; }

function chiudiTorneo() {
  if (S.offTorneo) S.offTorneo();
  S.offTorneo = null; S.tid = null; S.data = null; S.meta = {}; S.members = {};
}

function apriTorneo(tid) {
  if (S.tid === tid) return;
  chiudiTorneo();
  S.tid = tid;
  S.setupTab = 'torneo';
  S.offTorneo = S.store.watch(tid, ({ meta, members, data }) => {
    if (S.tid !== tid) return;
    S.meta = meta; S.members = members; S.data = E.normalizza(data);
    if (!S.sheet || S.sheet.tipo !== 'risultato') render();
    else render();
  }, () => { toast('Torneo non disponibile.'); chiudiTorneo(); vai('#/'); });
}

function instrada() {
  if (!S.user) { S.view = 'login'; return render(); }
  const h = location.hash.replace(/^#\/?/, '');
  const parti = h.split('/');
  if (parti[0] === 'entra' && parti[1]) {
    S.codiceInSospeso = null;
    location.replace('#/');
    apriFoglio('entra', { codice: decodeURIComponent(parti[1]) });
    return;
  }
  if (parti[0] === 't' && parti[1]) {
    S.view = 'torneo';
    S.tab = ['turno', 'classifica', 'storico', 'altro'].includes(parti[2]) ? parti[2] : 'turno';
    apriTorneo(parti[1]);
    render();
    window.scrollTo(0, 0);
    return;
  }
  chiudiTorneo();
  S.view = 'home';
  render();
}

window.addEventListener('hashchange', instrada);

function avviaUtente() {
  if (S.offLista) S.offLista();
  S.offLista = S.store.myTournaments(S.user.uid, (lista) => { S.tornei = lista; if (S.view === 'home') render(); });
  if (S.codiceInSospeso) { const c = S.codiceInSospeso; S.codiceInSospeso = null; location.hash = `#/entra/${c}`; }
  instrada();
}

async function avvio() {
  S.store = await creaStore();
  const m = location.hash.match(/^#\/entra\/(.+)$/);
  if (m) S.codiceInSospeso = decodeURIComponent(m[1]);
  S.store.onAuth((u) => {
    if (u && S.user && u.uid === S.user.uid) return;
    S.user = u;
    if (!u) { if (S.offLista) S.offLista(); chiudiTorneo(); S.view = 'login'; S.login.errore = ''; return render(); }
    avviaUtente();
  });
}

avvio();
