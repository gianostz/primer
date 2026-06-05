---
description: For each skill, produce a good/bad/rationale triple so agents can self-evaluate concretely.
---

# /primer-examples

You produce **paired worked examples** for each skill — one good, one bad, one rationale. Examples are the concrete reference agents check their work against.

## Preconditions

Call `primer_validate({ command: 'primer-examples' })`.

Required: at least one `skills/<slug>.md` exists (excluding `SKILL-INDEX.md`).

If invalid, point the developer at `/primer-skills` first.

## Ingest existing content

Before drafting, read any existing files under `examples/<skill-slug>/` with
your own file-read tool — treat them as authoritative; the developer or a
previous run may have hand-tuned them.

- `examples/<skill-slug>/good.md`, `bad.md`, `RATIONALE.md`: if present and
  non-empty, only redraft when the referenced skill has changed materially
  since the example was written. If the triple still reflects the current
  skill, reuse verbatim and tell the developer "existing triple is up to
  date, skipping" instead of writing.

## Mandatory outputs (per skill)

| File | Description |
|---|---|
| `examples/<skill-slug>/good.md` | Correct, preferred implementation |
| `examples/<skill-slug>/bad.md` | Incorrect or discouraged implementation |
| `examples/<skill-slug>/RATIONALE.md` | Why good is good, why bad is bad |

## Behaviour rule

For each skill file:

1. Read it fully — `## Conventions` and `## Anti-patterns` drive the examples.
2. Produce a `good.md` that follows **every** convention in the skill.
3. Produce a `bad.md` that violates **at least one** anti-pattern visibly.
4. Produce a `RATIONALE.md` that names the specific conventions / anti-patterns by quoting them from the skill file.

## Reflection (apply to each triple before presenting)

- Does `good.md` follow every convention in the skill?
- Does `bad.md` violate at least one anti-pattern clearly?
- Is the rationale precise enough that a coding agent could pattern-match against it without re-reading the skill?

If any criterion fails, revise before presenting.

## examples/<skill>/RATIONALE.md structure

```markdown
# Rationale: <skill name>

## Why the good example is correct
<reference specific conventions from skills/<slug>.md>

## Why the bad example is wrong
<reference specific anti-patterns from skills/<slug>.md>

## What to check before committing
<short, actionable checklist>
```

## Confirmation gate

Walk through skills one at a time. For each:

1. Present the **triple together** (good + bad + rationale) — they only make sense paired.
2. State whether this is a fresh triple or a merge with existing files; for
   merges, frame the approval as "approve these additions / changes", not
   "approve a rewrite". If the existing triple is already up to date, skip
   the write entirely and report so.
3. Get one approval covering the triple.
4. Call `primer_write` three times for that skill.
5. Move to the next skill only after the current triple is on disk.
