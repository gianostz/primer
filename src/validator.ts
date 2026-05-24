import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  CommandName,
  IncompleteDoc,
  MissingDoc,
  ValidationResult,
} from './types.ts'

export function validate(
  command: CommandName,
  repoRoot: string,
): ValidationResult {
  const missing: MissingDoc[] = []
  const incomplete: IncompleteDoc[] = []

  if (command !== 'primer-setup') {
    if (!existsSync(join(repoRoot, '.primer-state.json'))) {
      missing.push({
        path: '.primer-state.json',
        requiredBy: command,
        recoverable: true,
      })
    }
  }

  switch (command) {
    case 'primer-setup':
      break
    case 'primer-hld':
      requireFile(repoRoot, 'AGENTS.md', command, missing)
      requireFile(repoRoot, 'README.md', command, missing)
      break
    case 'primer-lld':
      if (requireFile(repoRoot, 'docs/HLD.md', command, missing)) {
        requireSections(
          repoRoot,
          'docs/HLD.md',
          ['## Vision', '## Tech stack', '## Architecture style'],
          incomplete,
        )
      }
      if (requireFile(repoRoot, 'AGENTS.md', command, missing)) {
        requireSections(repoRoot, 'AGENTS.md', ['## Architecture'], incomplete)
      }
      break
    case 'primer-feature':
      if (requireFile(repoRoot, 'docs/LLD.md', command, missing)) {
        const referenced = parseLldModuleIndex(repoRoot)
        for (const modulePath of referenced) {
          requireFile(repoRoot, modulePath, command, missing)
        }
      }
      requireFile(repoRoot, 'docs/HLD.md', command, missing)
      if (requireFile(repoRoot, 'AGENTS.md', command, missing)) {
        requireSections(repoRoot, 'AGENTS.md', ['## Modules'], incomplete)
      }
      break
    case 'primer-skills':
      if (requireFile(repoRoot, 'docs/LLD.md', command, missing)) {
        const referenced = parseLldModuleIndex(repoRoot)
        if (referenced.length === 0) {
          incomplete.push({
            path: 'docs/LLD.md',
            section: '## Module index',
            description: 'LLD module index has no entries — skills must anchor to at least one module.',
          })
        }
        for (const modulePath of referenced) {
          requireFile(repoRoot, modulePath, command, missing)
        }
      }
      if (requireFile(repoRoot, 'AGENTS.md', command, missing)) {
        requireSections(repoRoot, 'AGENTS.md', ['## Modules'], incomplete)
      }
      break
    case 'primer-examples':
      if (!hasNonIndexSkill(repoRoot)) {
        missing.push({
          path: 'skills/<slug>.md',
          requiredBy: command,
          recoverable: true,
        })
      }
      break
    case 'primer-sprint':
      if (!hasParallelisableFeaturePlan(repoRoot)) {
        incomplete.push({
          path: 'docs/plans/',
          section: 'Parallelisable',
          description:
            'No feature plan marked "Parallelisable: yes" — nothing to fan out.',
        })
      }
      break
    case 'primer-sync':
      break
  }

  return {
    valid: missing.length === 0 && incomplete.length === 0,
    missing,
    incomplete,
  }
}

function requireFile(
  repoRoot: string,
  rel: string,
  command: CommandName,
  missing: MissingDoc[],
): boolean {
  if (existsSync(join(repoRoot, rel))) return true
  missing.push({ path: rel, requiredBy: command, recoverable: true })
  return false
}

function requireSections(
  repoRoot: string,
  rel: string,
  headings: string[],
  incomplete: IncompleteDoc[],
): void {
  const abs = join(repoRoot, rel)
  if (!existsSync(abs)) return
  const text = readFileSync(abs, 'utf8')
  for (const heading of headings) {
    if (!sectionHasContent(text, heading)) {
      incomplete.push({
        path: rel,
        section: heading,
        description: `Section "${heading}" is missing or empty.`,
      })
    }
  }
}

export function sectionHasContent(text: string, heading: string): boolean {
  const lines = text.split('\n')
  const startIdx = lines.findIndex(line => line.trim() === heading)
  if (startIdx === -1) return false

  const headingLevel = heading.match(/^#+/)?.[0].length ?? 0
  const headingRe = /^#+\s/

  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    const next = line.match(/^#+/)?.[0].length
    if (next !== undefined && next <= headingLevel && headingRe.test(line)) {
      return false
    }
    if (line.trim().length > 0 && !headingRe.test(line)) {
      return true
    }
  }
  return false
}

function parseLldModuleIndex(repoRoot: string): string[] {
  const abs = join(repoRoot, 'docs/LLD.md')
  if (!existsSync(abs)) return []
  const text = readFileSync(abs, 'utf8')
  const out: string[] = []
  // Match markdown links `](<path>.md)` or `](<path>.md "title")`,
  // tolerating whitespace, backslashes, and `./`/`../` prefixes. Only
  // links whose target contains `modules/<...>.md` are kept.
  const linkRe = /\]\(\s*([^)\s]+\.md)(?:\s+"[^"]*")?\s*\)/g
  let m: RegExpExecArray | null
  while ((m = linkRe.exec(text)) !== null) {
    const raw = m[1].replace(/\\/g, '/')
    const idx = raw.indexOf('modules/')
    if (idx === -1) continue
    out.push(`docs/${raw.slice(idx)}`)
  }
  return Array.from(new Set(out))
}

function hasNonIndexSkill(repoRoot: string): boolean {
  const dir = join(repoRoot, 'skills')
  if (!existsSync(dir)) return false
  const entries = readdirSync(dir)
  return entries.some(e => e.endsWith('.md') && e !== 'SKILL-INDEX.md')
}

function hasParallelisableFeaturePlan(repoRoot: string): boolean {
  const dir = join(repoRoot, 'docs/plans')
  if (!existsSync(dir)) return false
  const entries = readdirSync(dir).filter(e => e.endsWith('.md'))
  // Tolerant of optional `**` or `__` emphasis around the field name.
  const re = /(?:^|\s)(?:\*\*|__)?Parallelisable(?:\*\*|__)?\s*:\s*yes\b/im
  for (const entry of entries) {
    const text = readFileSync(join(dir, entry), 'utf8')
    if (re.test(text)) return true
  }
  return false
}
