import { loadVerifyConfig } from '../shared/config.ts'
import type { AdvancedMetricsProfile } from '../shared/config.ts'

type RCOpts = { profile?: AdvancedMetricsProfile; minRC?: number; maxRC?: number; src?: string }
type PCOpts = { profile?: AdvancedMetricsProfile; threshold?: number; src?: string }

const RC_PROFILES: Record<AdvancedMetricsProfile, { minRC: number; maxRC: number }> = {
  light: { minRC: 0.5, maxRC: 6.0 },
  moderate: { minRC: 0.75, maxRC: 5.0 },
  aggressive: { minRC: 1.0, maxRC: 4.0 },
}

const PC_PROFILES: Record<AdvancedMetricsProfile, { threshold: number }> = {
  light: { threshold: 0.8 },
  moderate: { threshold: 0.6 },
  aggressive: { threshold: 0.4 },
}

export function resolveRCThresholds(opts: RCOpts): { minRC: number; maxRC: number; src: string } {
  const config = loadVerifyConfig()
  const section = config.relationalCohesion
  const profile = opts.profile ?? section?.profile
  const p = profile ? RC_PROFILES[profile] : RC_PROFILES.moderate
  return {
    minRC: opts.minRC ?? section?.minRC ?? p.minRC,
    maxRC: opts.maxRC ?? section?.maxRC ?? p.maxRC,
    src: opts.src ?? config.propagationCost?.src ?? 'src',
  }
}

export function resolvePCThresholds(opts: PCOpts): { threshold: number; src: string } {
  const config = loadVerifyConfig()
  const section = config.propagationCost
  const profile = opts.profile ?? section?.profile
  const p = profile ? PC_PROFILES[profile] : PC_PROFILES.moderate
  return {
    threshold: opts.threshold ?? section?.threshold ?? p.threshold,
    src: opts.src ?? section?.src ?? 'src',
  }
}
