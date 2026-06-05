# Primer — task risolutivi per coding agent

Backlog operativo derivato da `primer-review.md`. Ogni task è pensato per essere indipendente.
Riferimenti ai rilievi tra parentesi (es. `B1`, `R1`, `§0c`).

> **Stato corrente (aggiornato 2026-06-03).** M1 è **parzialmente completata**: il test harness
> esiste già (`tests/{scanner,validator,sync,writer}.test.ts`, `package.json#scripts.test`),
> `bun test` è **verde (53 test)**. Restano da creare solo le **fixture di codice** (vedi T0).
> `docs/RECOVERY.md`, `docs/modules/sync.md` e `docs/modules/plugin-entry.md` **esistono già**:
> T7 è stato riscritto di conseguenza (non più "crea il file" ma "fai sì che setup lo generi").
> Tutti gli altri task restano fondati: i rilievi B1/B2/B3/B4/B5, R1/R2/R5 e M7 sono confermati
> nelle righe di codice indicate.

**Convenzioni per l'agente**
- Sorgenti del plugin: `.opencode/plugins/primer.ts`, `src/{scanner,writer,sync,validator,types}.ts`,
  template comando in `.opencode/commands/primer-*.md`.
- Runtime: `bun` (TS con import `.ts`). Verifica con `bun <file>.ts`.
- Ogni task con logica nuova **deve** aggiungere unit test (vedi T0).
- Non rompere il contratto pubblico dei tool (`primer_validate`, `primer_scan`, `primer_write`)
  senza aggiornare anche i template comando che li invocano.
- Ordine consigliato = ordine dei task. T0 prima di tutto.

---

## Milestone 0 — rete di sicurezza

### T0 — Estendere la suite con le fixture di codice mancanti (M1)
**Stato**: harness e suite di base **già presenti** (`tests/{scanner,validator,sync,writer}.test.ts`,
`package.json#scripts.test`, `bun test` verde con 53 test). Le fixture attuali
(`empty-repo`, `full-repo`, `partial-repo`) sono fixture di **documenti** primer, non di codice
sorgente. Questo task copre **solo** il pezzo mancante.
**File**: nuove fixture sotto `tests/fixtures/`; eventuali test aggiuntivi nei `*.test.ts` esistenti.
**Obiettivo**: dare a T1/T2/T3/T8/T9 le fixture di **codice reale** su cui asserire.
**Lavoro**:
- Creare `tests/fixtures/flask-flat/` — progetto **Python/Flask a layout piatto senza manifest**
  (`app.py` con handler `get_tasks/get_task/create_task/update_task/delete_task`, `tasks` come
  lista globale, `abort(404)`/`abort(400)` inline; **niente** `requirements.txt`/`pyproject.toml`).
  Riproduce B1 e fa da base per l'acceptance di T2/T8 (fedeltà al codice).
- Creare una fixture TS a layout piatto (entrypoint `index.ts` a radice, niente `src/`) per T2.
- Opzionale: fixture con `venv/`, `__pycache__/` e un symlink penzolante in `src/` per T3.
- Coprire con test le funzioni deterministiche non ancora testate emerse dai task
  (`writer.ts:29` path fuori root, `matchesAny`, `isPrimerDocPath`, `driftWarning`) se non già coperte.
**Accettazione**: `bun test` verde; esiste una fixture Python **senza** manifest (riproduce B1)
referenziata dai task successivi.

---

## Milestone 1 — correttezza dello scanner (famiglia B1)

### T1 — Rilevazione linguaggio robusta + esclusione dello scaffolding di primer (B1)
**File**: `src/scanner.ts` (`collectManifests`, `scan`).
**Lavoro**:
- Aggiungere un **fallback per censimento estensioni** quando nessun manifest mappa un linguaggio
  (`.py`→Python, `.go`→Go, `.rs`→Rust, `.rb`→Ruby, …): se il repo ha `app.py` ma nessun
  `requirements.txt`/`pyproject.toml`, `languages` deve includere `Python`.
- Riconoscere framework da segnali leggeri quando sensato (es. import `flask` in file `.py` → `Flask`).
- **Non far inquinare lo scan dagli artefatti di primer**: ignorare `package.json`/`tsconfig.json`/
  `bun.lock` quando sono accompagnati da `.opencode/plugins/primer.ts` (heuristica "questo è il
  plugin, non il progetto"), o più semplicemente escludere i path dello scaffolding.
**Accettazione**: sulla fixture Python di T0, `scan('.', 'meta').languages === ['Python']` (niente
JS/TS spurio). Test dedicato.

### T2 — Evidenza di codice reale: file sorgente top-level + simboli (B1, §0c)
**File**: `src/scanner.ts`, `src/types.ts` (estendere `ScanResult`).
**Motivazione**: il danno di `§0c` (LLD che inventa moduli/funzioni) nasce dal fatto che lo scan
ritorna `topLevelModules: []` e `interfaces: []` su layout piatti. Servono evidenze vere.
**Lavoro**:
- Aggiungere a `ScanResult` un campo `sourceFiles: { path: string; symbols: string[] }[]` per le
  fonti rilevanti (entrypoint inclusi: `app.py`, `main.*`, `index.*`).
- Estrazione simboli leggera per linguaggio: Python (`def`, `class`, decoratori `@app.route(...)`),
  oltre al TS già gestito. Niente parser pesante: regex come in `parseInterface`.
- `collectTopLevelModules` deve emettere anche i **file sorgente a radice/entrypoint**, non solo le
  sottocartelle di `src/lib/app/...`.
**Accettazione**: sulla fixture Flask, lo scan elenca `app.py` con simboli
`get_tasks, get_task, create_task, update_task, delete_task`. Test dedicato.

### T3 — Lo scanner rispetta `.agent-ignore` ed esclude le dir pesanti (B5, B4)
**File**: `src/scanner.ts` (`walk`, `collectTopLevelModules`).
**Lavoro**:
- `scan` legge `.agent-ignore` (riusa `readAgentIgnore`/`matchesAny` da `sync.ts`, oppure estrai
  in un modulo condiviso) e salta i path che vi corrispondono.
- Estendere l'esclusione hard-coded di `walk` oltre `node_modules/.git/dist`: aggiungere `venv`,
  `.venv`, `__pycache__`, `build`, `target`, `.opencode`.
- **Bug B4**: avvolgere in `try/catch` i `statSync` di `collectTopLevelModules` (`scanner.ts:110,113`)
  come già fatto in `walk`, così un symlink rotto non fa crashare l'intero `primer_scan`.
**Accettazione**: scan su un repo con `venv/` non attraversa `venv/` (test su tempo/contenuto) e
non lancia con un symlink penzolante in `src/`. Test dedicato.

---

## Milestone 2 — stato affidabile

### T4 — Tool `primer_state_write` + cablaggio nei template (R1)
**File**: `.opencode/plugins/primer.ts` (nuovo tool), `src/sync.ts` (esporre `currentState`),
`.opencode/commands/primer-setup.md`, `.opencode/commands/primer-sync.md`.
**Motivazione**: oggi `.primer-state.json` lo compone l'LLM a mano (millisecondi `.000Z` =
prova, §0). `currentState()`/`writePrimerState()` esistono già ma sono **codice morto**.
**Lavoro**:
- Esporre un tool `primer_state_write` che chiama `currentState(repoRoot)` + `writePrimerState`
  e ritorna lo stato scritto. Niente argomenti di timestamp/SHA dal modello.
- Aggiornare i due template comando: sostituire le istruzioni "lancia `git rev-parse` e scrivi il
  JSON" con "chiama `primer_state_write`".
**Accettazione**: dopo setup/sync, `syncedAt` ha millisecondi reali e `headAtSync` proviene da git,
non dal modello. Test su `currentState` con repo git fittizio.

### T5 — Setup arricchisce `.agent-ignore` dallo stack + auto-esclude lo scaffolding (N1)
**File**: `.opencode/commands/primer-setup.md` (e, se serve evidenza, dipende da T1).
**Lavoro**:
- Il template di `.agent-ignore` resta un minimo, ma setup deve **unire** ignore specifici dello
  stack rilevato: Python → `__pycache__/`, `*.pyc`, `venv/`, `.venv/`; e in generale gli artefatti
  introdotti da primer (`.opencode/` opzionale, `bun.lock`, `tsconfig.json` se non sono del progetto).
- Mantenere la regola "non rimuovere mai entry esistenti".
**Accettazione**: rieseguendo setup sulla fixture Flask, `.agent-ignore` contiene `venv/` e
`__pycache__/`. (Verifica manuale del template + eventuale checklist nella reflection di setup.)

---

## Milestone 3 — drift detection robusta

### T6 — Drift basato su range di commit + `maxBuffer` + sentinel sicuro (B3, B2, R2, R3)
**File**: `src/sync.ts` (`gitLogSince`, `tryGitHead/Branch`).
**Lavoro**:
- **B3**: quando `state.headAtSync` è disponibile, calcolare il range `git log <head>..HEAD`
  invece di `--since=<timestamp>`; fallback a `--since` solo se l'head è `null`. Aggiornare la
  firma per ricevere lo stato (o l'head) oltre a `syncedAt`.
- **B2**: passare `maxBuffer` ampio (es. `64 * 1024 * 1024`) a tutte le `execFileSync`, così
  uno storico grande non fa fallire **silenziosamente** il drift.
- **R2**: usare `--pretty=format:%H` con `-z` (separatore NUL) invece del sentinel
  `__PRIMER_COMMIT__`, eliminando il rischio di collisione con un path.
- **R3** (opzionale nello stesso PR): valutare `--first-parent`/`-m` per includere i file dei merge.
- Aggiornare `primer-sync.md` §1 che mostra il comando `git log --since=...` per coerenza.
**Accettazione**: test che, dato un repo con N commit dopo `head`, conta N e i file giusti;
test che un output >1MB non azzera il risultato.

---

## Milestone 4 — flusso di recovery e fedeltà dei template

### T7 — Far generare/garantire `docs/RECOVERY.md` da `primer-setup` (B6)
**Stato**: il rilievo B6 è **parzialmente superato** — `docs/RECOVERY.md` (69 righe, protocollo
completo), `docs/modules/sync.md` e `docs/modules/plugin-entry.md` (target dei TODO `primer.ts:119,127`)
**esistono già** in questo repo. Il problema residuo: **nessun command template li genera**; 5 template
li *citano* ma su un'installazione fresca (o se il file viene cancellato) non vengono ricreati.
**File**: `.opencode/commands/primer-setup.md` (e, se si sceglie l'inlining, gli altri template).
**Lavoro**:
- Far sì che `primer-setup` **produca/garantisca** `docs/RECOVERY.md` in modo **idempotente**:
  se esiste già con contenuto, non sovrascriverlo; se manca, generarlo dal protocollo canonico.
- In alternativa, spostare il contenuto essenziale del recovery dentro ciascun template e rimuovere
  i rimandi a `docs/RECOVERY.md`.
- Verificare che il contenuto di `docs/RECOVERY.md` resti coerente con la `ScanResult` reale dopo
  T2 (la tabella "scan depth per documento" non deve promettere evidenze che lo scanner non fornisce).
**Accettazione**: dopo un `primer-setup` su un repo senza `docs/RECOVERY.md`, il file viene creato;
nessun template rimanda a un file che l'installazione non garantisce; rieseguire setup non sovrascrive
un `RECOVERY.md` già presente.

### T8 — Guardrail di fedeltà al codice nei template di design (§0c, B1)
**File**: `.opencode/commands/primer-lld.md` (e, per coerenza, `primer-hld.md`).
**Motivazione**: anche con scan migliore, serve istruire il modello a **non inventare**. In §0c
l'LLD ha descritto moduli/funzioni inesistenti e tre file si contraddicevano sullo stesso errore.
**Lavoro**:
- Aggiungere step obbligatorio: leggere i `sourceFiles`/simboli da `primer_scan` (post-T2) e i
  file sorgente reali; **descrivere il codice com'è**.
- Se si propone una decomposizione *target* diversa dal codice attuale, etichettarla
  esplicitamente come "Proposed (not yet in code)" invece di spacciarla per as-is.
- Aggiungere alla reflection un **check di coerenza cross-documento**: lo stesso comportamento
  (es. codice di errore per "title mancante") deve essere identico in `modules/*`, `api-contracts/*`
  e nel codice; segnalare le divergenze invece di sceglierne una in silenzio.
**Accettazione**: rigenerando l'LLD sulla fixture Flask, gli error-contract combaciano con
`app.py` (404 dove il codice fa `abort(404)`), oppure le divergenze sono marcate esplicitamente.

### T9 — Setup: mismatch nome + HLD: §Overview sintetizzato (N2, N3)
**File**: `.opencode/commands/primer-setup.md`, `.opencode/commands/primer-hld.md`.
**Lavoro**:
- **N2**: se il nome progetto diverge tra fonti (`package.json#name` vs H1 del README), setup deve
  **chiedere conferma** invece di scegliere in silenzio; la reflection diventa un check attivo.
- **N3**: `primer-hld` deve trattare `## Overview` come "da sintetizzare dalla Vision" anche se è
  già non-vuoto con contenuto ereditato non pertinente (es. tabella HTTP da setup); distinguere
  "non vuoto" da "pertinente".
**Accettazione**: su questo repo, setup segnala la divergenza `Flask: a famous python web
framework` vs `todo-api-flask`; hld propone un Overview coerente con la Vision.

---

## Milestone 5 — robustezza minore e pulizia

### T10 — `sectionHasContent`: heading tolleranti agli spazi (R5)
**File**: `src/validator.ts:138-157`. Normalizzare gli spazi (`##  Vision`, `##Vision`) nel match.
**Accettazione**: test con varianti di spaziatura riconosciute.

### T11 — `.agent-ignore`: documentare o ampliare la sintassi glob (R4)
**File**: `src/sync.ts:146-159` + doc. Decidere: o documentare esplicitamente il subset supportato
(`prefix/`, `*.ext`, match esatto), o adottare un matcher gitignore reale (`**`, `?`, negazioni `!`).
**Accettazione**: comportamento documentato e testato; nessuna aspettativa gitignore silenziosamente disattesa.

### T12 — Pulizie e cosmetica diff (M7, R7, M5)
**File**: `primer.ts`, `writer.ts`, `scanner.ts`, `sync.ts`.
- Rimuovere cast ridondanti `as CommandName`/`as ScanDepth` (`primer.ts:52,69`).
- `writer.ts:29`: togliere il ramo ridondante `..${sep}`.
- De-duplicare il filtro commenti/righe vuote tra `readAgentIgnore` e `matchesAny`.
- `unifiedDiff`: aggiungere marcatore `\ No newline at end of file` e gestire il caso file vuoto.
- `INTERFACE_PATTERNS` case-insensitive + pattern per più linguaggi (M5).
**Accettazione**: nessuna regressione nei test; diff più conformi.

---

## Milestone 6 — hardening hook (best-effort)

### T13 — Consegna avvisi e hook sperimentale difensivi (M2, M3, R6)
**File**: `.opencode/plugins/primer.ts`.
- **M2**: se l'host espone un'API client/notifica, usarla al posto di `console.log` (`primer.ts:121`).
- **M3**: feature-detect su `experimental.session.compacting`; loggare una diagnostica se assente
  invece di un no-op silenzioso.
- **R6**: documentare (README/AGENTS del plugin) che `.primer-state.json` è gitignorato e quindi
  la baseline è per-sviluppatore; valutare un'opzione `primer.commitState`.
**Accettazione**: l'avviso di drift è consegnato in modo robusto; comportamento documentato.

---

## Sintesi priorità
1. **T0** (test) → **T1, T2, T3** (scanner: cuore di B1 e §0c).
2. **T4, T5** (stato affidabile, `.agent-ignore` sullo stack).
3. **T6** (drift robusto).
4. **T7, T8, T9** (recovery mancante + fedeltà al codice dei template).
5. **T10–T13** (robustezza minore, pulizia, hardening).

> Nota: T2 + T8 insieme sono la vera cura di `§0c` (LLD che inventa architettura). T1 da solo
> corregge l'etichetta del linguaggio ma non basta a rendere i design doc fedeli al codice.
