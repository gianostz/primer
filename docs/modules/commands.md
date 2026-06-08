# Module: commands

## Responsibility
A collection of eight markdown prompt templates under `.opencode/commands/`: five bootstrap commands (setup → hld → lld → skills → examples), one feature-driven command (`/primer-feature`), one parallel-work command (`/primer-sprint`), and one drift-correction command (`/primer-sync`). When the developer types `/primer-<name>`, opencode injects the matching template into the conversation and the agent conducts the interview, drafts the documents, and writes them after explicit approval.

Command templates are **not** TypeScript modules — they contain no executable code. Treated as a module here because they form a logical unit with explicit dependencies on the plugin's tools and on each other.

## HLD reference
See [HLD.md § Architecture style](../HLD.md#architecture-style) — dual-layer Layer 1.

## Public interface
| Command | Phase |
|---|---|
| `/primer-setup` | Seed `AGENTS.md`, `README.md`, `.agent-ignore`, `.primer-state.json` |
| `/primer-hld` | High-level design + ADRs |
| `/primer-lld` | Modules and contracts |
| `/primer-feature` | Focused, ephemeral implementation plan for a single new feature |
| `/primer-skills` | Stack-specific conventions |
| `/primer-examples` | Good/bad/rationale per skill |
| `/primer-sprint` | Isolation contracts for parallel coding-agent sessions |
| `/primer-sync` | Detect drift between source and primer docs; update docs |

Full per-command preconditions and outputs in [`docs/COMMANDS.md`](../COMMANDS.md).

## Template anatomy
Every template contains five sections in this order:

1. **Preconditions** — instruct the agent to call `primer_validate`. Document recovery as the failure path, not abort.
2. **Mandatory outputs** — the fixed list of documents this command must produce.
3. **Interview tree** — the conversational branches the agent must follow.
4. **Reflection criteria** — the explicit checks the agent runs on each draft before presenting it.
5. **Confirmation gate** — instructions to present each draft, await "approve / revise / skip", then call `primer_write`.

## Dependencies
- Plugin tools — `primer_validate`, `primer_scan`, `primer_write`, `primer_state_write` (from [modules/plugin-entry.md](plugin-entry.md)).
- Previous-phase outputs — every command except `primer-setup` reads documents written by earlier commands.

## Designer + critic pattern (`/primer-lld` only)
Encoded inside `primer-lld.md` as the multi-agent collaboration pattern: the agent drafts a module spec, then explicitly critiques it against the LLD reflection criteria, revises, and only then presents to the developer.

## Batching rule
One approval per LLM-drafted file. The single exception is `/primer-setup`, whose four outputs are fixed skeletons with no LLM content — they may be presented and written in a single batch after one approval.

## Open questions
- Whether to add a `/primer-status` shortcut that prints the current phase plus a "next command" hint without writing anything.
- Whether to add a `/primer-import` command that ingests a pre-existing `ARCHITECTURE.md` rather than starting `/primer-hld` from scratch.
