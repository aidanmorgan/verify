/** Per-metric gate: a threshold value plus whether the gate is active. */
export type MetricGate = {
  /** Numeric threshold. */
  threshold: number
  /** When false the metric is computed and reported but never fails the check. Default: false. */
  enabled: boolean
}

export type PkgMetricsGates = {
  /** Relational cohesion H = (R+1)/N — fail when H < threshold. Higher is better (≥1.0). */
  cohesion: MetricGate
  /** Normal distance D = |A+I−1| — fail when D > threshold. Lower is better (≤0.3). */
  distance: MetricGate
  /** Instability I = Ce/(Ca+Ce) — fail when I > threshold. Lower is better if stability is desired. */
  instability: MetricGate
  /** Abstractness A — fail when A < threshold. */
  abstractness: MetricGate
  /** Afferent couplings Ca — fail when Ca > threshold. */
  afferentCouplings: MetricGate
  /** Efferent couplings Ce — fail when Ce > threshold. */
  efferentCouplings: MetricGate
  /** Number of exported classes N — fail when N > threshold. */
  numClasses: MetricGate
}

export type PackageMetrics = {
  name: string
  numClasses: number
  abstractness: number
  internalRelationships: number
  afferentCouplings: number
  efferentCouplings: number
  relationalCohesion: number
  instability: number
  normalDistance: number
}

export type MetricViolation = {
  metric: keyof PkgMetricsGates
  packages: PackageMetrics[]
}

export type PkgMetricsResult = {
  packages: PackageMetrics[]
  violations: MetricViolation[]
  passed: boolean
}
