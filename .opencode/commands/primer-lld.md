---
description: Decompose the HLD into modules with explicit contracts and a designer+critic pass per module.
---

# /primer-lld

You are conducting the **low-level design** phase. You decompose the HLD into modules, each with a clean boundary, explicit dependencies, and a minimal public interface.

## Preconditions

Call `primer_validate({ command: 'primer-lld' })`.

Required: `docs/HLD.md` exists with non-empty `## Vision`, `## Tech stack`, `## Architecture style`; `AGENTS.md §Architecture` non-empty.

If invalid, follow recovery (`docs/RECOVERY.md`). For missing HLD, scan with `primer_scan({ depth: 'structure' })`, draft the HLD, get approval, then continue.

## Ingest existing content

Before the interview, read any existing version of the mandatory outputs with
your own file-read tool (not `primer_write`). Their content is authoritative
input alongside the HLD and the scan — augment it, never discard it.

- `docs/LLD.md`: if present, every non-empty H2 section is authoritative.
  Module index entries already listed must be preserved unless the developer
  explicitly removes a module during the interview.
- `docs/modules/<name>.md`: for every existing module file, read it fully.
  Use its content as the starting point for that module's interview; ask only
  about gaps. Sections with content stay verbatim.
- `docs/api-contracts/<name>.md` and `docs/data-models/<name>.md`: if present,
  treat as authoritative. The interview adjusts, never starts from scratch.
- `AGENTS.md §Modules`: if already non-empty, reuse as ownership input.

## Ground every claim in real code (fidelity guardrail)

The single worst LLD failure is **inventing** modules, functions, or error
behaviours the code does not contain — and producing three documents that
contradict each other about the same behaviour. Before drafting anything:

1. Call `primer_scan({ depth: 'structure' })` (and `{ depth: 'module', moduleScope: '<name>' }`
   for each component you intend to describe). Read the returned
   `sourceFiles` array: each entry pairs a real source/entrypoint file with the
   **symbols** actually defined in it (functions, classes, routes, exports).
2. For any module spec, **open the real source files** behind those symbols and
   describe the code **as it is** — names, signatures, and error codes must
   match what the file actually does. If `app.py` returns `abort(404)` for an
   unknown id, the module's error contract says 404 — not 400, not "throws".
3. If you want to recommend a decomposition **different from the current code**
   (e.g. splitting one file into three modules that don't exist yet), you may —
   but label it explicitly. Use a heading or inline tag **"Proposed (not yet in
   code)"** for anything aspirational, and keep it visually separate from the
   "as-is" description. Never present a target design as though it were the
   current reality.
4. If the scan yields no `sourceFiles` (truly empty repo), say so plainly and
   keep the design at the level the HLD justifies — do not manufacture detail.

## Mandatory outputs

| File | Description |
|---|---|
| `docs/LLD.md` | Module index and inter-module contracts |
| `docs/modules/<name>.md` | One per module identified |
| `docs/api-contracts/<name>.md` | One per public API surface (if applicable) |
| `docs/data-models/<name>.md` | One per significant data entity (if applicable) |
| `AGENTS.md §Modules` | Module list and ownership |

## Interview tree

### Root
1. Read `docs/HLD.md`. **Propose** the top-level components. Ask the developer to confirm, rename, add, or remove them. Do not invent modules the HLD does not justify.

### For each confirmed module
- Single responsibility of this module?
- Input?
- Output?
- Dependencies on other modules?
- Public interfaces (functions, endpoints, events)?

### Branch — module exposes an API
- **REST**: endpoints — method, path, request/response shape.
- **Events**: event names, producers, consumers, payload shape.
- **Library**: public functions/classes with signatures.

### Branch — module owns data
For each entity: fields, types, key constraints, relationships.

### Branch — cross-cutting concerns
- Authentication/authorisation approach?
- Error propagation across module boundaries?
- Logging and observability strategy?
- Configuration injection?

## Designer + critic pass

This is the **multi-agent collaboration pattern** instantiated in a single command. For every module spec you draft:

1. **As designer**: produce the spec.
2. **As critic**, evaluate:
   - Is the boundary clean (single responsibility)?
   - Are all dependencies explicit and directional (no cycles)?
   - Is the public interface minimal?
   - Could a coding agent implement this module without reading any other module spec?
3. Revise based on the critique before presenting to the developer.

State the critique to yourself in the conversation (one or two sentences) so the developer sees the reasoning, then present the revised spec.

## docs/modules/<name>.md structure

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

## docs/LLD.md structure

```markdown
# Low-level design

## Module index
- [<name>](modules/<name>.md) — <one-line responsibility>

## Inter-module contracts
<calls / events / shared types>

## Cross-cutting concerns
<auth, errors, logging, config>
```

## Reflection criteria (apply before writing each file)

- Every module references an HLD component by name.
- Dependency graph is acyclic.
- No two modules share the same responsibility.
- AGENTS.md §Modules lists every module with one-line ownership.
- Every non-empty section found during ingest (existing module files, LLD,
  api-contracts, data-models) is reused verbatim where still applicable. No
  user-authored content has been deleted.
- **Code fidelity** (per the guardrail above): every symbol, signature, and
  error code named exists in the scanned source; anything aspirational is
  labelled "Proposed (not yet in code)".
- **Cross-document consistency**: the same behaviour is described identically
  across `docs/modules/*`, `docs/api-contracts/*`, and the code. On divergence,
  record an `## Open question` rather than silently picking one.

## Confirmation gate

One approval per file. Do not batch. For each file, state whether it is a
fresh draft or a merge with existing content; for merges, frame the approval
as "approve these additions / changes", not "approve a rewrite". After each
module spec, present it, get approval, then call `primer_write`. Only after
every module is approved, write `docs/LLD.md` and update `AGENTS.md §Modules`
(with `overwrite: true`).
