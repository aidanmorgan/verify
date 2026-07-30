import fs from 'node:fs'

import { findSourceFiles, DEFAULT_IGNORE, DEFAULT_PATTERN, resolvePattern } from '../analyze.ts'
import { forEachFunction } from '../functions.ts'
import { calculateCyclomaticComplexity, calculateHalstead, calculateMaintainabilityIndex, countSloc } from '../metrics.ts'
import type {
  CodeMetricGate,
  CodeMetricsGates,
  CodeMetricsResult,
  CodeMetricsViolation,
  ComplexityProfile,
  FileComplexityScore,
} from './code-metrics-types.ts'

export type { CodeMetricGate, CodeMetricsGates, CodeMetricsResult, CodeMetricsViolation, ComplexityProfile, FileComplexityScore }
export { printCodeMetricsReport } from './code-metrics-report.ts'

// ─── defaults & profiles ─────────────────────────────────────────────────────

export const DEFAULT_CODE_GATES: CodeMetricsGates = {
  maintainabilityIndex: { threshold: 50, enabled: false },
}

/**
 * Named threshold profiles. The MI gate is enabled when a profile is active.
 *
 * - light:      permissive — catches only severe outliers; suitable for adopting in a large existing codebase
 * - moderate:   balanced — meaningful signal without excessive noise; good default for most projects
 * - aggressive: strict — appropriate for greenfield or recently refactored code
 */
export const COMPLEXITY_PROFILES: Record<ComplexityProfile, CodeMetricsGates> = {
  light: {
    maintainabilityIndex: { threshold: 20, enabled: true },
  },
  moderate: {
    maintainabilityIndex: { threshold: 35, enabled: true },
  },
  aggressive: {
    maintainabilityIndex: { threshold: 50, enabled: true },
  },
}

export type CodeMetricsOptions = {
  /** Glob pattern, directory, or file. Defaults to `{src,server,shared}/**\/*.ts`. */
  pattern?: string
  /** Extra ignore globs appended to the default test-file exclusions. */
  ignore?: readonly string[]
  /**
   * Enable the MI gate using a named threshold profile. When set, the gate is enabled using the
   * profile's threshold before per-gate overrides are applied. Defaults to `moderate` when
   * `--complexity` is passed without a value.
   */
  profile?: ComplexityProfile
  /** Per-metric gates (threshold + enabled). Merged over profile/defaults. */
  gates?: Partial<{ [K in keyof CodeMetricsGates]: Partial<CodeMetricGate> }>
}

export function resolveCodeGates(profile: ComplexityProfile | undefined, overrides: CodeMetricsOptions['gates']): CodeMetricsGates {
  const base = profile ? COMPLEXITY_PROFILES[profile] : DEFAULT_CODE_GATES
  if (!overrides) return base
  const result = { ...base } as CodeMetricsGates
  for (const key of Object.keys(overrides) as Array<keyof CodeMetricsGates>) {
    const override = overrides[key]
    if (!override) continue
    result[key] = { ...base[key], ...override }
  }
  return result
}

// ─── analysis ─────────────────────────────────────────────────────────────────

export function analyzeCodeMetrics(opts: CodeMetricsOptions = {}): CodeMetricsResult {
  const { pattern = DEFAULT_PATTERN } = opts
  const ignore = [...DEFAULT_IGNORE, ...(opts.ignore ?? [])]
  const files = findSourceFiles(resolvePattern(pattern), ignore)
  const gates = resolveCodeGates(opts.profile, opts.gates)

  const fileSloc = new Map<string, number>()
  const fileMI = new Map<string, number[]>()

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')
    fileSloc.set(file, countSloc(content))
    fileMI.set(file, [])
  }

  forEachFunction(files, (file, _name, node) => {
    const cyclomatic = calculateCyclomaticComplexity(node)
    const { volume } = calculateHalstead(node)
    const sloc = fileSloc.get(file) ?? 0
    const mi = calculateMaintainabilityIndex(volume, cyclomatic, sloc)
    fileMI.get(file)?.push(mi)
  })

  const fileScores: FileComplexityScore[] = []
  for (const file of files) {
    const scores = fileMI.get(file) ?? []
    if (scores.length === 0) continue
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    const min = Math.min(...scores)
    fileScores.push({ file, minMaintainability: min, avgMaintainability: avg })
  }

  const violations: CodeMetricsViolation[] = []

  if (gates.maintainabilityIndex.enabled) {
    const offenders = fileScores.filter((f) => f.minMaintainability < gates.maintainabilityIndex.threshold)
    if (offenders.length > 0) violations.push({ kind: 'maintainabilityIndex', files: offenders })
  }

  return { files: fileScores, violations, passed: violations.length === 0 }
}
