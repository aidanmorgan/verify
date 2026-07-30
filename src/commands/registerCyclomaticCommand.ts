import type { Command } from 'commander'

import { runCyclomaticComplexity } from '../checks/cyclomatic-complexity.ts'

function collect(value: string, previous: string[]): string[] {
  return [...previous, value]
}

export function registerCyclomaticCommand(program: Command, finish: (ok: boolean) => void): void {
  program
    .command('cyclomatic-complexity')
    .description(
      'Cyclomatic complexity gate — fail when any function exceeds the threshold, powered by oxlint. All gates off by default, enable via --max-cyclomatic or --complexity.',
    )
    .argument('[pattern]', 'glob, directory, or file to analyse')
    .option('--max-cyclomatic <n>', 'maximum cyclomatic complexity per function', Number)
    .option('--ignore <glob>', 'ignore glob (repeatable)', collect, [])
    .action(async (pattern: string | undefined, opts: { maxCyclomatic?: number; ignore: string[] }) => {
      const result = await runCyclomaticComplexity({
        maxThreshold: opts.maxCyclomatic,
        ignore: opts.ignore.length ? opts.ignore : undefined,
        pattern,
      })
      finish(result.ok)
    })
}
