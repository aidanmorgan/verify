import type { ComplexityProfile } from '../checks/code-metrics-types.ts'

export function collect(value: string, previous: string[]): string[] {
  return [...previous, value]
}

export function resolveProfile(value: ComplexityProfile | true | undefined): ComplexityProfile | undefined {
  if (value === undefined) return undefined
  if (value === true) return 'moderate'
  return value
}
