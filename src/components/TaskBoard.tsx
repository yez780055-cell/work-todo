import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, CalendarClock, Check, Clock3, History, Plus, Star } from 'lucide-react'
import { formatCountdown, formatDateLabel, isInCurrentWeek } from '../lib/dates'
import { STATUS_LABELS, STATUS_ORDER, type Task, type TaskStatus } from '../lib/model'
import { Button, EmptyState } from './common'

export function TaskBoard({
  tasks, now, onOpenTask, onCreateTask, onMoveTask, onOpenHistory,
}: {
  tasks: Task[]
  now: Date
  onOpenTask: (task: Task) => void
  onCreateTask: (status: TaskStatus) => void
  onMoveTask: (id: string, status: TaskStatus) => void
  onOpenHistory: () => void
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const columns = useMemo(() => {
    const visibleTasks = tasks.filter((task) => task.status !== 'done' || isInCurrentWeek(task.completedAt, now))
    return STATUS_ORDER.map((status) => ({
      status,
      tasks: visibleTasks.filter((task) => task.status === status).sort((a, b) => {
        if (a.important !== b.important) return a.important ? -1 : 1
        const aDue = a.dueDate ? `${a.dueDate} ${a.dueTime}` : '9999'
        const bDue = b.dueDate ? `${b.dueDate} ${b.dueTime}` : '9999'
        return aDue.localeCompare(bDue) || b.updatedAt.localeCompare(a.updatedAt)
      }),
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
        <Button onClick={onOpenHistory} icon={<History size={16} />}>已完成历史</Button>
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
                  now={now}
                  onClick={() => onOpenTask(task)}
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

function TaskCard({ task, now, onClick, onDragStart, onDragEnd }: {
  task: Task
  now: Date
  onClick: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const isCompleted = task.status === 'done'
  const countdown = isCompleted ? '' : formatCountdown(task.dueDate, task.dueTime, now)
  const overdue = countdown.startsWith('逾期')
  const completedSubtasks = task.subtasks.filter((item) => item.done).length
  return (
    <button
      type="button"
      className={`task-card ${task.status === 'done' ? 'task-card-done' : ''}`}
      draggable
      onDragStart={(event) => { event.dataTransfer.setData('text/plain', task.id); event.dataTransfer.effectAllowed = 'move'; onDragStart() }}
      onDragEnd={onDragEnd}
      onClick={onClick}
    >
      <span className="task-card-top">
        <span className="task-card-category">{task.status === 'done' ? <><Check size={13} /> 已完成</> : '工作任务'}</span>
        {task.important && <Star className="important-star" size={15} fill="currentColor" />}
      </span>
      <strong className="task-card-title">{task.title || '未命名任务'}</strong>
      {task.note && <span className="task-card-note">{task.note}</span>}
      {!isCompleted && (task.dueDate || countdown) && <span className="task-card-meta">
        {task.dueDate && <span className={`due-pill ${overdue ? 'due-overdue' : ''}`}><CalendarClock size={13} />{formatDateLabel(task.dueDate, now)}{task.dueTime ? ` ${task.dueTime}` : ''}</span>}
        {countdown && <span className={`countdown ${overdue ? 'countdown-overdue' : ''}`}><Clock3 size={12} />{countdown}</span>}
      </span>}
      {task.subtasks.length > 0 && <span className="task-card-subtasks"><span className="tiny-progress"><i style={{ width: `${(completedSubtasks / task.subtasks.length) * 100}%` }} /></span>{completedSubtasks}/{task.subtasks.length} 子任务</span>}
      <span className="task-card-drag-hint"><ArrowUp size={12} /><ArrowDown size={12} /> 拖动调整状态</span>
    </button>
  )
}

export function TaskHistory({ tasks, onRestore, onClose }: {
  tasks: Task[]
  onRestore: (task: Task) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const completed = tasks.filter((task) => task.status === 'done').filter((task) => task.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <aside className="side-drawer history-drawer" role="dialog" aria-modal="true" aria-label="已完成历史">
        <header className="drawer-header"><div><span className="eyebrow">TASK ARCHIVE</span><h2>已完成历史</h2><p>跨周隐藏的任务仍保留在这里，可随时恢复。</p></div><button className="icon-button close-button" onClick={onClose} aria-label="关闭">×</button></header>
        <label className="search-field"><span>搜索任务</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入任务标题" /></label>
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
