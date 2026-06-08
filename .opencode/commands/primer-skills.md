---
description: Derive skill files from the actual tech stack, asking targeted questions only.
---

# /primer-skills

You are producing the **skills catalogue** — one file per technology or concern that coding agents need to handle correctly.

## Preconditions

Call `primer_validate({ command: 'primer-skills' })`.

Required: `docs/LLD.md` exists with a non-empty module index; every module file the LLD references exists; `AGENTS.md §Modules` non-empty.

If invalid, follow recovery (`docs/RECOVERY.md`).

## Ingest existing content

Beyond the upstream context (HLD, LLD, modules) read in the Behaviour
rule below, also read any existing version of the mandatory outputs with your
own file-read tool. Treat their content as authoritative; the interview
adjusts conventions, it does not reset them.

- `skills/<tech-slug>.md`: for every existing skill file, read it fully.
  Sections `## Conventions`, `## Rationale`, `## Anti-patterns` with content
  are authoritative. Ask the developer only when a section is empty or when
  upstream changes require new rules.
- `skills/SKILL-INDEX.md`: existing entries are preserved. New skills extend
  the index, never replace it.
- `AGENTS.md §Skills` and `§Coding style`: if already non-empty, treat as
  input for the cross-cutting summary.

## Mandatory outputs

| File | Description |
|---|---|
| `skills/SKILL-INDEX.md` | Index with one-line descriptions |
| `skills/<tech-slug>.md` | One per technology or concern identified |
| `AGENTS.md §Skills` | Skill index reference |
| `AGENTS.md §Coding style` | Summary of style decisions |

## Behaviour rule (critical)

Build a complete picture of the tech stack **before asking a single question**, but load context frugally — don't bulk-read the whole project:

1. Read `AGENTS.md`, `docs/HLD.md §Tech stack`, and the `docs/LLD.md` **module index** (the one-line responsibilities). This is enough to enumerate the technologies and concerns that need skills.
2. Read a full `docs/modules/<name>.md` only for a module a skill you are about to write actually targets — not every module preemptively.

Then ask **targeted, specific** questions. Never generic ones.

Bad: "Do you prefer functional or OO?"
Good: "Your stack includes Scala. Do you want agents to use idiomatic functional style (cats, `IO` monad, for-comprehensions) or a more explicit Java-similar style?"

## Question derivation

Derive questions from what you found. Some examples (not exhaustive):

- Scala detected → idiomatic FP vs Java-similar style?
- Event-driven architecture → fire-and-forget vs request-reply default?
- REST APIs → strict REST (status codes, resource naming) or RPC-over-HTTP acceptable?
- PostgreSQL → raw SQL, query builder, or ORM?
- TypeScript → strict null checks default; do you want branded types or plain interfaces for IDs?

For every distinct technology or concern in the stack, produce one skill file.

## skills/<tech-slug>.md structure

```markdown
# Skill: <technology or concern>

## Context
<which modules this applies to>

## Conventions
<specific rules an agent must follow>

## Rationale
<why these conventions, not alternatives>

## Examples reference
<pointer to examples/<slug>/ once /primer-examples has run>

## Anti-patterns
<patterns an agent must NOT use, with one-line reasons>
```

## skills/SKILL-INDEX.md structure

```markdown
# Skill index

- [<tech-slug>](<tech-slug>.md) — <one-line summary>
```

## Reflection criteria (apply before writing each file)

- Every skill maps to at least one module.
- Conventions are concrete enough that a coding agent can self-evaluate against them (no "follow best practices").
- Anti-patterns include at least one concrete example each.
- AGENTS.md §Coding style summarises the cross-cutting decisions (no `any`, error contract, etc.).
- Every non-empty section found during ingest (existing skill files,
  SKILL-INDEX, AGENTS §Skills / §Coding style) is reused verbatim where still
  applicable. No user-authored content has been deleted.

## Confirmation gate

One approval per skill file. For each file, state whether it is a fresh draft
or a merge with existing content; for merges, frame the approval as "approve
these additions / changes", not "approve a rewrite". After all skills are
approved, present the `SKILL-INDEX.md` and the `AGENTS.md` updates separately.
Call `primer_write` after each individual approval.
