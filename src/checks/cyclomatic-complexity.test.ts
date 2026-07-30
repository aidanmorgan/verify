import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runCyclomaticComplexity } from './cyclomatic-complexity.ts'

let dir: string

beforeEach(() => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'verify-cyclomatic-')))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('runCyclomaticComplexity', () => {
  it('skips when no threshold or profile is set', async () => {
    const origCwd = process.cwd()
    process.chdir(dir)
    try {
      // Simulate oxlint being "installed" by creating a fake bin
      const binDir = path.join(dir, 'node_modules', '.bin')
      fs.mkdirSync(binDir, { recursive: true })
      fs.writeFileSync(path.join(binDir, 'oxlint'), '#!/bin/sh\nexit 0', { mode: 0o755 })

      const result = await runCyclomaticComplexity({})
      expect(result.ok).toBe(true)
      expect(result.skipped).toBe(true)
    } finally {
      process.chdir(origCwd)
    }
  })

  it('skips when oxlint is not installed', async () => {
    const origCwd = process.cwd()
    process.chdir(dir)
    try {
      const result = await runCyclomaticComplexity({ maxThreshold: 10 })
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
      // Fake oxlint that records what config it received and exits 0
      const binDir = path.join(dir, 'node_modules', '.bin')
      fs.mkdirSync(binDir, { recursive: true })
      const recordFile = path.join(dir, 'recorded-args.json')
      fs.writeFileSync(path.join(binDir, 'oxlint'), `#!/bin/sh\necho "$@" > ${recordFile}\nexit 0`, { mode: 0o755 })

      const result = await runCyclomaticComplexity({ profile: 'aggressive' })
      expect(result.ok).toBe(true)
      expect(result.skipped).toBeUndefined()

      // The temp config should have been cleaned up
      expect(fs.existsSync(path.join(dir, '.verifyx-tmp-cyclomatic-oxlintrc.json'))).toBe(false)
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
      // Capture the config file content before oxlint deletes it by reading it inline
      const configCapture = path.join(dir, 'captured-config.json')
      fs.writeFileSync(path.join(binDir, 'oxlint'), `#!/bin/sh\ncp "$2" ${configCapture}\nexit 0`, { mode: 0o755 })

      await runCyclomaticComplexity({ maxThreshold: 10, ignore: ['**/generated/**'] })

      const captured = JSON.parse(fs.readFileSync(configCapture, 'utf-8')) as { ignorePatterns: string[] }
      expect(captured.ignorePatterns).toContain('**/generated/**')
    } finally {
      process.chdir(origCwd)
    }
  })

  it('includes the complexity rule with the specified threshold in the temp config', async () => {
    const origCwd = process.cwd()
    process.chdir(dir)
    try {
      const binDir = path.join(dir, 'node_modules', '.bin')
      fs.mkdirSync(binDir, { recursive: true })
      const configCapture = path.join(dir, 'captured-config.json')
      fs.writeFileSync(path.join(binDir, 'oxlint'), `#!/bin/sh\ncp "$2" ${configCapture}\nexit 0`, { mode: 0o755 })

      await runCyclomaticComplexity({ maxThreshold: 7 })

      const captured = JSON.parse(fs.readFileSync(configCapture, 'utf-8')) as {
        rules: { complexity: [string, { max: number }] }
      }
      expect(captured.rules.complexity[0]).toBe('error')
      expect(captured.rules.complexity[1].max).toBe(7)
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
      fs.writeFileSync(path.join(binDir, 'oxlint'), '#!/bin/sh\nexit 1', { mode: 0o755 })

      const result = await runCyclomaticComplexity({ maxThreshold: 5 })
      expect(result.ok).toBe(false)
      expect(fs.existsSync(path.join(dir, '.verifyx-tmp-cyclomatic-oxlintrc.json'))).toBe(false)
    } finally {
      process.chdir(origCwd)
    }
  })
})
