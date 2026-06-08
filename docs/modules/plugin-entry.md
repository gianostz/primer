# Module: plugin-entry

## Responsibility
The single TypeScript entry point that opencode loads at startup. It wires `src/` modules into the plugin runtime by exposing three custom tools and registering two lifecycle hooks. It contains no business logic of its own — every behaviour is delegated to a module in `src/`.

## HLD reference
See [HLD.md § Architecture style](../HLD.md#architecture-style) — dual-layer Layer 2.

## Public interface
- Default export: a `Plugin` (from `@opencode-ai/plugin`) that opencode invokes once with `{ directory }` and expects to return a `Hooks` object.

## Hooks registered
- `config` — reads `opencode.json`'s optional `{ primer: { syncDriftThreshold: number } }` and updates the local threshold closure variable.
- `tool` — registers four tools, each backed by a Zod schema and an `execute` that delegates to `src/`:
  - `primer_validate` → `validator.validate`
  - `primer_scan` → `scanner.scan`
  - `primer_write` → `writer.write`
  - `primer_state_write` → `sync.currentState` + `sync.writePrimerState` (no args; reads timestamp/HEAD/branch from the environment and git)
- `event` — handles `session.created` for drift detection. Reads `.primer-state.json`, calls `sync.gitLogSince`, and delivers `sync.driftWarning(...)` (if non-null) via the host toast API with a `console.log` fallback (`deliverWarning`).
- `experimental.session.compacting` — pushes a primer-context summary into `output.context` before opencode compacts. Marked **experimental**; feature-detects `output.context` and logs a diagnostic if its shape changed, rather than silently no-op-ing.

## Inputs / outputs (per tool)

### `primer_validate({ command })`
Returns `ValidationResult` JSON in `output` and as `metadata`.

### `primer_scan({ depth, moduleScope? })`
Returns `ScanResult` JSON in `output` and as `metadata`.

### `primer_write({ path, content, overwrite })`
Returns `WriteResult`. When `written === false`, the unified diff is included in `output` so the agent can show it to the developer and re-invoke with `overwrite: true` after approval.

## Dependencies (upstream)
- `@opencode-ai/plugin` — `tool`, `Plugin` types.
- `zod` — argument schemas.
- `src/validator.ts`, `src/scanner.ts`, `src/writer.ts`, `src/sync.ts`, `src/types.ts`.

## Dependents (downstream)
None — this is the outermost layer. opencode loads it.

## Error handling contract
Errors thrown by `src/` modules propagate to opencode's tool-error surface. Result-objects (`ValidationResult`, `WriteResult`, etc.) are returned as structured metadata so the agent can branch on them.

## Confirmation gate
**Not enforced here.** The plugin is intentionally non-blocking — the agent loop cannot be paused on terminal input from inside a tool. The confirmation gate lives in each command template under "Confirmation gate".

## Hook delivery channel
The `session.created` warning is delivered through `client.tui.showToast` (`variant: "warning"`) when the host exposes it, falling back to `console.log` otherwise. The `deliverWarning` helper wraps both paths so delivery never throws. See [modules/sync.md](sync.md#known-limitations).

## Open questions
- None. The drift warning already prefers the host toast API; `console.log` remains only as a fallback.
