# Sorelle Burraco

Web app per gestire tornei di Burraco a coppie secondo il modello dei tornei FIBur: turni a smazzate fisse, punti partita (M.P.) convertiti in punti vittoria (V.P.), classifica, coppie dispari con riposo, ritiri.

Gli admin gestiscono il torneo; gli altri partecipanti seguono tavoli, timer e classifica in tempo reale dal proprio telefono.

## Costi e dipendenze

- **Hosting**: GitHub Pages, gratuito. Sul piano GitHub gratuito il repository deve essere pubblico.
- **Database e login**: Firebase, solo piano gratuito Spark (nessun metodo di pagamento richiesto). Limiti del Realtime Database: 100 connessioni simultanee, 1 GB di dati, 10 GB scaricati al mese. Un torneo pesa pochi kilobyte e l'app invia solo le parti modificate; il timer non scrive nulla mentre scorre.
- **Font**: Syne, Space Grotesk e Anybody (licenza SIL Open Font), inclusi nel progetto: nessuna chiamata a servizi esterni.
- **SDK Firebase**: versione 13.3.0, inclusa in `js/vendor/firebase.js`.

## Modalità prova

Se `js/firebase-config.js` è vuoto, l'app parte in modalità prova: niente login, i dati restano nel browser. Serve per provarla prima di collegare Firebase.

## Collegare Firebase

1. Crea un progetto su console.firebase.google.com (piano Spark, gratuito).
2. Authentication > Metodo di accesso: attiva **Google** e **Email/password**.
3. Realtime Database: crea il database (posizione consigliata: Europa, `europe-west1`), poi in **Regole** incolla il contenuto di `database.rules.json` e pubblica.
4. Impostazioni progetto > Le tue app > aggiungi un'app web e copia i valori in `js/firebase-config.js` (`apiKey`, `authDomain`, `databaseURL`, `projectId`, `appId`). Questi valori non sono segreti: la protezione è data dalle regole del database.
5. Authentication > Impostazioni > Domini autorizzati: aggiungi il dominio di GitHub Pages (per esempio `nomeutente.github.io`).

## Pubblicare su GitHub Pages

Settings > Pages > Deploy from a branch > `main`, cartella `/ (root)`.

## Test

```
npm test
```

I test coprono le tabelle V.P., i quattro sistemi di abbinamento, la classifica con i criteri di parità, il riposo con coppie dispari, i ritiri e il timer, simulando tornei da 3 a 13 coppie.

## Struttura

- `js/regolamento.js`: tutti i valori del regolamento (tempi, tabelle V.P., riposo, fonti).
- `js/engine.js`: logica del torneo, senza dipendenze.
- `js/store.js`: Firebase o modalità prova.
- `js/app.js`: interfaccia.
- `database.rules.json`: regole di sicurezza (solo gli admin scrivono i dati del torneo).

## Da verificare

- Punteggio di riposo: valori dei codici FGB 2025 e ASC BurracoUp 2024, da confrontare con il codice FIBur.
- Le regole di sicurezza non sono ancora state provate su un progetto Firebase reale.
