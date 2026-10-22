import { isWindowsDesktopApp } from './platform'

export const NOTIFICATION_PERMISSION_PROMPTED_KEY = 'worktodo.routine-notification.permission-prompted.v1'

export interface NotificationApi {
  isPermissionGranted(): Promise<boolean>
  requestPermission(): Promise<string>
  sendNotification(options: { title: string; body: string }): void | Promise<void>
}

export function createWindowsRoutineNotifier(options: {
  isWindowsDesktop: boolean
  storage: Pick<Storage, 'getItem' | 'setItem'>
  api: NotificationApi
}): (title: string, body: string) => Promise<boolean> {
  return async (title, body) => {
    if (!options.isWindowsDesktop) return false
    try {
      let granted = await options.api.isPermissionGranted()
      if (!granted && options.storage.getItem(NOTIFICATION_PERMISSION_PROMPTED_KEY) !== 'true') {
        options.storage.setItem(NOTIFICATION_PERMISSION_PROMPTED_KEY, 'true')
        granted = await options.api.requestPermission() === 'granted'
      }
      if (!granted) return false
      await options.api.sendNotification({ title, body })
      return true
    } catch {
      return false
    }
  }
}

export async function sendWindowsRoutineNotification(title: string, body: string): Promise<boolean> {
  if (!isWindowsDesktopApp()) return false
  try {
    const api = await import('@tauri-apps/plugin-notification')
    return createWindowsRoutineNotifier({
      isWindowsDesktop: true,
      storage: window.localStorage,
      api,
    })(title, body)
  } catch {
    return false
  }
}
