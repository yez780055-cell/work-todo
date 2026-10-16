import { describe, expect, it, vi } from 'vitest'
import { createDefaultShortcutSettings } from './shortcuts'
import { decodeShortcutSettings, loadShortcutSettings, saveShortcutSettings, SHORTCUT_SETTINGS_KEY } from './shortcutSettings'

function storage(initial: string | null = null) {
  const values = new Map<string, string>()
  if (initial !== null) values.set(SHORTCUT_SETTINGS_KEY, initial)
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
    values,
  }
}

describe('separate shortcut preference storage', () => {
  it('loads defaults when no shortcut preference exists', () => {
    expect(loadShortcutSettings(storage())).toEqual({ settings: createDefaultShortcutSettings(), warning: null })
  })

  it('repairs missing or invalid entries and reports unsupported versions', () => {
    const defaults = createDefaultShortcutSettings()
    const partial = decodeShortcutSettings({ version: 1, bindings: { 'window.quickCreate': { enabled: true, shortcut: 'F2' } } })
    expect(partial.settings.bindings['window.quickCreate'].shortcut).toBe('F2')
    expect(partial.settings.bindings['window.searchTasks']).toEqual(defaults.bindings['window.searchTasks'])
    expect(partial.warning).toContain('部分快捷键')
    expect(decodeShortcutSettings({ version: 9, bindings: {} }).warning).toContain('版本不受支持')
  })

  it('falls back safely for corrupt, invalid, or duplicate data', () => {
    expect(loadShortcutSettings(storage('{bad json')).warning).toContain('无法读取')
    const duplicated = createDefaultShortcutSettings()
    duplicated.bindings['window.quickCreate'].shortcut = 'Ctrl+Alt+Shift+K'
    expect(decodeShortcutSettings(duplicated).warning).toContain('重复')
    expect(loadShortcutSettings({ getItem: () => { throw new Error('private storage') } }).warning).toContain('无法读取')
  })

  it('persists only validated shortcut preferences in the separate versioned key', () => {
    const target = storage()
    const settings = createDefaultShortcutSettings()
    settings.bindings['window.quickCreate'] = { enabled: true, shortcut: 'F4' }
    saveShortcutSettings(settings, target)
    expect(target.values.has(SHORTCUT_SETTINGS_KEY)).toBe(true)
    expect(JSON.parse(target.values.get(SHORTCUT_SETTINGS_KEY)!).bindings['window.quickCreate'].shortcut).toBe('F4')
    expect(() => saveShortcutSettings({ ...settings, bindings: { ...settings.bindings, 'global.quickCreate': { enabled: true, shortcut: 'Ctrl+N' } } }, target)).toThrow()
  })
})
