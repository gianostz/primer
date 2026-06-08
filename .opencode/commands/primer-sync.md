---
description: Detect stale primer documents from source drift, update them one by one, and reset the baseline.
---

# /primer-sync

You detect which primer documents are stale relative to source changes since the last sync, update them with confirmation gates, then reset the sync baseline.

## Preconditions

Call `primer_validate({ command: 'primer-sync' })`.

Required: `.primer-state.json` exists. If not, offer `/primer-setup`.

## Flow

### 1. Compute drift

Read `.primer-state.json`. The hook may already have surfaced a drift warning at session start. Either way, compute the precise list. Prefer the exact commit range when `headAtSync` is set, falling back to the timestamp window only when it is `null`:

```
# preferred — immune to clock skew, runs when headAtSync is set
git log <headAtSync>..HEAD --name-only --pretty=format:%H -z

# fallback — only when headAtSync is null
git log --since="<syncedAt>" --name-only --pretty=format:%H -z
```

This is exactly what the `gitLogSince` helper (and the session-start hook) does. Source paths = everything **except** `docs/`, `skills/`, `examples/`, `sprint/`, `.opencode/`, `.primer-state.json`, and `.agent-ignore` entries.

If more than the configured threshold (default 100) commits are reported, fall back to the imprecise warning and ask the developer to confirm before continuing.

### 2. Group changes by target document

| Source change | Affects |
|---|---|
| Changes in a module's source dir | `docs/modules/<name>.md` and possibly `docs/LLD.md` |
| New top-level directories | possibly `docs/HLD.md` |
| Changes to interfaces/types | `docs/api-contracts/<name>.md` or `docs/data-models/<name>.md` |
| Architectural decision recorded informally in PR or chat | possibly a new `docs/ADR/NNNN-*.md` |

Present the list of potentially stale documents and the source files that triggered each.

### 2b. Pull in flagged updates from implemented feature plans

For every `docs/plans/<slug>.md` with `Status: implemented`, read its
`Architectural impact` section. For each `yes` answer, add the corresponding
document to the stale list **even if no source drift would have triggered it**:

| Flag in plan | Adds to stale list |
|---|---|
| `New ADR needed: yes` | next `docs/ADR/NNNN-*.md` to create |
| `HLD changes: yes — <sections>` | `docs/HLD.md` (named sections) |
| `LLD changes: yes — <modules>` | `docs/LLD.md` and each named `docs/modules/<name>.md` |

Show the developer which plans contributed which entries. After the sync is
complete and the developer confirms, **offer to delete each implemented plan
file** — the plan was always ephemeral; once its architectural commitments
have been honoured it has no further job.

### 3. Update in dependency order

Update in this order: HLD → LLD → module docs → api-contracts → data-models → skills → examples → sprint.

For each stale document:

a. Call `primer_scan` at the appropriate depth (see `docs/RECOVERY.md`).
b. Draft the updated version (regenerate whole document if mandatory sections are missing — never patch sections).
c. Run reflection (criteria from the originating command).
d. Show the **unified diff** vs the existing file to the developer.
e. Ask: "Approve, revise, or skip?"
f. On approval, call `primer_write({ path, content, overwrite: true })`.
g. Move on.

### 4. Reset baseline

After every approved update is on disk, call `primer_state_write` (no
arguments). It writes a fresh `.primer-state.json` with `syncedAt` from the
environment clock and `headAtSync`/`branchAtSync` from git. Do **not** compose
the JSON yourself or route it through `primer_write` — handcrafted timestamps
and shas are precisely what this tool eliminates.

## Cross-branch warning

`syncedAt` is a timestamp, not a ref. If the developer last synced on branch A and runs `/primer-sync` on branch B, the report may include commits unrelated to the documents primer wrote. Surface `branchAtSync` so the developer can spot the mismatch and decide whether to continue.

## Reflection (apply per document)

- The updated document covers every relevant source change you found.
- No mandatory section is empty.
- The diff is small enough to review (if not, split the work and ask the developer to scope).

## Confirmation gate

One approval per document. Never batch updates. After all approvals, the state-file write is the only batched step (a fixed-shape JSON, no LLM content).
