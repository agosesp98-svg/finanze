# Privacy e sicurezza — Finanze

Questo repository è **pubblico** e contiene solo codice sorgente della PWA, configurazioni non segrete e test con dati sintetici.

## Dove si trovano i dati

- Conti, movimenti, budget, finanziamenti, obiettivi e impostazioni sono conservati nell'**IndexedDB del browser/dispositivo**.
- L'importazione di piani JSON e dei backup avviene **localmente nel browser**: non crea commit e non carica file su GitHub.
- I backup esportati contengono informazioni private, incluse eventuali conversazioni AI. Non allegarli mai a issue, pull request o commit.
- Il token Cloudflare va configurato come **secret del Worker** e viene inserito dall'utente nell'app. Non pubblicarlo in file GitHub, screenshot o issue.
- Se si attiva volontariamente la condivisione del riepilogo con Finanze AI, i dati selezionati vengono inviati a **Cloudflare Workers AI**. Questo è distinto da GitHub e non equivale a conservazione esclusiva sul dispositivo.

## Precauzioni

1. Non aggiungere file di backup, estratti conto, JSON di piani reali, credenziali o database al repository.
2. Le regole di `.gitignore` impediscono di *aggiungere accidentalmente* file non tracciati con nomi sensibili, ma **non proteggono file già pubblicati**, né eliminano la cronologia Git.
3. Le verifiche automatiche sui commit sono difese aggiuntive, **non una garanzia** che tutti i segreti vengano rilevati.
4. Conserva i backup offline in un luogo protetto: cancellare dati o cache del browser può eliminare anche l'archivio IndexedDB.
5. Se un token o un dato privato viene pubblicato, revoca/ruota subito le credenziali interessate e verifica la cronologia. La sola eliminazione del file dall'ultimo commit non basta.

Il sito GitHub Pages è pubblico: **non considerarlo un sistema di autenticazione o un archivio privato**.
