import type { UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

export function registerDesktopCloseGuard(
  flush: () => Promise<void>,
  confirmDiscard: () => Promise<boolean>,
): Promise<UnlistenFn> {
  const appWindow = getCurrentWindow()
  let closing = false
  return appWindow.onCloseRequested(async (event) => {
    if (closing) return
    event.preventDefault()
    try {
      await flush()
    } catch {
      try {
        if (!await confirmDiscard()) return
      } catch {
        return
      }
    }
    closing = true
    try { await appWindow.close() } catch { closing = false }
  })
}
