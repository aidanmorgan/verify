import fs from 'node:fs'
import path from 'node:path'

/** A rule for the forbidden-strings check: JSON values at `paths` in `file` must not match `disallowed`. */
export type ForbiddenStringsRule = {
  file: string
  paths: string[]
  disallowed: string
}

/** Per-metric gate stored in verify.config.json under `pkgMetrics.gates` or `codeMetrics.gates`. */
export type PkgMetricsGateConfig = {
  threshold?: number
  enabled?: boolean
}

export type VerifyConfig = {
  /** Glob patterns excluded from every native check. Merged with per-check ignore lists. */
  ignore?: string[]
  comments?: { ignore?: string[] }
  hardcodedColors?: { ignore?: string[]; root?: string }
  forbiddenStrings?: ForbiddenStringsRule[]
  pkgMetrics?: {
    /** Root directory whose immediate subdirectories are treated as packages. */
    root?: string
    /** Packages that are dependency-safe (overrides instability in normal-distance calculation). */
    safePackages?: string[]
    /** Per-metric threshold and enabled flag. */
    gates?: {
      cohesion?: PkgMetricsGateConfig
      distance?: PkgMetricsGateConfig
      instability?: PkgMetricsGateConfig
      abstractness?: PkgMetricsGateConfig
      afferentCouplings?: PkgMetricsGateConfig
      efferentCouplings?: PkgMetricsGateConfig
      numClasses?: PkgMetricsGateConfig
    }
  }
  codeMetrics?: {
    /** Glob pattern, directory, or file to analyse. Defaults to `{src,server,shared}/**\/*.ts`. */
    pattern?: string
    /** Extra ignore globs appended to the default test-file exclusions. */
    ignore?: string[]
    /** Enable all gates at a named threshold profile. Per-gate overrides in `gates` still apply on top. */
    profile?: 'light' | 'moderate' | 'aggressive'
    /** Per-metric threshold and enabled flag. Merged on top of the active profile (or defaults if no profile). */
    gates?: {
      cyclomaticComplexity?: PkgMetricsGateConfig
      cognitiveComplexity?: PkgMetricsGateConfig
      maintainabilityIndex?: PkgMetricsGateConfig
    }
  }
}

const CONFIG_FILE = 'verify.config.json'

function readJsonIfExists(file: string): unknown {
  if (!fs.existsSync(file)) return undefined
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return undefined
  }
}

/** Load per-repo check configuration from `verify.config.json`, falling back to a `verify` key in package.json. */
export function loadVerifyConfig(cwd: string = process.cwd()): VerifyConfig {
  const fromFile = readJsonIfExists(path.join(cwd, CONFIG_FILE))
  if (fromFile && typeof fromFile === 'object') return fromFile as VerifyConfig

  const pkg = readJsonIfExists(path.join(cwd, 'package.json'))
  if (pkg && typeof pkg === 'object' && 'verify' in pkg) {
    const verify = (pkg as { verify?: unknown }).verify
    if (verify && typeof verify === 'object') return verify as VerifyConfig
  }
  return {}
}
