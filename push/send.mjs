// Sorelle Burraco - notifiche push.
// Gira su GitHub Actions ogni pochi minuti: guarda gli inviti nuovi nel database
// e manda la notifica ai telefoni con Firebase Cloud Messaging (gratis, piano Spark).
// Ogni notifica parte una volta sola: quelle già mandate sono segnate in "pushLog".
import { initializeApp, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';

const SA = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!SA) { console.log('::warning::FIREBASE_SERVICE_ACCOUNT non impostato: nessuna notifica.'); process.exit(0); }
initializeApp({ credential: cert(JSON.parse(SA)), databaseURL: 'https://sorelle-burraco-default-rtdb.europe-west1.firebasedatabase.app' });
const db = getDatabase(), auth = getAuth(), fcm = getMessaging();

const APP = 'https://maartu99.github.io/sorelle-burraco/';
const NOW = Date.now();
const FRESCO = 24 * 3600e3;   // si notificano solo inviti delle ultime 24 ore (GitHub può ritardare i giri)
const chiave = (s) => String(s).replace(/[.#$\[\]\/]/g, '_');

let mandate = 0;
async function notifica(chiaveLog, email, build) {
  const log = db.ref(`pushLog/${chiave(chiaveLog)}`);
  if ((await log.get()).exists()) return;
  await log.set(NOW);
  let uid;
  try { uid = (await auth.getUserByEmail(email)).uid; } catch (e) { return; } // non ha ancora un account
  const toks = (await db.ref(`users/${uid}/pushTokens`).get()).val() || {};
  const tokens = Object.values(toks);
  if (!tokens.length) return;
  const { title, body, tag } = build();
  let res;
  try { res = await fcm.sendEachForMulticast({ tokens, data: { title, body, url: APP, tag }, webpush: { headers: { Urgency: 'high', TTL: '86400' } } }); }
  catch (e) { console.error('invio fallito', chiaveLog, e.message); return; }
  mandate += res.successCount;
  // Toglie i token non più validi (app tolta dalla Home, notifiche spente, ecc.)
  await Promise.all(res.responses.map((r, i) => (!r.success && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(r.error?.code || ''))
    ? db.ref(`users/${uid}/pushTokens/${chiave(tokens[i])}`).remove() : null));
}

const inviti = (await db.ref('invites').get()).val() || {};
for (const [k, perTorneo] of Object.entries(inviti)) {
  for (const [tid, v] of Object.entries(perTorneo || {})) {
    if (!v || !v.email || !(NOW - (v.at || 0) < FRESCO)) continue;
    await notifica(`inv-${k}-${tid}-${v.at}`, v.email, () => ({
      title: 'Sorelle Burraco - nuovo invito',
      body: `${v.by || 'Qualcuno'} ti ha invitato al torneo "${v.name || ''}"`,
      tag: `inv-${tid}`,
    }));
  }
}

// Pulizia del registro: via le voci più vecchie di 7 giorni
const reg = (await db.ref('pushLog').get()).val() || {};
const vecchie = Object.entries(reg).filter(([, t]) => NOW - t > 7 * 864e5).map(([key]) => key);
if (vecchie.length) await db.ref('pushLog').update(Object.fromEntries(vecchie.map((key) => [key, null])));

console.log(`Notifiche mandate: ${mandate}`);
process.exit(0);
