import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { write } from './writer.ts'
import {
  PRIMER_DOC_FILES,
  PRIMER_DOC_PREFIXES,
  type DriftChangeSummary,
  type PhaseStatus,
  type PrimerState,
} from './types.ts'

const STATE_FILE = '.primer-state.json'
const DEFAULT_THRESHOLD = 100
// A repo with a long history can emit a `git log` payload far larger than
// Node's default 1 MB `execFileSync` buffer. Without this, the call throws
// ENOBUFS and drift detection silently reports "no changes" (B2).
const MAX_BUFFER = 64 * 1024 * 1024

export function readPrimerState(repoRoot: string): PrimerState | null {
  const abs = join(repoRoot, STATE_FILE)
  if (!existsSync(abs)) return null
  try {
    const data = JSON.parse(readFileSync(abs, 'utf8')) as unknown
    if (!isPrimerState(data)) return null
    return data
  } catch {
    return null
  }
}

function isPrimerState(data: unknown): data is PrimerState {
  if (typeof data !== 'object' || data === null) return false
  const d = data as Record<string, unknown>
  return (
    typeof d.syncedAt === 'string' &&
    (typeof d.headAtSync === 'string' || d.headAtSync === null) &&
    (typeof d.branchAtSync === 'string' || d.branchAtSync === null)
  )
}

export function writePrimerState(
  repoRoot: string,
  state: PrimerState,
): void {
  write(
    { path: STATE_FILE, content: JSON.stringify(state, null, 2) + '\n', overwrite: true },
    repoRoot,
  )
}

export function currentState(repoRoot: string): PrimerState {
  return {
    syncedAt: new Date().toISOString(),
    headAtSync: tryGitHead(repoRoot),
    branchAtSync: tryGitBranch(repoRoot),
  }
}

// `null` is the in-state representation when git is unavailable or the
// repo has no commits. The display layer (`driftWarning`) maps `null` to
// `∅` for human-readable output. Empty stdout from git is normalised to
// `null` here via the `|| null` fallthrough.
function tryGitHead(repoRoot: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: MAX_BUFFER,
    })
      .toString()
      .trim() || null
  } catch {
    return null
  }
}

function tryGitBranch(repoRoot: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: MAX_BUFFER,
    })
      .toString()
      .trim() || null
  } catch {
    return null
  }
}

export interface DriftOptions {
  threshold?: number
  ignorePatterns?: string[]
}

// The baseline to measure drift against. A bare string is treated as a
// timestamp (legacy callers); a state object lets us prefer a precise commit
// range over the fuzzy `--since` window.
export type DriftBaseline =
  | string
  | Pick<PrimerState, 'syncedAt' | 'headAtSync'>

export function gitLogSince(
  repoRoot: string,
  baseline: DriftBaseline,
  opts: DriftOptions = {},
): DriftChangeSummary {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD
  const syncedAt = typeof baseline === 'string' ? baseline : baseline.syncedAt
  const head = typeof baseline === 'string' ? null : baseline.headAtSync

  // B3: when we recorded the HEAD at last sync, ask git for the exact commit
  // range `<head>..HEAD`. This is immune to clock skew, timezone drift, and
  // commits whose author-date predates `syncedAt`. Fall back to the `--since`
  // window only when no head was recorded (e.g. the repo had no commits then).
  const sinceWindow = [`--since=${syncedAt}`]

  // B3 follow-up: the precise range fails if the recorded SHA is no longer
  // reachable (history rewritten by rebase/amend/force-push). Rather than let
  // the error surface as a silent "no drift", retry with the fuzzy `--since`
  // window. git distinguishes the cases for us: a valid range with no commits
  // exits 0 (empty stdout), an unreachable SHA exits 128 and throws → null.
  let out = head ? runGitLog(repoRoot, [`${head}..HEAD`]) : runGitLog(repoRoot, sinceWindow)
  if (out === null && head) out = runGitLog(repoRoot, sinceWindow)
  if (out === null) return { commitCount: 0, sourceFilesChanged: [] }

  const ignored = opts.ignorePatterns ?? []
  const files = new Set<string>()
  let commitCount = 0
  for (const record of out.split('\0')) {
    if (record === '') continue
    const nl = record.indexOf('\n')
    if (nl !== -1) {
      // "<sha>\n<first filename?>" — the start of a commit's record.
      commitCount++
      const firstFile = record.slice(nl + 1)
      if (firstFile) addFile(firstFile, files, ignored)
    } else {
      addFile(record, files, ignored)
    }
  }

  if (commitCount > threshold) {
    return { commitCount, sourceFilesChanged: [] }
  }
  return { commitCount, sourceFilesChanged: Array.from(files) }
}

// One `git log` invocation. Returns stdout on success (possibly empty when the
// range is valid but holds no commits) or `null` when git exits non-zero — e.g.
// the requested revision is unreachable. R2: NUL-separated records, each commit
// marked with its full SHA (`%H`); the format line and first filename share a
// record split by a newline, so a path can never be mistaken for a marker.
// R3: merge commits show no files under `--name-only` by default and are left
// as-is rather than reaching for `-m`/`-c`, which would complicate counting.
function runGitLog(repoRoot: string, selector: string[]): string | null {
  try {
    return execFileSync(
      'git',
      ['log', ...selector, '--name-only', '--pretty=format:%H', '-z'],
      { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: MAX_BUFFER },
    ).toString()
  } catch {
    return null
  }
}

function addFile(path: string, files: Set<string>, ignored: string[]): void {
  if (isPrimerDocPath(path)) return
  if (matchesAny(path, ignored)) return
  files.add(path)
}

function isPrimerDocPath(path: string): boolean {
  if (PRIMER_DOC_FILES.includes(path as (typeof PRIMER_DOC_FILES)[number])) {
    return true
  }
  return PRIMER_DOC_PREFIXES.some(p => path.startsWith(p))
}

// `.agent-ignore` matcher. This is deliberately NOT gitignore — it supports a
// small, documented subset so no pattern silently does nothing (see the
// ".agent-ignore pattern syntax" section in docs/SYNC.md):
//   - `prefix/`  → matches any path under that directory
//   - `*.ext`    → matches any path ending in `.ext`
//   - `exact`    → matches the path exactly, or anything under `exact/`
// Everything else (`**`, `?`, `!negation`, char classes, mid-segment `*`) is
// treated as literal text, never as a wildcard.
// A blank line or a `#` comment in an ignore file carries no pattern. Shared
// by `readAgentIgnore` and `matchesAny` so the two never drift apart.
function isInertIgnoreLine(line: string): boolean {
  const t = line.trim()
  return t.length === 0 || t.startsWith('#')
}

export function matchesAny(path: string, patterns: string[]): boolean {
  for (const raw of patterns) {
    if (isInertIgnoreLine(raw)) continue
    const pattern = raw.trim()
    if (pattern.endsWith('/')) {
      if (path.startsWith(pattern)) return true
    } else if (pattern.startsWith('*.')) {
      if (path.endsWith(pattern.slice(1))) return true
    } else if (path === pattern || path.startsWith(`${pattern}/`)) {
      return true
    }
  }
  return false
}

export function readAgentIgnore(repoRoot: string): string[] {
  const abs = join(repoRoot, '.agent-ignore')
  if (!existsSync(abs)) return []
  return readFileSync(abs, 'utf8')
    .split('\n')
    .filter(s => !isInertIgnoreLine(s))
    .map(s => s.trim())
}

export function detectCurrentPhase(repoRoot: string): PhaseStatus {
  const completed: string[] = []
  const pending: string[] = []
  // `feature` and `sync` are excluded by design: `feature` produces ephemeral
  // plans the developer deletes after shipping (no stable artefact to probe),
  // and `sync` is an operational reset rather than a build-up phase.
  // `examples` and `sprint` are directory-existence checks — an empty
  // directory still counts as `completed`. Treat phase status as advisory.
  const checks: Array<{ name: string; path: string }> = [
    { name: 'setup', path: 'AGENTS.md' },
    { name: 'hld', path: 'docs/HLD.md' },
    { name: 'lld', path: 'docs/LLD.md' },
    { name: 'skills', path: 'skills/SKILL-INDEX.md' },
    { name: 'examples', path: 'examples' },
    { name: 'sprint', path: 'sprint' },
  ]
  for (const c of checks) {
    if (existsSync(join(repoRoot, c.path))) completed.push(c.name)
    else pending.push(c.name)
  }
  return { completed, pending }
}

export function driftWarning(
  state: PrimerState,
  drift: DriftChangeSummary,
  threshold: number = DEFAULT_THRESHOLD,
): string | null {
  if (drift.commitCount > threshold) {
    return (
      '⚠ primer: too many changes since last sync to analyse precisely. ' +
      'Run /primer-sync to reset the baseline.'
    )
  }
  if (drift.sourceFilesChanged.length === 0) return null
  const head = state.headAtSync ?? '∅'
  const branch = state.branchAtSync ?? '∅'
  return (
    `⚠ primer: source files changed since last sync ` +
    `(${state.syncedAt}, ~${head} on ${branch}). ` +
    `Consider running /primer-sync before starting work.`
  )
}
