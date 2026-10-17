import { createEmptyWorkspace, isTaskStatus, type IndexColumn, type WorkspaceData } from './model'

const DB_NAME = 'work-todo-local'
const DB_VERSION = 1
const STORE_NAME = 'workspace'
const ROOT_KEY = 'root'
const RECURRENCE_TYPES = new Set(['daily', 'weekdays', 'weekly', 'workday'])

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('此浏览器不支持本地数据库'))
      return
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('无法打开本地数据库'))
    request.onblocked = () => reject(new Error('本地数据库升级被其他页面占用，请关闭重复页面后重试'))
  })
}

export async function loadWorkspace(): Promise<WorkspaceData> {
  const database = await openDatabase()
  const stored = await new Promise<unknown>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(ROOT_KEY)
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => reject(request.error ?? new Error('读取本地数据失败'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => {
      database.close()
      reject(transaction.error ?? new Error('读取本地数据失败'))
    }
  })
  if (stored === undefined) return createEmptyWorkspace()
  const { workspace, migrated } = validateAndNormalizeWorkspace(stored)
  if (migrated) await saveWorkspace(workspace)
  return workspace
}

export async function saveWorkspace(data: WorkspaceData): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(data, ROOT_KEY)
    transaction.oncomplete = () => {
      database.close()
      resolve()
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error ?? new Error('保存本地数据失败'))
    }
    transaction.onabort = () => {
      database.close()
      reject(transaction.error ?? new Error('保存本地数据失败'))
    }
  })
}

export function parseWorkspaceBackup(value: unknown): WorkspaceData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('备份文件格式不正确')
  let candidate: unknown = value
  if (Object.prototype.hasOwnProperty.call(value, 'workspace')) {
    const wrapper = value as { format?: unknown; version?: unknown; workspace?: unknown }
    if (wrapper.format !== 'work-todo-backup' || wrapper.version !== 1) {
      throw new Error('该备份格式或版本不受支持，原有数据没有被修改')
    }
    candidate = wrapper.workspace
  }
  try {
    return validateAndNormalizeWorkspace(candidate).workspace
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workspace 数据格式不正确'
    if (message.startsWith('日历数据格式不正确')) {
      throw new Error('备份中的日历数据格式不正确，原有数据没有被修改')
    }
    if (message.startsWith('Index')) {
      throw new Error(`${message}，原有数据没有被修改`)
    }
    throw new Error('该备份版本无法导入，原有数据没有被修改')
  }
}

function validateAndNormalizeWorkspace(value: unknown): { workspace: WorkspaceData; migrated: boolean } {
  if (!isRecord(value)) throw new Error('工作区数据格式不正确')
  const data = value as Partial<WorkspaceData>
  if (
    data.schemaVersion !== 1 ||
    !Array.isArray(data.tasks) || !data.tasks.every(isValidTask) ||
    !Array.isArray(data.routineRules) || !data.routineRules.every(isValidRoutineRule) ||
    !Array.isArray(data.routineCompletions) || !data.routineCompletions.every(isValidRoutineCompletion)
  ) {
    throw new Error('工作区版本或结构不受支持')
  }
  if (!isRecord(data.calendarOverrides) || Object.values(data.calendarOverrides).some((type) => !['workday', 'rest', 'holiday'].includes(type))) {
    throw new Error('日历数据格式不正确')
  }
  const document = data.indexDocument
  if (!isRecord(document) || typeof document.html !== 'string' ||
    (document.updatedAt !== null && typeof document.updatedAt !== 'string')) {
    throw new Error('Index 文档数据格式不正确，原有数据没有被修改')
  }

  let columns: IndexColumn[]
  let migrated = false
  if (!Object.prototype.hasOwnProperty.call(value, 'indexColumns')) {
    columns = [{ id: 'index-main', title: '主文档', html: document.html, updatedAt: document.updatedAt, collapsed: false }]
    migrated = true
  } else {
    if (!Array.isArray(data.indexColumns) || data.indexColumns.length === 0 || !data.indexColumns.every(isValidIndexColumn)) {
      throw new Error('Index 列数据格式不正确，原有数据没有被修改')
    }
    const ids = data.indexColumns.map((column) => column.id)
    if (new Set(ids).size !== ids.length) throw new Error('Index 列标识重复，原有数据没有被修改')
    columns = data.indexColumns
  }

  const firstColumn = columns[0]
  const mirrorChanged = document.html !== firstColumn.html || document.updatedAt !== firstColumn.updatedAt
  if (mirrorChanged) throw new Error('Index 首列与兼容文档数据不一致')
  const workspace = {
    ...data,
    indexColumns: columns,
  } as WorkspaceData
  return { workspace, migrated }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isValidIndexColumn(value: unknown): value is IndexColumn {
  return isRecord(value) &&
    typeof value.id === 'string' && value.id.length > 0 &&
    typeof value.title === 'string' &&
    typeof value.html === 'string' &&
    (value.updatedAt === null || typeof value.updatedAt === 'string') &&
    typeof value.collapsed === 'boolean'
}

function isValidTask(value: unknown): boolean {
  if (!isRecord(value)) return false
  return typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    isTaskStatus(value.status) &&
    typeof value.dueDate === 'string' &&
    typeof value.dueTime === 'string' &&
    typeof value.important === 'boolean' &&
    typeof value.note === 'string' &&
    Array.isArray(value.subtasks) && value.subtasks.every((subtask) => isRecord(subtask) &&
      typeof subtask.id === 'string' && typeof subtask.title === 'string' && typeof subtask.done === 'boolean') &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    (value.completedAt === null || typeof value.completedAt === 'string') &&
    (value.previousStatus === null || isTaskStatus(value.previousStatus)) &&
    typeof value.autoCompletedBySubtasks === 'boolean'
}

function isValidRoutineRule(value: unknown): boolean {
  if (!isRecord(value)) return false
  return typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.recurrence === 'string' && RECURRENCE_TYPES.has(value.recurrence) &&
    Array.isArray(value.weekdays) && value.weekdays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) &&
    typeof value.runOnRestDays === 'boolean' &&
    typeof value.runOnHolidays === 'boolean' &&
    typeof value.enabled === 'boolean' &&
    typeof value.order === 'number' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
}

function isValidRoutineCompletion(value: unknown): boolean {
  return isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.ruleId === 'string' &&
    typeof value.ruleTitle === 'string' &&
    typeof value.date === 'string' &&
    typeof value.completedAt === 'string'
}
