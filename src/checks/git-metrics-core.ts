import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { minimatch } from 'minimatch'

const _require = createRequire(import.meta.url)

type CommitFileEntry = { path: string; added: number; removed: number }
export type CommitRecord = { oid: string; timestamp: number; files: CommitFileEntry[] }
export type FileChurnData = { file: string; commitCount: number; fileSize: number; churnRate: number }
export type CouplingPair = { fileA: string; fileB: string; coChanges: number; totalA: number; totalB: number; ratio: number }
export type ModuleCohesionData = { module: string; touchingCommits: number; multiFileCommits: number; cohesionRatio: number }

// Typed just enough to use — isomorphic-git is an optional dep so we don't import it statically.
type GitLib = {
  log: (opts: { fs: unknown; dir: string; since?: Date }) => Promise<Array<{ oid: string; commit: { committer: { timestamp: number } } }>>
  walk: (opts: {
    fs: unknown
    dir: string
    trees: unknown[]
    map: (filepath: string, entries: Array<{ content: () => Promise<Uint8Array> } | null>) => Promise<void>
  }) => Promise<void>
  TREE: (opts: { ref: string }) => unknown
}

type GitEntry = { content: () => Promise<Uint8Array> } | null

async function diffEntry(filepath: string, entries: GitEntry[]): Promise<CommitFileEntry | null> {
  const [current, parent] = entries
  const [cContent, pContent] = await Promise.all([
    (current as GitEntry & { content: () => Promise<Uint8Array> })?.content().catch(() => null) ?? null,
    (parent as GitEntry & { content: () => Promise<Uint8Array> })?.content().catch(() => null) ?? null,
  ])
  if (!cContent && !pContent) return null
  const cLines = cContent ? Buffer.from(cContent).toString('utf-8').split('\n').length : 0
  const pLines = pContent ? Buffer.from(pContent).toString('utf-8').split('\n').length : 0
  const added = Math.max(0, cLines - pLines)
  const removed = Math.max(0, pLines - cLines)
  return added + removed > 0 ? { path: filepath, added, removed } : null
}

const SOURCE_EXTS = ['.ts', '.tsx', '.js', '.jsx']

export async function walkCommits(dir: string, windowDays: number): Promise<CommitRecord[]> {
  // Resolve from dir so the consumer's node_modules is found, not verify's own.
  const cwdRequire = createRequire(path.join(dir, 'index.js'))
  const git = cwdRequire('isomorphic-git') as GitLib
  const nodeFs: unknown = cwdRequire('node:fs')

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
  const commits = await git.log({ fs: nodeFs, dir, since })

  const records: CommitRecord[] = []
  for (let i = 0; i < commits.length; i++) {
    const commit = commits[i]
    if (!commit) continue
    const parentOid = commits[i + 1]?.oid
    if (!parentOid) continue

    const files: CommitFileEntry[] = []
    await git.walk({
      fs: nodeFs,
      dir,
      trees: [git.TREE({ ref: commit.oid }), git.TREE({ ref: parentOid })],
      map: async (filepath: string, entries: GitEntry[]) => {
        if (!SOURCE_EXTS.some((ext) => filepath.endsWith(ext))) return
        const entry = await diffEntry(filepath, entries)
        if (entry) files.push(entry)
      },
    })
    if (files.length > 0) {
      records.push({ oid: commit.oid, timestamp: commit.commit.committer.timestamp, files })
    }
  }
  return records
}

function currentLineCount(filePath: string): number {
  try {
    return fs.readFileSync(filePath, 'utf-8').split('\n').length
  } catch {
    return 100
  }
}

export function computeChurn(commits: CommitRecord[], dir: string, ignore: readonly string[]): FileChurnData[] {
  const commitCounts = new Map<string, number>()
  for (const commit of commits) {
    for (const f of commit.files) {
      if (ignore.some((g) => minimatch(f.path, g))) continue
      commitCounts.set(f.path, (commitCounts.get(f.path) ?? 0) + 1)
    }
  }
  const totalCommits = Math.max(commits.length, 1)
  return [...commitCounts.entries()].map(([file, commitCount]) => {
    const fileSize = currentLineCount(path.join(dir, file))
    const churnRate = commitCount / totalCommits
    return { file, commitCount, fileSize, churnRate }
  })
}

export function computeChangeCoupling(commits: CommitRecord[], ignore: readonly string[]): CouplingPair[] {
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

  const pairs: CouplingPair[] = []
  for (const [key, coChanges] of coChangeCounts.entries()) {
    const parts = key.split('\0')
    const fileA = parts[0] ?? ''
    const fileB = parts[1] ?? ''
    const totalA = commitCounts.get(fileA) ?? 0
    const totalB = commitCounts.get(fileB) ?? 0
    const ratio = coChanges / Math.max(totalA, totalB, 1)
    pairs.push({ fileA, fileB, coChanges, totalA, totalB, ratio })
  }
  return pairs
}

export function computeChangeCohesion(commits: CommitRecord[], pkgRoot: string, ignore: readonly string[]): ModuleCohesionData[] {
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
