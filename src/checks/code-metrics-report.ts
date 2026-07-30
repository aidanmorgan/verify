import { color } from '../shared/color.ts'
import type { CodeMetricsGates, CodeMetricsResult, ComplexityProfile } from './code-metrics-types.ts'

export function printCodeMetricsReport(result: CodeMetricsResult, gates: CodeMetricsGates, profile?: ComplexityProfile): void {
  const totalFiles = result.files.length

  if (totalFiles === 0) {
    console.log(color.yellow('code-metrics: no files matched — skipping'))
    return
  }

  const profileLabel = profile ? ` [${profile}]` : ''
  if (!gates.maintainabilityIndex.enabled) {
    console.log(color.dim(`code-metrics: no active gates — skipping (${totalFiles} files analyzed)`))
    return
  }

  if (result.passed) {
    console.log(color.green(`All files pass${profileLabel} (${totalFiles} files, MI≥${gates.maintainabilityIndex.threshold})`))
    return
  }

  for (const violation of result.violations) {
    console.error(color.red(`\nFail [maintainabilityIndex]: ${violation.files.length} file(s) below threshold`))
    for (const f of violation.files) {
      console.error(`  ${f.file}  MI=${f.minMaintainability.toFixed(1)}`)
    }
    console.error(
      'Maintainability index (MI): low score indicates high Halstead volume, high cyclomatic complexity, or too many SLOC — extract and simplify',
    )
  }
}
