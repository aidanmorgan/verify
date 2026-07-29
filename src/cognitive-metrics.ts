import ts from 'typescript'

import { logicalOperators, structuralKinds } from './metrics.ts'

// Cognitive complexity uses the same structural kinds as cyclomatic, plus SwitchStatement
const nestingIncrementKinds = new Set<ts.SyntaxKind>([...structuralKinds, ts.SyntaxKind.SwitchStatement])

function isFunctionLike(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessor(node) ||
    ts.isSetAccessor(node) ||
    ts.isConstructorDeclaration(node)
  )
}

function visitCognitive(n: ts.Node, nesting: number, root: ts.Node, acc: { value: number }): void {
  if (nestingIncrementKinds.has(n.kind)) {
    const isElseIf =
      ts.isIfStatement(n) && n.parent !== undefined && ts.isIfStatement(n.parent) && (n.parent as ts.IfStatement).elseStatement === n
    acc.value += isElseIf ? 1 : 1 + nesting
    const childNesting = isElseIf ? nesting : nesting + 1
    ts.forEachChild(n, (child) => visitCognitive(child, childNesting, root, acc))
    return
  }

  if (n.kind === ts.SyntaxKind.ConditionalExpression) {
    acc.value += 1
    ts.forEachChild(n, (child) => visitCognitive(child, nesting, root, acc))
    return
  }

  if (ts.isBinaryExpression(n) && logicalOperators.has(n.operatorToken.kind)) {
    const parentIsLogical = ts.isBinaryExpression(n.parent) && logicalOperators.has((n.parent as ts.BinaryExpression).operatorToken.kind)
    if (!parentIsLogical) acc.value += 1
    ts.forEachChild(n, (child) => visitCognitive(child, nesting, root, acc))
    return
  }

  if (ts.isPropertyAccessChain(n) || ts.isCallChain(n) || ts.isElementAccessChain(n)) {
    acc.value += 1
    ts.forEachChild(n, (child) => visitCognitive(child, nesting, root, acc))
    return
  }

  if (isFunctionLike(n) && n !== root) {
    ts.forEachChild(n, (child) => visitCognitive(child, 0, root, acc))
    return
  }

  ts.forEachChild(n, (child) => visitCognitive(child, nesting, root, acc))
}

export function calculateCognitiveComplexity(node: ts.Node): number {
  const acc = { value: 0 }
  ts.forEachChild(node, (child) => visitCognitive(child, 0, node, acc))
  return acc.value
}
