import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TaskBoard } from './TaskBoard'
import { createTask, type Task, type TaskStatus } from '../lib/model'
import { setTaskStatus } from '../lib/tasks'

const now = new Date('2026-10-15T12:00:00')

function renderBoard() {
  const task = createTask('拖动回归任务')
  task.subtasks = [{ id: 's1', title: '保留子任务', done: false }]
  const archived = { ...createTask('跨周完成任务', 'done'), completedAt: '2025-01-01T00:00:00.000Z' }
  const moves = vi.fn()
  const snapshots: Task[] = []
  function Harness() {
    const [tasks, setTasks] = useState([task, archived])
    return <TaskBoard tasks={tasks} now={now} onOpenTask={() => undefined} onCreateTask={() => undefined}
      onToggleSubtask={() => undefined} onOpenHistory={() => undefined} onMoveTask={(id, status) => {
        moves(id, status)
        setTasks(current => current.map(item => {
          if (item.id !== id) return item
          const next = setTaskStatus(item, status, now.toISOString())
          snapshots.push(next)
          return next
        }))
      }} />
  }
  const result = render(<Harness />)
  const card = () => screen.getByRole('button', { name: '打开任务详情：拖动回归任务' }).closest('article')!
  const column = (status: TaskStatus) => result.container.querySelector(`.column-${status}`)!
  const start = () => {
    const source = card()
    fireEvent.dragStart(source, { dataTransfer: { setData: vi.fn(), effectAllowed: '' } })
    return source
  }
  return { ...result, task, card, column, start, moves, snapshots }
}

describe('task board drag regression', () => {
  it('moves across all four statuses with completion semantics and keeps old history hidden', () => {
    const board = renderBoard()
    for (const status of ['doing', 'review', 'done', 'todo'] as TaskStatus[]) {
      const source = board.start()
      const over = new Event('dragover', { bubbles: true, cancelable: true })
      fireEvent(board.column(status), over)
      expect(over.defaultPrevented).toBe(true)
      fireEvent.drop(board.column(status))
      fireEvent.dragEnd(source)
      expect(board.card().closest(`.column-${status}`)).not.toBeNull()
      expect(board.container.querySelector('.drop-ready')).toBeNull()
      expect(screen.queryByText('跨周完成任务')).toBeNull()
    }
    expect(board.moves.mock.calls.map(([, status]) => status)).toEqual(['doing', 'review', 'done', 'todo'])
    expect(board.snapshots[2]).toMatchObject({ status: 'done', previousStatus: 'review', completedAt: now.toISOString(), autoCompletedBySubtasks: false })
    expect(board.snapshots[3]).toMatchObject({ status: 'todo', previousStatus: null, completedAt: null, subtasks: board.task.subtasks })
  })

  it('ignores external or late drops after a canceled drag', () => {
    const board = renderBoard()
    fireEvent.drop(board.column('doing'), { dataTransfer: { getData: () => board.task.id } })
    expect(board.moves).not.toHaveBeenCalled()
    const source = board.start()
    expect(board.container.querySelectorAll('.drop-ready')).toHaveLength(4)
    fireEvent.dragEnd(source)
    fireEvent.drop(board.column('done'))
    expect(board.moves).not.toHaveBeenCalled()
    expect(board.card().closest('.column-todo')).not.toBeNull()
    expect(board.container.querySelector('.drop-ready')).toBeNull()
  })
})
