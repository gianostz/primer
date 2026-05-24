import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scan } from '../src/scanner.ts'

const FULL = join(import.meta.dir, 'fixtures', 'full-repo')
const EMPTY = join(import.meta.dir, 'fixtures', 'empty-repo')

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

function mkScratchRepo(): string {
  return mkdtempSync(join(tmpdir(), 'primer-scan-'))
}
