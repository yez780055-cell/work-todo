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
  it('creates an empty workspace only when IndexedDB has no root record', async () => {
    await expect(loadWorkspace()).resolves.toEqual(createEmptyWorkspace())
    expect(await getStoredWorkspace()).toBeUndefined()
  })

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
    workspace.indexColumns[0] = { ...workspace.indexColumns[0], ...workspace.indexDocument }

    await saveWorkspace(workspace)
    await expect(loadWorkspace()).resolves.toEqual(workspace)
  })

  it('preserves dated check-ins for deleted rules through IndexedDB and JSON backup round trips', async () => {
    const workspace = createEmptyWorkspace()
    workspace.routineRules.push({
      id: 'routine-live', title: '仍存在的规则', recurrence: 'daily', weekdays: [],
      runOnRestDays: true, runOnHolidays: true, enabled: true, order: 0,
      createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    })
    workspace.routineCompletions = [
      { id: 'removed-rule-check-in', ruleId: 'routine-deleted', ruleTitle: '已删除规则', date: '2026-10-12', completedAt: '2026-10-12T02:00:00.000Z' },
      { id: 'live-check-in', ruleId: 'routine-live', ruleTitle: '仍存在的规则', date: '2026-10-14', completedAt: '2026-10-14T03:00:00.000Z' },
    ]
    workspace.tasks.push(createTask('打卡备份不影响任务'))

    await saveWorkspace(workspace)
    const reopened = await loadWorkspace()
    expect(reopened.routineCompletions).toEqual(workspace.routineCompletions)
    expect(reopened.routineRules).toEqual(workspace.routineRules)
    expect(reopened.tasks).toEqual(workspace.tasks)

    const backup = JSON.parse(JSON.stringify({ format: 'work-todo-backup', version: 1, workspace: reopened }))
    const restored = parseWorkspaceBackup(backup)
    expect(restored.routineCompletions).toEqual(workspace.routineCompletions)
    expect(restored.routineRules).toEqual(workspace.routineRules)
    expect(restored.tasks).toEqual(workspace.tasks)
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

  it('migrates the legacy single Index document and persists it without changing other workspace data', async () => {
    const workspace = createEmptyWorkspace()
    const task = createTask('迁移时保留任务', 'doing')
    task.note = '已有用户数据'
    workspace.tasks.push(task)
    workspace.routineCompletions.push({ id: 'c1', ruleId: 'r1', ruleTitle: '例行检查', date: '2026-10-16', completedAt: '2026-10-16T01:00:00.000Z' })
    workspace.calendarOverrides['2026-10-17'] = 'rest'
    workspace.indexDocument = { html: '<p>旧版 Index 内容</p>', updatedAt: '2026-10-15T01:00:00.000Z' }
    const legacy: Record<string, unknown> = { ...workspace }
    delete legacy.indexColumns
    await putStoredWorkspace(legacy)

    const migrated = await loadWorkspace()
    expect(migrated.indexColumns).toEqual([{
      id: 'index-main', title: '主文档', html: '<p>旧版 Index 内容</p>',
      updatedAt: '2026-10-15T01:00:00.000Z', collapsed: false,
    }])
    expect(migrated.indexDocument).toEqual(workspace.indexDocument)
    expect(migrated.tasks).toEqual(workspace.tasks)
    expect(migrated.routineCompletions).toEqual(workspace.routineCompletions)
    expect(migrated.calendarOverrides).toEqual(workspace.calendarOverrides)
    expect(await getStoredWorkspace()).toEqual(migrated)
  })

  it('does not overwrite an IndexedDB record with malformed multi-column Index data', async () => {
    const malformed = { ...createEmptyWorkspace(), indexColumns: [{ id: 'broken' }] }
    await putStoredWorkspace(malformed)
    await expect(loadWorkspace()).rejects.toThrow('Index 列数据格式不正确')
    expect(await getStoredWorkspace()).toEqual(malformed)
  })

  it('rejects a non-object IndexedDB root without changing the original value', async () => {
    const malformed = 'user data with an unknown format'
    await putStoredWorkspace(malformed)
    await expect(loadWorkspace()).rejects.toThrow('工作区数据格式不正确')
    expect(await getStoredWorkspace()).toBe(malformed)
  })

  it('rejects an unsupported IndexedDB schema version without changing the original workspace', async () => {
    const unsupported = { ...createEmptyWorkspace(), schemaVersion: 2 }
    await putStoredWorkspace(unsupported)
    await expect(loadWorkspace()).rejects.toThrow('工作区版本或结构不受支持')
    expect(await getStoredWorkspace()).toEqual(unsupported)
  })

  it('rejects a root without a schema version without changing the original record', async () => {
    const malformed = { ...createEmptyWorkspace() } as Record<string, unknown>
    delete malformed.schemaVersion
    await putStoredWorkspace(malformed)
    await expect(loadWorkspace()).rejects.toThrow('工作区版本或结构不受支持')
    expect(await getStoredWorkspace()).toEqual(malformed)
  })

  it('rejects divergent Index compatibility data instead of overwriting either copy', async () => {
    const divergent = createEmptyWorkspace()
    divergent.indexDocument = { html: '<p>不可被覆盖的旧副本</p>', updatedAt: null }
    divergent.indexColumns[0] = { ...divergent.indexColumns[0], html: '<p>另一份内容</p>' }
    await putStoredWorkspace(divergent)
    await expect(loadWorkspace()).rejects.toThrow('Index 首列与兼容文档数据不一致')
    expect(await getStoredWorkspace()).toEqual(divergent)
  })

  it('normalizes old backups and round trips ordered, collapsed Index columns', () => {
    const oldWorkspace = createEmptyWorkspace()
    oldWorkspace.indexDocument = { html: '<p>旧备份</p>', updatedAt: null }
    const oldRaw: Record<string, unknown> = { ...oldWorkspace }
    delete oldRaw.indexColumns
    const serializedOldBackup = JSON.parse(JSON.stringify({ format: 'work-todo-backup', version: 1, workspace: oldRaw }))
    expect(parseWorkspaceBackup(serializedOldBackup).indexColumns[0]).toMatchObject({ html: '<p>旧备份</p>', collapsed: false })

    const workspace = createEmptyWorkspace()
    workspace.indexColumns = [
      { id: 'second', title: '项目', html: '<p>第二列内容</p>', updatedAt: null, collapsed: true },
      { id: 'first', title: '想法', html: '<p>第一列内容</p>', updatedAt: null, collapsed: false },
    ]
    workspace.indexDocument = { html: '<p>第二列内容</p>', updatedAt: null }
    const serializedBackup = JSON.parse(JSON.stringify({ format: 'work-todo-backup', version: 1, workspace }))
    expect(parseWorkspaceBackup(serializedBackup)).toEqual(workspace)
  })

  it('persists multi-column Index order and collapse state with unrelated workspace modules intact', async () => {
    const workspace = createEmptyWorkspace()
    workspace.tasks.push(createTask('保留的任务'))
    workspace.routineRules.push({
      id: 'routine-1', title: '保留的例行规则', recurrence: 'daily', weekdays: [0, 1, 2, 3, 4],
      runOnRestDays: true, runOnHolidays: true, enabled: true, order: 0,
      createdAt: '2026-10-16T00:00:00.000Z', updatedAt: '2026-10-16T00:00:00.000Z',
    })
    workspace.calendarOverrides['2026-10-20'] = 'holiday'
    workspace.indexColumns = [
      { id: 'col-b', title: '第二列', html: '<p>保留的内容</p>', updatedAt: '2026-10-16T02:00:00.000Z', collapsed: true },
      { id: 'col-a', title: '第一列', html: '<p>首列内容</p>', updatedAt: null, collapsed: false },
    ]
    workspace.indexDocument = { html: workspace.indexColumns[0].html, updatedAt: workspace.indexColumns[0].updatedAt }

    await saveWorkspace(workspace)
    await expect(loadWorkspace()).resolves.toEqual(workspace)
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

async function putStoredWorkspace(value: unknown): Promise<void> {
  const database = await openTestDatabase()
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction('workspace', 'readwrite')
    transaction.objectStore('workspace').put(value, 'root')
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  database.close()
}

async function getStoredWorkspace(): Promise<unknown> {
  const database = await openTestDatabase()
  const value = await new Promise<unknown>((resolve, reject) => {
    const request = database.transaction('workspace', 'readonly').objectStore('workspace').get('root')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  database.close()
  return value
}

function openTestDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('work-todo-local', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('workspace')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
