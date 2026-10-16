import { indexedDB } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { createEmptyWorkspace, createTask } from './model'
import { loadWorkspace, parseWorkspaceBackup, saveWorkspace } from './storage'
import { setTaskStatus } from './tasks'

beforeEach(async () => {
  Object.defineProperty(window, 'indexedDB', { configurable: true, value: indexedDB })
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('work-todo-local')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('A test database connection remained open'))
  })
})

describe('workspace storage and backup compatibility', () => {
  it('restores moved task status and completion metadata from a reopened IndexedDB connection', async () => {
    const workspace = createEmptyWorkspace()
    const task = createTask('桌面拖动后重启', 'review')
    task.subtasks = [{ id: 's1', title: '保留步骤', done: false }]
    const completed = setTaskStatus(task, 'done', '2026-10-15T01:00:00.000Z')
    workspace.tasks.push(completed)
    await saveWorkspace(workspace)
    expect((await loadWorkspace()).tasks[0]).toEqual(completed)

    const reopened = setTaskStatus(completed, 'doing', '2026-10-15T02:00:00.000Z')
    await saveWorkspace({ ...workspace, tasks: [reopened] })
    expect((await loadWorkspace()).tasks[0]).toMatchObject({ status: 'doing', completedAt: null, previousStatus: null, subtasks: task.subtasks })
  })

  it('round trips the complete version 1 workspace through IndexedDB', async () => {
    const workspace = createEmptyWorkspace()
    const task = createTask('恢复桌面工作空间', 'doing')
    task.note = '迁移来源：网页备份'
    task.subtasks = [{ id: 'sub-1', title: '验证持久化', done: true }]
    workspace.tasks.push(task)
    workspace.routineCompletions.push({
      id: 'completion-1',
      ruleId: 'routine-1',
      ruleTitle: '检查日程',
      date: '2026-10-15',
      completedAt: '2026-10-15T01:00:00.000Z',
    })
    workspace.calendarOverrides['2026-10-16'] = 'rest'
    workspace.indexDocument = { html: '<p>工作笔记</p>', updatedAt: '2026-10-15T01:00:00.000Z' }

    await saveWorkspace(workspace)
    await expect(loadWorkspace()).resolves.toEqual(workspace)
  })

  it('accepts the existing version 1 backup envelope and legacy raw workspace', () => {
    const workspace = createEmptyWorkspace()
    expect(parseWorkspaceBackup({
      format: 'work-todo-backup',
      version: 1,
      exportedAt: '2026-10-15T00:00:00.000Z',
      workspace,
    })).toEqual(workspace)
    expect(parseWorkspaceBackup(workspace)).toEqual(workspace)
  })

  it('rejects unsupported backup envelope versions and malformed workspace data', () => {
    const workspace = createEmptyWorkspace()
    expect(() => parseWorkspaceBackup({ format: 'work-todo-backup', version: 2, workspace }))
      .toThrow('该备份格式或版本不受支持')
    expect(() => parseWorkspaceBackup({ format: 'other', version: 1, workspace }))
      .toThrow('该备份格式或版本不受支持')
    expect(() => parseWorkspaceBackup({
      format: 'work-todo-backup',
      version: 1,
      workspace: { ...workspace, calendarOverrides: { '2026-10-16': 'unknown' } },
    })).toThrow('日历数据格式不正确')
    expect(() => parseWorkspaceBackup({ ...workspace, schemaVersion: 2 }))
      .toThrow('该备份版本无法导入')
    expect(() => parseWorkspaceBackup({ ...workspace, tasks: [{ id: 'incomplete-task' }] }))
      .toThrow('该备份版本无法导入')
  })
})
