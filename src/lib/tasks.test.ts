import { describe, expect, it } from 'vitest'
import { createTask } from './model'
import { setSubtaskCompletion, setTaskStatus } from './tasks'

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
