import type { UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

export function registerDesktopCloseGuard(
  flush: () => Promise<void>,
  confirmDiscard: () => Promise<boolean>,
): Promise<UnlistenFn> {
  const appWindow = getCurrentWindow()
  return appWindow.onCloseRequested(async (event) => {
    try {
      await flush()
    } catch {
      try {
        if (!await confirmDiscard()) event.preventDefault()
      } catch {
        event.preventDefault()
      }
    }
  })
}
