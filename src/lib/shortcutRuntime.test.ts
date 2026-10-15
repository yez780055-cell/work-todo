import { describe, expect, it, vi } from 'vitest'
import { createDefaultShortcutSettings, type ShortcutId, type ShortcutSettings } from './shortcuts'
import { ShortcutRuntime, type GlobalShortcutAdapter, type GlobalShortcutEvent } from './shortcutRuntime'
import type { SettingsStorage } from './shortcutSettings'

function harness(options: { initial?: ShortcutSettings; reject?: (shortcut: string) => boolean; saveError?: boolean } = {}) {
  let persisted = structuredClone(options.initial ?? createDefaultShortcutSettings())
  const storage: SettingsStorage = {
    load: () => ({ settings: structuredClone(persisted), warning: null }),
    save: (settings) => {
      if (options.saveError) throw new Error('storage is full')
      persisted = structuredClone(settings)
    },
  }
  const registrations = new Map<string, (event: GlobalShortcutEvent) => void>()
  const calls: string[] = []
  const adapter: GlobalShortcutAdapter = {
    register: vi.fn(async (shortcut, handler) => {
      calls.push(`register:${shortcut}`)
      if (options.reject?.(shortcut)) throw new Error('already registered')
      registrations.set(shortcut, handler)
    }),
    unregister: vi.fn(async (shortcut) => {
      calls.push(`unregister:${shortcut}`)
      registrations.delete(shortcut)
    }),
  }
  const loadAdapter = vi.fn(async () => adapter)
  const onGlobalAction = vi.fn()
  const runtime = new ShortcutRuntime({ storage, loadAdapter, onGlobalAction })
  return { runtime, adapter, calls, registrations, loadAdapter, onGlobalAction, get persisted() { return persisted } }
}

describe('global shortcut runtime', () => {
  it('does not load the native plugin in a browser', async () => {
    const app = harness()
    await app.runtime.start(false)
    expect(app.runtime.getSnapshot().ready).toBe(true)
    expect(app.runtime.getSnapshot().statuses['global.quickCreate'].state).toBe('unsupported')
    expect(app.loadAdapter).not.toHaveBeenCalled()
  })

  it('registers enabled defaults and dispatches only pressed events', async () => {
    const app = harness()
    await app.runtime.start(true)
    expect(app.runtime.getSnapshot().statuses['global.quickCreate'].state).toBe('active')
    app.registrations.get('Ctrl+Alt+Shift+N')?.({ state: 'Released' })
    app.registrations.get('Ctrl+Alt+Shift+N')?.({ state: 'Pressed' })
    app.registrations.get('Ctrl+Alt+Shift+N')?.({ state: 'Pressed' })
    expect(app.onGlobalAction).toHaveBeenCalledTimes(2)
    expect(app.onGlobalAction).toHaveBeenCalledWith('quickCreate')
  })

  it('registers a replacement before releasing the previous binding', async () => {
    const app = harness()
    await app.runtime.start(true)
    const result = await app.runtime.updateBinding('global.quickCreate', { enabled: true, shortcut: 'Ctrl+Shift+F3' })
    expect(result.ok).toBe(true)
    expect(app.calls.indexOf('register:Ctrl+Shift+F3')).toBeLessThan(app.calls.indexOf('unregister:Ctrl+Alt+Shift+N'))
    expect(app.runtime.getSnapshot().settings.bindings['global.quickCreate'].shortcut).toBe('Ctrl+Shift+F3')
  })

  it('keeps the original shortcut when another process owns the replacement', async () => {
    const app = harness({ reject: (shortcut) => shortcut === 'Ctrl+Shift+F3' })
    await app.runtime.start(true)
    const result = await app.runtime.updateBinding('global.quickCreate', { enabled: true, shortcut: 'Ctrl+Shift+F3' })
    expect(result).toMatchObject({ ok: false, kind: 'conflict' })
    expect(app.runtime.getSnapshot().settings.bindings['global.quickCreate'].shortcut).toBe('Ctrl+Alt+Shift+N')
    expect(app.registrations.has('Ctrl+Alt+Shift+N')).toBe(true)
  })

  it('rejects duplicate bindings without native registration side effects', async () => {
    const app = harness()
    await app.runtime.start(true)
    const count = app.calls.length
    const result = await app.runtime.updateBinding('window.quickCreate', { enabled: true, shortcut: 'Ctrl+Alt+Shift+K' })
    expect(result).toMatchObject({ ok: false, kind: 'conflict' })
    expect(app.calls).toHaveLength(count)
  })

  it('rolls native changes back if preference persistence fails', async () => {
    const app = harness({ saveError: true })
    await app.runtime.start(true)
    const result = await app.runtime.updateBinding('global.quickCreate', { enabled: true, shortcut: 'Ctrl+Shift+F3' })
    expect(result.ok).toBe(false)
    expect(app.runtime.getSnapshot().settings.bindings['global.quickCreate'].shortcut).toBe('Ctrl+Alt+Shift+N')
    expect(app.registrations.has('Ctrl+Alt+Shift+N')).toBe(true)
    expect(app.registrations.has('Ctrl+Shift+F3')).toBe(false)
  })

  it('unregisters only owned bindings on disposal and can restart cleanly', async () => {
    const app = harness()
    await app.runtime.start(true)
    const oldHandler = app.registrations.get('Ctrl+Alt+Shift+N')!
    await app.runtime.dispose()
    oldHandler({ state: 'Pressed' })
    expect(app.onGlobalAction).not.toHaveBeenCalled()
    expect(app.registrations.size).toBe(0)
    await app.runtime.start(true)
    expect(app.runtime.getSnapshot().ready).toBe(true)
    expect(app.registrations.has('Ctrl+Alt+Shift+N')).toBe(true)
  })

  it('preserves saved disabled state across restarts', async () => {
    const settings = createDefaultShortcutSettings()
    settings.bindings['global.searchTasks'] = { ...settings.bindings['global.searchTasks'], enabled: false }
    const app = harness({ initial: settings })
    await app.runtime.start(true)
    expect(app.adapter.register).toHaveBeenCalledTimes(1)
    expect(app.runtime.getSnapshot().statuses['global.searchTasks'].state).toBe('disabled')
    const id: ShortcutId = 'global.searchTasks'
    expect(app.runtime.getSnapshot().settings.bindings[id].enabled).toBe(false)
  })
})
