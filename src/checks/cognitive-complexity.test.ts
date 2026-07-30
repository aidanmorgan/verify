import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runCognitiveComplexity } from './cognitive-complexity.ts'

let dir: string

beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'verify-cognitive-')))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('runCognitiveComplexity', () => {
  it('skips when no threshold or profile is set', async () => {
    const origCwd = process.cwd()
    process.chdir(dir)
    try {
      const binDir = path.join(dir, 'node_modules', '.bin')
      fs.mkdirSync(binDir, { recursive: true })
      fs.writeFileSync(path.join(binDir, 'biome'), '#!/bin/sh\nexit 0', { mode: 0o755 })

      const result = await runCognitiveComplexity({})
      expect(result.ok).toBe(true)
      expect(result.skipped).toBe(true)
    } finally {
      process.chdir(origCwd)
    }
  })

  it('skips when biome is not installed', async () => {
    const origCwd = process.cwd()
    process.chdir(dir)
    try {
      const result = await runCognitiveComplexity({ maxThreshold: 15 })
      expect(result.ok).toBe(true)
      expect(result.skipped).toBe(true)
    } finally {
      process.chdir(origCwd)
    }
  })

  it('resolves threshold from profile', async () => {
    const origCwd = process.cwd()
    process.chdir(dir)
    try {
      const binDir = path.join(dir, 'node_modules', '.bin')
      fs.mkdirSync(binDir, { recursive: true })
      const recordFile = path.join(dir, 'recorded-args.json')
      fs.writeFileSync(path.join(binDir, 'biome'), `#!/bin/sh\necho "$@" > ${recordFile}\nexit 0`, { mode: 0o755 })

      const result = await runCognitiveComplexity({ profile: 'light' })
      expect(result.ok).toBe(true)
      expect(result.skipped).toBeUndefined()

      // Temp config should be cleaned up
      expect(fs.existsSync(path.join(dir, '.verifyx-tmp-biome.json'))).toBe(false)
    } finally {
      process.chdir(origCwd)
    }
  })

  it('writes correct biome config with the specified threshold', async () => {
    const origCwd = process.cwd()
    process.chdir(dir)
    try {
      const binDir = path.join(dir, 'node_modules', '.bin')
      fs.mkdirSync(binDir, { recursive: true })
      const configCapture = path.join(dir, 'captured-config.json')
      // biome lint --config-path=<file> <target> — capture the config file path from arg[2]
      fs.writeFileSync(
        path.join(binDir, 'biome'),
        `#!/bin/sh\n# args: lint --config-path=<file> <target>\nCONFIG=$(echo "$2" | sed 's/--config-path=//')\ncp "$CONFIG" ${configCapture}\nexit 0`,
        { mode: 0o755 },
      )

      await runCognitiveComplexity({ maxThreshold: 20 })

      const captured = JSON.parse(fs.readFileSync(configCapture, 'utf-8')) as {
        linter: { rules: { complexity: { noExcessiveCognitiveComplexity: { level: string; options: { maxAllowedComplexity: number } } } } }
      }
      expect(captured.linter.rules.complexity.noExcessiveCognitiveComplexity.level).toBe('error')
      expect(captured.linter.rules.complexity.noExcessiveCognitiveComplexity.options.maxAllowedComplexity).toBe(20)
    } finally {
      process.chdir(origCwd)
    }
  })

  it('merges ignore patterns into the temp config', async () => {
    const origCwd = process.cwd()
    process.chdir(dir)
    try {
      const binDir = path.join(dir, 'node_modules', '.bin')
      fs.mkdirSync(binDir, { recursive: true })
      const configCapture = path.join(dir, 'captured-config.json')
      fs.writeFileSync(
        path.join(binDir, 'biome'),
        `#!/bin/sh\nCONFIG=$(echo "$2" | sed 's/--config-path=//')\ncp "$CONFIG" ${configCapture}\nexit 0`,
        { mode: 0o755 },
      )

      await runCognitiveComplexity({ maxThreshold: 15, ignore: ['**/generated/**'] })

      const captured = JSON.parse(fs.readFileSync(configCapture, 'utf-8')) as {
        files: { ignore: string[] }
      }
      expect(captured.files.ignore).toContain('**/generated/**')
    } finally {
      process.chdir(origCwd)
    }
  })

  it('recommended is false and linter has no extra rules', async () => {
    const origCwd = process.cwd()
    process.chdir(dir)
    try {
      const binDir = path.join(dir, 'node_modules', '.bin')
      fs.mkdirSync(binDir, { recursive: true })
      const configCapture = path.join(dir, 'captured-config.json')
      fs.writeFileSync(
        path.join(binDir, 'biome'),
        `#!/bin/sh\nCONFIG=$(echo "$2" | sed 's/--config-path=//')\ncp "$CONFIG" ${configCapture}\nexit 0`,
        { mode: 0o755 },
      )

      await runCognitiveComplexity({ maxThreshold: 15 })

      const captured = JSON.parse(fs.readFileSync(configCapture, 'utf-8')) as {
        linter: { rules: { recommended: boolean } }
      }
      expect(captured.linter.rules.recommended).toBe(false)
    } finally {
      process.chdir(origCwd)
    }
  })

  it('cleans up temp config on failure', async () => {
    const origCwd = process.cwd()
    process.chdir(dir)
    try {
      const binDir = path.join(dir, 'node_modules', '.bin')
      fs.mkdirSync(binDir, { recursive: true })
      fs.writeFileSync(path.join(binDir, 'biome'), '#!/bin/sh\nexit 1', { mode: 0o755 })

      const result = await runCognitiveComplexity({ maxThreshold: 5 })
      expect(result.ok).toBe(false)
      expect(fs.existsSync(path.join(dir, '.verifyx-tmp-biome.json'))).toBe(false)
    } finally {
      process.chdir(origCwd)
    }
  })
})
