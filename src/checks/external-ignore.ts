import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

type IgnoreHook = (patterns: readonly string[], cwd: string) => { args: string[]; cleanup?: () => void }

function writeTempJson(cwd: string, name: string, content: unknown): { file: string; cleanup: () => void } {
  const file = path.join(cwd, name)
  fs.writeFileSync(file, JSON.stringify(content, null, 2), 'utf-8')
  return {
    file,
    cleanup: () => {
      try {
        fs.unlinkSync(file)
      } catch {
        /* already gone */
      }
    },
  }
}

function readJsonOrEmpty(filePath: string): Record<string, unknown> {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

// ─── oxlint ──────────────────────────────────────────────────────────────────

export function oxlintIgnore(baseConfigPath = '.oxlintrc.json'): IgnoreHook {
  return (patterns, cwd) => {
    const base = readJsonOrEmpty(path.join(cwd, baseConfigPath))
    const existing: string[] = Array.isArray(base.ignorePatterns) ? (base.ignorePatterns as string[]) : []
    const merged = { ...base, ignorePatterns: [...existing, ...patterns] }
    const { file, cleanup } = writeTempJson(cwd, '.verifyx-tmp-oxlintrc.json', merged)
    return { args: ['-c', file], cleanup }
  }
}

// ─── oxfmt ───────────────────────────────────────────────────────────────────

export function oxfmtIgnore(): IgnoreHook {
  return (patterns, cwd) => {
    // Collect content from existing ignore files that oxfmt respects by default.
    const defaultIgnoreFiles = ['.gitignore', '.prettierignore']
    const existingLines: string[] = []
    for (const name of defaultIgnoreFiles) {
      try {
        existingLines.push(fs.readFileSync(path.join(cwd, name), 'utf-8').trimEnd())
      } catch {
        /* not present */
      }
    }
    const content = `${[...existingLines, ...patterns].filter(Boolean).join('\n')}\n`
    const file = path.join(os.tmpdir(), `.verifyx-tmp-oxfmt-ignore-${process.pid}`)
    fs.writeFileSync(file, content, 'utf-8')
    const cleanup = () => {
      try {
        fs.unlinkSync(file)
      } catch {
        /* already gone */
      }
    }
    return { args: [`--ignore-path=${file}`], cleanup }
  }
}

// ─── tsc ─────────────────────────────────────────────────────────────────────

export function tscIgnore(baseConfigPath = 'tsconfig.json'): IgnoreHook {
  return (patterns, cwd) => {
    const base = readJsonOrEmpty(path.join(cwd, baseConfigPath))
    const existing: string[] = Array.isArray(base.exclude) ? (base.exclude as string[]) : []
    // Use `extends` so tsc picks up compilerOptions/include from the base config without duplicating them.
    const merged: Record<string, unknown> = { extends: `./${baseConfigPath}`, exclude: [...existing, ...patterns] }
    const { file, cleanup } = writeTempJson(cwd, '.verifyx-tmp-tsconfig.json', merged)
    return { args: ['--project', file], cleanup }
  }
}

// ─── knip ────────────────────────────────────────────────────────────────────

export function knipIgnore(baseConfigCandidates = ['knip.json', 'knip.jsonc', '.knip.json']): IgnoreHook {
  return (patterns, cwd) => {
    const base = baseConfigCandidates.reduce<Record<string, unknown>>((acc, name) => {
      if (Object.keys(acc).length > 0) return acc
      return readJsonOrEmpty(path.join(cwd, name))
    }, {})
    const existing: string[] = Array.isArray(base.ignore) ? (base.ignore as string[]) : []
    const merged = { ...base, ignore: [...existing, ...patterns] }
    const { file, cleanup } = writeTempJson(cwd, '.verifyx-tmp-knip.json', merged)
    return { args: ['--config', file], cleanup }
  }
}

// ─── skott ───────────────────────────────────────────────────────────────────

export function skottIgnore(): IgnoreHook {
  return (patterns) => ({
    args: patterns.flatMap((p) => ['--ignorePattern', p]),
  })
}

// ─── jscpd ───────────────────────────────────────────────────────────────────

export function jscpdIgnore(): IgnoreHook {
  return (patterns) => ({
    // jscpd --ignore accepts a single comma-separated string
    args: ['--ignore', patterns.join(',')],
  })
}
