---
description: Plan a single new feature against the existing design, producing a focused, ephemeral implementation plan.
---

# /primer-feature

You produce a **focused implementation plan** for one new feature on an existing primer-managed project. The plan is the agent's contract for the work; the developer deletes it once the feature is shipped.

This command does **not** populate any catalogue. It does not enumerate every task in the project. It plans exactly one feature, with the minimum context needed to implement it well.

## Preconditions

Call `primer_validate({ command: 'primer-feature' })`.

Required: `docs/HLD.md` exists; `docs/LLD.md` exists; every module file the LLD references exists; `AGENTS.md §Modules` non-empty.

If invalid, follow recovery (`docs/RECOVERY.md`).

## Context loading (critical — two phases)

The whole value of this command is keeping the agent's working context **focused** and **high-signal**. Do not bulk-load the project. Load in two steps:

### Phase A — before the interview
Read with your own file-read tool, in this order:
1. `AGENTS.md` — project meta and pointers.
2. `README.md` — surface-level orientation.

That's it. Do **not** read HLD, LLD, modules, skills, examples, or other plans yet — you do not know which feature this is about.

### Phase B — after the developer identifies the feature and target module(s)
Once the interview has established *which* feature and *which* module(s) it touches:
1. The specific section of `docs/HLD.md` for the affected component (not the whole file).
2. `docs/modules/<name>.md` for each module touched (only those).
3. For each skill the developer marks as "reuse": `skills/<slug>.md` and its `examples/<slug>/` if present.
4. Any `docs/api-contracts/*.md` or `docs/data-models/*.md` that the affected module depends on.

Do **not** read other module docs, other skills, or other plans. If the developer says the feature also touches an additional module mid-interview, load that module then — not preemptively.

## Mandatory output

| File | Description |
|---|---|
| `docs/plans/<feature-slug>.md` | The implementation plan for this feature |

`<feature-slug>` is kebab-case, derived from the feature title, unique within `docs/plans/`. If a plan with the same slug already exists, ask the developer whether to refresh it (warning: an agent may be implementing against the existing plan) or pick a new slug.

The plan is **ephemeral**: the developer is expected to delete it once the feature is implemented and any architectural updates have been applied. `/primer-sync` may surface it as drift if it lingers past implementation.

## Interview tree

### Phase 1 — feature identification
1. "What is the feature, in one sentence?"
2. "Which HLD component / LLD module(s) does it primarily touch?" (cross-check against `AGENTS.md §Modules` and the LLD module index)
3. "Is this a new capability, a behavioural change to existing code, or a refactor?"

### Phase 2 — load focused context (see "Context loading" above), then deep-dive
4. "Walk me through the user-visible outcome and the acceptance criteria."
5. "Which interfaces in the affected modules will change? Which stay stable?"
6. "Any cross-module impact: shared types, API contracts, data models?"

### Phase 3 — skills
Show the developer the existing `skills/SKILL-INDEX.md` (if it exists). Ask explicitly:
- "Which existing skills apply to this feature? (zero, one, or many)"
- "Do you need to create one or more new skills for this feature? (zero, one, or many)"
- "Or proceed with no skills at all?"

All three answers are valid. If new skills are needed, capture their proposed slug + one-line scope here; the developer runs `/primer-skills` after this command to flesh them out, then re-runs `/primer-feature` to incorporate the new skill references into the plan.

### Phase 4 — architectural impact assessment
Ask the developer, for each:
- "Does this feature require a new ADR? (capturing a non-trivial decision)"
- "Does it change an HLD-level assumption (vision, architecture style, tech stack, non-goals)?"
- "Does it change an LLD-level contract (module public interface, inter-module dependency, error contract)?"

Capture the answers in the plan's **Architectural impact** section. These are commitments to revisit in `/primer-sync` after implementation, not vague flags.

### Phase 5 — decomposition
Decompose the feature into ordered steps. Each step must have:
- A short title.
- Acceptance criteria (checkbox list).
- Files likely touched (paths).
- Any explicit "do not touch" boundaries (files owned by other in-flight work).

After the steps are confirmed, ask:
- "Are any steps parallelisable with each other?" — mark them `Parallelisable: yes` so `/primer-sprint` can pick them up.

## Plan structure

```markdown
# Plan: <feature title>

**Slug**: <feature-slug>
**Status**: planned | in-progress | implemented
**Created**: <YYYY-MM-DD>

## Summary
<one paragraph: what, for whom, why now>

## Scope
**HLD component(s)**: <link(s) into docs/HLD.md#section>
**LLD module(s)**: <link(s) to docs/modules/<name>.md>
**Type**: new capability | behavioural change | refactor

## Context loaded
<bulleted list of the exact files Phase B of context loading pulled in — this is the canonical "what the agent read" for traceability>

## Acceptance criteria
- [ ] criterion one
- [ ] criterion two

## Skills
**Reused**: <slugs, or "none">
**To create**: <slugs + one-line scope, or "none">
**No-skill rationale**: <fill only if both lists are empty — one line on why this feature does not need codified conventions>

## Architectural impact
**New ADR needed**: yes / no — <if yes, one-line topic>
**HLD changes**: yes / no — <if yes, which section(s)>
**LLD changes**: yes / no — <if yes, which module(s) and what kind of change>

## Steps

### Step 1: <title>
**Parallelisable**: yes / no
**Acceptance**:
  - [ ] ...
**Files likely touched**: <paths>
**Must not touch**: <paths, or "none">
**Notes**: <constraints the coding agent must know>

### Step 2: <title>
...

## Post-implementation
1. Mark `Status: implemented`.
2. Run `/primer-sync` — it will detect source drift and walk the developer through any ADR / HLD / LLD / module / api-contract / data-model updates flagged in **Architectural impact** above.
3. Delete this plan file once the sync is complete and the feature is verified.
```

## Reflection criteria (apply before presenting)

- Every step has every field populated.
- `Scope` links resolve to real files (HLD section, module docs).
- `Context loaded` lists exactly the files Phase B read — nothing more, nothing less.
- `Skills` is internally consistent: either at least one of Reused/To create is non-empty, or `No-skill rationale` is non-empty. Never all three empty.
- `Architectural impact` has explicit yes/no per question — never blank.
- No step's `Files likely touched` overlaps with another step's that is also marked `Parallelisable: yes`.
- The plan can be read standalone by an implementing agent — no "see the chat" handwaves.

## Confirmation gate

One approval for the whole plan (it is a single file). Present the draft, await "approve / revise / skip". On approval, call `primer_write({ path: 'docs/plans/<slug>.md', content, overwrite: false })`. If `primer_write` returns a diff because the file already exists, surface the diff and re-prompt before calling again with `overwrite: true` — refreshing a plan can invalidate work an agent has already started against it.

After writing, remind the developer:
- The plan is the contract for the implementing agent — start implementation by reading it.
- When done, mark `Status: implemented` and run `/primer-sync`, then delete the plan.
