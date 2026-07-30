import fs from 'node:fs'
import path from 'node:path'

import { color } from '../shared/color.ts'
import { runArgvCommand } from '../shared/spawn.ts'
import type { ComplexityProfile } from './code-metrics-types.ts'
import { readJsonOrEmpty } from './external-ignore.ts'
import { envWithLocalBin, hasLocalBin } from './external.ts'
import type { CheckResult } from './types.ts'

const CYCLOMATIC_PROFILES: Record<ComplexityProfile, number> = {
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

  if (!hasLocalBin('oxlint', cwd)) {
    console.log(color.dim('cyclomatic-complexity: oxlint not installed — skipping (add it with `npx verifyx init`)'))
    return { name: 'cyclomatic-complexity', ok: true, skipped: true }
  }

  const threshold = opts.maxThreshold ?? (opts.profile ? CYCLOMATIC_PROFILES[opts.profile] : undefined)
  if (threshold === undefined) {
    console.log(color.dim('cyclomatic-complexity: no threshold set — skipping (use --max-cyclomatic or --complexity)'))
    return { name: 'cyclomatic-complexity', ok: true, skipped: true }
  }

  const base = readJsonOrEmpty(path.join(cwd, '.oxlintrc.json'))
  const existingIgnore: string[] = Array.isArray(base.ignorePatterns) ? (base.ignorePatterns as string[]) : []
  const config = {
    rules: { complexity: ['error', { max: threshold }] },
    ignorePatterns: [...existingIgnore, ...(opts.ignore ?? [])],
  }

  const tempFile = path.join(cwd, '.verifyx-tmp-cyclomatic-oxlintrc.json')
  fs.writeFileSync(tempFile, JSON.stringify(config, null, 2), 'utf-8')

  try {
    const target = opts.pattern ?? '.'
    const argv = ['oxlint', '-c', tempFile, target]
    const exitCode = await runArgvCommand(argv, { env: envWithLocalBin(cwd), quiet: true })
    if (exitCode !== 0) {
      console.error(
        color.dim(
          `↳ cyclomatic-complexity uses oxlint: ran argv ${JSON.stringify(argv)}. Configure threshold via --max-cyclomatic or --complexity — https://oxc.rs/docs/guide/usage/linter/rules/eslint/complexity.html`,
        ),
      )
    }
    return { name: 'cyclomatic-complexity', ok: exitCode === 0 }
  } finally {
    try {
      fs.unlinkSync(tempFile)
    } catch {
      /* already gone */
    }
  }
}
