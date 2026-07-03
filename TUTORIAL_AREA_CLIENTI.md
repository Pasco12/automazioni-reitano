# Tutorial professionale Area Clienti — Reitano Automazioni

## Obiettivo dell'area clienti

L'area clienti consente ai clienti di Reitano Automazioni Industriali & Service di avere un punto unico per comunicare, richiedere interventi, seguire lo stato dei lavori e consultare documenti amministrativi.

L'app è pensata per ridurre messaggi dispersi su WhatsApp, telefonate non tracciate e informazioni incomplete sugli interventi.

## Accesso

Il cliente accede da:

```text
/app
```

Può:

- registrarsi autonomamente;
- accedere con email e password;
- recuperare la password se dimenticata;
- chiedere recupero account se non ricorda l'email.

## Registrazione

Il cliente inserisce:

- nome e cognome;
- azienda;
- email;
- telefono;
- password.

Una volta registrato, il cliente può entrare nell'app e creare richieste.

## Richiedere un intervento

Dalla sezione **Nuova richiesta** il cliente compila:

- titolo richiesta;
- servizio richiesto;
- priorità;
- data preferita;
- luogo intervento;
- descrizione dettagliata.

La richiesta viene salvata nel gestionale amministratore e diventa tracciabile.

## Seguire gli interventi

Dalla sezione **Interventi** il cliente può vedere:

- stato del lavoro;
- priorità;
- luogo;
- data programmata;
- note del tecnico;
- messaggi scambiati.

Gli stati possibili sono:

- Richiesto;
- Programmato;
- In lavorazione;
- In attesa materiali;
- Completato;
- Annullato.

## Messaggi sull'intervento

Dentro ogni intervento il cliente può scrivere un messaggio.

Esempi:

- informazioni aggiuntive;
- orari disponibili;
- sintomi del guasto;
- richieste di aggiornamento.

Questi messaggi restano collegati alla scheda intervento.

## Quadri e impianti

La sezione **Quadri** consente al cliente di visualizzare eventuali quadri elettrici o impianti collegati ai lavori realizzati.

Per ogni quadro può vedere:

- stato online/offline/manutenzione/allarme;
- stato acceso/spento;
- segnali configurati;
- storico andamento;
- eventuali allarmi;
- comandi disponibili.

I comandi software disponibili, se abilitati dall'amministratore, sono:

- Accendi;
- Spegni;
- Reset allarme.

Nota: il controllo fisico reale richiede un gateway/PLC/API collegato al quadro.

## Fatture e scadenze

Dalla sezione **Fatture** il cliente vede:

- numero fattura;
- stato pagamento;
- tipo pagamento;
- importo;
- IVA;
- totale;
- scadenza;
- promemoria.

Se una fattura è in scadenza o scaduta, l'app mostra l'informazione in automatico.

## Recensioni

Il cliente può lasciare una recensione solo dopo un intervento completato.

La recensione:

1. viene inviata;
2. resta in attesa di approvazione;
3. viene pubblicata sul sito solo se approvata dall'amministratore.

Questo evita recensioni non controllate o non pertinenti.

## Contatti rapidi

La sezione **Contatti** permette al cliente di usare:

- telefono;
- WhatsApp;
- email;
- mappa/sede.

## Installazione come app

Da smartphone Android:

1. aprire Chrome;
2. entrare in `/app`;
3. premere i tre puntini;
4. scegliere “Installa app” o “Aggiungi a schermata Home”.

Su iPhone:

1. aprire Safari;
2. entrare in `/app`;
3. premere condividi;
4. scegliere “Aggiungi alla schermata Home”.

## Benefici per il cliente

- richieste ordinate;
- aggiornamenti sempre disponibili;
- storico interventi;
- documenti consultabili;
- meno telefonate perse;
- comunicazioni più chiare;
- area dedicata all'azienda cliente.

## Benefici per Reitano Automazioni

- richieste centralizzate;
- meno dispersione di informazioni;
- tracciabilità interventi;
- gestione clienti più professionale;
- fatture e scadenze sotto controllo;
- possibilità futura di collegare quadri e telemetria reale.

## Profilo e cambio password

Dalla sezione **Profilo** il cliente può aggiornare:

- nome;
- azienda;
- telefono;
- indirizzo;
- P.IVA / CF;
- password.

Quando la password viene cambiata, il sistema invia una email di conferma all'indirizzo registrato, se SMTP è configurato.

## Recupero password

Dalla schermata di accesso è disponibile la voce **Recupera**.

Il cliente può inserire:

- email dell'account;
- oppure telefono, se non ricorda l'email.

Se i dati corrispondono, riceve via email:

- codice recupero;
- link diretto;
- istruzioni per impostare una nuova password.

Il codice scade dopo 60 minuti.
