import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs'
import { extname, join, relative } from 'node:path'
import { matchesAny, readAgentIgnore } from './sync.ts'
import type {
  InterfaceEvidence,
  ScanDepth,
  ScanResult,
  SourceFileEvidence,
} from './types.ts'

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

// Fallback language census: map a source file extension to a language so a
// manifest-less repo (e.g. a flat Flask app with only `app.py`) still reports
// the right language instead of nothing — or worse, the language of primer's
// own scaffolding.
const EXTENSION_LANGUAGES: Record<string, string> = {
  '.py': 'Python',
  '.ts': 'JavaScript/TypeScript',
  '.tsx': 'JavaScript/TypeScript',
  '.js': 'JavaScript/TypeScript',
  '.jsx': 'JavaScript/TypeScript',
  '.mjs': 'JavaScript/TypeScript',
  '.cjs': 'JavaScript/TypeScript',
  '.go': 'Go',
  '.rs': 'Rust',
  '.rb': 'Ruby',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.scala': 'Scala',
  '.c': 'C',
  '.h': 'C',
  '.cpp': 'C++',
  '.cc': 'C++',
  '.hpp': 'C++',
  '.cs': 'C#',
  '.php': 'PHP',
  '.swift': 'Swift',
}

// Light framework detection from import statements in source files. Kept
// deliberately small and regex-based — no dependency resolution.
const FRAMEWORK_SIGNALS: Array<{ ext: string[]; re: RegExp; framework: string }> = [
  { ext: ['.py'], re: /^\s*(?:from|import)\s+flask\b/m, framework: 'Flask' },
  { ext: ['.py'], re: /^\s*(?:from|import)\s+fastapi\b/m, framework: 'FastAPI' },
  { ext: ['.py'], re: /^\s*(?:from|import)\s+django\b/m, framework: 'Django' },
  {
    ext: ['.ts', '.js', '.tsx', '.jsx', '.mjs', '.cjs'],
    re: /(?:from\s+['"]express['"]|require\(\s*['"]express['"]\s*\))/,
    framework: 'Express',
  },
]

const INTERFACE_PATTERNS: RegExp[] = [
  /\.d\.ts$/i,
  /Types\.ts$/i,
  /Interface\.scala$/i,
  /\.proto$/i,
  /\.pyi$/i, // Python type stubs
  /\.graphql$/i,
  /\.gql$/i,
  /\.thrift$/i,
]

const SOURCE_DIR_CANDIDATES = ['src', 'lib', 'app', 'pkg', 'internal', 'cmd']

// Directories never worth walking: VCS, dependency caches, build output,
// virtualenvs, and primer's own scaffolding.
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'target',
  'venv',
  '.venv',
  '__pycache__',
  '.opencode',
])

// When primer is installed into a repo, its own `package.json`/`tsconfig.json`/
// `bun.lock` would otherwise make any project look like a TS project. If the
// plugin scaffold is present, treat those manifests as primer's, not the
// project's.
const SCAFFOLD_MARKER = join('.opencode', 'plugins', 'primer.ts')
const SCAFFOLD_MANIFESTS = new Set(['package.json', 'tsconfig.json', 'bun.lock'])

// Entrypoint-style basenames worth surfacing as source-file evidence even when
// they live below a source directory rather than at the repo root.
const ENTRYPOINT_NAMES = new Set([
  'index',
  'main',
  'app',
  'server',
  'mod',
  'lib',
])

export function scan(repoRoot: string, depth: ScanDepth, moduleScope?: string): ScanResult {
  const result: ScanResult = {
    languages: [],
    frameworks: [],
    topLevelModules: [],
    sourceFiles: [],
    interfaces: [],
    existingDocs: [],
  }

  const ignore = readAgentIgnore(repoRoot)
  const scaffold = existsSync(join(repoRoot, SCAFFOLD_MARKER))

  collectManifests(repoRoot, result, scaffold)
  collectExistingDocs(repoRoot, result, ignore)
  collectLanguagesAndFrameworks(repoRoot, result, ignore, scaffold)
  readRootMeta(repoRoot, result)

  if (depth === 'meta') return result

  collectTopLevelModules(repoRoot, result, ignore)
  collectSourceFiles(repoRoot, result, ignore, scaffold)
  collectInterfaces(repoRoot, result, depth, moduleScope, ignore)

  return result
}

function collectManifests(
  repoRoot: string,
  result: ScanResult,
  scaffold: boolean,
): void {
  const languages = new Set<string>()
  const frameworks = new Set<string>()
  for (const [name, info] of Object.entries(MANIFESTS)) {
    if (scaffold && SCAFFOLD_MANIFESTS.has(name)) continue
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

function collectExistingDocs(
  repoRoot: string,
  result: ScanResult,
  ignore: string[],
): void {
  const docsDir = join(repoRoot, 'docs')
  if (!existsSync(docsDir)) return
  walk(docsDir, repoRoot, ignore, p => {
    if (p.endsWith('.md')) result.existingDocs.push(p)
  })
}

// Census source extensions across the repo and union the result with any
// manifest-derived languages, then sniff a few source files for framework
// imports. Runs at every depth so even a `meta` scan of a manifest-less repo
// reports the right language.
function collectLanguagesAndFrameworks(
  repoRoot: string,
  result: ScanResult,
  ignore: string[],
  scaffold: boolean,
): void {
  const languages = new Set(result.languages)
  const frameworks = new Set(result.frameworks)
  let frameworkBudget = 60

  walk(repoRoot, repoRoot, ignore, p => {
    if (scaffold && SCAFFOLD_MANIFESTS.has(p)) return
    const ext = extname(p).toLowerCase()
    const lang = EXTENSION_LANGUAGES[ext]
    if (!lang) return
    languages.add(lang)

    if (frameworkBudget <= 0) return
    const signals = FRAMEWORK_SIGNALS.filter(s => s.ext.includes(ext))
    if (signals.length === 0) return
    frameworkBudget--
    let text = ''
    try {
      text = readFileSync(join(repoRoot, p), 'utf8')
    } catch {
      return
    }
    for (const signal of signals) {
      if (signal.re.test(text)) frameworks.add(signal.framework)
    }
  })

  result.languages = Array.from(languages)
  result.frameworks = Array.from(frameworks)
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

function collectTopLevelModules(
  repoRoot: string,
  result: ScanResult,
  ignore: string[],
): void {
  const seen = new Set<string>()
  for (const candidate of SOURCE_DIR_CANDIDATES) {
    const dir = join(repoRoot, candidate)
    // B4: a broken symlink (or a vanished entry) must not crash the scan.
    let isDir = false
    try {
      isDir = existsSync(dir) && statSync(dir).isDirectory()
    } catch {
      continue
    }
    if (!isDir) continue
    let entries: string[] = []
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      const rel = `${candidate}/${entry}`
      if (matchesAny(rel, ignore)) continue
      const abs = join(dir, entry)
      try {
        if (statSync(abs).isDirectory()) seen.add(rel)
      } catch {
        // broken symlink or race — skip this entry
      }
    }
  }
  result.topLevelModules = Array.from(seen).sort()
}

// Real code evidence: top-level source files at the repo root plus
// entrypoint-named files one level into the source directories. These carry
// the symbols design docs must stay faithful to.
function collectSourceFiles(
  repoRoot: string,
  result: ScanResult,
  ignore: string[],
  scaffold: boolean,
): void {
  const seen = new Set<string>()
  const out: SourceFileEvidence[] = []

  const consider = (rel: string): void => {
    if (seen.has(rel)) return
    if (matchesAny(rel, ignore)) return
    if (scaffold && SCAFFOLD_MANIFESTS.has(rel)) return
    const ext = extname(rel).toLowerCase()
    if (!EXTENSION_LANGUAGES[ext]) return
    let text = ''
    try {
      text = readFileSync(join(repoRoot, rel), 'utf8')
    } catch {
      return
    }
    seen.add(rel)
    out.push({ path: rel, symbols: extractSymbols(rel, text) })
  }

  // Root-level source files (the `app.py` / `index.ts` of a flat layout).
  let rootEntries: string[] = []
  try {
    rootEntries = readdirSync(repoRoot)
  } catch {
    rootEntries = []
  }
  for (const entry of rootEntries) {
    let info
    try {
      info = statSync(join(repoRoot, entry))
    } catch {
      continue
    }
    if (info.isFile()) consider(entry)
  }

  // Entrypoint files just inside the source directories.
  for (const candidate of SOURCE_DIR_CANDIDATES) {
    const dir = join(repoRoot, candidate)
    let entries: string[] = []
    try {
      if (!existsSync(dir) || !statSync(dir).isDirectory()) continue
      entries = readdirSync(dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      const base = entry.replace(/\.[^.]+$/, '')
      if (!ENTRYPOINT_NAMES.has(base)) continue
      try {
        if (statSync(join(dir, entry)).isFile()) consider(`${candidate}/${entry}`)
      } catch {
        // skip
      }
    }
  }

  result.sourceFiles = out.sort((a, b) => a.path.localeCompare(b.path))
}

// Lightweight, regex-based symbol extraction — no real parser. Good enough to
// list the functions/classes/routes a design doc must reflect.
export function extractSymbols(rel: string, text: string): string[] {
  const ext = extname(rel).toLowerCase()
  const symbols: string[] = []

  if (ext === '.py') {
    const defRe = /^(?:async\s+)?def\s+([A-Za-z_]\w*)/gm
    const classRe = /^class\s+([A-Za-z_]\w*)/gm
    const routeRe = /@\w+\.route\(\s*['"]([^'"]+)['"]/g
    pushAll(defRe, text, symbols)
    pushAll(classRe, text, symbols)
    pushAll(routeRe, text, symbols)
  } else if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs') {
    const re =
      /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm
    pushAll(re, text, symbols)
  } else if (ext === '.go') {
    pushAll(/^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/gm, text, symbols)
    pushAll(/^type\s+([A-Za-z_]\w*)/gm, text, symbols)
  } else if (ext === '.rs') {
    pushAll(/^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/gm, text, symbols)
    pushAll(/^\s*(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z_]\w*)/gm, text, symbols)
  }

  return Array.from(new Set(symbols))
}

function pushAll(re: RegExp, text: string, out: string[]): void {
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) out.push(m[1])
}

function collectInterfaces(
  repoRoot: string,
  result: ScanResult,
  depth: ScanDepth,
  moduleScope: string | undefined,
  ignore: string[],
): void {
  const roots: string[] = []
  for (const candidate of SOURCE_DIR_CANDIDATES) {
    const dir = join(repoRoot, candidate)
    if (existsSync(dir)) roots.push(dir)
  }

  for (const root of roots) {
    walk(root, repoRoot, ignore, p => {
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
  ignore: string[],
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
      if (EXCLUDED_DIRS.has(entry)) {
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
      if (matchesAny(rel, ignore)) continue
      if (info.isDirectory()) {
        stack.push(abs)
      } else {
        visit(rel)
      }
    }
  }
}
