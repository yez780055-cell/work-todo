import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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
vi.mock('./lib/platform', () => ({ isDesktopApp: () => true }))
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

  it('explains desktop data isolation and waits for persistence after backup import', async () => {
    const imported = createEmptyWorkspace()
    imported.tasks.push(createTask('来自网页的备份'))
    readDesktopBackupMock.mockResolvedValue(JSON.stringify({
      format: 'work-todo-backup',
      version: 1,
      workspace: imported,
    }))
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<App />)
    await screen.findByRole('button', { name: '数据备份' })
    fireEvent.click(screen.getByRole('button', { name: '数据备份' }))

    const dialog = await screen.findByRole('dialog', { name: '本机数据与备份' })
    expect(dialog.textContent).toContain('与网页端不自动同步')
    expect(dialog.querySelector('input[type="file"]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '导入备份' }))
    await screen.findByText('数据已导入并保存到桌面应用。')
    expect(saveWorkspaceMock).toHaveBeenCalledWith(imported)
  })
})
