import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { createEmptyWorkspace, type WorkspaceData } from './lib/model'
import { loadWorkspace, saveWorkspace } from './lib/storage'

export type SaveState = { status: 'loading' | 'saving' | 'saved' | 'error'; message: string; savedAt: string | null }

export function useWorkspace() {
  const [data, setDataState] = useState<WorkspaceData>(() => createEmptyWorkspace())
  const [ready, setReady] = useState(false)
  const [storageReady, setStorageReady] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>({ status: 'loading', message: '正在读取本机数据', savedAt: null })
  const dataRef = useRef(data)
  const saveSequence = useRef(0)
  const saveTimer = useRef<number | null>(null)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())

  const setData = useCallback<Dispatch<SetStateAction<WorkspaceData>>>((update) => {
    const next = typeof update === 'function'
      ? (update as (current: WorkspaceData) => WorkspaceData)(dataRef.current)
      : update
    dataRef.current = next
    setDataState(next)
  }, [])

  const persistSnapshot = useCallback((snapshot: WorkspaceData): Promise<void> => {
    const sequence = ++saveSequence.current
    setSaveState((current) => ({ ...current, status: 'saving', message: '正在保存到本机' }))
    const pending = saveQueue.current.catch(() => undefined).then(() => saveWorkspace(snapshot))
    saveQueue.current = pending
    void pending.then(
      () => {
        if (saveSequence.current !== sequence || dataRef.current !== snapshot) return
        setSaveState({ status: 'saved', message: '已保存到本机', savedAt: new Date().toISOString() })
      },
      (error: unknown) => {
        if (saveSequence.current !== sequence || dataRef.current !== snapshot) return
        setSaveState({
          status: 'error',
          message: error instanceof Error ? error.message : '保存失败，请先导出备份',
          savedAt: null,
        })
      },
    )
    return pending
  }, [])

  useEffect(() => {
    let active = true
    loadWorkspace()
      .then((workspace) => {
        if (!active) return
        dataRef.current = workspace
        setDataState(workspace)
        setReady(true)
        setStorageReady(true)
        setSaveState({ status: 'saved', message: '已从本机恢复', savedAt: null })
      })
      .catch((error: unknown) => {
        if (!active) return
        setReady(true)
        setSaveState({
          status: 'error',
          message: error instanceof Error ? error.message : '读取本机数据失败',
          savedAt: null,
        })
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!ready || !storageReady) return
    const timeout = window.setTimeout(() => {
      saveTimer.current = null
      void persistSnapshot(data)
    }, 250)
    saveTimer.current = timeout
    return () => {
      window.clearTimeout(timeout)
      if (saveTimer.current === timeout) saveTimer.current = null
    }
  }, [data, ready, storageReady, persistSnapshot])

  const flushWorkspace = useCallback(async () => {
    if (!ready) return
    if (!storageReady) throw new Error('本地数据库尚未就绪，无法确认最新数据已保存')
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    await persistSnapshot(dataRef.current)
  }, [persistSnapshot, ready, storageReady])

  const replaceWorkspace = useCallback(async (workspace: WorkspaceData) => {
    await flushWorkspace()
    try {
      await persistSnapshot(workspace)
    } catch (error) {
      setSaveState({
        status: 'error',
        message: error instanceof Error ? error.message : '保存导入数据失败',
        savedAt: null,
      })
      throw error
    }
    dataRef.current = workspace
    setDataState(workspace)
    setSaveState({ status: 'saved', message: '已保存到本机', savedAt: new Date().toISOString() })
  }, [flushWorkspace, persistSnapshot])

  return { data, setData, ready, saveState, flushWorkspace, replaceWorkspace }
}
