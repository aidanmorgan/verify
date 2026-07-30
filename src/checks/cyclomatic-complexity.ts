import path from 'node:path'

import type { ComplexityProfile } from './code-metrics-types.ts'
import { runExternalComplexityCheck } from './complexity-tool.ts'
import { readJsonOrEmpty } from './external-ignore.ts'
import type { CheckResult } from './types.ts'

export const CYCLOMATIC_PROFILES: Record<ComplexityProfile, number> = {
  light: 25,
  moderate: 15,
  aggressive: 10,
}

export type CyclomaticComplexityOptions = {
  maxThreshold?: number
  profile?: ComplexityProfile
  ignore?: readonly string[]
  pattern?: string
}

export async function runCyclomaticComplexity(opts: CyclomaticComplexityOptions = {}): Promise<CheckResult> {
  const cwd = process.cwd()
  const base = readJsonOrEmpty(path.join(cwd, '.oxlintrc.json'))
  const existingIgnore: string[] = Array.isArray(base.ignorePatterns) ? (base.ignorePatterns as string[]) : []

  return runExternalComplexityCheck({
    name: 'cyclomatic-complexity',
    bin: 'oxlint',
    profiles: CYCLOMATIC_PROFILES,
    maxThreshold: opts.maxThreshold,
    profile: opts.profile,
    noThresholdHint: 'use --max-cyclomatic or --complexity',
    buildConfig: (threshold) => ({
      rules: { complexity: ['error', { max: threshold }] },
      ignorePatterns: [...existingIgnore, ...(opts.ignore ?? [])],
    }),
    tempFileName: '.verifyx-tmp-cyclomatic-oxlintrc.json',
    buildArgv: (tempFile, target) => ['oxlint', '-c', tempFile, target],
    target: opts.pattern ?? '.',
    failureDocsUrl: 'https://oxc.rs/docs/guide/usage/linter/rules/eslint/complexity.html',
  })
}
