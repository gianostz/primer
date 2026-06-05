import { describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sectionHasContent, validate } from '../src/validator.ts'

const EMPTY = join(import.meta.dir, 'fixtures', 'empty-repo')
const PARTIAL = join(import.meta.dir, 'fixtures', 'partial-repo')
const FULL = join(import.meta.dir, 'fixtures', 'full-repo')

describe('global precondition', () => {
  test('every command except primer-setup requires .primer-state.json', () => {
    const result = validate('primer-hld', EMPTY)
    expect(result.valid).toBe(false)
    expect(result.missing.some(m => m.path === '.primer-state.json')).toBe(true)
  })

  test('primer-setup does not require .primer-state.json', () => {
    const result = validate('primer-setup', EMPTY)
    expect(result.missing.some(m => m.path === '.primer-state.json')).toBe(false)
  })
})

describe('primer-hld preconditions', () => {
  test('empty repo: AGENTS.md and README.md missing', () => {
    const result = validate('primer-hld', EMPTY)
    expect(result.valid).toBe(false)
    expect(result.missing.some(m => m.path === 'AGENTS.md')).toBe(true)
    expect(result.missing.some(m => m.path === 'README.md')).toBe(true)
  })

  test('partial repo: AGENTS.md and README.md present, valid', () => {
    const result = validate('primer-hld', PARTIAL)
    expect(result.valid).toBe(true)
  })
})

describe('primer-lld preconditions', () => {
  test('missing docs/HLD.md', () => {
    const result = validate('primer-lld', PARTIAL)
    expect(result.valid).toBe(false)
    expect(result.missing.some(m => m.path === 'docs/HLD.md')).toBe(true)
  })

  test('full repo: HLD has required sections, AGENTS has architecture', () => {
    const result = validate('primer-lld', FULL)
    expect(result.valid).toBe(true)
  })

  test('HLD exists but Vision is empty: incomplete', () => {
    const dir = mkTempRepo()
    writeFileSync(
      join(dir, '.primer-state.json'),
      '{"syncedAt":"2026-01-01T00:00:00Z","headAtSync":null,"branchAtSync":null}',
    )
    writeFileSync(
      join(dir, 'AGENTS.md'),
      '# AGENTS.md\n\n## Architecture\nDual-layer.\n',
    )
    mkdirSync(join(dir, 'docs'), { recursive: true })
    writeFileSync(
      join(dir, 'docs', 'HLD.md'),
      '# HLD\n\n## Vision\n\n## Tech stack\nTS\n\n## Architecture style\nMonolith\n',
    )
    const result = validate('primer-lld', dir)
    expect(result.valid).toBe(false)
    expect(
      result.incomplete.some(i => i.section === '## Vision'),
    ).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('primer-feature preconditions', () => {
  test('full repo: HLD + LLD + module files present', () => {
    const result = validate('primer-feature', FULL)
    expect(result.valid).toBe(true)
  })

  test('LLD references a module file that does not exist', () => {
    const dir = mkTempRepo()
    writeFileSync(
      join(dir, '.primer-state.json'),
      '{"syncedAt":"2026-01-01T00:00:00Z","headAtSync":null,"branchAtSync":null}',
    )
    writeFileSync(
      join(dir, 'AGENTS.md'),
      '# AGENTS.md\n\n## Modules\n- core\n',
    )
    mkdirSync(join(dir, 'docs'), { recursive: true })
    writeFileSync(join(dir, 'docs', 'HLD.md'), '# HLD\n')
    writeFileSync(
      join(dir, 'docs', 'LLD.md'),
      '# LLD\n\n- [core](modules/core.md)\n',
    )
    const result = validate('primer-feature', dir)
    expect(result.valid).toBe(false)
    expect(result.missing.some(m => m.path === 'docs/modules/core.md')).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  test('HLD missing: invalid', () => {
    const dir = mkTempRepo()
    writeFileSync(
      join(dir, '.primer-state.json'),
      '{"syncedAt":"2026-01-01T00:00:00Z","headAtSync":null,"branchAtSync":null}',
    )
    writeFileSync(
      join(dir, 'AGENTS.md'),
      '# AGENTS.md\n\n## Modules\n- core\n',
    )
    mkdirSync(join(dir, 'docs', 'modules'), { recursive: true })
    writeFileSync(join(dir, 'docs', 'modules', 'core.md'), '# Module: core\n')
    writeFileSync(
      join(dir, 'docs', 'LLD.md'),
      '# LLD\n\n- [core](modules/core.md)\n',
    )
    const result = validate('primer-feature', dir)
    expect(result.valid).toBe(false)
    expect(result.missing.some(m => m.path === 'docs/HLD.md')).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('primer-skills preconditions', () => {
  test('full repo: LLD with module index + AGENTS §Modules populated', () => {
    const result = validate('primer-skills', FULL)
    expect(result.valid).toBe(true)
  })

  test('LLD module index is empty: incomplete', () => {
    const dir = mkTempRepo()
    writeFileSync(
      join(dir, '.primer-state.json'),
      '{"syncedAt":"2026-01-01T00:00:00Z","headAtSync":null,"branchAtSync":null}',
    )
    writeFileSync(
      join(dir, 'AGENTS.md'),
      '# AGENTS.md\n\n## Modules\n- (none yet)\n',
    )
    mkdirSync(join(dir, 'docs'), { recursive: true })
    writeFileSync(join(dir, 'docs', 'LLD.md'), '# LLD\n\n## Module index\n\n')
    const result = validate('primer-skills', dir)
    expect(result.valid).toBe(false)
    expect(result.incomplete.length).toBeGreaterThan(0)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('primer-examples preconditions', () => {
  test('full repo has at least one non-index skill', () => {
    const result = validate('primer-examples', FULL)
    expect(result.valid).toBe(true)
  })

  test('only SKILL-INDEX.md present: invalid', () => {
    const dir = mkTempRepo()
    writeFileSync(
      join(dir, '.primer-state.json'),
      '{"syncedAt":"2026-01-01T00:00:00Z","headAtSync":null,"branchAtSync":null}',
    )
    mkdirSync(join(dir, 'skills'), { recursive: true })
    writeFileSync(join(dir, 'skills', 'SKILL-INDEX.md'), '# index\n')
    const result = validate('primer-examples', dir)
    expect(result.valid).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('primer-sprint preconditions', () => {
  test('full repo has a parallelisable step in a feature plan', () => {
    const result = validate('primer-sprint', FULL)
    expect(result.valid).toBe(true)
  })

  test('no parallelisable step: incomplete', () => {
    const dir = mkTempRepo()
    writeFileSync(
      join(dir, '.primer-state.json'),
      '{"syncedAt":"2026-01-01T00:00:00Z","headAtSync":null,"branchAtSync":null}',
    )
    mkdirSync(join(dir, 'docs', 'plans'), { recursive: true })
    writeFileSync(
      join(dir, 'docs', 'plans', 'feat-a.md'),
      '# Plan: feat-a\n\n## Steps\n\n### Step 1\n**Parallelisable**: no\n',
    )
    const result = validate('primer-sprint', dir)
    expect(result.valid).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  test('parallelisable flag accepted with __underscore__ emphasis and no bold, across plans', () => {
    const dir = mkTempRepo()
    writeFileSync(
      join(dir, '.primer-state.json'),
      '{"syncedAt":"2026-01-01T00:00:00Z","headAtSync":null,"branchAtSync":null}',
    )
    mkdirSync(join(dir, 'docs', 'plans'), { recursive: true })
    writeFileSync(
      join(dir, 'docs', 'plans', 'feat-a.md'),
      '# Plan: feat-a\n\n### Step 1\n__Parallelisable__: yes\n',
    )
    writeFileSync(
      join(dir, 'docs', 'plans', 'feat-b.md'),
      '# Plan: feat-b\n\n### Step 1\nParallelisable: yes\n',
    )
    const result = validate('primer-sprint', dir)
    expect(result.valid).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  test('no docs/plans dir at all: incomplete', () => {
    const dir = mkTempRepo()
    writeFileSync(
      join(dir, '.primer-state.json'),
      '{"syncedAt":"2026-01-01T00:00:00Z","headAtSync":null,"branchAtSync":null}',
    )
    const result = validate('primer-sprint', dir)
    expect(result.valid).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('LLD module link parsing (validator)', () => {
  test('accepts links with markdown titles and ../ prefixes', () => {
    const dir = mkTempRepo()
    writeFileSync(
      join(dir, '.primer-state.json'),
      '{"syncedAt":"2026-01-01T00:00:00Z","headAtSync":null,"branchAtSync":null}',
    )
    writeFileSync(
      join(dir, 'AGENTS.md'),
      '# AGENTS.md\n\n## Modules\n- core\n',
    )
    mkdirSync(join(dir, 'docs', 'modules'), { recursive: true })
    writeFileSync(join(dir, 'docs', 'modules', 'core.md'), '# Module: core\n')
    writeFileSync(join(dir, 'docs', 'HLD.md'), '# HLD\n')
    writeFileSync(
      join(dir, 'docs', 'LLD.md'),
      '# LLD\n\n- [core](../docs/modules/core.md "core module")\n',
    )
    const result = validate('primer-feature', dir)
    expect(result.valid).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  test('reports the referenced module file as missing when absent', () => {
    const dir = mkTempRepo()
    writeFileSync(
      join(dir, '.primer-state.json'),
      '{"syncedAt":"2026-01-01T00:00:00Z","headAtSync":null,"branchAtSync":null}',
    )
    writeFileSync(
      join(dir, 'AGENTS.md'),
      '# AGENTS.md\n\n## Modules\n- ghost\n',
    )
    mkdirSync(join(dir, 'docs'), { recursive: true })
    writeFileSync(
      join(dir, 'docs', 'LLD.md'),
      '# LLD\n\n- [ghost](./modules/ghost.md "with title")\n',
    )
    const result = validate('primer-feature', dir)
    expect(result.valid).toBe(false)
    expect(result.missing.some(m => m.path === 'docs/modules/ghost.md')).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('sectionHasContent', () => {
  test('returns true when section has body', () => {
    expect(sectionHasContent('## Vision\nHello\n', '## Vision')).toBe(true)
  })

  test('returns false when section is empty', () => {
    expect(sectionHasContent('## Vision\n\n## Next\n', '## Vision')).toBe(false)
  })

  test('returns false when heading absent', () => {
    expect(sectionHasContent('## Other\nx\n', '## Vision')).toBe(false)
  })

  test('does not bleed into next same-level heading', () => {
    expect(
      sectionHasContent('## A\n\n## B\nText\n', '## A'),
    ).toBe(false)
  })

  test('tolerates extra spaces in the heading (##  Vision)', () => {
    expect(sectionHasContent('##  Vision\nHello\n', '## Vision')).toBe(true)
  })

  test('tolerates a missing space after the hashes (##Vision)', () => {
    expect(sectionHasContent('##Vision\nHello\n', '## Vision')).toBe(true)
  })

  test('tolerates trailing whitespace on the heading line', () => {
    expect(sectionHasContent('## Vision   \nHello\n', '## Vision')).toBe(true)
  })

  test('tolerates spacing variants in the target argument too', () => {
    expect(sectionHasContent('## Vision\nHello\n', '##Vision')).toBe(true)
  })
})

function mkTempRepo(): string {
  return mkdtempSync(join(tmpdir(), 'primer-test-'))
}
