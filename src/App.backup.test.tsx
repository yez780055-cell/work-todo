import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
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
    vi.spyOn(window, 'confirm').mockReturnValue(true)

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
    await screen.findByText('数据已导入并保存到桌面应用。')
    expect(saveWorkspaceMock).toHaveBeenCalledWith(imported)
  })

  it('routes the Index backup shortcut to Settings', async () => {
    render(<App />)
    await screen.findByRole('button', { name: '已完成历史' })
    const mainNavigation = screen.getByRole('navigation', { name: '主导航' })
    fireEvent.click(within(mainNavigation).getByRole('button', { name: /Index/ }))
    fireEvent.click(screen.getByRole('button', { name: '导入 / 导出备份' }))
    expect(await screen.findByRole('heading', { name: '本机数据与备份' })).toBeTruthy()
  })
})
