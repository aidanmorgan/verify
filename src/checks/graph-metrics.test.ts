import { describe, expect, it } from 'vitest'

import { computePropagationCost, computeRelationalCohesion } from './graph-metrics-core.ts'
import type { DepModule } from './graph-metrics-core.ts'

const mod = (source: string, deps: string[] = []): DepModule => ({
  source,
  dependencies: deps.map((resolved) => ({ resolved, dependencyTypes: ['local'] })),
})

describe('computeRelationalCohesion', () => {
  it('RC=(1+1)/2=1.0 for a two-file module with one internal edge', () => {
    const modules = [mod('src/auth/a.ts', ['src/auth/b.ts']), mod('src/auth/b.ts')]
    const result = computeRelationalCohesion(modules, 'src')
    const auth = result.find((r) => r.module === 'auth')
    expect(auth?.internalEdges).toBe(1)
    expect(auth?.rc).toBeCloseTo(1.0)
  })

  it('RC=(0+1)/3≈0.33 for a module with no internal edges', () => {
    const modules = [mod('src/utils/a.ts'), mod('src/utils/b.ts'), mod('src/utils/c.ts')]
    const result = computeRelationalCohesion(modules, 'src')
    const utils = result.find((r) => r.module === 'utils')
    expect(utils?.internalEdges).toBe(0)
    expect(utils?.rc).toBeCloseTo(1 / 3)
  })

  it('does not count cross-module edges as internal', () => {
    const modules = [mod('src/auth/a.ts', ['src/shared/util.ts']), mod('src/shared/util.ts')]
    const result = computeRelationalCohesion(modules, 'src')
    const auth = result.find((r) => r.module === 'auth')
    expect(auth?.internalEdges).toBe(0)
  })
})

describe('computePropagationCost', () => {
  it('returns 0 for an empty graph', () => {
    expect(computePropagationCost([])).toBe(0)
  })

  it('returns 0 for a single isolated node', () => {
    expect(computePropagationCost([mod('a.ts')])).toBe(0)
  })

  it('returns 0.25 for a two-node chain A→B (1 reachable out of 4 pairs)', () => {
    expect(computePropagationCost([mod('a.ts', ['b.ts']), mod('b.ts')])).toBeCloseTo(1 / 4)
  })

  it('returns 0.5 for a two-node mutual dependency A↔B', () => {
    expect(computePropagationCost([mod('a.ts', ['b.ts']), mod('b.ts', ['a.ts'])])).toBeCloseTo(2 / 4)
  })

  it('scales correctly for a three-node chain A→B→C', () => {
    expect(computePropagationCost([mod('a.ts', ['b.ts']), mod('b.ts', ['c.ts']), mod('c.ts')])).toBeCloseTo(3 / 9)
  })
})
