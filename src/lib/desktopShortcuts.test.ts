import { beforeEach, describe, expect, it, vi } from 'vitest'

const { showMock, unminimizeMock, focusMock } = vi.hoisted(() => ({
  showMock: vi.fn(),
  unminimizeMock: vi.fn(),
  focusMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ show: showMock, unminimize: unminimizeMock, setFocus: focusMock }),
}))

import { activateDesktopWindowAndDispatch, GLOBAL_SHORTCUT_ERROR_EVENT, GLOBAL_SHORTCUT_EVENT } from './desktopShortcuts'

describe('desktop global shortcut activation', () => {
  beforeEach(() => {
    showMock.mockReset().mockResolvedValue(undefined)
    unminimizeMock.mockReset().mockResolvedValue(undefined)
    focusMock.mockReset().mockResolvedValue(undefined)
  })

  it('restores and focuses the window before dispatching the existing action', async () => {
    const received = vi.fn()
    window.addEventListener(GLOBAL_SHORTCUT_EVENT, received)
    await activateDesktopWindowAndDispatch('quickCreate')
    window.removeEventListener(GLOBAL_SHORTCUT_EVENT, received)

    expect(showMock).toHaveBeenCalledOnce()
    expect(unminimizeMock).toHaveBeenCalledOnce()
    expect(focusMock).toHaveBeenCalledOnce()
    expect(showMock.mock.invocationCallOrder[0]).toBeLessThan(unminimizeMock.mock.invocationCallOrder[0])
    expect(unminimizeMock.mock.invocationCallOrder[0]).toBeLessThan(focusMock.mock.invocationCallOrder[0])
    expect(received).toHaveBeenCalledOnce()
    expect((received.mock.calls[0][0] as CustomEvent).detail).toEqual({ action: 'quickCreate' })
  })

  it('reports focus errors but still dispatches the requested feature', async () => {
    focusMock.mockRejectedValueOnce(new Error('window closed'))
    const received = vi.fn()
    const errors = vi.fn()
    window.addEventListener(GLOBAL_SHORTCUT_EVENT, received)
    window.addEventListener(GLOBAL_SHORTCUT_ERROR_EVENT, errors)
    await activateDesktopWindowAndDispatch('searchTasks')
    window.removeEventListener(GLOBAL_SHORTCUT_EVENT, received)
    window.removeEventListener(GLOBAL_SHORTCUT_ERROR_EVENT, errors)

    expect(errors).toHaveBeenCalledOnce()
    expect((errors.mock.calls[0][0] as CustomEvent).detail).toBe('window closed')
    expect((received.mock.calls[0][0] as CustomEvent).detail).toEqual({ action: 'searchTasks' })
  })
})
