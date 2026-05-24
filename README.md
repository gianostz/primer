# primer

An opencode plugin and command set that initialises a code repository for maximum coding-agent productivity. `primer` writes **documents**, never code.

## Overview

Coding agents perform exactly as well as the context they are given. `primer` builds that context systematically: a guided sequence of interviews — high-level design, low-level design, work items, skills, paired examples, parallel-sprint contracts — each producing a mandatory set of markdown documents that agents (opencode, Claude Code, Cursor, Aider, anything that reads files) consume before they write code.

Every phase reflects on its draft against explicit quality criteria, presents the draft for developer approval, and only writes after explicit confirmation.

## Getting started

The full guide — prerequisites, three install strategies, smoke-test, first-session walkthrough, troubleshooting — lives at [`docs/GETTING-STARTED.md`](docs/GETTING-STARTED.md). Quick version:

1. Install opencode and Bun.
2. Drop the `.opencode/` directory and the `src/` directory into your project (or symlink them).
3. Run `bun install` (the plugin needs `@opencode-ai/plugin` and `zod`).
4. Open opencode in the project. Run `/primer-setup`.
5. Follow the prompts. The next command to run is always announced when the current one finishes.

## Commands

| Command | Phase |
|---|---|
| `/primer-setup` | Seed `AGENTS.md`, `README.md`, `.agent-ignore`, `.primer-state.json` |
| `/primer-hld` | High-level design + ADRs |
| `/primer-lld` | Modules and contracts |
| `/primer-skills` | Stack-specific conventions |
| `/primer-examples` | Good/bad/rationale per skill |
| `/primer-feature` | Focused, ephemeral implementation plan for a single new feature |
| `/primer-sprint` | Isolation contracts for parallel coding-agent sessions |
| `/primer-sync` | Detect drift between source and primer docs; update docs |

See `docs/GETTING-STARTED.md` for setup, `docs/COMMANDS.md` for full command details, `docs/RECOVERY.md` for the missing-document protocol, `docs/SYNC.md` for the drift-detection feature. primer's own design docs (HLD, LLD, modules) under `docs/` double as a worked example of what primer produces.

## Development

```bash
bun install
bun test
```

## License

MIT (see `LICENSE` if present).
