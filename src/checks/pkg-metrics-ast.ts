import fs from 'node:fs'
import path from 'node:path'

import { minimatch } from 'minimatch'
import ts from 'typescript'

// ─── file collection ──────────────────────────────────────────────────────────

function collectTsFiles(dir: string): string[] {
  const results: string[] = []
  if (!fs.existsSync(dir)) return results
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }) as fs.Dirent[]) {
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
      results.push(...collectTsFiles(path.join(dir, entry.name)))
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.spec.ts')
    ) {
      results.push(path.join(dir, entry.name))
    }
  }
  return results
}

// ─── export analysis ─────────────────────────────────────────────────────────

type ExportCounts = { numClasses: number; numAbstract: number }

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  if (!ts.canHaveModifiers(node)) return false
  return ts.getModifiers(node)?.some((m) => m.kind === kind) ?? false
}

function analyzeExports(source: ts.SourceFile): ExportCounts {
  let numClasses = 0
  let numAbstract = 0
  for (const statement of source.statements) {
    const isExported = hasModifier(statement, ts.SyntaxKind.ExportKeyword)
    const isReExport = ts.isExportDeclaration(statement) && !!statement.moduleSpecifier
    if (!isExported || isReExport) continue
    numClasses++
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      numAbstract++
    } else if (ts.isClassDeclaration(statement) && hasModifier(statement, ts.SyntaxKind.AbstractKeyword)) {
      numAbstract++
    }
  }
  return { numClasses, numAbstract }
}

// ─── import analysis ─────────────────────────────────────────────────────────

type ImportCounts = { internalRelationships: number; externalTargets: string[] }

function countImportedSymbols(clause: ts.ImportClause): number {
  let count = 0
  if (clause.name) count++
  if (clause.namedBindings) {
    if (ts.isNamespaceImport(clause.namedBindings)) count++
    else if (ts.isNamedImports(clause.namedBindings)) count += clause.namedBindings.elements.length
  }
  return count || 1
}

function analyzeImports(source: ts.SourceFile, filePath: string, packageDir: string, allPackageDirs: readonly string[]): ImportCounts {
  let internalRelationships = 0
  const externalTargets: string[] = []

  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    const specifier = statement.moduleSpecifier
    if (!ts.isStringLiteral(specifier)) continue
    const raw = specifier.text
    if (!raw.startsWith('.')) continue

    const resolved = path.normalize(path.join(path.dirname(filePath), raw))
    const symbolCount = statement.importClause ? countImportedSymbols(statement.importClause) : 1

    if (resolved.startsWith(packageDir)) {
      internalRelationships += symbolCount
      continue
    }

    const targetPackage = allPackageDirs.find((d) => resolved.startsWith(d))
    if (targetPackage) {
      externalTargets.push(...Array<string>(symbolCount).fill(path.basename(targetPackage)))
    }
  }
  return { internalRelationships, externalTargets }
}

// ─── per-package file analysis ────────────────────────────────────────────────

export type RawPackageData = {
  name: string
  dir: string
  numClasses: number
  numAbstract: number
  internalRelationships: number
  efferentTargets: string[]
}

export function analyzePackage(
  name: string,
  dir: string,
  allPackageDirs: readonly string[],
  ignore: readonly string[] = [],
): RawPackageData {
  const files = collectTsFiles(dir).filter((f) => !ignore.some((g) => minimatch(f, g)))
  let numClasses = 0
  let numAbstract = 0
  let internalRelationships = 0
  const efferentTargets: string[] = []

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8')
    const source = ts.createSourceFile(
      path.basename(file),
      content,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
    const exp = analyzeExports(source)
    numClasses += exp.numClasses
    numAbstract += exp.numAbstract
    const imp = analyzeImports(source, file, dir, allPackageDirs)
    internalRelationships += imp.internalRelationships
    efferentTargets.push(...imp.externalTargets)
  }

  return { name, dir, numClasses, numAbstract, internalRelationships, efferentTargets }
}
