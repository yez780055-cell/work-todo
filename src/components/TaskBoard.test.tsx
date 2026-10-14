import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TaskBoard } from './TaskBoard'
import type { TaskStatus } from '../lib/model'

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
