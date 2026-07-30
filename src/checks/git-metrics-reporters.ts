import { color } from '../shared/color.ts'
import type { computeChangeCohesion, computeChangeCoupling, computeChurn } from './git-metrics-core.ts'

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length)
}

export function reportChurn(churnData: ReturnType<typeof computeChurn>, maxChurnRate: number): boolean {
  const violations = churnData.filter((f) => f.churnRate > maxChurnRate)
  if (violations.length === 0) return true
  console.error(`\n${color.bold('code-churn')} — ${violations.length} file(s) exceed churn rate ${maxChurnRate}:`)
  for (const v of violations.sort((a, b) => b.churnRate - a.churnRate)) {
    console.error(
      `  ${pad(v.file, 50)}  churn=${v.churnRate.toFixed(2)}  (${v.commitCount} commits, threshold: ${maxChurnRate})  ← fix: stabilise change rate or decompose into smaller files`,
    )
  }
  return false
}

export function reportHotspot(churnData: ReturnType<typeof computeChurn>, maxHotspot: number): boolean {
  const violations = churnData.filter((f) => f.churnRate > maxHotspot)
  if (violations.length === 0) return true
  console.error(`\n${color.bold('hotspot')} — ${violations.length} file(s) exceed hotspot score ${maxHotspot}:`)
  for (const v of violations.sort((a, b) => b.churnRate - a.churnRate)) {
    console.error(
      `  ${pad(v.file, 50)}  hotspot=${v.churnRate.toFixed(2)}  (${v.commitCount} commits, threshold: ${maxHotspot})  ← fix: reduce complexity first (extract functions), then stabilise change rate`,
    )
  }
  return false
}

export function reportCoupling(
  pairs: ReturnType<typeof computeChangeCoupling>,
  minCouplingRatio: number,
  minCouplingCommits: number,
): boolean {
  const violations = pairs.filter((p) => p.ratio >= minCouplingRatio && p.coChanges >= minCouplingCommits)
  if (violations.length === 0) return true
  console.error(`\n${color.bold('change-coupling')} — ${violations.length} file pair(s) change together suspiciously often:`)
  for (const v of violations.sort((a, b) => b.ratio - a.ratio)) {
    console.error(
      `  ${pad(`${v.fileA} ↔ ${v.fileB}`, 70)}  coupling=${v.ratio.toFixed(2)}  (threshold: ${minCouplingRatio})  ← fix: merge files or extract a shared abstraction they both depend on`,
    )
  }
  return false
}

export function reportCohesion(
  modules: ReturnType<typeof computeChangeCohesion>,
  minCohesionRatio: number,
  minCohesionCommits: number,
): boolean {
  const violations = modules.filter((m) => m.touchingCommits >= minCohesionCommits && m.cohesionRatio < minCohesionRatio)
  if (violations.length === 0) return true
  console.error(`\n${color.bold('change-cohesion')} — ${violations.length} module(s) have low change cohesion:`)
  for (const v of violations.sort((a, b) => a.cohesionRatio - b.cohesionRatio)) {
    console.error(
      `  ${pad(`${v.module}/`, 40)}  cohesion=${v.cohesionRatio.toFixed(2)}  (min: ${minCohesionRatio}, commits: ${v.touchingCommits})  ← fix: review module boundary — files change independently, may not belong together`,
    )
  }
  return false
}
