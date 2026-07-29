import { loadVerifyConfig } from '../shared/config.ts'
import { mergeGateOverrides } from './gate-helpers.ts'
import { analyzePkgMetrics, printPkgMetricsReport, resolveGates } from './pkg-metrics-core.ts'
import type { MetricGate, PkgMetricsGates } from './pkg-metrics-types.ts'
import type { CheckResult } from './types.ts'

export type PkgMetricsCheckOptions = {
  root?: string
  gates?: Partial<{ [K in keyof PkgMetricsGates]: Partial<MetricGate> }>
  safePackages?: readonly string[]
  ignore?: readonly string[]
}

export function runPkgMetrics(opts: PkgMetricsCheckOptions = {}): CheckResult {
  const config = loadVerifyConfig()
  const configPkg = config.pkgMetrics

  const root = opts.root ?? configPkg?.root
  const safePackages = opts.safePackages ?? configPkg?.safePackages ?? []
  const mergedGates = mergeGateOverrides(configPkg?.gates, opts.gates)
  const gates = resolveGates(mergedGates)
  const ignore = [...(config.ignore ?? []), ...(opts.ignore ?? [])]

  const result = analyzePkgMetrics({ root, gates: mergedGates, safePackages, ignore })
  printPkgMetricsReport(result, gates)
  return { name: 'pkg-metrics', ok: result.passed }
}
