import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TaskBoard } from './TaskBoard'
import { createTask, type TaskStatus } from '../lib/model'

describe('task board create entry points', () => {
  it('offers exactly one create action per status column and preselects that status', () => {
    const createdStatuses: TaskStatus[] = []
    render(
      <TaskBoard
        tasks={[]}
        now={new Date('2026-10-14T12:00:00')}
        onOpenTask={() => undefined}
        onCreateTask={(status) => { createdStatuses.push(status) }}
        onMoveTask={() => undefined}
        onToggleSubtask={() => undefined}
        onOpenHistory={() => undefined}
      />,
    )
    const addButtons = screen.getAllByRole('button', { name: /在.+中新建任务/ })
    expect(addButtons).toHaveLength(4)
    expect(screen.queryByText('新建任务')).toBeNull()
    addButtons.forEach((button) => fireEvent.click(button))
    expect(createdStatuses).toEqual(['todo', 'doing', 'review', 'done'])
  })
})

describe('completed task card details', () => {
  it('omits due date and countdown only for completed cards without deleting task data', () => {
    const now = new Date('2026-10-14T12:00:00')
    const active = { ...createTask('正在进行的任务', 'doing'), dueDate: '2026-10-15', dueTime: '16:00' }
    const done = { ...createTask('已经完成的任务', 'done'), dueDate: '2026-10-15', dueTime: '16:00', completedAt: now.toISOString() }
    const { container } = render(
      <TaskBoard tasks={[active, done]} now={now} onOpenTask={() => undefined}
        onCreateTask={() => undefined} onMoveTask={() => undefined} onToggleSubtask={() => undefined} onOpenHistory={() => undefined} />,
    )
    const activeCard = Array.from(container.querySelectorAll('.task-card')).find((card) => card.textContent?.includes(active.title))
    const completedCard = Array.from(container.querySelectorAll('.task-card')).find((card) => card.textContent?.includes(done.title))
    expect(activeCard?.querySelector('.due-pill')).not.toBeNull()
    expect(activeCard?.querySelector('.countdown')).not.toBeNull()
    expect(completedCard?.querySelector('.due-pill')).toBeNull()
    expect(completedCard?.querySelector('.countdown')).toBeNull()
    expect(completedCard?.querySelector('.task-card-meta')).toBeNull()
    expect(done.dueDate).toBe('2026-10-15')
    expect(done.dueTime).toBe('16:00')
  })

  it('keeps subtask controls collapsed, keyboard-operable, isolated, and drag-safe', () => {
    const task = { ...createTask('拆分任务', 'doing'), subtasks: [
      { id: 's1', title: '已完成步骤', done: true },
      { id: 's2', title: '待完成步骤', done: false },
    ] }
    const onOpenTask = vi.fn()
    const onToggleSubtask = vi.fn()
    const { container } = render(
      <TaskBoard tasks={[task]} now={new Date('2026-10-14T12:00:00')}
        onOpenTask={onOpenTask} onCreateTask={() => undefined} onMoveTask={() => undefined}
        onToggleSubtask={onToggleSubtask} onOpenHistory={() => undefined} />,
    )

    const summary = screen.getByRole('button', { name: '拆分任务：子任务 1/2，展开' })
    expect(summary.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(container.querySelector('.task-card-drag-hint')).toBeNull()
    expect(screen.queryByText('拖动调整状态')).toBeNull()

    fireEvent.click(summary)
    expect(summary.getAttribute('aria-expanded')).toBe('true')
    const checkbox = screen.getByRole('checkbox', { name: '子任务：待完成步骤' })
    const dragEvent = new Event('dragstart', { bubbles: true, cancelable: true })
    fireEvent(checkbox, dragEvent)
    expect(dragEvent.defaultPrevented).toBe(true)

    fireEvent.click(checkbox)
    expect(onToggleSubtask).toHaveBeenCalledWith(task.id, 's2', true)
    expect(onToggleSubtask).toHaveBeenCalledTimes(1)
    expect(onOpenTask).not.toHaveBeenCalled()

    fireEvent.click(summary)
    expect(screen.queryByRole('checkbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '打开任务详情：拆分任务' }))
    expect(onOpenTask).toHaveBeenCalledWith(task)
  })

  it('keeps completed task subtasks visible as read-only', () => {
    const task = { ...createTask('已完成任务', 'done'), subtasks: [{ id: 's1', title: '步骤', done: false }] }
    render(<TaskBoard tasks={[task]} now={new Date('2026-10-14T12:00:00')} onOpenTask={() => undefined}
      onCreateTask={() => undefined} onMoveTask={() => undefined} onToggleSubtask={() => undefined} onOpenHistory={() => undefined} />)

    fireEvent.click(screen.getByRole('button', { name: '已完成任务：子任务 0/1，展开' }))
    expect((screen.getByRole('checkbox', { name: '子任务：步骤' }) as HTMLInputElement).disabled).toBe(true)
  })
})
