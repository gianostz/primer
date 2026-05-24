import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { write } from '../src/writer.ts'

describe('write path resolution', () => {
  test('repo-relative path writes inside the repo root', () => {
    const dir = mkRepo()
    const result = write({ path: 'AGENTS.md', content: 'hello\n' }, dir)
    expect(result.written).toBe(true)
    expect(result.replaced).toBe(false)
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).toBe('hello\n')
    rmSync(dir, { recursive: true, force: true })
  })

  test('absolute path inside the repo writes to the same place (no path duplication)', () => {
    const dir = mkRepo()
    const abs = join(dir, 'AGENTS.md')
    const result = write({ path: abs, content: 'abs\n' }, dir)
    expect(result.written).toBe(true)
    // The bug we're guarding against produced <dir>/<dir>/AGENTS.md.
    expect(existsSync(join(dir, dir, 'AGENTS.md'))).toBe(false)
    expect(readFileSync(abs, 'utf8')).toBe('abs\n')
    rmSync(dir, { recursive: true, force: true })
  })

  test('absolute path outside the repo throws and writes nothing', () => {
    const dir = mkRepo()
    expect(() =>
      write({ path: '/etc/primer-should-not-write', content: 'X' }, dir),
    ).toThrow(/outside the repo root/)
    expect(existsSync('/etc/primer-should-not-write')).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })

  test('relative path traversal (..) is rejected', () => {
    const dir = mkRepo()
    expect(() =>
      write({ path: '../escape.txt', content: 'X' }, dir),
    ).toThrow(/outside the repo root/)
    rmSync(dir, { recursive: true, force: true })
  })

  test('path resolving to the repo root itself is rejected', () => {
    const dir = mkRepo()
    expect(() => write({ path: '.', content: 'X' }, dir)).toThrow(
      /outside the repo root/,
    )
    rmSync(dir, { recursive: true, force: true })
  })

  test('overwrite=false on an existing file returns a diff instead of writing', () => {
    const dir = mkRepo()
    writeFileSync(join(dir, 'AGENTS.md'), 'before\n')
    const result = write({ path: 'AGENTS.md', content: 'after\n' }, dir)
    expect(result.written).toBe(false)
    expect(result.diff).toContain('-before')
    expect(result.diff).toContain('+after')
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).toBe('before\n')
    rmSync(dir, { recursive: true, force: true })
  })

  test('overwrite=true replaces an existing file', () => {
    const dir = mkRepo()
    writeFileSync(join(dir, 'AGENTS.md'), 'before\n')
    const result = write(
      { path: 'AGENTS.md', content: 'after\n', overwrite: true },
      dir,
    )
    expect(result.written).toBe(true)
    expect(result.replaced).toBe(true)
    expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).toBe('after\n')
    rmSync(dir, { recursive: true, force: true })
  })
})

function mkRepo(): string {
  return mkdtempSync(join(tmpdir(), 'primer-writer-'))
}
