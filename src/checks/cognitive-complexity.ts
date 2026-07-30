import fs from 'node:fs'
import path from 'node:path'

import { color } from '../shared/color.ts'
import { runArgvCommand } from '../shared/spawn.ts'
import type { ComplexityProfile } from './code-metrics-types.ts'
import { readJsonOrEmpty } from './external-ignore.ts'
import { envWithLocalBin, hasLocalBin } from './external.ts'
import type { CheckResult } from './types.ts'

const COGNITIVE_PROFILES: Record<ComplexityProfile, number> = {
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

  if (!hasLocalBin('biome', cwd)) {
    console.log(color.dim('cognitive-complexity: biome not installed — skipping (add it with `npx verifyx init`)'))
    return { name: 'cognitive-complexity', ok: true, skipped: true }
  }

  const threshold = opts.maxThreshold ?? (opts.profile ? COGNITIVE_PROFILES[opts.profile] : undefined)
  if (threshold === undefined) {
    console.log(color.dim('cognitive-complexity: no threshold set — skipping (use --max-cognitive or --complexity)'))
    return { name: 'cognitive-complexity', ok: true, skipped: true }
  }

  const biomeBase = readJsonOrEmpty(path.join(cwd, 'biome.json'))
  const existingIgnore: string[] = Array.isArray((biomeBase.files as Record<string, unknown> | undefined)?.ignore)
    ? ((biomeBase.files as Record<string, unknown>).ignore as string[])
    : []

  const config = {
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
  }

  const tempFile = path.join(cwd, '.verifyx-tmp-biome.json')
  fs.writeFileSync(tempFile, JSON.stringify(config, null, 2), 'utf-8')

  try {
    const target = opts.pattern ?? '.'
    const argv = ['biome', 'lint', `--config-path=${tempFile}`, target]
    const exitCode = await runArgvCommand(argv, { env: envWithLocalBin(cwd), quiet: true })
    if (exitCode !== 0) {
      console.error(
        color.dim(
          `↳ cognitive-complexity uses biome: ran argv ${JSON.stringify(argv)}. Configure threshold via --max-cognitive or in biome.json — https://biomejs.dev/linter/rules/no-excessive-cognitive-complexity/`,
        ),
      )
    }
    return { name: 'cognitive-complexity', ok: exitCode === 0 }
  } finally {
    try {
      fs.unlinkSync(tempFile)
    } catch {
      /* already gone */
    }
  }
}
