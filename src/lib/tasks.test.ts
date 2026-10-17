import { describe, expect, it } from 'vitest'
import { createTask } from './model'
import { compareTasksForBoard, setSubtaskCompletion, setTaskStatus } from './tasks'

describe('task completion state', () => {
  it('restores the prior status when the last subtask completes the task', () => {
    const task = createTask('整理资料', 'doing')
    task.subtasks = [{ id: 's1', title: '第一项', done: true }, { id: 's2', title: '第二项', done: false }]
    const completed = setSubtaskCompletion(task, 's2', true, '2026-10-14T01:00:00.000Z')
    expect(completed.status).toBe('done')
    expect(completed.previousStatus).toBe('doing')
    expect(completed.autoCompletedBySubtasks).toBe(true)
    expect(completed.completedAt).toBe('2026-10-14T01:00:00.000Z')
  })

  it('reopens an automatically completed task when a subtask is unchecked', () => {
    const task = createTask('整理资料', 'review')
    task.subtasks = [{ id: 's1', title: '第一项', done: true }]
    const completed = setSubtaskCompletion(task, 's1', true)
    const reopened = setSubtaskCompletion(completed, 's1', false)
    expect(reopened.status).toBe('review')
    expect(reopened.completedAt).toBeNull()
    expect(reopened.autoCompletedBySubtasks).toBe(false)
  })

  it('does not reopen manually completed tasks when a child is unchecked', () => {
    const task = createTask('整理资料', 'todo')
    task.subtasks = [{ id: 's1', title: '第一项', done: true }]
    const completed = setTaskStatus(task, 'done')
    const changed = setSubtaskCompletion(completed, 's1', false)
    expect(changed.status).toBe('done')
    expect(changed.completedAt).toBe(completed.completedAt)
  })
})

describe('task board deadline ordering', () => {
  it('orders real same-day times before date-only deadlines at end of day', () => {
    const dateOnly = { ...createTask('日期截止'), dueDate: '2026-10-15' }
    const evening = { ...createTask('傍晚'), dueDate: '2026-10-15', dueTime: '18:00' }
    const morning = { ...createTask('上午'), dueDate: '2026-10-15', dueTime: '09:00' }
    expect([dateOnly, evening, morning].sort(compareTasksForBoard).map((task) => task.title)).toEqual(['上午', '傍晚', '日期截止'])
  })

  it('sorts across dates and puts undated tasks last while important tasks stay first', () => {
    const later = { ...createTask('之后'), dueDate: '2026-10-20', dueTime: '08:00' }
    const undated = createTask('无截止')
    const earlier = { ...createTask('较早'), dueDate: '2026-10-14', dueTime: '23:00' }
    const importantUndated = { ...createTask('重要无截止'), important: true }
    expect([later, undated, earlier, importantUndated].sort(compareTasksForBoard).map((task) => task.title))
      .toEqual(['重要无截止', '较早', '之后', '无截止'])
  })

  it('uses updatedAt, createdAt, and ID for deterministic equal-deadline ordering', () => {
    const olderUpdate = { ...createTask('旧更新'), id: 'a', dueDate: '2026-10-14', updatedAt: '2026-10-14T08:00:00.000Z', createdAt: '2026-10-14T07:00:00.000Z' }
    const newerUpdate = { ...olderUpdate, id: 'b', title: '新更新', updatedAt: '2026-10-14T09:00:00.000Z' }
    const newestCreated = { ...olderUpdate, id: 'c', title: '新建', updatedAt: olderUpdate.updatedAt, createdAt: '2026-10-14T08:00:00.000Z' }
    expect([olderUpdate, newerUpdate, newestCreated].sort(compareTasksForBoard).map((task) => task.id)).toEqual(['b', 'c', 'a'])
  })
})
