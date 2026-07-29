import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { calculateCognitiveComplexity } from './cognitive-metrics.ts'
import { calculateCyclomaticComplexity, calculateHalstead, calculateMaintainabilityIndex, countSloc } from './metrics.ts'

function firstFunction(code: string): ts.Node {
  const sf = ts.createSourceFile('t.ts', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  let found: ts.Node | undefined
  const visit = (n: ts.Node): void => {
    if (!found && (ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n))) found = n
    ts.forEachChild(n, visit)
  }
  visit(sf)
  if (!found) throw new Error('no function found')
  return found
}

describe('calculateCyclomaticComplexity', () => {
  it('is 1 for a straight-line function', () => {
    expect(calculateCyclomaticComplexity(firstFunction('function f() { return 1 }'))).toBe(1)
  })

  it('counts each branching construct', () => {
    const code = `function f(a: number) {
      if (a > 0) { return 1 }
      for (let i = 0; i < a; i++) {}
      while (a > 0) { a-- }
      return a > 1 ? 2 : 3
    }`
    // base 1 + if + for + while + conditional = 5
    expect(calculateCyclomaticComplexity(firstFunction(code))).toBe(5)
  })

  it('counts logical and nullish operators', () => {
    const code = 'function f(a: boolean, b: boolean, c: unknown) { return a && b || (c ?? a) }'
    // base 1 + && + || + ?? = 4
    expect(calculateCyclomaticComplexity(firstFunction(code))).toBe(4)
  })

  it('counts case and catch clauses', () => {
    const code = `function f(x: number) {
      try {
        switch (x) { case 1: return 1; case 2: return 2 }
      } catch (e) { return -1 }
      return 0
    }`
    // base 1 + case + case + catch = 4
    expect(calculateCyclomaticComplexity(firstFunction(code))).toBe(4)
  })

  it('counts optional chaining as +1', () => {
    // base 1 + ?. = 2
    expect(calculateCyclomaticComplexity(firstFunction('function f(x: T) { return x?.foo }'))).toBe(2)
  })
})

describe('calculateHalstead', () => {
  it('returns zero volume for an empty body', () => {
    const { volume, difficulty, effort } = calculateHalstead(firstFunction('function f() {}'))
    expect(volume).toBe(0)
    expect(difficulty).toBe(0)
    expect(effort).toBe(0)
  })

  it('produces positive volume/difficulty/effort for real code', () => {
    const { volume, difficulty, effort } = calculateHalstead(firstFunction('function f(a: number, b: number) { return a + b * a }'))
    expect(volume).toBeGreaterThan(0)
    expect(difficulty).toBeGreaterThan(0)
    expect(effort).toBeCloseTo(volume * difficulty, 6)
  })

  it('type annotations do not inflate volume', () => {
    const withTypes = calculateHalstead(firstFunction('function f(a: string, b: Array<number>): boolean { return a === String(b) }'))
    const withoutTypes = calculateHalstead(firstFunction('function f(a, b) { return a === String(b) }'))
    expect(withTypes.volume).toBeCloseTo(withoutTypes.volume, 1)
  })
})

describe('countSloc', () => {
  it('ignores blank lines and single-line comments', () => {
    const src = ['const a = 1', '', '// a comment', 'const b = 2'].join('\n')
    expect(countSloc(src)).toBe(2)
  })

  it('skips whole multi-line comment blocks', () => {
    const src = ['/*', ' comment', ' still comment', '*/', 'const a = 1'].join('\n')
    expect(countSloc(src)).toBe(1)
  })

  it('counts code sharing a line with the end of a block comment', () => {
    const src = ['/* start', 'mid */ const a = 1'].join('\n')
    expect(countSloc(src)).toBe(1)
  })

  it('counts code trailing a single-line block comment', () => {
    expect(countSloc('/* x */ const a = 1')).toBe(1)
  })
})

describe('calculateCognitiveComplexity', () => {
  it('is 0 for a straight-line function', () => {
    expect(calculateCognitiveComplexity(firstFunction('function f() { return 1 }'))).toBe(0)
  })

  it('adds 1 for a simple if', () => {
    expect(calculateCognitiveComplexity(firstFunction('function f(a: number) { if (a > 0) return 1; return 0 }'))).toBe(1)
  })

  it('adds nesting penalty for nested if', () => {
    const code = `function f(a: number, b: number) {
      if (a > 0) {       // +1
        if (b > 0) {     // +2 (nesting 1)
          return 1
        }
      }
      return 0
    }`
    expect(calculateCognitiveComplexity(firstFunction(code))).toBe(3)
  })

  it('adds 1 for each logical operator sequence', () => {
    // a && b: one && sequence = +1
    expect(calculateCognitiveComplexity(firstFunction('function f(a: boolean, b: boolean) { return a && b }'))).toBe(1)
  })

  it('counts else-if chain without extra nesting', () => {
    const code = `function f(x: number) {
      if (x === 1) return 1   // +1 (nesting 0)
      else if (x === 2) return 2  // +1 (continuation, no nesting increment)
      else if (x === 3) return 3  // +1
      return 0
    }`
    expect(calculateCognitiveComplexity(firstFunction(code))).toBe(3)
  })

  it('resets nesting for nested functions', () => {
    const code = `function outer() {
      if (true) {            // +1
        const inner = () => {
          if (true) return 1 // +1 (nesting resets to 0 inside inner)
        }
      }
    }`
    expect(calculateCognitiveComplexity(firstFunction(code))).toBe(2)
  })

  it('adds 1 for a ternary', () => {
    expect(calculateCognitiveComplexity(firstFunction('function f(a: boolean) { return a ? 1 : 0 }'))).toBe(1)
  })

  it('adds 1 for optional chaining with no nesting penalty', () => {
    expect(calculateCognitiveComplexity(firstFunction('function f(x: T) { return x?.foo }'))).toBe(1)
  })

  it('counts for/while/switch loops with nesting', () => {
    const code = `function f(arr: number[]) {
      for (const x of arr) {   // +1 (nesting 0)
        while (x > 0) {        // +2 (nesting 1)
          switch (x) {         // +3 (nesting 2)
            case 1: break
          }
        }
      }
    }`
    expect(calculateCognitiveComplexity(firstFunction(code))).toBe(6)
  })
})

describe('calculateMaintainabilityIndex', () => {
  it('returns 100 when volume or sloc is zero', () => {
    expect(calculateMaintainabilityIndex(0, 5, 10)).toBe(100)
    expect(calculateMaintainabilityIndex(100, 5, 0)).toBe(100)
  })

  it('matches the MI formula for known inputs (within the 0-100 range)', () => {
    const expected = 171 - 5.2 * Math.log(1000) - 0.23 * 10 - 16.2 * Math.log(50)
    expect(expected).toBeGreaterThan(0)
    expect(expected).toBeLessThan(100)
    expect(calculateMaintainabilityIndex(1000, 10, 50)).toBeCloseTo(expected, 6)
  })

  it('clamps into the 0-100 range', () => {
    expect(calculateMaintainabilityIndex(1e6, 500, 5000)).toBe(0)
    expect(calculateMaintainabilityIndex(2, 1, 1)).toBe(100)
  })
})
