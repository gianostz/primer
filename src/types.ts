export type CommandName =
  | 'primer-setup'
  | 'primer-hld'
  | 'primer-lld'
  | 'primer-feature'
  | 'primer-skills'
  | 'primer-examples'
  | 'primer-sprint'
  | 'primer-sync'

export type ScanDepth = 'meta' | 'structure' | 'module'

export interface MissingDoc {
  path: string
  requiredBy: string
  recoverable: boolean
}

export interface IncompleteDoc {
  path: string
  section: string
  description: string
}

export interface ValidationResult {
  valid: boolean
  missing: MissingDoc[]
  incomplete: IncompleteDoc[]
}

export interface InterfaceEvidence {
  path: string
  name: string
  members: string[]
}

export interface ScanResult {
  projectName?: string
  projectDescription?: string
  languages: string[]
  frameworks: string[]
  topLevelModules: string[]
  interfaces: InterfaceEvidence[]
  existingDocs: string[]
  packageManifest?: Record<string, unknown>
}

export interface WriteResult {
  written: boolean
  path: string
  replaced: boolean
  diff?: string
}

export interface PrimerState {
  syncedAt: string
  headAtSync: string | null
  branchAtSync: string | null
}

export interface DriftChangeSummary {
  commitCount: number
  sourceFilesChanged: string[]
}

export interface PhaseStatus {
  completed: string[]
  pending: string[]
}

// Paths managed by primer. Used by sync.ts to exclude them from drift
// detection so that primer's own writes never trigger a "source changed"
// warning. Directory entries end in '/'; file entries are exact matches.
export const PRIMER_DOC_PREFIXES = [
  'docs/',
  'skills/',
  'examples/',
  'sprint/',
  '.opencode/',
] as const

export const PRIMER_DOC_FILES = [
  '.primer-state.json',
  'AGENTS.md',
  'README.md',
  '.agent-ignore',
  '.gitignore',
] as const
