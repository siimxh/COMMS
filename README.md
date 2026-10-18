# Comms

Tool web per chi fa chiamate di vendita (Setter e Venditore): sessioni di chiamata, appuntamenti, lead, incassi e statistiche.

- Versione in uso: https://comms-wine.vercel.app (login e dati su Supabase)
- Pagina statica: HTML, CSS e JavaScript puro, niente build
- File principali: `index.html`, `app.js` (interfaccia), `lead.js` (parte Venditore), `cloud-sync.js` (login e salvataggio online), `storage.js`, `utils.js`, `style.css`
- Database: `supabase/schema.sql`
- Prove nel browser: `tools/prova-tracker.js`

Come funziona e regole di lavoro: vedi [CLAUDE.md](CLAUDE.md).
