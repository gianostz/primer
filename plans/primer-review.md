# Analisi plugin `primer` — bug e migliorie

Revisione del sorgente del plugin + verifica sull'output reale di `/primer-setup`.
File esaminati: `.opencode/plugins/primer.ts`, `src/{types,scanner,writer,sync,validator}.ts`,
`.opencode/commands/primer-*.md`.

Legenda severità: 🔴 bug/rischio concreto · 🟠 robustezza/edge case · 🟢 miglioria/design.
Stato: ✅ confermato a runtime · 🔮 previsione statica (non ancora innescata).

---

## 0. Aggiornamento — output reale di `/primer-setup` (3 giu 2026)

`/primer-setup` ha prodotto `AGENTS.md`, `.agent-ignore`, `.primer-state.json`, ha creato
`.gitignore` e ha fatto merge su `README.md`. **Nel complesso il comando ha rispettato il
contratto "preserva l'esistente"**: H1 del README mantenuto (`# Flask: a famous python web
framework`), paragrafo seed conservato, 13 sezioni di `AGENTS.md` presenti e vuote per le fasi
successive, `## Overview`/`## Getting started`/`## License` aggiunte senza cancellare nulla.

Riscontri rispetto alle previsioni:

- **✅ Conferma R1 — lo stato è scritto a mano dall'LLM, non da `currentState()`.**
  `.primer-state.json` ha `syncedAt: "2026-06-03T19:39:12.000Z"`: i **millisecondi azzerati**
  sono la firma di un timestamp composto a mano (arrotondato al secondo); `new Date().toISOString()`
  produrrebbe millisecondi reali. Stavolta `headAtSync` (`e41c6e4`) e `branchAtSync` (`master`)
  sono corretti, ma la superficie di rischio è ora **attiva**: nulla impedisce all'LLM di
  sbagliare SHA/fuso/schema. → esporre `currentState()` come tool resta la fix prioritaria.

- **✅ Conferma R6 — `.gitignore` creato con il solo `.primer-state.json`.** Baseline di drift
  locale/per-sviluppatore: su un clone fresco l'hook farà no-op silenzioso.

- **✅ Istanza live di B5/B1 — `.agent-ignore` statico, cieco allo stack reale.** Vedi N1 sotto.

### Nuovi rilievi specifici dell'output di setup

- **🔴 N1 — `.agent-ignore` non copre né il progetto Python né lo scaffolding di primer.**
  Il file generato è la copia esatta del template. Questo è un progetto **Flask/Python** con
  `venv/` (migliaia di file), `__pycache__/` e `app.pyc`, eppure mancano `venv/`, `.venv/`,
  `__pycache__/`, `*.pyc`. Mancano inoltre gli artefatti che primer stesso ha introdotto:
  `src/`, `.opencode/`, `bun.lock`, `tsconfig.json`, `package.json`. Conseguenza diretta: il
  futuro `primer_scan` (che già non legge `.agent-ignore`, vedi B5) tratterà i sorgenti TS di
  primer e l'intero `venv/` come "codice del progetto", e la drift detection non escluderà
  `venv/`. Fix: setup dovrebbe arricchire `.agent-ignore` dallo stack rilevato (ignore Python)
  e auto-escludere il proprio scaffolding.

- **🟠 N2 — mismatch nome progetto non segnalato.** La reflection di setup
  (`primer-setup.md` Step 4) richiede "Project name matches README H1", ma qui l'H1 è
  `Flask: a famous python web framework` mentre `package.json#name` è `todo-api-flask`: due
  identità divergenti. Setup ha (correttamente) preservato l'H1 esistente, ma non ha **sollevato
  la divergenza** all'utente. La reflection andrebbe resa un check attivo che, in caso di
  conflitto tra fonti del nome, chiede conferma invece di sceglierne una in silenzio.

- **Nota positiva** — `AGENTS.md §Project overview` e il paragrafo del README riportano la
  stessa descrizione ("A brief introduction to the Flask todo-api"): la coerenza descrizione
  cross-file richiesta dalla reflection è rispettata.

> ⏳ B1 (linguaggio JS vs Python), B2/B3 (drift) e B4 non sono ancora osservabili: si innescano
> con `primer_scan`/il drift hook, cioè da `/primer-hld` in poi. Restano previsioni 🔮.

---

## 0b. Aggiornamento — output di `/primer-hld` + prova empirica di B1 (3 giu 2026)

`/primer-hld` ha prodotto `docs/HLD.md`, due ADR (`0001-flask-framework.md`,
`0002-monolith-architecture.md`) e ha riempito `AGENTS.md` §Architecture / §Tech stack /
§Non-goals. **Qualità dei contenuti ottima**: HLD completo con tutte le sezioni piene tranne
`## Open questions` (vuota, ammessa dalla spec), ADR ben formati, numerazione **sequenziale e
zero-padded a 4 cifre** (`0001`, `0002`) senza collisioni, gate di conferma rispettati
(file separati). Tutto coerentemente **Python/Flask/SQLite**.

### ✅ B1 CONFERMATO con evidenza diretta
Ho eseguito il vero `src/scanner.ts` su questo repo (`bun`). Output reale di `primer_scan`:

```
meta:      languages: ["JavaScript/TypeScript"]   ← è un progetto Python/Flask
           frameworks: []                          ← Flask non rilevato
           projectName: "todo-api-flask"           (dal package.json di primer)
structure: topLevelModules: []                     ← app.py ignorato (layout piatto)
           interfaces: []                          ← nessuna
```

Quindi `primer_scan` **inverte il linguaggio** (zero Python) e **non vede `app.py`**: per un
progetto a layout piatto non offre alcuna evidenza utile.

### Sfumatura importante (onestà intellettuale)
**Nonostante lo scan sbagliato, l'HLD è corretto.** Significa che la fonte di verità reale è
l'**intervista**, non `primer_scan`: l'evidenza dello scanner era fuorviante e l'agente l'ha
(giustamente) ignorata/sovrascritta. Conseguenze pratiche:
- Per `/primer-hld` il raggio d'impatto di B1 è **limitato** (l'intervista domina).
- B1 pesa molto di più a valle: `/primer-lld` e soprattutto i **draft di recovery** di
  `/primer-sync` si appoggiano allo scan per dedurre moduli/interfacce. Lì `topLevelModules: []`
  e `interfaces: []` significano partire da evidenza **vuota o errata**.

### Altre osservazioni dal run
- **B4/B5 a runtime**: lo scan **non è crashato** e ha attraversato `venv/` (migliaia di file)
  senza simboli rotti → B4 non innescato (nessun symlink penzolante presente), ma B5 confermato
  come **lavoro sprecato** (traversata inutile di `venv/`).
- **🟠 N3 — `README §Overview` "riempito" solo nella forma.** L'output obbligatorio di
  `primer-hld` "README §Overview filled" è stato di fatto un **no-op**: §Overview contiene ancora
  la tabella dei metodi HTTP ereditata da setup, non un overview sintetizzato dalla Vision
  dell'HLD. Poiché setup aveva pre-seminato §Overview con contenuto estraneo, il check di
  "non vuoto" passa e hld salta la sezione: **lettera soddisfatta, intento no**. È l'interazione
  tra il seeding di setup e il mandato di hld a creare l'ambiguità.
- **Minore — §Non-goals lossy**: `AGENTS.md §Non-goals` riporta solo 1 dei 3 non-goal dell'HLD
  ("does not implement any business logic"). Riassunto accettabile ma con perdita.
- **B6 ancora latente**: la validazione è passata (AGENTS + README presenti), quindi il percorso
  di recovery non è stato esercitato e `docs/RECOVERY.md` resta **inesistente**.
- **Stato non toccato** (corretto by design: solo setup/sync scrivono `.primer-state.json`);
  baseline ancora `e41c6e4`, nessun commit nuovo → nessun drift.

---

## 0c. Aggiornamento — output di `/primer-lld`: B1 colpisce a valle (3 giu 2026)

`/primer-lld` ha prodotto `docs/LLD.md`, `docs/modules/{app,tasks}.md`,
`docs/api-contracts/tasks-api.md`, `docs/data-models/task.md` e ha riempito `AGENTS.md §Modules`.
**Conformità strutturale alla spec: piena** — tutte le sezioni obbligatorie presenti, grafo
dipendenze aciclico (`app → tasks`), un file per modulo, gate di conferma rispettati. Il
`validator` riconosce correttamente il module index reale (verificato: `primer-feature` e
`primer-skills` → VALID, `primer-sprint` → INVALID per assenza di piani). Quindi la **pipeline
interna regge**.

### 🔴 Il problema è la FEDELTÀ AL CODICE, ed è la conferma a valle di B1
Con `primer_scan` che restituisce `topLevelModules: []` e `interfaces: []` (vedi §0b), l'LLD non
ha avuto evidenza strutturale e ha **imposto un'architettura idealizzata** su uno script piatto.
Confronto con il vero `app.py` (file unico, `tasks` è una **lista globale** con handler inline):

| Documento primer | Realtà in `app.py` |
|---|---|
| modulo `tasks` con interfaccia `get_all()/get_by_id()/create()/update()/delete()` | **Quelle funzioni non esistono.** `tasks` è una lista globale, gli handler la manipolano inline |
| `app → tasks`: "calls `tasks.get_all()`…" | Nessuna chiamata simile esiste |
| `tasks.create` "raises **ValueError** if title missing" | Il codice fa `abort(404)` |
| `tasks.update` "raises **TypeError** on invalid type" | Il codice fa `abort(400)` |
| LLD cross-cutting: "module boundaries raise Python exceptions; `app` translates" | Non ci sono boundary: gli handler chiamano `abort()` direttamente |

**Le parti accurate** (endpoint, metodi, la stringa d'errore esatta `"Invalid Request made Not
found"`, l'osservazione corretta "Response 400: returned as 404 in current implementation")
provengono dall'agente che **ha letto `app.py` con il proprio tool** — non dallo scan. **Le parti
inventate** provengono dal mandato "decomponi in moduli con interfaccia pubblica + designer/critic"
applicato senza ancoraggio strutturale.

### Conseguenze concrete
- **Incoerenza interna fra i tre file generati** sullo stesso comportamento: per "title mancante"
  `tasks.md` dice *ValueError*, `app.md` dice *400*, `tasks-api.md` dice *400→404*, mentre il
  codice fa *404*. Un agente implementatore non sa a quale credere.
- **Trappola per l'implementatore**: chi legge `modules/tasks.md` programmerà contro
  `tasks.get_all()` credendolo esistente. I doc sono presentati come "as-is", non come target;
  nulla segnala che è architettura desiderata e non reale.
- **SQLite fantasma propagato dall'HLD**: l'HLD (da intervista) dichiara SQLite, ma il codice non
  ha alcun database (lista in memoria). `tasks.md` trascina la contraddizione ("SQLite (in-memory
  dict-based store)") invece di correggerla. Il "designer+critic" non ha intercettato il divario
  doc-vs-codice.

### Implicazione per la fix di B1
Questo è l'argomento più forte per **dare allo scanner una vista reale del progetto**: non basta
correggere il linguaggio, serve che `primer_scan` (o un passo di "ingest del codice") fornisca
evidenza vera su file/funzioni, così che `/primer-lld` descriva *ciò che c'è* e il designer/critic
possa segnalare le divergenze invece di inventare. In assenza, la qualità dei doc dipende
interamente dal fatto che l'agente legga il sorgente a mano — non garantito.

---

## 1. Bug e rischi concreti

### 🔴 B1 ✅ — Lo scanner identifica male i progetti senza manifest (e il package.json di primer inquina il risultato)
> Confermato eseguendo lo scanner: `languages: ["JavaScript/TypeScript"]`, `topLevelModules: []`, `interfaces: []` su un repo Flask/Python (vedi §0b). Impatto reale limitato su `/primer-hld` (l'intervista domina), **conclamato a valle su `/primer-lld`**: senza evidenza strutturale l'LLD ha inventato moduli/funzioni inesistenti (vedi §0c).
`src/scanner.ts:52-70` (`collectManifests`) deriva il linguaggio **solo** dai manifest in
`MANIFESTS`. Questo stesso repo è un'app **Flask/Python** con solo `app.py`: non ha
`requirements.txt` né `pyproject.toml`, ma ha il `package.json` che *primer stesso* ha
aggiunto per le proprie dipendenze. Risultato: `primer_scan` riporterebbe
`languages: ["JavaScript/TypeScript"]` e zero Python — cioè la diagnosi è **invertita**.
- L'installazione di primer crea `package.json`, `node_modules/`, `bun.lock`, `tsconfig.json`
  alla radice del repo target, che diventano evidenza fuorviante per lo scanner.
- Suggerimenti: (a) escludere i file introdotti da primer dal censimento; (b) aggiungere un
  fallback per estensioni di file (`.py`, `.go`, …) quando manca un manifest; (c) isolare gli
  artefatti del plugin (es. in `.opencode/`) anziché alla radice.

### 🔴 B2 — `gitLogSince` può fallire silenziosamente su repo grandi (manca `maxBuffer`)
`src/sync.ts:104-113`: `execFileSync('git', ['log', '--since=…', '--name-only', …])` non imposta
`maxBuffer`. Il default di Node è ~1 MB: su uno storico ampio l'output supera il limite,
`execFileSync` lancia, il `catch` ritorna `{ commitCount: 0, sourceFilesChanged: [] }` e
**la drift detection sparisce senza avviso**. Impostare `maxBuffer` alto (es. 64 MB) e/o
fare il calcolo in streaming. Stesso schema, minore impatto, su `tryGitHead`/`tryGitBranch`.

### 🔴 B3 — Drift basato su `--since` (timestamp) invece del SHA già salvato
`src/sync.ts:106` usa `--since=${syncedAt}`. `git log --since` filtra per **data del commit**:
è fuzzy, sensibile al fuso orario, e ignora la topologia (rebase, cherry-pick, commit con date
"sbagliate" rientrano o escono a sorpresa). Il `cross-branch warning` in `primer-sync.md` è in
realtà un sintomo di questa scelta. Lo stato salva già `headAtSync` (`src/sync.ts:52`): usare il
range `headAtSync..HEAD` quando l'head è disponibile è molto più preciso e risolve anche il caso
cross-branch. Fallback a `--since` solo se `headAtSync` è `null`.

### 🔴 B4 — `collectTopLevelModules` non protegge `statSync` (symlink rotti = crash)
`src/scanner.ts:106-119`: a differenza di `walk` (che racchiude `statSync` in try/catch),
qui `statSync(dir)` (riga 110) e `statSync(abs)` (riga 113) sono nudi. Un symlink penzolante o
una race su una directory in `src/lib/app/...` fa lanciare un'eccezione non gestita che fa
fallire l'intero `primer_scan`. Avvolgere in try/catch come in `walk`.

### 🔴 B5 ✅ — Lo scanner non rispetta `.agent-ignore` e non esclude `venv/`, `__pycache__/`, `build/`
> Aggravato dall'output di setup: il `.agent-ignore` generato non elenca nemmeno `venv/` (vedi N1).
`src/scanner.ts:200` salta solo `node_modules`, `.git`, `dist`. Su questo repo Python, `walk`
entrerebbe in `venv/lib/python3.7/site-packages/...` (migliaia di file). È anche **incoerente**
con la drift detection, che invece rispetta `.agent-ignore`. Far leggere a `scan` lo stesso
`.agent-ignore` ed estendere la lista di esclusione (`venv`, `.venv`, `__pycache__`, `build`,
`target`, `.opencode`).

### 🔴 B6 — `docs/RECOVERY.md` è il perno del design ma nessun comando lo genera
> **Aggiornamento (2026-06-03):** `docs/RECOVERY.md`, `docs/modules/sync.md` e
> `docs/modules/plugin-entry.md` **ora esistono** nel repo (commit/lavoro successivo alla prima
> stesura di questa review). Il rilievo si riduce quindi al solo problema di **generazione**:
> nessun command template crea questi file, quindi su un'installazione fresca tornano assenti.

`primer-hld.md`, `primer-lld.md`, `primer-feature.md`, `primer-skills.md` e `primer-sync.md`
rimandano a `docs/RECOVERY.md` per il "recovery protocol"; i TODO in `primer.ts:119,127`
rimandano a `docs/modules/sync.md` e `docs/modules/plugin-entry.md`. I file esistono in questo
repo ma **nessun comando li genera**: l'intera macchina `primer_validate`/`primer_scan` serve il
flusso di recovery, ma il documento che lo descrive non è garantito su un'installazione nuova.
O `primer-setup` lo crea (idempotente), o i riferimenti vanno resi self-contained nei template.

---

## 2. Robustezza / edge case

### 🟠 R1 ✅ — `currentState`/`writePrimerState` esistono ma non sono esposti; lo stato lo scrive l'LLM a mano
> Confermato da `/primer-setup`: `syncedAt` con millisecondi `.000Z` = timestamp composto a mano (vedi §0).
`src/sync.ts:39-55` implementa già la scrittura di `.primer-state.json` con SHA e timestamp UTC
reali, ma **non sono importati da nessuna parte**. Invece `primer-setup.md:659-673` e
`primer-sync.md:1047-1059` istruiscono l'agente a lanciare `git rev-parse` e a comporre il JSON
da solo — l'LLM può allucinare lo SHA, sbagliare il fuso, o rompere lo schema. Esporre un tool
`primer_state_write` (o `primer_sync_reset`) che chiama `currentState()` garantisce valori
corretti e rimuove codice morto.

### 🟠 R2 — `COMMIT_SENTINEL` può collidere con un path di file
`src/sync.ts:15,124`: il conteggio commit si basa sul match esatto della riga
`__PRIMER_COMMIT__`. Un file con quel nome esatto verrebbe contato come confine di commit.
Improbabile ma evitabile usando `--pretty=format:%H` + `-z` (separatore NUL) per un parsing
non ambiguo.

### 🟠 R3 — I merge commit non riportano file con `--name-only`
`git log --name-only` di default non elenca i file dei merge. Cambi entrati solo via merge
vengono contati come commit ma non come `sourceFilesChanged`, sottostimando il drift.
Valutare `--first-parent` o `-m` a seconda della semantica desiderata.

### 🟠 R4 — Glob di `.agent-ignore` molto limitati rispetto a `.gitignore`
`src/sync.ts:146-159` (`matchesAny`) gestisce solo `prefix/`, `*.ext` e match esatto/prefisso.
Niente `**`, niente `?`, niente glob intermedi, niente negazioni `!`. Gli utenti si aspetteranno
semantica gitignore. O si documenta esplicitamente il subset supportato, o si adotta un matcher
ignore reale.

### 🟠 R5 — `sectionHasContent` richiede heading con match esatto
`src/validator.ts:138-157` confronta `line.trim() === heading`. `## Vision` con doppio spazio
(`##  Vision`) o senza spazio (`##Vision`) non viene riconosciuto → falsi "sezione mancante".
Normalizzare gli spazi nel confronto degli heading.

### 🟠 R6 ✅ — `.primer-state.json` è gitignorato → baseline persa al clone
> Confermato: `/primer-setup` ha creato `.gitignore` col solo `.primer-state.json` (vedi §0).
`primer-setup.md` aggiunge `.primer-state.json` al `.gitignore`. Su un clone fresco lo stato
non esiste, `readPrimerState` torna `null` e l'hook di drift fa no-op silenzioso fino al primo
`/primer-sync`. Se è intenzionale (baseline per-sviluppatore) andrebbe documentato; altrimenti
valutare il commit dello stato.

### 🟠 R7 — Diff cosmetico per file vuoti / senza newline finale
`src/writer.ts:87-195`: manca il marcatore `\ No newline at end of file`; il caso "file esistente
vuoto → contenuto" produce un hunk con riga vuota fittizia. Solo estetica del diff mostrato,
nessuna perdita dati (il percorso diff riguarda solo file già esistenti).

---

## 3. Migliorie di design / qualità

### 🟢 M1 — Nessun test, nessuna CI
Non esiste `tests/` (anche se `tsconfig.json` la include) né workflow CI. Le parti più fragili —
diff LCS (`writer.ts`), path-safety (`writer.ts:21-33`), parsing di `git log` (`sync.ts`),
glob matching (`sync.ts`), parsing interfacce (`scanner.ts`) — sono pura logica deterministica,
ideale per unit test. È la miglioria a più alto ritorno.

### 🟢 M2 — La consegna degli avvisi dipende da `console.log`
`primer.ts:105-123`: l'avviso di drift viene emesso con `console.log` su `session.created`,
affidandosi al fatto che opencode inoltri stdout all'utente (TODO già annotato). Se esiste una
API client/notifica nel plugin host, usarla rende l'avviso robusto a cambi di comportamento.

### 🟢 M3 — Dipendenza da hook sperimentale per la preservazione in compaction
`primer.ts:128` usa `experimental.session.compacting` (TODO già annotato): se opencode lo
rinomina/rimuove, la preservazione del contesto fa no-op silenzioso. Prevedere un feature-detect
con log diagnostico quando l'hook non è disponibile.

### 🟢 M4 — `detectCurrentPhase`: directory vuota conta come "completed"
`src/sync.ts:170-191`: `examples`/`sprint` sono check di sola esistenza, quindi una cartella
vuota risulta "completed" (già annotato come advisory). Considerare un check di contenuto
(es. almeno un file non-indice) per uno stato più fedele.

### 🟢 M5 — Pattern interfacce case-sensitive e poco coprenti
`src/scanner.ts:22-27`: `/Types\.ts$/` non matcha `types.ts` (minuscolo) — ironicamente non
troverebbe il `src/types.ts` di primer stesso. Inoltre il set copre `.d.ts/.proto/.scala/Types.ts`
ma non Python/Go/Rust idiomatici. Valutare pattern per linguaggio e match case-insensitive dove
sensato.

### 🟢 M6 — `README.md`/`.gitignore` esclusi dal drift
`src/types.ts:82-88` include `README.md` e `.gitignore` tra i `PRIMER_DOC_FILES`: modifiche
sostanziali al README (spesso rilevanti per la documentazione) non innescheranno mai un sync.
Decisione legittima ma vale la pena renderla esplicita/configurabile.

### 🟢 M7 — Pulizie minori
- `primer.ts:52,69`: cast `as CommandName`/`as ScanDepth` ridondanti — `z.enum` già restringe il tipo.
- `src/writer.ts:29`: `rel.startsWith('..')` rende ridondante il successivo `rel.startsWith('..'+sep)`.
- `src/sync.ts:146-159` vs `readAgentIgnore` (161-168): il filtro commenti/righe vuote è duplicato in entrambi.

---

## Priorità suggerita
1. B1, R1, N1 (✅ confermati a runtime: scan inverte il linguaggio e a valle l'LLD inventa moduli/funzioni inesistenti — §0c; stato hand-authored; `.agent-ignore` cieco allo stack).
2. B2, B3 (drift: ancora da innescare, ma alto rischio di fallimento silenzioso).
3. B5, B6 (traversata `venv/` inutile; flusso di recovery senza `docs/RECOVERY.md`).
4. R2, R4, N2, N3 (parsing git, check di reflection, "campi riempiti solo nella forma").
5. B4 (crash da symlink: non ancora innescato ma latente) + M1 (test) come rete di sicurezza.
