import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerDesktopCloseGuard } from './desktopCloseGuard'

const { onCloseRequestedMock, closeMock } = vi.hoisted(() => ({
  onCloseRequestedMock: vi.fn(),
  closeMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ onCloseRequested: onCloseRequestedMock, close: closeMock }),
}))

describe('desktop close save guard', () => {
  beforeEach(() => {
    onCloseRequestedMock.mockReset()
    closeMock.mockReset().mockResolvedValue(undefined)
  })

  it('prevents the native close until the pending workspace write completes', async () => {
    let handler: ((event: { preventDefault: () => void }) => Promise<void>) | undefined
    onCloseRequestedMock.mockImplementation(async (callback) => {
      handler = callback
      return () => undefined
    })
    const order: string[] = []
    const flush = vi.fn(async () => { order.push('flush') })
    closeMock.mockImplementation(async () => { order.push('close') })
    await registerDesktopCloseGuard(flush, async () => false)
    const event = { preventDefault: vi.fn(() => { order.push('prevent') }) }

    await handler?.(event)

    expect(order).toEqual(['prevent', 'flush', 'close'])
    expect(flush).toHaveBeenCalledOnce()
  })

  it('keeps the window open when saving fails and the user cancels closing', async () => {
    let handler: ((event: { preventDefault: () => void }) => Promise<void>) | undefined
    onCloseRequestedMock.mockImplementation(async (callback) => {
      handler = callback
      return () => undefined
    })
    const preventDefault = vi.fn()
    const confirmDiscard = vi.fn().mockResolvedValue(false)
    await registerDesktopCloseGuard(async () => { throw new Error('save failed') }, confirmDiscard)

    await handler?.({ preventDefault })

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(confirmDiscard).toHaveBeenCalledOnce()
    expect(closeMock).not.toHaveBeenCalled()
  })

  it('allows an explicit close after the user confirms unsaved changes may be lost', async () => {
    let handler: ((event: { preventDefault: () => void }) => Promise<void>) | undefined
    onCloseRequestedMock.mockImplementation(async (callback) => {
      handler = callback
      return () => undefined
    })
    await registerDesktopCloseGuard(async () => { throw new Error('save failed') }, async () => true)

    await handler?.({ preventDefault: vi.fn() })

    expect(closeMock).toHaveBeenCalledOnce()
  })
})
