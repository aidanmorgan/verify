export {
  type AnalyzeOptions,
  type AnalyzeResult,
  analyzeComplexity,
  DEFAULT_IGNORE,
  DEFAULT_PATTERN,
  type FileScore,
  findSourceFiles,
  resolvePattern,
  scoreFiles,
} from './analyze.ts'
export { type CommentsOptions, runComments } from './checks/comments.ts'
export { runComplexity } from './checks/complexity.ts'
export { runForbiddenStrings } from './checks/forbidden-strings.ts'
export { runHardcodedColors } from './checks/hardcoded-colors.ts'
export { type CognitiveComplexityOptions, runCognitiveComplexity } from './checks/cognitive-complexity.ts'
export { type CyclomaticComplexityOptions, runCyclomaticComplexity } from './checks/cyclomatic-complexity.ts'
export { type CodeMetricsCheckOptions, runCodeMetrics } from './checks/code-metrics.ts'
export {
  analyzeCodeMetrics,
  COMPLEXITY_PROFILES,
  DEFAULT_CODE_GATES,
  type CodeMetricGate,
  type CodeMetricsGates,
  type CodeMetricsOptions,
  type CodeMetricsResult,
  type CodeMetricsViolation,
  type ComplexityProfile,
  type FileComplexityScore,
  printCodeMetricsReport,
  resolveCodeGates,
} from './checks/code-metrics-core.ts'
export { type PkgMetricsCheckOptions, runPkgMetrics } from './checks/pkg-metrics.ts'
export {
  analyzePkgMetrics,
  DEFAULT_GATES,
  type MetricGate,
  type MetricViolation,
  type PackageMetrics,
  type PkgMetricsGates,
  type PkgMetricsOptions,
  type PkgMetricsResult,
  printPkgMetricsReport,
  resolveGates,
} from './checks/pkg-metrics-core.ts'
export { CHECKS, getCheck, recommendedChecks } from './checks/registry.ts'
export type { Check, CheckKind, CheckMode, CheckResult, RunDefaultOptions } from './checks/types.ts'
export { type CommentBlockViolation, findLongCommentBlocks } from './comments.ts'
export { type FunctionCallback, forEachFunction } from './functions.ts'
export {
  calculateCyclomaticComplexity,
  calculateHalstead,
  calculateMaintainabilityIndex,
  countSloc,
  type HalsteadMetrics,
} from './metrics.ts'
export { orchestrate } from './orchestrator/run.ts'
export { runAll } from './orchestrator/runAll.ts'
export { applyEject, type EjectResult, ejectScripts } from './scaffold/eject.ts'
export { applyInit, type InitOptions, type InitResult } from './scaffold/init.ts'
export { type ForbiddenStringsRule, loadVerifyConfig, type PkgMetricsGateConfig, type VerifyConfig } from './shared/config.ts'
