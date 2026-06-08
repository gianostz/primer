---
description: Initialise a repo with the primer skeleton (AGENTS.md, README.md, .agent-ignore, .primer-state.json).
---

# /primer-setup

You are conducting the **setup** phase of primer. You produce four files and do
not write code. The recovery guide `docs/RECOVERY.md` ships with the install
(`scripts/install.sh`); Step 6 only verifies it is present.

## Preconditions

None. This command bootstraps a new primer-managed repo. It is also safe to
re-run on a repo that already has any of the four outputs — the goal in that
case is to **augment**, not replace.

## How to call `primer_write`

Always pass **repo-relative paths** to `primer_write` (e.g. `AGENTS.md`, not
`/home/you/project/AGENTS.md`). The plugin resolves paths against the repo
root; passing an absolute path that happens to live inside the repo is
tolerated, but absolute paths outside the repo will be rejected.

## Step 1 — Ingest existing content

Before anything else, read every file you might overwrite, using your own
file-read tool (not `primer_write`). Their content is **authoritative input**:
your job for this phase is to preserve it, not to discard or rewrite it.

Read, if present:

- `README.md`
- `AGENTS.md`
- `.agent-ignore`
- `.gitignore`
- `package.json`

For each, record what you found. You will merge this into the drafts in
Step 3. Specifically:

- **`README.md`**: extract (a) the H1 title, (b) the first non-empty paragraph
  under the title (Overview seed), (c) **every H2 section** with its body
  verbatim. The template-mandated H2s are `## Overview`, `## Getting started`,
  `## License`; every other H2 is **user-authored** and must survive into the
  draft unchanged.
- **`AGENTS.md`**: for every one of the 13 sections listed in the template
  below, copy the existing section body **verbatim** into the corresponding
  section of the draft if it has non-empty content. Empty sections in the
  existing file stay empty.
- **`.agent-ignore`** and **`.gitignore`**: existing entries are never
  dropped. The template's entries are a **minimum** — union them with what's
  already there, deduplicating exact matches.
- **`package.json`**: if it provides `name` or `description`, those values
  win over asking the developer.

## Step 2 — Interview (fill only the gaps)

Ask the developer **only** for information you could not recover in Step 1:

1. **Project name** — skip if found in `package.json#name` or as the H1 of an
   existing `README.md`. **But if both are present and they disagree** (e.g.
   `package.json#name` is `todo-api-flask` while the README H1 is
   `Flask: a famous python web framework`), do **not** silently pick one —
   surface the divergence to the developer and ask which is authoritative. Use
   their answer for both the README H1 and `AGENTS.md §Project overview`.
2. **One-line description** — skip if found in `package.json#description` or
   as the first non-empty paragraph under the README title. Otherwise ask.

Do not branch further. These two values (whether ingested or asked) seed
`README.md` and `AGENTS.md §Project overview` **only when those slots are
empty in the existing files**. Never overwrite an existing title or
description.

## Step 3 — Build the drafts

The templates below are **minimum structures**, not fixed skeletons. For each
file, start from the template and then merge in everything Step 1 recovered.

### AGENTS.md draft

Start with the 13-section structure below. For each section, if Step 1 found
non-empty content in the existing `AGENTS.md`, paste that content under the
heading verbatim. Otherwise leave the section body **empty** (later commands
will fill it) — never write placeholder filler such as `None`, `TBD`, or `N/A`.
An empty body costs a downstream agent nothing; a placeholder line is pure noise
it must read every session.

```markdown
# AGENTS.md

## Project overview
<one-line description — from package.json, existing AGENTS.md §Project overview, or interview>

## Architecture
## Tech stack
## Modules
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

### README.md draft

Start with the template below. Then append every user-authored H2 section
recovered in Step 1 (anything other than `## Overview`, `## Getting started`,
`## License`) **after `## Getting started` and before `## License`**, in
their original relative order, body verbatim.

If the existing README has non-empty content under `## Overview` or
`## Getting started`, keep that content; do not blank those sections.

```markdown
# <project name>

<one-line description>

## Overview

## Getting started

## License
```

### .agent-ignore draft

Union of three sources, in this order, deduplicating exact matches and
**never removing** an existing entry:

1. Everything the existing `.agent-ignore` already contained (preserve order).
2. The template minimum below.
3. **Stack-specific** entries derived from `primer_scan` (Step 1). Run
   `primer_scan({ depth: 'meta' })` and, for each detected language/framework,
   append its standard noise directories:

   | Detected | Append |
   |---|---|
   | Python | `__pycache__/`, `*.pyc`, `venv/`, `.venv/`, `.pytest_cache/` |
   | JavaScript/TypeScript | `node_modules/`, `dist/`, `.next/`, `coverage/` |
   | Rust | `target/` |
   | Go | `bin/` |
   | Java/Kotlin | `target/`, `build/`, `.gradle/` |

   Also append any **primer-introduced** artefacts that are *not* part of the
   detected project: if the project's primary language is **not**
   JavaScript/TypeScript but `package.json`/`tsconfig.json`/`bun.lock` exist
   (primer's own scaffolding), append `bun.lock` and `tsconfig.json`. `.opencode/`
   may optionally be appended if the developer does not want the plugin tracked.

Template minimum:

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

### .primer-state.json

Do **not** compose this file by hand. It is written by the `primer_state_write`
tool (see Step 6), which reads the timestamp from the environment and the HEAD
sha / branch from git. The model never supplies a timestamp or sha — handcrafted
values (e.g. millisecond-zero timestamps `…​.000Z`) are exactly the failure mode
this tool removes.

## Step 4 — Reflection (before presenting)

Verify, for every draft:

- Project name is non-empty and matches the README H1. If `package.json#name`
  and the README H1 disagreed, the developer was asked to resolve it (not chosen
  silently) and the chosen value is used consistently.
- One-line description appears in both `README.md` (under the title) and
  `AGENTS.md §Project overview`.
- **Every non-empty section** of the existing `AGENTS.md` is present in the
  draft with identical content.
- **Every user-authored H2** of the existing `README.md` is present in the
  draft with identical content, in its original relative order.
- `.agent-ignore` lists at minimum: `.git/`, `node_modules/`, `*.env`,
  `*.key`, `secrets/`, `.primer-state.json`.
- `.agent-ignore` includes the stack-specific noise entries for every language
  `primer_scan` detected (e.g. a Python project lists `venv/` and
  `__pycache__/`), and any primer-only scaffolding files that are not part of
  the project.
- No existing `.gitignore` or `.agent-ignore` entry has been removed.

If any check fails, fix the draft before continuing.

## Step 5 — Confirmation gate

Present all four drafts as a group and ask for a single approval. For each
file, **state explicitly** which of these three states applies:

- **Fresh** — the file did not exist; the draft is the template.
- **Merged** — the file existed; show a unified diff between the existing
  file and the draft, and frame the approval as *"approve these additions"*,
  not *"approve a rewrite"*.
- **Unchanged** — the existing file already satisfies the template; no
  write is needed. Skip it on the write pass.

Do not call `primer_write` until the developer approves.

## Step 6 — Write

After approval:

1. Call `primer_write` once per file that is **Fresh** or **Merged**, with
   repo-relative `path` and `overwrite: false`. If the tool returns a diff
   instead of writing (file already exists), present the diff to the
   developer and ask before re-calling with `overwrite: true`.
2. Ensure `.primer-state.json` is listed in `.gitignore`. `primer_write` is
   a full-file write, not an append. To preserve existing `.gitignore`
   content:
   a. Read the existing `.gitignore` with your own file-read tool
      (`.gitignore` is not a primer document).
   b. If a line equal to `.primer-state.json` (after trim) is already
      present, do nothing.
   c. Otherwise concatenate `<existing>\n.primer-state.json\n` (preserve a
      trailing newline) and call
      `primer_write({ path: '.gitignore', content, overwrite: true })`.
   d. If `.gitignore` does not exist, write a single-line file
      `.primer-state.json\n`.
3. Write the baseline by calling `primer_state_write` (no arguments). It
   composes and writes `.primer-state.json` from the environment timestamp and
   git HEAD/branch. Do **not** assemble that JSON yourself or pass it through
   `primer_write`.
4. **Verify `docs/RECOVERY.md` is present.** It ships with the install
   (`scripts/install.sh` copies it), so a normal install already has it. Check
   with your own file-read tool. If it is missing (e.g. a manual install that
   skipped it), tell the developer to copy it from the primer repo or re-run
   `scripts/install.sh` — do **not** hand-author it here.
5. Tell the developer that `/primer-hld` is the next command.
