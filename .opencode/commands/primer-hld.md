---
description: Conduct the high-level design interview and produce docs/HLD.md plus AGENTS.md updates and ADRs.
---

# /primer-hld

You are conducting the **high-level design** phase. The HLD is the source of truth for every downstream document.

## Preconditions

Call `primer_validate({ command: 'primer-hld' })` first.

Required: `AGENTS.md` and `README.md` exist. If either is missing or `.primer-state.json` is missing, **do not abort** — offer to run `/primer-setup` first.

If validation reports recoverable missing files, follow the recovery protocol in `docs/RECOVERY.md`: scan with `primer_scan({ depth: 'meta' })`, draft the missing skeletons, present them, then resume.

## Ingest existing content

Before the interview, read any existing version of the mandatory outputs with
your own file-read tool (not `primer_write`). Their content is authoritative
input alongside the user's answers and the scan — augment it, never discard it.

- `docs/HLD.md`: if present, every non-empty H2 section is authoritative.
  Reuse the text verbatim and let the interview only fill gaps. User-authored
  sections outside the template structure (e.g. `## Risks`, `## Glossary`)
  must be preserved at the end of the file.
- `AGENTS.md`: sections this command owns (`## Architecture`, `## Tech stack`,
  `## Non-goals`) — if already non-empty, treat as input to the interview, not
  as a target to overwrite.
- `README.md` `## Overview`: distinguish **non-empty** from **relevant**. Keep
  the existing Overview only if it actually describes *this project's* purpose
  as captured by the Vision. If it holds content inherited from setup or another
  template that does not pertain to the project — e.g. a leftover HTTP-methods
  table, boilerplate, or a description of a different system — treat the section
  as needing synthesis: write a fresh Overview **derived from `## Vision`** and
  present it as a change for approval. "Has text" is not the same as "is right".
- `docs/ADR/`: enumerate existing ADRs. New ADRs must use the next available
  `NNNN` index, never collide with existing ones, and never overwrite them.

## Ground the as-is sections in real evidence (fidelity guardrail)

The HLD captures intent, but its `## Tech stack`, `## Architecture style`, and
`## System type` sections describe something that may already exist in code.
Run `primer_scan({ depth: 'structure' })` and let the returned `languages`,
`frameworks`, `topLevelModules`, and `sourceFiles` (with symbols) anchor those
sections. Do not name a language, framework, or component the scan does not
support unless the developer states it as a deliberate future direction — and
if so, label it as such. Inventing an as-is stack here is what later poisons the
LLD.

## Mandatory outputs

| File | Description |
|---|---|
| `docs/HLD.md` | Full high-level design |
| `docs/ADR/NNNN-<slug>.md` | One ADR per significant tech decision |
| `AGENTS.md` | `§ Architecture`, `§ Tech stack`, `§ Non-goals` filled |
| `README.md` | `## Overview` filled |

## Interview tree

Conduct as a conversation, not a form. Deepen based on answers.

### Always asked
1. What is this project trying to achieve?
2. Who are the primary users or consumers?
3. What will this system explicitly NOT do? (non-goals)
4. What does success look like?

### Branch — system type
> Service / Library / CLI tool / Data pipeline / Other?

- **Service**: communication protocol (REST/gRPC/GraphQL/events/other)? Sync or async primary model? Expected scale?
- **Library**: languages/runtimes that consume it? API surface — narrow+stable or broad+flexible?
- **CLI tool**: interactive or scriptable? Target OS?
- **Data pipeline**: batch or streaming? Source and sink systems?

### Branch — tech stack
- Programming language(s)?
- For each language: key frameworks or runtimes? Stylistic preferences (functional vs OO)?
- Infrastructure: cloud / containerised / on-prem?
- Persistence: database type and system?
- Hard constraints on tech choices?

### Branch — architecture style
> Monolith / modular monolith / microservices / serverless / event-driven?

If microservices or event-driven: service discovery? Message broker? How are boundaries defined?

### Branch — quality attributes
Rank top 3: performance / reliability / security / maintainability / developer experience.

For each top attribute: specific threshold or requirement?

### ADR trigger
For each significant tech decision: ask **"Should I record this as an ADR?"** If yes, draft a `docs/ADR/NNNN-<slug>.md` and present it for approval alongside the HLD.

## docs/HLD.md structure

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

## ADR structure

```markdown
# ADR NNNN: <decision title>

## Status
Accepted on YYYY-MM-DD.

## Context
## Decision
## Consequences
## Alternatives considered
```

## Reflection criteria (apply before writing)

- Every goal has a corresponding success criterion.
- Non-goals are explicit enough to prevent scope creep.
- Tech stack is internally consistent (no conflicts).
- A coding agent reading only this document understands what to build.
- No section is empty except `## Open questions` (if there are none).
- Every non-empty section found during ingest (in existing HLD, AGENTS, or
  README §Overview) is reused verbatim where still applicable. No
  user-authored content has been deleted.

If any criterion fails, revise the draft before presenting.

## Confirmation gate

For each LLM-drafted file (HLD, each ADR, AGENTS update, README update):

1. Show the full draft to the developer.
2. State whether this is a fresh draft or a merge with existing content. For
   merges, frame the approval as "approve these additions / changes", not
   "approve a rewrite".
3. Ask explicitly: "Approve, revise, or skip?"
4. Only after approval, call `primer_write({ path, content, overwrite: <true if file exists> })`.
5. If `primer_write` returns `written: false` with a diff, show the diff and ask before re-invoking with `overwrite: true`.

Never batch LLM-drafted files into a single approval.
