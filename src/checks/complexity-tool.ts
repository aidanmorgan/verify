import { color } from '../shared/color.ts'
import { formatArgv, runArgvCommand } from '../shared/spawn.ts'
import type { ComplexityProfile } from './code-metrics-types.ts'
import { writeTempJson } from './external-ignore.ts'
import { envWithLocalBin, hasLocalBin } from './external.ts'
import type { CheckResult } from './types.ts'

export type ExternalComplexityCheckOptions = {
  name: string
  bin: string
  profiles: Record<ComplexityProfile, number>
  maxThreshold?: number
  profile?: ComplexityProfile
  noThresholdHint: string
  buildConfig: (threshold: number) => unknown
  tempFileName: string
  buildArgv: (tempFile: string, target: string) => string[]
  target: string
  failureDocsUrl: string
}

export async function runExternalComplexityCheck(opts: ExternalComplexityCheckOptions): Promise<CheckResult> {
  const cwd = process.cwd()

  if (!hasLocalBin(opts.bin, cwd)) {
    console.log(color.dim(`${opts.name}: ${opts.bin} not installed — skipping (add it with \`npx verifyx init\`)`))
    return { name: opts.name, ok: true, skipped: true }
  }

  const threshold = opts.maxThreshold ?? (opts.profile ? opts.profiles[opts.profile] : undefined)
  if (threshold === undefined) {
    console.log(color.dim(`${opts.name}: no threshold set — skipping (${opts.noThresholdHint})`))
    return { name: opts.name, ok: true, skipped: true }
  }

  const { file: tempFile, cleanup } = writeTempJson(cwd, opts.tempFileName, opts.buildConfig(threshold))

  try {
    const argv = opts.buildArgv(tempFile, opts.target)
    const exitCode = await runArgvCommand(argv, { env: envWithLocalBin(), quiet: true })
    if (exitCode !== 0) {
      console.error(
        color.dim(
          `↳ ${opts.name} uses ${opts.bin}: ran argv \`${formatArgv(argv)}\`. Configure threshold via --max-* or --complexity — ${opts.failureDocsUrl}.`,
        ),
      )
    }
    return { name: opts.name, ok: exitCode === 0 }
  } finally {
    cleanup()
  }
}
