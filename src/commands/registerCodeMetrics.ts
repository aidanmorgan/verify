import type { Command } from 'commander'

import { COMPLEXITY_PROFILES, DEFAULT_CODE_GATES } from '../checks/code-metrics-core.ts'
import type { ComplexityProfile } from '../checks/code-metrics-types.ts'
import { runCodeMetrics } from '../checks/code-metrics.ts'
import { collect, resolveProfile } from './shared.ts'

const VALID_PROFILES: ComplexityProfile[] = ['light', 'moderate', 'aggressive']

type CodeMetricsOpts = {
  complexity?: ComplexityProfile | true
  ignore: string[]
  minMi?: number
  mi?: boolean
}

function buildGates(opts: CodeMetricsOpts) {
  return {
    maintainabilityIndex: { threshold: opts.minMi, enabled: opts.mi },
  }
}

export function registerCodeMetricsCommand(program: Command, finish: (ok: boolean) => void): void {
  const profileList = VALID_PROFILES.join(' | ')
  const profileDefaults = VALID_PROFILES.map((p) => `${p}: MI≥${COMPLEXITY_PROFILES[p].maintainabilityIndex.threshold}`).join(' / ')

  program
    .command('code-metrics')
    .description(
      'Maintainability index (MI) gate — all gates off by default, enable via --complexity or --mi. For per-function cyclomatic/cognitive complexity use `verifyx cyclomatic-complexity` and `verifyx cognitive-complexity`.',
    )
    .argument('[pattern]', 'glob, directory, or file to analyse')
    .option('--ignore <glob>', 'ignore glob (repeatable)', collect, [])
    .option(
      `--complexity [profile]`,
      `enable the MI gate using a named profile (${profileList}); omitting the value uses moderate. Profiles: ${profileDefaults}`,
    )
    .option(
      '--min-mi <n>',
      `minimum maintainability index per file (default: ${DEFAULT_CODE_GATES.maintainabilityIndex.threshold})`,
      Number,
    )
    .option('--no-mi', 'disable the maintainability index gate')
    .option('--mi', 'enable the maintainability index gate')
    .action((pattern: string | undefined, opts: CodeMetricsOpts) => {
      const profile = resolveProfile(opts.complexity)
      finish(
        runCodeMetrics({
          pattern,
          ignore: opts.ignore.length ? opts.ignore : undefined,
          profile,
          gates: buildGates(opts),
        }).ok,
      )
    })
}
