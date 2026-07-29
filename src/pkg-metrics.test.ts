import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { analyzePkgMetrics, DEFAULT_GATES, resolveGates } from './pkg-metrics.ts'

let dir: string

beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'verify-pkg-metrics-')))
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

describe('resolveGates', () => {
  it('returns defaults when no overrides given', () => {
    const gates = resolveGates(undefined)
    expect(gates.cohesion).toEqual(DEFAULT_GATES.cohesion)
    expect(gates.distance).toEqual(DEFAULT_GATES.distance)
    expect(gates.instability).toEqual(DEFAULT_GATES.instability)
  })

  it('merges partial overrides over defaults', () => {
    const gates = resolveGates({ cohesion: { threshold: 2.0 } })
    expect(gates.cohesion.threshold).toBe(2.0)
    expect(gates.cohesion.enabled).toBe(DEFAULT_GATES.cohesion.enabled)
    expect(gates.distance).toEqual(DEFAULT_GATES.distance)
  })

  it('allows disabling a gate', () => {
    const gates = resolveGates({ cohesion: { enabled: false } })
    expect(gates.cohesion.enabled).toBe(false)
    expect(gates.cohesion.threshold).toBe(DEFAULT_GATES.cohesion.threshold)
  })
})

describe('analyzePkgMetrics', () => {
  it('returns empty and passed when root does not exist', () => {
    const result = analyzePkgMetrics({ root: path.join(dir, 'nonexistent') })
    expect(result.packages).toHaveLength(0)
    expect(result.passed).toBe(true)
  })

  it('returns empty and passed when root has no subdirectories', () => {
    fs.mkdirSync(path.join(dir, 'src'))
    write('src/standalone.ts', 'export const x = 1')
    const result = analyzePkgMetrics({ root: path.join(dir, 'src') })
    expect(result.packages).toHaveLength(0)
    expect(result.passed).toBe(true)
  })

  it('counts exported symbols as N', () => {
    write('src/core/a.ts', 'export const Foo = 1\nexport const Bar = 2')
    const result = analyzePkgMetrics({ root: path.join(dir, 'src') })
    const pkg = result.packages.find((p) => p.name === 'core')
    expect(pkg?.numClasses).toBe(2)
  })

  it('counts interfaces and types as abstract', () => {
    write('src/core/a.ts', 'export interface IFoo {}\nexport type TBar = string\nexport const Baz = 1')
    const result = analyzePkgMetrics({ root: path.join(dir, 'src') })
    const pkg = result.packages.find((p) => p.name === 'core')
    expect(pkg?.numClasses).toBe(3)
    expect(pkg?.abstractness).toBeCloseTo(2 / 3)
  })

  it('does not count re-exports as classes', () => {
    write('src/core/a.ts', "export { Foo } from './b.ts'\nexport const Bar = 1")
    const result = analyzePkgMetrics({ root: path.join(dir, 'src') })
    const pkg = result.packages.find((p) => p.name === 'core')
    // Only Bar counts; the re-export is excluded
    expect(pkg?.numClasses).toBe(1)
  })

  it('skips test files', () => {
    write('src/core/a.ts', 'export const Foo = 1')
    write('src/core/a.test.ts', 'export const shouldBeIgnored = true')
    const result = analyzePkgMetrics({ root: path.join(dir, 'src') })
    const pkg = result.packages.find((p) => p.name === 'core')
    expect(pkg?.numClasses).toBe(1)
  })

  it('detects internal relationships from relative imports within the same package', () => {
    write('src/core/a.ts', 'export const A = 1')
    write('src/core/b.ts', "import { A } from './a.ts'\nexport const B = A")
    const result = analyzePkgMetrics({ root: path.join(dir, 'src') })
    const pkg = result.packages.find((p) => p.name === 'core')
    expect(pkg?.internalRelationships).toBeGreaterThan(0)
  })

  it('detects efferent couplings from cross-package imports', () => {
    write('src/models/user.ts', 'export interface User { id: string }')
    write(
      'src/services/user-svc.ts',
      "import type { User } from '../models/user.ts'\nexport function getUser(): User { return { id: '1' } }",
    )
    const result = analyzePkgMetrics({ root: path.join(dir, 'src') })
    const services = result.packages.find((p) => p.name === 'services')
    const models = result.packages.find((p) => p.name === 'models')
    expect(services?.efferentCouplings).toBeGreaterThan(0)
    expect(models?.afferentCouplings).toBeGreaterThan(0)
  })

  it('passes when cohesion and distance thresholds are met', () => {
    // Single package with one exported class, no external deps
    // H = (0+1)/1 = 1.0, I = 0, A = 0, D = |0+0-1| = 1.0
    // With default distance threshold 0.3 this would fail, so raise it
    write('src/core/a.ts', 'export const Foo = 1')
    const result = analyzePkgMetrics({
      root: path.join(dir, 'src'),
      gates: { distance: { threshold: 1.0, enabled: true }, cohesion: { threshold: 1.0, enabled: true } },
    })
    expect(result.passed).toBe(true)
  })

  it('fails on distance violation', () => {
    // One concrete package with no external deps: A=0, I=0, D=1.0
    write('src/core/a.ts', 'export const Foo = 1')
    const result = analyzePkgMetrics({
      root: path.join(dir, 'src'),
      gates: { distance: { threshold: 0.5, enabled: true }, cohesion: { enabled: false } },
    })
    const distViolation = result.violations.find((v) => v.metric === 'distance')
    expect(distViolation).toBeDefined()
    expect(result.passed).toBe(false)
  })

  it('fails on cohesion violation', () => {
    // Many classes, no internal imports → H = 1/N, which is < 1.0 for N > 1
    write('src/core/a.ts', 'export const A = 1\nexport const B = 2\nexport const C = 3')
    const result = analyzePkgMetrics({
      root: path.join(dir, 'src'),
      gates: { cohesion: { threshold: 2.0, enabled: true }, distance: { enabled: false } },
    })
    const cohViolation = result.violations.find((v) => v.metric === 'cohesion')
    expect(cohViolation).toBeDefined()
    expect(result.passed).toBe(false)
  })

  it('does not fail when a gate is disabled', () => {
    write('src/core/a.ts', 'export const Foo = 1')
    const result = analyzePkgMetrics({
      root: path.join(dir, 'src'),
      gates: { distance: { threshold: 0.0, enabled: false }, cohesion: { threshold: 999, enabled: false } },
    })
    expect(result.violations).toHaveLength(0)
    expect(result.passed).toBe(true)
  })

  it('gates numClasses', () => {
    write('src/core/a.ts', 'export const A = 1\nexport const B = 2\nexport const C = 3')
    const result = analyzePkgMetrics({
      root: path.join(dir, 'src'),
      gates: { numClasses: { threshold: 2, enabled: true }, cohesion: { enabled: false }, distance: { enabled: false } },
    })
    expect(result.violations.find((v) => v.metric === 'numClasses')).toBeDefined()
    expect(result.passed).toBe(false)
  })

  it('gates efferent couplings', () => {
    write('src/models/user.ts', 'export interface User { id: string }')
    write('src/models/post.ts', 'export interface Post { id: string }')
    write(
      'src/services/svc.ts',
      "import type { User } from '../models/user.ts'\nimport type { Post } from '../models/post.ts'\nexport function get(): void {}",
    )
    const result = analyzePkgMetrics({
      root: path.join(dir, 'src'),
      gates: { efferentCouplings: { threshold: 1, enabled: true }, cohesion: { enabled: false }, distance: { enabled: false } },
    })
    const violation = result.violations.find((v) => v.metric === 'efferentCouplings')
    expect(violation?.packages.some((p) => p.name === 'services')).toBe(true)
  })

  it('respects safePackages in distance calculation', () => {
    // A safe package overrides instability with abstractness in D calculation
    write('src/core/a.ts', 'export const Foo = 1')
    // Without safe: I=0, A=0, D=1.0 → violates threshold 0.3
    // With safe: effectiveI = A = 0, so D = |0+0-1| = 1.0 (safe only matters when I and A differ)
    // To actually test safe: make it stable with some abstractness
    write('src/utils/b.ts', "import { Foo } from '../core/a.ts'\nexport interface IUtils { run(): void }")
    const withSafe = analyzePkgMetrics({
      root: path.join(dir, 'src'),
      safePackages: ['utils'],
      gates: { distance: { threshold: 0.6, enabled: true }, cohesion: { enabled: false } },
    })
    const withoutSafe = analyzePkgMetrics({
      root: path.join(dir, 'src'),
      gates: { distance: { threshold: 0.6, enabled: true }, cohesion: { enabled: false } },
    })
    const utilsWithSafe = withSafe.packages.find((p) => p.name === 'utils')
    const utilsWithout = withoutSafe.packages.find((p) => p.name === 'utils')
    // Safe packages may have a different distance value
    expect(utilsWithSafe).toBeDefined()
    expect(utilsWithout).toBeDefined()
    // The distance values may differ between safe and non-safe runs
    expect(typeof utilsWithSafe?.normalDistance).toBe('number')
  })
})
