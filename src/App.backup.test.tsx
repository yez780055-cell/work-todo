import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'
import { createEmptyWorkspace, createTask } from './lib/model'

const { loadWorkspaceMock, saveWorkspaceMock, readDesktopBackupMock, saveDesktopBackupMock } = vi.hoisted(() => ({
  loadWorkspaceMock: vi.fn(),
  saveWorkspaceMock: vi.fn(),
  readDesktopBackupMock: vi.fn(),
  saveDesktopBackupMock: vi.fn(),
}))

vi.mock('./lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/storage')>()
  return { ...actual, loadWorkspace: loadWorkspaceMock, saveWorkspace: saveWorkspaceMock }
})
vi.mock('./lib/platform', () => ({ isDesktopApp: () => true, isWindowsDesktopApp: () => false }))
vi.mock('./lib/desktopBackup', () => ({
  readDesktopBackup: readDesktopBackupMock,
  saveDesktopBackup: saveDesktopBackupMock,
}))
vi.mock('./lib/desktopCloseGuard', () => ({ registerDesktopCloseGuard: vi.fn().mockResolvedValue(() => undefined) }))

describe('desktop data backup experience', () => {
  afterEach(() => vi.restoreAllMocks())

  beforeEach(() => {
    loadWorkspaceMock.mockReset().mockResolvedValue(createEmptyWorkspace())
    saveWorkspaceMock.mockReset().mockResolvedValue(undefined)
    readDesktopBackupMock.mockReset()
    saveDesktopBackupMock.mockReset().mockResolvedValue(true)
  })

  it('keeps desktop backup import and data isolation inside the Settings page', async () => {
    const imported = createEmptyWorkspace()
    imported.tasks.push(createTask('来自网页的备份'))
    readDesktopBackupMock.mockResolvedValue(JSON.stringify({
      format: 'work-todo-backup',
      version: 1,
      workspace: imported,
    }))
    render(<App />)
    await screen.findByRole('button', { name: '已完成历史' })
    expect(document.querySelector('.local-storage-card')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '设置' }))

    expect(await screen.findByRole('heading', { name: '本机数据与备份' })).toBeTruthy()
    expect(screen.getByText(/与网页端不自动同步/)).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: '本机数据与备份' })).toBeNull()
    expect(document.querySelector('.settings-page')).toBeTruthy()
    expect(document.querySelector('.settings-page input[type="file"]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '导入备份' }))
    const confirmation = await screen.findByRole('alertdialog', { name: '替换当前工作区数据？' })
    expect(confirmation.textContent).toContain('当前桌面应用中的全部任务、例行任务、日历与 Index 数据')
    expect(saveWorkspaceMock).not.toHaveBeenCalledWith(imported)
    fireEvent.click(within(confirmation).getByRole('button', { name: '取消导入' }))
    expect(screen.queryByRole('alertdialog', { name: '替换当前工作区数据？' })).toBeNull()
    expect(saveWorkspaceMock).not.toHaveBeenCalledWith(imported)

    fireEvent.click(screen.getByRole('button', { name: '导入备份' }))
    const secondConfirmation = await screen.findByRole('alertdialog', { name: '替换当前工作区数据？' })
    fireEvent.click(within(secondConfirmation).getByRole('button', { name: '替换并导入' }))
    await screen.findByText('数据已导入并保存到桌面应用。')
    expect(saveWorkspaceMock).toHaveBeenCalledWith(imported)
    expect(saveWorkspaceMock.mock.calls.filter(([value]) => JSON.stringify(value) === JSON.stringify(imported))).toHaveLength(1)
  })

  it('routes the Index backup shortcut to Settings', async () => {
    render(<App />)
    await screen.findByRole('button', { name: '已完成历史' })
    const mainNavigation = screen.getByRole('navigation', { name: '主导航' })
    fireEvent.click(within(mainNavigation).getByRole('button', { name: /Index/ }))
    fireEvent.click(screen.getByRole('button', { name: '导入 / 导出备份' }))
    expect(await screen.findByRole('heading', { name: '本机数据与备份' })).toBeTruthy()
  })

  it('requires one in-app confirmation before deleting a task and lets Escape cancel safely', async () => {
    const workspace = createEmptyWorkspace()
    workspace.tasks.push(createTask('待删除任务'))
    loadWorkspaceMock.mockResolvedValue(workspace)
    const nativeConfirm = vi.spyOn(window, 'confirm')

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: '打开任务详情：待删除任务' }))
    fireEvent.click(screen.getByRole('button', { name: '删除任务' }))

    const confirmation = await screen.findByRole('alertdialog', { name: '删除任务？' })
    expect(confirmation.textContent).toContain('待删除任务')
    fireEvent.keyDown(confirmation, { key: 'Escape' })
    expect(screen.queryByRole('alertdialog', { name: '删除任务？' })).toBeNull()
    expect(screen.getByRole('button', { name: '打开任务详情：待删除任务' })).toBeTruthy()
    expect(saveWorkspaceMock).not.toHaveBeenCalledWith(expect.objectContaining({ tasks: [] }))

    fireEvent.click(screen.getByRole('button', { name: '删除任务' }))
    const secondConfirmation = await screen.findByRole('alertdialog', { name: '删除任务？' })
    fireEvent.click(within(secondConfirmation).getByRole('button', { name: '删除任务' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: '打开任务详情：待删除任务' })).toBeNull())
    expect(nativeConfirm).not.toHaveBeenCalled()
    await waitFor(() => expect(saveWorkspaceMock.mock.calls.some(([value]) =>
      (value as ReturnType<typeof createEmptyWorkspace>).tasks.length === 0)).toBe(true))
  })

  it('confirms subtask removal and leaves the subtask intact when canceled', async () => {
    const workspace = createEmptyWorkspace()
    const task = createTask('包含子任务的工作')
    task.subtasks = [{ id: 'subtask-1', title: '保留这个步骤', done: false }]
    workspace.tasks.push(task)
    loadWorkspaceMock.mockResolvedValue(workspace)
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: '打开任务详情：包含子任务的工作' }))
    fireEvent.click(screen.getByRole('button', { name: '删除子任务：保留这个步骤' }))
    const confirmation = await screen.findByRole('alertdialog', { name: '删除子任务？' })
    fireEvent.click(within(confirmation).getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('alertdialog', { name: '删除子任务？' })).toBeNull()
    expect(screen.getByRole('button', { name: '删除子任务：保留这个步骤' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '删除子任务：保留这个步骤' }))
    const secondConfirmation = await screen.findByRole('alertdialog', { name: '删除子任务？' })
    fireEvent.click(within(secondConfirmation).getByRole('button', { name: '删除子任务' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: '删除子任务：保留这个步骤' })).toBeNull())
    await waitFor(() => expect(saveWorkspaceMock.mock.calls.some(([value]) =>
      (value as ReturnType<typeof createEmptyWorkspace>).tasks.some((item) => item.id === task.id && item.subtasks.length === 0))).toBe(true))
  })
})
