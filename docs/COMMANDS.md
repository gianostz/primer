# Commands reference

Every primer command is a markdown prompt template under `.opencode/commands/`. When the developer types `/primer-<name>`, opencode injects that template into the conversation and the agent runs the interview, drafts the documents, and writes them after explicit approval.

All commands except `/primer-setup` require `.primer-state.json` — the global precondition. If it is missing, the agent offers `/primer-setup` rather than aborting.

## Command catalogue

| Command | Preconditions | Mandatory outputs |
|---|---|---|
| `/primer-setup` | none | `AGENTS.md`, `README.md`, `.agent-ignore`, `.primer-state.json` (and a `.gitignore` append) |
| `/primer-hld` | `AGENTS.md`, `README.md` | `docs/HLD.md`, `docs/ADR/NNNN-*.md` (≥1 if tech decisions made), `AGENTS.md §Architecture/§Tech stack/§Non-goals`, `README.md ## Overview` |
| `/primer-lld` | `docs/HLD.md` with non-empty `## Vision`, `## Tech stack`, `## Architecture style`; `AGENTS.md §Architecture` non-empty | `docs/LLD.md`, `docs/modules/<name>.md`, optional `docs/api-contracts/*.md` and `docs/data-models/*.md`, `AGENTS.md §Modules` |
| `/primer-skills` | `docs/LLD.md` with non-empty module index; all referenced module files exist; `AGENTS.md §Modules` non-empty | `skills/SKILL-INDEX.md`, `skills/<slug>.md` (≥1), `AGENTS.md §Skills/§Coding style` |
| `/primer-examples` | ≥1 `skills/<slug>.md` (excluding `SKILL-INDEX.md`) | `examples/<slug>/good.md`, `bad.md`, `RATIONALE.md` per skill |
| `/primer-feature` | `docs/HLD.md` exists; `docs/LLD.md` exists; all referenced module files exist; `AGENTS.md §Modules` non-empty | `docs/plans/<feature-slug>.md` (ephemeral — deleted by developer after implementation) |
| `/primer-sprint` | ≥1 `docs/plans/<slug>.md` with a step marked `Parallelisable: yes`; developer-selected | `sprint/<slug>/CONTEXT.md`, `ISOLATION.md`, `MERGE.md` per selected unit |
| `/primer-sync` | `.primer-state.json` exists | updated primer docs + new `.primer-state.json` |

## How a command runs

1. Agent calls `primer_validate({ command })`. If invalid, it follows the recovery flow (`RECOVERY.md`) instead of aborting.
2. Agent reads existing context (the full set of primer documents already on disk).
3. Agent conducts the interview tree from the template — branching by the developer's answers, never a flat questionnaire.
4. Agent drafts each mandatory document.
5. Agent runs the reflection criteria from the template. If any fail, it revises the draft before presenting.
6. Agent presents each draft to the developer and waits for explicit "approve / revise / skip".
7. On approval, agent calls `primer_write({ path, content, overwrite })`. If the file exists without `overwrite: true`, `primer_write` returns a diff — the agent shows it and re-invokes with `overwrite: true` after a second approval.

## Batching rule

In normal flow: one draft, one approval, one `primer_write`. **The one exception is `/primer-setup`** — its four files are fixed skeletons with no LLM-drafted content, so they may be presented together and written in a single batch after one approval.

## Confirmation gate location

The confirmation gate lives in the **command template**, not in `primer_write`. A plugin tool cannot block the agent loop on terminal input; only the conversation loop can. This is why every template's "Confirmation gate" section is mandatory.

## Custom plugin tools

Defined in `.opencode/plugins/primer.ts`. Available to every command:

- `primer_validate({ command })` → `{ valid, missing, incomplete }`
- `primer_scan({ depth, moduleScope? })` → structured evidence (see `RECOVERY.md`)
- `primer_write({ path, content, overwrite })` → `{ written, path, replaced, diff? }`

## See also

- `RECOVERY.md` — how the recovery flow scans and drafts missing documents.
- `SYNC.md` — drift detection and the `/primer-sync` reset flow.
- `primer-brief.md` — historical brief kept for traceability. The structured docs (HLD, LLD, modules) supersede it for any conflict.
