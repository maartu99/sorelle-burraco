import * as E from './engine.js?v=25';
import { TEMPI, SISTEMI, TABELLE_VP, RIPOSO, CRITERI_PARITA, FONTI, RIDUZIONE_MAX, SMAZZATE_AMMESSE } from './regolamento.js?v=25';
import { creaStore, chiaveEmail, emailValida } from './store.js?v=25';
import { OMINO, MARCHIO, ICONE, GOOGLE, SEMI } from './grafica.js?v=25';

// ================= Stato =================
const S = {
  store: null,
  user: null,
  view: 'caricamento',
  tornei: [],
  invitiMiei: [],
  invitiTorneo: {},
  push: { stato: 'sconosciuto' },
  tid: null,
  meta: {},
  members: {},
  data: null,
  tab: 'turno',
  setupTab: 'torneo',
  storicoTab: 'storico',
  filtro: 'tutti',
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

// Nome mostrato della coppia: il soprannome, se c'è, altrimenti i due nomi.
function nomeCoppia(id) {
  const p = S.data.pairs[id];
  return p && p.nick ? esc(p.nick) : nomiCoppia(id);
}
// I due nomi sotto, solo quando la coppia ha un soprannome.
function sottoNomi(id, tag = 'small') {
  const p = S.data.pairs[id];
  return p && p.nick ? `<${tag} class="muto testo-s">${nomiCoppia(id)}</${tag}>` : '';
}
function testoCoppia(id) {
  const t = S.data; const p = t.pairs[id];
  if (!p) return '';
  const n = `${t.players[p.p1]?.name || '?'} e ${t.players[p.p2]?.name || '?'}`;
  return p.nick ? `${p.nick} (${n})` : n;
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
  const dopo = E.normalizza(nuovo);
  // Regola fissa: un giocatore sta in una sola coppia. Nessun salvataggio può crearne una doppia.
  const primaDoppi = new Set(prima ? E.giocatoriDoppi(prima) : []);
  const nuoviDoppi = E.giocatoriDoppi(dopo).filter((p) => !primaDoppi.has(p));
  if (nuoviDoppi.length) {
    const nomi = nuoviDoppi.map((p) => dopo.players[p]?.name || '?').join(', ');
    render();
    return toast(`Non salvato: ${nomi} sarebbe in più di una coppia. Un giocatore può stare in una sola coppia.`);
  }
  S.data = dopo;
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

const FIRMA = '<footer class="firma">Powered by <strong>MAT</strong> &amp; <strong>NAT</strong></footer>';

// ================= Render principale =================
function render() {
  const att = document.activeElement;
  const focusId = att && att.id && $app.contains(att) ? att.id : null;
  const sel = focusId && 'selectionStart' in att ? [att.selectionStart, att.selectionEnd] : null;
  const scrollY = window.scrollY;
  // Conserva i valori scritti dall'utente e non ancora salvati: un aggiornamento dei dati
  // (anche da un altro telefono) ridisegna la pagina e non deve cancellarli.
  const modificati = {};
  $app.querySelectorAll('input[id], select[id]').forEach((el) => {
    if (el.type === 'checkbox') return;
    const iniziale = el.tagName === 'SELECT' ? null : el.defaultValue;
    if (iniziale !== null && el.value !== iniziale) modificati[el.id] = el.value;
  });

  let html = '';
  if (S.view === 'caricamento') html = `<div class="contenuto senza-nav"><p class="muto testo-s">Caricamento...</p></div>`;
  else if (S.view === 'login') html = vistaLogin();
  else if (S.view === 'home') html = vistaHome();
  else if (S.view === 'torneo') html = vistaTorneo();
  else if (S.view === 'profilo') html = vistaProfilo();
  $app.innerHTML = html;
  const pagina = $app.querySelector('.contenuto');
  if (pagina) pagina.insertAdjacentHTML('beforeend', FIRMA);
  adattaTesti($app);

  for (const [id, v] of Object.entries(modificati)) {
    const el = document.getElementById(id);
    if (el && el.tagName !== 'SELECT') el.value = v;
  }
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) { el.focus({ preventScroll: true }); if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* */ } }
  }
  if (scrollBloccato === null) window.scrollTo(0, scrollY);
  aggiornaTimer();
  aggiornaDurata();
}

// ================= Pezzi grafici comuni =================
const SEME = {
  cuori: '<svg viewBox="0 0 24 24" fill="#c0280b"><polygon points="12,22 2,10 7,4 12,9 17,4 22,10"/></svg>',
  quadri: '<svg viewBox="0 0 24 24" fill="#f5c800"><polygon points="12,2 22,12 12,22 2,12" stroke="#141313" stroke-width="1.5"/></svg>',
  fiori: '<svg viewBox="0 0 24 24" fill="#4f599e"><circle cx="12" cy="7" r="4.5"/><circle cx="7" cy="13" r="4.5"/><circle cx="17" cy="13" r="4.5"/><rect x="11" y="13" width="2" height="9"/></svg>',
  picche: '<svg viewBox="0 0 24 24" fill="#141313"><polygon points="12,2 21,14 15,16 14,14 14,22 10,22 10,14 9,16 3,14"/></svg>',
};

function iniziale(nome) { return esc((nome || '?').trim().charAt(0).toUpperCase() || '?'); }

function testata({ sopra = 'Sorelle Burraco', titolo, sinistra = '', destra = '' }) {
  return `<header class="testata">${sinistra || `<span class="logo">${MARCHIO}</span>`}
    <div class="testi"><span class="sopra">${esc(sopra)}</span><h1>${esc(titolo)}</h1></div>${destra}</header>`;
}

function bottoneProfilo() {
  return `<button class="icona-btn avatar" data-azione="profilo" aria-label="Il tuo profilo">${iniziale(S.user?.name)}</button>`;
}

function banda(parti) {
  const testo = parti.map(esc).join('<i></i>');
  const giro = (testo + '<i></i>').repeat(3);
  return `<div class="banda" aria-hidden="true"><span>${giro}${giro}</span></div>`;
}

function tile(etichetta, valore, cls = '', id = '') {
  return `<div class="tile ${cls}"><span class="etichetta">${etichetta}</span><span class="val num" ${id ? `id="${id}"` : ''}>${valore}</span></div>`;
}

function card({ testa = '', testaCls = '', destra = '', corpo = '', cls = '' }) {
  return `<section class="card ${cls}">${testa ? `<div class="testa ${testaCls}"><span class="etichetta"><span class="rombo-s"></span>${testa}</span>${destra}</div>` : ''}
    <div class="corpo">${corpo}</div></section>`;
}

function avviso(titolo, testo, cls = '') {
  return `<div class="avviso ${cls}"><span class="ico">!</span><div class="colonna"><span><span class="titolo-avviso">${titolo}</span></span><span>${testo}</span></div></div>`;
}

function semi() {
  return `<div class="semi" aria-hidden="true"><div>${SEME.cuori}Cuori</div><div>${SEME.quadri}Quadri</div><div>${SEME.fiori}Fiori</div><div>${SEME.picche}Picche</div></div>`;
}

// ================= Login =================
function vistaLogin() {
  const prova = S.store.mode === 'prova';
  const l = S.login;
  const hero = `<div class="hero-accesso"><div class="rossa"></div><div class="gialla"></div>${OMINO}
    <div class="targa"><h1 class="titolo">Sorelle Burraco</h1></div>
    <p class="sotto etichetta">Tornei di burraco a coppie</p></div>`;
  if (prova) {
    return `<div class="contenuto senza-nav">${hero}
      ${avviso('Modalità prova', 'Firebase non è collegato: i dati restano solo su questo browser.', 'info')}
      ${card({ testa: 'Entra', testaCls: 'gialla', corpo: `
        <div class="campo"><label for="prova-nome">Il tuo nome</label><input id="prova-nome" class="input" autocomplete="name" maxlength="40" placeholder="Es. Natasha"></div>
        <button class="btn primario blocco-w" data-azione="entra-prova">Entra ${ICONE.freccia}</button>` })}
      ${semi()}</div>`;
  }
  const crea = l.modo === 'crea';
  return `<div class="contenuto senza-nav">${hero}
    ${card({ testa: crea ? 'Crea un account' : 'Accedi al circolo', testaCls: 'gialla', corpo: `
      <button class="btn blocco-w" data-azione="google">${GOOGLE.replace('<svg', '<svg width="20" height="20"')} Accedi con Google</button>
      <div class="separatore"><i></i><span class="etichetta">oppure</span><i class="g"></i></div>
      ${crea ? `<div class="campo"><label for="l-nome">Nome</label><input id="l-nome" class="input" autocomplete="name" maxlength="40"></div>` : ''}
      <div class="campo"><label for="l-email">Email</label><input id="l-email" class="input" type="email" autocomplete="email" inputmode="email"></div>
      <div class="campo"><label for="l-pw">Password</label><input id="l-pw" class="input" type="password" autocomplete="${crea ? 'new-password' : 'current-password'}"></div>
      ${l.errore ? avviso('Attenzione', esc(l.errore)) : ''}
      <button class="btn primario blocco-w" data-azione="${crea ? 'crea-account' : 'accedi'}">${crea ? 'Crea account' : 'Entra'} ${ICONE.freccia}</button>
      <div class="riga spazio">
        <button class="link" data-azione="modo-login">${crea ? 'Ho già un account' : 'Crea un account'}</button>
        ${crea ? '' : '<button class="link" data-azione="reset-pw">Password dimenticata?</button>'}
      </div>` })}
    ${semi()}
    <p class="piede-pagina">Sorelle Burraco - tornei tra amici</p></div>`;
}

// ================= Home =================
function cardTorneo(m) {
  const data = m.data ? new Date(m.data + 'T12:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }) : '';
  const ruolo = m.role === 'admin' ? 'Admin' : 'Partecipante';
  const apri = `<button class="btn nero blocco-w" data-azione="apri-torneo" data-tid="${esc(m.tid)}"><span class="riga">${ICONE.bandiera} ${m.status === 'running' ? 'Vai al turno' : m.status === 'finished' ? 'Vedi la classifica' : 'Prepara il torneo'}</span>${ICONE.freccia}</button>`;
  if (m.status === 'running') {
    const segni = Array.from({ length: m.turni || 0 }, (_, i) => `<span class="${i + 1 < m.turno ? 'pieno' : i + 1 === m.turno ? 'ora' : ''}"></span>`).join('');
    return card({ testa: `In corso - turno ${m.turno} di ${m.turni}`, testaCls: 'rossa', destra: '<span class="badge rosso">Live</span>', corpo: `
      <div class="riga spazio"><h3 class="titolo-m" style="min-width:0;overflow-wrap:break-word">${esc(m.name)}</h3><span class="tile giallo" style="padding:6px 10px;flex:none;min-width:max-content;text-align:center"><span class="etichetta">Coppie</span><span class="val num">${m.coppie || '-'}</span></span></div>
      <div class="tiles">${tile('Turno', `${m.turno}<small>/${m.turni}</small>`)}${tile('Data', data || '-', '', '').replace('class="val num"', 'class="val medio"')}${tile('Ruolo', ruolo).replace('class="val num"', 'class="val medio"')}</div>
      <div class="colonna"><div class="riga spazio"><span class="testo-s">Avanzamento turni</span><span class="etichetta">${Math.round(((m.turno - 1) / (m.turni || 1)) * 100)}% completato</span></div><div class="barra-seg">${segni}</div></div>
      ${apri}` });
  }
  if (m.status === 'finished') {
    return card({ testa: `Concluso${data ? ` - ${data}` : ''}`, destra: '<span class="badge nero">Archivio</span>', corpo: `
      <h3 class="titolo-m">${esc(m.name)}</h3><p class="muto testo-s">${m.coppie || 0} coppie - ${m.turni} turni - ${ruolo}</p>${apri}` });
  }
  return card({ testa: `Da iniziare${data ? ` - ${data}` : ''}`, testaCls: 'blu', destra: `<span class="badge giallo">${ruolo}</span>`, cls: 'blu', corpo: `
    <h3 class="titolo-m">${esc(m.name)}</h3><p class="muto testo-s">${m.coppie ? `${m.coppie} coppie` : 'Presenze e coppie da preparare'}</p>
    <button class="btn giallo blocco-w" data-azione="apri-torneo" data-tid="${esc(m.tid)}">${m.role === 'admin' ? 'Prepara il torneo' : 'Apri il torneo'} ${ICONE.freccia}</button>` });
}

function vistaHome() {
  const tutti = S.tornei.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const f = S.filtro || 'tutti';
  const conta = (st) => tutti.filter((m) => m.status === st).length;
  const lista = f === 'tutti' ? tutti : tutti.filter((m) => m.status === f);
  const filtri = [['tutti', 'Tutti'], ['running', 'In corso'], ['setup', 'Da iniziare'], ['finished', 'Conclusi']];
  return `${testata({ titolo: 'I miei tornei', destra: bottoneProfilo() })}
    <div class="contenuto senza-nav">
      ${banda(['Tornei a coppie', 'Regolamento FIBur', 'Pinelle accese'])}
      ${S.invitiMiei.map((i) => card({ testa: 'Invito', testaCls: 'rossa', destra: '<span class="badge giallo">Nuovo</span>', corpo: `
        <p style="margin:0"><strong>${esc(i.by || 'Qualcuno')}</strong> ti ha invitato al torneo</p>
        <h2 class="titolo-m" style="margin:0">${esc(i.name || 'Torneo')}</h2>
        <div class="griglia-2"><button class="btn" data-azione="rifiuta-invito" data-tid="${esc(i.tid)}">Rifiuta</button><button class="btn primario" data-azione="accetta-invito" data-tid="${esc(i.tid)}">Accetta</button></div>` })).join('')}
      <section class="hero"><div class="arte"><div class="diag"></div><div class="rossa"></div>${OMINO}</div>
        <div class="testo"><span class="badge rosso" style="align-self:flex-start">Ciao ${esc(S.user.name)}</span>
          <h2 class="titolo">I miei<br><span class="rosso-t">tornei</span></h2>
          <p class="testo-s">Coppie, tavoli e classifica della serata, in tempo reale per tutti.</p></div>
        <div class="piede"><span>${SEME.quadri}Quadri</span><span>${SEME.picche}Picche</span><span>${SEME.cuori}Cuori</span><span>${SEME.fiori}Fiori</span></div><div class="angolo"></div></section>
      <div class="azioni">
        <button class="blocco rosso" data-azione="apri-crea"><span class="ico">${ICONE.piu}</span><span class="nome">Crea torneo</span><span class="sub">Tavoli, coppie e turni</span></button>
        <button class="blocco blu" data-azione="apri-entra"><span class="ico">${ICONE.chiave}</span><span class="nome">Entra con codice</span><span class="sub">Partecipa a un torneo</span></button>
      </div>
      ${tutti.length ? `<div class="filtri">${filtri.map(([k, t]) => `<button class="${f === k ? 'attivo' : ''}" data-azione="filtro" data-v="${k}">${t}</button>`).join('')}</div>` : ''}
      ${lista.length ? lista.map(cardTorneo).join('') : card({ cls: 'crema', corpo: `<div class="riga"><span class="mini-omino">${OMINO}</span><p>${tutti.length ? 'Nessun torneo in questo elenco.' : 'Non hai ancora tornei. Creane uno, oppure entra con il codice che ti ha mandato chi organizza.'}</p></div>` })}
      ${S.store.mode === 'prova' ? '<p class="piede-pagina">Modalità prova: i dati restano su questo browser</p>' : ''}
    </div>`;
}

// ================= Profilo =================
const TEMI = [['classico', 'Classico', 'conic-gradient(#c0280b 0 33%, #f5c800 0 66%, #4f599e 0)'], ['rosa', 'Rosa', 'conic-gradient(#d6246e 0 50%, #8e3fa8 0)'], ['blu', 'Blu', 'conic-gradient(#1f5fd1 0 50%, #0f2f6b 0)'], ['verde', 'Verde', 'conic-gradient(#1f8a4c 0 50%, #b7e04a 0)'], ['giallo', 'Giallo', 'conic-gradient(#ffd60a 0 50%, #e08a00 0)']];
function temaAttuale() { try { return localStorage.getItem('sb-tema') || 'classico'; } catch (e) { return 'classico'; } }
function applicaTema(k) {
  if (k === 'classico') delete document.documentElement.dataset.tema; else document.documentElement.dataset.tema = k;
  try { localStorage.setItem('sb-tema', k); } catch (e) { /* telefono senza memoria locale: vale solo per ora */ }
}

function inStandalone() { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
function cartaNotifiche() {
  if (S.push.stato === 'sconosciuto') {
    S.push.stato = 'verifica';
    S.store.pushAttiva(S.user).then((on) => { S.push = { stato: on ? 'attive' : (typeof Notification !== 'undefined' && Notification.permission === 'denied') ? 'negate' : 'spente' }; if (S.view === 'profilo') render(); });
  }
  const st = S.push.stato;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (!S.store.pushDisponibile()) return '<p class="muto testo-s" style="margin:0">Le notifiche non sono ancora state attivate per l\'app.</p>';
  if (ios && !inStandalone()) return '<p class="testo-s" style="margin:0">Su iPhone le notifiche funzionano solo aprendo l\'app dall\'icona sulla Home. Aprila da lì e torna qui.</p>';
  if (st === 'attive') return `<p class="testo-s" style="margin:0">Attive su questo telefono: ricevi un avviso quando qualcuno ti invita a un torneo.</p><button class="btn blocco-w" data-azione="spegni-notifiche">Spegni le notifiche</button>`;
  if (st === 'negate') return '<p class="testo-s" style="margin:0">Le notifiche sono bloccate nelle impostazioni del telefono. Per riattivarle: Impostazioni, Notifiche, Sorelle Burraco.</p>';
  if (st === 'attesa' || st === 'verifica') return '<p class="muto testo-s" style="margin:0">Un momento...</p>';
  return `<p class="testo-s" style="margin:0">Ricevi un avviso sul telefono quando qualcuno ti invita a un torneo, anche ad app chiusa.</p>
    ${st === 'errore' ? avviso('Non attivate', esc(S.push.msg || 'Riprova.'), 'info') : ''}
    <button class="btn primario blocco-w" data-azione="attiva-notifiche">Attiva le notifiche</button>`;
}

function vistaProfilo() {
  const u = S.user;
  const admin = S.tornei.filter((m) => m.role === 'admin').length;
  const inCorso = S.tornei.filter((m) => m.status === 'running').length;
  return `${testata({ titolo: 'Il tuo profilo', sinistra: `<button class="icona-btn" data-azione="home" aria-label="Torna ai tornei">${ICONE.indietro}</button>` })}
    <div class="contenuto senza-nav">
      ${card({ testa: 'Giocatore', testaCls: 'gialla', corpo: `
        <div class="profilo-testa"><span class="avatar-grande">${iniziale(u.name)}</span>
          <div class="colonna"><h2 class="titolo-m">${esc(u.name)}</h2>${u.email ? `<p class="muto testo-s">${esc(u.email)}</p>` : ''}
          <span class="badge chiaro" style="align-self:flex-start">${S.store.mode === 'prova' ? 'Modalità prova' : u.google ? 'Accesso con Google' : 'Accesso con email'}</span></div></div>
        <div class="tiles">${tile('Tornei', S.tornei.length, 'giallo')}${tile('Come admin', admin)}${tile('In corso', inCorso, inCorso ? 'rosso' : '')}</div>` })}
      ${card({ testa: 'Nome visualizzato', corpo: `
        <p class="muto testo-s">È il nome che vedono gli altri partecipanti nei tornei a cui entri da adesso.</p>
        <div class="campo"><label for="profilo-nome">Nome</label><input id="profilo-nome" class="input" maxlength="40" value="${esc(u.name)}" autocomplete="name"></div>
        <button class="btn giallo blocco-w" data-azione="salva-profilo">Salva il nome</button>` })}
      ${S.store.mode === 'prova' ? '' : card({ testa: 'Notifiche', corpo: cartaNotifiche() })}
      ${card({ testa: 'Sigla', corpo: `
        <div class="segmenti"><button class="${siglaAttiva() ? 'attivo' : ''}" data-azione="sigla" data-v="on">Sigla on</button><button class="${siglaAttiva() ? '' : 'attivo'}" data-azione="sigla" data-v="off">Sigla off</button></div>
        <p class="muto testo-s" style="margin:0">La sigla suona quando entri nel profilo. Vale solo per te, su questo telefono.</p>` })}
      ${card({ testa: 'Colore dell\'app', corpo: `
        <div class="temi">${TEMI.map(([k, n, g]) => `<button class="${temaAttuale() === k ? 'attivo' : ''}" data-azione="tema" data-v="${k}" aria-label="Colore ${n}"><span class="pallino" style="background:${g}"></span>${n}</button>`).join('')}</div>
        <p class="muto testo-s" style="margin:0">Vale solo per te, su questo telefono.</p>` })}
      ${S.store.mode !== 'prova' && u.email && !u.google ? card({ testa: 'Password', corpo: `<p class="muto testo-s">Ti mandiamo un'email con il link per cambiarla.</p>
        <button class="btn blocco-w" data-azione="cambia-pw">Cambia password</button>` }) : ''}
      <button class="btn primario blocco-w" data-azione="esci">${ICONE.esci} Esci</button>
      ${semi()}
    </div>`;
}

// ================= Torneo =================
function bandaTorneo() {
  const t = S.data;
  const sist = E.isElim(t) ? 'Eliminazione' : SISTEMI[t.config.sistema].nome;
  if (t.status === 'setup') return banda(['Preparazione', 'Presenze e coppie', sist]);
  if (t.status === 'finished') return banda(['Torneo concluso', 'Classifica finale', `${t.order.length} coppie`]);
  const n = E.turnoCorrente(t);
  return banda([`Turno ${n} di ${t.config.turni}`, sist, E.isElim(t) ? `${E.durataTurnoMin(t.config)} minuti` : `${t.config.smazzate} smazzate`]);
}

function vistaTorneo() {
  if (!S.data) return `<div class="contenuto senza-nav"><p class="muto">Caricamento torneo...</p></div>`;
  // Gruppo: coppie, giocatori, dati del torneo. Inviti: link, codice, inviti con email, ruoli.
  const tabs = [['turno', 'Turno', ICONE.turno], ['classifica', 'Classifica', ICONE.classifica], ['storico', 'Storico', ICONE.storico], ['gruppo', 'Gruppo', ICONE.utenti], ['inviti', 'Inviti', ICONE.condividi]];
  let corpo = '';
  try {
    if (S.tab === 'turno') corpo = S.data.status === 'setup' ? vistaSetup() : S.data.status === 'finished' ? vistaFinale() : vistaTurno();
    else if (S.tab === 'classifica') corpo = vistaClassifica();
    else if (S.tab === 'storico') corpo = vistaStorico();
    else if (S.tab === 'gruppo') corpo = vistaAltro();
    else corpo = vistaGruppo();
  } catch (e) {
    // Una pagina che va in errore non deve sembrare "morta": lo dice e mostra il motivo.
    console.error(e);
    corpo = avviso('Questa pagina non si apre', `Si è verificato un errore: ${esc(e && e.message ? e.message : String(e))}. Manda uno screenshot di questo messaggio.`);
  }
  return `${testata({ sopra: isAdmin() ? 'Sorelle Burraco - admin' : 'Sorelle Burraco', titolo: S.meta.name || 'Torneo',
      sinistra: `<button class="icona-btn" data-azione="home" aria-label="Torna ai tornei">${ICONE.indietro}</button>`, destra: bottoneProfilo() })}
    <main class="contenuto">${bandaTorneo()}${corpo}</main>
    <nav class="nav">${tabs.map(([k, l, i]) => `<button class="${S.tab === k ? 'attivo' : ''}" data-azione="tab" data-tab="${k}">${i}${l}</button>`).join('')}</nav>`;
}

// ---------- Preparazione ----------
function vistaSetup() {
  if (!isAdmin()) {
    const pres = giocatoriPresenti().length;
    const conf = Object.keys(S.data.pairs).length;
    return `<section class="hero"><div class="arte"><div class="diag"></div><div class="rossa"></div>${OMINO}</div>
        <div class="testo"><span class="badge blu" style="align-self:flex-start">In preparazione</span><h2 class="titolo-m">Il torneo sta per iniziare</h2>
        <p class="testo-s">Qui compariranno tavoli, timer e risultati.</p></div><div class="piede"><span>${SEME.fiori}Fiori</span><span>${SEME.cuori}Cuori</span></div><div class="angolo"></div></section>
      <div class="tiles due">${tile('Giocatori presenti', pres, 'giallo')}${tile('Coppie', conf || '-')}</div>
      ${conf ? `<div class="sezione"><h2>Coppie</h2></div>${elencoCoppie()}` : ''}`;
  }
  const passi = [['torneo', 'Torneo'], ['giocatori', 'Giocatori'], ['coppie', 'Coppie']];
  let c = '';
  if (S.setupTab === 'torneo') c = setupTorneo();
  else if (S.setupTab === 'giocatori') c = setupGiocatori();
  else c = setupCoppie();
  return `<div class="segmenti">${passi.map(([k, l], i) => `<button class="${S.setupTab === k ? 'attivo' : ''}" data-azione="setup-tab" data-tab="${k}">${i + 1}. ${l}</button>`).join('')}</div>${c}`;
}

// Aggiorna subito inizio e fine previsti mentre si cambia l'ora, prima del salvataggio.
function aggiornaDurata() {
  const ora = document.getElementById('cfg-ora');
  const fine = document.getElementById('dur-fine');
  const ini = document.getElementById('dur-inizio');
  if (!ora || !fine || !ini || !S.data) return;
  const inizio = /^\d{1,2}:\d{2}/.test(ora.value) ? ora.value.slice(0, 5) : S.data.config.inizio;
  const c = { ...S.data.config, inizio };
  const nt = c.formato === 'eliminazione' ? (nCoppiePreviste() >= 2 ? E.turniEliminazione(nCoppiePreviste()) : 3) : c.turni;
  fine.textContent = `Fine ${E.formatOra(E.cronoprogramma(c, nt).fine)}`;
  ini.textContent = inizio;
}

function cardFormato(c) {
  const el = c.formato === 'eliminazione';
  const op = (k, nome, desc) => `<button class="opzione" role="radio" aria-checked="${(c.formato || 'punti') === k}" data-azione="cfg" data-k="formato" data-v="${k}">
    <span class="rombo"></span><span class="colonna cresce"><strong>${nome}</strong><span class="testo-s">${desc}</span></span></button>`;
  return card({ testa: 'Formato', testaCls: el ? 'rossa' : 'blu', corpo:
    op('punti', 'Punti vittoria (regolamento FIBur)', 'Turni a smazzate fisse, punti vittoria da 0 a 20, classifica unica.')
    + op('eliminazione', 'Eliminazione (serata tra amici)', 'Si gioca a tempo: al tavolo vince la coppia che fa più punti in totale. Chi vince va avanti, chi perde continua a giocare per i posti più bassi. Tutti giocano ogni turno.') });
}

function setupEliminazione() {
  const c = S.data.config;
  const n = nCoppiePreviste();
  const turni = E.turniEliminazione(n);
  const noti = n >= 2;
  const nt = noti ? turni : 3;
  const durata = E.durataPrevista(c, nt);
  const crono = E.cronoprogramma(c, nt);
  const conto = `${c.spiegazione} min di spiegazione, ${nt} turni da ${E.durataTurnoMin(c)}, ${nt - 1} cambi da ${c.cambio}, ${c.premiazione} min di premiazione`;
  return `
    ${card({ testa: 'Il torneo', testaCls: 'blu', corpo: `
      <div class="campo"><label for="cfg-nome">Nome del torneo</label><input id="cfg-nome" class="input" maxlength="80" value="${esc(S.meta.name)}"></div>
      <div class="griglia-2">
        <div class="campo"><label for="cfg-data">Data</label><input id="cfg-data" class="input" type="date" value="${esc(c.data)}"></div>
        <div class="campo"><label for="cfg-ora">Inizio</label><input id="cfg-ora" class="input" type="time" value="${esc(c.inizio)}"></div>
      </div>` })}
    ${cardFormato(c)}
    ${card({ testa: 'Minuti al tavolo', corpo: `
      <div class="stepper"><button data-azione="minuti" data-d="-5" aria-label="Meno minuti">-</button><output class="num">${c.minuti || 45}</output><button data-azione="minuti" data-d="5" aria-label="Più minuti">+</button></div>
      <p class="muto testo-s">Allo scadere del tempo non si inizia una nuova partita: si finisce quella in corso e si sommano i punti di tutte le partite giocate al tavolo.</p>` })}
    ${card({ testa: 'Come va avanti', corpo: `
      <p class="testo-s" style="margin:0">${n >= 2 ? `Con ${n} coppie si giocano <strong>${turni} turni</strong>.` : 'Il numero di turni dipende dalle coppie: lo vedi dopo le presenze.'}</p>
      <p class="testo-s" style="margin:0">Primo turno a sorte. Poi chi ha vinto gioca contro chi ha vinto e chi ha perso contro chi ha perso: semifinali, finale per il 1° posto, finale per il 3° posto e così via fino all'ultimo posto.</p>
      <p class="testo-s" style="margin:0">Se le vincenti sono dispari, si ripesca la perdente con più punti fatti in tutto il torneo. A pari punti al tavolo si gioca una mano di spareggio.</p>
      ${n >= 2 && n % 2 === 1 ? avviso('Coppie dispari', `Con ${n} coppie una resterebbe senza avversario: per l'eliminazione servono coppie pari.`) : ''}` })}
    ${card({ cls: 'gialla', corpo: `
      <div class="riga spazio"><span class="etichetta">Durata prevista${noti ? '' : ' con 8 coppie'}</span><span class="badge nero" id="dur-fine">Fine ${E.formatOra(crono.fine)}</span></div>
      <p class="titolo num">${E.formatDurata(durata)}</p>
      <p class="testo-s" style="margin:0">${noti ? '' : 'Esempio con 16 persone: la durata vera si calcola dopo le presenze. '}${conto}.</p>
      <div class="tiles orari">${tile('Turno', `${E.durataTurnoMin(c)}<small>min</small>`, 'bianco')}${tile('Cambio', `${c.cambio}<small>min</small>`, 'bianco')}${tile('Inizio', esc(c.inizio), 'bianco', 'dur-inizio')}</div>` })}
    <button class="btn primario blocco-w" data-azione="salva-config">Salva e continua ${ICONE.freccia}</button>`;
}

function setupTorneo() {
  const c = S.data.config;
  if (c.formato === 'eliminazione') return setupEliminazione();
  const n = nCoppiePreviste();
  const max = E.maxTurni(c.sistema, n);
  const sugg = E.sistemaSuggerito(n, c.turni);
  const durata = E.durataPrevista(c, c.turni);
  const crono = E.cronoprogramma(c, c.turni);
  const errTurni = n >= 2 && c.turni > max;
  return `
    ${card({ testa: 'Il torneo', testaCls: 'blu', corpo: `
      <div class="campo"><label for="cfg-nome">Nome del torneo</label><input id="cfg-nome" class="input" maxlength="80" value="${esc(S.meta.name)}"></div>
      <div class="griglia-2">
        <div class="campo"><label for="cfg-data">Data</label><input id="cfg-data" class="input" type="date" value="${esc(c.data)}"></div>
        <div class="campo"><label for="cfg-ora">Inizio</label><input id="cfg-ora" class="input" type="time" value="${esc(c.inizio)}"></div>
      </div>` })}
    ${cardFormato(c)}
    ${card({ testa: 'Smazzate e tempo', corpo: `
      <div class="segmenti">${SMAZZATE_AMMESSE.map((s) => `<button class="${c.smazzate === s ? 'attivo' : ''}" data-azione="cfg" data-k="smazzate" data-v="${s}">${s} smazzate<small>${TEMPI[s]} minuti</small></button>`).join('')}</div>
      <span class="etichetta">Riduzione del tempo</span>
      <div class="segmenti">${Array.from({ length: RIDUZIONE_MAX + 1 }, (_, r) => `<button class="${(c.riduzione || 0) === r ? 'attivo' : ''}" data-azione="cfg" data-k="riduzione" data-v="${r}">${r ? `-${r} min` : 'Nessuna'}</button>`).join('')}</div>
      <p class="muto testo-s">Il regolamento permette di ridurre il tempo fino a 2 minuti, avvisando all'inizio del torneo.</p>` })}
    ${card({ testa: 'Numero di turni', corpo: `
      <div class="stepper"><button data-azione="turni" data-d="-1" aria-label="Meno turni">-</button><output class="num">${c.turni}</output><button data-azione="turni" data-d="1" aria-label="Più turni">+</button></div>
      <p class="muto testo-s">${n === 2 ? 'Con 2 coppie è una sfida: si gioca sempre allo stesso tavolo, scegli quanti turni (fino a 20). Il sistema di abbinamento non cambia nulla.' : n >= 3 ? `Con ${n} coppie e il sistema scelto: massimo ${max >= 20 ? 'senza limite pratico' : `${max} turni`}.` : 'Il massimo dipende dal numero di coppie, che si conosce dopo le presenze.'}</p>
      ${errTurni ? avviso('Troppi turni', `Con ${n} coppie e il sistema ${SISTEMI[c.sistema].nome} si arriva al massimo a ${max} turni.`) : ''}` })}
    ${card({ testa: 'Sistema di abbinamento', corpo: Object.entries(SISTEMI).map(([k, s]) => {
      const mk = E.maxTurni(k, n);
      const ok = n < 3 || c.turni <= mk;
      return `<button class="opzione" role="radio" aria-checked="${c.sistema === k}" data-azione="cfg" data-k="sistema" data-v="${k}">
        <span class="rombo"></span><span class="colonna cresce"><span class="riga spazio"><strong>${s.nome}</strong>${n >= 3 && k === sugg ? '<span class="badge verde">Consigliato</span>' : ''}</span>
        <span class="testo-s">${s.descrizione}${n >= 3 && !ok ? ` Con ${n} coppie: massimo ${mk} turni.` : ''}</span></span></button>`;
    }).join('') })}
    ${card({ cls: 'gialla', corpo: `
      <div class="riga spazio"><span class="etichetta">Durata prevista</span><span class="badge nero" id="dur-fine">Fine ${E.formatOra(crono.fine)}</span></div>
      <p class="titolo num">${E.formatDurata(durata)}</p>
      <div class="tiles orari">${tile('Turno', `${E.durataTurnoMin(c)}<small>min</small>`, 'bianco')}${tile('Cambio', `${c.cambio}<small>min</small>`, 'bianco')}${tile('Inizio', esc(c.inizio), 'bianco', 'dur-inizio')}</div>` })}
    <button class="btn primario blocco-w" data-azione="salva-config">Salva e continua ${ICONE.freccia}</button>`;
}

function setupGiocatori() {
  const pl = Object.entries(S.data.players).sort((a, b) => a[1].name.localeCompare(b[1].name, 'it'));
  const pres = pl.filter(([, p]) => p.present).length;
  const bloccate = Object.keys(S.data.pairs).length > 0;
  return `
    ${card({ testa: 'Rilevazione presenze', testaCls: 'blu', destra: '<span class="badge giallo">Admin</span>', corpo: `
      <div class="tiles">${tile('Iscritti', pl.length)}${tile('Presenti', pres, 'giallo')}${tile('Assenti', pl.length - pres, pl.length - pres ? 'rosso' : '')}</div>
      ${bloccate ? avviso('Coppie confermate', 'Iscritti e presenze sono bloccati.', 'info') : `
      <div class="riga"><input id="nuovo-giocatore" class="input cresce" maxlength="40" placeholder="Nome e cognome" autocomplete="off" enterkeyhint="done">
      <button class="btn giallo" style="min-width:58px;padding:0" data-azione="aggiungi-giocatore" aria-label="Aggiungi">${ICONE.piu}</button></div>`}` })}
    ${pres % 2 === 1 ? avviso('Giocatori dispari', 'Aggiungi un sostituto o togli un giocatore per formare le coppie.') : ''}
    ${pl.length ? `<div class="elenco">${pl.map(([id, p], i) => `
      <div class="voce ${p.present ? '' : 'spento'}"><span class="n num">${String(i + 1).padStart(2, '0')}</span>
        <button class="cresce nome-p nome-tocca" data-azione="apri-rinomina" data-pid="${id}" aria-label="Rinomina ${esc(p.name)}"><span>${esc(p.name)}</span>${ICONE.matita}</button>
        <button class="stato-btn" role="switch" aria-checked="${!!p.present}" data-azione="presenza" data-id="${id}" ${bloccate ? 'disabled' : ''}>${p.present ? 'Presente' : 'Assente'}</button>
        ${bloccate ? '' : `<button class="icona-btn nudo" data-azione="rimuovi-giocatore" data-id="${id}" aria-label="Rimuovi ${esc(p.name)}">${ICONE.cestino}</button>`}
      </div>`).join('')}</div>` : card({ cls: 'crema', corpo: '<p>Aggiungi gli iscritti. Il giorno del torneo tocca "Presente" o "Assente" per ognuno.</p>' })}
    <button class="btn primario blocco-w" data-azione="setup-tab" data-tab="coppie" ${pres < 4 || pres % 2 ? 'disabled' : ''}>Forma le coppie ${ICONE.freccia}</button>
    ${pres < 4 ? '<p class="muto testo-s">Servono almeno 4 giocatori presenti (2 coppie).</p>' : ''}`;
}

function elencoCoppie() {
  const mia = miaCoppia();
  return `<div class="elenco">${S.data.order.slice().sort().map((id, i) => `
    <div class="voce ${S.data.pairs[id].ritiroDalTurno ? 'spento' : ''} ${mia === id ? 'mia' : ''}"><span class="n giallo num">${String(i + 1).padStart(2, '0')}</span>
      <span class="cresce"><span class="nome-p">${nomeCoppia(id)}</span>${sottoNomi(id, 'div')}</span>
      ${S.data.pairs[id].ritiroDalTurno ? '<span class="badge chiaro">Ritirata</span>' : mia === id ? '<span class="badge giallo">La tua</span>' : ''}</div>`).join('')}</div>`;
}

function setupCoppie() {
  const t = S.data;
  if (Object.keys(t.pairs).length) {
    const err = E.verificaAvvio(t);
    return `${avviso('Coppie confermate', `${t.order.length} coppie${t.order.length % 2 ? ': a ogni turno una coppia riposa' : ''}.`, 'ok')}
      ${elencoCoppie()}
      ${err.length ? avviso('Da correggere', `${err.map(esc).join(' ')} Correggi nella scheda "Torneo".`) : ''}
      ${card({ cls: 'gialla', corpo: `<div class="riga"><span class="mini-omino">${OMINO}</span><div class="colonna"><span class="etichetta">Pronto a partire</span>
        ${E.isElim(t) ? `<strong>Eliminazione</strong><span class="testo-s">${E.turniEliminazione(t.order.length)} turni da ${E.durataTurnoMin(t.config)} minuti</span>` : `<strong>${SISTEMI[t.config.sistema].nome}</strong><span class="testo-s">${t.config.turni} turni da ${t.config.smazzate} smazzate (${E.durataTurnoMin(t.config)} minuti)</span>`}</div></div>
        <button class="btn primario blocco-w" data-azione="avvia" ${err.length ? 'disabled' : ''}>Avvia il torneo ${ICONE.freccia}</button>` })}
      <button class="btn blocco-w" data-azione="sblocca-coppie">Modifica le coppie</button>`;
  }
  const pres = giocatoriPresenti();
  const draft = Object.values(t.draft.coppie || {});
  const usati = new Set(draft.flatMap((c) => [c.p1, c.p2]));
  const liberi = pres.filter((id) => !usati.has(id));
  const modo = t.draft.modo || 'casuale';
  const nomi = (id) => esc(t.players[id]?.name || '?');
  const erroreCoppie = draft.length ? E.verificaCoppie(draft.map((c) => [c.p1, c.p2]), pres, true) : null;
  const nCoppie = Math.floor(pres.length / 2);
  return `
    ${card({ testa: 'Metodo di composizione', destra: '<span class="badge rosso">Admin</span>', corpo: `
      <div class="metodi">${[['casuale', 'Casuale', ICONE.sorteggio], ['manuale', 'Manuale', ICONE.utenti], ['mista', 'Mista', ICONE.lucchetto]].map(([k, l, ic]) => `<button class="metodo ${modo === k ? 'attivo' : ''}" data-azione="modo-coppie" data-v="${k}">${ic}${l}</button>`).join('')}</div>
      <p class="testo-s muto">${modo === 'casuale' ? 'Tutte le coppie vengono estratte a sorte.' : modo === 'manuale' ? 'Tocca due giocatori per formare una coppia.' : 'Forma a mano le coppie da fissare, poi estrai a sorte le altre.'}</p>` })}
    ${card({ cls: 'gialla', corpo: `<div class="riga"><span class="mini-omino">${OMINO}</span><div class="colonna"><span class="etichetta rosso-t">Tavoli e coppie</span>
      <h3 class="titolo-m">${draft.length} coppie formate</h3><span class="testo-s">${liberi.length ? `${liberi.length} giocatori da abbinare` : 'Tutti i presenti sono abbinati'}</span></div></div>
      <div class="tiles">${tile('Tavoli', Math.floor(nCoppie / 2), 'bianco')}${tile('Giocatori', pres.length, 'bianco')}${tile('Riposo', nCoppie % 2 ? '1 coppia' : 'Nessuno', 'bianco').replace('class="val num"', 'class="val medio"')}</div>` })}
    ${liberi.length ? card({ testa: `Da abbinare (${liberi.length})`, corpo: `
      ${modo !== 'casuale' ? `<div class="chips">${liberi.map((id) => `<button class="chip ${S.selezione === id ? 'scelto' : ''}" data-azione="scegli" data-id="${id}">${nomi(id)}</button>`).join('')}</div>` : `<p class="testo-s">${liberi.map(nomi).join(', ')}</p>`}
      ${modo !== 'manuale' ? `<button class="btn giallo blocco-w" data-azione="estrai" ${liberi.length < 2 ? 'disabled' : ''}>${ICONE.sorteggio} ${modo === 'mista' ? 'Estrai le restanti' : 'Estrai le coppie'}</button>` : ''}` }) : ''}
    ${draft.length ? `<div class="elenco">${Object.entries(t.draft.coppie).map(([k, c], i) => `
      <div class="voce"><span class="n ${c.bloccata ? '' : 'giallo'} num">${String(i + 1).padStart(2, '0')}</span>
        <span class="cresce"><span class="etichetta">${c.bloccata ? 'Fissata a mano' : 'Estratta'}</span><br>${nomi(c.p1)} e ${nomi(c.p2)}</span>
        <button class="icona-btn nudo" data-azione="sciogli" data-k="${k}" aria-label="Sciogli la coppia">${ICONE.chiudi}</button></div>`).join('')}</div>` : ''}
    ${draft.length && modo !== 'manuale' ? `<button class="btn blocco-w" data-azione="ri-estrai">${ICONE.azzera} Estrai di nuovo</button>` : ''}
    ${pres.length % 2 ? avviso('Giocatori dispari', 'Sistema le presenze prima di confermare.') : ''}
    ${erroreCoppie ? avviso('Coppie da correggere', `${esc(erroreCoppie)} Sciogli le coppie sbagliate oppure usa "Estrai di nuovo".`) : ''}
    <button class="btn primario blocco-w" data-azione="conferma-coppie" ${liberi.length || draft.length < 2 || erroreCoppie ? 'disabled' : ''}>Conferma coppie ${ICONE.freccia}</button>
    <p class="muto testo-s">Dopo la conferma le coppie restano fisse per tutto il torneo.</p>`;
}

// ---------- Turno in corso ----------
function vistaTurno() {
  const t = S.data;
  const n = E.turnoCorrente(t);
  const r = t.rounds[n];
  const mia = miaCoppia();
  const mancanti = E.risultatiMancanti(r);
  const sm = t.config.smazzate;
  const elim = E.isElim(t);
  const timer = r.timer;
  const adm = isAdmin();
  const tavoli = Object.entries(r.tables).sort((a, b) => a[0] - b[0]);
  const fatti = tavoli.length - mancanti;
  const stato = !timer || !timer.startedAt ? 'Da avviare' : timer.pausedAt ? 'In pausa' : 'In corso';
  const pannello = card({ testa: 'Pannello del turno', testaCls: 'nera', destra: `<span class="badge ${stato === 'In corso' ? 'rosso' : 'giallo'}" id="timer-stato">${stato}</span>`, corpo: `
    <div class="riga spazio"><div class="colonna"><span class="etichetta blu-t">${elim ? 'Eliminazione' : SISTEMI[t.config.sistema].nome}</span><h2 class="titolo-m">Turno ${n} di ${t.config.turni}</h2></div>
      <span class="tile giallo" style="padding:8px 10px;text-align:center;flex:none;min-width:max-content"><span class="etichetta">${elim ? 'Minuti' : 'Smazzate'}</span><span class="val num" style="white-space:nowrap">${elim ? E.durataTurnoMin(t.config) : sm}</span></span></div>
    <div class="tiles">
      <div class="tile bianco" style="grid-column: span 2"><span class="etichetta">Tempo residuo</span><span class="timer num" id="timer-testo">${E.durataTurnoMin(t.config)}:00</span></div>
      ${tile('Risultati', `${fatti}<small>/${tavoli.length}</small>`)}
    </div>
    <div class="barra"><div id="timer-barra" style="width:0%"></div></div>
    <div class="colonna"><div class="riga spazio"><span class="etichetta">Risultati inseriti</span><span class="etichetta rosso-t">${Math.round((fatti / (tavoli.length || 1)) * 100)}%</span></div>
      <div class="barra-seg">${tavoli.map(([k]) => `<span class="${r.results[k] ? 'pieno' : ''}"></span>`).join('')}</div></div>` });
  const comandi = adm ? `<div class="sezione"><h2>Comandi</h2></div>
    ${!timer || !timer.startedAt ? `<button class="comando" data-azione="timer" data-v="avvia"><span class="ico">${ICONE.play}</span><span><span class="t">Avvia il timer</span><span class="s">Parte per tutti i telefoni insieme</span></span></button>`
      : timer.pausedAt ? `<button class="comando" data-azione="timer" data-v="riprendi"><span class="ico">${ICONE.play}</span><span><span class="t">Riprendi il timer</span><span class="s">Il tempo riparte da dove si era fermato</span></span></button>`
      : `<button class="comando" data-azione="timer" data-v="pausa"><span class="ico">${ICONE.pausa}</span><span><span class="t">Metti in pausa</span><span class="s">Per un imprevisto al tavolo</span></span></button>`}
    ${timer && timer.startedAt ? `<button class="comando bianco" data-azione="timer" data-v="azzera"><span class="ico">${ICONE.azzera}</span><span><span class="t">Azzera il timer</span><span class="s">Torna a ${E.durataTurnoMin(t.config)} minuti</span></span></button>` : ''}` : '';
  const listaTavoli = tavoli.map(([k, tb]) => {
    const res = r.results[k];
    const c = res ? (elim ? { elim: true } : E.calcolaPartita(res.a, res.b, sm)) : null;
    const miaQui = mia && (tb.a === mia || tb.b === mia);
    if (elim) return tavoloElim(t, n, k, tb, res, miaQui, adm);
    return `<section class="card ${miaQui ? 'mia' : ''}"><div class="testa ${c ? 'verde' : 'gialla'}"><span class="riga"><span class="numtav num">${String(k).padStart(2, '0')}</span><span class="etichetta">Tavolo${miaQui ? ' - il tuo' : ''}</span></span>
        <span class="badge ${c ? 'blu' : 'giallo'}">${c ? 'Inserito' : 'In attesa'}</span></div>
      <div class="corpo"><div class="vs-riga"><div><div class="chi">${nomeCoppia(tb.a)}${sottoNomi(tb.a, 'div')}<span class="vs">VS</span>${nomeCoppia(tb.b)}${sottoNomi(tb.b, 'div')}</div>
        ${c ? `<div class="nomi num">Punti ${fmtN(res.a)} - ${fmtN(res.b)}</div>` : ''}</div>
        <div class="vp-box"><div class="val num">${c ? `${c.vpA} - ${c.vpB}` : '-'}</div><div class="etichetta">V.P.</div></div></div>
        ${adm ? `<button class="btn ${c ? '' : 'giallo'} piccolo blocco-w" data-azione="apri-risultato" data-tav="${k}">${c ? `${ICONE.matita} Correggi risultato` : `${ICONE.piu} Inserisci risultato`}</button>` : ''}</div></section>`;
  }).join('');
  const riposi = Object.entries(r.byes).map(([id, motivo]) => card({ testa: 'A riposo', testaCls: 'blu', cls: mia === id ? 'mia' : '', corpo: `
    <div class="riga"><span class="mini-omino" style="width:52px;height:52px;background:var(--giallo)">${ICONE.luna}</span><div class="colonna"><strong>${nomeCoppia(id)}</strong>${sottoNomi(id, 'span')}
    <span class="testo-s muto">${motivo === 'ritiro' ? 'L\'avversaria si è ritirata. ' : ''}Riceve ${RIPOSO[sm].vp} V.P. e ${RIPOSO[sm].mp} M.P.</span></div></div>` })).join('');
  return `${pannello}${comandi}
    ${(r.avvisi || []).length && adm ? avviso('Nota', r.avvisi.map(esc).join(' '), 'info') : ''}
    <div class="sezione"><h2>Tavoli (${tavoli.length})</h2><span class="badge chiaro">${mancanti ? `${mancanti} in attesa` : 'Tutti inseriti'}</span></div>
    ${listaTavoli}${riposi}
    ${adm ? `<button class="comando rosso" data-azione="apri-chiudi-turno" ${mancanti ? 'disabled' : ''}><span class="ico">${ICONE.lucchetto}</span><span><span class="t">${n >= t.config.turni ? 'Chiudi l\'ultimo turno' : 'Chiudi il turno'}</span>
      <span class="s">${mancanti ? `Mancano ${mancanti} risultati` : n >= t.config.turni ? 'La classifica diventa definitiva' : `Genera gli abbinamenti del turno ${n + 1}`}</span></span></button>` : ''}`;
}

// Tavolo del torneo a eliminazione: fase, coppie, punti e chi va avanti.
function tavoloElim(t, n, k, tb, res, miaQui, adm) {
  const w = E.vincitore(res);
  const fase = E.etichettaTavolo(t, n, k);
  const lato = (id, l) => `<div class="elim-lato ${w === l ? 'vince' : w ? 'perde' : ''}"><span class="cresce"><span class="nome-c">${nomeCoppia(id)}</span>${sottoNomi(id, 'div')}</span>
    <span class="punti num">${res ? fmtN(res[l]) : '-'}</span></div>`;
  return `<section class="card ${miaQui ? 'mia' : ''}"><div class="testa ${res ? 'verde' : 'gialla'}"><span class="riga"><span class="numtav num">${String(k).padStart(2, '0')}</span><span class="etichetta">${esc(fase)}${miaQui ? ' - il tuo' : ''}</span></span>
      <span class="badge ${res ? 'blu' : 'giallo'}">${res ? 'Inserito' : 'In attesa'}</span></div>
    <div class="corpo">${lato(tb.a, 'a')}<span class="vs" style="align-self:flex-start">VS</span>${lato(tb.b, 'b')}
      ${res && res.a === res.b ? `<p class="testo-s" style="margin:0">Pari punti: ${nomeCoppia(w === 'a' ? tb.a : tb.b)} ha vinto la mano di spareggio.</p>` : ''}
      ${adm ? `<button class="btn ${res ? '' : 'giallo'} piccolo blocco-w" data-azione="apri-risultato" data-tav="${k}">${res ? `${ICONE.matita} Correggi risultato` : `${ICONE.piu} Inserisci risultato`}</button>` : ''}</div></section>`;
}

// ---------- Classifica ----------
function tabellaElim(cl, fine) {
  const mia = miaCoppia();
  return `<table class="classifica num"><thead><tr><th style="text-align:center">#</th><th>Coppia</th><th>V-P</th><th>Punti</th></tr></thead><tbody>
    ${cl.map((r) => `<tr class="${fine && r.pos === 1 ? 'primo' : ''} ${mia === r.id ? 'mia' : ''}">
      <td class="pos">${fine ? r.pos : ''}</td>
      <td><strong>${nomeCoppia(r.id)}</strong>${sottoNomi(r.id)}${r.ripescata ? `<small>Ripescata al turno ${r.ripescata}</small>` : ''}</td>
      <td>${r.vinte}-${r.perse}</td><td class="vp">${fmtN(r.fatti)}</td></tr>`).join('')}
    </tbody></table>`;
}

function fasePartita(et) {
  if (/^Finale 1°/.test(et)) return 'f-oro';
  if (/^Finale/.test(et)) return 'f-fin';
  if (/^Semifinale|^Quarti/.test(et)) return 'f-semi';
  if (/^Primo/.test(et)) return 'f-primo';
  return 'f-pos';
}

function partitaTab(p) {
  const fin = /^Finale (\d+)° e (\d+)°/.exec(p.etichetta);
  const premio = (l) => (fin && p.w ? (p.w === l ? `${fin[1]}°` : `${fin[2]}°`) : p.w === l ? 'Passa' : '');
  const riga = (id, l) => `<div class="tb-riga ${p.w === l ? 'vince' : p.w ? 'perde' : ''}"><span class="cresce nome">${nomeCoppia(id)}</span><span class="pt num">${p.res ? fmtN(p.res[l]) : '-'}</span>${premio(l) ? `<span class="premio">${premio(l)}</span>` : ''}</div>`;
  return `<div class="tb-partita ${fasePartita(p.etichetta)} ${p.w ? '' : 'aperta'}"><div class="tb-testa"><span>${esc(p.etichetta)}</span><span class="tav num">T${p.tav}</span></div>
    <div class="tb-corpo">${riga(p.a, 'a')}<span class="tb-vs">VS</span>${riga(p.b, 'b')}
    ${p.w && p.res.a === p.res.b ? `<span class="tb-esito">Pari punti: spareggio vinto da ${nomeCoppia(p.w === 'a' ? p.a : p.b)}</span>` : ''}${p.w ? '' : '<span class="tb-esito">Da giocare</span>'}</div></div>`;
}

function vistaTabellone(t) {
  const tb = E.tabellone(t);
  const turno = (n, interno) => `<div class="tb-turno"><div class="tb-n"><span>Turno</span><strong class="num">${n}</strong></div><div class="tb-lista">${interno}</div></div>`;
  const primo = `<section class="tb-sezione s-primo"><div class="tb-titolo"><span class="tb-rombo"></span><span>Primo turno a sorte</span><span class="tb-tag">${tb.primo.length} tavoli</span></div>
    ${turno(1, tb.primo.map(partitaTab).join(''))}</section>`;
  const sez = tb.sezioni.map((s, i) => `<section class="tb-sezione ${i === 0 ? 's-alto' : 's-basso'}"><div class="tb-titolo"><span class="tb-rombo"></span><span>Si giocano il ${s.da}°-${s.a}° posto</span><span class="tb-tag">${i === 0 ? 'Il titolo' : 'L\'onore'}</span></div>
    ${s.blocchi.map((b) => turno(b.n, b.partite ? b.partite.map(partitaTab).join('')
      : b.futuro.map((f) => `<div class="tb-partita futuro ${fasePartita(f.etichetta)}"><div class="tb-testa"><span>${esc(f.etichetta)}</span><span class="tav">?</span></div><div class="tb-corpo"><span class="testo-s">Giocano ${esc(f.testo)}</span></div></div>`).join(''))).join('')}
    </section>`).join('');
  return primo + sez;
}

function vistaClassificaElim(t) {
  const chiusi = E.turniChiusi(t);
  const seg = `<div class="segmenti"><button class="${S.classTab !== 'elenco' ? 'attivo' : ''}" data-azione="class-tab" data-v="tabellone">Tabellone</button><button class="${S.classTab === 'elenco' ? 'attivo' : ''}" data-azione="class-tab" data-v="elenco">Classifica</button></div>`;
  if (S.classTab !== 'elenco') return seg + vistaTabellone(t);
  if (!chiusi.length) return seg + card({ testa: 'Classifica', testaCls: 'gialla', corpo: `<div class="riga"><span class="mini-omino">${OMINO}</span><p>La classifica compare dopo la chiusura del primo turno.</p></div>` });
  const cl = E.classificaEliminazione(t);
  const mia = miaCoppia();
  const fine = t.status === 'finished';
  return `${seg}<div class="sezione"><h2>Classifica</h2><span class="badge ${fine ? 'giallo' : 'chiaro'}">${fine ? 'Finale' : `Dopo il turno ${chiusi[chiusi.length - 1]}`}</span></div>
    ${tabellaElim(cl, fine)}
    <p class="muto testo-s">${fine ? 'Le posizioni vengono dalle finali.' : 'Ordine provvisorio: prima chi ha vinto di più nel tabellone, poi i punti fatti. Le posizioni definitive escono dalle finali.'} V-P = partite vinte e perse. Punti = punti fatti in tutto il torneo.</p>`;
}

function tabellaClassifica(cl) {
  const mia = miaCoppia();
  return `<table class="classifica num"><thead><tr><th style="text-align:center">#</th><th>Coppia</th><th>V.P.</th><th>M.P.</th><th>G</th></tr></thead><tbody>
    ${cl.map((r) => `<tr class="${r.pos === 1 ? 'primo' : ''} ${mia === r.id ? 'mia' : ''}">
      <td class="pos">${r.pos}</td>
      <td><strong>${nomeCoppia(r.id)}</strong>${r.ritirata ? ' <span class="badge chiaro">Ritirata</span>' : ''}${sottoNomi(r.id)}${r.decisoDa ? `<small>Parità: ${r.decisoDa}</small>` : ''}</td>
      <td class="vp">${r.vp}</td><td>${fmt(r.mp)}</td><td>${r.giocate}${r.riposi ? `<small>+${r.riposi}R</small>` : ''}</td></tr>`).join('')}
  </tbody></table>`;
}

function vistaClassifica() {
  const t = S.data;
  if (E.isElim(t)) return vistaClassificaElim(t);
  const chiusi = E.turniChiusi(t);
  if (!chiusi.length) return card({ testa: 'Classifica', testaCls: 'gialla', corpo: `<div class="riga"><span class="mini-omino">${OMINO}</span><p>La classifica compare dopo la chiusura del primo turno.</p></div>` });
  const ult = chiusi[chiusi.length - 1];
  const cl = E.classifica(t);
  const mia = miaCoppia();
  const io = mia ? cl.find((r) => r.id === mia) : null;
  return `${io ? card({ testa: 'La tua coppia', testaCls: 'gialla', corpo: `<div class="riga spazio"><div class="colonna"><span class="titolo-m">${io.pos}° posto</span><span class="testo-s">${nomeCoppia(io.id)}</span></div>
      <div class="vp-box"><div class="val num">${io.vp}</div><div class="etichetta">V.P.</div></div></div>` }) : ''}
    <div class="sezione"><h2>Classifica</h2><span class="badge ${t.status === 'finished' ? 'giallo' : 'chiaro'}">${t.status === 'finished' ? 'Finale' : `Dopo il turno ${ult}`}</span></div>
    ${tabellaClassifica(cl)}
    <p class="muto testo-s">Ordine: V.P., poi M.P. A parità di entrambi: scontro diretto, partita vinta con il punteggio più alto, partita persa con il punteggio più favorevole, sorteggio. G = partite giocate, R = riposi.</p>`;
}

// ---------- Finale ----------
function vistaFinale() {
  const elim = E.isElim(S.data);
  const cl = elim ? E.classificaEliminazione(S.data) : E.classifica(S.data);
  const podio = [cl[1], cl[0], cl[2]];
  const g = (r, cls, posto) => (r ? `<div class="gradino ${cls}"><span class="posto">${posto}</span><strong class="chi">${nomeCoppia(r.id)}</strong>${sottoNomi(r.id, 'span')}<span class="num">${elim ? `<strong>${fmtN(r.fatti)}</strong> punti` : `<strong>${r.vp}</strong> V.P.`}</span></div>` : '<div></div>');
  return `<section class="hero"><div class="arte"><div class="diag"></div><div class="rossa"></div>${OMINO}</div>
      <div class="testo"><span class="badge rosso" style="align-self:flex-start">Classifica finale</span><h2 class="titolo-m">Torneo<br><span class="rosso-t">concluso</span></h2></div>
      <div class="piede"><span>${SEME.cuori}Cuori</span><span>${SEME.quadri}Quadri</span></div><div class="angolo"></div></section>
    <div class="podio${podio[2] ? "" : " due"}">${g(podio[0], 'g2', '2°')}${g(podio[1], 'g1', '1°')}${g(podio[2], 'g3', '3°')}</div>
    ${elim ? tabellaElim(cl, true) : tabellaClassifica(cl)}
    <div class="griglia-2"><button class="btn giallo" data-azione="condividi-classifica">${ICONE.condividi} Condividi</button>
      <button class="btn" data-azione="esporta">${ICONE.scarica} Esporta</button></div>`;
}

// ---------- Storico e regolamento ----------
function vistaStorico() {
  const t = S.data;
  const hero = `<section class="hero" style="min-height:190px"><div class="arte"><div class="diag"></div><div class="rossa"></div>${OMINO}</div>
    <div class="testo"><span class="badge rosso" style="align-self:flex-start">Registro</span><h2 class="titolo-m">Storico<br><span class="rosso-t">e regole</span></h2></div>
    <div class="piede"><span>${SEME.quadri}Quadri</span><span>${SEME.picche}Picche</span></div><div class="angolo"></div></section>`;
  const seg = `<div class="segmenti"><button class="${S.storicoTab === 'storico' ? 'attivo' : ''}" data-azione="storico-tab" data-v="storico">Storico partite</button><button class="${S.storicoTab === 'regolamento' ? 'attivo' : ''}" data-azione="storico-tab" data-v="regolamento">Regolamento</button></div>`;
  if (S.storicoTab === 'regolamento') return hero + seg + vistaRegolamento();
  const sm = t.config.smazzate;
  const turni = Object.values(t.rounds).sort((a, b) => b.n - a.n);
  const nomeMembro = (uid) => esc(S.members[uid]?.name || '');
  const elim = E.isElim(t);
  return hero + seg + (turni.length ? turni.map((r) => card({ testa: `Turno ${r.n} - ${elim ? 'Eliminazione' : SISTEMI[t.config.sistema].nome}`, testaCls: r.closed ? '' : 'rossa',
    destra: `<span class="badge ${r.closed ? 'chiaro' : 'giallo'}">${r.closed ? 'Chiuso' : 'In corso'}</span>`, corpo: `
    ${Object.entries(r.tables).sort((a, b) => a[0] - b[0]).map(([k, tb]) => {
      const res = r.results[k];
      if (elim) {
        const w = E.vincitore(res);
        const mani = res && res.mani ? res.mani.a.map((x, i) => `${fmtN(x)}-${fmtN(res.mani.b[i])}`).join(', ') : '';
        return `<div style="border-top:2px solid var(--crema-2);padding-top:12px" class="colonna"><span class="etichetta">Tavolo ${k} - ${esc(E.etichettaTavolo(t, r.n, k))}</span>
          <div class="chi" style="font-weight:700">${nomeCoppia(tb.a)} <span class="vs">VS</span> ${nomeCoppia(tb.b)}</div>
          <div class="nomi num muto testo-s">${res ? `Punti ${fmtN(res.a)} - ${fmtN(res.b)}${mani ? ` (partite: ${mani})` : ''}<br>Vince ${nomeCoppia(w === 'a' ? tb.a : tb.b)}${res.a === res.b ? ' alla mano di spareggio' : ''}` : 'Risultato non ancora inserito'}${res && res.by ? `<br>Inserito da ${nomeMembro(res.by)}` : ''}</div></div>`;
      }
      const c = res ? E.calcolaPartita(res.a, res.b, sm) : null;
      return `<div class="vs-riga" style="border-top:2px solid var(--crema-2);padding-top:12px"><div><div class="chi">${nomeCoppia(tb.a)}<span class="vs">VS</span>${nomeCoppia(tb.b)}</div>
        <div class="nomi num">Tavolo ${k}${c ? ` - punti ${fmtN(res.a)} - ${fmtN(res.b)} - M.P. ${fmt(c.mpA)}` : ''}${res && res.by ? `<br>Inserito da ${nomeMembro(res.by)}` : ''}</div></div>
        <div class="vp-box"><div class="val num">${c ? `${c.vpA} - ${c.vpB}` : '-'}</div><div class="etichetta">V.P.</div></div></div>`;
    }).join('')}
    ${Object.entries(r.byes).map(([id, m]) => `<p class="testo-s"><span class="badge blu">Riposo</span> ${nomeCoppia(id)} (${m === 'ritiro' ? 'avversaria ritirata' : 'coppie dispari'}): ${RIPOSO[sm].vp} V.P. e ${RIPOSO[sm].mp} M.P.</p>`).join('')}
    ${Object.values(t.pairs).filter((p) => p.ritiroDalTurno === r.n).map((p) => `<p class="testo-s"><span class="badge rosso">Ritiro</span> ${nomeCoppia(p.id)} non gioca dal turno ${r.n}.</p>`).join('')}
    ${Object.values(t.pairs).flatMap((p) => Object.values(p.sostituzioni || {}).filter((x) => x.turno === r.n).map((x) => `<p class="testo-s"><span class="badge giallo">Sostituzione</span> ${esc(x.esceNome)} lascia il posto a ${esc(x.entraNome)} (${nomeCoppia(p.id)}).</p>`)).join('')}` })).join('')
    : card({ cls: 'crema', corpo: '<p>Le partite compaiono qui dopo l\'avvio del torneo.</p>' }));
}

function vistaRegolamento() {
  const c = S.data.config;
  if (c.formato === 'eliminazione') return card({ testa: 'Questo torneo: eliminazione', testaCls: 'rossa', corpo: `
      <p style="margin:0"><strong>Al tavolo</strong> si gioca per ${E.durataTurnoMin(c)} minuti. Allo scadere non si inizia una nuova partita: si finisce quella in corso. Si sommano i punti di tutte le partite giocate e vince la coppia che ne ha fatti di più.</p>
      <p style="margin:0"><strong>Pari punti:</strong> si gioca una mano di spareggio e chi la vince passa.</p>
      <p style="margin:0"><strong>Tabellone:</strong> il primo turno è a sorte. Poi chi ha vinto gioca contro chi ha vinto e chi ha perso contro chi ha perso, fino alle finali: 1° e 2° posto tra chi vince le semifinali, 3° e 4° tra chi le perde, e così via per tutti i posti. Tutti giocano ogni turno.</p>
      <p style="margin:0"><strong>Ripescaggio:</strong> se in un gruppo le coppie sono dispari, entra la coppia del gruppo sotto con più punti fatti in tutto il torneo.</p>
      <p class="muto testo-s" style="margin:0">Formato della serata tra amici, non del regolamento FIBur.</p>` });
  const tab = TABELLE_VP[c.smazzate];
  let prec = -5;
  return `
    ${card({ testa: 'Questo torneo', testaCls: 'blu', corpo: `
      <p><strong>${SISTEMI[c.sistema].nome}</strong>: ${SISTEMI[c.sistema].descrizione}</p>
      <div class="tiles">${tile('Turni', c.turni, 'giallo')}${tile('Smazzate', c.smazzate)}${tile('Minuti', E.durataTurnoMin(c))}</div>
      <p class="testo-s">Allo scadere del tempo non si inizia una nuova smazzata: si gioca l'ultimo giro previsto dal regolamento e, se nessuno chiude, nessuna coppia prende i 100 punti di chiusura.</p>` })}
    ${card({ testa: 'Punti vittoria', corpo: `
      <p class="testo-s">La differenza tra i punti delle due coppie (M.P.) si converte in V.P. Il totale per tavolo fa sempre 20.</p>
      <table class="classifica num" style="box-shadow:none"><thead><tr><th style="text-align:left">Differenza M.P.</th><th>V.P.</th></tr></thead><tbody>
      ${tab.map(([max, vp]) => { const da = prec + 5; prec = max; return `<tr><td style="text-align:left">${max === Infinity ? `${fmtN(da)} e oltre` : `${fmtN(da)} - ${fmtN(max)}`}</td><td class="vp">${vp} - ${20 - vp}</td></tr>`; }).join('')}
      </tbody></table>` })}
    ${card({ testa: 'Riposo e ritiri', corpo: `
      <p class="testo-s">Con coppie dispari, a ogni turno una coppia riposa e riceve ${RIPOSO[c.smazzate].vp} V.P. e ${RIPOSO[c.smazzate].mp} M.P. Una coppia può riposare una sola volta. Con il sistema danese riposa l'ultima in classifica che non ha ancora riposato (al primo turno, per sorteggio).</p>
      <p class="testo-s">Se una coppia si ritira, i risultati già giocati restano validi e chi doveva incontrarla riceve il punteggio di riposo.</p>` })}
    ${card({ testa: 'Classifica e parità', corpo: `<ol style="margin:0;padding-left:20px">${CRITERI_PARITA.map((x) => `<li>${x}</li>`).join('')}</ol>` })}
    ${card({ testa: 'Fonti', cls: 'crema', corpo: FONTI.map((f) => `<p class="testo-s muto">${f}</p>`).join('') })}`;
}

// ---------- Gruppo ----------
function vistaGruppo() {
  const adm = isAdmin();
  const owner = S.meta.owner;
  const membri = Object.entries(S.members).sort((a, b) => (a[0] === owner ? -1 : b[0] === owner ? 1 : 0)
    || (a[1].role === 'admin' ? -1 : 1) - (b[1].role === 'admin' ? -1 : 1) || (a[1].name || '').localeCompare(b[1].name || '', 'it'));
  const nAdmin = membri.filter(([, m]) => m.role === 'admin').length;
  return `
    ${card({ testa: 'Invita persone', testaCls: 'rossa', corpo: `
      <p class="testo-s" style="margin:0">Chi riceve il link entra con Google o con l'email e vede tutto dal vivo: tavoli, punteggi, classifica, timer.</p>
      <button class="btn primario blocco-w" data-azione="condividi-codice">${ICONE.condividi} Invita</button>
      <p class="muto testo-s" style="margin:-6px 0 0">Si apre la condivisione del telefono: WhatsApp, SMS, mail.</p>
      <div class="codice-box codice-riga"><span class="cresce"><span class="etichetta">Codice</span><br><span class="codice-m num">${esc(S.meta.code || '')}</span></span>
        <div class="griglia-2"><button class="btn piccolo" data-azione="copia-solo-codice">${ICONE.copia} Copia codice</button><button class="btn piccolo" data-azione="copia-codice">${ICONE.copia} Copia link</button></div></div>
      <p class="muto testo-s" style="margin:0">Chi ha già l'app può incollare il codice in "Entra con codice", nella home.</p>` })}
    ${adm && S.store.mode ? card({ testa: 'Invita dentro l\'app', corpo: `
      <p class="testo-s" style="margin:0">${S.store.mode === 'prova' ? 'In modalità prova scrivi il nome con cui l\'altra persona entra.' : 'Per chi usa già l\'app: scrivi l\'email con cui accede. Trova l\'invito appena apre l\'app e, se ha attivato le notifiche, riceve un avviso sul telefono.'}</p>
      <div class="campo"><label for="invito-email">${S.store.mode === 'prova' ? 'Nome' : 'Email'}</label><input id="invito-email" class="input" type="${S.store.mode === 'prova' ? 'text' : 'email'}" inputmode="${S.store.mode === 'prova' ? 'text' : 'email'}" autocomplete="off" autocapitalize="off" maxlength="80" placeholder="${S.store.mode === 'prova' ? 'Es. Natasha' : 'nome@esempio.it'}"></div>
      <button class="btn primario blocco-w" data-azione="invita-email">Invita</button>
      ${Object.keys(S.invitiTorneo || {}).length ? `<div class="sezione" style="margin-top:4px"><h2>In attesa (${Object.keys(S.invitiTorneo).length})</h2></div>
        <div class="elenco">${Object.entries(S.invitiTorneo).sort((a, b) => b[1].at - a[1].at).map(([k, v]) => `<div class="voce"><span class="cresce nome-p" style="overflow-wrap:break-word">${esc(v.email)}</span><button class="btn piccolo" data-azione="annulla-invito" data-k="${esc(k)}">Annulla</button></div>`).join('')}</div>` : ''}` }) : ''}
    <div class="sezione"><h2>Persone (${membri.length})</h2><span class="badge chiaro">${nAdmin} admin</span></div>
    <div class="elenco">${membri.map(([uid, m], i) => {
      const admin = m.role === 'admin';
      const tu = uid === S.user.uid;
      const creatore = uid === owner;
      return `<section class="card"><div class="corpo">
        <div class="persona"><span class="n ${admin ? '' : 'giallo'} num">${String(i + 1).padStart(2, '0')}</span>
          <span class="cresce"><span class="nome">${esc(m.name || 'Senza nome')}${tu ? ' (tu)' : ''}</span><br><span class="etichetta ${admin ? 'blu-t' : 'muto'}">${admin ? 'Admin' : 'Partecipante'}${creatore ? ' - ha creato il torneo' : ''}</span></span></div>
        ${!adm ? '' : creatore ? `<p class="muto testo-s" style="margin:0">${tu ? 'Hai creato il torneo: resti sempre admin.' : 'Ha creato il torneo: resta sempre admin.'}</p>`
          : `<div class="griglia-2"><button class="btn piccolo ${admin ? '' : 'giallo'}" data-azione="ruolo" data-uid="${uid}">${admin ? 'Rendi partecipante' : 'Rendi admin'}</button>
            ${tu ? `<button class="btn piccolo" data-azione="lascia-conferma">${ICONE.esci} Esci</button>` : `<button class="btn piccolo primario" data-azione="apri-rimuovi" data-uid="${uid}">${ICONE.cestino} Rimuovi</button>`}</div>`}
      </div></section>`;
    }).join('')}</div>
    <p class="muto testo-s">Admin: inserisce punti, gestisce coppie e turni. Partecipante: guarda soltanto.${adm ? ' Chi entra con il link parte sempre come partecipante.' : ''}</p>`;
}

// ---------- Altro ----------
function vistaAltro() {
  const t = S.data;
  const adm = isAdmin();
  const mioPlayer = S.members[S.user.uid]?.player || '';
  const giocatori = Object.entries(t.players).sort((a, b) => a[1].name.localeCompare(b[1].name, 'it'));
  const attive = t.status === 'running' ? E.coppieAttive(t, E.turnoCorrente(t)) : [];
  return `
    ${card({ testa: 'Chi sei?', corpo: `
      <p class="testo-s muto">Scegli il tuo nome per vedere evidenziati il tuo tavolo e la tua coppia.</p>
      <select class="input" data-campo="mio-player" id="mio-player"><option value="">Non gioco / non indicato</option>
        ${giocatori.map(([id, p]) => `<option value="${id}" ${mioPlayer === id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` })}
    ${adm && t.order.length ? `<div class="sezione"><h2>Coppie e giocatori</h2><span class="badge chiaro">${t.order.length} coppie</span></div>
    <div class="elenco">${t.order.slice().sort((a, b) => testoCoppia(a).localeCompare(testoCoppia(b), 'it')).map((id) => {
      const p = t.pairs[id];
      const rit = !!p.ritiroDalTurno;
      const attiva = t.status === 'running' && !rit;
      return `<section class="card"><div class="testa ${rit ? '' : 'gialla'}"><span class="etichetta">${nomeCoppia(id)}</span>${rit ? '<span class="badge chiaro">Ritirata</span>' : ''}</div><div class="corpo">
        ${[p.p1, p.p2].map((pid) => `<div class="colonna" style="gap:8px"><span class="nome-p">${esc(t.players[pid]?.name || '?')}</span>
          <div class="griglia-2"><button class="btn piccolo" data-azione="apri-rinomina" data-pid="${pid}">${ICONE.matita} Rinomina</button>
          ${attiva ? `<button class="btn piccolo giallo" data-azione="apri-sostituisci" data-id="${id}" data-pid="${pid}">${ICONE.utenti} Sostituisci</button>` : '<span></span>'}</div></div>`).join('')}
        <div class="griglia-2"><button class="btn piccolo" data-azione="apri-soprannome" data-id="${id}">${p.nick ? 'Soprannome' : 'Dai un soprannome'}</button>
        ${attiva && !E.isElim(t) ? `<button class="btn piccolo primario" data-azione="apri-ritiro" data-id="${id}">Ritira la coppia</button>` : '<span></span>'}</div>
      </div></section>`;
    }).join('')}</div>
    <p class="muto testo-s">Sostituzione: secondo il codice di gara è ammessa una sola volta per coppia, ed è consentito solo il ritorno del giocatore titolare. Ritiro: i risultati giocati restano validi, chi doveva incontrare la coppia riceve il riposo.</p>` : ''}
    ${adm && Object.keys(t.players || {}).length ? card({ testa: 'Nuovo torneo con gli stessi giocatori', corpo: `
      <p class="testo-s" style="margin:0">Crea un torneo nuovo con tutti i giocatori di questo (${Object.keys(t.players).length}), già segnati come presenti. Le coppie le formi da capo (manuali, casuali o miste) e scegli di nuovo il formato: eliminazione o punti, smazzate, minuti. Questo torneo resta com'è.</p>
      <p class="muto testo-s" style="margin:0">Nel nuovo torneo l'admin sei tu: gli altri admin vanno invitati con il nuovo codice.</p>
      <button class="btn blocco-w" data-azione="apri-duplica">${ICONE.piu} Crea con questi giocatori</button>` }) : ''}
    ${card({ testa: 'Dati', corpo: `
      <button class="btn blocco-w" data-azione="esporta">${ICONE.scarica} Esporta il torneo (JSON)</button>
      ${adm ? `<button class="btn primario blocco-w" data-azione="apri-elimina">${ICONE.cestino} Elimina il torneo</button>` : `<button class="btn blocco-w" data-azione="lascia">Togli dai miei tornei</button>`}` })}`;
}

// ================= Fogli (modali) =================
// Blocca lo scorrimento della pagina sotto il foglio (anche su iPhone, dove overflow:hidden non basta).
let scrollBloccato = null;
function bloccaPagina() {
  if (scrollBloccato !== null) return;
  scrollBloccato = window.scrollY;
  document.body.style.top = `-${scrollBloccato}px`;
  document.body.classList.add('bloccato');
}
function sbloccaPagina() {
  if (scrollBloccato === null) return;
  const y = scrollBloccato;
  scrollBloccato = null;
  document.body.classList.remove('bloccato');
  document.body.style.top = '';
  window.scrollTo(0, y);
}

function apriFoglio(tipo, dati = {}) { S.sheet = { tipo, ...dati }; renderFoglio(); }
function chiudiFoglio() { S.sheet = null; renderFoglio(); }

function renderFoglio() {
  const f = S.sheet;
  if (!f) { $foglio.innerHTML = ''; sbloccaPagina(); return; }
  bloccaPagina();
  let c = '';
  if (f.tipo === 'crea') {
    c = `<h2 class="titolo">Nuovo torneo</h2>
      <div class="campo"><label for="crea-nome">Nome del torneo</label><input id="crea-nome" class="input" maxlength="80" placeholder="Es. Burraco del sabato"></div>
      <div class="campo"><label for="crea-data">Data</label><input id="crea-data" class="input" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
      <button class="btn primario blocco-w" data-azione="crea">Crea torneo ${ICONE.freccia}</button>`;
  } else if (f.tipo === 'duplica') {
    const n = Object.keys(S.data.players || {}).length;
    c = `<h2 class="titolo">Nuovo torneo</h2>
      <p style="margin:0">Con gli stessi ${n} giocatori di <strong>${esc(S.meta.name || '')}</strong>.</p>
      <div class="campo"><label for="crea-nome">Nome del nuovo torneo</label><input id="crea-nome" class="input" maxlength="80" value="${esc(nomeSeguente(S.meta.name || 'Torneo'))}"></div>
      <div class="campo"><label for="crea-data">Data</label><input id="crea-data" class="input" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
      <button class="btn primario blocco-w" data-azione="duplica">Crea torneo ${ICONE.freccia}</button>`;
  } else if (f.tipo === 'entra') {
    c = `<h2 class="titolo">Entra con codice</h2>
      <div class="campo"><label for="entra-codice">Codice invito</label><input id="entra-codice" class="input grande" maxlength="7" placeholder="SB-XXXX" autocapitalize="characters" autocomplete="off" value="${esc(f.codice || '')}"></div>
      <button class="btn primario blocco-w" data-azione="entra">Entra ${ICONE.freccia}</button>`;
  } else if (f.tipo === 'risultato' && E.isElim(S.data)) {
    const r = S.data.rounds[f.turno];
    const tb = r.tables[f.tav];
    if (!f.mani) {
      const res = r.results[f.tav];
      f.mani = res && res.mani ? { a: res.mani.a.map(String), b: res.mani.b.map(String) } : res ? { a: [String(res.a)], b: [String(res.b)] } : { a: ['', '', ''], b: ['', '', ''] };
      f.spareggio = res && res.spareggio ? res.spareggio : null;
    }
    const cella = (l, i) => `<div class="mano-cella"><input class="input num mano" data-lato="${l}" data-i="${i}" inputmode="numeric" pattern="-?[0-9]*" value="${esc(f.mani[l][i])}" placeholder="0" aria-label="${esc(testoCoppia(tb[l]))}, partita ${i + 1}"><button class="segno" data-azione="segno" data-lato="${l}" data-i="${i}" aria-label="Cambia segno">+/-</button></div>`;
    c = `<h2 class="titolo">Tavolo ${f.tav} - Turno ${f.turno}</h2>
      <span class="etichetta blu-t">${esc(E.etichettaTavolo(S.data, f.turno, f.tav))}</span>
      <p class="testo-s" style="margin:0">Scrivi i punti di ogni partita giocata al tavolo: l'app fa la somma.</p>
      <div class="mani"><div class="mani-intest"><span></span><strong>${nomeCoppia(tb.a)}</strong><strong>${nomeCoppia(tb.b)}</strong></div>
        ${f.mani.a.map((_, i) => `<div class="mani-riga"><span class="etichetta">${i + 1}ª</span>${cella('a', i)}${cella('b', i)}</div>`).join('')}
        <div class="mani-riga totale"><span class="etichetta">Tot.</span><input id="ris-a" class="input num" readonly tabindex="-1"><input id="ris-b" class="input num" readonly tabindex="-1"></div></div>
      <button class="btn piccolo" data-azione="aggiungi-partita">${ICONE.piu} Aggiungi partita</button>
      <div class="card gialla"><div class="corpo" id="anteprima"></div></div>
      <div class="griglia-2"><button class="btn" data-azione="chiudi-foglio">Annulla</button><button class="btn primario" data-azione="salva-risultato">Salva</button></div>`;
  } else if (f.tipo === 'risultato') {
    const r = S.data.rounds[f.turno];
    const tb = r.tables[f.tav];
    const res = r.results[f.tav];
    const sm = S.data.config.smazzate;
    c = `<h2 class="titolo">Tavolo ${f.tav} - Turno ${f.turno}</h2>
      <div class="griglia-2">
        <div class="campo"><label for="ris-a">${nomeCoppia(tb.a)}</label><input id="ris-a" class="input grande num" inputmode="numeric" pattern="-?[0-9]*" value="${res ? res.a : ''}" placeholder="0"></div>
        <div class="campo"><label for="ris-b">${nomeCoppia(tb.b)}</label><input id="ris-b" class="input grande num" inputmode="numeric" pattern="-?[0-9]*" value="${res ? res.b : ''}" placeholder="0"></div>
      </div>
      <button class="link" data-azione="dettaglio-smazzate">${f.dettaglio ? 'Nascondi il dettaglio' : 'Inserisci smazzata per smazzata'}</button>
      ${f.dettaglio ? `<div class="colonna" style="gap:8px">${Array.from({ length: sm }, (_, i) => `<div class="griglia-2"><input class="input num smz" data-lato="a" inputmode="numeric" placeholder="Smazzata ${i + 1}" aria-label="${esc(testoCoppia(tb.a))}, smazzata ${i + 1}"><input class="input num smz" data-lato="b" inputmode="numeric" placeholder="Smazzata ${i + 1}" aria-label="${esc(testoCoppia(tb.b))}, smazzata ${i + 1}"></div>`).join('')}</div>` : ''}
      <p class="muto testo-s">Punti totali del turno, anche negativi. Il Burraco usa multipli di 5.</p>
      <div class="card gialla"><div class="corpo" id="anteprima"></div></div>
      <div class="griglia-2"><button class="btn" data-azione="chiudi-foglio">Annulla</button><button class="btn primario" data-azione="salva-risultato">Salva</button></div>`;
  } else if (f.tipo === 'rinomina') {
    const pl = S.data.players[f.pid];
    c = `<h2 class="titolo-m">Rinomina giocatore</h2>
      <div class="campo"><label for="rin-nome">Nome e cognome</label><input id="rin-nome" class="input" maxlength="40" value="${esc(pl?.name || '')}" autocomplete="off"></div>
      <p class="muto testo-s">Cambia solo il nome: coppie, risultati e classifica restano uguali.</p>
      <div class="griglia-2"><button class="btn" data-azione="chiudi-foglio">Annulla</button><button class="btn primario" data-azione="salva-rinomina">Salva</button></div>`;
  } else if (f.tipo === 'soprannome') {
    const pr = S.data.pairs[f.id];
    c = `<h2 class="titolo-m">Soprannome della coppia</h2><p>${nomiCoppia(f.id)}</p>
      <div class="campo"><label for="nick">Soprannome (facoltativo)</label><input id="nick" class="input" maxlength="30" value="${esc(pr?.nick || '')}" placeholder="Es. Le Pinelle" autocomplete="off"></div>
      <p class="muto testo-s">Se lo lasci vuoto, la coppia viene mostrata con i due nomi.</p>
      <div class="griglia-2"><button class="btn" data-azione="chiudi-foglio">Annulla</button><button class="btn primario" data-azione="salva-soprannome">Salva</button></div>`;
  } else if (f.tipo === 'sostituisci') {
    const t = S.data; const pr = t.pairs[f.id];
    const occupati = new Set(E.coppieAttive(t, E.turnoCorrente(t)).flatMap((id) => [t.pairs[id].p1, t.pairs[id].p2]));
    const riserve = Object.entries(t.players).filter(([pid]) => !occupati.has(pid)).sort((a, b) => a[1].name.localeCompare(b[1].name, 'it'));
    const gia = Object.keys(pr.sostituzioni || {}).length;
    c = `<h2 class="titolo-m">Sostituzione</h2>
      <p>Esce <strong>${esc(t.players[f.pid]?.name)}</strong> da ${nomeCoppia(f.id)}. La coppia tiene tutti i suoi punti.</p>
      ${gia ? avviso('Attenzione', 'Questa coppia ha già fatto una sostituzione: il regolamento consente solo il ritorno del giocatore titolare.', 'info') : ''}
      ${riserve.length ? `<div class="campo"><label for="sost-riserva">Entra un giocatore già in elenco</label><select id="sost-riserva" class="input"><option value="">Nessuno</option>
        ${riserve.map(([pid, p]) => `<option value="${pid}">${esc(p.name)}${pr.titolari && Object.values(pr.titolari).includes(pid) ? ' (titolare)' : ''}</option>`).join('')}</select></div>
      <div class="separatore"><i></i><span class="etichetta">oppure</span><i class="g"></i></div>` : ''}
      <div class="campo"><label for="sost-nuovo">Entra una riserva nuova</label><input id="sost-nuovo" class="input" maxlength="40" placeholder="Nome e cognome" autocomplete="off"></div>
      <div class="griglia-2"><button class="btn" data-azione="chiudi-foglio">Annulla</button><button class="btn primario" data-azione="salva-sostituzione">Conferma</button></div>`;
  } else if (f.tipo === 'conferma') {
    c = `<h2 class="titolo">${esc(f.titolo)}</h2><p>${esc(f.testo)}</p>
      ${f.casella ? `<label class="casella"><input type="checkbox" id="conferma-casella"> ${esc(f.casella)}</label>` : ''}
      ${f.digitare ? `<div class="campo"><label for="conferma-testo">Scrivi ${esc(f.digitare)} per confermare</label><input id="conferma-testo" class="input" autocomplete="off"></div>` : ''}
      <div class="griglia-2"><button class="btn" data-azione="chiudi-foglio">Annulla</button><button class="btn primario" data-azione="conferma-ok">${esc(f.ok || 'Conferma')}</button></div>`;
  }
  $foglio.innerHTML = `<div class="velo" data-azione="velo"><div class="foglio" role="dialog" aria-modal="true">
    <button class="icona-btn chiudi" data-azione="chiudi-foglio" aria-label="Chiudi">${ICONE.chiudi}</button>${c}</div></div>`;
  if (f.tipo === 'risultato') aggiornaAnteprima();
  adattaTesti($foglio);
  const primo = $foglio.querySelector('input');
  if (primo && f.tipo !== 'risultato') setTimeout(() => primo.focus(), 50);
}

function leggiNumero(v) {
  const s = String(v ?? '').trim().replace(/\./g, '').replace(',', '.');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

function totaliMani(f) {
  const tot = { a: 0, b: 0 }; let righe = 0;
  f.mani.a.forEach((_, i) => {
    const x = leggiNumero(f.mani.a[i]); const y = leggiNumero(f.mani.b[i]);
    if ((x === null || Number.isNaN(x)) && (y === null || Number.isNaN(y))) return;
    righe++;
    tot.a += Number.isFinite(x) ? x : 0; tot.b += Number.isFinite(y) ? y : 0;
  });
  return { ...tot, righe };
}

function anteprimaElim(el, f, tb) {
  const t = totaliMani(f);
  document.getElementById('ris-a').value = t.righe ? fmtN(t.a) : '';
  document.getElementById('ris-b').value = t.righe ? fmtN(t.b) : '';
  if (!t.righe) { el.innerHTML = '<p style="margin:0">Inserisci i punti delle partite per vedere chi vince.</p>'; return; }
  const multipli = [...f.mani.a, ...f.mani.b].every((v) => { const n = leggiNumero(v); return n === null || Number.isNaN(n) || n % 5 === 0; });
  const att = multipli ? '' : '<p style="margin:0"><strong>Attenzione:</strong> qualche punteggio non è multiplo di 5. Controlla.</p>';
  if (t.a === t.b) {
    el.innerHTML = `<p class="etichetta" style="color:var(--ink);margin:0">Pari punti: ${fmtN(t.a)} a ${fmtN(t.b)}</p>
      <p style="margin:0">Si gioca una mano di spareggio. Chi l'ha vinta?</p>
      <div class="segmenti"><button class="${f.spareggio === 'a' ? 'attivo' : ''}" data-azione="spareggio" data-v="a">${nomeCoppia(tb.a)}</button><button class="${f.spareggio === 'b' ? 'attivo' : ''}" data-azione="spareggio" data-v="b">${nomeCoppia(tb.b)}</button></div>${att}`;
    return;
  }
  const w = t.a > t.b ? tb.a : tb.b;
  el.innerHTML = `<p class="etichetta" style="color:var(--ink);margin:0">Anteprima</p><p style="margin:0">Vince <strong>${nomeCoppia(w)}</strong> di ${fmtN(Math.abs(t.a - t.b))} punti.</p>${att}`;
}

function aggiornaAnteprima() {
  const el = document.getElementById('anteprima');
  if (!el) return;
  const f = S.sheet;
  const tb = S.data.rounds[f.turno].tables[f.tav];
  if (E.isElim(S.data) && f.mani) return anteprimaElim(el, f, tb);
  const a = leggiNumero(document.getElementById('ris-a').value);
  const b = leggiNumero(document.getElementById('ris-b').value);
  if (a === null || b === null || Number.isNaN(a) || Number.isNaN(b)) { el.innerHTML = '<p>Inserisci i punti delle due coppie per vedere M.P. e V.P.</p>'; return; }
  const c = E.calcolaPartita(a, b, S.data.config.smazzate);
  const multipli = a % 5 === 0 && b % 5 === 0;
  el.innerHTML = `<p class="etichetta" style="color:var(--ink)">Anteprima</p>
    <p class="num">Differenza: <strong>${fmtN(Math.abs(c.mpA))} M.P.</strong></p>
    <div class="anteprima-vp num"><div class="lato"><span class="etichetta" style="color:var(--ink)">${nomeCoppia(tb.a)}</span><span class="grande">${c.vpA}</span></div>
      <span class="etichetta" style="color:var(--ink)">V.P.</span>
      <div class="lato"><span class="etichetta" style="color:var(--ink)">${nomeCoppia(tb.b)}</span><span class="grande">${c.vpB}</span></div></div>
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

  profilo() { suonaSigla(); vai('#/profilo'); },
  filtro(el) { S.filtro = el.dataset.v; render(); },
  async 'salva-profilo'() {
    const nome = val('profilo-nome');
    if (!nome) return toast('Scrivi un nome.');
    try { await S.store.updateName(nome); S.user = { ...S.user, name: nome }; render(); toast('Nome salvato.'); } catch (e) { toast(erroreLeggibile(e)); }
  },
  async 'cambia-pw'() {
    try { await S.store.resetPassword(S.user.email); toast('Ti abbiamo mandato un\'email per cambiare la password.'); } catch (e) { toast(erroreLeggibile(e)); }
  },
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
  'apri-duplica'() { apriFoglio('duplica'); },
  async duplica() {
    const nome = val('crea-nome'); const data = val('crea-data');
    if (!nome) return toast('Dai un nome al torneo.');
    const t = E.nuovoTorneo(); t.config.data = data;
    // Solo i giocatori (nome), tutti presenti. Niente coppie, turni, regole o persone dell'app.
    for (const [pid, p] of Object.entries(S.data.players || {})) t.players[pid] = { name: p.name, present: true };
    try {
      const tid = await S.store.createTournament(S.user, nome, t);
      await S.store.updateMeta(tid, { data });
      chiudiFoglio(); vai(`#/t/${tid}/turno`);
      toast(`Torneo creato con ${Object.keys(t.players).length} giocatori. Ora scegli il formato e forma le coppie.`);
    } catch (e) { toast(erroreLeggibile(e)); }
  },
  async entra() {
    const c = val('entra-codice');
    if (!c) return toast('Scrivi il codice.');
    try { const tid = await S.store.joinByCode(S.user, c); chiudiFoglio(); vai(`#/t/${tid}/turno`); } catch (e) { toast(erroreLeggibile(e)); }
  },
  'apri-torneo'(el) { vai(`#/t/${el.dataset.tid}/turno`); },
  async 'accetta-invito'(el) {
    const tid = el.dataset.tid;
    try { await S.store.acceptInvite(S.user, tid); vai(`#/t/${tid}/turno`); } catch (e) { toast(erroreLeggibile(e)); }
  },
  async 'rifiuta-invito'(el) {
    try { await S.store.declineInvite(S.user, el.dataset.tid); toast('Invito rifiutato.'); } catch (e) { toast(erroreLeggibile(e)); }
  },
  async 'invita-email'() {
    const v = val('invito-email').trim();
    const prova = S.store.mode === 'prova';
    if (!v) return toast(prova ? 'Scrivi il nome.' : 'Scrivi l\'email.');
    if (!prova && !emailValida(v)) return toast('Email non valida.');
    const k = chiaveEmail(v);
    const giaDentro = Object.values(S.members).some((m) => m.email && chiaveEmail(m.email) === k);
    if (giaDentro) return toast('Questa persona è già nel torneo.');
    if ((S.invitiTorneo || {})[k]) return toast('L\'invito è già stato mandato.');
    try {
      await S.store.invite(S.tid, S.meta.name || 'Torneo', v, S.user.name);
      const el = document.getElementById('invito-email'); if (el) el.value = '';
      toast(`Invito mandato a ${v}.`);
    } catch (e) { toast(erroreLeggibile(e)); }
  },
  async 'annulla-invito'(el) {
    try { await S.store.cancelInvite(S.tid, el.dataset.k); toast('Invito annullato.'); } catch (e) { toast(erroreLeggibile(e)); }
  },
  async 'attiva-notifiche'() {
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return toast(inStandalone() ? 'Questo telefono non supporta le notifiche.' : 'Apri l\'app dall\'icona sulla Home, poi attiva le notifiche.');
    S.push = { stato: 'attesa' }; render();
    try {
      const p = await Notification.requestPermission();
      if (p !== 'granted') { S.push = { stato: p === 'denied' ? 'negate' : 'spente' }; return render(); }
      await S.store.enablePush(S.user);
      S.push = { stato: 'attive' }; render(); toast('Notifiche attivate su questo telefono.');
    } catch (e) { S.push = { stato: 'errore', msg: erroreLeggibile(e) }; render(); }
  },
  async 'spegni-notifiche'() {
    try { await S.store.disablePush(S.user); } catch (e) { /* già spente */ }
    S.push = { stato: 'spente' }; render(); toast('Notifiche spente su questo telefono.');
  },
  home() { vai('#/'); },
  tab(el) { S.tab = el.dataset.tab; vai(`#/t/${S.tid}/${S.tab}`); },
  'setup-tab'(el) { S.setupTab = el.dataset.tab; render(); window.scrollTo(0, 0); },
  'storico-tab'(el) { S.storicoTab = el.dataset.v; render(); },

  cfg(el) {
    const k = el.dataset.k; let v = el.dataset.v;
    if (k !== 'sistema' && k !== 'formato') v = Number(v);
    const t = { ...S.data, config: { ...S.data.config, [k]: v } };
    salva(t);
  },
  async 'salva-config'() {
    const nome = val('cfg-nome');
    if (!nome) return toast('Dai un nome al torneo.');
    const config = { ...S.data.config, data: val('cfg-data'), inizio: val('cfg-ora') || S.data.config.inizio };
    await salva({ ...S.data, config }, { name: nome });
    toast('Impostazioni del torneo salvate.');
    S.setupTab = 'giocatori';
    render();
    window.scrollTo(0, 0);
  },
  minuti(el) {
    const m = Math.max(10, Math.min(120, (S.data.config.minuti || 45) + Number(el.dataset.d)));
    salva({ ...S.data, config: { ...S.data.config, minuti: m } });
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
    const occupati = new Set(Object.values(S.data.draft.coppie || {}).flatMap((c) => [c.p1, c.p2]));
    if (occupati.has(id) || (S.selezione && occupati.has(S.selezione))) { S.selezione = null; render(); return toast('Questo giocatore è già in una coppia.'); }
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
    // Un solo salvataggio: le coppie estratte prima vengono sostituite, non aggiunte.
    const restano = Object.fromEntries(Object.entries(S.data.draft.coppie || {}).filter(([, c]) => c.bloccata && (S.data.draft.modo || 'casuale') !== 'casuale'));
    const { nuove } = E.formaCoppieCasuali(giocatoriPresenti(), Object.values(restano).map((c) => [c.p1, c.p2]));
    const coppie = { ...restano };
    nuove.forEach(([p1, p2]) => { coppie[nuovoId('c')] = { p1, p2, bloccata: false }; });
    S.selezione = null;
    salva({ ...S.data, draft: { ...S.data.draft, coppie } });
  },
  sciogli(el) {
    const coppie = { ...(S.data.draft.coppie || {}) }; delete coppie[el.dataset.k];
    salva({ ...S.data, draft: { ...S.data.draft, coppie } });
  },
  'conferma-coppie'() {
    const lista = Object.values(S.data.draft.coppie || {}).map((c) => [c.p1, c.p2]);
    const errore = E.verificaCoppie(lista, giocatoriPresenti());
    if (errore) return toast(errore);
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

  'class-tab'(el) { S.classTab = el.dataset.v; render(); },
  'apri-risultato'(el) { apriFoglio('risultato', { turno: E.turnoCorrente(S.data), tav: el.dataset.tav, dettaglio: false }); },
  'dettaglio-smazzate'() { S.sheet.dettaglio = !S.sheet.dettaglio; const a = val('ris-a'); const b = val('ris-b'); renderFoglio(); document.getElementById('ris-a').value = a; document.getElementById('ris-b').value = b; aggiornaAnteprima(); },
  'aggiungi-partita'() { S.sheet.mani.a.push(''); S.sheet.mani.b.push(''); renderFoglio(); aggiornaAnteprima(); },
  segno(el) {
    const f = S.sheet; const { lato, i } = el.dataset;
    const v = String(f.mani[lato][i] || '').trim();
    f.mani[lato][i] = v.startsWith('-') ? v.slice(1) : v ? `-${v}` : '-';
    const inp = document.querySelector(`.mano[data-lato="${lato}"][data-i="${i}"]`);
    if (inp) { inp.value = f.mani[lato][i]; inp.focus(); }
    aggiornaAnteprima();
  },
  spareggio(el) { S.sheet.spareggio = el.dataset.v; aggiornaAnteprima(); },
  'salva-risultato'() {
    const f = S.sheet;
    if (E.isElim(S.data) && f.mani) {
      const r = S.data.rounds[f.turno];
      if (r.closed) return toast('Il turno è già chiuso.');
      const righe = f.mani.a.map((_, i) => [leggiNumero(f.mani.a[i]), leggiNumero(f.mani.b[i])])
        .filter(([x, y]) => !((x === null || Number.isNaN(x)) && (y === null || Number.isNaN(y))));
      if (!righe.length) return toast('Inserisci i punti di almeno una partita.');
      if (righe.some(([x, y]) => Number.isNaN(x) || Number.isNaN(y))) return toast('C\'è un punteggio non valido: usa solo numeri.');
      const mani = { a: righe.map(([x]) => x ?? 0), b: righe.map(([, y]) => y ?? 0) };
      const a = mani.a.reduce((x, y) => x + y, 0); const b = mani.b.reduce((x, y) => x + y, 0);
      if (a === b && !f.spareggio) return toast('Pari punti: indica chi ha vinto la mano di spareggio.');
      const ris = { a, b, mani, by: S.user.uid, at: S.store.now() };
      if (a === b) ris.spareggio = f.spareggio;
      chiudiFoglio();
      return salva({ ...S.data, rounds: { ...S.data.rounds, [f.turno]: { ...r, results: { ...r.results, [f.tav]: ris } } } });
    }
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
  'apri-ritiro'(el) {
    const id = (el && el.dataset.id) || val('ritiro-coppia');
    if (!id) return toast('Scegli la coppia.');
    apriFoglio('conferma', { titolo: `Ritiro di ${testoCoppia(id)}`, testo: `${S.data.players[S.data.pairs[id].p1]?.name} e ${S.data.players[S.data.pairs[id].p2]?.name} non giocheranno più. L'operazione non si può annullare.`, ok: 'Conferma il ritiro', azione: 'ritiro', id });
  },
  'apri-elimina'() {
    apriFoglio('conferma', { titolo: 'Eliminare il torneo?', testo: 'Il torneo verrà cancellato per tutti i partecipanti. Non si può annullare. Se vuoi conservarlo, esportalo prima.', ok: 'Elimina', azione: 'elimina', digitare: 'ELIMINA' });
  },
  async 'conferma-ok'() {
    const f = S.sheet;
    if (f.digitare && val('conferma-testo').trim().toUpperCase() !== f.digitare) return toast(`Scrivi ${f.digitare} per confermare.`);
    if (f.casella) f.cambia = !!document.getElementById('conferma-casella')?.checked;
    chiudiFoglio();
    if (f.azione === 'chiudi-turno') {
      try {
        const t = E.chiudiTurno(S.data);
        await salva(t);
        if (t.status === 'running') {
          const n = E.turnoCorrente(t);
          const fasi = [...new Set(Object.keys(t.rounds[n].tables).map((k) => E.etichettaTavolo(t, n, k)).filter(Boolean))];
          toast(`Turno ${n} pronto${fasi.length && E.isElim(t) ? `: ${fasi.join(', ')}` : ''}.`);
          vai(`#/t/${S.tid}/turno`);
        }
        window.scrollTo(0, 0);
      } catch (e) { toast(e.message); }
    } else if (f.azione === 'ritiro') {
      const t = E.ritiraCoppia(S.data, f.id);
      const avv = E.avvisoRiposiRitiro(t);
      salva(t);
      if (avv) toast(avv);
    } else if (f.azione === 'elimina') {
      try { const tid = S.tid; const meta = S.meta; const members = S.members; chiudiTorneo(); await S.store.deleteTournament(S.user, tid, meta, members); vai('#/'); toast('Torneo eliminato.'); } catch (e) { toast(erroreLeggibile(e)); }
    } else if (f.azione === 'rimuovi') {
      try {
        await S.store.removeMember(S.tid, f.uid);
        if (f.cambia) { await S.store.changeCode(S.tid, S.meta.code); toast(`${f.nome} rimosso. Nuovo codice invito creato.`); }
        else toast(`${f.nome} rimosso.`);
      } catch (e) { toast(erroreLeggibile(e)); }
    } else if (f.azione === 'lascia') {
      azioni.lascia();
    } else if (f.azione === 'ruolo') {
      await S.store.setMember(S.tid, f.uid, { role: f.ruolo }).catch((e) => toast(erroreLeggibile(e)));
    }
  },
  'apri-rimuovi'(el) {
    const uid = el.dataset.uid; const nome = S.members[uid]?.name || 'questa persona';
    if (uid === S.meta.owner) return toast('Chi ha creato il torneo non si può rimuovere.');
    apriFoglio('conferma', { titolo: `Rimuovere ${nome}?`, testo: `${nome} esce dal torneo e non lo vede più. Se ha ancora il link può rientrare come partecipante: per impedirlo spunta la casella, il codice cambia e il vecchio link smette di funzionare. Chi è già dentro resta dentro.`,
      casella: 'Cambia anche il codice invito', ok: 'Rimuovi', azione: 'rimuovi', uid, nome });
  },
  'lascia-conferma'() {
    apriFoglio('conferma', { titolo: 'Uscire dal torneo?', testo: 'Il torneo sparisce dalla tua lista. Puoi rientrare con il link o il codice.', ok: 'Esci', azione: 'lascia' });
  },
  ruolo(el) {
    const uid = el.dataset.uid;
    const m = S.members[uid];
    if (uid === S.meta.owner && m.role === 'admin') return toast('Chi ha creato il torneo resta sempre admin.');
    const nuovo = m.role === 'admin' ? 'viewer' : 'admin';
    const admin = Object.values(S.members).filter((x) => x.role === 'admin').length;
    if (nuovo === 'viewer' && admin <= 1) return toast('Deve restare almeno un admin.');
    if (uid === S.user.uid && nuovo === 'viewer') {
      return apriFoglio('conferma', { titolo: 'Togliere a te il ruolo di admin?', testo: 'Non potrai più modificare il torneo, a meno che un altro admin non ti renda di nuovo admin.', ok: 'Conferma', azione: 'ruolo', uid, ruolo: nuovo });
    }
    S.store.setMember(S.tid, uid, { role: nuovo }).catch((e) => toast(erroreLeggibile(e)));
  },
  async lascia() { const tid = S.tid; chiudiTorneo(); await S.store.leaveTournament(S.user, tid); vai('#/'); },

  async 'copia-solo-codice'() {
    const c = S.meta.code || '';
    try { await navigator.clipboard.writeText(c); toast('Codice copiato.'); } catch (e) { toast(c); }
  },
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
    const elim = E.isElim(S.data);
    const cl = elim ? E.classificaEliminazione(S.data) : E.classifica(S.data);
    const testo = `${S.meta.name} - classifica finale\n` + cl.map((r) => (elim ? `${r.pos}. ${testoCoppia(r.id)} - ${r.vinte} vinte, ${fmtN(r.fatti)} punti` : `${r.pos}. ${testoCoppia(r.id)} ${r.vp} V.P., ${fmt(r.mp)} M.P.`)).join('\n');
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

  'apri-rinomina'(el) { apriFoglio('rinomina', { pid: el.dataset.pid }); },
  'apri-soprannome'(el) { apriFoglio('soprannome', { id: el.dataset.id }); },
  'apri-sostituisci'(el) { apriFoglio('sostituisci', { id: el.dataset.id, pid: el.dataset.pid }); },
  'salva-rinomina'() {
    const f = S.sheet; const nome = val('rin-nome');
    if (!nome) return toast('Scrivi un nome.');
    const doppio = Object.entries(S.data.players).some(([pid, p]) => pid !== f.pid && p.name.toLowerCase() === nome.toLowerCase());
    if (doppio) return toast('C\'è già un giocatore con questo nome.');
    chiudiFoglio();
    salva({ ...S.data, players: { ...S.data.players, [f.pid]: { ...S.data.players[f.pid], name: nome } } });
    toast('Nome aggiornato.');
  },
  'salva-soprannome'() {
    const f = S.sheet; const nick = val('nick');
    chiudiFoglio();
    salva({ ...S.data, pairs: { ...S.data.pairs, [f.id]: { ...S.data.pairs[f.id], nick: nick || null } } });
  },
  'salva-sostituzione'() {
    const f = S.sheet; const t = S.data; const pr = t.pairs[f.id];
    const scelto = val('sost-riserva'); const nuovo = val('sost-nuovo');
    if (!scelto && !nuovo) return toast('Scegli chi entra oppure scrivi il nome della riserva.');
    if (scelto && nuovo) return toast('Scegli un giocatore oppure scrivi un nome nuovo, non tutti e due.');
    const titolari = pr.titolari || { a: pr.p1, b: pr.p2 };
    const gia = Object.keys(pr.sostituzioni || {}).length;
    if (gia && !(scelto && Object.values(titolari).includes(scelto))) {
      return toast('Il regolamento consente una sola sostituzione per coppia: ora può rientrare solo il giocatore titolare.');
    }
    const players = { ...t.players };
    let entra = scelto;
    if (nuovo) {
      if (Object.values(players).some((p) => p.name.toLowerCase() === nuovo.toLowerCase())) return toast('C\'è già un giocatore con questo nome: sceglilo dall\'elenco.');
      entra = nuovoId('g'); players[entra] = { name: nuovo, present: true };
    } else players[entra] = { ...players[entra], present: true };
    const lato = pr.p1 === f.pid ? 'p1' : 'p2';
    const n = E.turnoCorrente(t);
    const r = t.rounds[n];
    const turno = r && !r.closed ? n : n + 1;
    const sost = { ...(pr.sostituzioni || {}), [nuovoId('s')]: { turno, esce: f.pid, entra, esceNome: t.players[f.pid]?.name || '', entraNome: players[entra].name } };
    chiudiFoglio();
    salva({ ...t, players, pairs: { ...t.pairs, [f.id]: { ...pr, [lato]: entra, titolari, sostituzioni: sost } } });
    toast(`${players[entra].name} entra al posto di ${t.players[f.pid]?.name}.`);
  },
  tema(el) { applicaTema(el.dataset.v); render(); },
  sigla(el) {
    const on = el.dataset.v === 'on';
    try { localStorage.setItem('sb-sigla', on ? 'on' : 'off'); } catch (e) { /* vale solo per ora */ }
    if (!on && siglaAudio) { siglaAudio.pause(); siglaAudio.currentTime = 0; }
    render();
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
  if (el.id === 'cfg-ora') aggiornaDurata();
  const campo = el.dataset && el.dataset.campo;
  if (!campo || !S.data) return;
  if (campo === 'nome') { const v = el.value.trim(); if (v) S.store.updateMeta(S.tid, { name: v }).catch((e) => toast(erroreLeggibile(e))); }
  else if (campo === 'data' || campo === 'inizio') salva({ ...S.data, config: { ...S.data.config, [campo]: el.value } });
  else if (campo === 'mio-player') S.store.setMember(S.tid, S.user.uid, { player: el.value || null }).catch((e) => toast(erroreLeggibile(e)));
});

document.addEventListener('input', (ev) => {
  if (ev.target.id === 'cfg-ora') { aggiornaDurata(); return; }
  if (!S.sheet || S.sheet.tipo !== 'risultato') return;
  if (ev.target.classList.contains('mano') && S.sheet.mani) {
    S.sheet.mani[ev.target.dataset.lato][Number(ev.target.dataset.i)] = ev.target.value;
  }
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
  if (ev.key === 'Enter' && ev.target.id === 'rin-nome') azioni['salva-rinomina']();
  if (ev.key === 'Enter' && ev.target.id === 'nick') azioni['salva-soprannome']();
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
  S.offTorneo = S.store.watch(tid, ({ meta, members, inviti, data }) => {
    if (S.tid !== tid) return;
    if (!members[S.user.uid]) { toast('Non fai più parte di questo torneo.'); chiudiTorneo(); S.store.leaveTournament(S.user, tid).catch(() => {}); vai('#/'); return; }
    S.meta = meta; S.members = members; S.invitiTorneo = inviti || {}; S.data = E.normalizza(data);
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
  if (parti[0] === 'profilo') { chiudiTorneo(); S.view = 'profilo'; render(); window.scrollTo(0, 0); return; }
  if (parti[0] === 't' && parti[1]) {
    S.view = 'torneo';
    S.tab = parti[2] === 'altro' ? 'inviti' : ['turno', 'classifica', 'storico', 'gruppo', 'inviti'].includes(parti[2]) ? parti[2] : 'turno';
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
  S.offLista = S.store.myTournaments(S.user.uid, (lista) => { S.tornei = lista; if (S.view === 'home' || S.view === 'profilo') render(); });
  if (S.offInviti) S.offInviti();
  S.offInviti = S.store.watchInvites(S.user, (l) => { S.invitiMiei = l; if (S.view === 'home' || S.view === 'profilo') render(); });
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
    if (!u) { if (S.offLista) S.offLista(); if (S.offInviti) S.offInviti(); S.invitiMiei = []; chiudiTorneo(); S.view = 'login'; S.login.errore = ''; return render(); }
    avviaUtente();
  });
}

avvio();

// Con la tastiera aperta (iPhone) la barra in basso salirebbe a metà pagina: la si nasconde.
const conTastiera = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') && !el.readOnly && !['checkbox', 'radio', 'button'].includes(el.type);
document.addEventListener('focusin', (ev) => { if (conTastiera(ev.target)) document.body.classList.add('tastiera'); });
document.addEventListener('focusout', () => { setTimeout(() => { if (!conTastiera(document.activeElement)) document.body.classList.remove('tastiera'); }, 50); });

// Sigla: suona solo quando si entra nel profilo, e solo se è su "Sigla on".
// Parte dentro il tocco sul profilo, perché i telefoni bloccano l'audio senza un tocco.
let siglaAudio = null;
function siglaAttiva() { try { return localStorage.getItem('sb-sigla') !== 'off'; } catch (e) { return true; } }
function suonaSigla() {
  if (!siglaAttiva()) return;
  siglaAudio = siglaAudio || new Audio('audio/sigla.mp3?v=25');
  siglaAudio.volume = 0.9;
  try { siglaAudio.currentTime = 0; } catch (e) { /* non ancora caricata */ }
  siglaAudio.play().catch(() => { /* il telefono non l'ha permesso: niente musica */ });
}

// Titoli e nomi scritti da voi (nome del torneo, nomi delle coppie): se una parola non sta nella riga,
// il carattere si rimpicciolisce finché la parola sta intera. Mai lettere a capo da sole.
const DA_ADATTARE = '.testata h1, .titolo, .titolo-m, .blocco .nome, .nome-tocca span, .elim-lato .nome-c, .gradino .chi, .classifica strong, .tb-riga .nome, .vs-riga .chi, .persona .nome, .nome-p';
function adattaTesti(radice) {
  for (const el of radice.querySelectorAll(DA_ADATTARE)) {
    el.style.fontSize = '';
    if (!el.clientWidth) continue;
    const prima = el.style.overflowWrap;
    el.style.overflowWrap = 'normal'; el.style.wordBreak = 'normal';
    let px = parseFloat(getComputedStyle(el).fontSize);
    const minimo = Math.max(10, px * 0.55);
    while (el.scrollWidth > el.clientWidth + 1 && px > minimo) { px -= 0.5; el.style.fontSize = `${px}px`; }
    el.style.overflowWrap = prima; el.style.wordBreak = '';
  }
}
window.addEventListener('resize', () => { adattaTesti(document.body); });

// "Eliminazione" -> "Eliminazione 2", "Eliminazione 2" -> "Eliminazione 3"
function nomeSeguente(nome) {
  const m = /^(.*?)\s+(\d+)$/.exec(nome.trim());
  return m ? `${m[1]} ${Number(m[2]) + 1}` : `${nome.trim()} 2`;
}
