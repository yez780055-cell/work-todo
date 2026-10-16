import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readDesktopBackup, saveDesktopBackup } from './desktopBackup'

const { openMock, saveMock, readMock, writeMock } = vi.hoisted(() => ({
  openMock: vi.fn(),
  saveMock: vi.fn(),
  readMock: vi.fn(),
  writeMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: openMock, save: saveMock }))
vi.mock('@tauri-apps/plugin-fs', () => ({ readTextFile: readMock, writeTextFile: writeMock }))

describe('desktop backup file access', () => {
  beforeEach(() => {
    openMock.mockReset()
    saveMock.mockReset()
    readMock.mockReset()
    writeMock.mockReset().mockResolvedValue(undefined)
  })

  it('writes the backup only after the user selects a save path', async () => {
    saveMock.mockResolvedValue('C:\\Backups\\work-todo.json')
    await expect(saveDesktopBackup('{"version":1}', 'work-todo-backup-2026-10-15.json')).resolves.toBe(true)
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: 'work-todo-backup-2026-10-15.json',
      filters: [{ name: 'JSON 备份', extensions: ['json'] }],
    }))
    expect(writeMock).toHaveBeenCalledWith('C:\\Backups\\work-todo.json', '{"version":1}')
  })

  it('does not write a file when the save dialog is cancelled', async () => {
    saveMock.mockResolvedValue(null)
    await expect(saveDesktopBackup('{}', 'backup.json')).resolves.toBe(false)
    expect(writeMock).not.toHaveBeenCalled()
  })

  it('reads one user-selected JSON file and leaves cancellation unchanged', async () => {
    openMock.mockResolvedValue('C:\\Backups\\work-todo.json')
    readMock.mockResolvedValue('{"version":1}')
    await expect(readDesktopBackup()).resolves.toBe('{"version":1}')
    expect(readMock).toHaveBeenCalledWith('C:\\Backups\\work-todo.json')

    openMock.mockResolvedValue(null)
    await expect(readDesktopBackup()).resolves.toBeNull()
    expect(readMock).toHaveBeenCalledTimes(1)
  })
})
