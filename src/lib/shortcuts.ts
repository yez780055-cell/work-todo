export const SHORTCUT_IDS = [
  'window.quickCreate',
  'window.searchTasks',
  'global.quickCreate',
  'global.searchTasks',
] as const

export type ShortcutId = typeof SHORTCUT_IDS[number]
export type ShortcutScope = 'window' | 'global'
export type ShortcutAction = 'quickCreate' | 'searchTasks'
export type ShortcutModifier = 'Ctrl' | 'Alt' | 'Shift' | 'Meta'

export interface ShortcutBinding {
  shortcut: string
  enabled: boolean
}

export interface ShortcutSettings {
  version: 1
  bindings: Record<ShortcutId, ShortcutBinding>
}

export interface ShortcutDefinition {
  id: ShortcutId
  scope: ShortcutScope
  action: ShortcutAction
  label: string
  description: string
  defaultShortcut: string
}

export interface ParsedShortcut {
  canonical: string
  display: string
  modifiers: ShortcutModifier[]
  key: string
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { id: 'window.quickCreate', scope: 'window', action: 'quickCreate', label: '快速新建任务', description: 'Work Todo 窗口获得焦点时打开快速新建。', defaultShortcut: 'N' },
  { id: 'window.searchTasks', scope: 'window', action: 'searchTasks', label: '搜索任务', description: '仅在 Work Todo 窗口内打开任务搜索。', defaultShortcut: 'Ctrl+K' },
  { id: 'global.quickCreate', scope: 'global', action: 'quickCreate', label: '快速新建任务', description: '应用运行期间，从其他程序唤起快速新建。', defaultShortcut: 'Ctrl+Alt+Shift+N' },
  { id: 'global.searchTasks', scope: 'global', action: 'searchTasks', label: '搜索任务', description: '应用运行期间，从其他程序唤起任务搜索。', defaultShortcut: 'Ctrl+Alt+Shift+K' },
]

const MODIFIER_ORDER: ShortcutModifier[] = ['Ctrl', 'Alt', 'Shift', 'Meta']
const MODIFIER_ALIASES: Record<string, ShortcutModifier> = {
  ctrl: 'Ctrl', control: 'Ctrl', ctl: 'Ctrl',
  alt: 'Alt', option: 'Alt',
  shift: 'Shift',
  meta: 'Meta', cmd: 'Meta', command: 'Meta', win: 'Meta', windows: 'Meta', super: 'Meta',
}

export function createDefaultShortcutSettings(): ShortcutSettings {
  return {
    version: 1,
    bindings: Object.fromEntries(SHORTCUT_DEFINITIONS.map((definition) => [definition.id, {
      shortcut: definition.defaultShortcut,
      enabled: true,
    }])) as Record<ShortcutId, ShortcutBinding>,
  }
}

export function parseShortcut(value: string): ParsedShortcut | null {
  if (!value.trim()) return null
  const parts = value.split('+').map((part) => part.trim())
  if (parts.length === 0 || parts.some((part) => !part)) return null

  const modifiers = new Set<ShortcutModifier>()
  for (const part of parts.slice(0, -1)) {
    const modifier = MODIFIER_ALIASES[part.toLowerCase()]
    if (!modifier || modifiers.has(modifier)) return null
    modifiers.add(modifier)
  }

  const key = normalizeSupportedKey(parts.at(-1) ?? '')
  if (!key) return null
  const orderedModifiers = MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier))
  const canonical = [...orderedModifiers, key].join('+')
  return { canonical, display: [...orderedModifiers, key].join(' + '), modifiers: orderedModifiers, key }
}

export function normalizeSupportedKey(value: string): string | null {
  const key = value.trim()
  if (/^[a-z]$/i.test(key)) return key.toUpperCase()
  if (/^\d$/.test(key)) return key
  const functionKey = /^f(\d{1,2})$/i.exec(key)
  if (functionKey) {
    const number = Number(functionKey[1])
    if (number >= 1 && number <= 12) return `F${number}`
  }
  return null
}

export function formatShortcut(value: string): string {
  return parseShortcut(value)?.display ?? '未分配'
}

export function ariaShortcut(value: string): string {
  return parseShortcut(value)?.canonical.replaceAll('Ctrl', 'Control').replaceAll('Meta', 'Meta') ?? ''
}

export function validateBinding(id: ShortcutId, binding: ShortcutBinding): string | null {
  if (!binding.enabled && !binding.shortcut.trim()) return null
  const parsed = parseShortcut(binding.shortcut)
  if (!parsed) return '组合键无效。请使用字母、数字或 F1–F12；窗口快捷键可使用单个字母。'

  const definition = SHORTCUT_DEFINITIONS.find((item) => item.id === id)!
  if (definition.scope === 'global' && binding.enabled) {
    if (parsed.modifiers.includes('Meta')) return 'Windows 全局快捷键暂不支持 Win 键；请改用 Ctrl、Alt 或 Shift。'
    if (!parsed.modifiers.includes('Ctrl') || parsed.modifiers.length < 2) {
      return '全局快捷键至少需要 Ctrl 和另一个修饰键，以减少与系统快捷键冲突。'
    }
  }
  return null
}

export function validateShortcutSettings(settings: ShortcutSettings): { ok: true; settings: ShortcutSettings } | { ok: false; kind: 'invalid' | 'conflict'; message: string } {
  const normalized = createDefaultShortcutSettings()
  for (const id of SHORTCUT_IDS) {
    const binding = settings.bindings[id]
    const error = validateBinding(id, binding)
    if (error) return { ok: false, kind: 'invalid', message: `${definitionFor(id).label}：${error}` }
    const parsed = binding.shortcut ? parseShortcut(binding.shortcut) : null
    normalized.bindings[id] = { enabled: binding.enabled, shortcut: parsed?.canonical ?? '' }
  }

  const assigned = new Map<string, ShortcutId>()
  for (const id of SHORTCUT_IDS) {
    const binding = normalized.bindings[id]
    if (!binding.enabled) continue
    const chord = parseShortcut(binding.shortcut)?.canonical
    if (!chord) return { ok: false, kind: 'invalid', message: `${definitionFor(id).label}需要有效的组合键。` }
    const previous = assigned.get(chord)
    if (previous) {
      return { ok: false, kind: 'conflict', message: `“${definitionFor(id).label}”与“${definitionFor(previous).label}”使用相同组合键。请为每项设置不同快捷键。` }
    }
    assigned.set(chord, id)
  }
  return { ok: true, settings: normalized }
}

export function matchesShortcutEvent(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>, shortcut: string): boolean {
  const parsed = parseShortcut(shortcut)
  if (!parsed || normalizeSupportedKey(event.key) !== parsed.key) return false
  return event.ctrlKey === parsed.modifiers.includes('Ctrl') &&
    event.altKey === parsed.modifiers.includes('Alt') &&
    event.shiftKey === parsed.modifiers.includes('Shift') &&
    event.metaKey === parsed.modifiers.includes('Meta')
}

export function shortcutFromKeyEvent(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): string | null {
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return null
  const key = normalizeSupportedKey(event.key)
  if (!key) return null
  const modifiers = MODIFIER_ORDER.filter((modifier) => {
    if (modifier === 'Ctrl') return event.ctrlKey
    if (modifier === 'Alt') return event.altKey
    if (modifier === 'Shift') return event.shiftKey
    return event.metaKey
  })
  return [...modifiers, key].join('+')
}

function definitionFor(id: ShortcutId): ShortcutDefinition {
  return SHORTCUT_DEFINITIONS.find((item) => item.id === id)!
}
