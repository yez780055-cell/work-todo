import { useEffect, useRef, useState } from 'react'
import { createEmptyWorkspace, type WorkspaceData } from './lib/model'
import { loadWorkspace, saveWorkspace } from './lib/storage'

export type SaveState = { status: 'loading' | 'saving' | 'saved' | 'error'; message: string; savedAt: string | null }

export function useWorkspace() {
  const [data, setData] = useState<WorkspaceData>(() => createEmptyWorkspace())
  const [ready, setReady] = useState(false)
  const [storageReady, setStorageReady] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>({ status: 'loading', message: '正在读取本机数据', savedAt: null })
  const saveSequence = useRef(0)

  useEffect(() => {
    let active = true
    loadWorkspace()
      .then((workspace) => {
        if (!active) return
        setData(workspace)
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
    const sequence = ++saveSequence.current
    setSaveState((current) => ({ ...current, status: 'saving', message: '正在保存到本机' }))
    const timeout = window.setTimeout(() => {
      saveWorkspace(data)
        .then(() => {
          if (saveSequence.current !== sequence) return
          setSaveState({ status: 'saved', message: '已保存到本机', savedAt: new Date().toISOString() })
        })
        .catch((error: unknown) => {
          if (saveSequence.current !== sequence) return
          setSaveState({
            status: 'error',
            message: error instanceof Error ? error.message : '保存失败，请先导出备份',
            savedAt: null,
          })
        })
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [data, ready, storageReady])

  return { data, setData, ready, saveState }
}
