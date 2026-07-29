type GateOverride = { threshold?: number; enabled?: boolean }
type GateOverrideMap = Partial<Record<string, GateOverride>>

/** Merge config-file gate overrides with CLI gate overrides; CLI takes precedence field-by-field. */
export function mergeGateOverrides<T extends GateOverrideMap>(configGates: T | undefined, cliGates: T | undefined): T | undefined {
  if (!configGates && !cliGates) return undefined
  const result: GateOverrideMap = {}
  const keys = new Set([...Object.keys(configGates ?? {}), ...Object.keys(cliGates ?? {})])
  for (const k of keys) {
    const c = configGates?.[k]
    const l = cliGates?.[k]
    const merged: GateOverride = {}
    if (c?.threshold !== undefined) merged.threshold = c.threshold
    if (c?.enabled !== undefined) merged.enabled = c.enabled
    if (l?.threshold !== undefined) merged.threshold = l.threshold
    if (l?.enabled !== undefined) merged.enabled = l.enabled
    result[k] = merged
  }
  return result as T
}
