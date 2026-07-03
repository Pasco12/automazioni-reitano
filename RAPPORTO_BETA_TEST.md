# Rapporto Beta Test Finale — Reitano Automazioni

Data test: 2026-07-01

## Esito generale

Il progetto è stato controllato come sito completo:

- sito vetrina pubblico;
- pagine dettaglio lavori;
- area clienti;
- local admin;
- editor sito;
- privacy/cookie;
- API backend;
- autenticazione admin;
- 2FA admin;
- registrazione clienti;
- recupero password clienti;
- richieste sito;
- conversione richiesta in cliente/intervento;
- fatture e scadenze;
- recensioni con approvazione;
- quadri elettrici, telemetria e comandi;
- reset sito/tema;
- Google config endpoint.

Risultato:

```text
ALL BETA TESTS PASSED
```

## Controlli tecnici eseguiti

```bash
node --check server.js
node --check public/js/app.js
node --check public/js/work.js
node --check public/js/client-app.js
node --check public/js/admin.js
node --check public/js/admin-app.js
node --check public/js/cookie-consent.js
npm audit --audit-level=high
```

Risultato audit:

```text
0 vulnerabilità alte
```

## Pagine testate

```text
/
/app
/admin
/local-admin
/admin-app
/privacy.html
/lavori/quadro-automazione-con-inverter
/manifest.webmanifest
/manifest-admin.webmanifest
/service-worker.js
/whatsapp.svg
/instagram.svg
/google.svg
/logo.svg
```

Tutte hanno risposto correttamente.

## Test funzionali superati

- Login admin.
- Cambio colori/tema e salvataggio contenuti.
- Reset tema.
- Setup 2FA.
- Verifica 2FA.
- Cambio password admin.
- Vecchia password admin respinta.
- Nuova password admin accettata.
- Invio richiesta dal sito.
- Visualizzazione richiesta in Local Admin.
- Conversione richiesta in cliente + intervento.
- Login cliente.
- Cambio password cliente.
- Recupero password cliente.
- Creazione intervento completato.
- Invio recensione cliente.
- Approvazione recensione admin.
- Pubblicazione recensione approvata sul sito.
- Creazione fattura.
- Calcolo imponibile/IVA/totale.
- Tracciamento scadenza fattura.
- Creazione quadro elettrico.
- Aggiornamento telemetria quadro.
- Visualizzazione quadro lato cliente.
- Comando spegnimento quadro.
- Reset sito con backup automatico.
- Endpoint configurazione Google.

## Note prima della pubblicazione

Prima di andare online configurare nel file `.env`:

```env
PUBLIC_URL=https://tuodominio.it
ADMIN_PASSWORD=password-iniziale-forte
ADMIN_SECRET=frase-segreta-lunga
SMTP_HOST=smtps.aruba.it
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=mail@tuodominio.it
SMTP_PASS=password-mail
MAIL_FROM="Reitano Automazioni <mail@tuodominio.it>"
MAIL_TO=mail@tuodominio.it
GOOGLE_CLIENT_ID=client-id-google.apps.googleusercontent.com
```

Dopo la pubblicazione:

1. attivare HTTPS;
2. cambiare password admin da `/admin > Sicurezza`;
3. attivare 2FA da `/admin > Sicurezza`;
4. testare invio email SMTP da `/admin > Sicurezza`;
5. verificare Google Login su `/app`.

## Merge versione Drive 1DgQvQcVFpprlyxXUpR2C_kv8NiRlZktw

Implementate le ultime funzionalità nella versione Drive richiesta:

- logo fornito `Logonuovo.png` copiato in `public/logo-brand.png`;
- background fornito `background.png` copiato in `public/home-background.png`;
- `data/content.json` e `data/default-content.json` configurati per usare nuovo logo e sfondo;
- mantenute tutte le ultime funzioni: cookie, privacy, Google login, 2FA, admin unificato, local admin, recensioni, email, reset sito, test email, sicurezza e audit;
- verificato che il sito pubblico non mostri link admin o dati bancari;
- verificati endpoint `/`, `/app`, `/admin`, `/local-admin`, `/privacy.html`, `/logo-brand.png`, `/home-background.png`;
- `npm audit --audit-level=high`: 0 vulnerabilità alte.

## Fix v17 - Floating call e Google box

Correzioni applicate:

- Pulsante flottante "Chiama" centrato in basso.
- Pulsante "Chiama" spostato automaticamente sopra il footer tramite JavaScript.
- WhatsApp resta a destra e segue la stessa distanza dal footer.
- Navbar home e pagina lavori allineate: Servizi, Chi siamo, Lavori, Contatti.
- Privacy e Area clienti presenti solo nel footer.
- Box Google sempre presente in area clienti: se GOOGLE_CLIENT_ID è assente mostra pulsante Google con messaggio di configurazione; se presente carica il pulsante ufficiale Google Identity Services.
- Audit dipendenze: 0 vulnerabilità alte.
