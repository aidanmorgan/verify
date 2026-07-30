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

export type AdvancedMetricsProfile = 'light' | 'moderate' | 'aggressive'

export type VerifyConfig = {
  /** Override the package manager used to run verify:* scripts and the test step. Auto-detected from lockfiles when absent. */
  packageManager?: 'npm' | 'pnpm' | 'yarn' | 'bun'
  /** Test runner configuration. */
  test?: {
    /** 'vitest' runs vitest directly, forwarding --ignore globs as --exclude args. Default: 'npm-script'. */
    runner?: 'npm-script' | 'vitest'
    /** Extra args passed to vitest before any --exclude args (e.g. ['--reporter=verbose']). */
    vitestArgs?: string[]
  }
  /** Glob patterns excluded from every native check. Merged with per-check ignore lists. */
  ignore?: string[]
  comments?: { ignore?: string[] }
  hardcodedColors?: { ignore?: string[]; root?: string }
  forbiddenStrings?: ForbiddenStringsRule[]
  /**
   * Git-history metrics (code churn, hotspot, change coupling, change cohesion).
   * Requires `isomorphic-git` installed as a dev dependency. All gates disabled by default.
   */
  gitMetrics?: {
    profile?: AdvancedMetricsProfile
    /** Commit history window in days (default 90). */
    windowDays?: number
    codeChurn?: PkgMetricsGateConfig
    hotspot?: PkgMetricsGateConfig
    changeCoupling?: {
      enabled?: boolean
      /** Flag file pairs that change together in this fraction of commits involving either file (default 0.5). */
      minCouplingRatio?: number
      /** Minimum commits involving a file before it is eligible (default 5). */
      minCommits?: number
    }
    changeCohesion?: {
      enabled?: boolean
      /** Flag modules where fewer than this fraction of touches are multi-file (default 0.3). */
      minCohesionRatio?: number
      /** Minimum module-touching commits before the module is eligible (default 5). */
      minCommits?: number
    }
  }
  /** Dependency cycle detection via dependency-cruiser. Requires `dependency-cruiser` installed. Disabled by default. */
  depCycles?: {
    enabled?: boolean
    /** Source directory to analyse (default 'src'). */
    src?: string
  }
  /**
   * Module cohesion — flags files whose exports form disconnected responsibility clusters.
   * Requires `ts-morph` installed as a dev dependency. Disabled by default.
   */
  moduleCohesion?: {
    enabled?: boolean
    profile?: AdvancedMetricsProfile
    /** Glob pattern, directory or file to analyse (same default as codeMetrics.pattern). */
    pattern?: string
    /** Flag files with at least this many disconnected clusters (overrides profile). */
    minComponents?: number
    /** Minimum number of exports before a file is eligible — suppresses noise on tiny files (overrides profile). */
    minExports?: number
  }
  /**
   * Relational cohesion RC = (R+1)/N per module, where R = internal edges and N = files.
   * Reuses the dependency-cruiser graph. Requires `dependency-cruiser` installed. Disabled by default.
   */
  relationalCohesion?: {
    enabled?: boolean
    profile?: AdvancedMetricsProfile
    /** Flag modules with RC below this value (overrides profile). */
    minRC?: number
    /** Flag modules with RC above this value (overrides profile). */
    maxRC?: number
  }
  /**
   * Propagation cost from Design Structure Matrix analysis.
   * Reuses the dependency-cruiser graph. Requires `dependency-cruiser` installed. Disabled by default.
   */
  propagationCost?: {
    enabled?: boolean
    profile?: AdvancedMetricsProfile
    /** Flag when propagation cost exceeds this value (overrides profile). */
    threshold?: number
    /** Source directory to analyse (default 'src'). */
    src?: string
  }
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
