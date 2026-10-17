import { useRef, useState, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import { STATUS_LABELS, type TaskStatus } from '../lib/model'
import { useDialogFocus } from './useDialogFocus'

const QUICK_CREATE_STATUSES: TaskStatus[] = ['todo', 'doing', 'review']

export function QuickCreateModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (title: string, status: TaskStatus, openDetails: boolean) => void
}) {
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<TaskStatus>('todo')
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const submitting = useRef(false)
  const skipFocusRestore = useDialogFocus(dialogRef, titleInputRef, onClose)

  const create = (openDetails: boolean) => {
    if (submitting.current) return
    const cleanTitle = title.trim()
    if (!cleanTitle) {
      setError('请输入任务标题。')
      titleInputRef.current?.focus()
      return
    }
    submitting.current = true
    if (openDetails) skipFocusRestore()
    try {
      onCreate(cleanTitle, status, openDetails)
    } catch {
      submitting.current = false
      setError('创建任务失败，请重试。')
    }
  }

  const handleTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const nativeEvent = event.nativeEvent
    if (event.key !== 'Enter' || nativeEvent.isComposing || nativeEvent.keyCode === 229) return
    if (event.altKey || event.shiftKey) return
    event.preventDefault()
    create(event.ctrlKey || event.metaKey)
  }

  return (
    <div className="modal-backdrop quick-create-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="modal quick-create-dialog" role="dialog" aria-modal="true" aria-label="快速创建任务" tabIndex={-1} ref={dialogRef}>
        <header className="modal-header">
          <div><h2>快速创建任务</h2><p>先记下标题，之后可以继续补充任务详情。</p></div>
          <button className="icon-button close-button" type="button" aria-label="关闭快速创建" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="quick-create-content">
          <label className="quick-create-label" htmlFor="quick-create-title">任务标题</label>
          <input
            id="quick-create-title"
            className="quick-create-title-input"
            ref={titleInputRef}
            value={title}
            onChange={(event) => { setTitle(event.target.value); setError('') }}
            onKeyDown={handleTitleKeyDown}
            placeholder="例如：整理本周产品数据"
            aria-describedby={error ? 'quick-create-error' : 'quick-create-shortcuts'}
          />
          <label className="quick-create-label" htmlFor="quick-create-status">创建后状态</label>
          <select id="quick-create-status" value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}>
            {QUICK_CREATE_STATUSES.map((option) => <option key={option} value={option}>{STATUS_LABELS[option]}</option>)}
          </select>
          {error && <p id="quick-create-error" className="quick-create-error" role="alert">{error}</p>}
          <p id="quick-create-shortcuts" className="quick-create-shortcuts"><kbd>Enter</kbd> 创建任务 <span>·</span> <kbd>Ctrl/⌘</kbd> + <kbd>Enter</kbd> 创建并填写详情</p>
        </div>
        <footer className="quick-create-footer">
          <button className="button button-ghost" type="button" onClick={onClose}>取消</button>
          <div>
            <button className="button button-secondary" type="button" onClick={() => create(false)}>创建任务</button>
            <button className="button button-primary" type="button" onClick={() => create(true)}>创建并填写详情</button>
          </div>
        </footer>
      </section>
    </div>
  )
}
