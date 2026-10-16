import { useEffect, useState, useSyncExternalStore } from 'react'
import { isWindowsDesktopApp } from './lib/platform'
import { activateDesktopWindowAndDispatch } from './lib/desktopShortcuts'
import { createLocalShortcutStorage } from './lib/shortcutSettings'
import { ShortcutRuntime, loadTauriGlobalShortcutAdapter, type ShortcutRuntimeSnapshot } from './lib/shortcutRuntime'
import type { ShortcutAction, ShortcutId, ShortcutBinding } from './lib/shortcuts'

export interface ShortcutSettingsController extends ShortcutRuntimeSnapshot {
  updateBinding(id: ShortcutId, binding: ShortcutBinding): ReturnType<ShortcutRuntime['updateBinding']>
}

export function useShortcutSettings(): ShortcutSettingsController {
  const [runtime] = useState(() => new ShortcutRuntime({
    storage: createLocalShortcutStorage(),
    loadAdapter: loadTauriGlobalShortcutAdapter,
    onGlobalAction: (action: ShortcutAction) => { void activateDesktopWindowAndDispatch(action) },
  }))
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot)

  useEffect(() => {
    void runtime.start(isWindowsDesktopApp())
    return () => { void runtime.dispose() }
  }, [runtime])

  return {
    ...snapshot,
    updateBinding: (id, binding) => runtime.updateBinding(id, binding),
  }
}
