# Reitano Automazioni Industriali & Service

Sito vetrina aesthetic, semplice e modificabile con **Node.js + Express**.

Include:

- homepage bianca, moderna, pulita e responsive;
- logo SVG minimal ripensato;
- sezione lavori a scorrimento con tutte le immagini fornite;
- ogni lavoro apribile in una pagina dettaglio dedicata (`/lavori/nome-lavoro`);
- gallery immagini aggiuntive per ogni lavoro gestibile da admin;
- form preventivo completo;
- form contatto;
- area clienti installabile PWA in `/app`;
- gestionale amministratore installabile PWA in `/admin-app`;
- gestione clienti, interventi, messaggi, fatture e metodi di pagamento;
- salvataggio richieste nel backend/admin;
- invio richieste via email tramite SMTP;
- pannello admin per modificare testi, colori della home, contatti, servizi, lavori, immagini, sezioni e JSON completo.

---

## 1) Avvio locale

```bash
cd reitano-automazioni-site
npm install
npm start
```

Apri:

```text
Sito:  http://localhost:3000
Admin: http://localhost:3000/admin
```

Password admin iniziale:

```text
cambia-subito
```

---

## 2) Cambia password admin

Copia `.env.example` in `.env`:

```bash
cp .env.example .env
```

Modifica `.env`:

```env
PORT=3000
ADMIN_PASSWORD=metti-una-password-forte
ADMIN_SECRET=metti-una-frase-segreta-lunga
```

Riavvia:

```bash
npm start
```

---

## 3) Configura invio email form

Le richieste vengono sempre salvate in:

```text
data/leads.json
```

e sono visibili da:

```text
/admin > Richieste
```

Per riceverle anche via email devi configurare SMTP nel file `.env`:

```env
SMTP_HOST=smtp.tuodominio.it
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=info@tuodominio.it
SMTP_PASS=password-email-o-app-password
MAIL_FROM="Reitano Automazioni <info@tuodominio.it>"
MAIL_TO=info@tuodominio.it
```

Esempi:

- dominio/email professionale: usa i dati SMTP del provider;
- Gmail: usa una **password per app**, non la password normale;
- Aruba/OVH/Register/etc.: usa SMTP fornito dal servizio email.

Senza SMTP il sito funziona comunque: salva le richieste nel pannello admin e genera il messaggio WhatsApp.

---

## 4) Modificare il sito dal pannello admin

Vai su:

```text
http://localhost:3000/admin
```

Puoi modificare:

- nome sito e tagline;
- testi della homepage;
- colori, font e dimensioni carattere da “Contenuti base > Colori, font e dimensioni home page”;
- titoli di tutte le sezioni;
- telefono, email, WhatsApp, indirizzo, social;
- servizi e icone moderne;
- lavori, immagini principali, pagine dettaglio e gallery aggiuntive;
- metodo di lavoro;
- numeri/statistiche;
- SEO;
- JSON completo avanzato.

Dopo ogni modifica premi **Salva modifiche**.

---

## 5) Immagini lavori

Le immagini fornite sono state inserite in:

```text
public/uploads/lavori/
```

Dal pannello admin puoi caricare altre immagini da **Lavori + immagini**.

---

## 6) Struttura progetto

```text
reitano-automazioni-site/
├── server.js
├── package.json
├── .env.example
├── data/
│   ├── content.json
│   └── leads.json
└── public/
    ├── index.html
    ├── admin.html
    ├── logo.svg
    ├── favicon.svg
    ├── css/
    │   ├── style.css
    │   └── admin.css
    ├── js/
    │   ├── app.js
    │   └── admin.js
    └── uploads/
        └── lavori/
```

---

## 7) Pubblicazione

Ti serve hosting che supporti Node.js.

Puoi usare:

- VPS;
- Render;
- Railway;
- Fly.io;
- hosting Node con disco persistente.

Attenzione: contenuti e richieste sono salvati su file JSON. Per uso professionale scegli un hosting con disco persistente, oppure in futuro collega SQLite/PostgreSQL.

Comando avvio in produzione:

```bash
npm install
npm start
```

---

## 8) App clienti e gestionale admin

Il progetto ora include due app installabili:

```text
/app        Area clienti
/admin-app  Gestionale amministratore
```

### Area clienti `/app`

Il cliente può:

- registrarsi e accedere;
- richiedere interventi;
- vedere stato e storico degli interventi;
- inviare messaggi sulla scheda intervento;
- consultare fatture;
- vedere metodi di pagamento;
- contattarti via telefono, email o WhatsApp;
- installare l'app su telefono/desktop se il browser lo permette.

### Gestionale amministratore `/admin-app`

L'amministratore può:

- gestire clienti;
- creare e aggiornare interventi;
- inviare messaggi ai clienti sulle schede intervento;
- creare fatture;
- cambiare stato fatture: bozza, inviata, pagata, scaduta, annullata;
- stampare fatture;
- gestire metodi di pagamento;
- controllare dashboard ordini/incassi.

L'accesso usa la stessa password admin configurata in `.env`.

File dati aggiunti:

```text
data/clients.json
data/interventions.json
data/invoices.json
data/app-settings.json
```

Nota: per produzione professionale è consigliato passare da JSON a database SQLite/PostgreSQL quando i dati aumentano.

### Modulo quadri elettrici / impianti

Nell'area clienti e nel gestionale admin è stata aggiunta la sezione **Quadri**.

Funzioni disponibili:

- associare un quadro a un cliente;
- collegare il quadro a un lavoro del portfolio o a un intervento;
- registrare segnali tipo temperatura, assorbimento, stato motore, allarmi, ecc.;
- salvare lo storico dei segnali;
- vedere grafico andamento semplificato;
- inviare comandi software di accensione, spegnimento e reset allarme;
- vedere comandi in attesa/completati;
- suddividere i quadri per lavoro realizzato al cliente.

Nota tecnica: i comandi accensione/spegnimento sono già gestiti dal backend come comandi e storico. Per controllare fisicamente un quadro reale serve collegare un gateway/PLC/relè con API o MQTT. La struttura è pronta per questa integrazione.

---

## 9) Database unico, realtime e aggiornamenti

Il backend ora usa un archivio centrale per collegare sito, app clienti e gestionale admin.

### Database

Con **Node.js 24+** viene usato automaticamente SQLite nativo:

```text
data/reitano.sqlite
```

I file JSON restano come backup leggibile:

```text
data/*.json
```

Se SQLite non è disponibile, il server continua a funzionare con i file JSON.

Puoi verificare lo storage attivo da:

```text
/api/health
```

Risposta esempio:

```json
{
  "storage": "sqlite",
  "realtime": true
}
```

### Comunicazione in tempo reale

È stato aggiunto un canale realtime con Server-Sent Events:

```text
/api/events
```

Quando admin modifica interventi, quadri, fatture, clienti o contenuti, le app ricevono l'evento e aggiornano i dati.

### Versioni e aggiornamenti

Per rilasciare facilmente nuove versioni:

```bash
npm run release:patch
npm run release:minor
npm run release:major
```

Questo aggiorna:

- `package.json`;
- `data/app-settings.json`;
- cache del service worker.

Controllo versione:

```text
/api/version
```

### Nota produzione

Per controllo reale di accensione/spegnimento quadri serve collegare un gateway/PLC/API/MQTT. Il software è già predisposto: salva comandi, stato, storico, allarmi e segnali.

---

## 10) Logo e accessi amministrativi

Il logo ufficiale è vettoriale in:

```text
public/logo.svg
```

Da pannello admin puoi cambiarlo in:

```text
/admin > Contenuti base > Brand > Logo URL
```

oppure caricando un nuovo file SVG/PNG/JPG dal campo **Carica nuovo logo**.

Nel sito vetrina non sono mostrati link al gestionale o all'editor admin. L'accesso amministratore è diretto:

```text
/admin
/admin-app
```

Per sicurezza, admin ed admin-app chiedono sempre la password a ogni apertura della pagina.

---

## 11) Richieste sito, pagamenti e scadenziario

Le richieste inviate dai form del sito non sono più pensate come gestione contenuti: sono visibili nel gestionale operativo:

```text
/admin-app > Richieste sito
```

Da lì puoi:

- vedere preventivi e contatti arrivati dal sito;
- convertirli in cliente + intervento;
- archiviarli.

I dati bancari **non compaiono nel sito vetrina pubblico**.

I metodi di pagamento operativi, Ri.Ba., IBAN e note di incasso si gestiscono solo dal gestionale admin:

```text
/admin-app > Pagamenti
```

Le fatture supportano tipo pagamento, inclusa **Ri.Ba.**, e scadenza. Il gestionale rileva automaticamente:

- fatture scadute;
- fatture in scadenza;
- promemoria creati;
- email promemoria se SMTP è configurato;
- traccia dei promemoria anche se SMTP non è configurato.

Sezione:

```text
/admin-app > Scadenze
```

### Local Admin operativo

Tutta la gestione operativa è nel Local Admin:

```text
/local-admin
```

È equivalente a `/admin-app`, ma è il percorso consigliato per gestione locale.

Nel sito vetrina pubblico non compaiono dati bancari né link amministrativi. I dati bancari/metodi pagamento sono solo nel Local Admin:

```text
/local-admin > Pagamenti
/local-admin > Fatture
/local-admin > Scadenze
```

Dashboard Local Admin include tabelle e grafici per:

- clienti registrati;
- richieste arrivate dal sito;
- stato lavori/interventi;
- stato pagamenti/fatture;
- scadenze e Ri.Ba.;
- quadri/impianti;
- importi da incassare.

---

## 12) Sicurezza, password admin, recensioni e recupero account

### Cambiare password admin

Da:

```text
/admin > Sicurezza
```

puoi cambiare la password amministratore. La password viene salvata in:

```text
data/security.json
```

Se non esiste una password salvata, il sistema usa `ADMIN_PASSWORD` del file `.env`.

### Admin unificato

Da `/admin` trovi anche una sezione **Local Admin** che apre il gestionale operativo. Il percorso diretto resta:

```text
/local-admin
```

### Recupero password clienti

L'area clienti `/app` include:

- recupero password via email;
- recupero con telefono se il cliente non ricorda l'email;
- token di reset con scadenza;
- tracciamento richieste recupero nel local admin.

Per inviare email reali serve configurare SMTP in `.env`.

### Recensioni clienti

Il cliente può lasciare recensioni solo su interventi completati.

Flusso:

```text
Cliente invia recensione > Local Admin approva > Recensione compare sul sito
```

Gestione:

```text
/local-admin > Recensioni
```

### Sicurezza aggiunta

Il progetto include:

- password hash PBKDF2;
- token firmati HMAC con scadenza;
- rate limit base su login e recupero password;
- header sicurezza HTTP;
- no cache sulle API;
- admin non persistente in localStorage;
- validazione input e limiti upload;
- separazione sito pubblico / local admin.

Nota: nessun software può essere dichiarato invulnerabile al 100%, ma questa base è adeguata per partire con VPS, HTTPS e password forti.

---

## 13) Reset sito, colori e Google login

### Se colori/font non si aggiornano

Vai in:

```text
/admin > Ripristino
```

Hai tre strumenti:

- **Ripristina solo colori/font**: resetta tema, dimensioni e font;
- **Reset contenuti sito**: ripristina il sito ai contenuti iniziali e crea backup automatico;
- **Esporta contenuti JSON**: scarica una copia dei contenuti attuali.

I backup dei contenuti vengono creati in:

```text
data/content-backup-*.json
```

### Google login clienti

È stato predisposto il login cliente tramite account Google.

Per attivarlo devi creare un OAuth Client ID Web in Google Cloud Console e inserire nel `.env`:

```env
GOOGLE_CLIENT_ID=xxxxxxxxxxxxxxxx.apps.googleusercontent.com
PUBLIC_URL=https://tuodominio.it
```

Origini JavaScript autorizzate da inserire su Google:

```text
https://tuodominio.it
```

URI redirect autorizzati non sono necessari per Google Identity Services con credential callback, ma puoi inserire comunque:

```text
https://tuodominio.it/app
```

Poi riavvia:

```bash
pm2 restart reitano
```

Senza `GOOGLE_CLIENT_ID` il pulsante mostra che Google login non è configurato.

### Aggiornare senza reinstallare tutto

Quando ricevi un aggiornamento ZIP:

```bash
cd /root
unzip -o reitano-automazioni-site.zip
rsync -av --exclude='.env' --exclude='data' --exclude='public/uploads' /root/reitano-automazioni-site/ /var/www/reitano-automazioni-site/
cd /var/www/reitano-automazioni-site
npm install
pm2 restart reitano
```

Così non perdi database, immagini e configurazioni.

---

## 14) Cookie, privacy, sfondo home e 2FA admin

### Cookie e privacy

Il sito include banner cookie reale con preferenze:

```text
Tecnici necessari
Funzionali
Marketing/statistiche
```

Pagina privacy:

```text
/privacy.html
```

Il consenso viene salvato in cookie:

```text
reitano_cookie_consent
```

### Immagine sfondo home

Da:

```text
/admin > Contenuti base > Colori, font e dimensioni home page
```

puoi impostare:

```text
Immagine sfondo home URL
Opacità overlay home
Opacità immagine sfondo
```

Puoi anche caricare l'immagine direttamente dal campo upload.

### Autenticazione due fattori admin

Da:

```text
/admin > Sicurezza > Autenticazione a due fattori 2FA
```

puoi:

- generare chiave 2FA;
- inserirla in Google Authenticator/Microsoft Authenticator;
- confermare con codice a 6 cifre;
- disattivarla con password admin.

Dopo l'attivazione, ogni login admin richiede password + codice 2FA.

### Sicurezza

Sono presenti:

- rate limit su login e reset password;
- token admin firmati e con scadenza;
- 2FA TOTP;
- password hash PBKDF2;
- headers di sicurezza;
- separazione sito pubblico/admin;
- consenso cookie;
- nessuna cache su API;
- validazione token Google lato backend.

Nota: nessun sistema può essere definito impenetrabile al 100%. Mantieni server aggiornato, HTTPS attivo, password forti, backup e 2FA.

Per Google login leggi:

```text
GOOGLE_LOGIN_SETUP.md
```

---

## 15) Contatti definitivi e test email richieste

Contatti preimpostati nel sito:

```text
Telefono: +39 351 912 5291
WhatsApp: +39 351 912 5291
Email: reitanopasquale12@gmail.com
```

I form del sito mostrano al cliente solo:

```text
La tua richiesta è stata inoltrata.
```

Non mostrano link interni, pannello admin o messaggi tecnici.

### Configurare invio email con Gmail

Nel file `.env` usa:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=reitanopasquale12@gmail.com
SMTP_PASS=password-per-app-gmail
MAIL_FROM="Reitano Automazioni <reitanopasquale12@gmail.com>"
MAIL_TO=reitanopasquale12@gmail.com
```

Importante: Gmail non accetta la password normale. Devi creare una **Password per le app**:

```text
Google Account > Sicurezza > Verifica in due passaggi > Password per le app
```

### Test invio email

Metodo 1 dal pannello:

```text
/admin > Sicurezza > Test invio email SMTP
```

Metodo 2 da terminale:

```bash
npm run test:email
```

Se il test funziona, anche le richieste preventivo arriveranno all'indirizzo configurato in `MAIL_TO`.
