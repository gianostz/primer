import { describe, expect, test } from 'bun:test'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { extractSymbols, scan } from '../src/scanner.ts'

const FULL = join(import.meta.dir, 'fixtures', 'full-repo')
const EMPTY = join(import.meta.dir, 'fixtures', 'empty-repo')
const FLASK = join(import.meta.dir, 'fixtures', 'flask-flat')
const TS_FLAT = join(import.meta.dir, 'fixtures', 'ts-flat')

describe('scan depth: meta', () => {
  test('empty repo yields empty languages/frameworks', () => {
    const r = scan(EMPTY, 'meta')
    expect(r.languages.length).toBe(0)
    expect(r.frameworks.length).toBe(0)
  })

  test('detects package.json language and reads manifest', () => {
    const dir = mkScratchRepo()
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'thing', description: 'a thing' }),
    )
    writeFileSync(join(dir, 'README.md'), '# Heading\n\nLine of prose.\n')
    const r = scan(dir, 'meta')
    expect(r.languages).toContain('JavaScript/TypeScript')
    expect(r.projectName).toBe('thing')
    expect(r.projectDescription).toBe('a thing')
    expect(r.packageManifest).toBeDefined()
    rmSync(dir, { recursive: true, force: true })
  })

  test('falls back to README heading when no manifest name', () => {
    const dir = mkScratchRepo()
    writeFileSync(join(dir, 'README.md'), '# Heading-only\n\nFirst para.\n')
    const r = scan(dir, 'meta')
    expect(r.projectName).toBe('Heading-only')
    expect(r.projectDescription).toContain('First para')
    rmSync(dir, { recursive: true, force: true })
  })

  test('collects existing docs filenames', () => {
    const r = scan(FULL, 'meta')
    expect(r.existingDocs.some(p => p.endsWith('HLD.md'))).toBe(true)
  })
})

describe('scan depth: structure', () => {
  test('finds top-level source modules', () => {
    const dir = mkScratchRepo()
    mkdirSync(join(dir, 'src', 'core'), { recursive: true })
    mkdirSync(join(dir, 'src', 'api'), { recursive: true })
    writeFileSync(join(dir, 'src', 'core', 'index.ts'), '')
    const r = scan(dir, 'structure')
    expect(r.topLevelModules).toContain('src/core')
    expect(r.topLevelModules).toContain('src/api')
    rmSync(dir, { recursive: true, force: true })
  })

  test('detects interface files (.d.ts)', () => {
    const dir = mkScratchRepo()
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(
      join(dir, 'src', 'public.d.ts'),
      'export interface Foo { bar: string }\nexport type Baz = number\n',
    )
    const r = scan(dir, 'structure')
    expect(r.interfaces.length).toBeGreaterThan(0)
    expect(r.interfaces[0].path).toContain('public.d.ts')
    rmSync(dir, { recursive: true, force: true })
  })

  test('malformed package.json is swallowed silently', () => {
    const dir = mkScratchRepo()
    writeFileSync(join(dir, 'package.json'), '{ not: valid json ')
    const r = scan(dir, 'structure')
    expect(r.languages).toContain('JavaScript/TypeScript')
    expect(r.packageManifest).toBeUndefined()
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('scan depth: module', () => {
  test('module-scoped interface filter narrows results', () => {
    const dir = mkScratchRepo()
    mkdirSync(join(dir, 'src', 'core'), { recursive: true })
    mkdirSync(join(dir, 'src', 'api'), { recursive: true })
    writeFileSync(join(dir, 'src', 'core', 'public.d.ts'), 'export type A = number\n')
    writeFileSync(join(dir, 'src', 'api', 'public.d.ts'), 'export type B = number\n')
    const r = scan(dir, 'module', 'core')
    expect(r.interfaces.every(i => i.path.includes('/core/'))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('T1 — language detection without a manifest', () => {
  test('flat Python/Flask app reports Python only (no spurious JS/TS)', () => {
    const r = scan(FLASK, 'meta')
    expect(r.languages).toEqual(['Python'])
  })

  test('detects Flask from a light import signal', () => {
    const r = scan(FLASK, 'meta')
    expect(r.frameworks).toContain('Flask')
  })

  test('extension census picks up Go without a manifest', () => {
    const dir = mkScratchRepo()
    writeFileSync(join(dir, 'main.go'), 'package main\nfunc main() {}\n')
    const r = scan(dir, 'meta')
    expect(r.languages).toContain('Go')
    rmSync(dir, { recursive: true, force: true })
  })

  test('primer scaffolding does not pollute the detected language', () => {
    const dir = mkScratchRepo()
    // Primer's own files installed alongside a Python project.
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'primer' }))
    writeFileSync(join(dir, 'tsconfig.json'), '{}')
    mkdirSync(join(dir, '.opencode', 'plugins'), { recursive: true })
    writeFileSync(join(dir, '.opencode', 'plugins', 'primer.ts'), 'export default {}\n')
    // The actual project.
    writeFileSync(join(dir, 'app.py'), 'def handler():\n    return 1\n')
    const r = scan(dir, 'meta')
    expect(r.languages).toEqual(['Python'])
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('T2 — real source-file evidence', () => {
  test('Flask fixture surfaces app.py with its handler symbols', () => {
    const r = scan(FLASK, 'structure')
    const appPy = r.sourceFiles.find(f => f.path === 'app.py')
    expect(appPy).toBeDefined()
    for (const fn of [
      'get_tasks',
      'get_task',
      'create_task',
      'update_task',
      'delete_task',
    ]) {
      expect(appPy!.symbols).toContain(fn)
    }
  })

  test('flat TS layout surfaces index.ts at the repo root', () => {
    const r = scan(TS_FLAT, 'structure')
    const index = r.sourceFiles.find(f => f.path === 'index.ts')
    expect(index).toBeDefined()
    expect(index!.symbols).toContain('listTasks')
    expect(index!.symbols).toContain('Task')
  })

  test('extractSymbols pulls Python def/class names', () => {
    const syms = extractSymbols('x.py', 'class A:\n    pass\ndef foo():\n    pass\n')
    expect(syms).toContain('A')
    expect(syms).toContain('foo')
  })
})

describe('T3 — ignore rules and robustness', () => {
  test('does not descend into venv/ during the language census', () => {
    const dir = mkScratchRepo()
    writeFileSync(join(dir, 'app.py'), 'def x():\n    pass\n')
    mkdirSync(join(dir, 'venv'), { recursive: true })
    // A Go file buried in venv must not leak into detected languages.
    writeFileSync(join(dir, 'venv', 'vendored.go'), 'package main\n')
    const r = scan(dir, 'structure')
    expect(r.languages).toContain('Python')
    expect(r.languages).not.toContain('Go')
    rmSync(dir, { recursive: true, force: true })
  })

  test('respects .agent-ignore entries', () => {
    const dir = mkScratchRepo()
    writeFileSync(join(dir, 'app.py'), 'def x():\n    pass\n')
    writeFileSync(join(dir, '.agent-ignore'), 'generated/\n')
    mkdirSync(join(dir, 'generated'), { recursive: true })
    writeFileSync(join(dir, 'generated', 'gen.go'), 'package main\n')
    const r = scan(dir, 'structure')
    expect(r.languages).toContain('Python')
    expect(r.languages).not.toContain('Go')
    rmSync(dir, { recursive: true, force: true })
  })

  test('a dangling symlink under src/ does not crash the scan (B4)', () => {
    const dir = mkScratchRepo()
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src', 'real.ts'), 'export const a = 1\n')
    symlinkSync(join(dir, 'does-not-exist'), join(dir, 'src', 'broken'))
    expect(() => scan(dir, 'structure')).not.toThrow()
    rmSync(dir, { recursive: true, force: true })
  })
})

function mkScratchRepo(): string {
  return mkdtempSync(join(tmpdir(), 'primer-scan-'))
}
