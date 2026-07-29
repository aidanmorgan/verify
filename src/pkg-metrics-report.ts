import type { MetricGate, MetricViolation, PkgMetricsGates, PkgMetricsResult } from './pkg-metrics-types.ts'
import { color } from './shared/color.ts'

const MAX_METRICS = new Set<keyof PkgMetricsGates>(['distance', 'instability', 'afferentCouplings', 'efferentCouplings', 'numClasses'])

const METRIC_DESCRIPTIONS: Record<keyof PkgMetricsGates, string> = {
  cohesion: 'H (relational cohesion = (R+1)/N): too few internal dependencies between exported symbols — package may need splitting',
  distance:
    'D (normal distance = |A+I−1|): too far from the main sequence — package is either painfully concrete+stable, or uselessly abstract+instable',
  instability: 'I (instability = Ce/(Ca+Ce)): package depends heavily on others while few depend on it',
  abstractness: 'A (abstractness = abstract/total): too few abstract types exported — consider extracting interfaces',
  afferentCouplings: 'Ca (afferent couplings): too many other packages depend on this one',
  efferentCouplings: 'Ce (efferent couplings): package depends on too many other packages',
  numClasses: 'N (exported symbols): package exports too many symbols — consider splitting',
}

function formatActiveGates(gates: PkgMetricsGates): string {
  return (Object.entries(gates) as [keyof PkgMetricsGates, MetricGate][])
    .filter(([, g]) => g.enabled)
    .map(([k, g]) => `${k}${MAX_METRICS.has(k) ? `≤${g.threshold}` : `≥${g.threshold}`}`)
    .join('  ')
}

function printViolations(violations: readonly MetricViolation[]): void {
  for (const { metric, packages: offenders } of violations) {
    console.error(color.red(`\nFail [${metric}]: ${offenders.map((p) => p.name).join(', ')}`))
    console.error(METRIC_DESCRIPTIONS[metric])
  }
}

export function printPkgMetricsReport(result: PkgMetricsResult, gates: PkgMetricsGates): void {
  if (result.packages.length === 0) {
    console.log(color.yellow('pkg-metrics: no packages found — skipping'))
    return
  }

  const activeGates = formatActiveGates(gates)
  if (!activeGates) {
    console.log(color.dim(`pkg-metrics: no active gates — skipping (${result.packages.length} packages analyzed)`))
    return
  }

  if (result.passed) {
    console.log(color.green(`All packages pass (${result.packages.length} packages, gates: ${activeGates})`))
    return
  }

  printViolations(result.violations)
}
