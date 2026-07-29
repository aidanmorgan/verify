import { color } from '../shared/color.ts'
import type { CodeMetricsGates, CodeMetricsResult, CodeMetricsViolation, ComplexityProfile } from './code-metrics-types.ts'

function formatActiveGates(gates: CodeMetricsGates): string {
  const parts: string[] = []
  if (gates.cyclomaticComplexity.enabled) parts.push(`cyclomatic≤${gates.cyclomaticComplexity.threshold}`)
  if (gates.cognitiveComplexity.enabled) parts.push(`cognitive≤${gates.cognitiveComplexity.threshold}`)
  if (gates.maintainabilityIndex.enabled) parts.push(`MI≥${gates.maintainabilityIndex.threshold}`)
  return parts.join('  ')
}

const VIOLATION_DESCRIPTIONS: Record<CodeMetricsViolation['kind'], string> = {
  cyclomaticComplexity:
    'Cyclomatic complexity (CC): too many independent paths through the function — split into smaller functions or simplify branching',
  cognitiveComplexity:
    'Cognitive complexity: code is too hard to follow — reduce nesting depth, flatten conditional chains, or extract helpers',
  maintainabilityIndex:
    'Maintainability index (MI): low score indicates high Halstead volume, high cyclomatic complexity, or too many SLOC — extract and simplify',
}

export function printCodeMetricsReport(result: CodeMetricsResult, gates: CodeMetricsGates, profile?: ComplexityProfile): void {
  const totalFiles = result.files.length
  const totalFunctions = result.functions.length

  if (totalFiles === 0 && totalFunctions === 0) {
    console.log(color.yellow('code-metrics: no files matched — skipping'))
    return
  }

  const activeGates = formatActiveGates(gates)
  const profileLabel = profile ? ` [${profile}]` : ''
  if (!activeGates) {
    console.log(color.dim(`code-metrics: no active gates — skipping (${totalFiles} files, ${totalFunctions} functions analyzed)`))
    return
  }

  if (result.passed) {
    console.log(color.green(`All files pass${profileLabel} (${totalFiles} files, ${totalFunctions} functions, gates: ${activeGates})`))
    return
  }

  for (const violation of result.violations) {
    if (violation.kind === 'cyclomaticComplexity' || violation.kind === 'cognitiveComplexity') {
      const label = violation.kind === 'cyclomaticComplexity' ? 'cyclomaticComplexity' : 'cognitiveComplexity'
      console.error(color.red(`\nFail [${label}]: ${violation.functions.length} function(s) exceed threshold`))
      for (const fn of violation.functions) {
        const value = violation.kind === 'cyclomaticComplexity' ? fn.cyclomatic : fn.cognitive
        console.error(`  ${fn.file}  ${fn.name}  (${value})`)
      }
    } else {
      console.error(color.red(`\nFail [maintainabilityIndex]: ${violation.files.length} file(s) below threshold`))
      for (const f of violation.files) {
        console.error(`  ${f.file}  MI=${f.minMaintainability.toFixed(1)}`)
      }
    }
    console.error(VIOLATION_DESCRIPTIONS[violation.kind])
  }
}
