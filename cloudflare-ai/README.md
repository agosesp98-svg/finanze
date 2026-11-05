# Finanze AI — attivazione gratuita

L'interfaccia AI è già presente nella PWA Finanze. Questo Worker è il backend privato: serve un account Cloudflare personale per pubblicarlo. **Non inserire chiavi, password o dati finanziari in questo repository pubblico.**

## 1. Crea un Worker

1. Apri [Cloudflare Dashboard](https://dash.cloudflare.com/) ed entra nel tuo account gratuito.
2. Apri **Workers & Pages → Create → Worker** e crea il Worker con nome `finanze-ai`.
3. Dal Worker, apri **Edit code**, sostituisci il codice iniziale con il contenuto di [worker.js](worker.js) e salva/pubblica.
4. In **Settings → Bindings**, aggiungi un binding **Workers AI** con nome esatto **`AI`**.
5. In **Settings → Variables and Secrets**, crea un nuovo **Secret** di nome esatto **`CHAT_ACCESS_TOKEN`**. Il valore dev'essere una chiave casuale, univoca e lunga almeno 32 caratteri; conservala nel tuo password manager. Mai in un file GitHub, commento pubblico o chat.
6. Pubblica nuovamente se il pannello te lo richiede. Copia l'indirizzo del tuo Worker simile a `https://finanze-ai.NOME.workers.dev`.

Puoi anche pubblicare da terminale con Node.js:

```sh
cd cloudflare-ai
npx wrangler login
npx wrangler deploy
npx wrangler secret put CHAT_ACCESS_TOKEN
```

Nel file [wrangler.toml](wrangler.toml) il binding AI è già configurato. Sostituisci la chiave con quella scelta da te **soltanto nel prompt segreto**, mai nel repository.

## 2. Collega Finanze

1. Apri la tua PWA **Finanze → AI → Configura**.
2. Inserisci l'URL `https://finanze-ai.NOME.workers.dev` e la stessa chiave privata.
3. Salva e invia una domanda di prova.
4. Per domande su saldi, budget e scadenze, attiva **Usa il riepilogo delle mie finanze**.

La chiave è memorizzata soltanto nel browser/PWA, separata dal backup JSON. La cronologia chat e le preferenze sono salvate nell'IndexedDB locale (quindi **sono incluse nel backup JSON**). Il backend non conserva la cronologia né scrive movimenti nell'app.

## Privacy e costi

- Il client non trasmette automaticamente dati finanziari: l'invio del riepilogo deve essere attivato esplicitamente.
- Se il riepilogo è attivo, vengono inviati solo gli importi e i nomi essenziali relativi a conti, budget, obiettivi, rate e scadenze; **non** vengono inviati movimenti storici, file, IBAN o documenti.
- Le domande e gli eventuali riepiloghi inviati vengono elaborati da **Cloudflare Workers AI**. Il backend non memorizza le richieste e non attiva log dei contenuti, ma Cloudflare è un fornitore esterno.
- L'endpoint risponde soltanto alle richieste provenienti dal dominio della PWA e con chiave privata valida. Non è un sistema di accesso multiutente.
- Il modello predefinito è `@cf/meta/llama-3.1-8b-instruct-fp8`, disponibile su Workers AI. Cloudflare offre **10.000 neurons gratis al giorno** nel piano Free: quando si raggiunge la quota, il servizio può interrompere le risposte fino al rinnovo; non viene automaticamente effettuato alcun addebito nel piano Free.
- L'AI è **consultiva e in sola lettura**: gli importi affidabili sono quelli calcolati dal motore finanziario dell'app. L'AI può sbagliare, specialmente su previsioni e ipotesi.

## Diagnostica

- **Chiave non valida (401)**: verifica la corrispondenza con `CHAT_ACCESS_TOKEN`.
- **Backend non configurato (503)**: controlla l'esistenza del secret e del binding `AI`.
- **Impossibile raggiungere Cloudflare**: verifica l'URL del Worker, la connessione e la pubblicazione del codice.
- **Quota esaurita**: controlla Workers AI nel pannello Cloudflare.
- **Modifiche alla chat su iPhone**: apri la PWA aggiornata senza cancellare dati Safari, per non eliminare IndexedDB.

Documentazione ufficiale: [Workers AI setup](https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/), [Bindings](https://developers.cloudflare.com/workers-ai/configuration/bindings/), [Secrets](https://developers.cloudflare.com/workers/configuration/secrets/), [Pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).
