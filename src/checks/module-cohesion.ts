import { createRequire } from 'node:module'
import path from 'node:path'

import { minimatch } from 'minimatch'

const _require = createRequire(import.meta.url)

import { color } from '../shared/color.ts'
import { loadVerifyConfig } from '../shared/config.ts'
import type { AdvancedMetricsProfile } from '../shared/config.ts'
import { analyzeFile } from './module-cohesion-analysis.ts'
import type { FileResult } from './module-cohesion-analysis.ts'
import type { CheckResult } from './types.ts'

// ─── optional dep guard ──────────────────────────────────────────────────────

export function hasTsMorph(cwd: string = process.cwd()): boolean {
  try {
    _require.resolve('ts-morph', { paths: [cwd] })
    return true
  } catch {
    return false
  }
}

// ─── profile defaults ────────────────────────────────────────────────────────

type ModuleCohesionProfileValues = { minComponents: number; minExports: number }

const PROFILES: Record<AdvancedMetricsProfile, ModuleCohesionProfileValues> = {
  light: { minComponents: 3, minExports: 6 },
  moderate: { minComponents: 2, minExports: 5 },
  aggressive: { minComponents: 2, minExports: 4 },
}

// ─── file collection ─────────────────────────────────────────────────────────

function collectFiles(pattern: string, ignore: readonly string[], cwdRequire: NodeRequire): string[] {
  const { globSync } = cwdRequire('glob') as { globSync: (pattern: string, opts: { absolute: boolean }) => string[] }
  const files = globSync(pattern, { absolute: true })
  const cwd = process.cwd()
  return files.filter((f: string) => {
    const rel = path.relative(cwd, f)
    return !ignore.some((g) => minimatch(rel, g))
  })
}

// ─── reporting ───────────────────────────────────────────────────────────────

function reportViolations(violations: FileResult[], minComponents: number): void {
  if (violations.length === 0) return
  console.error(`\n${color.bold('module-cohesion')} — ${violations.length} file(s) have disconnected responsibility clusters:`)
  const cwd = process.cwd()
  for (const v of violations.sort((a, b) => b.components - a.components)) {
    const rel = path.relative(cwd, v.file)
    console.error(
      `  ${rel.padEnd(60)}  ${v.components} disconnected clusters  (exports: ${v.exportCount}, threshold: ${minComponents})  ← fix: split into ${v.components} files — exports form ${v.components} disconnected responsibility groups`,
    )
  }
}

// ─── options resolution ───────────────────────────────────────────────────────

function resolveOpts(opts: ModuleCohesionOptions): {
  minComponents: number
  minExports: number
  pattern: string
  ignore: readonly string[]
} {
  const config = loadVerifyConfig()
  const section = config.moduleCohesion
  const profile = opts.profile ?? section?.profile
  const p = profile ? PROFILES[profile] : PROFILES.moderate
  return {
    minComponents: opts.minComponents ?? section?.minComponents ?? p.minComponents,
    minExports: opts.minExports ?? section?.minExports ?? p.minExports,
    pattern: opts.pattern ?? section?.pattern ?? '{src,server,shared}/**/*.ts',
    ignore: [...(config.ignore ?? []), ...(opts.ignore ?? [])],
  }
}

// ─── main check ──────────────────────────────────────────────────────────────

export type ModuleCohesionOptions = {
  enabled?: boolean
  profile?: AdvancedMetricsProfile
  pattern?: string
  minComponents?: number
  minExports?: number
  ignore?: readonly string[]
}

export function runModuleCohesion(opts: ModuleCohesionOptions = {}): CheckResult {
  const config = loadVerifyConfig()
  const section = config.moduleCohesion

  const enabled = opts.enabled ?? section?.enabled ?? false
  if (!enabled) return { name: 'module-cohesion', ok: true, skipped: true }

  if (!hasTsMorph()) {
    console.log(`module-cohesion: ts-morph not installed — skipping (add it with \`npx verifyx init\`)`)
    return { name: 'module-cohesion', ok: true, skipped: true }
  }

  const { minComponents, minExports, pattern, ignore } = resolveOpts(opts)
  const cwdRequire = createRequire(path.join(process.cwd(), 'index.js'))
  const violations: FileResult[] = []

  for (const file of collectFiles(pattern, ignore, cwdRequire)) {
    try {
      const result = analyzeFile(file, cwdRequire)
      if (result.exportCount >= minExports && result.components >= minComponents) violations.push(result)
    } catch {
      // Skip files that can't be parsed
    }
  }

  reportViolations(violations, minComponents)
  return { name: 'module-cohesion', ok: violations.length === 0 }
}
