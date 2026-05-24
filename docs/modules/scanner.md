# Module: scanner

## Responsibility
Inspect the developer's repository at a chosen depth and return structured, typed evidence that a recovery flow uses to draft a missing primer document. The scanner returns facts, not interpretations — architectural inference is left to the LLM that consumes the evidence.

## HLD reference
See [HLD.md § Agentic design patterns](../HLD.md#agentic-design-patterns) — Knowledge retrieval pattern.

## Inputs
- `repoRoot: string`
- `depth: 'meta' | 'structure' | 'module'`
- `moduleScope?: string` — required when `depth === 'module'`; scopes interface collection to one HLD component subdirectory.

## Outputs
`ScanResult` (see `src/types.ts`):
```ts
{
  projectName?: string
  projectDescription?: string
  languages: string[]
  frameworks: string[]
  topLevelModules: string[]
  interfaces: { path: string; name: string; members: string[] }[]
  existingDocs: string[]
  packageManifest?: Record<string, unknown>
}
```

## Public interface
- `scan(repoRoot, depth, moduleScope?): ScanResult` — the single exported entry point used by `primer_scan`.

## Dependencies (upstream)
- `node:fs` — directory walking and reads.
- `node:path` — path utilities.
- `src/types.ts` — `ScanResult`, `InterfaceEvidence`, `ScanDepth`.

## Dependents (downstream)
- `.opencode/plugins/primer.ts` — registers `scan` as the `primer_scan` tool.

## Scan depths
- **`meta`** — manifests (`package.json`, `pyproject.toml`, etc.), `README.md`, repo-root docs, `/docs/` directory listing.
- **`structure`** — everything in `meta`, plus the top-level source-directory list and all interface/type files matching `*.d.ts`, `*Types.ts`, `*Interface.scala`, `*.proto`.
- **`module`** — everything in `structure`, but with interface collection narrowed to paths containing `/<moduleScope>/`.

## Data owned
None. Scanner is pure-functional over the filesystem snapshot.

## Error handling contract
- Malformed manifests (`package.json` that fails `JSON.parse`) are silently ignored — the language is still detected from the manifest's filename, but `packageManifest` remains undefined.
- Unreadable files inside `walk()` are skipped via try/catch — directory or file iteration failures don't abort the scan.
- `node_modules/`, `.git/`, and `dist/` are skipped by the walker.

## Why no architecture inference
A previous version inferred `inferredArchStyle` from module-name heuristics (e.g. "any module containing `service` ⇒ microservices"). The heuristic produced confident-but-wrong labels that biased downstream LLM drafts of `docs/HLD.md`. The field was removed; architecture inference is now left to the LLM that consumes the evidence.

## Open questions
- Whether to add Java-style source roots (`src/main/java`, `src/main/kotlin`) to `SOURCE_DIR_CANDIDATES`.
- Whether to surface `cmd/<service>` Go layouts as top-level modules rather than nested ones.
