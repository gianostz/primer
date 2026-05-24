# AGENTS.md

## Project overview
`primer` is an opencode plugin and command set that initialises a code repository for maximum coding-agent productivity. It conducts structured interviews — HLD, LLD, work items, skills, examples, parallel sprints — and produces the documents coding agents read before writing any code. `primer` writes **documents only**, never code.

## Architecture
Dual-layer. `.opencode/commands/*.md` are prompt templates that drive each interview phase. `.opencode/plugins/primer.ts` is the TypeScript plugin entry point — it wires modules from `src/` and exposes three custom tools (`primer_validate`, `primer_scan`, `primer_write`) plus four hooks: `config` (reads `syncDriftThreshold`), `tool` (registers the three tools), `event` (handles `session.created` for drift detection), and `experimental.session.compacting` (preserves primer context across compaction).

## Tech stack
TypeScript (strict), Bun runtime, `@opencode-ai/plugin`, Zod for tool argument schemas. No build step — opencode loads TypeScript directly. Tests run via `bun test`.

## Modules
See [docs/LLD.md](docs/LLD.md) for the module index and inter-module contracts. Summary:

- [`validator`](docs/modules/validator.md) — precondition checks per command (file existence + non-empty section detection); tolerant LLD-link and Parallelisable regexes.
- [`scanner`](docs/modules/scanner.md) — repo scan at three depths (`meta`, `structure`, `module`) returning evidence only (no architecture inference).
- [`writer`](docs/modules/writer.md) — atomic file write (temp + fsync + rename + best-effort directory fsync); unified diff on existing-without-overwrite.
- [`sync`](docs/modules/sync.md) — `.primer-state.json` I/O, single-call `git log --since` drift detection, phase inspection.
- [`plugin-entry`](docs/modules/plugin-entry.md) — opencode plugin entry that registers the three tools and four hooks (`config`, `tool`, `event`, `experimental.session.compacting`).
- [`commands`](docs/modules/commands.md) — eight markdown prompt templates under `.opencode/commands/`, one per primer phase.

Reflection is intentionally **not** a separate module. It is LLM-judged and lives in each command template's "before writing" section.

## Feature plans
Incremental work happens through `/primer-feature`, which produces ephemeral plans at `docs/plans/<slug>.md`. Each plan is the contract for the implementing agent and is deleted by the developer once the feature ships and `/primer-sync` has applied any flagged architectural updates.

## Coding style
- TypeScript strict mode. No `any`.
- Throwing is fine for genuine programmer errors and unexpected I/O. Reserve typed result objects (`ValidationResult`, `WriteResult`, etc.) for plugin tool returns the agent must inspect structurally.
- Functional by default. Classes only when state genuinely needs encapsulation.
- Named imports only.
- No comments that describe what the code does — the code does that. Only add a comment when the *why* is non-obvious.

## Skills
None yet. `primer` does not produce skill files for itself — they are produced for the projects primer initialises.

## Examples
None.

## Sprint rules
Single-developer project. No sprint contracts in this repo.

## Agent roles
- **Implementor**: writes code and tests per `primer-brief.md`. Never adds features not in the brief.
- **Reviewer**: checks reflection criteria from the brief before approving a draft.

## Constraints
- The plugin writes documents only: `docs/`, `skills/`, `examples/`, `sprint/`, `AGENTS.md`, `README.md`, `.agent-ignore`, `.primer-state.json`, and an append to `.gitignore`. It never writes source code in the developer's project.
- Sprint unit selection is **always** developer-driven. The tool never auto-picks.
- The confirmation gate is enforced by the command template, not by `primer_write`. A plugin tool cannot block the agent loop on terminal input.
- `.primer-state.json` is gitignored and only ever written via `primer_write` (from `primer-setup` and `primer-sync`).

## Non-goals
- No GUI.
- No cloud sync.
- No multi-language output — markdown only.
- No automatic translation between agent formats (Claude Code, Cursor, Aider all read markdown directly).
- No team-facing features. Sync state is local-only.

## Glossary
- **HLD**: high-level design. Source of truth for every downstream document.
- **LLD**: low-level design. Module-by-module decomposition of the HLD.
- **Recovery**: when `primer_validate` returns invalid, primer scans, drafts the missing document, and resumes — instead of aborting.
- **Drift**: source files changed since `.primer-state.json.syncedAt`. Detected at session start.

## References
- [`docs/HLD.md`](docs/HLD.md), [`docs/LLD.md`](docs/LLD.md), [`docs/modules/`](docs/modules/) — primary, dog-fooded design documents. Authoritative.
- [`docs/COMMANDS.md`](docs/COMMANDS.md), [`docs/RECOVERY.md`](docs/RECOVERY.md), [`docs/SYNC.md`](docs/SYNC.md), [`docs/GETTING-STARTED.md`](docs/GETTING-STARTED.md) — user-facing reference.
- `primer-brief.md` — historical project brief that produced the structured documents above. Kept for traceability; the structured docs supersede it for any conflict.
- *Agentic Design Patterns* by Antonio Gulli — the philosophy underlying primer.
