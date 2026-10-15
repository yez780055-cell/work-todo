import { isTauri } from '@tauri-apps/api/core'

export function isDesktopApp(): boolean {
  return isTauri()
}

export function isWindowsDesktopApp(): boolean {
  return isDesktopApp() && /Windows/i.test(navigator.userAgent)
}
