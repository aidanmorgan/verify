import path from 'node:path'

import type { ComplexityProfile } from './code-metrics-types.ts'
import { runExternalComplexityCheck } from './complexity-tool.ts'
import { readJsonOrEmpty } from './external-ignore.ts'
import type { CheckResult } from './types.ts'

export const COGNITIVE_PROFILES: Record<ComplexityProfile, number> = {
  light: 40,
  moderate: 25,
  aggressive: 15,
}

export type CognitiveComplexityOptions = {
  maxThreshold?: number
  profile?: ComplexityProfile
  ignore?: readonly string[]
  pattern?: string
}

export async function runCognitiveComplexity(opts: CognitiveComplexityOptions = {}): Promise<CheckResult> {
  const cwd = process.cwd()
  const biomeBase = readJsonOrEmpty(path.join(cwd, 'biome.json'))
  const existingIgnore: string[] = Array.isArray((biomeBase.files as Record<string, unknown> | undefined)?.ignore)
    ? ((biomeBase.files as Record<string, unknown>).ignore as string[])
    : []

  return runExternalComplexityCheck({
    name: 'cognitive-complexity',
    bin: 'biome',
    profiles: COGNITIVE_PROFILES,
    maxThreshold: opts.maxThreshold,
    profile: opts.profile,
    noThresholdHint: 'use --max-cognitive or --complexity',
    buildConfig: (threshold) => ({
      linter: {
        enabled: true,
        rules: {
          recommended: false,
          complexity: {
            noExcessiveCognitiveComplexity: { level: 'error', options: { maxAllowedComplexity: threshold } },
          },
        },
      },
      files: {
        ignore: [...existingIgnore, ...(opts.ignore ?? [])],
      },
    }),
    tempFileName: '.verifyx-tmp-biome.json',
    buildArgv: (tempFile, target) => ['biome', 'lint', `--config-path=${tempFile}`, target],
    target: opts.pattern ?? '.',
    failureDocsUrl: 'https://biomejs.dev/linter/rules/no-excessive-cognitive-complexity/',
  })
}
