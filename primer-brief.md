# primer — Claude Code Project Brief v3

> This document is the complete briefing for a Claude Code / opencode session.
> Read it fully before producing any file. Every decision here was made
> deliberately during a structured brainstorming session. Do not infer
> alternatives — implement exactly what is specified.
>
> This project is an **opencode plugin + command set**. It produces
> documents only. It never writes code on behalf of the developer.

---

## 1. Project vision

`primer` is an opencode plugin that initialises a code repository for
maximum coding-agent productivity. It guides a developer through a
sequence of structured phases — high-level design, low-level design,
work items, skills, examples, and parallel sprints — and at each phase
produces a mandatory set of context documents that coding agents consume
before writing any code.

`primer` does **not** write code. It writes **documents**. The documents
are the product.

The philosophy is taken from *Agentic Design Patterns* by Antonio Gulli:
an agent's performance is entirely dependent on the quality and
completeness of its context. `primer` is the tool that builds that
context systematically, phase by phase, with human confirmation at
every gate.

### Core principles

- **HLD-first**: the high-level design is the source of truth. Every
  downstream document traces back to it.
- **Mandatory document sets**: each command has a fixed minimum set of
  documents it must produce. The next command cannot run until all
  mandatory documents of the previous layer exist and are complete.
- **Layer dependency with traceability**: each work item references an
  LLD module; each LLD module references an HLD component. The chain
  is always traceable.
- **Tree-structured interviews**: each command conducts an adaptive,
  branching interview. Questions deepen based on previous answers.
  No flat questionnaires. The agent IS the interviewer — it conducts
  the session conversationally using the command template as its script.
- **Reflection always active**: every document produced by a command
  is critiqued against explicit quality criteria before being written
  to disk.
- **Human-in-the-loop at every gate**: no document is finalised without
  the developer confirming it. The tool prints the file path and waits
  for explicit confirmation before proceeding.
- **Recovery for existing repos**: if a precondition fails, the tool
  scans the existing repo at the appropriate depth, drafts the missing
  document, and presents it for review before resuming.
- **opencode primary, agent-agnostic documents**: all output is plain
  markdown. Compatible with opencode, Claude Code, Cursor, Aider, or
  any agent that reads files.
- **Local-first sync**: primer is a personal tool. The developer's team
  does not need to know it exists. Sync state is local and gitignored.

---

## 2. Architecture: dual-layer design

`primer` is composed of two layers that work together. Understand the
distinction before implementing anything.

### Layer 1 — Custom commands (`.opencode/commands/*.md`)

Commands are **prompt templates**. They are markdown files that opencode
injects into the conversation when the developer types `/primer-<name>`.
The agent reads the template and conducts the interview, writes files,
and runs checks — all using its existing built-in tools plus the custom
tools exposed by Layer 2.

Commands contain:
- The interview tree (questions, branches, conditions)
- The document structure to produce
- The reflection criteria to apply before writing
- Instructions to call plugin tools for validation and writing

Commands do **not** contain code. They are pure prompt templates.

### Layer 2 — Plugin (`.opencode/plugins/primer.ts`)

The plugin is a **TypeScript module** loaded by opencode at startup. It
exposes custom tools the agent can call from within commands, and hooks
that run automatically on lifecycle events.

The plugin handles everything that must be deterministic and cannot be
left to LLM judgement:
- Precondition validation (does `HLD.md` exist and is it complete?)
- Filesystem scanning for recovery (structured, typed evidence)
- Atomic file writing with confirmation gates
- Session-start drift detection (sync feature)
- Session compaction context injection

### Why both

Without commands, the plugin has tools but no structured workflow.
Without the plugin, commands work but are fragile — the agent might
skip a precondition check or write files non-atomically. The commands
call the plugin tools; the plugin never calls the commands.

---

## 3. Agentic design patterns

Implement each pattern where specified. Do not collapse them into
generic logic.

| Pattern | Where applied |
|---|---|
| **Prompt chaining** | Commands chain: each one's output is input context for the next |
| **Reflection / self-correction** | Every generated document is critiqued before writing |
| **Planning** | `/primer-hld`, `/primer-lld`, `/primer-workitems` decompose intent |
| **Tool use** | Plugin tools: `primer_validate`, `primer_scan`, `primer_write` |
| **Human-in-the-loop** | Confirmation gate after every document draft |
| **Multi-agent collaboration** | `/primer-lld` models designer+critic handoff in interview template |
| **Independent parallel agents** | `/primer-sprint` produces isolation contracts for concurrent sessions |
| **Knowledge retrieval** | Recovery flow reads existing code to reconstruct missing context |
| **Guardrails** | Precondition validation blocks commands when the layer below is incomplete |

---

## 4. Repository structure

```
primer/
├── .opencode/
│   ├── commands/
│   │   ├── primer-setup.md
│   │   ├── primer-hld.md
│   │   ├── primer-lld.md
│   │   ├── primer-workitems.md
│   │   ├── primer-skills.md
│   │   ├── primer-examples.md
│   │   ├── primer-sprint.md
│   │   └── primer-sync.md
│   └── plugins/
│       └── primer.ts          (entry — imports and wires src/ modules)
├── src/
│   ├── types.ts
│   ├── validator.ts
│   ├── scanner.ts
│   ├── writer.ts
│   └── sync.ts
├── docs/
│   ├── COMMANDS.md
│   ├── RECOVERY.md
│   └── SYNC.md
├── tests/
│   ├── fixtures/
│   │   ├── empty-repo/
│   │   ├── partial-repo/
│   │   └── full-repo/
│   ├── validator.test.ts
│   ├── scanner.test.ts
│   └── sync.test.ts
├── AGENTS.md
├── README.md
├── package.json          (for plugin dependencies: @opencode-ai/plugin, zod)
└── .gitignore
```

Note: `primer` dog-foods itself. Its own repo contains a valid
`AGENTS.md` written using the exact format it produces for other
projects.

---

## 5. Plugin specification (`primer.ts`)

### 5.1 Custom tools

The plugin exposes three tools the agent calls from within commands.

#### `primer_validate`

Checks preconditions before a command proceeds.

```typescript
// Input schema (Zod)
{
  command: z.enum([
    'primer-hld',
    'primer-lld',
    'primer-workitems',
    'primer-skills',
    'primer-examples',
    'primer-sprint',
    'primer-sync'
  ])
}

// Return type
{
  valid: boolean
  missing: Array<{
    path: string
    requiredBy: string
    recoverable: boolean
  }>
  incomplete: Array<{
    path: string
    section: string
    description: string
  }>
}
```

Validation rules per command:

> **Global precondition** (applies to every command except `primer-setup`):
> `.primer-state.json` exists. If missing, the agent should offer to run
> `primer-setup` first rather than abort.

| Command | Preconditions |
|---|---|
| `primer-hld` | `AGENTS.md` exists, `README.md` exists |
| `primer-lld` | `docs/HLD.md` exists + `## Vision`, `## Tech stack`, `## Architecture style` non-empty |
| `primer-workitems` | `docs/LLD.md` exists + all files listed in LLD module index exist + `AGENTS.md §Modules` non-empty |
| `primer-skills` | `docs/TASKS.md` exists + non-empty + `AGENTS.md §Tasks` non-empty |
| `primer-examples` | At least one `skills/<slug>.md` file exists (excluding `SKILL-INDEX.md`) |
| `primer-sprint` | `docs/TASKS.md` exists + at least one task marked `Parallelisable: yes` |
| `primer-sync` | (covered by global precondition) |

A document that exists but has all sections empty is **incomplete**,
not missing. Both states block the command. Both states are recoverable.

#### `primer_scan`

Reads the existing repo to gather evidence for recovery. Returns
structured evidence, never raw text.

```typescript
// Input schema
{
  depth: z.enum(['meta', 'structure', 'module']),
  moduleScope: z.string().optional() // for depth='module': HLD component name
}

// Return type
{
  projectName?: string
  projectDescription?: string
  languages: string[]
  frameworks: string[]
  topLevelModules: string[]
  interfaces: Array<{
    path: string
    name: string
    members: string[]
  }>
  existingDocs: string[]
  inferredArchStyle?: string
  packageManifest?: Record<string, unknown>
}
```

Scan depths:

**`meta`** — for missing setup docs:
- Read `AGENTS.md`, `README.md`, any `.md` in repo root
- Read `package.json`, `pyproject.toml`, `build.gradle`, `pom.xml`,
  `Cargo.toml`, `go.mod` (whichever exist)
- Read `/docs/` directory listing (filenames only)

**`structure`** — for missing HLD:
- Everything in `meta`
- Directory tree to depth 3 (folder names and file counts only)
- All files in `/docs/` (full content)
- Top-level source directory names
- For each top-level source dir: subdirectory names only
- Any interface/type definition files (`*.d.ts`, `*Types.ts`,
  `*Interface.scala`, `*.proto`)

**`module`** — for missing LLD (scoped to HLD context):
- Everything in `structure`
- For modules identified in HLD: read their source directories fully
- Public interface files in full
- One representative implementation file per module (largest by
  line count)
- Do not read test files unless no implementation files are found

#### `primer_write`

Atomic file write. The confirmation gate is enforced by the **command
template**, not by this tool — a plugin tool cannot block the agent loop
on terminal input. The template must present the draft in conversation
and obtain explicit approval before invoking `primer_write`.

```typescript
// Input schema
{
  path: z.string(),
  content: z.string(),
  overwrite: z.boolean().default(false) // required when file exists
}

// Behaviour
// 1. Create missing parent directories
// 2. If the destination exists and overwrite=false → return without
//    writing and include a unified diff in the response, so the agent
//    can show it to the developer and re-invoke with overwrite=true
// 3. Write atomically: temp file in the destination's parent directory
//    → rename (same filesystem, so rename is atomic)
// 4. Return the full relative path and whether an existing file was replaced

// Return type
{
  written: boolean
  path: string
  replaced: boolean   // true if an existing file was overwritten
  diff?: string       // present when written=false and a diff was generated
}
```

**Batching rule**: in normal command flow, the agent presents one draft,
waits for approval, then calls `primer_write` for that file. The
exception is `primer-setup`, where the four output files are all fixed
skeletons with no LLM-drafted content — they may be presented together
and written in a single batch after one approval.

### 5.2 Hooks

#### `session.created` — drift detection

Fires when the developer opens opencode on a project that has
`.primer-state.json`.

```typescript
event: async ({ event }) => {
  if (event.type !== 'session.created') return

  const state = readPrimerState()        // read .primer-state.json
  if (!state) return                     // primer not initialised, silent

  const changes = await gitLogSince(state.syncedAt)

  if (changes.commitCount > 100) {
    injectWarning(
      '⚠ primer: too many changes since last sync to analyse precisely. ' +
      'Run /primer-sync to reset the baseline.'
    )
    return
  }

  if (changes.sourceFilesChanged.length > 0) {
    injectWarning(
      `⚠ primer: source files changed since last sync ` +
      `(${state.syncedAt}, ~${state.headAtSync} on ${state.branchAtSync}). ` +
      `Consider running /primer-sync before starting work.`
    )
  }
}
```

Source paths for drift detection: everything except `docs/`, `skills/`,
`examples/`, `sprint/`, `.opencode/`, `.primer-state.json`, and files
matching `.agent-ignore` patterns.

The `~` prefix on the sha in the warning message signals "approximately"
— it is informational only and may be unreachable if the branch was
squashed or rebased after sync. This is expected and harmless.

#### `experimental.session.compacting` — context preservation

Fires before opencode compacts a long session. The `experimental.`
prefix indicates this hook is not yet a stable API — if opencode renames
or removes it, the compaction-preservation feature will silently
no-op. Acceptable risk; leave a TODO comment in the plugin pointing
back to this section.

```typescript
'experimental.session.compacting': async (input, output) => {
  const state = readPrimerState()
  if (!state) return

  const phase = detectCurrentPhase()  // read which primer docs exist

  output.context.push(`
## primer context (preserved across compaction)
Last sync: ${state.syncedAt} (~${state.headAtSync} on ${state.branchAtSync})
Completed phases: ${phase.completed.join(', ')}
Pending phases: ${phase.pending.join(', ')}
Current command in progress: ${phase.inProgress ?? 'none'}
  `)
}
```

### 5.3 Sync state file

`.primer-state.json` — local, gitignored, never committed.

```json
{
  "syncedAt": "2026-05-17T10:32:00Z",
  "headAtSync": "a3f9c12",
  "branchAtSync": "main"
}
```

Field contracts:

| Field | Role | Used for git ops? |
|---|---|---|
| `syncedAt` | **Authoritative** timestamp of last sync | Yes — `git log --since` |
| `headAtSync` | **Advisory** sha at time of sync | No — display only |
| `branchAtSync` | **Advisory** branch name at time of sync | No — display only |

`headAtSync` and `branchAtSync` may become stale or unreachable after
squash merges or rebases. This is expected. They are never passed to
any git command. If they diverge from reality, the warning message
remains correct because it relies exclusively on `syncedAt`.

The `gitLogSince` function uses:
```bash
git log --since="<syncedAt>" --name-only --pretty=format: -- <source-paths>
```

If `git log` returns more than 100 commits, the plugin switches to the
imprecise warning. This threshold is configurable in `opencode.json`:
```json
{ "primer": { "syncDriftThreshold": 100 } }
```

---

## 6. Command specifications

### 6.1 `/primer-setup`

**Preconditions**: none.

**Mandatory documents**:

| File | Description |
|---|---|
| `AGENTS.md` | Master context file — skeleton with all sections |
| `README.md` | Project readme — skeleton |
| `.agent-ignore` | Paths agents must never touch |
| `.primer-state.json` | Local sync state — gitignored |

**Interview**:
1. What is the project name?
2. One-line description?

These two answers seed `README.md` and `AGENTS.md`. No branching needed
at this stage.

**`AGENTS.md` skeleton** — all sections created empty, filled by
subsequent commands:

```markdown
# AGENTS.md

## Project overview
## Architecture
## Tech stack
## Modules
## Tasks
## Coding style
## Skills
## Examples
## Sprint rules
## Agent roles
## Constraints
## Non-goals
## Glossary
## References
```

**`.agent-ignore` default**:
```
.git/
node_modules/
dist/
build/
*.env
*.key
*.pem
secrets/
.primer-state.json
```

**`.primer-state.json` initial value**: use current `HEAD` sha if the
repo has commits; use `null` for `headAtSync` if not (no sentinel
string — `null` is unambiguous and easy to test for).
`syncedAt` is always the current UTC ISO timestamp.

**`.gitignore` update**: append `.primer-state.json` if not already
present.

---

### 6.2 `/primer-hld`

**Preconditions**: `AGENTS.md` exists, `README.md` exists.

**Mandatory documents**:

| File | Description |
|---|---|
| `docs/HLD.md` | Full high-level design |
| `docs/ADR/` | Directory; ≥1 ADR if tech decisions were made |
| `AGENTS.md` | `§ Architecture`, `§ Tech stack`, `§ Non-goals` filled |
| `README.md` | `## Overview` filled |

**Interview tree**:

```
Always asked:
  1. What is this project trying to achieve? (open text)
  2. Who are the primary users or consumers? (open text)
  3. What will this system explicitly NOT do? (non-goals, open text)
  4. What does success look like? (open text)

Branch: system type
  → Service / Library / CLI tool / Data pipeline / Other?
  If service:
    → Communication protocol? (REST / gRPC / GraphQL / events / other)
    → Sync or async primary model?
    → Expected scale?
  If library:
    → Languages/runtimes that consume it?
    → API surface: narrow+stable or broad+flexible?
  If CLI tool:
    → Interactive or scriptable?
    → Target OS?
  If data pipeline:
    → Batch or streaming?
    → Source and sink systems?

Branch: tech stack
  → Programming language(s)?
  For each language:
    → Key frameworks or runtimes?
    → Stylistic preferences? (e.g. functional vs OO)
  → Infrastructure: cloud / containerised / on-prem?
  → Persistence: database type and system?
  → Hard constraints on tech choices?

Branch: architecture style
  → Monolith / modular monolith / microservices / serverless / event-driven?
  If microservices or event-driven:
    → Service discovery?
    → Message broker?
    → How are boundaries defined?

Branch: quality attributes
  → Rank top 3: performance / reliability / security /
    maintainability / developer experience
  For each top attribute:
    → Specific threshold or requirement?

ADR trigger:
  → For each significant tech decision: "Should I record this as an ADR?"
  If yes → produce docs/ADR/NNNN-<slug>.md
```

**`docs/HLD.md` structure**:
```markdown
# High-level design

## Vision
## Goals
## Non-goals
## Users / consumers
## Success criteria
## System type
## Architecture style
## Tech stack
## Quality attributes
## Key constraints
## Open questions
## ADR index
```

**Reflection criteria** (apply before writing):
- Every goal has a corresponding success criterion
- Non-goals are explicit enough to prevent scope creep
- Tech stack is internally consistent (no conflicts)
- A coding agent reading only this document understands what to build
- No section is empty except `## Open questions`

---

### 6.3 `/primer-lld`

**Preconditions**: `docs/HLD.md` exists with non-empty `## Vision`,
`## Tech stack`, `## Architecture style`. `AGENTS.md §Architecture`
non-empty.

**Mandatory documents**:

| File | Description |
|---|---|
| `docs/LLD.md` | Module index and inter-module contracts |
| `docs/modules/<name>.md` | One per module identified |
| `docs/api-contracts/<name>.md` | One per public API surface (if applicable) |
| `docs/data-models/<name>.md` | One per significant data entity (if applicable) |
| `AGENTS.md §Modules` | Module list and ownership |

**Interview tree**:

```
Root:
  1. Read HLD.md. Propose the top-level components. Ask developer
     to confirm, rename, add, or remove.

For each confirmed module:
  → Single responsibility of this module?
  → Input?
  → Output?
  → Dependencies on other modules?
  → Public interfaces (functions, endpoints, events)?

Branch per module — if it exposes an API:
  If REST:
    → Endpoints: method, path, request/response shape
  If events:
    → Event names, producers, consumers, payload shape
  If library:
    → Public functions/classes with signatures

Branch per module — if it owns data:
  → Entities owned?
  For each entity:
    → Fields, types, key constraints, relationships

Branch: cross-cutting concerns
  → Authentication/authorisation approach?
  → Error propagation across module boundaries?
  → Logging and observability strategy?
  → Configuration injection?

Designer+critic pass (multi-agent collaboration pattern):
  After drafting each module spec, evaluate as critic:
  - Is the boundary clean? (single responsibility)
  - Are all dependencies explicit and directional (no cycles)?
  - Is the public interface minimal?
  - Could a coding agent implement this module without reading
    any other module spec?
  Revise before presenting to developer.
```

**`docs/modules/<name>.md` structure**:
```markdown
# Module: <name>

## Responsibility
## HLD reference
## Inputs
## Outputs
## Public interface
## Dependencies (upstream)
## Dependents (downstream)
## Data owned
## Error handling contract
## Open questions
```

---

### 6.4 `/primer-workitems`

**Preconditions**: `docs/LLD.md` exists and non-empty. All module files
listed in `docs/LLD.md` exist. `AGENTS.md §Modules` non-empty.

**Mandatory documents**:

| File | Description |
|---|---|
| `docs/TASKS.md` | Master task list |
| `docs/DEPENDENCY-GRAPH.md` | Task dependency graph (mermaid) |
| `AGENTS.md §Tasks` | Task summary and sprint rules |

**Task structure** — every task must have all fields:

```markdown
## TASK-<NNN>: <title>

**Status**: todo
**LLD module**: [<module-name>](../modules/<name>.md)
**HLD component**: [<component>](../HLD.md#section)
**Estimated complexity**: XS / S / M / L / XL
**Parallelisable**: yes / no
**Depends on**: TASK-NNN, TASK-NNN (or "none")
**Acceptance criteria**:
  - [ ] criterion one
  - [ ] criterion two
**Agent notes**: <constraints the coding agent must know before starting>
**Files likely touched**: <list of paths>
```

Complexity definitions (shown to developer during interview):
- XS = < 2 hours
- S = half day
- M = 1 day
- L = 2–3 days
- XL = needs splitting before implementation

**Interview tree**:

```
Root:
  1. Read all docs/modules/*.md. Propose a task breakdown per module.
     Ask developer to confirm, split, merge, or add tasks.

For each confirmed task:
  → Independent of all others, or depends on another task?
  → Complexity (XS/S/M/L/XL)?
  → Files this task will likely touch?
  → What must be true for this task to be done?

After all tasks:
  → Build dependency graph
  → Flag tasks with no dependencies and no dependents as candidates
    for parallelisation
  → Ask developer to confirm which are truly parallelisable
```

---

### 6.5 `/primer-skills`

**Preconditions**: `docs/TASKS.md` exists and non-empty.
`AGENTS.md §Tasks` non-empty.

**Mandatory documents**:

| File | Description |
|---|---|
| `skills/SKILL-INDEX.md` | Index with one-line descriptions |
| `skills/<tech-slug>.md` | One per technology or concern identified |
| `AGENTS.md §Skills` | Skill index reference |
| `AGENTS.md §Coding style` | Summary of style decisions |

**Behaviour**: the agent reads ALL existing context documents before
asking a single question. It builds a complete picture of the tech stack
and task types, then asks targeted, specific questions — never generic
ones.

Example questions (not exhaustive — derive from actual tech stack):
- "Your stack includes Scala. Do you want agents to use idiomatic
  functional style (cats, `IO` monad, for-comprehensions) or a more
  explicit Java-similar style?"
- "Your architecture uses event-driven messaging. Should agents prefer
  fire-and-forget or request-reply patterns by default?"
- "You have REST APIs. Should agents follow REST strictly (status codes,
  resource naming) or is RPC-over-HTTP acceptable?"
- "Your project uses PostgreSQL. Raw SQL, query builder, or ORM?"

**`skills/<tech-slug>.md` structure**:
```markdown
# Skill: <technology or concern>

## Context
## Conventions
## Rationale
## Examples reference
## Anti-patterns
```

---

### 6.6 `/primer-examples`

**Preconditions**: at least one `skills/<slug>.md` exists (excluding
`SKILL-INDEX.md`).

**Mandatory documents** (per skill):

| File | Description |
|---|---|
| `examples/<skill-slug>/good.md` | Correct, preferred implementation |
| `examples/<skill-slug>/bad.md` | Incorrect or discouraged implementation |
| `examples/<skill-slug>/RATIONALE.md` | Why good is good, why bad is bad |

**Behaviour**: for each skill file, the agent generates a pair of
examples derived directly from that skill's conventions and
anti-patterns. Reflection pass before presenting each pair:
- Does the good example follow every convention in the skill?
- Does the bad example violate at least one anti-pattern clearly?
- Is the rationale precise enough for an agent to self-evaluate?

Developer reviews and confirms each pair before the next is produced.

**`examples/<skill>/RATIONALE.md` structure**:
```markdown
# Rationale: <skill name>

## Why the good example is correct
## Why the bad example is wrong
## What to check before committing
```

---

### 6.7 `/primer-sprint`

**Preconditions**: `docs/TASKS.md` exists. Developer must explicitly
select which tasks to include — no auto-selection.

**Mandatory documents** (per selected task):

| File | Description |
|---|---|
| `sprint/<task-id>/CONTEXT.md` | Full context bundle for this task |
| `sprint/<task-id>/ISOLATION.md` | Files this agent owns; files it must not touch |
| `sprint/<task-id>/MERGE.md` | Integration instructions |

**Behaviour**:
1. Show tasks marked `Parallelisable: yes`
2. Ask developer which to include in this sprint
3. For each selected task, assemble context from: task spec, its LLD
   module doc, its HLD component section, and relevant skill files

**`ISOLATION.md` must list**:
- Files this agent may create or modify
- Files this agent must never touch (other sprint tasks' territory)
- Shared interfaces it may read but not change

**`MERGE.md` must specify**:
- What the agent should produce as a deliverable
- How conflicts with other sprint tasks should be surfaced (not resolved
  automatically)

---

### 6.8 `/primer-sync`

**Preconditions**: `.primer-state.json` exists.

**Purpose**: detect which primer documents are stale relative to source
changes since the last sync, update them one by one with confirmation
gates, and reset the sync baseline.

**Behaviour**:

1. Run `git log --since="<syncedAt>" --name-only --pretty=format:`
   on source paths (everything except docs, skills, examples, sprint,
   .opencode)
2. Group changed source files by which primer document they affect:
   - Changes in a module's source dir → that module's `docs/modules/<name>.md`
     and potentially `docs/LLD.md`
   - New top-level directories → potentially `docs/HLD.md`
   - Changes to interfaces/types → `docs/api-contracts/` or
     `docs/data-models/`
3. Present the developer with the list of potentially stale documents
   and the source files that triggered each one
4. For each stale document, in dependency order (HLD before LLD before
   TASKS):
   a. Call `primer_scan` at the appropriate depth
   b. Draft an updated version of the document
   c. Run reflection pass
   d. Call `primer_write` with `confirmationRequired: true`
   e. Wait for developer confirmation before proceeding to next
5. After all documents are updated and confirmed, write new
   `.primer-state.json`:
   ```json
   {
     "syncedAt": "<current UTC ISO timestamp>",
     "headAtSync": "<current HEAD sha>",
     "branchAtSync": "<current branch name>"
   }
   ```
6. Note in the session: `headAtSync` and `branchAtSync` are advisory
   only. If this branch is later squashed or rebased, these values will
   diverge. That is expected — `syncedAt` is the only authoritative
   field.

**Cross-branch behaviour**: `syncedAt` is a timestamp, not a ref. If the
developer last synced on branch A and now runs `/primer-sync` on branch
B, `git log --since` will report commits on B since that timestamp,
which may be unrelated to the documents primer wrote. This is acceptable
for a personal tool — primer is not branch-aware. The drift warning
should mention `branchAtSync` so the developer can spot the mismatch.

---

## 7. Recovery flow

Recovery runs when `primer_validate` returns `valid: false`. It applies
to any command, not just `/primer-sync`.

### Recovery protocol

For each missing or incomplete document, in dependency order:

1. Present the developer with a clear list of what is missing and why
2. For each document:
   a. Call `primer_scan` at the appropriate depth
   b. Draft the missing document from scanned evidence
   c. Run reflection pass
   d. Call `primer_write` — print path, wait for confirmation
   e. After confirmation, proceed to next missing document

Recovery is **step-by-step for LLM-drafted documents**. Each
substantively drafted document gets its own review gate. The setup
skeletons (`AGENTS.md`, `README.md`, `.agent-ignore`,
`.primer-state.json`) are the one exception — fixed templates with no
generated content may be presented as a group and written in a single
batch after one approval.

### Scan depth per missing document

| Missing document | Scan depth |
|---|---|
| `AGENTS.md`, `README.md` | `meta` |
| `docs/HLD.md` | `structure` |
| `docs/LLD.md` | `structure` + `module` for each inferred component |
| `docs/modules/<name>.md` | `module` scoped to that component |
| `docs/TASKS.md` | Reads all module docs (already present) |
| `skills/*.md` | Reads HLD + LLD + TASKS (already present) |

### Partial documents

If a document exists but is missing mandatory sections: **regenerate the
whole document**, not just the missing sections. Present the full
regenerated version for review.

---

## 8. `AGENTS.md` — primer's own dog-fooding

`primer` must include its own `AGENTS.md`, written using the exact
format it produces for other projects. An agent contributing to
`primer` reads this file first.

Required sections and content:

**§ Project overview**: `primer` is an opencode plugin + command set
that initialises repos for coding-agent productivity. It produces
documents only — never code.

**§ Architecture**: dual-layer — commands (`.opencode/commands/*.md`)
are prompt templates; plugin (`.opencode/plugins/primer.ts`) provides
`primer_validate`, `primer_scan`, `primer_write` tools and lifecycle
hooks.

**§ Tech stack**: TypeScript, Bun runtime, `@opencode-ai/plugin`, Zod.
No build step — opencode loads TypeScript directly.

**§ Modules**:
- `primer.ts` — plugin entry point, hook registration, tool registration
- `validator.ts` — precondition checking logic
- `scanner.ts` — repo scanning at three depths
- `writer.ts` — atomic file write
- `sync.ts` — drift detection, git log, state file management
- `commands/*.md` — one per primer command

Reflection is intentionally **not** a separate module. It is an
LLM-judged step expressed directly in each command template's "before
writing" section. Putting it in a TS file would either be untestable
(if it calls an LLM) or redundant (if it's just a checklist that the
template already states).

**§ Coding style**: TypeScript strict mode. No `any`. Throwing is fine
for genuine programmer errors and unexpected I/O failures — propagate
to opencode's error surface. Reserve typed result objects for the
plugin's tool return types (where the agent needs to act on
`missing`/`incomplete`/`replaced` etc. structurally). Functional where
it simplifies; classes only where state is genuinely needed.

**§ Constraints**:
- The plugin must not write code for the developer's project (it only
  writes documents under `docs/`, `skills/`, `examples/`, `sprint/`,
  plus `AGENTS.md`, `README.md`, `.agent-ignore`, `.primer-state.json`,
  and an append to `.gitignore`). The host agent obviously does make
  LLM calls — this constraint applies to the plugin code only.
- Must not auto-select tasks for sprint — developer chooses explicitly
- The command template must obtain developer approval before any
  `primer_write` call (the tool itself does not prompt)
- `.primer-state.json` must always be gitignored and written only by
  `primer_write` (via `primer-setup` and `primer-sync`)

**§ Non-goals**: no GUI, no cloud sync, no multi-language output, no
automatic translation to other agent formats, no team-facing features.

---

## 9. Testing

Write tests for the plugin's TypeScript modules only. Do not test
command markdown files directly.

**Test files**:
- `tests/validator.test.ts` — all validators with fixtures for
  valid / invalid / incomplete states
- `tests/scanner.test.ts` — all three scan depths with mock filesystem
- `tests/sync.test.ts` — drift detection, threshold behaviour,
  state file read/write, sha-advisory-only contract

**Fixtures** (`tests/fixtures/`):
- `empty-repo/` — no files at all
- `partial-repo/` — `AGENTS.md` and `README.md` only
- `full-repo/` — all primer documents present and complete

Use Bun's built-in test runner (`bun test`). No additional test
framework needed.

**Sync test cases to cover**:
- `syncedAt` is recent, no source changes → no warning injected
- `syncedAt` is recent, source files changed → warning injected
- `syncedAt` is old, > 100 commits → imprecise warning injected
- `headAtSync` is an unreachable sha → no error, advisory only
- `.primer-state.json` missing → no warning, no error, silent
- Repo has no commits yet (`headAtSync: "init"`) → no git diff attempted

---

## 10. Implementation order

Implement in this exact order. Do not skip ahead.

1. `package.json` — name, version, dependencies
   (`@opencode-ai/plugin`, `zod`), devDependencies (`bun-types`)
2. `src/types.ts` — shared TypeScript types
3. `src/validator.ts` + `tests/validator.test.ts`
4. `src/scanner.ts` + `tests/scanner.test.ts`
5. `src/writer.ts`
6. `src/sync.ts` + `tests/sync.test.ts`
7. `.opencode/plugins/primer.ts` — assembles all modules, registers
   tools and hooks
8. `.opencode/commands/primer-setup.md`
9. `.opencode/commands/primer-hld.md`
10. `.opencode/commands/primer-lld.md`
11. `.opencode/commands/primer-workitems.md`
12. `.opencode/commands/primer-skills.md`
13. `.opencode/commands/primer-examples.md`
14. `.opencode/commands/primer-sprint.md`
15. `.opencode/commands/primer-sync.md`
16. `AGENTS.md` — primer's own, dog-fooded
17. `README.md`
18. `docs/COMMANDS.md`, `docs/RECOVERY.md`, `docs/SYNC.md`

---

## 11. Quality gates

Before considering the project complete:

- `bun test` passes with all tests green
- `/primer-setup` run in an empty directory produces `AGENTS.md`,
  `README.md`, `.agent-ignore`, `.primer-state.json` (and adds it to
  `.gitignore`)
- `/primer-hld` run after setup conducts a complete interview and
  produces `docs/HLD.md` with all sections filled
- `/primer-lld` run in a directory missing `docs/HLD.md` triggers
  recovery, not abort
- `/primer-sync` run with a `.primer-state.json` pointing to a
  non-existent sha does not crash — it uses `syncedAt` for git ops
  and displays `headAtSync` as advisory only
- `session.created` hook fires silently when no drift is detected
- `session.created` hook injects exactly one warning when source drift
  is detected
- `primer` repo itself contains a valid, complete `AGENTS.md` written
  in the format it produces for other projects

---

## 12. What to do first

Read this entire document. Then implement in the order given in
section 10. When in doubt about a decision, re-read the relevant
section — every choice here was deliberate. Do not introduce
abstractions not specified here.

---

*Brief v3 — produced from a brainstorming session between the developer
and Claude. Grounded in Agentic Design Patterns by Antonio Gulli.
Primary target: opencode. All documents are plain markdown, compatible
with any agent that reads files. Sync feature is local-only and
intentionally invisible to teammates.*

---

## Changes since v2

**Inconsistency fixes**
- §4 repo tree now includes `src/` (was implied by §10 but missing from the tree).
- `.opencode/plugins/primer.ts` reframed as the entry point that wires `src/` modules.
- `primer-examples` precondition tightened to exclude `SKILL-INDEX.md` from the glob (§5.1 table and §6.6).
- `primer_write` confirmation gate moved out of the tool and into the command template — a plugin tool cannot block the agent loop on terminal input. The tool now takes an `overwrite` flag and returns a diff when the target exists. The `confirmationRequired` field is removed.
- Added a global precondition that every command except `primer-setup` requires `.primer-state.json`; if missing, the agent should offer to run `primer-setup` rather than abort. Per-row preconditions in the validation table no longer need to repeat this.

**Relaxations (personal greenfield project)**
- Dropped `src/reflection.ts` as a separate module. Reflection is LLM-judged and lives in the command templates' "before writing" sections. A TS module would either be untestable (if it calls an LLM) or redundant.
- Coding style: throwing is fine for genuine programmer errors and unexpected I/O. The previous `Result<T, E>`-everywhere rule is reserved for plugin tool return shapes the agent needs to inspect.
- `headAtSync` sentinel changed from the string `"init"` to `null` — simpler to test, no ambiguity with a real sha.
- Setup's four skeleton files (`AGENTS.md`, `README.md`, `.agent-ignore`, `.primer-state.json`) may be written in a single batch after one approval. The "never batch" rule still applies to LLM-drafted documents (HLD, LLD, tasks, skills, examples, sprint).

**Clarifications added**
- `experimental.session.compacting` flagged as a non-stable opencode API; acceptable risk for a personal tool, but leave a TODO comment pointing here.
- Cross-branch `/primer-sync` behaviour explained: `syncedAt` is a timestamp, not a ref. The drift warning should surface `branchAtSync` so the developer can spot mismatches.
- Atomic write detail: temp file goes in the destination's parent directory so `rename` is atomic on the same filesystem.
