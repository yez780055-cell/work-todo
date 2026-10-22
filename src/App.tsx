import { useEffect, useRef, useState } from 'react'
import { BookOpenText, CalendarDays, ClipboardList, LayoutDashboard, Settings } from 'lucide-react'
import { CalendarPage } from './components/CalendarPage'
import { ConfirmDialog, SaveIndicator } from './components/common'
import { IndexPage } from './components/IndexPage'
import { QuickCreateModal } from './components/QuickCreateModal'
import { RoutinePage } from './components/RoutinePage'
import { TaskBoard, TaskHistory } from './components/TaskBoard'
import { TaskDrawer } from './components/TaskDrawer'
import { TaskSearchModal } from './components/TaskSearchModal'
import { SettingsPage } from './components/SettingsPage'
import { toDateKey } from './lib/dates'
import { createTask, type CalendarDayType, type IndexColumn, type RoutineRule, type Task, type TaskStatus, type WorkspaceData } from './lib/model'
import { readDesktopBackup, saveDesktopBackup } from './lib/desktopBackup'
import { isDesktopApp, isWindowsDesktopApp } from './lib/platform'
import { GLOBAL_SHORTCUT_ERROR_EVENT, GLOBAL_SHORTCUT_EVENT } from './lib/desktopShortcuts'
import { matchesShortcutEvent, type ShortcutAction } from './lib/shortcuts'
import { parseWorkspaceBackup } from './lib/storage'
import { sanitizeImportedIndexWorkspace, updateIndexWorkspace } from './lib/indexWorkspace'
import { setSubtaskCompletion, setTaskStatus } from './lib/tasks'
import { updateRoutineCompletion } from './lib/routines'
import { RoutineReminderScheduler, type RoutineReminderAlert } from './lib/routineReminder'
import { sendWindowsRoutineNotification } from './lib/desktopNotifications'
import { useWorkspace } from './useWorkspace'
import { useShortcutSettings } from './useShortcutSettings'
import { CountdownClockProvider } from './useCountdownClock'

type PageKey = 'tasks' | 'routines' | 'calendar' | 'index' | 'settings'

const NAV_ITEMS: Array<{ key: PageKey; label: string; description: string; icon: typeof LayoutDashboard }> = [
  { key: 'tasks', label: '任务看板', description: '推进中的工作事项', icon: LayoutDashboard },
  { key: 'routines', label: '例行任务', description: '每天固定要做的事', icon: ClipboardList },
  { key: 'calendar', label: '工作日历', description: '记录你的真实排班', icon: CalendarDays },
  { key: 'index', label: 'Index', description: '留住工作经验与想法', icon: BookOpenText },
]

export default function App() {
  const { data, setData, ready, saveState, flushWorkspace, replaceWorkspace } = useWorkspace()
  const isDesktop = isDesktopApp()
  const isWindowsDesktop = isWindowsDesktopApp()
  const shortcutSettings = useShortcutSettings()
  const [activePage, setActivePage] = useState<PageKey>('tasks')
  const [now, setNow] = useState(() => new Date())
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const [taskSearchOpen, setTaskSearchOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>('todo')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [backupMessage, setBackupMessage] = useState('')
  const [backupError, setBackupError] = useState('')
  const [pendingTaskDelete, setPendingTaskDelete] = useState<Task | null>(null)
  const [pendingBackupImport, setPendingBackupImport] = useState<{ workspace: WorkspaceData; storageName: string } | null>(null)
  const [resetVersion, setResetVersion] = useState(0)
  const [shortcutRuntimeError, setShortcutRuntimeError] = useState('')
  const [urgentRoutineReminders, setUrgentRoutineReminders] = useState<RoutineReminderAlert[]>([])
  const isComposing = useRef(false)
  const shortcutSettingsRef = useRef(shortcutSettings.settings)
  const openDialogsRef = useRef(false)
  shortcutSettingsRef.current = shortcutSettings.settings
  openDialogsRef.current = drawerOpen || historyOpen || quickCreateOpen || taskSearchOpen || Boolean(pendingTaskDelete || pendingBackupImport)
  const flushWorkspaceRef = useRef(flushWorkspace)
  flushWorkspaceRef.current = flushWorkspace
  const workspaceRef = useRef(data)
  workspaceRef.current = data
  const routineReminderSchedulerRef = useRef<RoutineReminderScheduler | null>(null)
  if (!routineReminderSchedulerRef.current) {
    const safeStorage = {
      getItem: (key: string) => { try { return window.localStorage.getItem(key) } catch { return null } },
      setItem: (key: string, value: string) => { try { window.localStorage.setItem(key, value) } catch { /* Reminders remain best-effort if browser storage is unavailable. */ } },
    }
    routineReminderSchedulerRef.current = new RoutineReminderScheduler(safeStorage, sendWindowsRoutineNotification)
  }
  const activeTask = data.tasks.find((task) => task.id === activeTaskId) ?? null

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!ready || !isWindowsDesktop) return
    let active = true
    const check = () => {
      void routineReminderSchedulerRef.current?.check(workspaceRef.current, new Date()).then((alerts) => {
        if (active) setUrgentRoutineReminders(alerts)
      })
    }
    const handleResume = () => check()
    check()
    const timer = window.setInterval(check, 30_000)
    window.addEventListener('focus', handleResume)
    document.addEventListener('visibilitychange', handleResume)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', handleResume)
      document.removeEventListener('visibilitychange', handleResume)
    }
  }, [ready, isWindowsDesktop, data])

  useEffect(() => {
    const handleGlobalShortcut = (event: Event) => {
      const action = (event as CustomEvent<{ action?: ShortcutAction }>).detail?.action
      if (action !== 'quickCreate' && action !== 'searchTasks') return
      if (openDialogsRef.current || document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]')) return
      if (action === 'quickCreate') setQuickCreateOpen(true)
      else setTaskSearchOpen(true)
      setShortcutRuntimeError('')
    }
    const handleShortcutError = (event: Event) => {
      const message = (event as CustomEvent<string>).detail
      setShortcutRuntimeError(typeof message === 'string' ? message : '无法将 Work Todo 窗口置于前台。')
    }
    window.addEventListener(GLOBAL_SHORTCUT_EVENT, handleGlobalShortcut)
    window.addEventListener(GLOBAL_SHORTCUT_ERROR_EVENT, handleShortcutError)
    return () => {
      window.removeEventListener(GLOBAL_SHORTCUT_EVENT, handleGlobalShortcut)
      window.removeEventListener(GLOBAL_SHORTCUT_ERROR_EVENT, handleShortcutError)
    }
  }, [])

  useEffect(() => {
    if (!isDesktop) return
    let disposed = false
    let unlisten: (() => void) | undefined

    const attachCloseGuard = async () => {
      const { registerDesktopCloseGuard } = await import('./lib/desktopCloseGuard')
      const removeListener = await registerDesktopCloseGuard(async () => {
        await flushWorkspaceRef.current()
      }, async () => {
        const { ask } = await import('@tauri-apps/plugin-dialog')
        return ask('最新数据保存失败。仍要关闭并放弃尚未保存的更改吗？', {
          title: 'Work Todo',
          kind: 'warning',
        })
      })
      if (disposed) removeListener()
      else unlisten = removeListener
    }

    void attachCloseGuard().catch((error: unknown) => console.error('无法启用桌面退出保存保护', error))
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [isDesktop])

  useEffect(() => {
    const handleOpenBackup = () => setActivePage('settings')
    window.addEventListener('open-backup-settings', handleOpenBackup)
    return () => window.removeEventListener('open-backup-settings', handleOpenBackup)
  }, [])

  useEffect(() => {
    const handleCompositionStart = () => { isComposing.current = true }
    const handleCompositionEnd = () => { isComposing.current = false }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (event.isComposing || event.keyCode === 229 || isComposing.current) return
      const hasOpenDialog = document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]') !== null
      const bindings = shortcutSettingsRef.current.bindings
      const searchBinding = bindings['window.searchTasks']
      const quickCreateBinding = bindings['window.quickCreate']
      const searchMatches = searchBinding.enabled && (
        matchesShortcutEvent(event, searchBinding.shortcut) ||
        (searchBinding.shortcut === 'Ctrl+K' && event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k')
      )
      if (searchMatches) {
        if (hasOpenDialog || isContentEditableTarget(event.target)) return
        event.preventDefault()
        setTaskSearchOpen(true)
        return
      }

      if (!quickCreateBinding.enabled || !matchesShortcutEvent(event, quickCreateBinding.shortcut)) return
      if (hasOpenDialog || isEditableTarget(event.target)) return
      event.preventDefault()
      setQuickCreateOpen(true)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('compositionstart', handleCompositionStart)
    window.addEventListener('compositionend', handleCompositionEnd)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('compositionstart', handleCompositionStart)
      window.removeEventListener('compositionend', handleCompositionEnd)
    }
  }, [])

  const currentPageLabel = activePage === 'settings'
    ? '设置'
    : NAV_ITEMS.find((item) => item.key === activePage)?.label ?? NAV_ITEMS[0].label
  const localDateKey = toDateKey(now)
  const weekday = now.toLocaleDateString('zh-CN', { weekday: 'long' })
  const headerDate = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 · ${weekday}`

  const updateTask = (task: Task) => {
    setData((current) => {
      const existing = current.tasks.some((item) => item.id === task.id)
      return { ...current, tasks: existing ? current.tasks.map((item) => item.id === task.id ? task : item) : [...current.tasks, task] }
    })
    setActiveTaskId(task.id)
  }

  const updateTaskStatus = (taskId: string, status: TaskStatus) => {
    setData((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === taskId ? setTaskStatus(task, status) : task) }))
  }

  const toggleSubtask = (taskId: string, subtaskId: string, done: boolean) => {
    setData((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === taskId ? setSubtaskCompletion(task, subtaskId, done) : task) }))
  }

  const openNewTask = (status: TaskStatus = 'todo') => {
    setActiveTaskId(null)
    setNewTaskStatus(status)
    setDrawerOpen(true)
  }

  const openExistingTask = (task: Task) => {
    setActiveTaskId(task.id)
    setNewTaskStatus(task.status)
    setDrawerOpen(true)
    setTaskSearchOpen(false)
  }

  const createQuickTask = (title: string, status: TaskStatus, openDetails: boolean) => {
    const task = createTask(title, status)
    setData((current) => ({ ...current, tasks: [...current.tasks, task] }))
    setQuickCreateOpen(false)
    if (openDetails) {
      setActiveTaskId(task.id)
      setNewTaskStatus(status)
      setDrawerOpen(true)
    }
  }

  const handleRestoreTask = (task: Task) => {
    setData((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? setTaskStatus(item, item.previousStatus ?? 'todo') : item) }))
  }

  const handleDeleteTask = (task: Task) => {
    setPendingTaskDelete(task)
  }

  const confirmDeleteTask = () => {
    const task = pendingTaskDelete
    if (!task) return
    setData((current) => ({ ...current, tasks: current.tasks.filter((item) => item.id !== task.id) }))
    setDrawerOpen(false)
    setActiveTaskId(null)
    setPendingTaskDelete(null)
  }

  const toggleRoutine = (rule: RoutineRule, date: string, done: boolean) => {
    setData((current) => ({
      ...current,
      routineCompletions: updateRoutineCompletion(current.routineCompletions, rule, date, done),
    }))
  }

  const saveRoutineRule = (rule: RoutineRule) => {
    setData((current) => {
      const exists = current.routineRules.some((item) => item.id === rule.id)
      return { ...current, routineRules: exists ? current.routineRules.map((item) => item.id === rule.id ? rule : item) : [...current.routineRules, rule] }
    })
  }

  const toggleRoutineRule = (rule: RoutineRule) => saveRoutineRule({ ...rule, enabled: !rule.enabled, updatedAt: new Date().toISOString() })
  const deleteRoutineRule = (rule: RoutineRule) => setData((current) => ({ ...current, routineRules: current.routineRules.filter((item) => item.id !== rule.id) }))

  const setCalendarDays = (days: string[], type: CalendarDayType | null) => {
    setData((current) => {
      const calendarOverrides = { ...current.calendarOverrides }
      days.forEach((day) => {
        if (type === null || type === 'workday') delete calendarOverrides[day]
        else calendarOverrides[day] = type
      })
      return { ...current, calendarOverrides }
    })
  }

  const updateIndexColumns = (columns: IndexColumn[]) => setData((current) => updateIndexWorkspace(current, columns))

  const exportBackup = async () => {
    const backup = { format: 'work-todo-backup', version: 1, exportedAt: new Date().toISOString(), workspace: data }
    const contents = JSON.stringify(backup, null, 2)
    const fileName = `work-todo-backup-${localDateKey}.json`
    try {
      if (isDesktop) {
        const saved = await saveDesktopBackup(contents, fileName)
        if (!saved) return
        setBackupMessage('备份文件已保存。')
      } else {
        const blob = new Blob([contents], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        link.click()
        URL.revokeObjectURL(url)
        setBackupMessage('备份文件已生成并下载。')
      }
      setBackupError('')
    } catch (error) {
      setBackupMessage('')
      setBackupError(error instanceof Error ? error.message : '无法保存备份文件。')
    }
  }

  const importBackup = async (file?: File) => {
    if (!isDesktop && !file) return
    try {
      const contents = isDesktop ? await readDesktopBackup() : await file!.text()
      if (contents === null) return
      const workspace = sanitizeImportedIndexWorkspace(parseWorkspaceBackup(JSON.parse(contents)))
      const storageName = isDesktop ? '当前桌面应用' : '当前浏览器'
      setPendingBackupImport({ workspace, storageName })
      setBackupError('')
      setBackupMessage('')
    } catch (error) {
      setBackupMessage('')
      setBackupError(error instanceof Error ? error.message : '无法读取这个备份文件。')
    }
  }

  const confirmBackupImport = async () => {
    const pending = pendingBackupImport
    if (!pending) return
    setPendingBackupImport(null)
    try {
      await replaceWorkspace(pending.workspace)
      setResetVersion((value) => value + 1)
      setBackupError('')
      setBackupMessage(isDesktop ? '数据已导入并保存到桌面应用。' : '数据已导入并保存到本机。')
    } catch (error) {
      setBackupMessage('')
      setBackupError(error instanceof Error ? error.message : `无法替换${pending.storageName}中的数据。`)
    }
  }

  if (!ready) return <div className="loading-screen"><div className="loading-mark"><img src="/work-todo-icon.png" alt="" /></div><strong>正在打开你的工作空间</strong><span>读取本机保存的数据…</span></div>

  return (
    <CountdownClockProvider>
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><div className="brand-mark"><img src="/work-todo-icon.png" alt="" /></div><div><strong>WORK SPACE</strong><span>个人工作台</span></div></div>
        <nav className="main-nav" aria-label="主导航">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            return <button key={item.key} className={`nav-item ${activePage === item.key ? 'nav-item-active' : ''}`} onClick={() => setActivePage(item.key)} aria-current={activePage === item.key ? 'page' : undefined}>
              <span className="nav-icon"><Icon size={18} strokeWidth={1.8} /></span><span className="nav-copy"><strong>{item.label}</strong><small>{item.description}</small></span>
            </button>
          })}
        </nav>
      </aside>

      <main className="main-area" tabIndex={-1} data-dialog-focus-fallback>
        <header className="topbar">
          <div className="breadcrumb"><span>WORK SPACE</span><span className="breadcrumb-slash">/</span><strong>{currentPageLabel}</strong></div>
          <div className="topbar-right"><span className="topbar-date">{headerDate}</span><SaveIndicator status={saveState.status} message={saveState.message} savedAt={saveState.savedAt} /><button type="button" className="topbar-settings-button" title="设置" aria-label="设置" aria-current={activePage === 'settings' ? 'page' : undefined} onClick={() => setActivePage('settings')}><Settings size={18} /></button></div>
        </header>
        {saveState.status === 'error' && <div className="global-storage-error">本机保存异常：{saveState.message}<button onClick={() => setActivePage('settings')}>打开备份设置</button></div>}
        {shortcutRuntimeError && <div className="shortcut-runtime-error" role="alert">快捷键唤起提示：{shortcutRuntimeError}<button aria-label="关闭快捷键提示" onClick={() => setShortcutRuntimeError('')}>关闭</button></div>}
        {urgentRoutineReminders.length > 0 && <div className="routine-urgent-reminder" role="alert"><strong>例行任务仍未完成</strong><span>{urgentRoutineReminders.map((item) => `${item.title || '未命名例行任务'} 已提醒 30 分钟仍未完成`).join('；')}</span><button type="button" onClick={() => setActivePage('routines')}>查看例行任务</button></div>}
        <div className={`page-content page-${activePage}`}>
          {activePage === 'tasks' && <TaskBoard tasks={data.tasks} now={now} onOpenTask={openExistingTask} onCreateTask={openNewTask} onMoveTask={updateTaskStatus} onToggleSubtask={toggleSubtask} onOpenHistory={() => setHistoryOpen(true)} onOpenSearch={() => setTaskSearchOpen(true)} />}
          {activePage === 'routines' && <RoutinePage rules={data.routineRules} completions={data.routineCompletions} dateKey={localDateKey} calendarOverrides={data.calendarOverrides} onToggleCompletion={toggleRoutine} onSaveRule={saveRoutineRule} onDeleteRule={deleteRoutineRule} onToggleRule={toggleRoutineRule} />}
          {activePage === 'calendar' && <CalendarPage overrides={data.calendarOverrides} onSetDays={setCalendarDays} />}
          {activePage === 'index' && <IndexPage columns={data.indexColumns} saveState={saveState} onChange={updateIndexColumns} resetVersion={resetVersion} />}
          {activePage === 'settings' && <SettingsPage
            shortcutController={shortcutSettings}
            isWindowsDesktop={isWindowsDesktop}
            data={data}
            isDesktop={isDesktop}
            saveState={saveState}
            message={backupMessage}
            error={backupError}
            onExport={exportBackup}
            onImport={importBackup}
          />}
        </div>
      </main>

      {drawerOpen && <TaskDrawer task={activeTask} defaultStatus={newTaskStatus} now={now} onSave={updateTask} onDelete={handleDeleteTask} onClose={() => { setDrawerOpen(false); setActiveTaskId(null) }} />}
      {historyOpen && <TaskHistory tasks={data.tasks} onRestore={handleRestoreTask} onClose={() => setHistoryOpen(false)} />}
      {quickCreateOpen && <QuickCreateModal onClose={() => setQuickCreateOpen(false)} onCreate={createQuickTask} />}
      {taskSearchOpen && <TaskSearchModal tasks={data.tasks} onClose={() => setTaskSearchOpen(false)} onOpenTask={openExistingTask} />}
      {pendingTaskDelete && <ConfirmDialog
        title="删除任务？"
        message={`“${pendingTaskDelete.title || '未命名任务'}”及其子任务会从工作区删除，且无法撤销。`}
        onClose={() => setPendingTaskDelete(null)}
        onConfirm={confirmDeleteTask}
        confirmLabel="删除任务"
      />}
      {pendingBackupImport && <ConfirmDialog
        title="替换当前工作区数据？"
        message={`导入会用备份文件替换${pendingBackupImport.storageName}中的全部任务、例行任务、日历与 Index 数据。请确认已备份当前数据。`}
        onClose={() => setPendingBackupImport(null)}
        onConfirm={() => { void confirmBackupImport() }}
        confirmLabel="替换并导入"
        cancelLabel="取消导入"
      />}
    </div>
    </CountdownClockProvider>
  )
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof Element
    ? target
    : document.activeElement instanceof Element ? document.activeElement : null
  return element !== null && (
    element.matches('input, textarea, select') ||
    element.closest('[contenteditable]:not([contenteditable="false"])') !== null
  )
}

function isContentEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof Element
    ? target
    : document.activeElement instanceof Element ? document.activeElement : null
  return element !== null && element.closest('[contenteditable]:not([contenteditable="false"])') !== null
}
