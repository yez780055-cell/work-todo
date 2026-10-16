import {
  createDefaultShortcutSettings,
  SHORTCUT_IDS,
  type ShortcutId,
  type ShortcutSettings,
  validateBinding,
  validateShortcutSettings,
} from './shortcuts'

export const SHORTCUT_SETTINGS_KEY = 'worktodo.shortcut-settings.v1'

export interface ShortcutSettingsLoad {
  settings: ShortcutSettings
  warning: string | null
}

export interface SettingsStorage {
  load(): ShortcutSettingsLoad
  save(settings: ShortcutSettings): void
}

export function createLocalShortcutStorage(storage?: Pick<Storage, 'getItem' | 'setItem'>): SettingsStorage {
  return {
    load: () => loadShortcutSettings(storage ?? window.localStorage),
    save: (settings) => saveShortcutSettings(settings, storage ?? window.localStorage),
  }
}

export function loadShortcutSettings(storage: Pick<Storage, 'getItem'>): ShortcutSettingsLoad {
  let serialized: string | null
  try {
    serialized = storage.getItem(SHORTCUT_SETTINGS_KEY)
  } catch {
    return { settings: createDefaultShortcutSettings(), warning: '无法读取快捷键设置；本次先使用默认设置。' }
  }
  if (serialized === null) return { settings: createDefaultShortcutSettings(), warning: null }

  try {
    return decodeShortcutSettings(JSON.parse(serialized))
  } catch {
    return { settings: createDefaultShortcutSettings(), warning: '快捷键设置无法读取；本次先使用默认设置。保存新设置后会覆盖损坏的设置。' }
  }
}

export function decodeShortcutSettings(value: unknown): ShortcutSettingsLoad {
  if (!isRecord(value) || !Number.isInteger(value.version) || typeof value.version !== 'number') {
    return { settings: createDefaultShortcutSettings(), warning: '快捷键设置格式无法识别；本次先使用默认设置。' }
  }
  if (value.version !== 1) {
    return { settings: createDefaultShortcutSettings(), warning: '快捷键设置版本不受支持；本次先使用默认设置。' }
  }
  if (!isRecord(value.bindings)) {
    return { settings: createDefaultShortcutSettings(), warning: '快捷键设置内容不完整；本次先使用默认设置。' }
  }

  const defaults = createDefaultShortcutSettings()
  const bindings = { ...defaults.bindings }
  let repaired = false
  for (const id of SHORTCUT_IDS) {
    const candidate = value.bindings[id]
    if (!isRecord(candidate) || typeof candidate.enabled !== 'boolean' || typeof candidate.shortcut !== 'string') {
      repaired = true
      continue
    }
    const binding = { enabled: candidate.enabled, shortcut: candidate.shortcut.trim() }
    if (validateBinding(id, binding)) {
      repaired = true
      continue
    }
    bindings[id] = binding
  }

  const settings: ShortcutSettings = { version: 1, bindings }
  const validation = validateShortcutSettings(settings)
  if (!validation.ok) {
    return { settings: defaults, warning: '快捷键设置存在无效或重复组合；本次先恢复全部默认设置。' }
  }
  return {
    settings: validation.settings,
    warning: repaired ? '部分快捷键设置无效或缺失，已暂用对应默认值。保存后会写入修复后的设置。' : null,
  }
}

export function saveShortcutSettings(settings: ShortcutSettings, storage: Pick<Storage, 'setItem'>): void {
  const result = validateShortcutSettings(settings)
  if (!result.ok) throw new Error(result.message)
  storage.setItem(SHORTCUT_SETTINGS_KEY, JSON.stringify(result.settings))
}

export function isShortcutId(value: string): value is ShortcutId {
  return (SHORTCUT_IDS as readonly string[]).includes(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
