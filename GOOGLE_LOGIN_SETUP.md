# Configurare accesso/registrazione con Google

Questa guida abilita il pulsante Google reale nell'area clienti `/app`.

## 1. Apri Google Cloud Console

Vai su:

```text
https://console.cloud.google.com/
```

Accedi con il tuo account Google.

## 2. Crea un progetto

Clicca in alto sul selettore progetti e crea un nuovo progetto:

```text
Reitano Automazioni
```

## 3. Configura OAuth consent screen

Vai in:

```text
API e servizi > Schermata consenso OAuth
```

Scegli:

```text
External / Esterno
```

Compila:

```text
Nome app: Reitano Automazioni
Email supporto: la tua email
Dominio autorizzato: tuodominio.it
Email sviluppatore: la tua email
```

Salva.

## 4. Crea credenziali OAuth

Vai in:

```text
API e servizi > Credenziali > Crea credenziali > ID client OAuth
```

Tipo applicazione:

```text
Applicazione web
```

Nome:

```text
Reitano Area Clienti
```

## 5. Origini JavaScript autorizzate

Per produzione inserisci:

```text
https://tuodominio.it
https://www.tuodominio.it
```

Per test locale puoi aggiungere:

```text
http://localhost:3000
```

## 6. URI redirect autorizzati

Per Google Identity Services non è obbligatorio un redirect classico, ma puoi inserire:

```text
https://tuodominio.it/app
https://www.tuodominio.it/app
http://localhost:3000/app
```

## 7. Copia Client ID

Google ti fornisce un valore tipo:

```text
1234567890-abcdefg.apps.googleusercontent.com
```

## 8. Inseriscilo nel file .env

Sul server modifica:

```bash
nano /var/www/reitano-automazioni-site/.env
```

Aggiungi:

```env
PUBLIC_URL=https://tuodominio.it
GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com
```

## 9. Riavvia

```bash
pm2 restart reitano
```

## 10. Test

Apri:

```text
https://tuodominio.it/app
```

Nel login e nella registrazione comparirà il pulsante Google funzionante.

## Note importanti

- Il login Google crea automaticamente un cliente se l'email non esiste.
- Se l'email esiste già, collega l'accesso Google al cliente esistente.
- Il server verifica il token Google lato backend con `https://oauth2.googleapis.com/tokeninfo`.
- Se manca `GOOGLE_CLIENT_ID`, il pulsante mostra “Google login non configurato”.

## Configurazione rapida tramite comando

Dopo aver creato il Client ID Google, puoi inserirlo automaticamente nel file `.env` con:

```bash
npm run config:google -- 1234567890-abcdefg.apps.googleusercontent.com https://tuodominio.it
```

Esempio in locale:

```bash
npm run config:google -- 1234567890-abcdefg.apps.googleusercontent.com http://localhost:3000
```

Poi riavvia:

```bash
npm start
```

oppure in produzione:

```bash
pm2 restart reitano
```

Se il Client ID è configurato correttamente, in `/app` compare il pulsante ufficiale Google. Se non è configurato, il box Google viene nascosto e resta disponibile il login email.
