import fs from 'node:fs'
import path from 'node:path'

import { minimatch } from 'minimatch'

import { color } from '../shared/color.ts'
import { analyzePackage, type RawPackageData } from './pkg-metrics-ast.ts'
import type { MetricGate, MetricViolation, PackageMetrics, PkgMetricsGates, PkgMetricsResult } from './pkg-metrics-types.ts'

export type { MetricGate, MetricViolation, PackageMetrics, PkgMetricsGates, PkgMetricsResult }

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
  /** Glob patterns matched against package directory paths — matching packages are excluded. */
  ignore?: readonly string[]
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
  const ignoreGlobs = opts.ignore ?? []
  const gates = resolveGates(opts.gates)
  const absRoot = path.resolve(opts.root ?? 'src')

  if (!fs.existsSync(absRoot)) return { packages: [], violations: [], passed: true }

  const packageDirs = (fs.readdirSync(absRoot, { withFileTypes: true }) as fs.Dirent[])
    .filter((e) => e.isDirectory())
    .map((e) => ({ name: e.name, dir: path.join(absRoot, e.name) }))
    .filter((p) => !ignoreGlobs.some((g) => minimatch(p.dir, g) || minimatch(p.name, g)))

  if (packageDirs.length === 0) return { packages: [], violations: [], passed: true }

  const allDirs = packageDirs.map((p) => p.dir)
  const rawData = packageDirs.map((p) => analyzePackage(p.name, p.dir, allDirs, ignoreGlobs))
  const afferentMap = buildAfferentMap(rawData)
  const packages = rawData.map((pkg) => computePackageMetrics(pkg, afferentMap.get(pkg.name) ?? 0, safePackages))
  const violations = collectViolations(packages, gates)
  return { packages, violations, passed: violations.length === 0 }
}

// ─── report ───────────────────────────────────────────────────────────────────

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

  for (const { metric, packages: offenders } of result.violations) {
    console.error(color.red(`\nFail [${metric}]: ${offenders.map((p) => p.name).join(', ')}`))
    console.error(METRIC_DESCRIPTIONS[metric])
  }
}
