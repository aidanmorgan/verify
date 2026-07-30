import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resolveTestEntry, resolveTestScript } from './tests.ts'

// resolveTestEntry calls loadPackageScripts() which uses process.cwd(), so we need a temp dir with a package.json.
let dir: string
let restoreCwd: () => void

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-tests-'))
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run', 'test:ci': 'vitest run --ci' } }))
  const orig = process.cwd()
  process.chdir(dir)
  restoreCwd = () => process.chdir(orig)
})
afterEach(() => {
  restoreCwd()
  fs.rmSync(dir, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

describe('resolveTestScript', () => {
  it('prefers an explicit verify:test locally, then the standard test script', () => {
    expect(resolveTestScript({ 'verify:test': 'vitest run --silent', test: 'vitest' }, false)).toBe('verify:test')
    expect(resolveTestScript({ test: 'vitest' }, false)).toBe('test')
  })

  it('runs only test:ci on CI, never a plain test/verify:test', () => {
    expect(resolveTestScript({ 'verify:test': 'x', test: 'y', 'test:ci': 'vitest run --reporter=junit' }, true)).toBe('test:ci')
    expect(resolveTestScript({ 'verify:test': 'x', test: 'y' }, true)).toBeNull()
  })

  it('returns null when no applicable script exists', () => {
    expect(resolveTestScript({ build: 'tsc' }, false)).toBeNull()
    expect(resolveTestScript({}, true)).toBeNull()
  })
})

describe('resolveTestEntry', () => {
  it('returns null when noTests is true', () => {
    expect(resolveTestEntry({ noTests: true })).toBeNull()
  })

  it('returns a shell entry with npm run by default', () => {
    const entry = resolveTestEntry()
    expect(entry).not.toBeNull()
    expect(entry?.kind).toBe('shell')
    if (entry?.kind === 'shell') {
      expect(entry.command).toBe('npm run test')
      expect(entry.name).toBe('test')
    }
  })

  it('uses pnpm when lockfile is detected', () => {
    fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '')
    const entry = resolveTestEntry()
    expect(entry?.kind).toBe('shell')
    if (entry?.kind === 'shell') expect(entry.command).toBe('pnpm run test')
  })

  it('uses an explicit pm override', () => {
    const entry = resolveTestEntry({ pm: 'yarn' })
    expect(entry?.kind).toBe('shell')
    if (entry?.kind === 'shell') expect(entry.command).toBe('yarn test')
  })

  it('returns an argv entry when runner is vitest', () => {
    const entry = resolveTestEntry({ testConfig: { runner: 'vitest' } })
    expect(entry).not.toBeNull()
    expect(entry?.kind).toBe('argv')
    if (entry?.kind === 'argv') {
      expect(entry.argv).toEqual(['vitest', 'run'])
      expect(entry.name).toBe('test')
    }
  })

  it('does NOT auto-detect vitest when only the binary is present (no config or script signal)', () => {
    // Overwrite package.json so the test script does NOT call vitest
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'jest --runInBand' } }))
    const bin = path.join(dir, 'node_modules', '.bin')
    fs.mkdirSync(bin, { recursive: true })
    fs.writeFileSync(path.join(bin, 'vitest'), '')
    const entry = resolveTestEntry()
    expect(entry?.kind).toBe('shell')
  })

  it('auto-detects vitest when binary is present and a vitest config file exists', () => {
    const bin = path.join(dir, 'node_modules', '.bin')
    fs.mkdirSync(bin, { recursive: true })
    fs.writeFileSync(path.join(bin, 'vitest'), '')
    fs.writeFileSync(path.join(dir, 'vitest.config.ts'), '')
    const entry = resolveTestEntry()
    expect(entry?.kind).toBe('argv')
  })

  it('auto-detects vitest when binary is present and the test script calls vitest', () => {
    // package.json already written in beforeEach with test: 'vitest run'
    const bin = path.join(dir, 'node_modules', '.bin')
    fs.mkdirSync(bin, { recursive: true })
    fs.writeFileSync(path.join(bin, 'vitest'), '')
    const entry = resolveTestEntry()
    expect(entry?.kind).toBe('argv')
  })

  it('uses npm-script when explicitly requested even if vitest is installed and configured', () => {
    const bin = path.join(dir, 'node_modules', '.bin')
    fs.mkdirSync(bin, { recursive: true })
    fs.writeFileSync(path.join(bin, 'vitest'), '')
    fs.writeFileSync(path.join(dir, 'vitest.config.ts'), '')
    const entry = resolveTestEntry({ testConfig: { runner: 'npm-script' } })
    expect(entry?.kind).toBe('shell')
  })

  it('appends --exclude per ignore glob when runner is vitest', () => {
    const entry = resolveTestEntry({ testConfig: { runner: 'vitest' }, ignore: ['.claude/**', '.trash/**'] })
    expect(entry?.kind).toBe('argv')
    if (entry?.kind === 'argv') {
      expect(entry.argv).toEqual(['vitest', 'run', '--exclude', '.claude/**', '--exclude', '.trash/**'])
    }
  })

  it('places vitestArgs before --exclude args', () => {
    const entry = resolveTestEntry({
      testConfig: { runner: 'vitest', vitestArgs: ['--reporter=verbose'] },
      ignore: ['.claude/**'],
    })
    expect(entry?.kind).toBe('argv')
    if (entry?.kind === 'argv') {
      expect(entry.argv).toEqual(['vitest', 'run', '--reporter=verbose', '--exclude', '.claude/**'])
    }
  })

  it('includes envWithLocalBin env in argv entry', () => {
    const entry = resolveTestEntry({ testConfig: { runner: 'vitest' } })
    expect(entry?.kind).toBe('argv')
    if (entry?.kind === 'argv') {
      const pathKey = Object.keys(entry.env).find((k) => k.toLowerCase() === 'path') ?? 'PATH'
      expect(entry.env[pathKey]).toContain('node_modules')
    }
  })
})
