# High-level design

## Vision
`primer` is an opencode plugin and command set that initialises a code repository for maximum coding-agent productivity and supports incremental feature development on top of that initialisation. It guides a developer through a fixed bootstrap sequence — high-level design, low-level design, skills, paired examples — and then provides a per-feature planning command (`/primer-feature`) plus parallel-sprint contracts and drift-correction. At each phase it produces a mandatory set of context documents that coding agents consume before writing any code. `primer` writes documents only; it never writes code on behalf of the developer.

## Goals
- Give every coding-agent session a complete, traceable, layered context to read before it edits code.
- Make the context-building process resumable: a missing or incomplete document does not abort a command — it triggers recovery.
- Keep the workflow human-in-the-loop: no document is written without explicit developer approval.
- Stay agent-agnostic at the **output** layer: every document is plain markdown, consumable by Claude Code, Cursor, Aider, or any tool that reads files.
- Detect drift between source code and primer documents at session start, so the developer is reminded before an outdated context bleeds into a coding session.

## Non-goals
- No GUI.
- No cloud sync. State is local-only and gitignored.
- No multi-language output — markdown only.
- No automatic translation between agent formats. Other agents read the markdown directly.
- No team-facing features. The sync feature is invisible to teammates.
- No automatic code generation. `primer` orchestrates context; it does not write source code.

## Users / consumers
- The **developer** running `/primer-<phase>` commands inside opencode.
- The **coding agents** (opencode, Claude Code, Cursor, Aider) that subsequently read the generated documents before writing code.

## Success criteria
- A coding agent reading the produced `AGENTS.md`, `docs/HLD.md`, `docs/LLD.md`, `docs/modules/*.md`, `skills/*.md`, and `examples/*` understands what to build without needing to ask further architectural questions.
- Each `docs/plans/<slug>.md` traces its scope to one or more LLD modules and an HLD component by hyperlink, and is deletable once the feature ships and `/primer-sync` has applied any flagged architectural updates.
- A repo with a complete primer document set passes `primer_validate` for every command.
- `session.created` injects exactly one drift warning when source files have changed since `.primer-state.json.syncedAt`, and zero warnings otherwise.

## System type
CLI-style developer tool, delivered as an opencode plugin with markdown command templates. Interactive: it conducts conversational interviews with the developer.

## Architecture style
**Dual-layer**:

- **Layer 1 — commands** (`.opencode/commands/*.md`): prompt templates that opencode injects into the conversation when the developer types `/primer-<name>`. They contain the interview tree, the document structure to produce, the reflection criteria, and instructions to call plugin tools.
- **Layer 2 — plugin** (`.opencode/plugins/primer.ts`): a TypeScript module loaded at startup. It exposes deterministic custom tools and lifecycle hooks that cannot be left to LLM judgement.

The plugin imports its logic from `src/`. The commands call the plugin's tools; the plugin never invokes a command.

## Tech stack
- **TypeScript (strict)** — no `any`, named imports only.
- **Bun** runtime — no build step; opencode loads TypeScript directly. Tests via `bun test`.
- **`@opencode-ai/plugin`** — plugin SDK that supplies the `Plugin` type, `tool` helper, and the hook contract.
- **`zod`** — argument-schema validation for the three custom tools.

## Quality attributes
1. **Maintainability** — explicit module boundaries, typed result objects at the agent surface, regex-tolerant validators that survive minor formatting drift in LLM-produced markdown.
2. **Reliability** — `primer_write` writes atomically (temp + fsync + rename + best-effort directory fsync), so a crash mid-write cannot leave a half-written primer document.
3. **Developer experience** — every command surfaces the next command on completion; failed preconditions never abort, they trigger recovery.

## Key constraints
- The plugin writes **documents only**: under `docs/`, `skills/`, `examples/`, `sprint/`, plus `AGENTS.md`, `README.md`, `.agent-ignore`, `.primer-state.json`. It must never write source code in the developer's project.
- Sprint unit selection is always developer-driven. The tool never auto-picks.
- The confirmation gate is enforced by the command template, not by `primer_write` — a plugin tool cannot block the agent loop on terminal input.
- `.primer-state.json` is gitignored and only ever written via `primer_write` (from `primer-setup` and `primer-sync`).

## Agentic design patterns
| Pattern | Where applied |
|---|---|
| **Prompt chaining** | Commands chain: each one's output is input context for the next |
| **Reflection / self-correction** | Every generated document is critiqued before writing |
| **Planning** | `/primer-hld`, `/primer-lld`, `/primer-feature` decompose intent |
| **Tool use** | Plugin tools: `primer_validate`, `primer_scan`, `primer_write`, `primer_state_write` |
| **Human-in-the-loop** | Confirmation gate after every document draft |
| **Multi-agent collaboration** | `/primer-lld` models designer+critic handoff in interview template |
| **Independent parallel agents** | `/primer-sprint` produces isolation contracts for concurrent sessions |
| **Knowledge retrieval** | Recovery flow reads existing code to reconstruct missing context |
| **Guardrails** | Precondition validation blocks commands when the layer below is incomplete |

## Open questions
- Whether to expose a future `primer_lint` tool that programmatically verifies traceability (HLD ↔ LLD ↔ feature plans) rather than relying on LLM-side reflection.
- Whether to support per-package primer state for monorepos in a v2.

## ADR index
None recorded yet. Significant architectural decisions captured directly in this document and in `docs/LLD.md`.
