import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import type { WriteResult } from './types.ts'

export interface WriteInput {
  path: string
  content: string
  overwrite?: boolean
}

export function write(input: WriteInput, repoRoot: string): WriteResult {
  const overwrite = input.overwrite ?? false
  const root = resolve(repoRoot)
  // `resolve` (unlike `join`) treats an absolute `input.path` as a restart
  // point, so `primer_write({ path: '/abs/path/file' })` no longer produces
  // `<repoRoot>/abs/path/file`.
  const abs = resolve(root, input.path)
  const rel = relative(root, abs)
  // `relative` already collapses `.`/`..`; any escape from the root yields a
  // path beginning with `..`, so the single prefix check is sufficient.
  if (rel === '' || rel.startsWith('..')) {
    throw new Error(
      `primer_write: path "${input.path}" resolves outside the repo root (${root})`,
    )
  }
  const parent = dirname(abs)
  const exists = existsSync(abs)

  if (exists && !overwrite) {
    const existing = readFileSync(abs, 'utf8')
    return {
      written: false,
      path: input.path,
      replaced: false,
      diff: unifiedDiff(input.path, existing, input.content),
    }
  }

  mkdirSync(parent, { recursive: true })

  const temp = join(
    parent,
    `.${basename(abs)}.primer-${process.pid}-${Date.now()}.tmp`,
  )
  try {
    const fd = openSync(temp, 'w')
    try {
      writeSync(fd, input.content)
      // fsync the file so its content survives an OS crash before the rename.
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(temp, abs)
    // Best-effort fsync of the parent directory so the rename is durable.
    // Not all platforms (e.g. Windows) support fsync on directories.
    try {
      const dirFd = openSync(parent, 'r')
      try {
        fsyncSync(dirFd)
      } finally {
        closeSync(dirFd)
      }
    } catch {
      // ignore — directory fsync is best-effort
    }
  } catch (err) {
    try {
      unlinkSync(temp)
    } catch {
      // temp may not exist
    }
    throw err
  }

  return { written: true, path: input.path, replaced: exists }
}

const NO_NEWLINE_MARKER = '\\ No newline at end of file'

// Split text into content lines, reporting whether the final line lacked a
// trailing newline. An empty file yields zero lines (not one phantom blank
// line), and a file ending in `\n` does not produce a spurious trailing line.
function splitLines(text: string): { lines: string[]; noFinalNewline: boolean } {
  if (text === '') return { lines: [], noFinalNewline: false }
  if (text.endsWith('\n')) {
    return { lines: text.slice(0, -1).split('\n'), noFinalNewline: false }
  }
  return { lines: text.split('\n'), noFinalNewline: true }
}

export function unifiedDiff(
  path: string,
  oldText: string,
  newText: string,
): string {
  if (oldText === newText) return ''
  const old = splitLines(oldText)
  const next = splitLines(newText)
  let hunks = computeHunks(old.lines, next.lines, old.noFinalNewline, next.noFinalNewline)
  if (hunks.length === 0) {
    // The content lines are identical, yet the texts differ — the only possible
    // difference is the trailing newline of the last line (added or removed).
    // computeHunks finds no line ops, so synthesise the hunk git would emit:
    // the last line removed-then-readded, with a `\ No newline` marker on the
    // side that lacks the final newline.
    hunks = trailingNewlineOnlyHunk(old.lines, old.noFinalNewline, next.noFinalNewline)
    if (hunks.length === 0) return ''
  }

  const header = `--- a/${path}\n+++ b/${path}\n`
  const body = hunks
    .map(h => {
      const headerLine = `@@ -${h.oldStart},${h.oldLen} +${h.newStart},${h.newLen} @@`
      return [headerLine, ...h.lines].join('\n')
    })
    .join('\n')
  return `${header}${body}\n`
}

interface Hunk {
  oldStart: number
  oldLen: number
  newStart: number
  newLen: number
  lines: string[]
}

function computeHunks(
  oldLines: string[],
  newLines: string[],
  oldNoNewline = false,
  newNoNewline = false,
): Hunk[] {
  const lcs = lcsTable(oldLines, newLines)
  const ops: Array<{ kind: 'eq' | 'del' | 'add'; line: string }> = []
  let i = oldLines.length
  let j = newLines.length
  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      ops.unshift({ kind: 'eq', line: oldLines[i - 1] })
      i--
      j--
    } else if (lcs[i - 1][j] >= lcs[i][j - 1]) {
      ops.unshift({ kind: 'del', line: oldLines[i - 1] })
      i--
    } else {
      ops.unshift({ kind: 'add', line: newLines[j - 1] })
      j--
    }
  }
  while (i > 0) ops.unshift({ kind: 'del', line: oldLines[--i] })
  while (j > 0) ops.unshift({ kind: 'add', line: newLines[--j] })

  const hunks: Hunk[] = []
  let oldLine = 1
  let newLine = 1
  let cursor = 0
  while (cursor < ops.length) {
    if (ops[cursor].kind === 'eq') {
      oldLine++
      newLine++
      cursor++
      continue
    }
    const hunkStart = cursor
    let oldStart = oldLine
    let newStart = newLine
    let oldLen = 0
    let newLen = 0
    const lines: string[] = []
    const context = 3

    const ctxStart = Math.max(hunkStart - context, 0)
    for (let k = ctxStart; k < hunkStart; k++) {
      lines.push(` ${ops[k].line}`)
      oldLen++
      newLen++
    }
    oldStart -= hunkStart - ctxStart
    newStart -= hunkStart - ctxStart

    while (cursor < ops.length && ops[cursor].kind !== 'eq') {
      const op = ops[cursor]
      if (op.kind === 'del') {
        lines.push(`-${op.line}`)
        if (oldNoNewline && oldLine === oldLines.length) lines.push(NO_NEWLINE_MARKER)
        oldLen++
        oldLine++
      } else {
        lines.push(`+${op.line}`)
        if (newNoNewline && newLine === newLines.length) lines.push(NO_NEWLINE_MARKER)
        newLen++
        newLine++
      }
      cursor++
    }
    let trailing = 0
    while (
      cursor < ops.length &&
      ops[cursor].kind === 'eq' &&
      trailing < context
    ) {
      lines.push(` ${ops[cursor].line}`)
      // A final unchanged line that lacks a newline on either side gets one
      // marker (git emits a single `\ No newline` for shared context).
      if (
        (oldNoNewline && oldLine === oldLines.length) ||
        (newNoNewline && newLine === newLines.length)
      ) {
        lines.push(NO_NEWLINE_MARKER)
      }
      oldLen++
      newLen++
      oldLine++
      newLine++
      cursor++
      trailing++
    }
    hunks.push({ oldStart, oldLen, newStart, newLen, lines })
  }
  return hunks
}

// Build the single hunk for a change that touches only the final newline: the
// content lines are identical on both sides, so the last line is shown removed
// then readded, each side carrying a `\ No newline` marker when it lacks the
// trailing newline. Returns [] when there is no last line to anchor on.
function trailingNewlineOnlyHunk(
  lines: string[],
  oldNoNewline: boolean,
  newNoNewline: boolean,
): Hunk[] {
  const lastIdx = lines.length - 1
  if (lastIdx < 0) return []
  const context = 3
  const ctxStart = Math.max(lastIdx - context, 0)
  const out: string[] = []
  for (let k = ctxStart; k < lastIdx; k++) out.push(` ${lines[k]}`)
  out.push(`-${lines[lastIdx]}`)
  if (oldNoNewline) out.push(NO_NEWLINE_MARKER)
  out.push(`+${lines[lastIdx]}`)
  if (newNoNewline) out.push(NO_NEWLINE_MARKER)
  const start = ctxStart + 1
  const len = lastIdx - ctxStart + 1
  return [{ oldStart: start, oldLen: len, newStart: start, newLen: len, lines: out }]
}

function lcsTable(a: string[], b: string[]): number[][] {
  const m = a.length
  const n = b.length
  const t: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        t[i][j] = t[i - 1][j - 1] + 1
      } else {
        t[i][j] = Math.max(t[i - 1][j], t[i][j - 1])
      }
    }
  }
  return t
}
