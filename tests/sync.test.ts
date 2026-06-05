import { describe, expect, test } from 'bun:test'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  currentState,
  driftWarning,
  gitLogSince,
  matchesAny,
  readPrimerState,
  writePrimerState,
} from '../src/sync.ts'
import type { PrimerState } from '../src/types.ts'

describe('readPrimerState', () => {
  test('returns null when file missing', () => {
    const dir = mkRepo()
    expect(readPrimerState(dir)).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })

  test('round-trip via writePrimerState', () => {
    const dir = mkRepo()
    const state: PrimerState = {
      syncedAt: '2026-05-17T10:00:00Z',
      headAtSync: 'abc1234',
      branchAtSync: 'main',
    }
    writePrimerState(dir, state)
    expect(readPrimerState(dir)).toEqual(state)
    rmSync(dir, { recursive: true, force: true })
  })

  test('headAtSync may be null (no commits yet)', () => {
    const dir = mkRepo()
    writeFileSync(
      join(dir, '.primer-state.json'),
      JSON.stringify({
        syncedAt: '2026-01-01T00:00:00Z',
        headAtSync: null,
        branchAtSync: null,
      }),
    )
    const s = readPrimerState(dir)
    expect(s?.headAtSync).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })

  test('malformed json returns null without throwing', () => {
    const dir = mkRepo()
    writeFileSync(join(dir, '.primer-state.json'), '{not json')
    expect(readPrimerState(dir)).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('currentState', () => {
  test('non-git directory yields null head and branch (not empty strings)', () => {
    const dir = mkRepo()
    const s = currentState(dir)
    expect(s.headAtSync).toBeNull()
    expect(s.branchAtSync).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })

  test('git repo: head comes from git and syncedAt is a real timestamp', () => {
    const dir = mkGitRepo()
    writeFileSync(join(dir, 'a.ts'), '1\n')
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-m', 'init', '--no-verify'])
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: dir })
      .toString()
      .trim()
    const s = currentState(dir)
    expect(s.headAtSync).toBe(head)
    expect(s.branchAtSync).not.toBeNull()
    // A real environment clock, not a handcrafted `…000Z` stub.
    expect(s.syncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(Number.isNaN(Date.parse(s.syncedAt))).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('driftWarning', () => {
  const state: PrimerState = {
    syncedAt: '2026-05-01T00:00:00Z',
    headAtSync: 'a3f9c12',
    branchAtSync: 'main',
  }

  test('no changes → no warning', () => {
    expect(driftWarning(state, { commitCount: 0, sourceFilesChanged: [] })).toBeNull()
  })

  test('commits over threshold → imprecise warning', () => {
    const msg = driftWarning(
      state,
      { commitCount: 500, sourceFilesChanged: [] },
    )
    expect(msg).toContain('too many changes')
  })

  test('source changes → precise warning with sha and branch', () => {
    const msg = driftWarning(
      state,
      { commitCount: 4, sourceFilesChanged: ['src/x.ts'] },
    )
    expect(msg).toContain('~a3f9c12')
    expect(msg).toContain('on main')
  })

  test('null head displayed as ∅', () => {
    const msg = driftWarning(
      { ...state, headAtSync: null, branchAtSync: null },
      { commitCount: 1, sourceFilesChanged: ['src/x.ts'] },
    )
    expect(msg).toContain('~∅')
  })
})

describe('gitLogSince', () => {
  test('non-git repo returns empty summary without throwing', () => {
    const dir = mkRepo()
    const out = gitLogSince(dir, '2026-01-01T00:00:00Z')
    expect(out.commitCount).toBe(0)
    expect(out.sourceFilesChanged).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })

  test('git-tracked repo: detects source file changes, excludes docs/', () => {
    const dir = mkGitRepo()
    writeFileSync(join(dir, 'src.ts'), '// before\n')
    mkdirSync(join(dir, 'docs'), { recursive: true })
    writeFileSync(join(dir, 'docs', 'HLD.md'), '# HLD\n')
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-m', 'initial', '--no-verify'])
    const since = new Date(Date.now() - 60_000).toISOString()
    writeFileSync(join(dir, 'src.ts'), '// after\n')
    writeFileSync(join(dir, 'docs', 'HLD.md'), '# HLD updated\n')
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-m', 'change', '--no-verify'])
    const out = gitLogSince(dir, since)
    expect(out.sourceFilesChanged).toContain('src.ts')
    expect(out.sourceFilesChanged).not.toContain('docs/HLD.md')
    rmSync(dir, { recursive: true, force: true })
  })

  test('respects custom threshold', () => {
    const dir = mkGitRepo()
    writeFileSync(join(dir, 'x.ts'), 'x\n')
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-m', 'first', '--no-verify'])
    const since = new Date(Date.now() - 60_000).toISOString()
    for (let i = 0; i < 3; i++) {
      writeFileSync(join(dir, 'x.ts'), `${i}\n`)
      git(dir, ['add', '-A'])
      git(dir, ['commit', '-m', `c${i}`, '--no-verify'])
    }
    const out = gitLogSince(dir, since, { threshold: 1 })
    expect(out.commitCount).toBeGreaterThan(1)
    expect(out.sourceFilesChanged).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })

  test('excludes primer-managed files at the repo root from drift', () => {
    const dir = mkGitRepo()
    writeFileSync(join(dir, 'AGENTS.md'), '# initial\n')
    writeFileSync(join(dir, 'README.md'), '# project\n')
    writeFileSync(join(dir, '.agent-ignore'), 'secrets/\n')
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\n')
    writeFileSync(join(dir, 'src.ts'), '// initial\n')
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-m', 'initial', '--no-verify'])
    const since = new Date(Date.now() - 60_000).toISOString()
    writeFileSync(join(dir, 'AGENTS.md'), '# updated by primer\n')
    writeFileSync(join(dir, 'README.md'), '# project (edited)\n')
    writeFileSync(join(dir, '.agent-ignore'), 'secrets/\n*.key\n')
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\n.primer-state.json\n')
    writeFileSync(join(dir, 'src.ts'), '// changed\n')
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-m', 'change', '--no-verify'])
    const out = gitLogSince(dir, since)
    expect(out.sourceFilesChanged).toContain('src.ts')
    expect(out.sourceFilesChanged).not.toContain('AGENTS.md')
    expect(out.sourceFilesChanged).not.toContain('README.md')
    expect(out.sourceFilesChanged).not.toContain('.agent-ignore')
    expect(out.sourceFilesChanged).not.toContain('.gitignore')
    rmSync(dir, { recursive: true, force: true })
  })

  test('uses head..HEAD range when a head is recorded (B3)', () => {
    const dir = mkGitRepo()
    writeFileSync(join(dir, 'base.ts'), '0\n')
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-m', 'base', '--no-verify'])
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: dir })
      .toString()
      .trim()
    for (let i = 0; i < 3; i++) {
      writeFileSync(join(dir, `f${i}.ts`), `${i}\n`)
      git(dir, ['add', '-A'])
      git(dir, ['commit', '-m', `c${i}`, '--no-verify'])
    }
    // A future syncedAt would make a `--since` query find nothing; getting the
    // 3 post-head commits proves the range path is what runs.
    const future = new Date(Date.now() + 3_600_000).toISOString()
    const out = gitLogSince(dir, { syncedAt: future, headAtSync: head })
    expect(out.commitCount).toBe(3)
    expect(out.sourceFilesChanged.sort()).toEqual(['f0.ts', 'f1.ts', 'f2.ts'])
    rmSync(dir, { recursive: true, force: true })
  })

  test('large git log output is not silently truncated (B2 maxBuffer)', () => {
    const dir = mkGitRepo()
    const pad = 'x'.repeat(190)
    const count = 7000 // ~1.4 MB of name-only output, well past the 1 MB default
    for (let i = 0; i < count; i++) {
      writeFileSync(join(dir, `s${i}_${pad}.ts`), '1\n')
    }
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-m', 'big', '--no-verify'])
    const since = new Date(Date.now() - 60_000).toISOString()
    const out = gitLogSince(dir, since)
    expect(out.commitCount).toBe(1)
    expect(out.sourceFilesChanged.length).toBe(count)
    rmSync(dir, { recursive: true, force: true })
  })

  test('a path that looks like a commit marker is treated as a file (R2)', () => {
    const dir = mkGitRepo()
    // Under the old sentinel scheme a file literally named after the marker
    // would be miscounted as a commit. Full-SHA markers make that impossible.
    writeFileSync(join(dir, '__PRIMER_COMMIT__'), 'x\n')
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-m', 'add marker-named file', '--no-verify'])
    const since = new Date(Date.now() - 60_000).toISOString()
    const out = gitLogSince(dir, since)
    expect(out.commitCount).toBe(1)
    expect(out.sourceFilesChanged).toContain('__PRIMER_COMMIT__')
    rmSync(dir, { recursive: true, force: true })
  })

  test('single git log call counts commits accurately', () => {
    const dir = mkGitRepo()
    // `since` is set before any commit so every commit must be counted.
    const since = new Date(Date.now() - 120_000).toISOString()
    writeFileSync(join(dir, 'a.ts'), '1\n')
    git(dir, ['add', '-A'])
    git(dir, ['commit', '-m', 'a1', '--no-verify'])
    for (let i = 0; i < 5; i++) {
      writeFileSync(join(dir, 'a.ts'), `${i + 2}\n`)
      git(dir, ['add', '-A'])
      git(dir, ['commit', '-m', `a${i + 2}`, '--no-verify'])
    }
    const out = gitLogSince(dir, since)
    expect(out.commitCount).toBe(6)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('matchesAny — documented .agent-ignore subset', () => {
  test('directory prefix matches paths underneath it', () => {
    expect(matchesAny('venv/lib/x.py', ['venv/'])).toBe(true)
    expect(matchesAny('src/x.py', ['venv/'])).toBe(false)
  })

  test('extension glob matches by suffix', () => {
    expect(matchesAny('a/b/c.pyc', ['*.pyc'])).toBe(true)
    expect(matchesAny('a/b/c.py', ['*.pyc'])).toBe(false)
  })

  test('exact form matches the path and anything under it', () => {
    expect(matchesAny('secrets', ['secrets'])).toBe(true)
    expect(matchesAny('secrets/key.pem', ['secrets'])).toBe(true)
    expect(matchesAny('secretsx', ['secrets'])).toBe(false)
  })

  test('blank lines and comments are inert', () => {
    expect(matchesAny('src/x.ts', ['', '   ', '# a comment'])).toBe(false)
  })

  test('unsupported gitignore syntax is literal, never a wildcard', () => {
    // `**`, `?`, `!`, char classes, and mid-segment `*` do not glob.
    expect(matchesAny('src/deep/x.ts', ['**/x.ts'])).toBe(false)
    expect(matchesAny('ab.ts', ['a?.ts'])).toBe(false)
    expect(matchesAny('src/x.test.ts', ['src/*.test.ts'])).toBe(false)
    // A `!negation` line is just a literal path prefix, not re-inclusion.
    expect(matchesAny('!keep.ts', ['!keep.ts'])).toBe(true)
    expect(matchesAny('keep.ts', ['!keep.ts'])).toBe(false)
  })
})

function mkRepo(): string {
  return mkdtempSync(join(tmpdir(), 'primer-sync-'))
}

function mkGitRepo(): string {
  const dir = mkRepo()
  git(dir, ['init', '-q'])
  git(dir, ['config', 'user.email', 'test@example.com'])
  git(dir, ['config', 'user.name', 'test'])
  git(dir, ['config', 'commit.gpgsign', 'false'])
  return dir
}

function git(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' })
}
