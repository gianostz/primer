# Getting started with primer

This is the install-and-first-session guide. For per-command details, see [COMMANDS.md](COMMANDS.md). For the recovery flow when a precondition fails, see [RECOVERY.md](RECOVERY.md). For drift detection and `/primer-sync`, see [SYNC.md](SYNC.md).

## What primer is, in one sentence

`primer` is an opencode plugin and a set of `/primer-<phase>` slash commands that interview the developer and produce the markdown context documents coding agents read before they write code. It writes documents only; it never writes code in your repo.

## Prerequisites

| Tool | Why | Verify |
|---|---|---|
| **[Bun](https://bun.sh/)** ≥ 1.3 | opencode loads TypeScript through Bun's runtime; tests run via `bun test`. | `bun --version` |
| **[opencode](https://opencode.ai/)** (any recent build supporting the `Plugin` API) | Loads `.opencode/plugins/primer.ts` and surfaces `/primer-*` slash commands. | `opencode --version` |
| **git** | Drift detection runs `git log` (a `<headAtSync>..HEAD` range, or `--since` as fallback). Optional in a brand-new repo, but recommended. | `git --version` |

primer is tested on Linux. macOS should work the same. Windows is partially supported — the best-effort directory `fsync` after atomic write is silently skipped on platforms that don't allow it.

## Install

Four viable strategies. Pick one. (A) is the recommended path — the manual options exist for people who want to hack on primer itself or pin it as a submodule.

### A. Automated install (recommended)

From a checkout of this repo:

```bash
./scripts/install.sh /path/to/your-project
```

The script:

- verifies `bun` is on PATH (hard fail) and `opencode` is on PATH (warning),
- copies `.opencode/`, `src/`, `docs/RECOVERY.md`, and `tsconfig.json` (the last only if your project doesn't already have one),
- creates a minimal `package.json` in the target if one is missing,
- runs `bun add @opencode-ai/plugin zod@^4.1.0`,
- appends every path it touched to `.git/info/exclude` in the target so primer's machinery stays out of your project's `git status`. The script prints the exact list of paths it excluded.

`.git/info/exclude` is the right place for this because it's local-only — primer is per-developer tooling, not project source, and shouldn't propagate through `.gitignore` to everyone who clones the repo. If the target isn't a git repository, the script warns and prints the paths you should exclude manually after `git init`.

It is safe to re-run: existing files are left in place rather than overwritten, `bun add` is idempotent, and entries already present in `.git/info/exclude` aren't duplicated. If `src/` already exists in your project, primer's source files are merged in file-by-file and collisions are reported but not overwritten.

### B. Manual copy

```bash
cd <your-project>
cp -R /path/to/primer/.opencode .
cp -R /path/to/primer/src .
mkdir -p docs && cp /path/to/primer/docs/RECOVERY.md docs/  # primer's operating manual
cp /path/to/primer/package.json .   # if your project is plain JS/TS
cp /path/to/primer/tsconfig.json .  # only if you have no tsconfig yet
bun install
```

If your project already has a `package.json`, merge primer's `dependencies` instead of overwriting:

```jsonc
{
  "dependencies": {
    "@opencode-ai/plugin": "latest",
    "zod": "^4.1.0"
  }
}
```

Then keep primer's machinery out of `git status` by appending the paths you just created to `.git/info/exclude`:

```bash
cat >> .git/info/exclude <<'EOF'

# primer
.opencode/
src/scanner.ts
src/sync.ts
src/types.ts
src/validator.ts
src/writer.ts
node_modules/
bun.lock
# add package.json and tsconfig.json here too if you just created them
EOF
```

(The automated script in option A does this for you.)

### C. Symlink (best for hacking on primer itself)

> **Prerequisite:** your target project must already contain a `package.json`. If it doesn't, run `bun init -y` first (or use the script in option A, which handles this for you). `bun install` will fail with no manifest.

```bash
cd <your-project>
ln -s /path/to/primer/.opencode .opencode
ln -s /path/to/primer/src src
bun add @opencode-ai/plugin zod@^4.1.0
```

primer's relative imports (`../../src/...` in `.opencode/plugins/primer.ts`) require `src/` to sit at the project root. Keep the symlink names exactly as shown.

### D. Submodule

> **Prerequisite:** as with option C, the target project needs a `package.json` (and `bun` on PATH). Run `bun init -y` in a virgin directory before adding the submodule.

```bash
cd <your-project>
git submodule add https://github.com/<owner>/primer .primer
ln -s .primer/.opencode .opencode
ln -s .primer/src src
bun add @opencode-ai/plugin zod@^4.1.0
```

## Verify the install

Three quick checks. If any fails, see [Troubleshooting](#troubleshooting).

1. **Tests pass** (optional but a useful smoke test if you symlinked or cloned):
   ```bash
   bun test
   ```
   Expect all green; the suite covers validator, scanner, writer, and sync.

2. **Plugin loads in opencode**:
   ```bash
   opencode
   ```
   Inside the prompt, type `/primer-` (with the trailing dash). The autocomplete should list eight commands — `primer-setup`, `primer-hld`, … `primer-sync`. If you see zero or one, the plugin didn't load.

3. **First command is discoverable**: select `/primer-setup` from the autocomplete. You should not get an "unknown command" error.

## Your first session

Run the commands in order. Each one announces the next when it finishes.

1. `/primer-setup` — usually two questions (project name, one-line description; a third only if the README title and `package.json` name disagree). Produces `AGENTS.md`, `README.md`, and `.agent-ignore` — fixed skeletons presented and written in one approval — plus an append to `.gitignore`. It then writes `.primer-state.json` automatically via the `primer_state_write` tool (real timestamp and git HEAD, never hand-composed) and verifies `docs/RECOVERY.md` is present (the installer ships it).

2. `/primer-hld` — full design interview. Produces `docs/HLD.md` (the source of truth for every later document), one ADR per significant tech decision, and updates `AGENTS.md` and `README.md`. Expect ~15–30 minutes of conversation depending on project complexity.

3. `/primer-lld` — module decomposition with a designer+critic pass per module. Produces `docs/LLD.md`, one `docs/modules/<name>.md` per module, and updates `AGENTS.md § Modules`.

4. `/primer-skills` — stack-specific conventions, one file per technology. The agent reads everything from earlier phases before asking any question, so questions are concrete (not "do you prefer FP or OO?").

5. `/primer-examples` — good/bad/rationale triple per skill.

6. `/primer-feature` — run **once per new feature you want to build**. Produces a focused, ephemeral plan at `docs/plans/<feature-slug>.md`. The plan is the contract for the implementing agent and is deleted by you after the feature ships. Unlike the bootstrap phases above, this is the everyday command.

7. `/primer-sprint` — only when you're ready to run multiple coding-agent sessions in parallel. Reads from `docs/plans/*.md`; developer-driven selection, never auto-picks.

8. `/primer-sync` — run after you've written some code (or right after finishing a feature) to detect drift between source and primer documents, propagate any architectural updates flagged in implemented feature plans, and offer to delete each plan once its commitments have been honoured.

At every gate the agent presents a draft and waits for "approve / revise / skip". Nothing lands on disk without your explicit approval.

## Drift detection at session start

Once `.primer-state.json` exists, opening opencode in the repo triggers `session.created`. If source files have changed since the last sync, primer surfaces a warning suggesting you run `/primer-sync` before starting work. The warning is informational — it does not block.

The 100-commit threshold for "imprecise warning" is configurable in `opencode.json`:

```json
{ "primer": { "syncDriftThreshold": 100 } }
```

## Troubleshooting

### `/primer-*` commands don't appear in opencode

- Confirm `.opencode/commands/*.md` is at the **project root** of the directory you opened opencode in, not under a subdirectory.
- Confirm `bun install` ran successfully and `node_modules/@opencode-ai/plugin` exists.
- Check `.opencode/plugins/primer.ts` imports resolve — the file imports from `../../src/...`. If you moved `src/` elsewhere, fix the relative paths.
- Restart opencode after copying files; plugins are loaded once at session start.

### `cannot find module '@opencode-ai/plugin'`

`bun install` did not run, or `package.json` is missing primer's dependencies. From the project root:

```bash
bun install @opencode-ai/plugin zod
```

### Tests fail with `git: command not found`

The `sync.test.ts` suite spawns git for drift detection tests. Install git, or run only the validator and scanner suites:

```bash
bun test tests/validator.test.ts tests/scanner.test.ts
```

### `/primer-hld` reports "AGENTS.md missing" even though setup ran

You opened opencode in a different directory from where setup wrote the files. opencode hooks see `directory` as the project root at startup. Close opencode, `cd` into the project, and reopen.

### Drift warning appears every time, even right after `/primer-sync`

The most likely cause is a `.agent-ignore` pattern that matches nothing. Run `git log <headAtSync>..HEAD --name-only` (or `git log --since="<syncedAt>" --name-only` when `headAtSync` is `null`) manually to inspect what git considers changed since the baseline recorded in `.primer-state.json`.

### "Too many changes since last sync"

You hit the imprecise-warning threshold. Either raise the threshold in `opencode.json` (see above), or run `/primer-sync` to reset the baseline.

## Next reads

- [COMMANDS.md](COMMANDS.md) — every command's preconditions, mandatory outputs, and reflection criteria.
- [RECOVERY.md](RECOVERY.md) — what happens when a precondition fails (it doesn't abort; it scans and drafts).
- [SYNC.md](SYNC.md) — drift detection internals and the `/primer-sync` flow.
- [HLD.md](HLD.md), [LLD.md](LLD.md) — primer's own dog-fooded design documents. If you want to see what a complete primer document set looks like, start here.
