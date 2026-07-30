import fs from 'node:fs'
import path from 'node:path'

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

/** Detect the package manager from lockfiles in `dir` (no upward walk). Falls back to npm. */
export function detectPackageManager(dir: string): PackageManager {
  if (fs.existsSync(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm'
  if (fs.existsSync(path.join(dir, 'yarn.lock'))) return 'yarn'
  if (fs.existsSync(path.join(dir, 'bun.lockb'))) return 'bun'
  return 'npm'
}

/** Return `explicit` when set; otherwise detect from lockfiles in `cwd`. */
export function resolvePackageManager(cwd: string, explicit?: PackageManager): PackageManager {
  return explicit ?? detectPackageManager(cwd)
}

/** Build the shell string for running a package.json script with the given package manager. */
export function runScriptCommand(script: string, pm: PackageManager): string {
  switch (pm) {
    case 'pnpm':
      return `pnpm run ${script}`
    case 'yarn':
      return `yarn ${script}`
    case 'bun':
      return `bun run ${script}`
    default:
      return `npm run ${script}`
  }
}
