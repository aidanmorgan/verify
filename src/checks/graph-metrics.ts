import { execFileSync } from 'node:child_process'
import path from 'node:path'

import { color } from '../shared/color.ts'
import { loadVerifyConfig } from '../shared/config.ts'
import type { AdvancedMetricsProfile } from '../shared/config.ts'
import { depcruiseIgnore } from './external-ignore.ts'
import { envWithLocalBin, hasLocalBin } from './external.ts'
import { computePropagationCost, computeRelationalCohesion, filterModules } from './graph-metrics-core.ts'
import type { DepModule, ModuleRC } from './graph-metrics-core.ts'
import { resolvePCThresholds, resolveRCThresholds } from './graph-metrics-profiles.ts'
import type { CheckResult } from './types.ts'

// ─── depcruiser runner ────────────────────────────────────────────────────────

type DepCruiserOutput = { modules: DepModule[] }

function runDepcruise(src: string, cwd: string, ignore: readonly string[]): DepModule[] {
  const depcruiseBin = path.join(cwd, 'node_modules', '.bin', 'depcruise')
  const ignoreHook = depcruiseIgnore()
  const { args, cleanup } = ignoreHook([...ignore], cwd)

  try {
    const stdout = execFileSync(depcruiseBin, ['--output-type', 'json', ...args, src], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, ...envWithLocalBin(cwd) },
      maxBuffer: 64 * 1024 * 1024,
    })
    const parsed = JSON.parse(stdout) as DepCruiserOutput
    return parsed.modules ?? []
  } finally {
    cleanup?.()
  }
}

function loadModules(src: string, globalIgnore: readonly string[], localIgnore: readonly string[]): DepModule[] | null {
  const ignore = [...globalIgnore, ...localIgnore]
  try {
    return filterModules(runDepcruise(src, process.cwd(), ignore), ignore)
  } catch {
    return null
  }
}

// ─── relational cohesion reporting ───────────────────────────────────────────

function reportRCLow(violations: ModuleRC[], minRC: number): void {
  if (violations.length === 0) return
  console.error(`\n${color.bold('relational-cohesion')} — ${violations.length} module(s) have low cohesion (RC < ${minRC}):`)
  for (const v of violations.sort((a, b) => a.rc - b.rc)) {
    console.error(
      `  ${`${v.module}/`.padEnd(40)}  RC=${v.rc.toFixed(2)}  (min: ${minRC}, files: ${v.files}, edges: ${v.internalEdges})  ← fix: files share no dependencies — review module boundary or add shared utilities`,
    )
  }
}

function reportRCHigh(violations: ModuleRC[], maxRC: number): void {
  if (violations.length === 0) return
  console.error(`\n${color.bold('relational-cohesion')} — ${violations.length} module(s) have high cohesion (RC > ${maxRC}):`)
  for (const v of violations.sort((a, b) => b.rc - a.rc)) {
    console.error(
      `  ${`${v.module}/`.padEnd(40)}  RC=${v.rc.toFixed(2)}  (max: ${maxRC}, files: ${v.files}, edges: ${v.internalEdges})  ← fix: over-coupled — extract shared utilities to reduce internal edge density`,
    )
  }
}

// ─── relational cohesion check ────────────────────────────────────────────────

export type RelationalCohesionOptions = {
  enabled?: boolean
  profile?: AdvancedMetricsProfile
  minRC?: number
  maxRC?: number
  ignore?: readonly string[]
  src?: string
}

export function runRelationalCohesion(opts: RelationalCohesionOptions = {}): CheckResult {
  const config = loadVerifyConfig()
  const section = config.relationalCohesion

  const enabled = opts.enabled ?? section?.enabled ?? false
  if (!enabled) return { name: 'relational-cohesion', ok: true, skipped: true }

  if (!hasLocalBin('depcruise')) {
    console.log(`relational-cohesion: dependency-cruiser not installed — skipping (add it with \`npx verifyx init\`)`)
    return { name: 'relational-cohesion', ok: true, skipped: true }
  }

  const { minRC, maxRC, src } = resolveRCThresholds(opts)
  const modules = loadModules(src, config.ignore ?? [], opts.ignore ?? [])
  if (!modules) {
    console.error('relational-cohesion: failed to run dependency-cruiser')
    return { name: 'relational-cohesion', ok: false }
  }

  const pkgRoot = config.pkgMetrics?.root ?? 'src'
  const rcData = computeRelationalCohesion(modules, pkgRoot)
  const lowViolations = rcData.filter((m) => m.rc < minRC && m.files >= 2)
  const highViolations = rcData.filter((m) => m.rc > maxRC)

  reportRCLow(lowViolations, minRC)
  reportRCHigh(highViolations, maxRC)

  return { name: 'relational-cohesion', ok: lowViolations.length === 0 && highViolations.length === 0 }
}

// ─── propagation cost check ───────────────────────────────────────────────────

export type PropagationCostOptions = {
  enabled?: boolean
  profile?: AdvancedMetricsProfile
  threshold?: number
  ignore?: readonly string[]
  src?: string
}

export function runPropagationCost(opts: PropagationCostOptions = {}): CheckResult {
  const config = loadVerifyConfig()
  const section = config.propagationCost

  const enabled = opts.enabled ?? section?.enabled ?? false
  if (!enabled) return { name: 'propagation-cost', ok: true, skipped: true }

  if (!hasLocalBin('depcruise')) {
    console.log(`propagation-cost: dependency-cruiser not installed — skipping (add it with \`npx verifyx init\`)`)
    return { name: 'propagation-cost', ok: true, skipped: true }
  }

  const { threshold, src } = resolvePCThresholds(opts)
  const modules = loadModules(src, config.ignore ?? [], opts.ignore ?? [])
  if (!modules) {
    console.error('propagation-cost: failed to run dependency-cruiser')
    return { name: 'propagation-cost', ok: false }
  }

  const cost = computePropagationCost(modules)
  const ok = cost <= threshold

  if (!ok) {
    console.error(
      `\n${color.bold('propagation-cost')}  cost=${cost.toFixed(3)}  (threshold: ${threshold})  ← fix: introduce a boundary module to reduce reachability across the graph`,
    )
  }

  return { name: 'propagation-cost', ok }
}
