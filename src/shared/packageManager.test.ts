import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { detectPackageManager, resolvePackageManager, runScriptCommand } from './packageManager.ts'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-pm-'))
})
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('detectPackageManager', () => {
  it('returns npm when no lockfile is present', () => {
    expect(detectPackageManager(dir)).toBe('npm')
  })

  it('returns pnpm when pnpm-lock.yaml is present', () => {
    fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), '')
    expect(detectPackageManager(dir)).toBe('pnpm')
  })

  it('returns yarn when yarn.lock is present', () => {
    fs.writeFileSync(path.join(dir, 'yarn.lock'), '')
    expect(detectPackageManager(dir)).toBe('yarn')
  })

  it('returns bun when bun.lockb is present', () => {
    fs.writeFileSync(path.join(dir, 'bun.lockb'), '')
    expect(detectPackageManager(dir)).toBe('bun')
  })

  it('does not walk up — only searches the given dir', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-pm-parent-'))
    try {
      fs.writeFileSync(path.join(parent, 'pnpm-lock.yaml'), '')
      const child = path.join(parent, 'child')
      fs.mkdirSync(child)
      // parent has a pnpm lockfile but child does not — detection must not walk up
      expect(detectPackageManager(child)).toBe('npm')
    } finally {
      fs.rmSync(parent, { recursive: true, force: true })
    }
  })
})

describe('resolvePackageManager', () => {
  it('returns the explicit value without touching the filesystem', () => {
    // dir has no lockfile; explicit overrides detection
    expect(resolvePackageManager(dir, 'pnpm')).toBe('pnpm')
    expect(resolvePackageManager(dir, 'yarn')).toBe('yarn')
    expect(resolvePackageManager(dir, 'bun')).toBe('bun')
    expect(resolvePackageManager(dir, 'npm')).toBe('npm')
  })

  it('detects from lockfile when no explicit value is given', () => {
    fs.writeFileSync(path.join(dir, 'yarn.lock'), '')
    expect(resolvePackageManager(dir)).toBe('yarn')
  })
})

describe('runScriptCommand', () => {
  it('builds correct shell strings for each package manager', () => {
    expect(runScriptCommand('verify:lint', 'npm')).toBe('npm run verify:lint')
    expect(runScriptCommand('verify:lint', 'pnpm')).toBe('pnpm run verify:lint')
    expect(runScriptCommand('verify:lint', 'yarn')).toBe('yarn verify:lint')
    expect(runScriptCommand('verify:lint', 'bun')).toBe('bun run verify:lint')
  })
})
