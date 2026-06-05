# Module: sync

## Responsibility
Persist and read the local primer sync state (`.primer-state.json`); compute source drift since the last sync using a single `git log --since` invocation; surface a human-readable drift warning; and report which primer phases are completed based on the on-disk document set.

## HLD reference
See [HLD.md § Goals](../HLD.md#goals) — drift detection. The state file is local-only and gitignored, consistent with the "no team-facing features" non-goal.

## Inputs / outputs (per function)
- `readPrimerState(repoRoot): PrimerState | null` — returns null on missing or malformed JSON.
- `writePrimerState(repoRoot, state): void` — delegates to `writer.write` with `overwrite: true`.
- `currentState(repoRoot): PrimerState` — captures now-ISO, short HEAD sha (or null), and branch (or null).
- `gitLogSince(repoRoot, syncedAt, opts?): DriftChangeSummary` — single `git log` call. `opts.threshold` caps the precise-warning window (default 100). `opts.ignorePatterns` extends the always-excluded set.
- `driftWarning(state, drift, threshold): string | null` — picks between "too many changes", "precise warning", or no warning.
- `detectCurrentPhase(repoRoot): PhaseStatus` — file-existence checks across the eight primer phases.
- `readAgentIgnore(repoRoot): string[]` — reads `.agent-ignore` patterns, filtered for blanks and comments.

## State file shape
```json
{
  "syncedAt": "2026-05-17T10:32:00Z",
  "headAtSync": "a3f9c12",
  "branchAtSync": "main"
}
```

| Field | Role | Used for git ops? |
|---|---|---|
| `syncedAt` | **Authoritative** timestamp of last sync | Yes — `git log --since` |
| `headAtSync` | **Advisory** short sha at sync | No — display only |
| `branchAtSync` | **Advisory** branch name at sync | No — display only |

`headAtSync` and `branchAtSync` may become unreachable after squash or rebase — expected and harmless because they never participate in git operations.

### Null vs `∅` vs empty string
- **`null`** is the state-level representation when git is unavailable or the repo has no commits.
- **`∅`** is the display-only substitution used by `driftWarning` to render `null` in the warning string.
- Empty stdout from `git rev-parse` is normalised to `null` inside `tryGitHead` and `tryGitBranch` via a `|| null` fallthrough.

## Drift detection
A single `git log --since=<syncedAt> --name-only --pretty=format:__PRIMER_COMMIT__` invocation:
- counts commits by counting `__PRIMER_COMMIT__` lines,
- collects file names from the remaining lines,
- skips any line matching `PRIMER_DOC_PREFIXES` or `PRIMER_DOC_FILES` (`types.ts`),
- skips any line matching the `.agent-ignore` patterns passed via `opts.ignorePatterns`.

If `commitCount > threshold`, the function returns `sourceFilesChanged: []` and the caller surfaces the imprecise warning.

## Dependencies (upstream)
- `node:child_process` — `execFileSync` for `git rev-parse` and `git log`.
- `node:fs`, `node:path`.
- `src/types.ts` — `PRIMER_DOC_PREFIXES`, `PRIMER_DOC_FILES`, and the state/drift types.
- `src/writer.ts` — `write` for `.primer-state.json` persistence.

## Dependents (downstream)
- `.opencode/plugins/primer.ts` — uses `readPrimerState`, `gitLogSince`, `driftWarning`, `detectCurrentPhase`, `readAgentIgnore`.

## Known limitations

### `session.created` hook output channel
The plugin surfaces the drift warning through the host's toast API (`client.tui.showToast`, `variant: "warning"`) when available, falling back to `console.log` otherwise. Delivery is best-effort and wrapped so it never throws, so a missing or changed client API degrades to stdout rather than breaking session start.

### Cross-branch behaviour
`syncedAt` is a timestamp, not a ref. If the developer synced on branch A and runs `/primer-sync` on branch B, `git log --since` reports B's commits since that timestamp. The drift warning surfaces `branchAtSync` so the developer can spot the mismatch.

### `experimental.session.compacting`
The compaction hook is on an experimental opencode API. If it is renamed or removed it simply isn't called. The handler also feature-detects `output.context`: if the expected array is absent (a shape change), it logs a diagnostic instead of silently dropping the preserved context. See [modules/plugin-entry.md](plugin-entry.md).

## Open questions
None.
