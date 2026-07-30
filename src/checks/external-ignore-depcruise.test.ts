import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { depcruiseIgnore } from './external-ignore.ts'

let dir: string

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-depcruise-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('depcruiseIgnore', () => {
  it('writes a temp config with exclude.path containing the patterns', () => {
    const hook = depcruiseIgnore()
    const { args, cleanup } = hook(['.claude/**', '**/*.test.ts'], dir)

    expect(args).toHaveLength(2)
    expect(args[0]).toBe('--config')
    const configFile = args[1]!
    expect(fs.existsSync(configFile)).toBe(true)

    const content = JSON.parse(fs.readFileSync(configFile, 'utf-8')) as { options: { exclude: { path: string[] } } }
    expect(content.options.exclude.path).toContain('\\.claude/.[^/]*')
    expect(content.options.exclude.path).toContain('[^/]*\\.test\\.ts')

    cleanup?.()
    expect(fs.existsSync(configFile)).toBe(false)
  })

  it('merges with an existing JSON config exclude.path', () => {
    const existing = { options: { exclude: { path: ['dist/**'] }, includeOnly: { path: 'src' } } }
    fs.writeFileSync(path.join(dir, '.dependency-cruiser.json'), JSON.stringify(existing))

    const hook = depcruiseIgnore()
    const { args, cleanup } = hook(['.claude/**'], dir)
    const configFile = args[1]!
    const content = JSON.parse(fs.readFileSync(configFile, 'utf-8')) as {
      options: { exclude: { path: string[] }; includeOnly: { path: string } }
    }

    expect(content.options.exclude.path).toContain('dist/**')
    expect(content.options.exclude.path).toContain('\\.claude/.[^/]*')
    // Non-ignore options preserved
    expect(content.options.includeOnly.path).toBe('src')

    cleanup?.()
  })

  it('returns empty args and no temp file when patterns is empty', () => {
    const hook = depcruiseIgnore()
    const { args, cleanup } = hook([], dir)
    const configFile = args[1]
    expect(configFile).toBeDefined()
    // File still written (empty patterns still produce valid config)
    const content = JSON.parse(fs.readFileSync(configFile!, 'utf-8')) as { options: { exclude: { path: string[] } } }
    expect(content.options.exclude.path).toHaveLength(0)
    cleanup?.()
  })
})
