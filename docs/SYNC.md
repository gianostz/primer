# Sync — drift detection and reset

`primer` is local-first. The sync feature is invisible to teammates: state lives in `.primer-state.json`, which is gitignored. Nothing about primer ever needs to be committed to a shared branch.

### Per-developer baseline (R6)

Because `.primer-state.json` is gitignored, **the sync baseline is per-developer, not per-repo**. Each clone tracks its own "last synced" point; one developer running `/primer-sync` does not move the baseline for anyone else, and a fresh clone has no baseline until its first setup/sync. This is intentional for a personal productivity tool.

If a team ever wants a *shared* baseline (everyone drifts from the same commit), that would mean committing `.primer-state.json` — a future `primer.commitState` config flag could opt into this by having `/primer-setup` skip adding the state file to `.gitignore`. It is deliberately **not** the default: a committed state file would churn on every sync and create merge conflicts on a field no git command depends on for correctness.

## The state file

`.primer-state.json` at the repo root:

```json
{
  "syncedAt": "2026-05-17T10:32:00Z",
  "headAtSync": "a3f9c12",
  "branchAtSync": "main"
}
```

| Field | Role | Used for git ops? |
|---|---|---|
| `syncedAt` | Timestamp of the last sync | Yes — `git log --since` **fallback** only |
| `headAtSync` | Short sha at sync time | **Yes — preferred** `git log <headAtSync>..HEAD` |
| `branchAtSync` | **Advisory** branch name at sync time | No — display only |

When `headAtSync` is set, drift is computed from the exact commit range `git log <headAtSync>..HEAD`, which is immune to clock skew and author-date quirks. `git log --since=<syncedAt>` is only the fallback for when `headAtSync` is `null`. `headAtSync` may become unreachable after a squash/rebase — in that case the range query returns nothing and the warning simply doesn't fire (advisory, harmless). `branchAtSync` is never passed to git.

When the repo has no commits yet, `headAtSync` and `branchAtSync` are `null` (no sentinel string — `null` is unambiguous and trivial to test for).

## Drift detection — `session.created` hook

Fires when opencode opens a session in a repo that has `.primer-state.json`.

1. Read `.primer-state.json`. If missing, the hook is silent — primer is not initialised here.
2. Read `.agent-ignore`. Its patterns extend the always-excluded set (see [`.agent-ignore` pattern syntax](#agent-ignore-pattern-syntax) below).
3. Run (preferring the exact commit range when `headAtSync` is known, else the timestamp window):
   ```
   git log <headAtSync>..HEAD --name-only --pretty=format:%H -z   # preferred
   git log --since="<syncedAt>" --name-only --pretty=format:%H -z  # fallback
   ```
   Source paths = everything except `docs/`, `skills/`, `examples/`, `sprint/`, `.opencode/`, `.primer-state.json`, and `.agent-ignore` entries.
4. If `git log` returns more than the threshold (default 100) commits, surface the imprecise warning:
   > ⚠ primer: too many changes since last sync to analyse precisely. Run /primer-sync to reset the baseline.
5. Otherwise, if any source file changed, surface the precise warning:
   > ⚠ primer: source files changed since last sync (`<syncedAt>`, ~`<headAtSync>` on `<branchAtSync>`). Consider running /primer-sync before starting work.

The `~` prefix on the sha is informational — "approximately". The sha may be unreachable after a squash/rebase. That is expected and harmless.

**Delivery (M2):** the warning is sent through the host's toast API (`client.tui.showToast`, `variant: "warning"`) when available, falling back to stdout otherwise. Delivery is best-effort and never throws, so a missing or changed client API can't break session start.

The threshold is configurable in `opencode.json`:

```json
{ "primer": { "syncDriftThreshold": 100 } }
```

## `/primer-sync` — the reset flow

See `.opencode/commands/primer-sync.md` for the full template. Briefly:

1. Compute drift via the same `git log` call.
2. Group changed source files by which primer document they likely affect.
3. Present the list of potentially stale documents to the developer.
4. Pull in flagged architectural updates from every `docs/plans/*.md` with `Status: implemented` (HLD/LLD/ADR/module entries the feature plan committed to revisit).
5. Update everything in dependency order (HLD → LLD → modules → api-contracts → data-models → skills → examples → sprint). For each: scan, draft, reflect, show diff, approve, write.
6. After all updates land, offer to delete each implemented plan whose architectural commitments have been honoured.
7. Write a new `.primer-state.json` with the current timestamp / sha / branch.

## Cross-branch behaviour

`syncedAt` is a timestamp, not a ref. If the developer synced on branch A and runs `/primer-sync` on branch B, `git log --since` reports B's commits since that timestamp — which may be unrelated to the docs primer wrote. This is acceptable for a personal tool: `primer` is not branch-aware. The drift warning includes `branchAtSync`, so the developer can spot the mismatch and decide whether to continue.

## Compaction preservation — `experimental.session.compacting` hook

When opencode compacts a long session, this hook injects a short summary into the preserved context:

```
## primer context (preserved across compaction)
Last sync: 2026-05-17T10:32:00Z (~a3f9c12 on main)
Completed phases: setup, hld, lld
Pending phases: skills, examples
```

The `experimental.` prefix means this hook is **not** a stable opencode API. If opencode renames or removes it, compaction-preservation silently no-ops. Acceptable risk for a personal tool — the TODO in `.opencode/plugins/primer.ts` points back to this section.

## `.agent-ignore` pattern syntax

`.agent-ignore` is **not** a `.gitignore`. It supports a small, explicit subset
and nothing more — so you are never surprised by a pattern that looks like it
should work but silently doesn't. Blank lines and lines starting with `#` are
ignored. The three supported forms are:

| Form | Example | Matches |
|---|---|---|
| Directory prefix (trailing `/`) | `venv/` | any path under `venv/` (`venv/lib/x.py`) |
| Extension glob (`*.ext`) | `*.pyc` | any path ending in `.pyc` |
| Exact path / path prefix | `secrets` | the path `secrets` itself **and** anything under `secrets/` |

**Not supported** (treated as literal characters, never as wildcards):

- `**` recursive globs
- `?` single-character wildcards
- `!` negation / re-inclusion
- character classes like `[abc]`
- mid-segment `*` such as `src/*.test.ts`

If you need one of those, list the concrete directories/extensions instead. The
matcher lives in `matchesAny` (`src/sync.ts`); its behaviour is pinned by tests
in `tests/sync.test.ts`.

## Edge cases the implementation handles

- `syncedAt` recent + no source changes → no warning.
- `syncedAt` recent + source changes → precise warning.
- `syncedAt` old + > threshold commits → imprecise warning.
- `headAtSync` is an unreachable sha → no error, advisory only.
- `.primer-state.json` missing → silent (primer not initialised).
- Repo has no commits yet (`headAtSync: null`) → no `git log` attempted via the hook's path; sync flow degrades gracefully.
