import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyWorkspace, createTask } from './lib/model'
import { useWorkspace } from './useWorkspace'

const { loadWorkspaceMock, saveWorkspaceMock } = vi.hoisted(() => ({
  loadWorkspaceMock: vi.fn(),
  saveWorkspaceMock: vi.fn(),
}))

vi.mock('./lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/storage')>()
  return { ...actual, loadWorkspace: loadWorkspaceMock, saveWorkspace: saveWorkspaceMock }
})

describe('workspace durability helpers', () => {
  beforeEach(() => {
    loadWorkspaceMock.mockReset().mockResolvedValue(createEmptyWorkspace())
    saveWorkspaceMock.mockReset().mockResolvedValue(undefined)
  })

  it('flushes the latest workspace before the debounce delay', async () => {
    const { result } = renderHook(() => useWorkspace())
    await waitFor(() => expect(result.current.ready).toBe(true))
    const next = createEmptyWorkspace()
    next.tasks.push(createTask('即将关闭窗口', 'doing'))

    act(() => result.current.setData(next))
    await act(async () => { await result.current.flushWorkspace() })

    expect(saveWorkspaceMock).toHaveBeenLastCalledWith(next)
    expect(result.current.saveState.status).toBe('saved')
  })

  it('replaces the workspace only after the imported snapshot is saved', async () => {
    const current = createEmptyWorkspace()
    current.tasks.push(createTask('当前桌面任务'))
    loadWorkspaceMock.mockResolvedValue(current)
    const { result } = renderHook(() => useWorkspace())
    await waitFor(() => expect(result.current.ready).toBe(true))

    const imported = createEmptyWorkspace()
    imported.tasks.push(createTask('从网页备份导入'))
    await act(async () => { await result.current.replaceWorkspace(imported) })

    expect(result.current.data).toEqual(imported)
    expect(saveWorkspaceMock).toHaveBeenLastCalledWith(imported)
  })

  it('keeps the current workspace when persisting imported data fails', async () => {
    const current = createEmptyWorkspace()
    current.tasks.push(createTask('原有桌面任务'))
    loadWorkspaceMock.mockResolvedValue(current)
    saveWorkspaceMock.mockImplementation(async (workspace: ReturnType<typeof createEmptyWorkspace>) => {
      if (workspace.tasks.some((task: { title: string }) => task.title === '无法保存的导入')) {
        throw new Error('磁盘写入失败')
      }
    })
    const { result } = renderHook(() => useWorkspace())
    await waitFor(() => expect(result.current.ready).toBe(true))

    const imported = createEmptyWorkspace()
    imported.tasks.push(createTask('无法保存的导入'))
    await act(async () => {
      await expect(result.current.replaceWorkspace(imported)).rejects.toThrow('磁盘写入失败')
    })

    expect(result.current.data).toEqual(current)
    expect(result.current.saveState).toMatchObject({ status: 'error', message: '磁盘写入失败' })
  })
})
