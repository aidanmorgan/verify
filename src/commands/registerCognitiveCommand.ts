import type { Command } from 'commander'

import { runCognitiveComplexity } from '../checks/cognitive-complexity.ts'

function collect(value: string, previous: string[]): string[] {
  return [...previous, value]
}

export function registerCognitiveCommand(program: Command, finish: (ok: boolean) => void): void {
  program
    .command('cognitive-complexity')
    .description(
      'Cognitive complexity gate (SonarSource algorithm) — fail when any function exceeds the threshold, powered by biome. All gates off by default, enable via --max-cognitive or --complexity.',
    )
    .argument('[pattern]', 'glob, directory, or file to analyse')
    .option('--max-cognitive <n>', 'maximum cognitive complexity per function', Number)
    .option('--ignore <glob>', 'ignore glob (repeatable)', collect, [])
    .action(async (pattern: string | undefined, opts: { maxCognitive?: number; ignore: string[] }) => {
      const result = await runCognitiveComplexity({
        maxThreshold: opts.maxCognitive,
        ignore: opts.ignore.length ? opts.ignore : undefined,
        pattern,
      })
      finish(result.ok)
    })
}
