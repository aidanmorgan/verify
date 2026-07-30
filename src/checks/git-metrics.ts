import { createRequire } from 'node:module'

import { loadVerifyConfig } from '../shared/config.ts'
import { computeChangeCohesion, computeChangeCoupling, computeChurn, walkCommits } from './git-metrics-core.ts'
import { PROFILES, resolveThresholds } from './git-metrics-profiles.ts'
import type { GitMetricsOptions } from './git-metrics-profiles.ts'
import { reportChurn, reportCohesion, reportCoupling, reportHotspot } from './git-metrics-reporters.ts'
import type { CheckResult } from './types.ts'

export type { GitMetricsOptions } from './git-metrics-profiles.ts'

const _require = createRequire(import.meta.url)

export function hasIsomorphicGit(cwd: string = process.cwd()): boolean {
  try {
    _require.resolve('isomorphic-git', { paths: [cwd] })
    return true
  } catch {
    return false
  }
}

export async function runGitMetrics(opts: GitMetricsOptions = {}): Promise<CheckResult> {
  const config = loadVerifyConfig()
  const section = config.gitMetrics
  const profile = opts.profile ?? section?.profile
  const profileDefaults = profile ? PROFILES[profile] : undefined
  const windowDays = opts.windowDays ?? section?.windowDays ?? 90
  const ignore: readonly string[] = [...(config.ignore ?? []), ...(opts.ignore ?? [])]

  const churnEnabled = opts.codeChurn?.enabled ?? section?.codeChurn?.enabled ?? false
  const hotspotEnabled = opts.hotspot?.enabled ?? section?.hotspot?.enabled ?? false
  const couplingEnabled = opts.changeCoupling?.enabled ?? section?.changeCoupling?.enabled ?? false
  const cohesionEnabled = opts.changeCohesion?.enabled ?? section?.changeCohesion?.enabled ?? false

  if (!churnEnabled && !hotspotEnabled && !couplingEnabled && !cohesionEnabled) {
    return { name: 'git-metrics', ok: true, skipped: true }
  }

  if (!hasIsomorphicGit()) {
    console.log(`git-metrics: isomorphic-git not installed — skipping (add it with \`npx verifyx init\`)`)
    return { name: 'git-metrics', ok: true, skipped: true }
  }

  const t = resolveThresholds(opts, profileDefaults)

  let commits: Awaited<ReturnType<typeof walkCommits>>
  try {
    commits = await walkCommits(process.cwd(), windowDays)
  } catch (err) {
    console.error(`git-metrics: failed to read git history — ${String(err)}`)
    return { name: 'git-metrics', ok: false }
  }

  let ok = true
  if (churnEnabled || hotspotEnabled) {
    const churnData = computeChurn(commits, process.cwd(), ignore)
    if (churnEnabled) ok = reportChurn(churnData, t.maxChurnRate) && ok
    if (hotspotEnabled) ok = reportHotspot(churnData, t.maxHotspot) && ok
  }
  if (couplingEnabled) ok = reportCoupling(computeChangeCoupling(commits, ignore), t.minCouplingRatio, t.minCouplingCommits) && ok
  if (cohesionEnabled) {
    const pkgRoot = config.pkgMetrics?.root ?? 'src'
    ok = reportCohesion(computeChangeCohesion(commits, pkgRoot, ignore), t.minCohesionRatio, t.minCohesionCommits) && ok
  }

  return { name: 'git-metrics', ok }
}
