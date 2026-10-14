import { createEmptyWorkspace, type WorkspaceData } from './model'

const DB_NAME = 'work-todo-local'
const DB_VERSION = 1
const STORE_NAME = 'workspace'
const ROOT_KEY = 'root'

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
  if (!value || typeof value !== 'object') throw new Error('备份文件格式不正确')
  const wrapper = value as { workspace?: unknown }
  const candidate = wrapper.workspace && typeof wrapper.workspace === 'object' ? wrapper.workspace : value
  const data = candidate as Partial<WorkspaceData>
  if (
    data.schemaVersion !== 1 ||
    !Array.isArray(data.tasks) ||
    !Array.isArray(data.routineRules) ||
    !Array.isArray(data.routineCompletions) ||
    !data.calendarOverrides ||
    typeof data.calendarOverrides !== 'object' ||
    !data.indexDocument ||
    typeof data.indexDocument.html !== 'string'
  ) {
    throw new Error('该备份版本无法导入，原有数据没有被修改')
  }
  return data as WorkspaceData
}
