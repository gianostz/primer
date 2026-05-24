# Module: writer

## Responsibility
Provide an atomic, OS-safe single-file write primitive for every primer document, plus the unified-diff generator the agent shows when overwriting an existing file would change its contents.

## HLD reference
See [HLD.md § Quality attributes](../HLD.md#quality-attributes) — Reliability.

## Inputs
- `WriteInput`:
  ```ts
  { path: string; content: string; overwrite?: boolean }
  ```
- `repoRoot: string` — absolute path to the developer's repo root.

## Outputs
`WriteResult` (see `src/types.ts`):
```ts
{
  written: boolean
  path: string
  replaced: boolean   // true if an existing file was overwritten
  diff?: string       // populated when written=false because the file exists and overwrite was not requested
}
```

## Public interface
- `write(input, repoRoot): WriteResult`
- `unifiedDiff(path, oldText, newText): string` — exported because `sync.ts` reuses it for drift-diff previews.

## Dependencies (upstream)
- `node:fs` — `openSync`, `writeSync`, `fsyncSync`, `closeSync`, `renameSync`, `existsSync`, `mkdirSync`, `readFileSync`, `unlinkSync`.
- `node:path` — `basename`, `dirname`, `join`.

## Dependents (downstream)
- `.opencode/plugins/primer.ts` — registers `write` as the `primer_write` tool.
- `src/sync.ts` — uses `write` to persist `.primer-state.json`.

## Atomicity contract
The write sequence is:

1. Resolve the absolute path and parent directory.
2. If the destination exists and `overwrite` is not `true`, return early with the unified diff in `WriteResult.diff` and write nothing.
3. `mkdirSync(parent, { recursive: true })` — only at this point, so a no-op call does not create empty directories.
4. Open a temp file `.<basename>.primer-<pid>-<ts>.tmp` in the destination's parent directory (same filesystem so `rename` is atomic).
5. `writeSync` the content, `fsyncSync` the fd, `closeSync`.
6. `renameSync` the temp file over the destination.
7. Best-effort: open the parent directory, `fsyncSync`, close. Wrapped in try/catch — Windows does not allow directory fsync.
8. On any error, attempt to unlink the temp file and rethrow.

## Data owned
None. Writer is stateless.

## Error handling contract
Throws on I/O failure. The agent surfaces the error via opencode's error path; it never returns a partial write.

## Confirmation gate
The confirmation gate is **not** in this module. A plugin tool cannot block the agent loop on terminal input. Each command template is responsible for presenting the draft and obtaining the developer's approval before invoking `primer_write`.

## Open questions
None.
