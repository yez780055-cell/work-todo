import { describe, expect, it } from 'vitest'
import {
  createDefaultShortcutSettings,
  formatShortcut,
  matchesShortcutEvent,
  parseShortcut,
  shortcutFromKeyEvent,
  validateShortcutSettings,
} from './shortcuts'

describe('shortcut parsing and validation', () => {
  it('normalizes aliases and modifier order', () => {
    expect(parseShortcut(' Shift + Control + k ')?.canonical).toBe('Ctrl+Shift+K')
    expect(parseShortcut('Option+Cmd+F12')?.canonical).toBe('Alt+Meta+F12')
    expect(formatShortcut('Ctrl+K')).toBe('Ctrl + K')
  })

  it.each(['Ctrl++K', '+K', 'Ctrl+', 'Ctrl+Ctrl+K', 'Ctrl+Home', 'Ctrl+F13'])('rejects malformed or unsupported chord %s', (input) => {
    expect(parseShortcut(input)).toBeNull()
  })

  it('allows a single key for in-window shortcuts and restricts global shortcuts', () => {
    const settings = createDefaultShortcutSettings()
    expect(validateShortcutSettings(settings).ok).toBe(true)
    settings.bindings['global.quickCreate'] = { enabled: true, shortcut: 'Ctrl+N' }
    expect(validateShortcutSettings(settings)).toMatchObject({ ok: false, kind: 'invalid' })
    settings.bindings['global.quickCreate'] = { enabled: true, shortcut: 'Ctrl+Meta+N' }
    expect(validateShortcutSettings(settings)).toMatchObject({ ok: false, kind: 'invalid' })
    settings.bindings['global.quickCreate'] = { enabled: true, shortcut: 'Ctrl+Alt+Shift+N' }
    settings.bindings['window.quickCreate'] = { enabled: true, shortcut: 'N' }
    expect(validateShortcutSettings(settings).ok).toBe(true)
  })

  it('rejects duplicate active chords across window and global scopes', () => {
    const settings = createDefaultShortcutSettings()
    settings.bindings['window.searchTasks'] = { enabled: true, shortcut: 'Ctrl+Alt+Shift+N' }
    expect(validateShortcutSettings(settings)).toMatchObject({ ok: false, kind: 'conflict' })
  })

  it('matches exact modifier combinations and captures supported keys', () => {
    expect(matchesShortcutEvent({ key: 'k', ctrlKey: true, altKey: false, shiftKey: true, metaKey: false }, 'Ctrl+Shift+K')).toBe(true)
    expect(matchesShortcutEvent({ key: 'k', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false }, 'Ctrl+Shift+K')).toBe(false)
    expect(shortcutFromKeyEvent({ key: 'F3', ctrlKey: true, altKey: false, shiftKey: true, metaKey: false })).toBe('Ctrl+Shift+F3')
    expect(shortcutFromKeyEvent({ key: 'Control', ctrlKey: true, altKey: false, shiftKey: false, metaKey: false })).toBeNull()
  })
})
