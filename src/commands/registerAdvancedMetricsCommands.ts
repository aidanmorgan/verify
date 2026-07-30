import type { Command } from 'commander'

import { runGitMetrics } from '../checks/git-metrics.ts'
import { runPropagationCost, runRelationalCohesion } from '../checks/graph-metrics.ts'
import { runModuleCohesion } from '../checks/module-cohesion.ts'
import { collect } from './shared.ts'

export function registerAdvancedMetricsCommands(program: Command, finish: (ok: boolean) => void): void {
  program
    .command('git-metrics')
    .description('Git-history metrics: code churn, hotspot, change coupling, change cohesion')
    .option('--ignore <glob>', 'ignore glob (repeatable)', collect, [])
    .option('--window-days <n>', 'commit history window in days', Number)
    .option('--profile <name>', 'threshold profile: light | moderate | aggressive')
    .action(async (opts: { ignore: string[]; windowDays?: number; profile?: string }) => {
      const result = await runGitMetrics({ ignore: opts.ignore, windowDays: opts.windowDays, profile: opts.profile as never })
      finish(result.ok)
    })

  program
    .command('module-cohesion')
    .description('Module cohesion — flags files whose exports form disconnected responsibility clusters')
    .argument('[pattern]', 'glob, directory or file to analyse')
    .option('--ignore <glob>', 'ignore glob (repeatable)', collect, [])
    .option('--profile <name>', 'threshold profile: light | moderate | aggressive')
    .option('--min-components <n>', 'minimum disconnected clusters to flag', Number)
    .option('--min-exports <n>', 'minimum exports before a file is eligible', Number)
    .action((pattern: string | undefined, opts: { ignore: string[]; profile?: string; minComponents?: number; minExports?: number }) => {
      finish(
        runModuleCohesion({
          pattern,
          ignore: opts.ignore,
          profile: opts.profile as never,
          minComponents: opts.minComponents,
          minExports: opts.minExports,
          enabled: true,
        }).ok,
      )
    })

  program
    .command('relational-cohesion')
    .description('Relational cohesion RC=(R+1)/N per module from the dependency graph')
    .option('--ignore <glob>', 'ignore glob (repeatable)', collect, [])
    .option('--profile <name>', 'threshold profile: light | moderate | aggressive')
    .option('--min-rc <n>', 'minimum RC threshold', Number)
    .option('--max-rc <n>', 'maximum RC threshold', Number)
    .option('--src <dir>', 'source directory to analyse')
    .action((opts: { ignore: string[]; profile?: string; minRc?: number; maxRc?: number; src?: string }) => {
      finish(
        runRelationalCohesion({
          ignore: opts.ignore,
          profile: opts.profile as never,
          minRC: opts.minRc,
          maxRC: opts.maxRc,
          src: opts.src,
          enabled: true,
        }).ok,
      )
    })

  program
    .command('propagation-cost')
    .description('Propagation cost from DSM reachability analysis')
    .option('--ignore <glob>', 'ignore glob (repeatable)', collect, [])
    .option('--profile <name>', 'threshold profile: light | moderate | aggressive')
    .option('--threshold <n>', 'maximum propagation cost (0–1)', Number)
    .option('--src <dir>', 'source directory to analyse')
    .action((opts: { ignore: string[]; profile?: string; threshold?: number; src?: string }) => {
      finish(
        runPropagationCost({ ignore: opts.ignore, profile: opts.profile as never, threshold: opts.threshold, src: opts.src, enabled: true })
          .ok,
      )
    })
}
