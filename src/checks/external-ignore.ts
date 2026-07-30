import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

type IgnoreHook = (patterns: readonly string[], cwd: string) => { args: string[]; cleanup?: () => void }

// Track every temp file written this process so we can sweep on exit, even on unhandled failures.
const tempFiles = new Set<string>()

function sweepTempFiles(): void {
  for (const file of tempFiles) {
    try {
      fs.unlinkSync(file)
    } catch {
      /* already gone */
    }
  }
  tempFiles.clear()
}

process.on('exit', sweepTempFiles)
process.on('SIGINT', () => {
  sweepTempFiles()
  process.exit(130)
})
process.on('SIGTERM', () => {
  sweepTempFiles()
  process.exit(143)
})

let tempCounter = 0

export function writeTempJson(cwd: string, name: string, content: unknown): { file: string; cleanup: () => void } {
  // Include PID + a per-invocation counter so parallel checks writing the same logical config don't collide.
  const ext = path.extname(name)
  const base = name.slice(0, name.length - ext.length)
  const file = path.join(cwd, `${base}-${process.pid}-${++tempCounter}${ext}`)
  fs.writeFileSync(file, JSON.stringify(content, null, 2), 'utf-8')
  tempFiles.add(file)
  return {
    file,
    cleanup: () => {
      try {
        fs.unlinkSync(file)
        tempFiles.delete(file)
      } catch {
        /* already gone */
      }
    },
  }
}

export function readJsonOrEmpty(filePath: string): Record<string, unknown> {
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
    tempFiles.add(file)
    const cleanup = () => {
      try {
        fs.unlinkSync(file)
        tempFiles.delete(file)
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

function readFirstConfig(cwd: string, candidates: string[]): Record<string, unknown> {
  for (const name of candidates) {
    const parsed = readJsonOrEmpty(path.join(cwd, name))
    if (Object.keys(parsed).length > 0) return parsed
  }
  return {}
}

// ─── knip ────────────────────────────────────────────────────────────────────

export function knipIgnore(baseConfigCandidates = ['knip.json', 'knip.jsonc', '.knip.json']): IgnoreHook {
  return (patterns, cwd) => {
    const base = (() => {
      const fromFile = readFirstConfig(cwd, baseConfigCandidates)
      if (Object.keys(fromFile).length > 0) return fromFile
      const pkg = readJsonOrEmpty(path.join(cwd, 'package.json'))
      return (pkg.knip as Record<string, unknown> | undefined) ?? {}
    })()
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

// ─── biome ───────────────────────────────────────────────────────────────────

export function biomeIgnore(baseConfigCandidates = ['biome.json', 'biome.jsonc']): IgnoreHook {
  return (patterns, cwd) => {
    const base = readFirstConfig(cwd, baseConfigCandidates)
    const files = (base.files as Record<string, unknown> | undefined) ?? {}
    const existing: string[] = Array.isArray(files.ignore) ? (files.ignore as string[]) : []
    const merged = { ...base, files: { ...files, ignore: [...existing, ...patterns] } }
    const { file, cleanup } = writeTempJson(cwd, '.verifyx-tmp-biome.json', merged)
    return { args: [`--config-path=${file}`], cleanup }
  }
}

// ─── dependency-cruiser ──────────────────────────────────────────────────────

/**
 * Convert a glob pattern to a regex string suitable for depcruise's `exclude.path`.
 * Depcruise uses regex, not globs, so `**` must be translated.
 */
function globToDepcruiseRegex(glob: string): string {
  // Strip leading **/ — depcruise paths are relative so a leading wildcard is implicit
  const stripped = glob.replace(/^\*\*\//, '')
  // Escape regex metacharacters except * and /
  const escaped = stripped.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  // Replace ** with .* (match anything including slashes), then * with [^/]* (single segment)
  return escaped.replace(/\*\*/g, '.*').replace(/(?<!\.\*)\*/g, '[^/]*')
}

export function depcruiseIgnore(): IgnoreHook {
  return (patterns, cwd) => {
    const base = (() => {
      for (const name of ['.dependency-cruiser.json', '.dependency-cruiser.js', '.dependency-cruiser.cjs']) {
        try {
          const raw = fs.readFileSync(path.join(cwd, name), 'utf-8')
          // Only handle JSON configs; JS configs are too dynamic to merge safely.
          if (name.endsWith('.json')) return JSON.parse(raw) as Record<string, unknown>
        } catch {
          /* not present or unreadable */
        }
      }
      return {}
    })()
    const options = (base.options as Record<string, unknown> | undefined) ?? {}
    const exclude = (options.exclude as Record<string, unknown> | undefined) ?? {}
    const existing: string[] = Array.isArray(exclude.path) ? (exclude.path as string[]) : []
    const regexPatterns = patterns.map(globToDepcruiseRegex)
    const merged = { ...base, options: { ...options, exclude: { ...exclude, path: [...existing, ...regexPatterns] } } }
    const { file, cleanup } = writeTempJson(cwd, '.verifyx-tmp-dependency-cruiser.json', merged)
    return { args: ['--config', file], cleanup }
  }
}

// ─── jscpd ───────────────────────────────────────────────────────────────────

export function jscpdIgnore(): IgnoreHook {
  return (patterns, cwd) => {
    const base = (() => {
      const fromFile = readJsonOrEmpty(path.join(cwd, '.jscpd.json'))
      if (Object.keys(fromFile).length > 0) return fromFile
      const pkg = readJsonOrEmpty(path.join(cwd, 'package.json'))
      return (pkg.jscpd as Record<string, unknown> | undefined) ?? {}
    })()
    const existing: string[] = Array.isArray(base.ignore) ? (base.ignore as string[]) : []
    const merged = { ...base, ignore: [...existing, '**/*.test.*', ...patterns] }
    const { file, cleanup } = writeTempJson(cwd, '.verifyx-tmp-jscpd.json', merged)
    return { args: ['--config', file], cleanup }
  }
}
