import { tool, type Plugin } from '@opencode-ai/plugin'
import { z } from 'zod'
import { scan } from '../../src/scanner.ts'
import {
  detectCurrentPhase,
  driftWarning,
  gitLogSince,
  readAgentIgnore,
  readPrimerState,
} from '../../src/sync.ts'
import { validate } from '../../src/validator.ts'
import { write } from '../../src/writer.ts'
import type { CommandName, ScanDepth } from '../../src/types.ts'

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

const primer: Plugin = async ({ directory }) => {
  const repoRoot = directory

  // Mutable so the `config` hook can update it after construction.
  let threshold = 100

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
          const result = validate(args.command as CommandName, repoRoot)
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
          const result = scan(repoRoot, args.depth as ScanDepth, args.moduleScope)
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
    },

    event: async ({ event }) => {
      if (event.type !== 'session.created') return
      const state = readPrimerState(repoRoot)
      if (!state) return

      const ignored = readAgentIgnore(repoRoot)
      const drift = gitLogSince(repoRoot, state.syncedAt, {
        threshold,
        ignorePatterns: ignored,
      })
      const warning = driftWarning(state, drift, threshold)
      if (warning) {
        // TODO: surfacing warnings from a session.created hook relies on
        // opencode forwarding stdout to the user. If that behaviour changes,
        // the warning will silently disappear. See docs/modules/sync.md.
        // eslint-disable-next-line no-console
        console.log(warning)
      }
    },

    // TODO: experimental.session.compacting is not a stable opencode API.
    // If opencode renames or removes this hook, compaction-preservation will
    // silently no-op. See docs/modules/plugin-entry.md.
    'experimental.session.compacting': async (_input, output) => {
      const state = readPrimerState(repoRoot)
      if (!state) return
      const phase = detectCurrentPhase(repoRoot)
      const head = state.headAtSync ?? '∅'
      const branch = state.branchAtSync ?? '∅'
      output.context.push(
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
