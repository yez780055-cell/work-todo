import { useEffect, useState } from 'react'
import { CalendarClock, Check, Plus, Star, Trash2 } from 'lucide-react'
import { createId, createTask, STATUS_LABELS, STATUS_ORDER, type Subtask, type Task, type TaskStatus } from '../lib/model'
import { setSubtaskCompletion, setTaskStatus } from '../lib/tasks'
import { Button } from './common'

export function TaskDrawer({ task, defaultStatus, onSave, onDelete, onClose }: {
  task: Task | null
  defaultStatus: TaskStatus
  onSave: (task: Task) => void
  onDelete: (task: Task) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Task>(() => task ? { ...task, subtasks: [...task.subtasks] } : createTask('', defaultStatus))
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('')

  useEffect(() => {
    if (task) setDraft({ ...task, subtasks: [...task.subtasks] })
  }, [task?.id])

  const commit = (next: Task) => {
    setDraft(next)
    if (next.title.trim()) onSave(next)
  }

  const changeField = <K extends keyof Task>(key: K, value: Task[K]) => {
    commit({ ...draft, [key]: value, updatedAt: new Date().toISOString() })
  }

  const changeStatus = (status: TaskStatus) => commit(setTaskStatus(draft, status))

  const addSubtask = () => {
    const title = newSubtaskTitle.trim()
    if (!title) return
    const subtask: Subtask = { id: createId(), title, done: false }
    const subtasks = [...draft.subtasks, subtask]
    const now = new Date().toISOString()
    if (draft.status === 'done' && draft.autoCompletedBySubtasks) {
      commit({ ...draft, subtasks, status: draft.previousStatus ?? 'todo', previousStatus: null, completedAt: null, autoCompletedBySubtasks: false, updatedAt: now })
    } else commit({ ...draft, subtasks, updatedAt: now })
    setNewSubtaskTitle('')
  }

  const updateSubtaskTitle = (id: string, title: string) => {
    commit({ ...draft, subtasks: draft.subtasks.map((item) => item.id === id ? { ...item, title } : item), updatedAt: new Date().toISOString() })
  }

  const toggleSubtask = (id: string, done: boolean) => commit(setSubtaskCompletion(draft, id, done))
  const deleteSubtask = (id: string) => commit({ ...draft, subtasks: draft.subtasks.filter((item) => item.id !== id), updatedAt: new Date().toISOString() })

  return (
    <div className="modal-backdrop drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && task) onClose() }}>
      <aside className="side-drawer task-drawer" role="dialog" aria-modal="true" aria-label={task ? '任务详情' : '新建任务'}>
        <header className="drawer-header">
          <div><span className="eyebrow">WORK ITEM</span><h2>{task ? '任务详情' : '新建任务'}</h2><p>{task ? `创建于 ${new Date(task.createdAt).toLocaleDateString('zh-CN')}` : '先写下这件要推进的事。'}</p></div>
          <button className="icon-button close-button" onClick={onClose} aria-label="关闭">×</button>
        </header>
        <div className="drawer-form">
          <label className="field-label">任务标题 <em>必填</em>
            <input className="title-input" value={draft.title} onChange={(event) => changeField('title', event.target.value)} placeholder="例如：整理本周产品数据" autoFocus />
          </label>

          <div className="field-grid">
            <label className="field-label">当前状态
              <select value={draft.status} onChange={(event) => changeStatus(event.target.value as TaskStatus)}>
                {STATUS_ORDER.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
              </select>
            </label>
            <div className="field-label">重要程度
              <button className={`importance-toggle ${draft.important ? 'is-important' : ''}`} onClick={() => changeField('important', !draft.important)} aria-pressed={draft.important}>
                <Star size={16} fill={draft.important ? 'currentColor' : 'none'} />{draft.important ? '重要' : '普通'}
              </button>
            </div>
          </div>

          <fieldset className="field-label deadline-fieldset">
            <legend><CalendarClock size={15} /> 截止时间</legend>
            <div className="field-grid">
              <label><span>日期</span><input type="date" value={draft.dueDate} onChange={(event) => changeField('dueDate', event.target.value)} /></label>
              <label><span>具体时间 <i>可选</i></span><input type="time" value={draft.dueTime} onChange={(event) => changeField('dueTime', event.target.value)} disabled={!draft.dueDate} /></label>
            </div>
          </fieldset>

          <section className="subtask-section">
            <div className="section-heading"><div><span className="eyebrow">CHECKLIST</span><h3>子任务 <span>{draft.subtasks.filter((item) => item.done).length}/{draft.subtasks.length}</span></h3></div><p>全部勾选时自动完成主任务</p></div>
            {draft.subtasks.map((item) => (
              <div className={`subtask-edit-row ${item.done ? 'subtask-is-done' : ''}`} key={item.id}>
                <label className="check-label"><input type="checkbox" checked={item.done} onChange={(event) => toggleSubtask(item.id, event.target.checked)} /><span className="checkmark"><Check size={13} /></span></label>
                <input value={item.title} onChange={(event) => updateSubtaskTitle(item.id, event.target.value)} placeholder="子任务内容" aria-label="子任务内容" />
                <button className="delete-subtask" aria-label="删除子任务" onClick={() => deleteSubtask(item.id)}><Trash2 size={15} /></button>
              </div>
            ))}
            <div className="add-subtask-row"><input value={newSubtaskTitle} onChange={(event) => setNewSubtaskTitle(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addSubtask() } }} placeholder="添加一个子任务" /><button aria-label="添加子任务" onClick={addSubtask}><Plus size={16} /></button></div>
          </section>

          <label className="field-label note-field">备注
            <textarea value={draft.note} onChange={(event) => changeField('note', event.target.value)} placeholder="记录背景、链接或需要留意的内容" rows={5} />
          </label>
        </div>
        <footer className="drawer-footer">
          {task && <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => onDelete(draft)}>删除任务</Button>}
          {!task && !draft.title.trim() && <span className="required-note">填写标题后会自动保存</span>}
          <Button variant="primary" onClick={onClose} disabled={!draft.title.trim()}>完成</Button>
        </footer>
      </aside>
    </div>
  )
}
