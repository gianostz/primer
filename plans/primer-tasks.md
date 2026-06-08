# Primer — resolution tasks for a coding agent

Operational backlog derived from `primer-review.md`. Each task is meant to be independent.
References to the findings in parentheses (e.g. `B1`, `R1`, `§0c`).

> **Current status (updated 2026-06-03).** M1 is **partially complete**: the test harness
> already exists (`tests/{scanner,validator,sync,writer}.test.ts`, `package.json#scripts.test`),
> `bun test` is **green (53 tests)**. Only the **code fixtures** remain to be created (see T0).
> `docs/RECOVERY.md`, `docs/modules/sync.md` and `docs/modules/plugin-entry.md` **already exist**:
> T7 has been rewritten accordingly (no longer "create the file" but "make setup generate it").
> All other tasks remain well-founded: findings B1/B2/B3/B4/B5, R1/R2/R5 and M7 are confirmed
> at the indicated code lines.

**Conventions for the agent**
- Plugin sources: `.opencode/plugins/primer.ts`, `src/{scanner,writer,sync,validator,types}.ts`,
  command templates in `.opencode/commands/primer-*.md`.
- Runtime: `bun` (TS with `.ts` imports). Verify with `bun <file>.ts`.
- Every task with new logic **must** add unit tests (see T0).
- Do not break the public tool contract (`primer_validate`, `primer_scan`, `primer_write`)
  without also updating the command templates that invoke them.
- Recommended order = task order. T0 before everything.

---

## Milestone 0 — safety net

### T0 — Extend the suite with the missing code fixtures (M1)
**Status**: harness and base suite **already present** (`tests/{scanner,validator,sync,writer}.test.ts`,
`package.json#scripts.test`, `bun test` green with 53 tests). The current fixtures
(`empty-repo`, `full-repo`, `partial-repo`) are primer **document** fixtures, not source-code
ones. This task covers **only** the missing piece.
**Files**: new fixtures under `tests/fixtures/`; any additional tests in the existing `*.test.ts`.
**Goal**: give T1/T2/T3/T8/T9 the **real-code** fixtures to assert against.
**Work**:
- Create `tests/fixtures/flask-flat/` — a **Python/Flask flat-layout project with no manifest**
  (`app.py` with handlers `get_tasks/get_task/create_task/update_task/delete_task`, `tasks` as a
  global list, `abort(404)`/`abort(400)` inline; **no** `requirements.txt`/`pyproject.toml`).
  Reproduces B1 and serves as the basis for the acceptance of T2/T8 (fidelity to the code).
- Create a flat-layout TS fixture (entrypoint `index.ts` at the root, no `src/`) for T2.
- Optional: a fixture with `venv/`, `__pycache__/` and a dangling symlink in `src/` for T3.
- Cover with tests the deterministic functions not yet tested that emerged from the tasks
  (`writer.ts:29` path outside root, `matchesAny`, `isPrimerDocPath`, `driftWarning`) if not already covered.
**Acceptance**: `bun test` green; a Python fixture **without** a manifest exists (reproduces B1)
referenced by the later tasks.

---

## Milestone 1 — scanner correctness (B1 family)

### T1 — Robust language detection + exclusion of primer's scaffolding (B1)
**Files**: `src/scanner.ts` (`collectManifests`, `scan`).
**Work**:
- Add an **extension-census fallback** when no manifest maps a language
  (`.py`→Python, `.go`→Go, `.rs`→Rust, `.rb`→Ruby, …): if the repo has `app.py` but no
  `requirements.txt`/`pyproject.toml`, `languages` must include `Python`.
- Detect frameworks from light signals where sensible (e.g. `flask` import in a `.py` file → `Flask`).
- **Do not let primer's artifacts pollute the scan**: ignore `package.json`/`tsconfig.json`/
  `bun.lock` when they are accompanied by `.opencode/plugins/primer.ts` (heuristic "this is the
  plugin, not the project"), or more simply exclude the scaffolding paths.
**Acceptance**: on the T0 Python fixture, `scan('.', 'meta').languages === ['Python']` (no
spurious JS/TS). Dedicated test.

### T2 — Real-code evidence: top-level source files + symbols (B1, §0c)
**Files**: `src/scanner.ts`, `src/types.ts` (extend `ScanResult`).
**Rationale**: the damage from `§0c` (LLD inventing modules/functions) stems from the scan
returning `topLevelModules: []` and `interfaces: []` on flat layouts. Real evidence is needed.
**Work**:
- Add to `ScanResult` a field `sourceFiles: { path: string; symbols: string[] }[]` for the
  relevant sources (entrypoints included: `app.py`, `main.*`, `index.*`).
- Lightweight per-language symbol extraction: Python (`def`, `class`, `@app.route(...)` decorators),
  in addition to the TS already handled. No heavy parser: regex as in `parseInterface`.
- `collectTopLevelModules` must also emit the **root/entrypoint source files**, not only the
  subfolders of `src/lib/app/...`.
**Acceptance**: on the Flask fixture, the scan lists `app.py` with symbols
`get_tasks, get_task, create_task, update_task, delete_task`. Dedicated test.

### T3 — The scanner honours `.agent-ignore` and excludes heavy dirs (B5, B4)
**Files**: `src/scanner.ts` (`walk`, `collectTopLevelModules`).
**Work**:
- `scan` reads `.agent-ignore` (reuse `readAgentIgnore`/`matchesAny` from `sync.ts`, or extract
  them into a shared module) and skips matching paths.
- Extend `walk`'s hard-coded exclusion beyond `node_modules/.git/dist`: add `venv`,
  `.venv`, `__pycache__`, `build`, `target`, `.opencode`.
- **Bug B4**: wrap the `statSync` calls of `collectTopLevelModules` (`scanner.ts:110,113`) in `try/catch`
  as already done in `walk`, so a broken symlink does not crash the whole `primer_scan`.
**Acceptance**: a scan of a repo with `venv/` does not traverse `venv/` (test on time/content) and
does not throw with a dangling symlink in `src/`. Dedicated test.

---

## Milestone 2 — reliable state

### T4 — `primer_state_write` tool + wiring into the templates (R1)
**Files**: `.opencode/plugins/primer.ts` (new tool), `src/sync.ts` (expose `currentState`),
`.opencode/commands/primer-setup.md`, `.opencode/commands/primer-sync.md`.
**Rationale**: today `.primer-state.json` is composed by the LLM by hand (`.000Z` milliseconds =
proof, §0). `currentState()`/`writePrimerState()` already exist but are **dead code**.
**Work**:
- Expose a tool `primer_state_write` that calls `currentState(repoRoot)` + `writePrimerState`
  and returns the written state. No timestamp/SHA arguments from the model.
- Update the two command templates: replace the "run `git rev-parse` and write the
  JSON" instructions with "call `primer_state_write`".
**Acceptance**: after setup/sync, `syncedAt` has real milliseconds and `headAtSync` comes from git,
not from the model. Test on `currentState` with a fake git repo.

### T5 — Setup enriches `.agent-ignore` from the stack + auto-excludes the scaffolding (N1)
**Files**: `.opencode/commands/primer-setup.md` (and, if evidence is needed, depends on T1).
**Work**:
- The `.agent-ignore` template stays minimal, but setup must **merge in** ignores specific to the
  detected stack: Python → `__pycache__/`, `*.pyc`, `venv/`, `.venv/`; and in general the artifacts
  introduced by primer (`.opencode/` optional, `bun.lock`, `tsconfig.json` if not the project's).
- Keep the rule "never remove existing entries".
**Acceptance**: re-running setup on the Flask fixture, `.agent-ignore` contains `venv/` and
`__pycache__/`. (Manual verification of the template + an optional checklist in the setup reflection.)

---

## Milestone 3 — robust drift detection

### T6 — Drift based on commit range + `maxBuffer` + safe sentinel (B3, B2, R2, R3)
**Files**: `src/sync.ts` (`gitLogSince`, `tryGitHead/Branch`).
**Work**:
- **B3**: when `state.headAtSync` is available, compute the range `git log <head>..HEAD`
  instead of `--since=<timestamp>`; fall back to `--since` only when the head is `null`. Update the
  signature to receive the state (or the head) in addition to `syncedAt`.
- **B2**: pass a large `maxBuffer` (e.g. `64 * 1024 * 1024`) to all `execFileSync` calls, so
  a large history does not make drift fail **silently**.
- **R2**: use `--pretty=format:%H` with `-z` (NUL separator) instead of the sentinel
  `__PRIMER_COMMIT__`, eliminating the risk of collision with a path.
- **R3** (optional in the same PR): consider `--first-parent`/`-m` to include the files of merges.
- Update `primer-sync.md` §1 which shows the `git log --since=...` command for consistency.
**Acceptance**: a test that, given a repo with N commits after `head`, counts N and the right files;
a test that an output >1MB does not zero out the result.

---

## Milestone 4 — recovery flow and template fidelity

### T7 — Have `primer-setup` generate/guarantee `docs/RECOVERY.md` (B6)
**Status**: finding B6 is **partially superseded** — `docs/RECOVERY.md` (69 lines, complete
protocol), `docs/modules/sync.md` and `docs/modules/plugin-entry.md` (targets of the TODOs `primer.ts:119,127`)
**already exist** in this repo. The residual problem: **no command template generates them**; 5 templates
*cite* them but on a fresh install (or if the file is deleted) they are not recreated.
**Files**: `.opencode/commands/primer-setup.md` (and, if inlining is chosen, the other templates).
**Work**:
- Make `primer-setup` **produce/guarantee** `docs/RECOVERY.md` **idempotently**:
  if it already exists with content, do not overwrite it; if it is missing, generate it from the canonical
  protocol.
- Alternatively, move the essential recovery content into each template and remove
  the references to `docs/RECOVERY.md`.
- Verify that the content of `docs/RECOVERY.md` stays consistent with the real `ScanResult` after
  T2 (the "scan depth per document" table must not promise evidence the scanner does not provide).
**Acceptance**: after a `primer-setup` on a repo without `docs/RECOVERY.md`, the file is created;
no template references a file the install does not guarantee; re-running setup does not overwrite
an already-present `RECOVERY.md`.

### T8 — Code-fidelity guardrails in the design templates (§0c, B1)
**Files**: `.opencode/commands/primer-lld.md` (and, for consistency, `primer-hld.md`).
**Rationale**: even with a better scan, the model must be instructed **not to invent**. In §0c
the LLD described nonexistent modules/functions and three files contradicted each other on the same error.
**Work**:
- Add a mandatory step: read the `sourceFiles`/symbols from `primer_scan` (post-T2) and the
  real source files; **describe the code as it is**.
- If a *target* decomposition different from the current code is proposed, label it
  explicitly as "Proposed (not yet in code)" instead of passing it off as as-is.
- Add to the reflection a **cross-document consistency check**: the same behaviour
  (e.g. the error code for "missing title") must be identical in `modules/*`, `api-contracts/*`
  and in the code; flag the divergences instead of silently choosing one.
**Acceptance**: regenerating the LLD on the Flask fixture, the error contracts match
`app.py` (404 where the code does `abort(404)`), or the divergences are explicitly marked.

### T9 — Setup: name mismatch + HLD: synthesized §Overview (N2, N3)
**Files**: `.opencode/commands/primer-setup.md`, `.opencode/commands/primer-hld.md`.
**Work**:
- **N2**: if the project name diverges between sources (`package.json#name` vs README H1), setup must
  **ask for confirmation** instead of silently choosing; the reflection becomes an active check.
- **N3**: `primer-hld` must treat `## Overview` as "to be synthesized from the Vision" even if it is
  already non-empty with inherited, irrelevant content (e.g. the HTTP table from setup); distinguish
  "non-empty" from "relevant".
**Acceptance**: on this repo, setup reports the divergence `Flask: a famous python web
framework` vs `todo-api-flask`; hld proposes an Overview consistent with the Vision.

---

## Milestone 5 — minor robustness and cleanup

### T10 — `sectionHasContent`: whitespace-tolerant headings (R5)
**Files**: `src/validator.ts:138-157`. Normalize whitespace (`##  Vision`, `##Vision`) in the match.
**Acceptance**: test with spacing variants recognized.

### T11 — `.agent-ignore`: document or expand the glob syntax (R4)
**Files**: `src/sync.ts:146-159` + docs. Decide: either explicitly document the supported subset
(`prefix/`, `*.ext`, exact match), or adopt a real gitignore matcher (`**`, `?`, `!` negations).
**Acceptance**: behaviour documented and tested; no gitignore expectation silently unmet.

### T12 — Cleanups and diff cosmetics (M7, R7, M5)
**Files**: `primer.ts`, `writer.ts`, `scanner.ts`, `sync.ts`.
- Remove redundant `as CommandName`/`as ScanDepth` casts (`primer.ts:52,69`).
- `writer.ts:29`: drop the redundant `..${sep}` branch.
- De-duplicate the comment/blank-line filter between `readAgentIgnore` and `matchesAny`.
- `unifiedDiff`: add the `\ No newline at end of file` marker and handle the empty-file case.
- `INTERFACE_PATTERNS` case-insensitive + patterns for more languages (M5).
**Acceptance**: no regressions in the tests; more conformant diffs.

---

## Milestone 6 — hook hardening (best-effort)

### T13 — Defensive warning delivery and experimental hook (M2, M3, R6)
**Files**: `.opencode/plugins/primer.ts`.
- **M2**: if the host exposes a client/notification API, use it instead of `console.log` (`primer.ts:121`).
- **M3**: feature-detect on `experimental.session.compacting`; log a diagnostic if absent
  instead of a silent no-op.
- **R6**: document (plugin README/AGENTS) that `.primer-state.json` is gitignored and therefore
  the baseline is per-developer; consider a `primer.commitState` option.
**Acceptance**: the drift warning is delivered robustly; behaviour documented.

---

## Priority summary
1. **T0** (tests) → **T1, T2, T3** (scanner: the heart of B1 and §0c).
2. **T4, T5** (reliable state, `.agent-ignore` from the stack).
3. **T6** (robust drift).
4. **T7, T8, T9** (missing recovery + code fidelity of the templates).
5. **T10–T13** (minor robustness, cleanup, hardening).

> Note: T2 + T8 together are the real cure for `§0c` (LLD inventing architecture). T1 alone
> fixes the language label but is not enough to make the design docs faithful to the code.
