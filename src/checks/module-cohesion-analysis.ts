export type FileResult = { file: string; components: number; exportCount: number }

// Typed just enough to use — ts-morph is an optional dep so we don't import it statically.
type TsMorphProject = { addSourceFileAtPath: (path: string) => TsMorphSourceFile }
type TsMorphSourceFile = {
  getExportedDeclarations: () => Map<string, TsMorphNode[]>
  getLocals: () => Array<{ getName: () => string }>
}
type TsMorphNode = { getDescendantsOfKind: (kind: number) => Array<{ getText: () => string }> }

class UnionFind {
  private parent: number[]
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i)
  }
  find(x: number): number {
    const px = this.parent[x]
    if (px === undefined) return x
    if (px !== x) this.parent[x] = this.find(px)
    return this.parent[x] ?? x
  }
  union(x: number, y: number): void {
    this.parent[this.find(x)] = this.find(y)
  }
  componentCount(n: number): number {
    return new Set(Array.from({ length: n }, (_, i) => this.find(i))).size
  }
}

function buildExportGraph(exportNames: string[], depSets: Map<string, Set<string>>): UnionFind {
  const uf = new UnionFind(exportNames.length)
  for (let i = 0; i < exportNames.length; i++) {
    for (let j = i + 1; j < exportNames.length; j++) {
      const nameI = exportNames[i]
      const nameJ = exportNames[j]
      if (!nameI || !nameJ) continue
      const depsI = depSets.get(nameI) ?? new Set<string>()
      const depsJ = depSets.get(nameJ) ?? new Set<string>()
      if ([...depsI].some((d) => depsJ.has(d)) || depsI.has(nameJ) || depsJ.has(nameI)) uf.union(i, j)
    }
  }
  return uf
}

export function analyzeFile(filePath: string, cwdRequire: NodeRequire): FileResult {
  const { Project } = cwdRequire('ts-morph') as { Project: new (opts: object) => TsMorphProject }
  const sourceFile = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true }).addSourceFileAtPath(filePath)

  const exports = sourceFile.getExportedDeclarations()
  const exportNames = [...exports.keys()]
  if (exportNames.length === 0) return { file: filePath, components: 1, exportCount: 0 }

  const localIdentifiers = new Set(sourceFile.getLocals().map((s: { getName: () => string }) => s.getName()))

  function depsOf(name: string): Set<string> {
    const deps = new Set<string>()
    for (const decl of exports.get(name) ?? []) {
      for (const ref of decl.getDescendantsOfKind(75 /* Identifier */)) {
        const text = ref.getText()
        if (text !== name && localIdentifiers.has(text)) deps.add(text)
      }
    }
    return deps
  }

  const depSets = new Map(exportNames.map((n) => [n, depsOf(n)]))
  const uf = buildExportGraph(exportNames, depSets)
  return { file: filePath, components: uf.componentCount(exportNames.length), exportCount: exportNames.length }
}
