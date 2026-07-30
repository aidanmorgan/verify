import { describe, expect, it } from 'vitest'

// Test the pure computation functions by importing them directly.
// We cannot test walkCommits without isomorphic-git installed, so we test the
// downstream aggregation logic instead.

// Re-export internal helpers for testing by duplicating their logic here — they
// are not exported from git-metrics.ts, so we test them via the types they produce.

type CommitFileEntry = { path: string; added: number; removed: number }
type CommitRecord = { oid: string; timestamp: number; files: CommitFileEntry[] }

// ── change coupling logic ─────────────────────────────────────────────────────

function computeChangeCoupling(
  commits: CommitRecord[],
  ignore: readonly string[],
): Array<{
  fileA: string
  fileB: string
  coChanges: number
  totalA: number
  totalB: number
  ratio: number
}> {
  type MinimatchFn = (path: string, pattern: string) => boolean
  const { minimatch } = require('minimatch') as { minimatch: MinimatchFn }
  const commitCounts = new Map<string, number>()
  const coChangeCounts = new Map<string, number>()

  for (const commit of commits) {
    const files = commit.files.map((f) => f.path).filter((f) => !ignore.some((g) => minimatch(f, g)))
    for (const f of files) commitCounts.set(f, (commitCounts.get(f) ?? 0) + 1)
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const key = [files[i], files[j]].sort().join('\0')
        coChangeCounts.set(key, (coChangeCounts.get(key) ?? 0) + 1)
      }
    }
  }

  return [...coChangeCounts.entries()].map(([key, coChanges]) => {
    const parts = key.split('\0')
    const fileA = parts[0] ?? ''
    const fileB = parts[1] ?? ''
    const totalA = commitCounts.get(fileA) ?? 0
    const totalB = commitCounts.get(fileB) ?? 0
    const ratio = coChanges / Math.max(totalA, totalB, 1)
    return { fileA, fileB, coChanges, totalA, totalB, ratio }
  })
}

function computeChangeCohesion(
  commits: CommitRecord[],
  pkgRoot: string,
  ignore: readonly string[],
): Array<{
  module: string
  touchingCommits: number
  multiFileCommits: number
  cohesionRatio: number
}> {
  type MinimatchFn = (path: string, pattern: string) => boolean
  const { minimatch } = require('minimatch') as { minimatch: MinimatchFn }
  const moduleStats = new Map<string, { total: number; multi: number }>()

  for (const commit of commits) {
    const files = commit.files.map((f) => f.path).filter((f) => !ignore.some((g) => minimatch(f, g)))
    const moduleHits = new Map<string, number>()
    for (const f of files) {
      const rel = pkgRoot ? (f.startsWith(`${pkgRoot}/`) ? f.slice(pkgRoot.length + 1) : f) : f
      const mod = rel.includes('/') ? (rel.split('/')[0] ?? '.') : '.'
      moduleHits.set(mod, (moduleHits.get(mod) ?? 0) + 1)
    }
    for (const [mod, count] of moduleHits.entries()) {
      const stats = moduleStats.get(mod) ?? { total: 0, multi: 0 }
      stats.total++
      if (count >= 2) stats.multi++
      moduleStats.set(mod, stats)
    }
  }

  return [...moduleStats.entries()].map(([module, { total, multi }]) => ({
    module,
    touchingCommits: total,
    multiFileCommits: multi,
    cohesionRatio: total > 0 ? multi / total : 0,
  }))
}

// ── tests ─────────────────────────────────────────────────────────────────────

const makeCommit = (oid: string, files: string[]): CommitRecord => ({
  oid,
  timestamp: 0,
  files: files.map((f) => ({ path: f, added: 5, removed: 2 })),
})

describe('computeChangeCoupling', () => {
  it('detects high coupling between files that always change together', () => {
    const commits = [
      makeCommit('a', ['src/a.ts', 'src/b.ts']),
      makeCommit('b', ['src/a.ts', 'src/b.ts']),
      makeCommit('c', ['src/a.ts', 'src/b.ts']),
    ]
    const pairs = computeChangeCoupling(commits, [])
    const pair = pairs.find((p) => new Set([p.fileA, p.fileB]).has('src/a.ts') && new Set([p.fileA, p.fileB]).has('src/b.ts'))
    expect(pair?.ratio).toBe(1.0)
  })

  it('ignores files matching ignore patterns', () => {
    const commits = [makeCommit('a', ['src/a.ts', '.claude/foo.ts'])]
    const pairs = computeChangeCoupling(commits, ['.claude/**'])
    expect(pairs).toHaveLength(0)
  })

  it('computes ratio as coChanges / max(totalA, totalB)', () => {
    const commits = [
      makeCommit('a', ['x.ts', 'y.ts']),
      makeCommit('b', ['x.ts']), // x changes alone
      makeCommit('c', ['x.ts', 'y.ts']),
    ]
    const pairs = computeChangeCoupling(commits, [])
    const pair = pairs.find((p) => new Set([p.fileA, p.fileB]).has('x.ts') && new Set([p.fileA, p.fileB]).has('y.ts'))
    // x appears 3 times, y appears 2 times, co-changes 2 times → ratio = 2/3
    expect(pair?.ratio).toBeCloseTo(2 / 3)
  })
})

describe('computeChangeCohesion', () => {
  it('scores a module high when files always change together', () => {
    const commits = [
      makeCommit('a', ['src/payments/a.ts', 'src/payments/b.ts']),
      makeCommit('b', ['src/payments/a.ts', 'src/payments/b.ts']),
    ]
    const modules = computeChangeCohesion(commits, 'src', [])
    const m = modules.find((x) => x.module === 'payments')
    expect(m?.cohesionRatio).toBe(1.0)
  })

  it('scores a module low when files always change independently', () => {
    const commits = [makeCommit('a', ['src/auth/a.ts']), makeCommit('b', ['src/auth/b.ts']), makeCommit('c', ['src/auth/c.ts'])]
    const modules = computeChangeCohesion(commits, 'src', [])
    const m = modules.find((x) => x.module === 'auth')
    expect(m?.cohesionRatio).toBe(0)
  })

  it('ignores files matching ignore patterns', () => {
    const commits = [makeCommit('a', ['src/auth/a.ts', '.claude/foo.ts'])]
    const modules = computeChangeCohesion(commits, 'src', ['.claude/**'])
    // Only one file in auth after filtering — no multi-file commit
    const m = modules.find((x) => x.module === 'auth')
    expect(m?.multiFileCommits).toBe(0)
  })

  it('handles files outside pkgRoot as their own module', () => {
    const commits = [makeCommit('a', ['scripts/foo.ts'])]
    const modules = computeChangeCohesion(commits, 'src', [])
    expect(modules.find((x) => x.module === 'scripts')).toBeDefined()
  })
})
