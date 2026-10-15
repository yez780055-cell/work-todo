import type { ShortcutAction } from './shortcuts'

export const GLOBAL_SHORTCUT_EVENT = 'worktodo:global-shortcut'
export const GLOBAL_SHORTCUT_ERROR_EVENT = 'worktodo:global-shortcut-error'

export async function activateDesktopWindowAndDispatch(action: ShortcutAction): Promise<void> {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const mainWindow = getCurrentWindow()
    await mainWindow.show()
    await mainWindow.unminimize()
    await mainWindow.setFocus()
  } catch (error) {
    window.dispatchEvent(new CustomEvent(GLOBAL_SHORTCUT_ERROR_EVENT, {
      detail: error instanceof Error ? error.message : '无法将 Work Todo 窗口置于前台。',
    }))
  }

  window.dispatchEvent(new CustomEvent(GLOBAL_SHORTCUT_EVENT, { detail: { action } }))
}
