import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { analyzeCodeMetrics, COMPLEXITY_PROFILES, DEFAULT_CODE_GATES, resolveCodeGates } from './code-metrics-core.ts'

let dir: string

beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'verify-code-metrics-')))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

function write(relPath: string, content: string): void {
  const full = path.join(dir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
}

describe('resolveCodeGates', () => {
  it('returns defaults when no profile or overrides given', () => {
    const gates = resolveCodeGates(undefined, undefined)
    expect(gates.maintainabilityIndex).toEqual(DEFAULT_CODE_GATES.maintainabilityIndex)
  })

  it('returns profile thresholds with gate enabled when a profile is given', () => {
    const gates = resolveCodeGates('moderate', undefined)
    expect(gates.maintainabilityIndex).toEqual(COMPLEXITY_PROFILES.moderate.maintainabilityIndex)
    expect(gates.maintainabilityIndex.enabled).toBe(true)
  })

  it('merges partial overrides over profile', () => {
    const gates = resolveCodeGates('moderate', { maintainabilityIndex: { threshold: 60 } })
    expect(gates.maintainabilityIndex.threshold).toBe(60)
    expect(gates.maintainabilityIndex.enabled).toBe(true)
  })

  it('merges partial overrides over defaults when no profile', () => {
    const gates = resolveCodeGates(undefined, { maintainabilityIndex: { threshold: 60 } })
    expect(gates.maintainabilityIndex.threshold).toBe(60)
    expect(gates.maintainabilityIndex.enabled).toBe(DEFAULT_CODE_GATES.maintainabilityIndex.enabled)
  })

  it('allows enabling a gate via override without a profile', () => {
    const gates = resolveCodeGates(undefined, { maintainabilityIndex: { enabled: true } })
    expect(gates.maintainabilityIndex.enabled).toBe(true)
    expect(gates.maintainabilityIndex.threshold).toBe(DEFAULT_CODE_GATES.maintainabilityIndex.threshold)
  })

  it('aggressive profile has stricter threshold than moderate', () => {
    expect(COMPLEXITY_PROFILES.aggressive.maintainabilityIndex.threshold).toBeGreaterThan(
      COMPLEXITY_PROFILES.moderate.maintainabilityIndex.threshold,
    )
  })

  it('light profile has more permissive threshold than moderate', () => {
    expect(COMPLEXITY_PROFILES.light.maintainabilityIndex.threshold).toBeLessThan(
      COMPLEXITY_PROFILES.moderate.maintainabilityIndex.threshold,
    )
  })
})

describe('analyzeCodeMetrics', () => {
  it('returns empty and passed when no files match', () => {
    const result = analyzeCodeMetrics({ pattern: path.join(dir, 'nonexistent') })
    expect(result.files).toHaveLength(0)
    expect(result.passed).toBe(true)
  })

  it('analyzes files and produces per-file scores', () => {
    write('src/a.ts', 'export function simple() { return 1 }')
    const result = analyzeCodeMetrics({ pattern: path.join(dir, 'src') })
    expect(result.files.length).toBeGreaterThan(0)
  })

  it('does not fail when all gates are disabled (default)', () => {
    write(
      'src/complex.ts',
      `export function messy(x: number) {
        if (x > 0) { if (x > 1) { if (x > 2) { if (x > 3) { return x } } } }
        for (let i = 0; i < x; i++) { for (let j = 0; j < i; j++) { x++ } }
        return x
      }`,
    )
    const result = analyzeCodeMetrics({ pattern: path.join(dir, 'src') })
    expect(result.passed).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('fails on maintainability index violation', () => {
    // High Halstead volume (many unique tokens) + deep nesting + high CC drives MI below 70
    write(
      'src/low-mi.ts',
      `export function lowMi(
        alpha: number, beta: string, gamma: boolean, delta: number[],
        epsilon: Map<string,number>, zeta: Set<string>, eta: Record<string, unknown>
      ): string {
        const resultBuffer: string[] = []
        let accumulator = 0
        let previousValue: number | null = null
        for (let outerIdx = 0; outerIdx < delta.length; outerIdx++) {
          const currentItem = delta[outerIdx]
          const nextItem = delta[outerIdx + 1] ?? 0
          const prevItem = delta[outerIdx - 1] ?? 0
          if (currentItem > alpha && currentItem < beta.length) {
            const mappedValue = epsilon.get(beta.substring(outerIdx, outerIdx + 2)) ?? 0
            if (mappedValue > accumulator) {
              accumulator += mappedValue
              resultBuffer.push(String(currentItem * mappedValue + prevItem / (nextItem || 1)))
            } else if (gamma && zeta.has(String(currentItem))) {
              const reversedBeta = beta.split('').reverse().join('')
              const charCode = reversedBeta.charCodeAt(outerIdx % reversedBeta.length)
              resultBuffer.push(String.fromCharCode(charCode ^ (currentItem & 0xff)))
            } else {
              const sqrtDelta = Math.sqrt(Math.abs(currentItem - alpha))
              const logGamma = Math.log1p(Math.abs(currentItem + nextItem))
              const composite = (sqrtDelta * logGamma + accumulator) / (outerIdx + 1)
              if (composite > 42) {
                for (const [etaKey, etaValue] of Object.entries(eta)) {
                  if (typeof etaValue === 'number' && etaValue > composite) {
                    resultBuffer.push(etaKey + ':' + composite.toFixed(3))
                  }
                }
              }
            }
          } else if (currentItem === 0 || previousValue === currentItem) {
            resultBuffer.push('zero_' + outerIdx)
          } else {
            for (let innerIdx = 0; innerIdx < Math.min(currentItem, 10); innerIdx++) {
              const innerChar = beta[innerIdx % beta.length] ?? '?'
              const innerMapped = epsilon.get(innerChar) ?? innerIdx * 2
              if (innerIdx % 3 === 0) resultBuffer.push(innerChar.repeat(innerMapped % 4 + 1))
              else if (innerIdx % 3 === 1) accumulator ^= innerMapped
              else resultBuffer.push(innerChar + '_' + innerIdx + '_' + outerIdx)
            }
          }
          previousValue = currentItem
        }
        return resultBuffer.join(',')
      }`,
    )
    const result = analyzeCodeMetrics({
      pattern: path.join(dir, 'src'),
      gates: { maintainabilityIndex: { threshold: 70, enabled: true } },
    })
    const violation = result.violations.find((v) => v.kind === 'maintainabilityIndex')
    expect(violation).toBeDefined()
    expect(result.passed).toBe(false)
  })

  it('does not fail when a gate is disabled', () => {
    write(
      'src/complex.ts',
      `export function manyBranches(x: number) {
        if (x > 1) return 1; if (x > 2) return 2; if (x > 3) return 3
        if (x > 4) return 4; if (x > 5) return 5; if (x > 6) return 6
        return 0
      }`,
    )
    const result = analyzeCodeMetrics({
      pattern: path.join(dir, 'src'),
      gates: { maintainabilityIndex: { threshold: 99, enabled: false } },
    })
    expect(result.violations).toHaveLength(0)
    expect(result.passed).toBe(true)
  })

  it('skips test files by default', () => {
    write('src/a.ts', 'export function ok() { return 1 }')
    write('src/a.test.ts', 'export function shouldBeIgnored() { return 2 }')
    const result = analyzeCodeMetrics({ pattern: path.join(dir, 'src') })
    // a.test.ts should not appear in file scores
    const testFile = result.files.find((f) => f.file.includes('a.test.ts'))
    expect(testFile).toBeUndefined()
  })
})
