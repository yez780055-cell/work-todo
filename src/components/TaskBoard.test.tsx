import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
        onCreateTask={() => undefined} onMoveTask={() => undefined} onOpenHistory={() => undefined} />,
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
})
