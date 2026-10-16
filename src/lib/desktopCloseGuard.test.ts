import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerDesktopCloseGuard } from './desktopCloseGuard'

const { onCloseRequestedMock } = vi.hoisted(() => ({
  onCloseRequestedMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ onCloseRequested: onCloseRequestedMock }),
}))

describe('desktop close save guard', () => {
  beforeEach(() => {
    onCloseRequestedMock.mockReset()
  })

  it('finishes the pending workspace write before allowing the native close', async () => {
    let handler: ((event: { preventDefault: () => void }) => Promise<void>) | undefined
    onCloseRequestedMock.mockImplementation(async (callback) => {
      handler = callback
      return () => undefined
    })
    const order: string[] = []
    const flush = vi.fn(async () => { order.push('flush') })
    await registerDesktopCloseGuard(flush, async () => false)
    const event = { preventDefault: vi.fn(() => { order.push('prevent') }) }

    await handler?.(event)

    expect(order).toEqual(['flush'])
    expect(event.preventDefault).not.toHaveBeenCalled()
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
  })

  it('allows the native close after the user confirms unsaved changes may be lost', async () => {
    let handler: ((event: { preventDefault: () => void }) => Promise<void>) | undefined
    onCloseRequestedMock.mockImplementation(async (callback) => {
      handler = callback
      return () => undefined
    })
    await registerDesktopCloseGuard(async () => { throw new Error('save failed') }, async () => true)

    const preventDefault = vi.fn()
    await handler?.({ preventDefault })

    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('keeps the window open when the discard confirmation fails', async () => {
    let handler: ((event: { preventDefault: () => void }) => Promise<void>) | undefined
    onCloseRequestedMock.mockImplementation(async (callback) => {
      handler = callback
      return () => undefined
    })
    const preventDefault = vi.fn()
    await registerDesktopCloseGuard(async () => { throw new Error('save failed') }, async () => { throw new Error('dialog failed') })

    await handler?.({ preventDefault })

    expect(preventDefault).toHaveBeenCalledOnce()
  })
})
