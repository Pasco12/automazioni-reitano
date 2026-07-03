# Codice reale modificabile — sicurezza, password ed email

Questo file indica dove si trova il codice modificabile per password admin, password clienti e comunicazioni email.

## 1. Password admin

File principale:

```text
server.js
```

Funzioni:

```js
async function verifyAdminPassword(password)
async function setAdminPassword(newPassword)
app.post('/api/admin/password', requireAdmin, ...)
```

La password admin modificata da pannello viene salvata in:

```text
data/security.json
```

Non viene salvata in chiaro, ma come hash PBKDF2:

```js
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');
  return { salt, hash };
}
```

Per cambiarla da interfaccia:

```text
/admin > Sicurezza > Cambia password admin
```

## 2. Email su cambio password admin

File:

```text
server.js
```

Funzione:

```js
async function sendAdminPasswordChangedEmail()
```

Viene chiamata dentro:

```js
app.post('/api/admin/password', requireAdmin, ...)
```

## 3. Email registrazione cliente

File:

```text
server.js
```

Funzione:

```js
async function sendClientWelcomeEmail(client, tempPassword = '')
```

Viene chiamata quando il cliente si registra:

```js
app.post('/api/client/register', ...)
```

Viene chiamata anche quando l'admin crea un cliente da:

```text
/local-admin > Clienti
```

## 4. Email cambio password cliente

File:

```text
server.js
```

Funzione:

```js
async function sendClientPasswordChangedEmail(client, options = {})
```

Viene chiamata quando:

- il cliente cambia password dal profilo;
- il cliente recupera password;
- l'admin cambia password cliente.

Endpoint coinvolti:

```js
app.patch('/api/client/me', requireClient, ...)
app.post('/api/client/password-reset/confirm', ...)
app.patch('/api/admin/crm/clients/:id', requireAdmin, ...)
```

## 5. Recupero password cliente

File:

```text
server.js
public/js/client-app.js
public/app.html
```

Endpoint:

```js
app.post('/api/client/password-reset/request', ...)
app.post('/api/client/password-reset/confirm', ...)
app.post('/api/client/account-recovery/request', ...)
```

Funzione email:

```js
async function sendPasswordResetEmail(client, resetToken)
```

Il cliente riceve:

- codice recupero;
- link diretto `/app?reset=...&email=...`;
- scadenza 60 minuti.

## 6. Test SMTP da admin

Endpoint:

```js
app.post('/api/admin/test-email', requireAdmin, ...)
```

Interfaccia:

```text
/admin > Sicurezza > Test invio email SMTP
```

## 7. Configurazione SMTP

File:

```text
.env
```

Esempio Aruba:

```env
PUBLIC_URL=https://tuodominio.it
SMTP_HOST=smtps.aruba.it
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=info@tuodominio.it
SMTP_PASS=password-della-mail
MAIL_FROM="Reitano Automazioni <info@tuodominio.it>"
MAIL_TO=info@tuodominio.it
```

Senza SMTP il sistema salva e traccia comunque gli eventi, ma non può consegnare email reali.

## 8. Sicurezza

Funzioni importanti in `server.js`:

```js
rateLimit(...)
signPayload(...)
verifyPayload(...)
hashPassword(...)
verifyPassword(...)
requireAdmin(...)
requireClient(...)
```

Header sicurezza:

```js
X-Content-Type-Options
Referrer-Policy
X-Frame-Options
Permissions-Policy
Strict-Transport-Security
```

## 9. Nota importante

Il codice è modificabile. Però le password non devono essere mai salvate in chiaro dentro il codice sorgente. Il metodo corretto è quello implementato: hash in `data/security.json` oppure variabile `.env` iniziale.
