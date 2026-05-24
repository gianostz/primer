# Module: validator

## Responsibility
Determine whether a primer command can proceed by checking that its precondition documents exist and that the sections it depends on are non-empty. Returns a structured result the agent inspects to decide between "run the interview" and "trigger recovery".

## HLD reference
See [HLD.md § Architecture style](../HLD.md#architecture-style). This module is the **Guardrails** agentic pattern, instantiated as deterministic precondition checking.

## Inputs
- `command: CommandName` — which primer command is about to run.
- `repoRoot: string` — absolute path to the developer's repo root.

## Outputs
`ValidationResult` (see `src/types.ts`):
```ts
{
  valid: boolean
  missing: { path: string; requiredBy: string; recoverable: boolean }[]
  incomplete: { path: string; section: string; description: string }[]
}
```

## Public interface
- `validate(command, repoRoot): ValidationResult` — the single exported entry point used by `primer_validate`.
- `sectionHasContent(text, heading): boolean` — exported because the recovery flow uses it to judge "incomplete" vs "missing".

## Dependencies (upstream)
- `node:fs` — `existsSync`, `readFileSync`, `readdirSync`.
- `node:path` — `join`.
- `src/types.ts` — the shared result-object types.

## Dependents (downstream)
- `.opencode/plugins/primer.ts` — registers `validate` as the `primer_validate` tool.

## Data owned
None. Validator is pure-functional over the filesystem snapshot.

## Error handling contract
Validator does not throw for missing files — that is the **expected** failure mode that produces the `missing` list. It does throw for unexpected I/O errors (e.g. permission denied), letting them propagate to opencode.

## Validation rules per command
Documented in detail in [HLD.md § Goals](../HLD.md#goals) (precondition table) and enforced in `validate()`:

| Command | Preconditions |
|---|---|
| `primer-setup` | none |
| `primer-hld` | `AGENTS.md` + `README.md` exist |
| `primer-lld` | `docs/HLD.md` exists with non-empty `## Vision`, `## Tech stack`, `## Architecture style`; `AGENTS.md § Architecture` non-empty |
| `primer-feature` | `docs/HLD.md` exists; `docs/LLD.md` exists + every module file the LLD module index links to also exists; `AGENTS.md § Modules` non-empty |
| `primer-skills` | `docs/LLD.md` exists with a non-empty module index + every referenced module file exists; `AGENTS.md § Modules` non-empty |
| `primer-examples` | at least one `skills/<slug>.md` exists (excluding `SKILL-INDEX.md`) |
| `primer-sprint` | at least one `docs/plans/<slug>.md` contains a step marked `Parallelisable: yes` |
| `primer-sync` | `.primer-state.json` exists |

Every command except `primer-setup` additionally requires `.primer-state.json` to exist (global precondition).

## Regex hardening
The LLD-module-link parser is tolerant of:
- markdown title attributes — `[name](modules/x.md "title")`
- relative prefixes — `./modules/x.md`, `../modules/x.md`
- backslash separators (normalised to `/`)
- nested forms — `docs/modules/x.md`, `path/to/modules/x.md` (everything after the first `modules/`)

The `Parallelisable: yes` matcher accepts plain text, `**Parallelisable**`, and `__Parallelisable__` variants. Sprint preconditions iterate over every `*.md` file under `docs/plans/`.

## Open questions
None.
