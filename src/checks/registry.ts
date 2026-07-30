import fs from 'node:fs'

import { withoutRed } from '../shared/color.ts'
import type { AdvancedMetricsProfile } from '../shared/config.ts'
import type { ComplexityProfile } from './code-metrics-types.ts'
import { runCodeMetrics } from './code-metrics.ts'
import { runCognitiveComplexity } from './cognitive-complexity.ts'
import { runComments } from './comments.ts'
import { runComplexity } from './complexity.ts'
import { runCyclomaticComplexity } from './cyclomatic-complexity.ts'
import {
  biomeIgnore,
  depcruiseIgnore,
  jscpdIgnore,
  knipIgnore,
  oxfmtIgnore,
  oxlintIgnore,
  skottIgnore,
  tscIgnore,
} from './external-ignore.ts'
import { defineExternalCheck, hasLocalBin } from './external.ts'
import { runForbiddenStrings } from './forbidden-strings.ts'
import { hasIsomorphicGit, runGitMetrics } from './git-metrics.ts'
import { runPropagationCost, runRelationalCohesion } from './graph-metrics.ts'
import { runHardcodedColors } from './hardcoded-colors.ts'
import { jscpdCount } from './maxWarnings.ts'
import { hasTsMorph, runModuleCohesion } from './module-cohesion.ts'
import { runPkgMetrics } from './pkg-metrics.ts'
import type { Check, CheckResult } from './types.ts'

function nativeCheck(
  name: string,
  description: string,
  recommended: boolean,
  run: (opts?: { ignore?: readonly string[]; complexityProfile?: string }) => CheckResult | Promise<CheckResult>,
  script = `verifyx ${name}`,
): Check {
  return {
    name,
    description,
    kind: 'native',
    recommended,
    // Native checks scaffold as a call back into this CLI's own subcommand.
    scaffold: { script },
    runDefault: async (opts) => run({ ignore: opts?.ignore, complexityProfile: opts?.complexityProfile }),
  }
}

function hasBiome(): boolean {
  return hasLocalBin('biome') && (fs.existsSync('biome.json') || fs.existsSync('biome.jsonc'))
}

// context: checks are named for their function, never the tool behind them (see each check's bin/devDeps).
export const CHECKS: Check[] = [
  nativeCheck('complexity', 'Maintainability-index gate (cyclomatic + Halstead + SLOC)', true, ({ ignore } = {}) =>
    runComplexity({ ignore }),
  ),
  nativeCheck(
    'comments',
    'Flag long comment blocks (JSDoc / context: exempt); --block-new-comments also fails comments on changed lines',
    true,
    ({ ignore } = {}) => runComments({ pushback: true, ignore }),
    'verifyx comments --pushback',
  ),
  nativeCheck('hardcoded-colors', 'Fail on literal hex / 0x colour values in source', false, ({ ignore } = {}) =>
    runHardcodedColors({ ignore }),
  ),
  nativeCheck('forbidden-strings', 'Fail on disallowed JSON config values (rules from verify config)', false, ({ ignore } = {}) =>
    runForbiddenStrings({ ignore }),
  ),
  defineExternalCheck({
    name: 'lint',
    description: 'Lint (oxlint) — auto-fixes locally, checks in CI',
    bin: 'oxlint',
    checkCommand: ['oxlint', '.'],
    fixCommand: ['oxlint', '--fix', '.'],
    devDeps: ['oxlint'],
    recommended: true,
    docs: 'https://oxc.rs/docs/guide/usage/linter.html',
    canRun: () => !hasBiome(),
    withIgnore: oxlintIgnore(),
  }),
  defineExternalCheck({
    name: 'format',
    description: 'Formatting (oxfmt) — writes locally, checks in CI',
    bin: 'oxfmt',
    checkCommand: ['oxfmt', '--check', '.'],
    fixCommand: ['oxfmt', '.'],
    devDeps: ['oxfmt'],
    recommended: true,
    docs: 'https://oxc.rs',
    canRun: () => !hasBiome(),
    withIgnore: oxfmtIgnore(),
  }),
  defineExternalCheck({
    name: 'lint',
    description: 'Lint (biome) — auto-fixes locally, checks in CI',
    bin: 'biome',
    checkCommand: ['biome', 'check', '.'],
    fixCommand: ['biome', 'check', '--write', '.'],
    devDeps: ['@biomejs/biome'],
    recommended: true,
    docs: 'https://biomejs.dev/guides/getting-started',
    canRun: hasBiome,
    withIgnore: biomeIgnore(),
  }),
  defineExternalCheck({
    name: 'format',
    description: 'Formatting (biome) — writes locally, checks in CI',
    bin: 'biome',
    checkCommand: ['biome', 'format', '.'],
    fixCommand: ['biome', 'format', '--write', '.'],
    devDeps: ['@biomejs/biome'],
    recommended: true,
    docs: 'https://biomejs.dev/formatter',
    canRun: hasBiome,
    withIgnore: biomeIgnore(),
  }),
  defineExternalCheck({
    name: 'check-types',
    description: 'TypeScript type check',
    bin: 'tsc',
    checkCommand: ['tsc', '--noEmit'],
    devDeps: ['typescript'],
    canRun: () => fs.existsSync('tsconfig.json'),
    recommended: true,
    docs: 'https://www.typescriptlang.org/tsconfig',
    withIgnore: tscIgnore(),
  }),
  defineExternalCheck({
    name: 'unused-code',
    description: 'Unused files, exports and dependencies',
    bin: 'knip',
    checkCommand: ['knip', '--no-progress', '--treat-config-hints-as-errors'],
    devDeps: ['knip'],
    docs: 'https://knip.dev/reference/configuration',
    failureAdvice:
      'An "unused" finding can be a false positive when the file is loaded dynamically (directory scan + require(), glob-registered ORM entities) or a script calls a system binary. Verify before deleting: suppress genuinely runtime-loaded files via knip `entry` globs and system tools via `ignoreBinaries` — never delete a file to satisfy this check without checking how it is loaded.',
    maxWarnings: { strategy: 'flag', toArgs: (n) => ['--max-issues', String(n)] },
    withIgnore: knipIgnore(),
  }),
  defineExternalCheck({
    name: 'circular-deps',
    description: 'Circular dependency detection',
    bin: 'skott',
    checkCommand: ['skott', '--displayMode=raw', '--showCircularDependencies', '--exitCodeOnCircularDependencies=1'],
    devDeps: ['skott'],
    docs: 'https://github.com/antoine-coulon/skott',
    withIgnore: skottIgnore(),
  }),
  nativeCheck(
    'pkg-metrics',
    'Package architecture metrics: cohesion (H), distance (D), instability (I), abstractness (A), couplings (Ca/Ce), size (N)',
    false,
    ({ ignore } = {}) => runPkgMetrics({ ignore }),
    'verifyx pkg-metrics',
  ),
  nativeCheck(
    'code-metrics',
    'Maintainability index (MI) gate — all gates off by default, enable via --complexity or --mi',
    false,
    ({ ignore, complexityProfile } = {}) => runCodeMetrics({ ignore, profile: complexityProfile as ComplexityProfile | undefined }),
    'verifyx code-metrics',
  ),
  nativeCheck(
    'cyclomatic-complexity',
    'Cyclomatic complexity gate — per-function, powered by oxlint; all gates off by default, enable via --max-cyclomatic or --complexity',
    false,
    ({ ignore, complexityProfile } = {}) =>
      runCyclomaticComplexity({ ignore, profile: complexityProfile as ComplexityProfile | undefined }),
    'verifyx cyclomatic-complexity',
  ),
  nativeCheck(
    'cognitive-complexity',
    'Cognitive complexity gate (SonarSource algorithm) — per-function, powered by biome; all gates off by default, enable via --max-cognitive or --complexity',
    false,
    ({ ignore, complexityProfile } = {}) => runCognitiveComplexity({ ignore, profile: complexityProfile as ComplexityProfile | undefined }),
    'verifyx cognitive-complexity',
  ),
  defineExternalCheck({
    name: 'duplicate-code',
    description: 'Copy-paste / duplicate-code detection',
    bin: 'jscpd',
    checkCommand: ['jscpd', '--format', 'typescript,tsx', '--exit-code', '1', '--ignore', '**/*.test.*', '-r', 'consoleFull', 'src'],
    devDeps: ['jscpd'],
    // jscpd hardcodes red header cells in its stats table (even on a clean run) — reads like a failure. It ignores
    // NO_COLOR/FORCE_COLOR, so strip the red foreground from its output; the table renders in the default colour.
    transformOutput: withoutRed,
    docs: 'https://github.com/kucherenko/jscpd/tree/master/apps/jscpd#config',
    maxWarnings: { strategy: 'count', unit: 'duplicated region', count: jscpdCount },
    withIgnore: jscpdIgnore(),
  }),
  // ── advanced metrics (all disabled by default, optional deps guard canRun) ──
  {
    ...nativeCheck(
      'git-metrics',
      'Git-history metrics: code churn, hotspot, change coupling, change cohesion (requires isomorphic-git)',
      false,
      ({ ignore, complexityProfile } = {}) => {
        const profile = complexityProfile as AdvancedMetricsProfile | undefined
        return runGitMetrics({
          ignore,
          profile,
          ...(profile && {
            codeChurn: { enabled: true },
            hotspot: { enabled: true },
            changeCoupling: { enabled: true },
            changeCohesion: { enabled: true },
          }),
        })
      },
      'verifyx git-metrics',
    ),
    canRun: () => hasIsomorphicGit(),
  },
  defineExternalCheck({
    name: 'dep-cycles',
    description: 'Dependency cycle detection via dependency-cruiser (requires dependency-cruiser)',
    bin: 'depcruise',
    checkCommand: ['depcruise', '--output-type', 'err-long', '--forbidden', 'no-circular', 'src'],
    devDeps: ['dependency-cruiser'],
    recommended: false,
    docs: 'https://github.com/sverweij/dependency-cruiser',
    canRun: () => hasLocalBin('depcruise'),
    withIgnore: depcruiseIgnore(),
  }),
  {
    ...nativeCheck(
      'module-cohesion',
      'Module cohesion — flags files whose exports form disconnected responsibility clusters (requires ts-morph)',
      false,
      ({ ignore, complexityProfile } = {}) => {
        const profile = complexityProfile as AdvancedMetricsProfile | undefined
        return runModuleCohesion({ ignore, profile, enabled: !!profile })
      },
      'verifyx module-cohesion',
    ),
    canRun: () => hasTsMorph(),
  },
  {
    ...nativeCheck(
      'relational-cohesion',
      'Relational cohesion RC=(R+1)/N per module — structural cohesion from the dependency graph (requires dependency-cruiser)',
      false,
      ({ ignore, complexityProfile } = {}) => {
        const profile = complexityProfile as AdvancedMetricsProfile | undefined
        return runRelationalCohesion({ ignore, profile, enabled: !!profile })
      },
      'verifyx relational-cohesion',
    ),
    canRun: () => hasLocalBin('depcruise'),
  },
  {
    ...nativeCheck(
      'propagation-cost',
      'Propagation cost from DSM reachability analysis — fraction of modules reachable from any module (requires dependency-cruiser)',
      false,
      ({ ignore, complexityProfile } = {}) => {
        const profile = complexityProfile as AdvancedMetricsProfile | undefined
        return runPropagationCost({ ignore, profile, enabled: !!profile })
      },
      'verifyx propagation-cost',
    ),
    canRun: () => hasLocalBin('depcruise'),
  },
]

export function getCheck(name: string): Check | undefined {
  return CHECKS.find((check) => check.name === name)
}

export function recommendedChecks(): Check[] {
  return CHECKS.filter((check) => check.recommended)
}

/**
 * Resolve the active set of checks: one entry per name, preferring the first alternative whose `canRun()`
 * returns true. When no alternative can run, the first entry is kept (it will self-skip with a message).
 * Use this instead of `CHECKS` wherever each check name must appear exactly once (CLI registration, runAll).
 */
export function resolveChecks(): Check[] {
  const byName = new Map<string, Check>()
  for (const check of CHECKS) {
    if (!byName.has(check.name)) {
      byName.set(check.name, check)
    } else if (check.kind === 'external' && check.canRun?.()) {
      byName.set(check.name, check)
    }
  }
  return [...byName.values()]
}
