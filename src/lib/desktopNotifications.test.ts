import { describe, expect, it, vi } from 'vitest'
import { createWindowsRoutineNotifier, NOTIFICATION_PERMISSION_PROMPTED_KEY } from './desktopNotifications'

function createMemoryStorage() {
  const values = new Map<string, string>()
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
}

describe('Windows notification permission wrapper', () => {
  it('is a safe no-op in browser mode and never requests permission', async () => {
    const storage = createMemoryStorage()
    const api = { isPermissionGranted: vi.fn(), requestPermission: vi.fn(), sendNotification: vi.fn() }
    const send = createWindowsRoutineNotifier({ isWindowsDesktop: false, storage, api })
    await expect(send('例行任务提醒', '尚未完成')).resolves.toBe(false)
    expect(api.isPermissionGranted).not.toHaveBeenCalled()
    expect(api.sendNotification).not.toHaveBeenCalled()
  })

  it('requests permission once, sends when granted, and does not loop after rejection', async () => {
    const storage = createMemoryStorage()
    const api = { isPermissionGranted: vi.fn().mockResolvedValue(false), requestPermission: vi.fn().mockResolvedValue('denied'), sendNotification: vi.fn() }
    const send = createWindowsRoutineNotifier({ isWindowsDesktop: true, storage, api })
    await expect(send('提醒', '正文')).resolves.toBe(false)
    await expect(send('提醒', '正文')).resolves.toBe(false)
    expect(api.requestPermission).toHaveBeenCalledTimes(1)
    expect(storage.values.get(NOTIFICATION_PERMISSION_PROMPTED_KEY)).toBe('true')
    expect(api.sendNotification).not.toHaveBeenCalled()
  })

  it('sends the notification when permission is already granted and catches plugin errors', async () => {
    const storage = createMemoryStorage()
    const api = { isPermissionGranted: vi.fn().mockResolvedValue(true), requestPermission: vi.fn(), sendNotification: vi.fn() }
    const send = createWindowsRoutineNotifier({ isWindowsDesktop: true, storage, api })
    await expect(send('例行任务提醒', '晨间检查 还没有完成')).resolves.toBe(true)
    expect(api.sendNotification).toHaveBeenCalledWith({ title: '例行任务提醒', body: '晨间检查 还没有完成' })
    api.isPermissionGranted.mockRejectedValueOnce(new Error('permission unavailable'))
    await expect(send('提醒', '正文')).resolves.toBe(false)
  })
})
