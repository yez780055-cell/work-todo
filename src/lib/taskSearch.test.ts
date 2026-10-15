import { describe, expect, it } from 'vitest'
import { createTask } from './model'
import { RECENT_TASK_RESULT_LIMIT, searchTasks } from './taskSearch'

describe('task search', () => {
  it('matches trimmed, case-insensitive queries in titles, notes, and subtasks', () => {
    const title = { ...createTask('Quarterly Planning'), id: 'title', updatedAt: '2026-10-12T00:00:00.000Z' }
    const note = { ...createTask('Review'), id: 'note', note: 'Budget Forecast', updatedAt: '2026-10-13T00:00:00.000Z' }
    const subtask = { ...createTask('Launch'), id: 'subtask', subtasks: [{ id: 's1', title: 'Notify Vendors', done: false }], updatedAt: '2026-10-14T00:00:00.000Z' }

    expect(searchTasks([title, note, subtask], '  bUdGeT ').items.map((task) => task.id)).toEqual(['note'])
    expect(searchTasks([title, note, subtask], 'quarterly').items.map((task) => task.id)).toEqual(['title'])
    expect(searchTasks([title, note, subtask], 'vendors').items.map((task) => task.id)).toEqual(['subtask'])
    expect(searchTasks([{ ...title, title: '整理客户回访记录' }], '客户回访').items).toHaveLength(1)
  })

  it('includes completed tasks and caps rendered results while reporting the total', () => {
    const tasks = Array.from({ length: 60 }, (_, index) => ({
      ...createTask(`Project item ${index}`, index === 59 ? 'done' : 'todo'),
      id: `task-${index}`,
      updatedAt: new Date(2026, 0, index + 1).toISOString(),
      completedAt: index === 59 ? '2026-01-31T00:00:00.000Z' : null,
    }))

    const results = searchTasks(tasks, 'project item')
    expect(results.total).toBe(60)
    expect(results.items).toHaveLength(50)
    expect(results.items.some((task) => task.status === 'done')).toBe(true)
  })

  it('shows a short recent list for an empty query', () => {
    const tasks = Array.from({ length: 12 }, (_, index) => ({
      ...createTask(`Task ${index}`),
      id: `task-${index}`,
      updatedAt: new Date(2026, 0, index + 1).toISOString(),
    }))

    const results = searchTasks(tasks, '   ')
    expect(results.isRecent).toBe(true)
    expect(results.total).toBe(12)
    expect(results.items).toHaveLength(RECENT_TASK_RESULT_LIMIT)
    expect(results.items[0].id).toBe('task-11')
  })
})
