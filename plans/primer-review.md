# `primer` plugin analysis — bugs and improvements

Review of the plugin source + verification against the real output of `/primer-setup`.
Files examined: `.opencode/plugins/primer.ts`, `src/{types,scanner,writer,sync,validator}.ts`,
`.opencode/commands/primer-*.md`.

Severity legend: 🔴 concrete bug/risk · 🟠 robustness/edge case · 🟢 improvement/design.
Status: ✅ confirmed at runtime · 🔮 static prediction (not yet triggered).

---

## 0. Update — real output of `/primer-setup` (Jun 3 2026)

`/primer-setup` produced `AGENTS.md`, `.agent-ignore`, `.primer-state.json`, created
`.gitignore`, and merged into `README.md`. **Overall the command honoured the
"preserve the existing" contract**: the README H1 was kept (`# Flask: a famous python web
framework`), the seed paragraph preserved, 13 `AGENTS.md` sections present and empty for the later
phases, `## Overview`/`## Getting started`/`## License` added without deleting anything.

Findings against the predictions:

- **✅ R1 confirmed — the state is hand-written by the LLM, not by `currentState()`.**
  `.primer-state.json` has `syncedAt: "2026-06-03T19:39:12.000Z"`: the **zeroed milliseconds**
  are the signature of a hand-composed timestamp (rounded to the second); `new Date().toISOString()`
  would produce real milliseconds. This time `headAtSync` (`e41c6e4`) and `branchAtSync` (`master`)
  are correct, but the risk surface is now **active**: nothing stops the LLM from
  getting the SHA/timezone/schema wrong. → exposing `currentState()` as a tool remains the priority fix.

- **✅ R6 confirmed — `.gitignore` created with only `.primer-state.json`.** Drift baseline is
  local/per-developer: on a fresh clone the hook will be a silent no-op.

- **✅ Live instance of B5/B1 — static `.agent-ignore`, blind to the real stack.** See N1 below.

### New findings specific to the setup output

- **🔴 N1 — `.agent-ignore` covers neither the Python project nor primer's scaffolding.**
  The generated file is an exact copy of the template. This is a **Flask/Python** project with
  `venv/` (thousands of files), `__pycache__/` and `app.pyc`, yet `venv/`, `.venv/`,
  `__pycache__/`, `*.pyc` are missing. Also missing are the artifacts primer itself introduced:
  `src/`, `.opencode/`, `bun.lock`, `tsconfig.json`, `package.json`. Direct consequence: the
  future `primer_scan` (which already does not read `.agent-ignore`, see B5) will treat primer's TS
  sources and the entire `venv/` as "project code", and drift detection will not exclude
  `venv/`. Fix: setup should enrich `.agent-ignore` from the detected stack (Python ignores)
  and auto-exclude its own scaffolding.

- **🟠 N2 — project-name mismatch not reported.** The setup reflection
  (`primer-setup.md` Step 4) requires "Project name matches README H1", but here the H1 is
  `Flask: a famous python web framework` while `package.json#name` is `todo-api-flask`: two
  divergent identities. Setup (correctly) preserved the existing H1, but did not **raise
  the divergence** to the user. The reflection should be made an active check that, in case of
  a conflict between name sources, asks for confirmation instead of silently choosing one.

- **Positive note** — `AGENTS.md §Project overview` and the README paragraph carry the
  same description ("A brief introduction to the Flask todo-api"): the cross-file description
  consistency required by the reflection is honoured.

> ⏳ B1 (JS vs Python language), B2/B3 (drift) and B4 are not yet observable: they trigger
> with `primer_scan`/the drift hook, i.e. from `/primer-hld` onward. They remain predictions 🔮.

---

## 0b. Update — output of `/primer-hld` + empirical proof of B1 (Jun 3 2026)

`/primer-hld` produced `docs/HLD.md`, two ADRs (`0001-flask-framework.md`,
`0002-monolith-architecture.md`) and filled `AGENTS.md` §Architecture / §Tech stack /
§Non-goals. **Content quality is excellent**: a complete HLD with all sections filled except
`## Open questions` (empty, allowed by the spec), well-formed ADRs, **sequential and
4-digit zero-padded** numbering (`0001`, `0002`) with no collisions, confirmation gates honoured
(separate files). All consistently **Python/Flask/SQLite**.

### ✅ B1 CONFIRMED with direct evidence
I ran the real `src/scanner.ts` against this repo (`bun`). Real output of `primer_scan`:

```
meta:      languages: ["JavaScript/TypeScript"]   ← it is a Python/Flask project
           frameworks: []                          ← Flask not detected
           projectName: "todo-api-flask"           (from primer's package.json)
structure: topLevelModules: []                     ← app.py ignored (flat layout)
           interfaces: []                          ← none
```

So `primer_scan` **inverts the language** (zero Python) and **does not see `app.py`**: for a
flat-layout project it offers no useful evidence.

### Important nuance (intellectual honesty)
**Despite the wrong scan, the HLD is correct.** This means the real source of truth is
the **interview**, not `primer_scan`: the scanner's evidence was misleading and the agent
(rightly) ignored/overrode it. Practical consequences:
- For `/primer-hld` the blast radius of B1 is **limited** (the interview dominates).
- B1 weighs much more downstream: `/primer-lld` and especially the **recovery drafts** of
  `/primer-sync` rely on the scan to infer modules/interfaces. There `topLevelModules: []`
  and `interfaces: []` mean starting from **empty or wrong** evidence.

### Other observations from the run
- **B4/B5 at runtime**: the scan **did not crash** and traversed `venv/` (thousands of files)
  without broken symbols → B4 not triggered (no dangling symlink present), but B5 confirmed
  as **wasted work** (pointless traversal of `venv/`).
- **🟠 N3 — `README §Overview` "filled" in form only.** The mandatory output of
  `primer-hld` "README §Overview filled" was effectively a **no-op**: §Overview still contains
  the HTTP-methods table inherited from setup, not an overview synthesized from the HLD's
  Vision. Because setup had pre-seeded §Overview with unrelated content, the
  "non-empty" check passes and hld skips the section: **letter satisfied, intent not**. It is the
  interaction between setup's seeding and hld's mandate that creates the ambiguity.
- **Minor — §Non-goals lossy**: `AGENTS.md §Non-goals` reports only 1 of the HLD's 3 non-goals
  ("does not implement any business logic"). Acceptable summary but lossy.
- **B6 still latent**: validation passed (AGENTS + README present), so the recovery path
  was not exercised and `docs/RECOVERY.md` remains **nonexistent**.
- **State untouched** (correct by design: only setup/sync write `.primer-state.json`);
  baseline still `e41c6e4`, no new commits → no drift.

---

## 0c. Update — output of `/primer-lld`: B1 strikes downstream (Jun 3 2026)

`/primer-lld` produced `docs/LLD.md`, `docs/modules/{app,tasks}.md`,
`docs/api-contracts/tasks-api.md`, `docs/data-models/task.md` and filled `AGENTS.md §Modules`.
**Structural conformance to the spec: full** — all mandatory sections present, acyclic
dependency graph (`app → tasks`), one file per module, confirmation gates honoured. The
`validator` correctly recognizes the real module index (verified: `primer-feature` and
`primer-skills` → VALID, `primer-sprint` → INVALID due to absence of plans). So the **internal
pipeline holds**.

### 🔴 The problem is FIDELITY TO THE CODE, and it is the downstream confirmation of B1
With `primer_scan` returning `topLevelModules: []` and `interfaces: []` (see §0b), the LLD had
no structural evidence and **imposed an idealized architecture** on a flat script.
Comparison with the real `app.py` (single file, `tasks` is a **global list** with inline handlers):

| primer document | Reality in `app.py` |
|---|---|
| module `tasks` with interface `get_all()/get_by_id()/create()/update()/delete()` | **Those functions do not exist.** `tasks` is a global list, handlers manipulate it inline |
| `app → tasks`: "calls `tasks.get_all()`…" | No such call exists |
| `tasks.create` "raises **ValueError** if title missing" | The code does `abort(404)` |
| `tasks.update` "raises **TypeError** on invalid type" | The code does `abort(400)` |
| LLD cross-cutting: "module boundaries raise Python exceptions; `app` translates" | There are no boundaries: the handlers call `abort()` directly |

**The accurate parts** (endpoints, methods, the exact error string `"Invalid Request made Not
found"`, the correct observation "Response 400: returned as 404 in current implementation")
come from the agent **reading `app.py` with its own tool** — not from the scan. **The
invented parts** come from the mandate "decompose into modules with a public interface + designer/critic"
applied without structural anchoring.

### Concrete consequences
- **Internal inconsistency across the three generated files** on the same behaviour: for "missing
  title" `tasks.md` says *ValueError*, `app.md` says *400*, `tasks-api.md` says *400→404*, while the
  code does *404*. An implementing agent does not know which to believe.
- **Trap for the implementer**: whoever reads `modules/tasks.md` will code against
  `tasks.get_all()` believing it exists. The docs are presented as "as-is", not as a target;
  nothing signals that this is desired and not real architecture.
- **Phantom SQLite propagated from the HLD**: the HLD (from interview) declares SQLite, but the code
  has no database at all (in-memory list). `tasks.md` drags the contradiction along ("SQLite (in-memory
  dict-based store)") instead of correcting it. The "designer+critic" did not catch the
  doc-vs-code gap.

### Implication for the B1 fix
This is the strongest argument for **giving the scanner a real view of the project**: it is not enough
to fix the language, `primer_scan` (or a "code ingest" step) must provide
real evidence about files/functions, so that `/primer-lld` describes *what is there* and the designer/critic
can flag the divergences instead of inventing. Without that, doc quality depends
entirely on the agent reading the source by hand — not guaranteed.

---

## 1. Concrete bugs and risks

### 🔴 B1 ✅ — The scanner misidentifies projects without a manifest (and primer's package.json pollutes the result)
> Confirmed by running the scanner: `languages: ["JavaScript/TypeScript"]`, `topLevelModules: []`, `interfaces: []` on a Flask/Python repo (see §0b). Real impact limited on `/primer-hld` (the interview dominates), **manifest downstream on `/primer-lld`**: without structural evidence the LLD invented nonexistent modules/functions (see §0c).
`src/scanner.ts:52-70` (`collectManifests`) derives the language **only** from the manifests in
`MANIFESTS`. This very repo is a **Flask/Python** app with only `app.py`: it has no
`requirements.txt` nor `pyproject.toml`, but it has the `package.json` that *primer itself*
added for its own dependencies. Result: `primer_scan` would report
`languages: ["JavaScript/TypeScript"]` and zero Python — i.e. the diagnosis is **inverted**.
- Installing primer creates `package.json`, `node_modules/`, `bun.lock`, `tsconfig.json`
  at the root of the target repo, which become misleading evidence for the scanner.
- Suggestions: (a) exclude the files introduced by primer from the census; (b) add a
  fallback by file extension (`.py`, `.go`, …) when a manifest is missing; (c) isolate the
  plugin's artifacts (e.g. under `.opencode/`) instead of at the root.

### 🔴 B2 — `gitLogSince` can fail silently on large repos (missing `maxBuffer`)
`src/sync.ts:104-113`: `execFileSync('git', ['log', '--since=…', '--name-only', …])` does not set
`maxBuffer`. Node's default is ~1 MB: on a large history the output exceeds the limit,
`execFileSync` throws, the `catch` returns `{ commitCount: 0, sourceFilesChanged: [] }` and
**drift detection vanishes without warning**. Set a high `maxBuffer` (e.g. 64 MB) and/or
compute it in streaming. Same pattern, lower impact, on `tryGitHead`/`tryGitBranch`.

### 🔴 B3 — Drift based on `--since` (timestamp) instead of the already-saved SHA
`src/sync.ts:106` uses `--since=${syncedAt}`. `git log --since` filters by **commit date**:
it is fuzzy, sensitive to timezone, and ignores topology (rebase, cherry-pick, commits with
"wrong" dates enter or leave unexpectedly). The `cross-branch warning` in `primer-sync.md` is
actually a symptom of this choice. The state already saves `headAtSync` (`src/sync.ts:52`): using the
range `headAtSync..HEAD` when the head is available is much more precise and also solves the
cross-branch case. Fall back to `--since` only when `headAtSync` is `null`.

### 🔴 B4 — `collectTopLevelModules` does not guard `statSync` (broken symlinks = crash)
`src/scanner.ts:106-119`: unlike `walk` (which wraps `statSync` in try/catch),
here `statSync(dir)` (line 110) and `statSync(abs)` (line 113) are bare. A dangling symlink or
a race on a directory in `src/lib/app/...` throws an unhandled exception that makes the
whole `primer_scan` fail. Wrap them in try/catch as in `walk`.

### 🔴 B5 ✅ — The scanner does not honour `.agent-ignore` and does not exclude `venv/`, `__pycache__/`, `build/`
> Aggravated by the setup output: the generated `.agent-ignore` does not even list `venv/` (see N1).
`src/scanner.ts:200` skips only `node_modules`, `.git`, `dist`. On this Python repo, `walk`
would descend into `venv/lib/python3.7/site-packages/...` (thousands of files). It is also **inconsistent**
with drift detection, which does honour `.agent-ignore`. Have `scan` read the same
`.agent-ignore` and extend the exclusion list (`venv`, `.venv`, `__pycache__`, `build`,
`target`, `.opencode`).

### 🔴 B6 — `docs/RECOVERY.md` is the design's linchpin but no command generates it
> **Update (2026-06-03):** `docs/RECOVERY.md`, `docs/modules/sync.md` and
> `docs/modules/plugin-entry.md` **now exist** in the repo (commit/work after the first
> draft of this review). The finding therefore narrows to just the **generation** problem:
> no command template creates these files, so on a fresh install they go missing again.

`primer-hld.md`, `primer-lld.md`, `primer-feature.md`, `primer-skills.md` and `primer-sync.md`
point to `docs/RECOVERY.md` for the "recovery protocol"; the TODOs in `primer.ts:119,127`
point to `docs/modules/sync.md` and `docs/modules/plugin-entry.md`. The files exist in this
repo but **no command generates them**: the whole `primer_validate`/`primer_scan` machinery serves the
recovery flow, but the document that describes it is not guaranteed on a new install.
Either `primer-setup` creates it (idempotently), or the references must be made self-contained in the templates.

---

## 2. Robustness / edge cases

### 🟠 R1 ✅ — `currentState`/`writePrimerState` exist but are not exposed; the LLM writes the state by hand
> Confirmed by `/primer-setup`: `syncedAt` with `.000Z` milliseconds = hand-composed timestamp (see §0).
`src/sync.ts:39-55` already implements writing `.primer-state.json` with the real SHA and UTC
timestamp, but **they are not imported anywhere**. Instead `primer-setup.md:659-673` and
`primer-sync.md:1047-1059` instruct the agent to run `git rev-parse` and compose the JSON
itself — the LLM can hallucinate the SHA, get the timezone wrong, or break the schema. Exposing a tool
`primer_state_write` (or `primer_sync_reset`) that calls `currentState()` guarantees correct
values and removes dead code.

### 🟠 R2 — `COMMIT_SENTINEL` can collide with a file path
`src/sync.ts:15,124`: the commit count relies on an exact match of the line
`__PRIMER_COMMIT__`. A file with that exact name would be counted as a commit boundary.
Unlikely but avoidable by using `--pretty=format:%H` + `-z` (NUL separator) for unambiguous
parsing.

### 🟠 R3 — Merge commits do not report files with `--name-only`
`git log --name-only` by default does not list the files of merges. Changes that entered only via merge
are counted as commits but not as `sourceFilesChanged`, underestimating drift.
Consider `--first-parent` or `-m` depending on the desired semantics.

### 🟠 R4 — `.agent-ignore` globs very limited compared to `.gitignore`
`src/sync.ts:146-159` (`matchesAny`) handles only `prefix/`, `*.ext` and exact/prefix matches.
No `**`, no `?`, no intermediate globs, no `!` negations. Users will expect
gitignore semantics. Either explicitly document the supported subset, or adopt a real
ignore matcher.

### 🟠 R5 — `sectionHasContent` requires an exact heading match
`src/validator.ts:138-157` compares `line.trim() === heading`. `## Vision` with a double space
(`##  Vision`) or no space (`##Vision`) is not recognized → false "missing section".
Normalize whitespace in the heading comparison.

### 🟠 R6 ✅ — `.primer-state.json` is gitignored → baseline lost on clone
> Confirmed: `/primer-setup` created `.gitignore` with only `.primer-state.json` (see §0).
`primer-setup.md` adds `.primer-state.json` to `.gitignore`. On a fresh clone the state
does not exist, `readPrimerState` returns `null` and the drift hook is a silent no-op until the first
`/primer-sync`. If this is intentional (per-developer baseline) it should be documented; otherwise
consider committing the state.

### 🟠 R7 — Cosmetic diff for empty files / missing final newline
`src/writer.ts:87-195`: the `\ No newline at end of file` marker is missing; the "existing empty
file → content" case produces a hunk with a fictitious blank line. Purely the aesthetics of the shown
diff, no data loss (the diff path only concerns already-existing files).

---

## 3. Design / quality improvements

### 🟢 M1 — No tests, no CI
There is no `tests/` (even though `tsconfig.json` includes it) nor a CI workflow. The most fragile parts —
LCS diff (`writer.ts`), path-safety (`writer.ts:21-33`), `git log` parsing (`sync.ts`),
glob matching (`sync.ts`), interface parsing (`scanner.ts`) — are pure deterministic logic,
ideal for unit tests. It is the highest-return improvement.

### 🟢 M2 — Warning delivery depends on `console.log`
`primer.ts:105-123`: the drift warning is emitted with `console.log` on `session.created`,
relying on opencode forwarding stdout to the user (TODO already noted). If a client/notification
API exists in the host plugin, using it makes the warning robust to behaviour changes.

### 🟢 M3 — Dependence on an experimental hook for compaction preservation
`primer.ts:128` uses `experimental.session.compacting` (TODO already noted): if opencode
renames/removes it, context preservation becomes a silent no-op. Add a feature-detect
with a diagnostic log when the hook is unavailable.

### 🟢 M4 — `detectCurrentPhase`: an empty directory counts as "completed"
`src/sync.ts:170-191`: `examples`/`sprint` are existence-only checks, so an empty folder
shows as "completed" (already noted as advisory). Consider a content check
(e.g. at least one non-index file) for a more faithful state.

### 🟢 M5 — Interface patterns case-sensitive and under-covering
`src/scanner.ts:22-27`: `/Types\.ts$/` does not match `types.ts` (lowercase) — ironically it
would not find primer's own `src/types.ts`. Also the set covers `.d.ts/.proto/.scala/Types.ts`
but not idiomatic Python/Go/Rust. Consider per-language patterns and case-insensitive matching where
sensible.

### 🟢 M6 — `README.md`/`.gitignore` excluded from drift
`src/types.ts:82-88` includes `README.md` and `.gitignore` among the `PRIMER_DOC_FILES`: substantial
changes to the README (often relevant to documentation) will never trigger a sync.
A legitimate decision but worth making explicit/configurable.

### 🟢 M7 — Minor cleanups
- `primer.ts:52,69`: redundant `as CommandName`/`as ScanDepth` casts — `z.enum` already narrows the type.
- `src/writer.ts:29`: `rel.startsWith('..')` makes the subsequent `rel.startsWith('..'+sep)` redundant.
- `src/sync.ts:146-159` vs `readAgentIgnore` (161-168): the comment/blank-line filter is duplicated in both.

---

## Suggested priority
1. B1, R1, N1 (✅ confirmed at runtime: scan inverts the language and downstream the LLD invents nonexistent modules/functions — §0c; hand-authored state; `.agent-ignore` blind to the stack).
2. B2, B3 (drift: not yet triggered, but high risk of silent failure).
3. B5, B6 (pointless `venv/` traversal; recovery flow without `docs/RECOVERY.md`).
4. R2, R4, N2, N3 (git parsing, reflection checks, "fields filled in form only").
5. B4 (symlink crash: not yet triggered but latent) + M1 (tests) as a safety net.
