import {
  createDefaultShortcutSettings,
  SHORTCUT_DEFINITIONS,
  type ShortcutAction,
  type ShortcutBinding,
  type ShortcutId,
  type ShortcutSettings,
  validateShortcutSettings,
} from './shortcuts'
import type { SettingsStorage, ShortcutSettingsLoad } from './shortcutSettings'

export type ShortcutStatusState = 'loading' | 'active' | 'disabled' | 'unsupported' | 'conflict' | 'error'

export interface ShortcutStatus {
  state: ShortcutStatusState
  message: string
  activeShortcuts: string[]
}

export type ShortcutStatusMap = Record<ShortcutId, ShortcutStatus>

export interface ShortcutRuntimeSnapshot {
  settings: ShortcutSettings
  statuses: ShortcutStatusMap
  warning: string | null
  ready: boolean
  globalSupported: boolean
}

export interface GlobalShortcutEvent {
  state: 'Pressed' | 'Released'
}

export interface GlobalShortcutAdapter {
  register(shortcut: string, handler: (event: GlobalShortcutEvent) => void): Promise<void>
  unregister(shortcut: string): Promise<void>
}

export interface ShortcutUpdateResult {
  ok: boolean
  kind?: 'invalid' | 'conflict' | 'error'
  message?: string
}

export interface ShortcutRuntimeOptions {
  storage: SettingsStorage
  loadAdapter: () => Promise<GlobalShortcutAdapter>
  onGlobalAction: (action: ShortcutAction) => void
}

export class ShortcutRuntime {
  private snapshot: ShortcutRuntimeSnapshot = {
    settings: createDefaultShortcutSettings(),
    statuses: createStatuses(createDefaultShortcutSettings(), false, false),
    warning: null,
    ready: false,
    globalSupported: false,
  }
  private adapter: GlobalShortcutAdapter | null = null
  private active = new Map<ShortcutId, Set<string>>()
  private listeners = new Set<() => void>()
  private queue: Promise<unknown> = Promise.resolve()
  private lifecycle = 0
  private started = false

  constructor(private readonly options: ShortcutRuntimeOptions) {}

  getSnapshot = (): ShortcutRuntimeSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start(globalSupported: boolean): Promise<void> {
    const lifecycle = ++this.lifecycle
    this.started = true
    return this.enqueue(async () => {
      if (lifecycle !== this.lifecycle || !this.started) return
      let loaded: ShortcutSettingsLoad
      try {
        loaded = this.options.storage.load()
      } catch {
        loaded = { settings: createDefaultShortcutSettings(), warning: '无法读取快捷键设置；本次先使用默认设置。' }
      }
      const validation = validateShortcutSettings(loaded.settings)
      const settings = validation.ok ? validation.settings : createDefaultShortcutSettings()
      this.snapshot = {
        settings,
        statuses: createStatuses(settings, globalSupported, true),
        warning: validation.ok ? loaded.warning : '快捷键设置无效；本次先使用默认设置。',
        ready: false,
        globalSupported,
      }
      this.publish()

      if (!globalSupported) {
        this.snapshot = { ...this.snapshot, statuses: createStatuses(settings, false, false), ready: true }
        this.publish()
        return
      }

      try {
        this.adapter ??= await this.options.loadAdapter()
      } catch {
        this.snapshot = {
          ...this.snapshot,
          statuses: this.withGlobalStatuses((_id, binding) => binding.enabled
            ? { state: 'error', message: '无法加载 Windows 全局快捷键组件。', activeShortcuts: [] }
            : disabledStatus()),
          ready: true,
        }
        this.publish()
        return
      }
      if (lifecycle !== this.lifecycle || !this.started) return

      for (const definition of SHORTCUT_DEFINITIONS.filter((item) => item.scope === 'global')) {
        if (lifecycle !== this.lifecycle || !this.started) return
        const binding = this.snapshot.settings.bindings[definition.id]
        if (!binding.enabled) {
          this.setStatus(definition.id, disabledStatus())
          continue
        }
        this.setStatus(definition.id, { state: 'loading', message: '正在注册全局快捷键…', activeShortcuts: [] })
        try {
          await this.register(definition.id, binding.shortcut, definition.action)
          if (lifecycle !== this.lifecycle || !this.started) {
            await this.unregister(definition.id, binding.shortcut)
            return
          }
          this.setStatus(definition.id, activeStatus([binding.shortcut]))
        } catch {
          this.setStatus(definition.id, {
            state: 'conflict',
            message: '全局快捷键注册失败，可能被其他程序占用；请更换组合键后重试。',
            activeShortcuts: [],
          })
        }
      }
      if (lifecycle !== this.lifecycle || !this.started) return
      this.snapshot = { ...this.snapshot, ready: true }
      this.publish()
    })
  }

  updateBinding(id: ShortcutId, binding: ShortcutBinding): Promise<ShortcutUpdateResult> {
    return this.enqueue(async () => {
      if (!this.snapshot.ready) return { ok: false, kind: 'error', message: '快捷键仍在初始化，请稍后再保存。' }
      const current = this.snapshot.settings
      const candidate: ShortcutSettings = {
        version: 1,
        bindings: { ...current.bindings, [id]: { ...binding } },
      }
      const validation = validateShortcutSettings(candidate)
      if (!validation.ok) return { ok: false, kind: validation.kind, message: validation.message }
      const next = validation.settings
      const definition = SHORTCUT_DEFINITIONS.find((item) => item.id === id)!
      if (definition.scope === 'global' && !this.snapshot.globalSupported) {
        return { ok: false, kind: 'error', message: 'Windows 全局快捷键仅在 Windows 桌面应用中可用。' }
      }

      const wasActive = new Set(this.active.get(id) ?? [])
      const desired = next.bindings[id].enabled ? next.bindings[id].shortcut : null
      const added: string[] = []
      const removed: string[] = []

      if (definition.scope === 'global') {
        if (desired && !wasActive.has(desired)) {
          this.setStatus(id, { state: 'loading', message: '正在尝试注册新组合键…', activeShortcuts: [...wasActive] })
          try {
            await this.register(id, desired, definition.action)
            added.push(desired)
          } catch {
            this.setStatus(id, wasActive.size
              ? { ...activeStatus([...wasActive]), message: `新组合键注册失败；原组合键 ${wasActive.values().next().value} 仍在生效。可能是其他程序占用了新组合键。` }
              : { state: 'conflict', message: '快捷键注册失败，可能被其他程序占用；原设置未更改。', activeShortcuts: [] })
            return { ok: false, kind: 'conflict', message: '快捷键已被其他程序占用或无法注册；原组合键仍保持有效，请换一个组合后重试。' }
          }
        }

        for (const previous of wasActive) {
          if (previous === desired) continue
          try {
            await this.unregister(id, previous)
            removed.push(previous)
          } catch {
            const rollbackMessage = await this.rollbackAdded(id, added)
            const active = [...(this.active.get(id) ?? [])]
            this.setStatus(id, active.length
              ? { ...activeStatus(active), message: `无法替换旧快捷键；${rollbackMessage || '当前仍显示为有效的组合键。'}` }
              : { state: 'error', message: `无法安全替换快捷键。${rollbackMessage}`, activeShortcuts: [] })
            return { ok: false, kind: 'error', message: '无法安全解除旧快捷键，设置没有保存；现有注册状态已保留或回滚。' }
          }
        }
      }

      try {
        this.options.storage.save(next)
      } catch {
        const restoreErrors: string[] = []
        for (const previous of removed) {
          try {
            await this.register(id, previous, definition.action)
          } catch {
            restoreErrors.push(previous)
          }
        }
        const cleanupMessage = await this.rollbackAdded(id, added)
        const active = [...(this.active.get(id) ?? [])]
        const extra = [
          restoreErrors.length ? `无法恢复旧组合键：${restoreErrors.join('、')}。` : '',
          cleanupMessage,
        ].filter(Boolean).join(' ')
        this.setStatus(id, active.length
          ? { ...activeStatus(active), message: `保存失败；当前实际生效：${active.join(' / ')}。${extra}` }
          : { state: 'error', message: `设置未保存，且当前没有已确认生效的全局组合键。${extra}`, activeShortcuts: [] })
        return { ok: false, kind: 'error', message: '无法保存快捷键设置；原设置保持不变，请检查浏览器本地存储空间。' }
      }

      this.snapshot = {
        ...this.snapshot,
        settings: next,
        warning: null,
        statuses: {
          ...this.snapshot.statuses,
          [id]: definition.scope === 'window'
            ? (next.bindings[id].enabled
              ? { state: 'active', message: '在 Work Todo 窗口内生效。', activeShortcuts: [next.bindings[id].shortcut] }
              : disabledStatus())
            : (desired
              ? activeStatus([desired])
              : disabledStatus()),
        },
      }
      this.publish()
      return { ok: true }
    })
  }

  dispose(): Promise<void> {
    this.started = false
    ++this.lifecycle
    return this.enqueue(async () => {
      for (const [id, shortcuts] of this.active) {
        for (const shortcut of [...shortcuts]) {
          try {
            await this.adapter?.unregister(shortcut)
            this.active.get(id)?.delete(shortcut)
          } catch {
            // Keep the registration scoped to this process; the plugin also releases it on exit.
          }
        }
      }
      this.active.clear()
    })
  }

  private async register(id: ShortcutId, shortcut: string, action: ShortcutAction): Promise<void> {
    if (!this.adapter) throw new Error('Global shortcut API is unavailable')
    await this.adapter.register(shortcut, (event) => {
      if (this.started && event.state === 'Pressed') this.options.onGlobalAction(action)
    })
    const shortcuts = this.active.get(id) ?? new Set<string>()
    shortcuts.add(shortcut)
    this.active.set(id, shortcuts)
  }

  private async unregister(id: ShortcutId, shortcut: string): Promise<void> {
    if (!this.adapter) throw new Error('Global shortcut API is unavailable')
    await this.adapter.unregister(shortcut)
    const shortcuts = this.active.get(id)
    shortcuts?.delete(shortcut)
    if (shortcuts?.size === 0) this.active.delete(id)
  }

  private async rollbackAdded(id: ShortcutId, shortcuts: string[]): Promise<string> {
    const errors: string[] = []
    for (const shortcut of shortcuts) {
      try {
        await this.unregister(id, shortcut)
      } catch {
        errors.push(shortcut)
      }
    }
    return errors.length ? `回滚时无法解除新组合键：${errors.join('、')}。` : ''
  }

  private withGlobalStatuses(create: (id: ShortcutId, binding: ShortcutBinding) => ShortcutStatus): ShortcutStatusMap {
    const statuses = { ...this.snapshot.statuses }
    for (const definition of SHORTCUT_DEFINITIONS.filter((item) => item.scope === 'global')) {
      statuses[definition.id] = create(definition.id, this.snapshot.settings.bindings[definition.id])
    }
    return statuses
  }

  private setStatus(id: ShortcutId, status: ShortcutStatus): void {
    this.snapshot = { ...this.snapshot, statuses: { ...this.snapshot.statuses, [id]: status } }
    this.publish()
  }

  private publish(): void {
    for (const listener of this.listeners) listener()
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation)
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }
}

export async function loadTauriGlobalShortcutAdapter(): Promise<GlobalShortcutAdapter> {
  const plugin = await import('@tauri-apps/plugin-global-shortcut')
  return {
    register: (shortcut, handler) => plugin.register(shortcut, (event) => handler({ state: event.state })),
    unregister: (shortcut) => plugin.unregister(shortcut),
  }
}

function createStatuses(settings: ShortcutSettings, globalSupported: boolean, loading: boolean): ShortcutStatusMap {
  const statuses = {} as ShortcutStatusMap
  for (const definition of SHORTCUT_DEFINITIONS) {
    const binding = settings.bindings[definition.id]
    if (definition.scope === 'window') {
      statuses[definition.id] = binding.enabled
        ? { state: 'active', message: '在 Work Todo 窗口内生效。', activeShortcuts: [binding.shortcut] }
        : disabledStatus()
    } else if (!globalSupported) {
      statuses[definition.id] = { state: 'unsupported', message: '仅 Windows 桌面应用支持全局快捷键。', activeShortcuts: [] }
    } else if (!binding.enabled) {
      statuses[definition.id] = disabledStatus()
    } else if (loading) {
      statuses[definition.id] = { state: 'loading', message: '正在加载快捷键组件…', activeShortcuts: [] }
    } else {
      statuses[definition.id] = { state: 'disabled', message: '', activeShortcuts: [] }
    }
  }
  return statuses
}

function activeStatus(shortcuts: string[]): ShortcutStatus {
  return { state: 'active', message: '已向 Windows 注册，实际能否触发需在其他程序前台时手动验收。', activeShortcuts: shortcuts }
}

function disabledStatus(): ShortcutStatus {
  return { state: 'disabled', message: '此快捷键已停用。', activeShortcuts: [] }
}
