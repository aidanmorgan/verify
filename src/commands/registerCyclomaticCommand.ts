import type { Command } from 'commander'

import type { ComplexityProfile } from '../checks/code-metrics-types.ts'
import { CYCLOMATIC_PROFILES } from '../checks/cyclomatic-complexity.ts'
import { runCyclomaticComplexity } from '../checks/cyclomatic-complexity.ts'
import { collect, resolveProfile } from './shared.ts'

const VALID_PROFILES: ComplexityProfile[] = ['light', 'moderate', 'aggressive']

export function registerCyclomaticCommand(program: Command, finish: (ok: boolean) => void): void {
  const profileList = VALID_PROFILES.join(' | ')
  const profileDefaults = VALID_PROFILES.map((p) => `${p}: ≤${CYCLOMATIC_PROFILES[p]}`).join(' / ')

  program
    .command('cyclomatic-complexity')
    .description(
      'Cyclomatic complexity gate — fail when any function exceeds the threshold, powered by oxlint. All gates off by default, enable via --max-cyclomatic or --complexity.',
    )
    .argument('[pattern]', 'glob, directory, or file to analyse')
    .option('--max-cyclomatic <n>', 'maximum cyclomatic complexity per function', Number)
    .option(
      '--complexity [profile]',
      `enable the cyclomatic gate using a named profile (${profileList}); omitting the value uses moderate. Profiles: ${profileDefaults}`,
    )
    .option('--ignore <glob>', 'ignore glob (repeatable)', collect, [])
    .action(
      async (pattern: string | undefined, opts: { maxCyclomatic?: number; complexity?: ComplexityProfile | true; ignore: string[] }) => {
        const result = await runCyclomaticComplexity({
          maxThreshold: opts.maxCyclomatic,
          profile: resolveProfile(opts.complexity),
          ignore: opts.ignore.length ? opts.ignore : undefined,
          pattern,
        })
        finish(result.ok)
      },
    )
}
