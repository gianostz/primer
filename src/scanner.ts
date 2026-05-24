import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs'
import { extname, join, relative } from 'node:path'
import type { InterfaceEvidence, ScanDepth, ScanResult } from './types.ts'

const MANIFESTS: Record<string, { language: string; framework?: string }> = {
  'package.json': { language: 'JavaScript/TypeScript' },
  'pyproject.toml': { language: 'Python' },
  'requirements.txt': { language: 'Python' },
  'build.gradle': { language: 'Java/Kotlin', framework: 'Gradle' },
  'build.gradle.kts': { language: 'Kotlin', framework: 'Gradle' },
  'pom.xml': { language: 'Java', framework: 'Maven' },
  'Cargo.toml': { language: 'Rust' },
  'go.mod': { language: 'Go' },
  'build.sbt': { language: 'Scala', framework: 'sbt' },
}

const INTERFACE_PATTERNS: RegExp[] = [
  /\.d\.ts$/,
  /Types\.ts$/,
  /Interface\.scala$/,
  /\.proto$/,
]

const SOURCE_DIR_CANDIDATES = ['src', 'lib', 'app', 'pkg', 'internal', 'cmd']

export function scan(repoRoot: string, depth: ScanDepth, moduleScope?: string): ScanResult {
  const result: ScanResult = {
    languages: [],
    frameworks: [],
    topLevelModules: [],
    interfaces: [],
    existingDocs: [],
  }

  collectManifests(repoRoot, result)
  collectExistingDocs(repoRoot, result)
  readRootMeta(repoRoot, result)

  if (depth === 'meta') return result

  collectTopLevelModules(repoRoot, result)
  collectInterfaces(repoRoot, result, depth, moduleScope)

  return result
}

function collectManifests(repoRoot: string, result: ScanResult): void {
  const languages = new Set<string>()
  const frameworks = new Set<string>()
  for (const [name, info] of Object.entries(MANIFESTS)) {
    const path = join(repoRoot, name)
    if (!existsSync(path)) continue
    languages.add(info.language)
    if (info.framework) frameworks.add(info.framework)
    if (name === 'package.json' && !result.packageManifest) {
      try {
        result.packageManifest = JSON.parse(readFileSync(path, 'utf8'))
      } catch {
        // ignore malformed manifest
      }
    }
  }
  result.languages = Array.from(languages)
  result.frameworks = Array.from(frameworks)
}

function collectExistingDocs(repoRoot: string, result: ScanResult): void {
  const docsDir = join(repoRoot, 'docs')
  if (!existsSync(docsDir)) return
  walk(docsDir, repoRoot, p => {
    if (p.endsWith('.md')) result.existingDocs.push(p)
  })
}

function readRootMeta(repoRoot: string, result: ScanResult): void {
  const manifest = result.packageManifest
  if (manifest && typeof manifest === 'object') {
    const name = (manifest as Record<string, unknown>).name
    const description = (manifest as Record<string, unknown>).description
    if (typeof name === 'string') result.projectName = name
    if (typeof description === 'string') result.projectDescription = description
  }
  const readme = join(repoRoot, 'README.md')
  if (existsSync(readme)) {
    const text = readFileSync(readme, 'utf8')
    if (!result.projectName) {
      const heading = text.match(/^#\s+(.+)$/m)
      if (heading) result.projectName = heading[1].trim()
    }
    if (!result.projectDescription) {
      const firstPara = text
        .replace(/^#.*$/m, '')
        .split('\n\n')
        .map(s => s.trim())
        .find(s => s.length > 0 && !s.startsWith('#'))
      if (firstPara) result.projectDescription = firstPara
    }
  }
}

function collectTopLevelModules(repoRoot: string, result: ScanResult): void {
  const seen = new Set<string>()
  for (const candidate of SOURCE_DIR_CANDIDATES) {
    const dir = join(repoRoot, candidate)
    if (!existsSync(dir) || !statSync(dir).isDirectory()) continue
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry)
      if (statSync(abs).isDirectory()) {
        seen.add(`${candidate}/${entry}`)
      }
    }
  }
  result.topLevelModules = Array.from(seen).sort()
}

function collectInterfaces(
  repoRoot: string,
  result: ScanResult,
  depth: ScanDepth,
  moduleScope: string | undefined,
): void {
  const roots: string[] = []
  for (const candidate of SOURCE_DIR_CANDIDATES) {
    const dir = join(repoRoot, candidate)
    if (existsSync(dir)) roots.push(dir)
  }

  for (const root of roots) {
    walk(root, repoRoot, p => {
      if (!INTERFACE_PATTERNS.some(re => re.test(p))) return
      if (depth === 'module' && moduleScope) {
        if (!p.includes(`/${moduleScope}/`) && !p.endsWith(`/${moduleScope}`)) {
          return
        }
      }
      result.interfaces.push(parseInterface(join(repoRoot, p), p))
    })
  }
}

function parseInterface(abs: string, rel: string): InterfaceEvidence {
  let text = ''
  try {
    text = readFileSync(abs, 'utf8')
  } catch {
    return { path: rel, name: rel, members: [] }
  }
  const ext = extname(rel)
  const members: string[] = []
  let name = rel

  if (ext === '.ts' || rel.endsWith('.d.ts')) {
    const nameMatch = text.match(/(?:interface|type|class)\s+([A-Z][A-Za-z0-9_]*)/)
    if (nameMatch) name = nameMatch[1]
    const memberRe = /^\s*(?:export\s+)?(?:function|const|let|var|class|interface|type)\s+([A-Za-z0-9_]+)/gm
    let m: RegExpExecArray | null
    while ((m = memberRe.exec(text)) !== null) {
      members.push(m[1])
    }
  } else if (rel.endsWith('.proto')) {
    const messageRe = /\b(?:message|service|rpc)\s+([A-Za-z0-9_]+)/g
    let m: RegExpExecArray | null
    while ((m = messageRe.exec(text)) !== null) {
      members.push(m[1])
    }
    const pkg = text.match(/package\s+([A-Za-z0-9_.]+)/)
    if (pkg) name = pkg[1]
  } else if (rel.endsWith('.scala')) {
    const traitRe = /\b(?:trait|object|class)\s+([A-Z][A-Za-z0-9_]*)/g
    let m: RegExpExecArray | null
    while ((m = traitRe.exec(text)) !== null) {
      if (members.length === 0) name = m[1]
      members.push(m[1])
    }
  }

  return { path: rel, name, members: Array.from(new Set(members)) }
}

function walk(
  dir: string,
  repoRoot: string,
  visit: (relPath: string) => void,
): void {
  const stack: string[] = [dir]
  while (stack.length > 0) {
    const current = stack.pop() as string
    let entries: string[] = []
    try {
      entries = readdirSync(current)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'dist') {
        continue
      }
      const abs = join(current, entry)
      let info
      try {
        info = statSync(abs)
      } catch {
        continue
      }
      const rel = relative(repoRoot, abs)
      if (info.isDirectory()) {
        stack.push(abs)
      } else {
        visit(rel)
      }
    }
  }
}
