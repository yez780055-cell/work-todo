import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { CalendarClock, Check, Search, X } from 'lucide-react'
import { formatDateLabel } from '../lib/dates'
import { STATUS_LABELS, type Task } from '../lib/model'
import { searchTasks, TASK_SEARCH_RESULT_LIMIT } from '../lib/taskSearch'
import { useDialogFocus } from './useDialogFocus'

export function TaskSearchModal({ tasks, onClose, onOpenTask }: {
  tasks: Task[]
  onClose: () => void
  onOpenTask: (task: Task) => void
}) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const dialogRef = useRef<HTMLElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const skipFocusRestore = useDialogFocus(dialogRef, searchInputRef)
  const results = useMemo(() => searchTasks(tasks, query), [tasks, query])
  const selectedIndex = Math.min(activeIndex, Math.max(0, results.items.length - 1))
  const activeResultId = results.items.length > 0 ? `task-search-result-${selectedIndex}` : undefined

  useEffect(() => {
    setActiveIndex((current) => Math.min(current, Math.max(0, results.items.length - 1)))
  }, [results.items.length])

  useEffect(() => {
    const selected = resultsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    selected?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedIndex, results.items])

  const openTask = (task: Task) => {
    skipFocusRestore()
    onOpenTask(task)
  }

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const nativeEvent = event.nativeEvent
    if (nativeEvent.isComposing || nativeEvent.keyCode === 229 || results.items.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => Math.min(current + 1, results.items.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      openTask(results.items[selectedIndex])
    }
  }

  return (
    <div className="modal-backdrop task-search-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="modal task-search-dialog" role="dialog" aria-modal="true" aria-label="全局任务搜索" ref={dialogRef}>
        <header className="modal-header task-search-header">
          <div><h2>搜索任务</h2><p>搜索所有状态下的任务、备注和子任务。</p></div>
          <button className="icon-button close-button" type="button" aria-label="关闭任务搜索" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="task-search-input-wrap">
          <Search size={19} aria-hidden="true" />
          <input
            ref={searchInputRef}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setActiveIndex(0) }}
            onKeyDown={handleSearchKeyDown}
            placeholder="搜索任务标题、备注或子任务"
            aria-label="搜索任务标题、备注或子任务"
            aria-controls="task-search-results"
            aria-activedescendant={activeResultId}
            autoComplete="off"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="task-search-summary" aria-live="polite">
          {results.isRecent
            ? `最近更新 · 显示 ${results.items.length} 项`
            : `${results.total} 条匹配${results.total > TASK_SEARCH_RESULT_LIMIT ? ` · 显示前 ${TASK_SEARCH_RESULT_LIMIT} 项` : ''}`}
          {results.items.length > 0 && <span>↑↓ 选择 <b>Enter</b> 打开</span>}
        </div>
        <div className="task-search-results" id="task-search-results" role="listbox" aria-label="任务搜索结果" ref={resultsRef}>
          {results.items.length === 0 ? (
            <div className="task-search-empty" role="status">
              <strong>{query.trim() ? '没有找到匹配任务' : '还没有任务'}</strong>
              <span>{query.trim() ? '试试任务标题、备注或子任务中的其他关键词。' : '创建任务后，它们会显示在这里。'}</span>
            </div>
          ) : results.items.map((task, index) => {
            const dueLabel = task.dueDate ? `${formatDateLabel(task.dueDate)}${task.dueTime ? ` ${task.dueTime}` : ''}` : ''
            const completedLabel = task.status === 'done' && task.completedAt
              ? `完成于 ${new Date(task.completedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
              : ''
            return (
              <button
                key={task.id}
                id={`task-search-result-${index}`}
                className={`task-search-result ${selectedIndex === index ? 'task-search-result-active' : ''}`}
                type="button"
                role="option"
                aria-selected={selectedIndex === index}
                aria-label={`打开任务：${task.title || '未命名任务'}，${STATUS_LABELS[task.status]}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => openTask(task)}
              >
                <span className="task-search-result-main">
                  <strong>{task.title || '未命名任务'}</strong>
                  <span className={`task-search-status task-search-status-${task.status}`}>{task.status === 'done' && <Check size={12} />}{STATUS_LABELS[task.status]}</span>
                </span>
                {(dueLabel || completedLabel) && <span className="task-search-result-meta">
                  {dueLabel && <span><CalendarClock size={13} />{dueLabel}</span>}
                  {completedLabel && <span>{completedLabel}</span>}
                </span>}
              </button>
            )
          })}
        </div>
        <footer className="task-search-footer"><span>覆盖看板任务的全部状态，包括已完成历史</span><span><kbd>Ctrl/⌘</kbd> + <kbd>K</kbd> 打开</span></footer>
      </section>
    </div>
  )
}
