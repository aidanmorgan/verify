import fs from 'node:fs'
import path from 'node:path'

import { envWithLocalBin, hasLocalBin } from '../checks/external.ts'
import type { VerifyConfig } from '../shared/config.ts'
import { type PackageManager, resolvePackageManager, runScriptCommand } from '../shared/packageManager.ts'
import { loadPackageScripts, type VerifyEntry } from './resolveEntries.ts'

/** The `verify:*` check name the tests step owns, so it isn't also run in the normal batch. */
export const TEST_CHECK_NAME = 'test'

/**
 * A test entry is either a shell command (npm-script runner) or a direct argv invocation (vitest runner).
 * Using a discriminated union keeps `VerifyEntry` unchanged and limits the blast radius to the two callers
 * that actually run the test step.
 */
export type TestEntry =
  | { kind: 'shell'; name: string; command: string; cwd: string }
  | { kind: 'argv'; name: string; argv: string[]; cwd: string; env: Record<string, string> }

export type TestsOptions = {
  noTests?: boolean
  ignore?: readonly string[]
  pm?: PackageManager
  testConfig?: VerifyConfig['test']
}

/**
 * Which npm script the automatic tests step runs. Locally it prefers an explicit `verify:test`, falling back
 * to the standard `test` script. On CI it runs only `test:ci` (CI usually needs a different invocation, e.g.
 * emitting junit.xml), so a plain `test` never runs there. Returns null when no applicable script exists.
 */
export function resolveTestScript(scripts: Record<string, string>, ci: boolean): string | null {
  const order = ci ? ['test:ci'] : ['verify:test', 'test']
  return order.find((name) => name in scripts) ?? null
}

const VITEST_CONFIG_FILES = [
  'vitest.config.ts',
  'vitest.config.js',
  'vitest.config.mts',
  'vitest.config.mjs',
  'vitest.workspace.ts',
  'vitest.workspace.js',
]

function hasVitestConfig(cwd: string): boolean {
  return VITEST_CONFIG_FILES.some((f) => fs.existsSync(path.join(cwd, f)))
}

function scriptCallsVitest(scripts: Record<string, string>, script: string): boolean {
  return /\bvitest\b/.test(scripts[script] ?? '')
}

/**
 * Resolve whether to use the vitest runner. Explicit config wins; when absent, auto-detect only when
 * vitest is installed AND a vitest config file exists or the resolved test script explicitly calls vitest.
 * This avoids switching behaviour in projects that have vitest as a transitive dep but don't use it directly.
 */
function resolveUseVitest(cwd: string, scripts: Record<string, string>, script: string, testConfig: VerifyConfig['test']): boolean {
  if (testConfig?.runner === 'vitest') return true
  if (testConfig?.runner === 'npm-script') return false
  return hasLocalBin('vitest', cwd) && (hasVitestConfig(cwd) || scriptCallsVitest(scripts, script))
}

/**
 * Resolve the automatic tests step to a runnable entry. Returns null when `--no-tests` is set or no
 * applicable test script exists.
 *
 * Uses the vitest runner (direct argv + `--exclude` forwarding) when `testConfig.runner = 'vitest'` or
 * when vitest is detected in node_modules/.bin. Shells out to the package manager script runner otherwise.
 * Explicit `testConfig.runner = 'npm-script'` always overrides detection.
 */
export function resolveTestEntry(opts: TestsOptions = {}): TestEntry | null {
  if (opts.noTests) return null
  const loaded = loadPackageScripts()
  if (!loaded) return null
  const script = resolveTestScript(loaded.scripts, !!process.env.CI)
  if (!script) return null

  const cwd = loaded.dir

  if (resolveUseVitest(cwd, loaded.scripts, script, opts.testConfig)) {
    const argv = ['vitest', 'run', ...(opts.testConfig?.vitestArgs ?? [])]
    for (const glob of opts.ignore ?? []) argv.push('--exclude', glob)
    return { kind: 'argv', name: 'test', argv, cwd, env: envWithLocalBin(cwd) }
  }

  const pm = resolvePackageManager(cwd, opts.pm)
  return { kind: 'shell', name: script, command: runScriptCommand(script, pm), cwd }
}

/** Type guard: true when entry came from `resolveTestEntry`, narrowing to `TestEntry`. */
export function isTestEntry(entry: VerifyEntry | TestEntry): entry is TestEntry {
  return 'kind' in entry
}
