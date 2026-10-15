import { isTauri } from '@tauri-apps/api/core'

export function isDesktopApp(): boolean {
  return isTauri()
}
