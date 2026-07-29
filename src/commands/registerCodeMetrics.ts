import type { Command } from 'commander'

import { COMPLEXITY_PROFILES, DEFAULT_CODE_GATES } from '../checks/code-metrics-core.ts'
import type { ComplexityProfile } from '../checks/code-metrics-types.ts'
import { runCodeMetrics } from '../checks/code-metrics.ts'

const VALID_PROFILES: ComplexityProfile[] = ['light', 'moderate', 'aggressive']

function collect(value: string, previous: string[]): string[] {
  return [...previous, value]
}

type CodeMetricsOpts = {
  complexity?: ComplexityProfile | true
  ignore: string[]
  maxCyclomatic?: number
  cyclomatic?: boolean
  maxCognitive?: number
  cognitive?: boolean
  minMi?: number
  mi?: boolean
}

function resolveProfile(value: ComplexityProfile | true | undefined): ComplexityProfile | undefined {
  if (value === undefined) return undefined
  if (value === true) return 'moderate'
  return value
}

function buildGates(opts: CodeMetricsOpts) {
  return {
    cyclomaticComplexity: { threshold: opts.maxCyclomatic, enabled: opts.cyclomatic },
    cognitiveComplexity: { threshold: opts.maxCognitive, enabled: opts.cognitive },
    maintainabilityIndex: { threshold: opts.minMi, enabled: opts.mi },
  }
}

export function registerCodeMetricsCommand(program: Command, finish: (ok: boolean) => void): void {
  const profileList = VALID_PROFILES.join(' | ')
  const profileDefaults = VALID_PROFILES.map(
    (p) =>
      `${p}: cyclomatic≤${COMPLEXITY_PROFILES[p].cyclomaticComplexity.threshold}, ` +
      `cognitive≤${COMPLEXITY_PROFILES[p].cognitiveComplexity.threshold}, ` +
      `MI≥${COMPLEXITY_PROFILES[p].maintainabilityIndex.threshold}`,
  ).join(' / ')

  program
    .command('code-metrics')
    .description(
      'Per-function code complexity: cyclomatic complexity (CC), cognitive complexity, and maintainability index (MI) — all gates off by default, enable via --complexity or per-gate flags',
    )
    .argument('[pattern]', 'glob, directory, or file to analyse')
    .option('--ignore <glob>', 'ignore glob (repeatable)', collect, [])
    .option(
      `--complexity [profile]`,
      `enable all gates using a named profile (${profileList}); omitting the value uses moderate. Profiles: ${profileDefaults}`,
    )
    .option(
      '--max-cyclomatic <n>',
      `maximum cyclomatic complexity per function (default: ${DEFAULT_CODE_GATES.cyclomaticComplexity.threshold})`,
      Number,
    )
    .option('--no-cyclomatic', 'disable the cyclomatic complexity gate')
    .option('--cyclomatic', 'enable the cyclomatic complexity gate')
    .option(
      '--max-cognitive <n>',
      `maximum cognitive complexity per function (default: ${DEFAULT_CODE_GATES.cognitiveComplexity.threshold})`,
      Number,
    )
    .option('--no-cognitive', 'disable the cognitive complexity gate')
    .option('--cognitive', 'enable the cognitive complexity gate')
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
