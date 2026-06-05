import { tool, type Plugin } from '@opencode-ai/plugin'
import { z } from 'zod'
import { scan } from '../../src/scanner.ts'
import {
  currentState,
  detectCurrentPhase,
  driftWarning,
  gitLogSince,
  readAgentIgnore,
  readPrimerState,
  writePrimerState,
} from '../../src/sync.ts'
import { validate } from '../../src/validator.ts'
import { write } from '../../src/writer.ts'

const COMMAND_VALUES = [
  'primer-setup',
  'primer-hld',
  'primer-lld',
  'primer-feature',
  'primer-skills',
  'primer-examples',
  'primer-sprint',
  'primer-sync',
] as const

const DEPTH_VALUES = ['meta', 'structure', 'module'] as const

const primer: Plugin = async ({ directory, client }) => {
  const repoRoot = directory

  // Mutable so the `config` hook can update it after construction.
  let threshold = 100

  // M2: prefer the host's toast API so the drift warning reaches the user even
  // if opencode stops forwarding plugin stdout. Fall back to stdout when the
  // API is unavailable or errors — never let delivery throw.
  async function deliverWarning(message: string): Promise<void> {
    try {
      if (client?.tui?.showToast) {
        await client.tui.showToast({
          body: { title: 'primer', message, variant: 'warning' },
        })
        return
      }
    } catch {
      // fall through to stdout
    }
    // eslint-disable-next-line no-console
    console.log(message)
  }

  return {
    config: async (cfg) => {
      const primerCfg = (cfg as Record<string, unknown>).primer
      if (
        primerCfg &&
        typeof primerCfg === 'object' &&
        typeof (primerCfg as Record<string, unknown>).syncDriftThreshold === 'number'
      ) {
        threshold = (primerCfg as { syncDriftThreshold: number }).syncDriftThreshold
      }
    },

    tool: {
      primer_validate: tool({
        description:
          'Check preconditions before a primer command runs. Returns missing files and incomplete sections so the agent can launch the recovery flow.',
        args: { command: z.enum(COMMAND_VALUES) },
        async execute(args) {
          const result = validate(args.command, repoRoot)
          return {
            title: `primer_validate ${args.command} → ${result.valid ? 'valid' : 'invalid'}`,
            output: JSON.stringify(result, null, 2),
            metadata: result,
          }
        },
      }),

      primer_scan: tool({
        description:
          'Read the repo at a given depth to gather structured evidence for recovery drafts.',
        args: {
          depth: z.enum(DEPTH_VALUES),
          moduleScope: z.string().optional(),
        },
        async execute(args) {
          const result = scan(repoRoot, args.depth, args.moduleScope)
          return {
            title: `primer_scan ${args.depth}${args.moduleScope ? `:${args.moduleScope}` : ''}`,
            output: JSON.stringify(result, null, 2),
            metadata: result,
          }
        },
      }),

      primer_write: tool({
        description:
          'Atomically write a primer document. The command template MUST present the draft and obtain developer approval before calling this. On existing files without overwrite=true the tool returns a unified diff instead of writing.',
        args: {
          path: z.string(),
          content: z.string(),
          overwrite: z.boolean().optional().default(false),
        },
        async execute(args) {
          const result = write(
            { path: args.path, content: args.content, overwrite: args.overwrite },
            repoRoot,
          )
          const summary = result.written
            ? `wrote ${result.path}${result.replaced ? ' (replaced)' : ''}`
            : `not written — diff returned for ${result.path}`
          return {
            title: `primer_write ${args.path}`,
            output: result.written
              ? summary
              : `${summary}\n\n${result.diff ?? ''}`,
            metadata: result,
          }
        },
      }),

      primer_state_write: tool({
        description:
          'Write a fresh .primer-state.json baseline. The timestamp, HEAD sha, and branch are read from the environment and git — never supplied by the model. Call this at the end of /primer-setup and /primer-sync instead of composing the JSON by hand.',
        args: {},
        async execute() {
          const state = currentState(repoRoot)
          writePrimerState(repoRoot, state)
          return {
            title: `primer_state_write → ${state.headAtSync ?? '∅'} on ${state.branchAtSync ?? '∅'}`,
            output: JSON.stringify(state, null, 2),
            metadata: state,
          }
        },
      }),
    },

    event: async ({ event }) => {
      if (event.type !== 'session.created') return
      const state = readPrimerState(repoRoot)
      if (!state) return

      const ignored = readAgentIgnore(repoRoot)
      const drift = gitLogSince(repoRoot, state, {
        threshold,
        ignorePatterns: ignored,
      })
      const warning = driftWarning(state, drift, threshold)
      if (warning) await deliverWarning(warning)
    },

    // experimental.session.compacting is not a stable opencode API. If opencode
    // renames or removes this hook it simply won't be called. M3: rather than
    // assume the output shape, feature-detect `output.context` and emit a
    // diagnostic when it's absent, so a contract change surfaces instead of
    // silently dropping the preserved context. See docs/modules/plugin-entry.md.
    'experimental.session.compacting': async (_input, output) => {
      const state = readPrimerState(repoRoot)
      if (!state) return
      const ctx = (output as { context?: unknown })?.context
      if (!Array.isArray(ctx) || typeof (ctx as string[]).push !== 'function') {
        // eslint-disable-next-line no-console
        console.log(
          'primer: experimental.session.compacting changed shape (no output.context array) — primer context not preserved. See docs/modules/plugin-entry.md.',
        )
        return
      }
      const phase = detectCurrentPhase(repoRoot)
      const head = state.headAtSync ?? '∅'
      const branch = state.branchAtSync ?? '∅'
      ;(ctx as string[]).push(
        [
          '## primer context (preserved across compaction)',
          `Last sync: ${state.syncedAt} (~${head} on ${branch})`,
          `Completed phases: ${phase.completed.join(', ')}`,
          `Pending phases: ${phase.pending.join(', ')}`,
        ].join('\n'),
      )
    },
  }
}

export default primer
