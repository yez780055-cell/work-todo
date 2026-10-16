import { afterEach, describe, expect, it } from 'vitest'
import { isDesktopApp } from './platform'

const tauriRuntime = globalThis as typeof globalThis & { isTauri?: boolean }

afterEach(() => {
  delete tauriRuntime.isTauri
})

describe('desktop runtime detection', () => {
  it('returns false in the regular web app', () => {
    expect(isDesktopApp()).toBe(false)
  })

  it('recognizes the Tauri 2 runtime marker', () => {
    tauriRuntime.isTauri = true
    expect(isDesktopApp()).toBe(true)
  })
})
