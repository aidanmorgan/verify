import type { Command } from 'commander'

import { runPkgMetrics } from '../checks/pkg-metrics.ts'
import { DEFAULT_GATES } from '../pkg-metrics.ts'

function collect(value: string, previous: string[]): string[] {
  return [...previous, value]
}

type PkgMetricsOpts = {
  root?: string
  safe: string[]
  minCohesion?: number
  cohesion?: boolean
  maxDistance?: number
  distance?: boolean
  maxInstability?: number
  instability?: boolean
  minAbstractness?: number
  abstractness?: boolean
  maxAfferent?: number
  afferent?: boolean
  maxEfferent?: number
  efferent?: boolean
  maxClasses?: number
  numClasses?: boolean
}

function buildGates(opts: PkgMetricsOpts) {
  return {
    cohesion: { threshold: opts.minCohesion, enabled: opts.cohesion },
    distance: { threshold: opts.maxDistance, enabled: opts.distance },
    instability: { threshold: opts.maxInstability, enabled: opts.instability },
    abstractness: { threshold: opts.minAbstractness, enabled: opts.abstractness },
    afferentCouplings: { threshold: opts.maxAfferent, enabled: opts.afferent },
    efferentCouplings: { threshold: opts.maxEfferent, enabled: opts.efferent },
    numClasses: { threshold: opts.maxClasses, enabled: opts.numClasses },
  }
}

export function registerPkgMetricsCommand(program: Command, finish: (ok: boolean) => void): void {
  program
    .command('pkg-metrics')
    .description(
      'Package architecture metrics: cohesion (H), distance (D), instability (I), abstractness (A), couplings (Ca/Ce), size (N) — all gates off by default, enable per-gate via flags',
    )
    .option('--root <dir>', 'directory whose immediate subdirectories are treated as packages (default: src/)')
    .option('--safe <pkg>', 'mark a package as dependency-safe (repeatable)', collect, [])
    .option('--min-cohesion <n>', `minimum relational cohesion H (default: ${DEFAULT_GATES.cohesion.threshold})`, Number)
    .option('--no-cohesion', 'disable the cohesion gate')
    .option('--cohesion', 'enable the cohesion gate')
    .option('--max-distance <n>', `maximum normal distance D (default: ${DEFAULT_GATES.distance.threshold})`, Number)
    .option('--no-distance', 'disable the distance gate')
    .option('--distance', 'enable the distance gate')
    .option('--max-instability <n>', `maximum instability I (default: ${DEFAULT_GATES.instability.threshold})`, Number)
    .option('--no-instability', 'disable the instability gate')
    .option('--instability', 'enable the instability gate')
    .option('--min-abstractness <n>', `minimum abstractness A (default: ${DEFAULT_GATES.abstractness.threshold})`, Number)
    .option('--no-abstractness', 'disable the abstractness gate')
    .option('--abstractness', 'enable the abstractness gate')
    .option('--max-afferent <n>', `maximum afferent couplings Ca (default: ${DEFAULT_GATES.afferentCouplings.threshold})`, Number)
    .option('--no-afferent', 'disable the afferent couplings gate')
    .option('--afferent', 'enable the afferent couplings gate')
    .option('--max-efferent <n>', `maximum efferent couplings Ce (default: ${DEFAULT_GATES.efferentCouplings.threshold})`, Number)
    .option('--no-efferent', 'disable the efferent couplings gate')
    .option('--efferent', 'enable the efferent couplings gate')
    .option('--max-classes <n>', `maximum exported symbols N (default: ${DEFAULT_GATES.numClasses.threshold})`, Number)
    .option('--no-num-classes', 'disable the num-classes gate')
    .option('--num-classes', 'enable the num-classes gate')
    .action((opts: PkgMetricsOpts) => {
      finish(
        runPkgMetrics({
          root: opts.root,
          safePackages: opts.safe.length ? opts.safe : undefined,
          gates: buildGates(opts),
        }).ok,
      )
    })
}
