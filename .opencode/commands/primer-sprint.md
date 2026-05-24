---
description: Assemble isolation contracts for parallel sessions, one bundle per developer-selected feature plan (or per parallelisable step within a plan).
---

# /primer-sprint

You produce **isolation contracts** so multiple coding-agent sessions can work in parallel without stepping on each other. The unit of parallelism is the feature plan (or a parallelisable step inside one).

## Preconditions

Call `primer_validate({ command: 'primer-sprint' })`.

Required: at least one `docs/plans/<slug>.md` containing a step marked `Parallelisable: yes`, or two or more feature plans whose `Files likely touched` lists do not overlap.

If invalid, send the developer back to `/primer-feature` to create or refine plans.

## Ingest existing content

Before drafting, read any existing files under `sprint/<slug>/` with your
own file-read tool. Treat their content as input.

- `sprint/<slug>/CONTEXT.md`, `ISOLATION.md`, `MERGE.md`: if present, a
  previous sprint already covered this plan / step. Confirm with the developer
  whether to refresh (re-running may invalidate work an agent has already
  started against those contracts) or skip. Default: skip and warn,
  do not overwrite without explicit confirmation.

## Critical rule: developer chooses

**Never auto-select.** Show the candidates and ask explicitly which to include in this sprint.

Candidates are:
- Whole feature plans whose `Files likely touched` set does not overlap with another candidate plan's.
- Individual steps within a plan that carry `Parallelisable: yes` and whose `Files likely touched` do not overlap with sibling steps you also intend to include.

## Mandatory outputs (per selected unit)

| File | Description |
|---|---|
| `sprint/<slug>/CONTEXT.md` | Full context bundle |
| `sprint/<slug>/ISOLATION.md` | Files this agent owns; files it must not touch |
| `sprint/<slug>/MERGE.md` | Integration instructions |

`<slug>` is the feature-plan slug if the unit is a whole plan, or `<plan-slug>--step-<n>` if the unit is a single step inside a plan.

## Flow

1. List all `docs/plans/*.md`. For each, extract: scope (HLD component, LLD modules), files-likely-touched set across the plan and per step, parallelisability marks.
2. Show the candidate list to the developer. Ask: "Which to include in this sprint?"
3. For each selected unit:
   a. Assemble its context from: the plan (or step), its LLD module doc(s), its HLD component section, the skills it lists as `Reused`.
   b. Compute its isolation contract: files it owns, files other selected units own, shared interfaces (read-only).
   c. Write the three files.

## sprint/<slug>/CONTEXT.md structure

```markdown
# Context for <feature title>[ — Step <n>: <step title>]

## Plan reference
`docs/plans/<plan-slug>.md`[ — Step <n>]

## Summary (from plan)
<copied from the plan's Summary section, or step-level summary if a step>

## Acceptance criteria
<copied — plan-level if a whole plan, step-level if a step>

## LLD module(s)
<copied / summarised from docs/modules/<name>.md for each module in scope>

## HLD component
<copied / summarised from the relevant docs/HLD.md section>

## Skills
<each reused skill, one section per — copied from skills/<slug>.md>

## Examples references
<paths to examples/<slug>/good.md and bad.md per reused skill>

## Architectural impact (from plan)
<copied verbatim — the implementing agent must know what /primer-sync will revisit>
```

## sprint/<slug>/ISOLATION.md structure

```markdown
# Isolation contract for <feature title>[ — Step <n>]

## Files this agent may create or modify
<list — from the plan/step's "Files likely touched">

## Files this agent must never touch
<list — files owned by other units in this sprint, plus the plan/step's explicit "Must not touch" entries>

## Shared interfaces (read-only)
<list of public interface files this agent depends on>

## Conflict handling
If you find you need to modify a "must never touch" file, **stop and surface the conflict to the developer**. Do not edit.
```

## sprint/<slug>/MERGE.md structure

```markdown
# Merge plan for <feature title>[ — Step <n>]

## Deliverable
<what the agent produces — code + tests + any docs>

## Integration order
<which other sprint units must merge first, if any>

## Conflict surfacing
If your changes conflict with another sprint unit's deliverable, report the conflict — do not resolve automatically.

## Acceptance verification
<how the developer will verify before merging>

## Post-merge
After all sprint units land, the developer runs `/primer-sync` to apply the architectural updates each plan's `Architectural impact` section flagged.
```

## Reflection (apply per bundle before presenting)

- `ISOLATION.md` files-touched lists do not overlap with any other selected unit's `Files this agent may create or modify`.
- `CONTEXT.md` contains everything the agent needs without further reading.
- `MERGE.md` is explicit about what NOT to do (no auto-resolve).
- The `Architectural impact` block in CONTEXT.md is copied verbatim from the source plan — no summarisation.

## Confirmation gate

For each selected unit, present the three files together as a bundle. State
whether this is a fresh bundle or a refresh of existing files; for refreshes,
frame the approval as "approve these additions / changes", not "approve a
rewrite", and warn that an agent may already be working against the previous
contracts. Get one approval, then call `primer_write` three times. Then move
to the next unit. Never batch across units.
