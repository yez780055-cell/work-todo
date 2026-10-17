import { useMemo, useRef, useState } from 'react'
import { CalendarClock, Check, Clock3, History, Plus, Search, Star } from 'lucide-react'
import { formatDateLabel, getTaskDeadlineDisplay, isInCurrentWeek } from '../lib/dates'
import { STATUS_LABELS, STATUS_ORDER, type Task, type TaskStatus } from '../lib/model'
import { compareTasksForBoard } from '../lib/tasks'
import { Button, EmptyState } from './common'
import { useCountdownNow } from '../useCountdownClock'
import { useDialogFocus } from './useDialogFocus'

export function TaskBoard({
  tasks, now, onOpenTask, onCreateTask, onMoveTask, onToggleSubtask, onOpenHistory, onOpenSearch,
}: {
  tasks: Task[]
  now: Date
  onOpenTask: (task: Task) => void
  onCreateTask: (status: TaskStatus) => void
  onMoveTask: (id: string, status: TaskStatus) => void
  onToggleSubtask: (taskId: string, subtaskId: string, done: boolean) => void
  onOpenHistory: () => void
  onOpenSearch?: () => void
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const countdownNow = useCountdownNow(now)
  const columns = useMemo(() => {
    const visibleTasks = tasks.filter((task) => task.status !== 'done' || isInCurrentWeek(task.completedAt, now))
    return STATUS_ORDER.map((status) => ({
      status,
      tasks: visibleTasks.filter((task) => task.status === status).sort(compareTasksForBoard),
    }))
  }, [tasks, now])

  const moveDroppedTask = (status: TaskStatus) => {
    if (draggingId) onMoveTask(draggingId, status)
    setDraggingId(null)
  }

  return (
    <div className="board-wrap">
      <div className="board-toolbar">
        <div className="board-summary"><span>{tasks.filter((task) => task.status !== 'done').length} 项进行中</span><i /> <span>{tasks.filter((task) => task.important && task.status !== 'done').length} 项重要</span></div>
        <div className="board-toolbar-actions">{onOpenSearch && <Button variant="ghost" onClick={onOpenSearch} icon={<Search size={15} />}>搜索任务</Button>}
        <Button onClick={onOpenHistory} icon={<History size={16} />}>已完成历史</Button>
        </div>
      </div>
      <div className="task-board">
        {columns.map(({ status, tasks: columnTasks }) => (
          <section
            className={`task-column column-${status} ${draggingId ? 'drop-ready' : ''}`}
            key={status}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); moveDroppedTask(status) }}
          >
            <header className="column-header">
              <div className="column-title-wrap"><span className={`status-dot dot-${status}`} /><h3>{STATUS_LABELS[status]}</h3><span className="column-count">{columnTasks.length}</span></div>
              <button className="column-add" aria-label={`在${STATUS_LABELS[status]}中新建任务`} onClick={() => onCreateTask(status)}><Plus size={17} /></button>
            </header>
            <div className="column-content">
              {status === 'done' && <div className="week-note">本周完成</div>}
              {columnTasks.length === 0 ? (
                <div className="column-empty">{status === 'done' ? '本周还没有完成项' : '暂无任务'}</div>
              ) : columnTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  now={countdownNow}
                  onClick={() => onOpenTask(task)}
                  onToggleSubtask={onToggleSubtask}
                  onDragStart={() => setDraggingId(task.id)}
                  onDragEnd={() => setDraggingId(null)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function TaskCard({ task, now, onClick, onToggleSubtask, onDragStart, onDragEnd }: {
  task: Task
  now: Date
  onClick: () => void
  onToggleSubtask: (taskId: string, subtaskId: string, done: boolean) => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const [subtasksExpanded, setSubtasksExpanded] = useState(false)
  const isCompleted = task.status === 'done'
  const deadline = isCompleted ? { text: '', tone: '' as const } : getTaskDeadlineDisplay(task.dueDate, task.dueTime, now)
  const overdue = deadline.tone === 'overdue'
  const completedSubtasks = task.subtasks.filter((item) => item.done).length
  const subtaskListId = `task-subtasks-${task.id}`
  return (
    <article
      className={`task-card ${task.status === 'done' ? 'task-card-done' : ''}`}
      draggable
      onDragStart={(event) => {
        if (event.target instanceof Element && event.target.closest('[data-task-card-control]')) {
          event.preventDefault()
          return
        }
        event.dataTransfer.setData('text/plain', task.id)
        event.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onClick={onClick}
    >
      <button type="button" className="task-card-main" aria-label={`打开任务详情：${task.title || '未命名任务'}`}>
        <span className="task-card-top">
          <span className="task-card-category">{task.status === 'done' ? <><Check size={13} /> 已完成</> : '工作任务'}</span>
          {task.important && <Star className="important-star" size={15} fill="currentColor" />}
        </span>
        <strong className="task-card-title">{task.title || '未命名任务'}</strong>
        {task.note && <span className="task-card-note">{task.note}</span>}
        {!isCompleted && (task.dueDate || deadline.text) && <span className="task-card-meta">
          {task.dueDate && <span className={`due-pill ${overdue ? 'due-overdue' : ''}`}><CalendarClock size={13} />{formatDateLabel(task.dueDate, now)}{task.dueTime ? ` ${task.dueTime}` : ''}</span>}
          {deadline.text && <span className={`countdown countdown-${deadline.tone}`}><Clock3 size={12} />{deadline.text}</span>}
        </span>}
      </button>
      {task.subtasks.length > 0 && <>
        <button
          type="button"
          className="task-card-subtasks"
          data-task-card-control
          aria-expanded={subtasksExpanded}
          aria-controls={subtaskListId}
          aria-label={`${task.title || '未命名任务'}：子任务 ${completedSubtasks}/${task.subtasks.length}，${subtasksExpanded ? '收起' : '展开'}`}
          onClick={(event) => { event.stopPropagation(); setSubtasksExpanded((expanded) => !expanded) }}
        >
          <span className="tiny-progress" aria-hidden="true"><i style={{ width: `${(completedSubtasks / task.subtasks.length) * 100}%` }} /></span>
          <span>{completedSubtasks}/{task.subtasks.length} 子任务</span>
        </button>
        {subtasksExpanded && <ul className="task-card-subtask-list" id={subtaskListId} data-task-card-control onClick={(event) => event.stopPropagation()}>
          {task.subtasks.map((subtask) => (
            <li key={subtask.id}>
              <label className={`task-card-subtask-row ${subtask.done ? 'is-complete' : ''}`}>
                <input
                  type="checkbox"
                  checked={subtask.done}
                  disabled={isCompleted}
                  aria-label={`子任务：${subtask.title || '未命名子任务'}`}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => { event.stopPropagation(); onToggleSubtask(task.id, subtask.id, event.currentTarget.checked) }}
                />
                <span>{subtask.title || '未命名子任务'}</span>
              </label>
            </li>
          ))}
        </ul>}
      </>}
    </article>
  )
}

export function TaskHistory({ tasks, onRestore, onClose }: {
  tasks: Task[]
  onRestore: (task: Task) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const dialogRef = useRef<HTMLElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  useDialogFocus(dialogRef, searchInputRef, onClose)
  const completed = tasks.filter((task) => task.status === 'done').filter((task) => task.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <aside className="side-drawer history-drawer" role="dialog" aria-modal="true" aria-labelledby="task-history-title" tabIndex={-1} ref={dialogRef}>
        <header className="drawer-header"><div><span className="eyebrow">TASK ARCHIVE</span><h2 id="task-history-title">已完成历史</h2><p>跨周隐藏的任务仍保留在这里，可随时恢复。</p></div><button type="button" className="icon-button close-button" onClick={onClose} aria-label="关闭">×</button></header>
        <label className="search-field"><span>搜索任务</span><input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入任务标题" /></label>
        <div className="history-list">
          {completed.length === 0 ? <EmptyState icon={<History size={22} />} title="没有找到已完成任务" detail={query ? '换个关键词试试' : '完成的任务会在这里归档'} /> : completed.map((task) => (
            <article className="history-row" key={task.id}>
              <div><strong>{task.title || '未命名任务'}</strong><span>完成于 {task.completedAt ? new Date(task.completedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span></div>
              <Button variant="ghost" onClick={() => onRestore(task)}>恢复任务</Button>
            </article>
          ))}
        </div>
      </aside>
    </div>
  )
}
