# Sync — drift detection and reset

`primer` is local-first. The sync feature is invisible to teammates: state lives in `.primer-state.json`, which is gitignored. Nothing about primer ever needs to be committed to a shared branch.

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
| `syncedAt` | **Authoritative** timestamp of the last sync | Yes — `git log --since` |
| `headAtSync` | **Advisory** short sha at sync time | No — display only |
| `branchAtSync` | **Advisory** branch name at sync time | No — display only |

`headAtSync` and `branchAtSync` may become stale or unreachable after squash merges or rebases. Expected. They are never passed to any git command. If they diverge from reality, the drift warning is still correct because it derives from `syncedAt`.

When the repo has no commits yet, `headAtSync` and `branchAtSync` are `null` (no sentinel string — `null` is unambiguous and trivial to test for).

## Drift detection — `session.created` hook

Fires when opencode opens a session in a repo that has `.primer-state.json`.

1. Read `.primer-state.json`. If missing, the hook is silent — primer is not initialised here.
2. Read `.agent-ignore`. Its patterns extend the always-excluded set.
3. Run:
   ```
   git log --since="<syncedAt>" --name-only --pretty=format: -- <source paths>
   ```
   Source paths = everything except `docs/`, `skills/`, `examples/`, `sprint/`, `.opencode/`, `.primer-state.json`, and `.agent-ignore` entries.
4. If `git log` returns more than the threshold (default 100) commits, surface the imprecise warning:
   > ⚠ primer: too many changes since last sync to analyse precisely. Run /primer-sync to reset the baseline.
5. Otherwise, if any source file changed, surface the precise warning:
   > ⚠ primer: source files changed since last sync (`<syncedAt>`, ~`<headAtSync>` on `<branchAtSync>`). Consider running /primer-sync before starting work.

The `~` prefix on the sha is informational — "approximately". The sha may be unreachable after a squash/rebase. That is expected and harmless.

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

## Edge cases the implementation handles

- `syncedAt` recent + no source changes → no warning.
- `syncedAt` recent + source changes → precise warning.
- `syncedAt` old + > threshold commits → imprecise warning.
- `headAtSync` is an unreachable sha → no error, advisory only.
- `.primer-state.json` missing → silent (primer not initialised).
- Repo has no commits yet (`headAtSync: null`) → no `git log` attempted via the hook's path; sync flow degrades gracefully.
