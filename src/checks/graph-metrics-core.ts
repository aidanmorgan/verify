import { minimatch } from 'minimatch'

export type DepModule = { source: string; dependencies: Array<{ resolved: string; dependencyTypes: string[] }> }

export function filterModules(modules: DepModule[], ignore: readonly string[]): DepModule[] {
  return modules.filter((m) => !ignore.some((g) => minimatch(m.source, g)))
}

export type ModuleRC = { module: string; files: number; internalEdges: number; rc: number }

export function computeRelationalCohesion(modules: DepModule[], pkgRoot: string): ModuleRC[] {
  function moduleOf(source: string): string {
    const rel = pkgRoot && source.startsWith(`${pkgRoot}/`) ? source.slice(pkgRoot.length + 1) : source
    const parts = rel.split('/')
    return parts.length > 1 ? (parts[0] ?? '.') : '.'
  }

  const fileCounts = new Map<string, number>()
  const edgeCounts = new Map<string, number>()

  for (const mod of modules) {
    const modName = moduleOf(mod.source)
    fileCounts.set(modName, (fileCounts.get(modName) ?? 0) + 1)
    for (const dep of mod.dependencies) {
      if (moduleOf(dep.resolved) === modName) {
        edgeCounts.set(modName, (edgeCounts.get(modName) ?? 0) + 1)
      }
    }
  }

  return [...fileCounts.entries()].map(([module, files]) => {
    const internalEdges = edgeCounts.get(module) ?? 0
    const rc = (internalEdges + 1) / files
    return { module, files, internalEdges, rc }
  })
}

function bfsReachable(adj: number[][], start: number): number {
  const visited = new Set<number>([start])
  const queue = [start]
  while (queue.length > 0) {
    const node = queue.shift()
    if (node === undefined) break
    for (const next of adj[node] ?? []) {
      if (!visited.has(next)) {
        visited.add(next)
        queue.push(next)
      }
    }
  }
  return visited.size - 1
}

export function computePropagationCost(modules: DepModule[]): number {
  if (modules.length === 0) return 0
  const sources = modules.map((m) => m.source)
  const index = new Map(sources.map((s, i) => [s, i]))
  const n = sources.length

  const adj: number[][] = Array.from({ length: n }, () => [])
  for (const mod of modules) {
    const i = index.get(mod.source)
    if (i === undefined) continue
    for (const dep of mod.dependencies) {
      const j = index.get(dep.resolved)
      if (j !== undefined && j !== i) (adj[i] as number[]).push(j)
    }
  }

  let totalReachable = 0
  for (let start = 0; start < n; start++) {
    totalReachable += bfsReachable(adj, start)
  }
  return totalReachable / (n * n)
}
