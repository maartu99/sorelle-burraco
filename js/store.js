// Livello dati: Firebase (Authentication + Realtime Database) oppure modalità prova locale.
// Import come oggetto: se il telefono ha ancora in memoria una versione vecchia del file
// (senza VAPID_KEY), l'app parte lo stesso, con le notifiche spente.
import * as CONFIG from './firebase-config.js';
const { firebaseConfig } = CONFIG;
const VAPID_KEY = CONFIG.VAPID_KEY || '';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function nuovoCodice() {
  let s = 'SB-';
  for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

// Firebase restituisce come array gli oggetti con chiavi numeriche: li riportiamo a oggetti.
export function senzaArray(v) {
  if (Array.isArray(v)) {
    const o = {};
    v.forEach((x, i) => { if (x !== null && x !== undefined) o[i] = senzaArray(x); });
    return o;
  }
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = senzaArray(x);
    return o;
  }
  return v;
}

// Differenze tra due alberi come aggiornamenti "percorso: valore" (null = cancella).
// Coppie, ordine e bozza delle coppie si scrivono sempre per intero: due admin che
// lavorano insieme non possono mescolare due versioni diverse (vince l'ultima, intera).
const INTERI = new Set(['pairs', 'order', 'draft/coppie']);
export function differenze(prima, dopo, base = '', out = {}) {
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  if (INTERI.has(base)) {
    if (JSON.stringify(prima) !== JSON.stringify(dopo)) out[base] = dopo === undefined ? null : dopo;
    return out;
  }
  if (Array.isArray(dopo) || Array.isArray(prima)) {
    if (JSON.stringify(prima) !== JSON.stringify(dopo)) out[base] = dopo === undefined ? null : dopo;
    return out;
  }
  if (isObj(prima) && isObj(dopo)) {
    const chiavi = new Set([...Object.keys(prima), ...Object.keys(dopo)]);
    for (const k of chiavi) differenze(prima[k], dopo[k], base ? `${base}/${k}` : k, out);
    return out;
  }
  if (JSON.stringify(prima) !== JSON.stringify(dopo)) out[base] = dopo === undefined ? null : dopo;
  return out;
}

const pulito = (x) => JSON.parse(JSON.stringify(x ?? null));

// Chiave di un'email nel database (i punti non sono ammessi nelle chiavi).
// La stessa trasformazione è nelle regole: auth.token.email.toLowerCase().replace('.', ',').
export const chiaveEmail = (email) => String(email || '').trim().toLowerCase().replace(/\./g, ',');
export const emailValida = (email) => /^[^\s@#$\[\]\/]+@[^\s@#$\[\]\/]+\.[^\s@#$\[\]\/]+$/.test(String(email || '').trim());
const chiaveToken = (t) => t.replace(/[.#$\[\]\/]/g, '_');

// ================= Firebase =================

async function creaStoreFirebase() {
  const fb = await import('./vendor/firebase.js?v=20');
  const app = fb.initializeApp(firebaseConfig);
  const auth = fb.getAuth(app);
  const db = fb.getDatabase(app);
  let offset = 0;
  fb.onValue(fb.ref(db, '.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });
  fb.getRedirectResult(auth).catch(() => {});

  const utente = (u) => u && { uid: u.uid, name: u.displayName || (u.email || '').split('@')[0], email: u.email, google: (u.providerData || []).some((p) => p.providerId === 'google.com') };
  const isAdminRole = (m, uid) => m && m[uid] && m[uid].role === 'admin';

  return {
    mode: 'firebase',
    now: () => Date.now() + offset,
    onAuth(cb) { return fb.onAuthStateChanged(auth, (u) => cb(utente(u))); },
    async signInGoogle() {
      const p = new fb.GoogleAuthProvider();
      try { await fb.signInWithPopup(auth, p); }
      catch (e) {
        if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') await fb.signInWithRedirect(auth, p);
        else throw e;
      }
    },
    async signInEmail(email, pw) { await fb.signInWithEmailAndPassword(auth, email, pw); },
    async signUpEmail(name, email, pw) {
      const c = await fb.createUserWithEmailAndPassword(auth, email, pw);
      await fb.updateProfile(c.user, { displayName: name });
      return utente({ ...c.user, displayName: name });
    },
    async resetPassword(email) { await fb.sendPasswordResetEmail(auth, email); },
    async updateName(name) { await fb.updateProfile(auth.currentUser, { displayName: name }); },
    async signOut() { await fb.signOut(auth); },

    myTournaments(uid, cb) {
      const metaSubs = {};
      const metas = {};
      const emit = () => cb(Object.entries(metas).filter(([, m]) => m).map(([tid, m]) => ({ tid, ...m })));
      const off = fb.onValue(fb.ref(db, `userTournaments/${uid}`), (s) => {
        const ids = Object.keys(s.val() || {});
        for (const tid of Object.keys(metaSubs)) if (!ids.includes(tid)) { metaSubs[tid](); delete metaSubs[tid]; delete metas[tid]; }
        for (const tid of ids) {
          if (metaSubs[tid]) continue;
          metaSubs[tid] = fb.onValue(fb.ref(db, `tournaments/${tid}/meta`), (ms) => {
            const m = ms.val();
            metas[tid] = m ? { ...m, role: undefined } : null;
            fb.get(fb.ref(db, `tournaments/${tid}/members/${uid}/role`)).then((r) => { if (metas[tid]) { metas[tid].role = r.val(); emit(); } }).catch(() => {});
            emit();
          }, () => { metas[tid] = null; emit(); });
        }
        emit();
      });
      return () => { off(); Object.values(metaSubs).forEach((f) => f()); };
    },

    async createTournament(user, name, data) {
      const tid = fb.push(fb.ref(db, 'tournaments')).key;
      await fb.set(fb.ref(db, `tournaments/${tid}/meta`), {
        name, owner: user.uid, createdAt: Date.now(), status: 'setup', turno: 0, turni: data.config.turni, coppie: 0, code: '',
      });
      await fb.set(fb.ref(db, `tournaments/${tid}/members/${user.uid}`), { name: user.name, role: 'admin' });
      let code;
      for (let i = 0; i < 8; i++) {
        code = nuovoCodice();
        try { await fb.set(fb.ref(db, `codes/${code}`), tid); break; } catch (e) { code = null; }
      }
      if (!code) throw new Error('Non riesco a creare il codice invito, riprova.');
      await fb.update(fb.ref(db, `tournaments/${tid}/meta`), { code });
      await fb.set(fb.ref(db, `tournaments/${tid}/data`), pulito(data));
      await fb.set(fb.ref(db, `userTournaments/${user.uid}/${tid}`), true);
      return tid;
    },

    async joinByCode(user, code) {
      const c = code.trim().toUpperCase().replace(/^SB-?/, 'SB-');
      const s = await fb.get(fb.ref(db, `codes/${c}`));
      const tid = s.val();
      if (!tid) throw new Error('Codice non trovato.');
      let gia = false;
      try { await fb.get(fb.ref(db, `tournaments/${tid}/meta`)); gia = true; } catch (e) { gia = false; }
      if (!gia) await fb.set(fb.ref(db, `tournaments/${tid}/members/${user.uid}`), { name: user.name, role: 'viewer' });
      await fb.set(fb.ref(db, `userTournaments/${user.uid}/${tid}`), true);
      return tid;
    },

    watch(tid, cb, onErr) {
      return fb.onValue(fb.ref(db, `tournaments/${tid}`), (s) => {
        const v = s.val() || {};
        cb({ meta: v.meta || {}, members: v.members || {}, inviti: v.inviti || {}, data: senzaArray(v.data || {}) });
      }, (e) => onErr && onErr(e));
    },

    async saveData(tid, prima, dopo) {
      const upd = differenze(pulito(prima), pulito(dopo));
      if (!Object.keys(upd).length) return;
      await fb.update(fb.ref(db, `tournaments/${tid}/data`), upd);
    },
    async updateMeta(tid, patch) { await fb.update(fb.ref(db, `tournaments/${tid}/meta`), pulito(patch)); },
    async setMember(tid, uid, patch) { await fb.update(fb.ref(db, `tournaments/${tid}/members/${uid}`), pulito(patch)); },

    async leaveTournament(user, tid) { await fb.remove(fb.ref(db, `userTournaments/${user.uid}/${tid}`)); },
    async removeMember(tid, uid) { await fb.remove(fb.ref(db, `tournaments/${tid}/members/${uid}`)); },

    // ---- Inviti con email: l'invitato li vede nell'app (e riceve la notifica, se attiva)
    async invite(tid, nomeTorneo, email, daNome) {
      const k = chiaveEmail(email); const at = Date.now() + offset;
      await fb.set(fb.ref(db, `tournaments/${tid}/inviti/${k}`), { email: email.trim().toLowerCase(), at });
      await fb.set(fb.ref(db, `invites/${k}/${tid}`), { name: nomeTorneo, by: daNome, email: email.trim().toLowerCase(), at });
    },
    async cancelInvite(tid, k) {
      await fb.remove(fb.ref(db, `invites/${k}/${tid}`));
      await fb.remove(fb.ref(db, `tournaments/${tid}/inviti/${k}`));
    },
    watchInvites(user, cb) {
      if (!user.email) { cb([]); return () => {}; }
      return fb.onValue(fb.ref(db, `invites/${chiaveEmail(user.email)}`),
        (s) => cb(Object.entries(s.val() || {}).map(([tid, v]) => ({ tid, ...v })).sort((a, b) => b.at - a.at)), () => cb([]));
    },
    async acceptInvite(user, tid) {
      let gia = false;
      try { await fb.get(fb.ref(db, `tournaments/${tid}/meta`)); gia = true; } catch (e) { gia = false; }
      if (!gia) await fb.set(fb.ref(db, `tournaments/${tid}/members/${user.uid}`), { name: user.name, role: 'viewer' });
      await fb.set(fb.ref(db, `userTournaments/${user.uid}/${tid}`), true);
      await fb.remove(fb.ref(db, `invites/${chiaveEmail(user.email)}/${tid}`));
      await fb.remove(fb.ref(db, `tournaments/${tid}/inviti/${chiaveEmail(user.email)}`)).catch(() => {});
      return tid;
    },
    async declineInvite(user, tid) {
      await fb.remove(fb.ref(db, `invites/${chiaveEmail(user.email)}/${tid}`));
      await fb.remove(fb.ref(db, `tournaments/${tid}/inviti/${chiaveEmail(user.email)}`)).catch(() => {});
    },

    // ---- Notifiche push (inviate dal controllo automatico su GitHub)
    pushDisponibile: () => !!VAPID_KEY,
    async enablePush(user) {
      const M = await import('./vendor/messaging.js?v=20');
      if (!(await M.isSupported())) throw new Error('Questo browser non supporta le notifiche.');
      const reg = await navigator.serviceWorker.register('sw.js?v=20');
      await navigator.serviceWorker.ready;
      const token = await M.getToken(M.getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
      if (!token) throw new Error('Il telefono non ha dato il permesso.');
      await fb.set(fb.ref(db, `users/${user.uid}/pushTokens/${chiaveToken(token)}`), token);
      try { localStorage.setItem('sb-push-token', token); } catch (e) { /* niente */ }
      return token;
    },
    async disablePush(user) {
      let token = null; try { token = localStorage.getItem('sb-push-token'); } catch (e) { /* niente */ }
      if (token) await fb.remove(fb.ref(db, `users/${user.uid}/pushTokens/${chiaveToken(token)}`));
      try { const M = await import('./vendor/messaging.js?v=20'); await M.deleteToken(M.getMessaging(app)); } catch (e) { /* già tolto */ }
      try { localStorage.removeItem('sb-push-token'); } catch (e) { /* niente */ }
    },
    async pushAttiva(user) {
      let token = null; try { token = localStorage.getItem('sb-push-token'); } catch (e) { /* niente */ }
      if (!token || typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
      try { const s = await fb.get(fb.ref(db, `users/${user.uid}/pushTokens/${chiaveToken(token)}`)); return s.exists(); } catch (e) { return false; }
    },
    async changeCode(tid, vecchio) {
      let code = null;
      for (let i = 0; i < 8; i++) {
        const c = nuovoCodice();
        try { await fb.set(fb.ref(db, `codes/${c}`), tid); code = c; break; } catch (e) { /* già usato, riprovo */ }
      }
      if (!code) throw new Error('Non riesco a creare il nuovo codice, riprova.');
      await fb.update(fb.ref(db, `tournaments/${tid}/meta`), { code });
      if (vecchio) await fb.remove(fb.ref(db, `codes/${vecchio}`)).catch(() => {});
      return code;
    },

    async deleteTournament(user, tid, meta, members) {
      if (!isAdminRole(members, user.uid)) throw new Error('Solo un admin può eliminare il torneo.');
      await fb.remove(fb.ref(db, `tournaments/${tid}/data`));
      if (meta.code) await fb.remove(fb.ref(db, `codes/${meta.code}`));
      await fb.remove(fb.ref(db, `tournaments/${tid}/meta`));
      for (const uid of Object.keys(members)) if (uid !== user.uid) await fb.remove(fb.ref(db, `tournaments/${tid}/members/${uid}`));
      await fb.remove(fb.ref(db, `tournaments/${tid}/members/${user.uid}`));
      await fb.remove(fb.ref(db, `userTournaments/${user.uid}/${tid}`));
    },
  };
}

// ================= Modalità prova (solo questo browser) =================

function creaStoreProva() {
  const KEY = 'sorelle-burraco-prova';
  const canale = 'BroadcastChannel' in window ? new BroadcastChannel(KEY) : null;
  const ascoltatori = new Set();
  const leggi = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const scrivi = (db) => {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* spazio esaurito */ }
    ascoltatori.forEach((f) => f());
    if (canale) canale.postMessage('x');
  };
  if (canale) canale.onmessage = () => ascoltatori.forEach((f) => f());
  const db0 = () => { const d = leggi(); d.tournaments = d.tournaments || {}; d.codes = d.codes || {}; d.userT = d.userT || {}; d.invites = d.invites || {}; return d; };
  // In modalità prova non c'è l'email: l'invito si fa con il nome con cui l'altra persona entra.
  const kProva = (u) => chiaveEmail(u.email || u.name);
  const sub = (f) => { ascoltatori.add(f); f(); return () => ascoltatori.delete(f); };
  const authCbs = new Set();
  const utenteSalvato = () => { try { return JSON.parse(sessionStorage.getItem(KEY + '-utente')); } catch (e) { return null; } };

  return {
    mode: 'prova',
    now: () => Date.now(),
    onAuth(cb) { authCbs.add(cb); cb(utenteSalvato()); return () => authCbs.delete(cb); },
    async signInProva(name) {
      const u = { uid: 'u-' + name.toLowerCase().replace(/[^a-z0-9]/g, '') , name, email: '' };
      sessionStorage.setItem(KEY + '-utente', JSON.stringify(u));
      authCbs.forEach((f) => f(u));
    },
    async signOut() { sessionStorage.removeItem(KEY + '-utente'); authCbs.forEach((f) => f(null)); },
    async updateName(name) { const u = { ...utenteSalvato(), name }; sessionStorage.setItem(KEY + '-utente', JSON.stringify(u)); },
    async resetPassword() { /* non disponibile in modalità prova */ },
    myTournaments(uid, cb) {
      return sub(() => {
        const d = db0();
        const ids = Object.keys(d.userT[uid] || {});
        cb(ids.filter((tid) => d.tournaments[tid]).map((tid) => ({
          tid, ...d.tournaments[tid].meta, role: d.tournaments[tid].members[uid]?.role,
        })));
      });
    },
    async createTournament(user, name, data) {
      const d = db0();
      const tid = 't' + Date.now().toString(36);
      let code; do { code = nuovoCodice(); } while (d.codes[code]);
      d.tournaments[tid] = {
        meta: { name, owner: user.uid, createdAt: Date.now(), status: 'setup', turno: 0, turni: data.config.turni, coppie: 0, code },
        members: { [user.uid]: { name: user.name, role: 'admin' } },
        data: pulito(data),
      };
      d.codes[code] = tid;
      d.userT[user.uid] = { ...(d.userT[user.uid] || {}), [tid]: true };
      scrivi(d);
      return tid;
    },
    async joinByCode(user, code) {
      const d = db0();
      const c = code.trim().toUpperCase().replace(/^SB-?/, 'SB-');
      const tid = d.codes[c];
      if (!tid) throw new Error('Codice non trovato.');
      const t = d.tournaments[tid];
      if (!t.members[user.uid]) t.members[user.uid] = { name: user.name, role: 'viewer' };
      d.userT[user.uid] = { ...(d.userT[user.uid] || {}), [tid]: true };
      scrivi(d);
      return tid;
    },
    watch(tid, cb, onErr) {
      return sub(() => {
        const t = db0().tournaments[tid];
        if (!t) { onErr && onErr(new Error('Torneo non trovato.')); return; }
        cb({ meta: t.meta, members: t.members, inviti: t.inviti || {}, data: pulito(t.data) });
      });
    },
    async saveData(tid, prima, dopo) { const d = db0(); d.tournaments[tid].data = pulito(dopo); scrivi(d); },
    async updateMeta(tid, patch) { const d = db0(); Object.assign(d.tournaments[tid].meta, pulito(patch)); scrivi(d); },
    async setMember(tid, uid, patch) { const d = db0(); Object.assign(d.tournaments[tid].members[uid], pulito(patch)); scrivi(d); },
    async leaveTournament(user, tid) { const d = db0(); delete (d.userT[user.uid] || {})[tid]; scrivi(d); },
    async removeMember(tid, uid) { const d = db0(); delete d.tournaments[tid].members[uid]; delete (d.userT[uid] || {})[tid]; scrivi(d); },
    async invite(tid, nomeTorneo, email, daNome) {
      const d = db0(); const k = chiaveEmail(email); const at = Date.now();
      d.tournaments[tid].inviti = { ...(d.tournaments[tid].inviti || {}), [k]: { email: email.trim().toLowerCase(), at } };
      d.invites[k] = { ...(d.invites[k] || {}), [tid]: { name: nomeTorneo, by: daNome, email: email.trim().toLowerCase(), at } };
      scrivi(d);
    },
    async cancelInvite(tid, k) { const d = db0(); delete (d.invites[k] || {})[tid]; delete (d.tournaments[tid].inviti || {})[k]; scrivi(d); },
    watchInvites(user, cb) {
      return sub(() => cb(Object.entries(db0().invites[kProva(user)] || {}).map(([tid, v]) => ({ tid, ...v })).sort((a, b) => b.at - a.at)));
    },
    async acceptInvite(user, tid) {
      const d = db0(); const t = d.tournaments[tid];
      if (t && !t.members[user.uid]) t.members[user.uid] = { name: user.name, role: 'viewer' };
      d.userT[user.uid] = { ...(d.userT[user.uid] || {}), [tid]: true };
      delete (d.invites[kProva(user)] || {})[tid]; if (t) delete (t.inviti || {})[kProva(user)]; scrivi(d); return tid;
    },
    async declineInvite(user, tid) { const d = db0(); delete (d.invites[kProva(user)] || {})[tid]; if (d.tournaments[tid]) delete (d.tournaments[tid].inviti || {})[kProva(user)]; scrivi(d); },
    pushDisponibile: () => false,
    async enablePush() { throw new Error('Le notifiche non ci sono in modalità prova.'); },
    async disablePush() {},
    async pushAttiva() { return false; },
    async changeCode(tid, vecchio) {
      const d = db0(); let code; do { code = nuovoCodice(); } while (d.codes[code]);
      d.codes[code] = tid; if (vecchio) delete d.codes[vecchio]; d.tournaments[tid].meta.code = code; scrivi(d); return code;
    },
    async deleteTournament(user, tid, meta) {
      const d = db0();
      delete d.tournaments[tid];
      if (meta.code) delete d.codes[meta.code];
      for (const u of Object.values(d.userT)) delete u[tid];
      scrivi(d);
    },
  };
}

export async function creaStore() {
  if (firebaseConfig.apiKey) return creaStoreFirebase();
  return creaStoreProva();
}
