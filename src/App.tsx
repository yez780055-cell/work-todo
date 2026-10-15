import { useEffect, useMemo, useRef, useState } from 'react'
import { BookOpenText, BriefcaseBusiness, CalendarDays, Check, CircleHelp, ClipboardList, Download, FileUp, LayoutDashboard, Plus, Search, Settings2, Sparkles, X } from 'lucide-react'
import { CalendarPage } from './components/CalendarPage'
import { Button, Modal, SaveIndicator } from './components/common'
import { IndexPage } from './components/IndexPage'
import { QuickCreateModal } from './components/QuickCreateModal'
import { RoutinePage, createCompletion } from './components/RoutinePage'
import { TaskBoard, TaskHistory } from './components/TaskBoard'
import { TaskDrawer } from './components/TaskDrawer'
import { TaskSearchModal } from './components/TaskSearchModal'
import { isInCurrentWeek, toDateKey } from './lib/dates'
import { createEmptyWorkspace, createTask, type CalendarDayType, type RoutineRule, type Task, type TaskStatus } from './lib/model'
import { readDesktopBackup, saveDesktopBackup } from './lib/desktopBackup'
import { isDesktopApp } from './lib/platform'
import { parseWorkspaceBackup } from './lib/storage'
import { sanitizeRichText } from './lib/richText'
import { setSubtaskCompletion, setTaskStatus } from './lib/tasks'
import { useWorkspace } from './useWorkspace'

type PageKey = 'tasks' | 'routines' | 'calendar' | 'index'

const NAV_ITEMS: Array<{ key: PageKey; label: string; description: string; icon: typeof LayoutDashboard }> = [
  { key: 'tasks', label: '任务看板', description: '推进中的工作事项', icon: LayoutDashboard },
  { key: 'routines', label: '例行任务', description: '每天固定要做的事', icon: ClipboardList },
  { key: 'calendar', label: '工作日历', description: '记录你的真实排班', icon: CalendarDays },
  { key: 'index', label: 'Index', description: '留住工作经验与想法', icon: BookOpenText },
]

export default function App() {
  const { data, setData, ready, saveState, flushWorkspace, replaceWorkspace } = useWorkspace()
  const isDesktop = isDesktopApp()
  const [activePage, setActivePage] = useState<PageKey>('tasks')
  const [now, setNow] = useState(() => new Date())
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const [taskSearchOpen, setTaskSearchOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>('todo')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [backupOpen, setBackupOpen] = useState(false)
  const [backupMessage, setBackupMessage] = useState('')
  const [backupError, setBackupError] = useState('')
  const [resetVersion, setResetVersion] = useState(0)
  const isComposing = useRef(false)
  const flushWorkspaceRef = useRef(flushWorkspace)
  flushWorkspaceRef.current = flushWorkspace
  const activeTask = data.tasks.find((task) => task.id === activeTaskId) ?? null

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
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
    const handleOpenBackup = () => setBackupOpen(true)
    window.addEventListener('open-backup-settings', handleOpenBackup)
    return () => window.removeEventListener('open-backup-settings', handleOpenBackup)
  }, [])

  useEffect(() => {
    const handleCompositionStart = () => { isComposing.current = true }
    const handleCompositionEnd = () => { isComposing.current = false }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (event.isComposing || event.keyCode === 229 || isComposing.current) return

      if (event.key === 'Escape') {
        const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')
        const topmostDialog = dialogs.item(dialogs.length - 1)
        const closeButton = topmostDialog?.querySelector<HTMLButtonElement>('button[aria-label^="关闭"]')
        if (topmostDialog && closeButton) {
          event.preventDefault()
          closeButton.click()
        }
        return
      }

      const hasOpenDialog = document.querySelector('[role="dialog"][aria-modal="true"]') !== null
      const commandKey = event.ctrlKey || event.metaKey
      if (commandKey && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        if (hasOpenDialog || isContentEditableTarget(event.target)) return
        event.preventDefault()
        setTaskSearchOpen(true)
        return
      }

      if (event.key.toLowerCase() !== 'n' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
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

  const navItem = NAV_ITEMS.find((item) => item.key === activePage) ?? NAV_ITEMS[0]
  const completedThisWeek = useMemo(() => data.tasks.filter((task) => task.status === 'done' && isInCurrentWeek(task.completedAt, now)).length, [data.tasks, now])
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
    if (!window.confirm(`删除“${task.title}”？此操作无法撤销。`)) return
    setData((current) => ({ ...current, tasks: current.tasks.filter((item) => item.id !== task.id) }))
    setDrawerOpen(false)
    setActiveTaskId(null)
  }

  const toggleRoutine = (rule: RoutineRule, done: boolean) => {
    setData((current) => ({
      ...current,
      routineCompletions: done
        ? [...current.routineCompletions.filter((item) => item.ruleId !== rule.id || item.date !== localDateKey), createCompletion(rule, localDateKey)]
        : current.routineCompletions.filter((item) => item.ruleId !== rule.id || item.date !== localDateKey),
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

  const updateIndex = (html: string) => setData((current) => ({
    ...current,
    indexDocument: { html: sanitizeRichText(html), updatedAt: new Date().toISOString() },
  }))

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
      const workspace = parseWorkspaceBackup(JSON.parse(contents))
      const storageName = isDesktop ? '当前桌面应用' : '当前浏览器'
      if (!window.confirm(`导入后，${storageName}中的数据会被备份文件替换。请先确认已导出现有数据。`)) return
      await replaceWorkspace(workspace)
      setResetVersion((value) => value + 1)
      setBackupError('')
      setBackupMessage(isDesktop ? '数据已导入并保存到桌面应用。' : '数据已导入并保存到本机。')
    } catch (error) {
      setBackupMessage('')
      setBackupError(error instanceof Error ? error.message : '无法读取这个备份文件。')
    }
  }

  if (!ready) return <div className="loading-screen"><div className="loading-mark"><BriefcaseBusiness size={22} /></div><strong>正在打开你的工作空间</strong><span>读取本机保存的数据…</span></div>

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup"><div className="brand-mark"><BriefcaseBusiness size={18} /></div><div><strong>WORK SPACE</strong><span>个人工作台</span></div></div>
        <div className="workspace-label"><span>MY WORKSPACE</span><span className="workspace-dot" /></div>
        <nav className="main-nav" aria-label="主导航">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            return <button key={item.key} className={`nav-item ${activePage === item.key ? 'nav-item-active' : ''}`} onClick={() => setActivePage(item.key)} aria-current={activePage === item.key ? 'page' : undefined}>
              <span className="nav-icon"><Icon size={18} strokeWidth={1.8} /></span><span className="nav-copy"><strong>{item.label}</strong><small>{item.description}</small></span>{item.key === 'tasks' && completedThisWeek > 0 && <span className="nav-count">{completedThisWeek}</span>}
            </button>
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-storage-card"><div className="storage-card-icon"><Sparkles size={15} /></div><div><strong>本机优先</strong><span>数据仅保存在当前浏览器</span></div></div>
          <button className="backup-nav" onClick={() => { setBackupMessage(''); setBackupError(''); setBackupOpen(true) }}><Settings2 size={16} />数据备份</button>
          <div className="sidebar-profile"><span className="profile-avatar">W</span><span><strong>我的工作空间</strong><small>仅自己使用</small></span><CircleHelp size={16} /></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>WORK SPACE</span><span className="breadcrumb-slash">/</span><strong>{navItem.label}</strong></div>
          <div className="topbar-actions">
            <button className="button button-secondary topbar-action" type="button" aria-label="快速创建任务" aria-keyshortcuts="N" title="快速创建任务 (N)" onClick={() => setQuickCreateOpen(true)}><Plus size={15} /><span className="topbar-action-label">快速新建</span><kbd>N</kbd></button>
            <button className="button button-secondary topbar-action" type="button" aria-label="搜索任务" aria-keyshortcuts="Control+K Meta+K" title="搜索任务 (Ctrl/⌘ K)" onClick={() => setTaskSearchOpen(true)}><Search size={15} /><span className="topbar-action-label">搜索任务</span><kbd>Ctrl/⌘ K</kbd></button>
          </div>
          <div className="topbar-right"><span className="topbar-date">{headerDate}</span><SaveIndicator status={saveState.status} message={saveState.message} savedAt={saveState.savedAt} /></div>
        </header>
        {saveState.status === 'error' && <div className="global-storage-error">本机保存异常：{saveState.message}<button onClick={() => setBackupOpen(true)}>打开备份</button></div>}
        <div className={`page-content page-${activePage}`}>
          {activePage === 'tasks' && <TaskBoard tasks={data.tasks} now={now} onOpenTask={openExistingTask} onCreateTask={openNewTask} onMoveTask={updateTaskStatus} onToggleSubtask={toggleSubtask} onOpenHistory={() => setHistoryOpen(true)} />}
          {activePage === 'routines' && <RoutinePage rules={data.routineRules} completions={data.routineCompletions} dateKey={localDateKey} calendarOverrides={data.calendarOverrides} onToggleCompletion={toggleRoutine} onSaveRule={saveRoutineRule} onDeleteRule={deleteRoutineRule} onToggleRule={toggleRoutineRule} />}
          {activePage === 'calendar' && <CalendarPage overrides={data.calendarOverrides} onSetDays={setCalendarDays} />}
          {activePage === 'index' && <IndexPage html={data.indexDocument.html} saveState={saveState} onChange={updateIndex} resetVersion={resetVersion} />}
        </div>
      </main>

      {drawerOpen && <TaskDrawer task={activeTask} defaultStatus={newTaskStatus} onSave={updateTask} onDelete={handleDeleteTask} onClose={() => { setDrawerOpen(false); setActiveTaskId(null) }} />}
      {historyOpen && <TaskHistory tasks={data.tasks} onRestore={handleRestoreTask} onClose={() => setHistoryOpen(false)} />}
      {backupOpen && <BackupModal data={data} isDesktop={isDesktop} saveState={saveState} message={backupMessage} error={backupError} onClose={() => setBackupOpen(false)} onExport={exportBackup} onImport={importBackup} />}
      {quickCreateOpen && <QuickCreateModal onClose={() => setQuickCreateOpen(false)} onCreate={createQuickTask} />}
      {taskSearchOpen && <TaskSearchModal tasks={data.tasks} onClose={() => setTaskSearchOpen(false)} onOpenTask={openExistingTask} />}
    </div>
  )
}

function BackupModal({ data, isDesktop, saveState, message, error, onClose, onExport, onImport }: {
  data: ReturnType<typeof createEmptyWorkspace>
  isDesktop: boolean
  saveState: { status: string; message: string; savedAt: string | null }
  message: string
  error: string
  onClose: () => void
  onExport: () => void
  onImport: (file?: File) => Promise<void>
}) {
  const [importing, setImporting] = useState(false)
  return (
    <Modal title="本机数据与备份" subtitle={isDesktop ? '数据保存在此设备的桌面应用中，与网页端不自动同步。' : '任务与笔记保存在当前浏览器，不会自动同步到其他设备。'} onClose={onClose}>
      <div className="backup-content">
        <div className={`backup-status backup-status-${saveState.status}`}><span className="save-dot" /><div><strong>{saveState.message}</strong><small>{saveState.status === 'error' ? '请先导出当前数据，避免数据丢失。' : '建议定期导出备份，妥善保存在安全位置。'}</small></div></div>
        <div className="backup-actions"><Button variant="primary" icon={<Download size={16} />} onClick={() => void onExport()}>导出全部数据</Button>{isDesktop ? <Button icon={<FileUp size={16} />} disabled={importing} onClick={async () => { setImporting(true); await onImport(); setImporting(false) }}>{importing ? '正在读取备份…' : '导入备份'}</Button> : <label className="button button-secondary backup-import-label"><FileUp size={16} />导入备份<input type="file" accept="application/json,.json" onChange={async (event) => { setImporting(true); await onImport(event.target.files?.[0]); event.target.value = ''; setImporting(false) }} /></label>}</div>
        {importing && <p className="backup-message">正在读取备份…</p>}{message && <p className="backup-message"><Check size={14} />{message}</p>}{error && <p className="backup-error"><X size={14} />{error}</p>}
        <div className="backup-details"><span>看板任务 <strong>{data.tasks.length}</strong></span><span>例行规则 <strong>{data.routineRules.length}</strong></span><span>日历排班 <strong>{Object.keys(data.calendarOverrides).length} 天</strong></span></div>
        <p className="backup-note">备份包含任务、子任务、例行任务完成记录、日历标记和 Index 文档。导入会替换{isDesktop ? '当前桌面应用' : '当前浏览器'}中的全部数据。</p>
      </div>
      <footer className="modal-footer"><Button onClick={onClose}>完成</Button></footer>
    </Modal>
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
