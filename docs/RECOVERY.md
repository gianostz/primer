# Recovery flow

Recovery runs when `primer_validate` returns `valid: false`. It applies to **any** primer command, not only `/primer-sync`. Instead of aborting, primer scans the existing repo at an appropriate depth, drafts the missing document from structured evidence, and presents it for review.

## When recovery fires

- A required document is missing.
- A required document exists but mandatory sections are empty (the "incomplete" case).

Both states block the command. Both are recoverable.

## Protocol

For each missing or incomplete document, in dependency order (setup → HLD → LLD → module → skills → examples → feature plans → sprint):

1. Tell the developer what is missing and why.
2. Call `primer_scan` at the scan depth for that document type.
3. Draft the document from the returned evidence.
4. Run reflection (the same criteria the originating command uses).
5. Present the draft. Wait for "approve / revise / skip".
6. On approval, call `primer_write({ path, content, overwrite: <true if file exists> })`.
7. Move to the next missing document.

Each LLM-drafted document gets its **own** approval. The four `/primer-setup` skeletons are the only exception (fixed templates, no generated content — one approval, one batched write).

## Partial documents

If a document exists but is missing mandatory sections: **regenerate the whole document**, not just the missing sections. Present the full regenerated version for review. Patching sections produces fragile, half-coherent docs.

## Scan depth per missing document

| Missing document | Scan depth |
|---|---|
| `AGENTS.md`, `README.md` | `meta` |
| `docs/HLD.md` | `structure` |
| `docs/LLD.md` | `structure` + `module` for each inferred component |
| `docs/modules/<name>.md` | `module` scoped to that component |
| `docs/plans/<slug>.md` | reads the affected HLD section + module doc(s) only (see `/primer-feature` two-phase context loading) |
| `skills/*.md` | reads HLD + LLD + module docs (already present) |

## What each scan depth covers

### `meta` — for missing setup docs
- `AGENTS.md`, `README.md`, any `.md` in repo root
- One of `package.json`, `pyproject.toml`, `build.gradle`, `pom.xml`, `Cargo.toml`, `go.mod` (whichever exists)
- `/docs/` directory listing (filenames only)

### `structure` — for missing HLD
Everything in `meta`, plus:
- Directory tree to depth 3 (folder names and file counts only)
- All files in `/docs/` (full content)
- Top-level source directory names
- For each top-level source dir: subdirectory names only
- Any interface/type files (`*.d.ts`, `*Types.ts`, `*Interface.scala`, `*.proto`)

### `module` — for missing LLD / module docs (scoped to HLD context)
Everything in `structure`, plus:
- For modules identified in the HLD: read their source directories fully
- Public interface files in full
- One representative implementation file per module (largest by line count)
- Skip test files unless no implementation files are found

## Why scan returns structured evidence

`primer_scan` returns `ScanResult` (languages, frameworks, modules, interfaces, etc.) — not raw text. The agent makes its judgements from typed evidence, not unbounded file dumps. This keeps the recovery context predictable and the prompts compact.

## Stopping at the offer

If validation fails with `.primer-state.json` missing, the agent **offers** `/primer-setup` rather than running recovery directly. Setup must precede every other command — there is no useful primer state to recover from before setup has produced one.
