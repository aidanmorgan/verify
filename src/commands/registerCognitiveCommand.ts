import type { Command } from 'commander'

import type { ComplexityProfile } from '../checks/code-metrics-types.ts'
import { COGNITIVE_PROFILES } from '../checks/cognitive-complexity.ts'
import { runCognitiveComplexity } from '../checks/cognitive-complexity.ts'
import { collect, resolveProfile } from './shared.ts'

const VALID_PROFILES: ComplexityProfile[] = ['light', 'moderate', 'aggressive']

export function registerCognitiveCommand(program: Command, finish: (ok: boolean) => void): void {
  const profileList = VALID_PROFILES.join(' | ')
  const profileDefaults = VALID_PROFILES.map((p) => `${p}: ≤${COGNITIVE_PROFILES[p]}`).join(' / ')

  program
    .command('cognitive-complexity')
    .description(
      'Cognitive complexity gate (SonarSource algorithm) — fail when any function exceeds the threshold, powered by biome. All gates off by default, enable via --max-cognitive or --complexity.',
    )
    .argument('[pattern]', 'glob, directory, or file to analyse')
    .option('--max-cognitive <n>', 'maximum cognitive complexity per function', Number)
    .option(
      '--complexity [profile]',
      `enable the cognitive gate using a named profile (${profileList}); omitting the value uses moderate. Profiles: ${profileDefaults}`,
    )
    .option('--ignore <glob>', 'ignore glob (repeatable)', collect, [])
    .action(
      async (pattern: string | undefined, opts: { maxCognitive?: number; complexity?: ComplexityProfile | true; ignore: string[] }) => {
        const result = await runCognitiveComplexity({
          maxThreshold: opts.maxCognitive,
          profile: resolveProfile(opts.complexity),
          ignore: opts.ignore.length ? opts.ignore : undefined,
          pattern,
        })
        finish(result.ok)
      },
    )
}
