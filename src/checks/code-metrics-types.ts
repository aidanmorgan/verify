/** Complexity profile: named set of thresholds. */
export type ComplexityProfile = 'light' | 'moderate' | 'aggressive'

/** Per-metric gate: a threshold value plus whether the gate is active. */
export type CodeMetricGate = {
  /** Numeric threshold. */
  threshold: number
  /** When false the metric is computed and reported but never fails the check. Default: false. */
  enabled: boolean
}

export type CodeMetricsGates = {
  /** Maintainability index (0–100) — fail when any file's minimum MI falls below threshold. Higher is better. */
  maintainabilityIndex: CodeMetricGate
}

export type FileComplexityScore = {
  file: string
  minMaintainability: number
  avgMaintainability: number
}

export type CodeMetricsResult = {
  files: FileComplexityScore[]
  violations: CodeMetricsViolation[]
  passed: boolean
}

export type CodeMetricsViolation = { kind: 'maintainabilityIndex'; files: FileComplexityScore[] }
