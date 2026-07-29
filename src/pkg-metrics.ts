import fs from 'node:fs'
import path from 'node:path'

import { analyzePackage, type RawPackageData } from './pkg-metrics-ast.ts'
import type { MetricGate, MetricViolation, PackageMetrics, PkgMetricsGates, PkgMetricsResult } from './pkg-metrics-types.ts'

export type { MetricGate, MetricViolation, PackageMetrics, PkgMetricsGates, PkgMetricsResult } from './pkg-metrics-types.ts'
export { printPkgMetricsReport } from './pkg-metrics-report.ts'

// ─── gates ───────────────────────────────────────────────────────────────────

export const DEFAULT_GATES: PkgMetricsGates = {
  cohesion: { threshold: 1.0, enabled: false },
  distance: { threshold: 0.3, enabled: false },
  instability: { threshold: 1.0, enabled: false },
  abstractness: { threshold: 0.0, enabled: false },
  afferentCouplings: { threshold: 50, enabled: false },
  efferentCouplings: { threshold: 50, enabled: false },
  numClasses: { threshold: 100, enabled: false },
}

export type PkgMetricsOptions = {
  /** Root directory whose immediate subdirectories are treated as packages. Defaults to src/. */
  root?: string
  /** Per-metric gates (threshold + enabled). Merged over defaults. */
  gates?: Partial<{ [K in keyof PkgMetricsGates]: Partial<MetricGate> }>
  /** Packages that are dependency-safe (overrides instability in D calculation). */
  safePackages?: readonly string[]
}

export function resolveGates(overrides: PkgMetricsOptions['gates']): PkgMetricsGates {
  if (!overrides) return DEFAULT_GATES
  const result = { ...DEFAULT_GATES } as PkgMetricsGates
  for (const key of Object.keys(overrides) as Array<keyof PkgMetricsGates>) {
    const override = overrides[key]
    if (!override) continue
    result[key] = { ...DEFAULT_GATES[key], ...override }
  }
  return result
}

// ─── violation checking ───────────────────────────────────────────────────────

type MetricSelector = (p: PackageMetrics) => number

const METRIC_SELECTORS: Record<keyof PkgMetricsGates, MetricSelector> = {
  cohesion: (p) => p.relationalCohesion,
  distance: (p) => p.normalDistance,
  instability: (p) => p.instability,
  abstractness: (p) => p.abstractness,
  afferentCouplings: (p) => p.afferentCouplings,
  efferentCouplings: (p) => p.efferentCouplings,
  numClasses: (p) => p.numClasses,
}

const MAX_METRICS = new Set<keyof PkgMetricsGates>(['distance', 'instability', 'afferentCouplings', 'efferentCouplings', 'numClasses'])

function isViolating(metric: keyof PkgMetricsGates, value: number, gate: MetricGate): boolean {
  if (!gate.enabled) return false
  return MAX_METRICS.has(metric) ? value > gate.threshold : value < gate.threshold
}

function collectViolations(packages: PackageMetrics[], gates: PkgMetricsGates): MetricViolation[] {
  const violations: MetricViolation[] = []
  for (const metric of Object.keys(gates) as Array<keyof PkgMetricsGates>) {
    const offenders = packages.filter((p) => p.numClasses > 0 && isViolating(metric, METRIC_SELECTORS[metric](p), gates[metric]))
    if (offenders.length > 0) violations.push({ metric, packages: offenders })
  }
  return violations
}

// ─── package metrics computation ─────────────────────────────────────────────

function buildAfferentMap(rawData: readonly RawPackageData[]): Map<string, number> {
  const map = new Map<string, number>(rawData.map((p) => [p.name, 0]))
  for (const pkg of rawData) {
    for (const target of pkg.efferentTargets) {
      map.set(target, (map.get(target) ?? 0) + 1)
    }
  }
  return map
}

function computePackageMetrics(pkg: RawPackageData, afferentCouplings: number, safePackages: readonly string[]): PackageMetrics {
  const efferentCouplings = pkg.efferentTargets.length
  const totalCouplings = afferentCouplings + efferentCouplings
  const instability = totalCouplings > 0 ? efferentCouplings / totalCouplings : 0
  const abstractness = pkg.numClasses > 0 ? pkg.numAbstract / pkg.numClasses : 0
  const effectiveInstability = safePackages.includes(pkg.name) ? abstractness : instability
  const normalDistance = Math.abs(abstractness + effectiveInstability - 1)
  const relationalCohesion = pkg.numClasses > 0 ? (pkg.internalRelationships + 1) / pkg.numClasses : 1
  return {
    name: pkg.name,
    numClasses: pkg.numClasses,
    abstractness,
    internalRelationships: pkg.internalRelationships,
    afferentCouplings,
    efferentCouplings,
    relationalCohesion,
    instability,
    normalDistance,
  }
}

export function analyzePkgMetrics(opts: PkgMetricsOptions = {}): PkgMetricsResult {
  const safePackages = opts.safePackages ?? []
  const gates = resolveGates(opts.gates)
  const absRoot = path.resolve(opts.root ?? 'src')

  if (!fs.existsSync(absRoot)) return { packages: [], violations: [], passed: true }

  const packageDirs = (fs.readdirSync(absRoot, { withFileTypes: true }) as fs.Dirent[])
    .filter((e) => e.isDirectory())
    .map((e) => ({ name: e.name, dir: path.join(absRoot, e.name) }))

  if (packageDirs.length === 0) return { packages: [], violations: [], passed: true }

  const allDirs = packageDirs.map((p) => p.dir)
  const rawData = packageDirs.map((p) => analyzePackage(p.name, p.dir, allDirs))
  const afferentMap = buildAfferentMap(rawData)
  const packages = rawData.map((pkg) => computePackageMetrics(pkg, afferentMap.get(pkg.name) ?? 0, safePackages))
  const violations = collectViolations(packages, gates)
  return { packages, violations, passed: violations.length === 0 }
}
