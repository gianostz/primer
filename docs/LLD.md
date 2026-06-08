# Low-level design

## Module index
- [validator](modules/validator.md) — precondition checks per command; flags missing files and incomplete sections.
- [scanner](modules/scanner.md) — repo scan at `meta` / `structure` / `module` depths returning structured evidence for recovery.
- [writer](modules/writer.md) — atomic file write (temp → fsync → rename → directory fsync) with unified diff when overwrite is required.
- [sync](modules/sync.md) — `.primer-state.json` I/O, single-call drift detection via `git log --since`, phase inspection.
- [plugin-entry](modules/plugin-entry.md) — opencode plugin entry point that wires `src/` modules to the three custom tools and two lifecycle hooks.
- [commands](modules/commands.md) — eight markdown prompt templates under `.opencode/commands/`, one per primer phase.

Reflection is intentionally **not** a module. It is LLM-judged and lives in each command template's "before writing" section. A TypeScript module would either be untestable (if it called an LLM) or redundant (if it were just a checklist the template already states).

## Inter-module contracts
- `plugin-entry` is the only module that imports from `@opencode-ai/plugin`. It exposes four tools (`primer_validate`, `primer_scan`, `primer_write`, `primer_state_write`) and registers two hooks (`session.created`, `experimental.session.compacting`).
- `plugin-entry` consumes `validate()` from `validator`, `scan()` from `scanner`, `write()` from `writer`, and `readPrimerState`/`gitLogSince`/`driftWarning`/`detectCurrentPhase`/`readAgentIgnore` from `sync`.
- `sync` is the only module that depends on `writer` (it uses `write()` for `.primer-state.json`). All other modules are dependency-free toward each other.
- All shared types live in `src/types.ts` and are imported by name. No transitive re-exports.

## Cross-cutting concerns

### Error contract
- **Throw** for programmer errors and unexpected I/O failures — let them propagate to opencode's error surface.
- **Return typed result objects** for plugin tool outputs the agent must inspect structurally (`ValidationResult.missing`, `WriteResult.diff`, etc.). The agent branches on these, so they cannot raise.
- Scanner and validator helpers that touch the filesystem catch only the specific errors that have a meaningful fallback (e.g. malformed JSON manifest → leave `packageManifest` undefined).

### Path conventions
- All module APIs accept an absolute `repoRoot` and use `path.join`. Relative path strings are repo-relative in tool inputs and outputs.
- The single source of truth for primer-managed paths is in `types.ts`: `PRIMER_DOC_PREFIXES` (directories) and `PRIMER_DOC_FILES` (exact filenames). `sync.ts` uses both to exclude primer's own writes from drift detection.

### Atomicity
- `writer.write()` is the only filesystem write path. Sequence: `mkdirSync` of parent, `openSync` + `writeSync` + `fsyncSync` + `closeSync` of the temp file, `renameSync`, then a best-effort `fsync` of the parent directory.
- Best-effort directory fsync is wrapped in try/catch — directory fsync is unsupported on Windows.

### Configuration
- `opencode.json` may set `{ "primer": { "syncDriftThreshold": <int> } }` to override the 100-commit imprecise-warning threshold.
- The plugin reads this via the `config` hook and stores it in a closure-mutable local.

### Concurrency / race conditions
- `primer` runs single-session, single-developer. No cross-process locking. The atomicity of `writer.write` is sufficient against an OS crash, not against concurrent writers.

### Observability
- The `session.created` hook surfaces drift warnings via `console.log`. This is a documented assumption about opencode's hook behaviour — see [modules/sync.md](modules/sync.md#known-limitations).
