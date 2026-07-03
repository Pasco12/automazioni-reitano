# Rapporto sicurezza dipendenze

Ultimo controllo eseguito: 2026-07-02

## Comandi eseguiti

```bash
npm install express@^4.22.2 dotenv@^16.6.1 nodemailer@^9.0.3
npm audit --audit-level=low
node --check server.js
node --check public/js/*.js
node --check scripts/*.js
```

## Risultato npm audit

```text
found 0 vulnerabilities
```

Vulnerabilità rilevate:

```text
critical: 0
high: 0
moderate: 0
low: 0
info: 0
total: 0
```

## Dipendenze aggiornate

```json
{
  "dotenv": "^16.6.1",
  "express": "^4.22.2",
  "multer": "^2.0.2",
  "nodemailer": "^9.0.3"
}
```

## Protezioni già presenti nel progetto

- Password admin e clienti con hash PBKDF2.
- Token firmati HMAC con scadenza.
- 2FA TOTP per admin.
- Rate limit su login e recupero password.
- Header sicurezza HTTP.
- API no-cache.
- Validazione token Google lato backend.
- Cookie consent e privacy policy.
- Upload limitato e filtrato per MIME type.
- Nessun link admin nel sito pubblico.

Nota: nessun sito può essere garantito impenetrabile al 100%, ma allo stato attuale `npm audit` non rileva vulnerabilità nelle dipendenze.
