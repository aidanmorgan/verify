import type { PkgMetricsGates } from '../pkg-metrics.ts'
import { analyzePkgMetrics, type MetricGate, printPkgMetricsReport, resolveGates } from '../pkg-metrics.ts'
import { loadVerifyConfig } from '../shared/config.ts'
import type { CheckResult } from './types.ts'

export type PkgMetricsCheckOptions = {
  root?: string
  gates?: Partial<{ [K in keyof PkgMetricsGates]: Partial<MetricGate> }>
  safePackages?: readonly string[]
}

function mergeGates(
  configGates: PkgMetricsCheckOptions['gates'],
  cliGates: PkgMetricsCheckOptions['gates'],
): PkgMetricsCheckOptions['gates'] {
  if (!configGates && !cliGates) return undefined
  const result: PkgMetricsCheckOptions['gates'] = {}
  const keys = new Set([...Object.keys(configGates ?? {}), ...Object.keys(cliGates ?? {})]) as Set<keyof PkgMetricsGates>
  for (const k of keys) {
    const c = configGates?.[k]
    const l = cliGates?.[k]
    const merged: Partial<MetricGate> = {}
    if (c?.threshold !== undefined) merged.threshold = c.threshold
    if (c?.enabled !== undefined) merged.enabled = c.enabled
    // CLI takes precedence over config
    if (l?.threshold !== undefined) merged.threshold = l.threshold
    if (l?.enabled !== undefined) merged.enabled = l.enabled
    result[k] = merged
  }
  return result
}

export function runPkgMetrics(opts: PkgMetricsCheckOptions = {}): CheckResult {
  const config = loadVerifyConfig()
  const configPkg = config.pkgMetrics

  const root = opts.root ?? configPkg?.root
  const safePackages = opts.safePackages ?? configPkg?.safePackages ?? []
  const mergedGates = mergeGates(configPkg?.gates, opts.gates)
  const gates = resolveGates(mergedGates)

  const result = analyzePkgMetrics({ root, gates: mergedGates, safePackages })
  printPkgMetricsReport(result, gates)
  return { name: 'pkg-metrics', ok: result.passed }
}
