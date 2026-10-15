import { createEmptyWorkspace, isTaskStatus, type WorkspaceData } from './model'

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
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(ROOT_KEY)
    request.onsuccess = () => {
      const value = request.result as WorkspaceData | undefined
      resolve(value?.schemaVersion === 1 ? value : createEmptyWorkspace())
    }
    request.onerror = () => reject(request.error ?? new Error('读取本地数据失败'))
    transaction.oncomplete = () => database.close()
    transaction.onerror = () => reject(transaction.error ?? new Error('读取本地数据失败'))
  })
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
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('备份文件格式不正确')
  }
  const data = candidate as Partial<WorkspaceData>
  if (
    data.schemaVersion !== 1 ||
    !Array.isArray(data.tasks) || !data.tasks.every(isValidTask) ||
    !Array.isArray(data.routineRules) || !data.routineRules.every(isValidRoutineRule) ||
    !Array.isArray(data.routineCompletions) || !data.routineCompletions.every(isValidRoutineCompletion) ||
    !data.calendarOverrides ||
    typeof data.calendarOverrides !== 'object' || Array.isArray(data.calendarOverrides) ||
    !data.indexDocument ||
    typeof data.indexDocument !== 'object' || Array.isArray(data.indexDocument) ||
    typeof data.indexDocument.html !== 'string' ||
    (data.indexDocument.updatedAt !== null && typeof data.indexDocument.updatedAt !== 'string')
  ) {
    throw new Error('该备份版本无法导入，原有数据没有被修改')
  }
  if (Object.values(data.calendarOverrides).some((type) => !['workday', 'rest', 'holiday'].includes(type))) {
    throw new Error('备份中的日历数据格式不正确，原有数据没有被修改')
  }
  return data as WorkspaceData
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
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
