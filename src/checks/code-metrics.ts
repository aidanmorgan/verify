import { loadVerifyConfig } from '../shared/config.ts'
import { analyzeCodeMetrics, printCodeMetricsReport, resolveCodeGates } from './code-metrics-core.ts'
import type { CodeMetricGate, CodeMetricsGates, ComplexityProfile } from './code-metrics-types.ts'
import { mergeGateOverrides } from './gate-helpers.ts'
import type { CheckResult } from './types.ts'

export type CodeMetricsCheckOptions = {
  pattern?: string
  ignore?: readonly string[]
  profile?: ComplexityProfile
  gates?: Partial<{ [K in keyof CodeMetricsGates]: Partial<CodeMetricGate> }>
}

export function runCodeMetrics(opts: CodeMetricsCheckOptions = {}): CheckResult {
  const config = loadVerifyConfig()
  const configSection = config.codeMetrics

  const pattern = opts.pattern ?? configSection?.pattern
  const ignore = [...(config.ignore ?? []), ...(configSection?.ignore ?? []), ...(opts.ignore ?? [])]
  const profile = opts.profile ?? configSection?.profile
  const mergedGates = mergeGateOverrides(configSection?.gates, opts.gates)
  const gates = resolveCodeGates(profile, mergedGates)

  const result = analyzeCodeMetrics({ pattern, ignore, profile, gates: mergedGates })
  printCodeMetricsReport(result, gates, profile)
  return { name: 'code-metrics', ok: result.passed }
}
