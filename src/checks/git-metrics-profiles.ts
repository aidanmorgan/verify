import { loadVerifyConfig } from '../shared/config.ts'
import type { AdvancedMetricsProfile } from '../shared/config.ts'

export type GitMetricsOptions = {
  ignore?: readonly string[]
  profile?: AdvancedMetricsProfile
  windowDays?: number
  codeChurn?: { enabled?: boolean; threshold?: number }
  hotspot?: { enabled?: boolean; threshold?: number }
  changeCoupling?: { enabled?: boolean; minCouplingRatio?: number; minCommits?: number }
  changeCohesion?: { enabled?: boolean; minCohesionRatio?: number; minCommits?: number }
}

export type GitMetricProfiles = {
  codeChurn: { maxChurnRate: number }
  hotspot: { maxScore: number }
  changeCoupling: { minCouplingRatio: number }
  changeCohesion: { minCohesionRatio: number }
}

export const PROFILES: Record<AdvancedMetricsProfile, GitMetricProfiles> = {
  light: {
    codeChurn: { maxChurnRate: 0.9 },
    hotspot: { maxScore: 0.85 },
    changeCoupling: { minCouplingRatio: 0.8 },
    changeCohesion: { minCohesionRatio: 0.1 },
  },
  moderate: {
    codeChurn: { maxChurnRate: 0.75 },
    hotspot: { maxScore: 0.65 },
    changeCoupling: { minCouplingRatio: 0.65 },
    changeCohesion: { minCohesionRatio: 0.2 },
  },
  aggressive: {
    codeChurn: { maxChurnRate: 0.55 },
    hotspot: { maxScore: 0.45 },
    changeCoupling: { minCouplingRatio: 0.5 },
    changeCohesion: { minCohesionRatio: 0.3 },
  },
}

export function resolveThresholds(opts: GitMetricsOptions, p: GitMetricProfiles | undefined) {
  const s = loadVerifyConfig().gitMetrics
  return {
    maxChurnRate: opts.codeChurn?.threshold ?? s?.codeChurn?.threshold ?? p?.codeChurn.maxChurnRate ?? 0.75,
    maxHotspot: opts.hotspot?.threshold ?? s?.hotspot?.threshold ?? p?.hotspot.maxScore ?? 0.65,
    minCouplingRatio:
      opts.changeCoupling?.minCouplingRatio ?? s?.changeCoupling?.minCouplingRatio ?? p?.changeCoupling.minCouplingRatio ?? 0.65,
    minCouplingCommits: opts.changeCoupling?.minCommits ?? s?.changeCoupling?.minCommits ?? 5,
    minCohesionRatio:
      opts.changeCohesion?.minCohesionRatio ?? s?.changeCohesion?.minCohesionRatio ?? p?.changeCohesion.minCohesionRatio ?? 0.2,
    minCohesionCommits: opts.changeCohesion?.minCommits ?? s?.changeCohesion?.minCommits ?? 5,
  }
}
