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
const COMMIT_SENTINEL = '__PRIMER_COMMIT__'

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

export function gitLogSince(
  repoRoot: string,
  syncedAt: string,
  opts: DriftOptions = {},
): DriftChangeSummary {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD

  // One git invocation: a sentinel pretty-format line marks each commit;
  // `--name-only` then prints that commit's files. Counting sentinels gives
  // the commit count without a second rev-list call.
  let out = ''
  try {
    out = execFileSync(
      'git',
      [
        'log',
        `--since=${syncedAt}`,
        '--name-only',
        `--pretty=format:${COMMIT_SENTINEL}`,
      ],
      { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] },
    ).toString()
  } catch {
    return { commitCount: 0, sourceFilesChanged: [] }
  }

  const ignored = opts.ignorePatterns ?? []
  const files = new Set<string>()
  let commitCount = 0
  for (const line of out.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed === COMMIT_SENTINEL) {
      commitCount++
      continue
    }
    if (isPrimerDocPath(trimmed)) continue
    if (matchesAny(trimmed, ignored)) continue
    files.add(trimmed)
  }

  if (commitCount > threshold) {
    return { commitCount, sourceFilesChanged: [] }
  }
  return { commitCount, sourceFilesChanged: Array.from(files) }
}

function isPrimerDocPath(path: string): boolean {
  if (PRIMER_DOC_FILES.includes(path as (typeof PRIMER_DOC_FILES)[number])) {
    return true
  }
  return PRIMER_DOC_PREFIXES.some(p => path.startsWith(p))
}

function matchesAny(path: string, patterns: string[]): boolean {
  for (const raw of patterns) {
    const pattern = raw.trim()
    if (!pattern || pattern.startsWith('#')) continue
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
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('#'))
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
