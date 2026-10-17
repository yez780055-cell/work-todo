import type { Task, TaskStatus } from './model'
import { getDueDateTime } from './dates'

export function compareTasksForBoard(a: Task, b: Task): number {
  if (a.important !== b.important) return a.important ? -1 : 1

  const aDeadline = getDueDateTime(a.dueDate, a.dueTime)?.getTime() ?? Number.POSITIVE_INFINITY
  const bDeadline = getDueDateTime(b.dueDate, b.dueTime)?.getTime() ?? Number.POSITIVE_INFINITY
  if (aDeadline !== bDeadline) return aDeadline - bDeadline

  return b.updatedAt.localeCompare(a.updatedAt) ||
    b.createdAt.localeCompare(a.createdAt) ||
    a.id.localeCompare(b.id)
}

export function setTaskStatus(task: Task, status: TaskStatus, now = new Date().toISOString()): Task {
  if (status === task.status) return task
  if (status === 'done') {
    return {
      ...task,
      status,
      previousStatus: task.status === 'done' ? task.previousStatus : task.status,
      completedAt: now,
      autoCompletedBySubtasks: false,
      updatedAt: now,
    }
  }
  return {
    ...task,
    status,
    completedAt: null,
    previousStatus: null,
    autoCompletedBySubtasks: false,
    updatedAt: now,
  }
}

export function setSubtaskCompletion(task: Task, subtaskId: string, done: boolean, now = new Date().toISOString()): Task {
  const subtasks = task.subtasks.map((subtask) => subtask.id === subtaskId ? { ...subtask, done } : subtask)
  if (subtasks.every((subtask) => subtask.done) && subtasks.length > 0 && task.status !== 'done') {
    return {
      ...task,
      subtasks,
      status: 'done',
      previousStatus: task.status,
      completedAt: now,
      autoCompletedBySubtasks: true,
      updatedAt: now,
    }
  }
  if (!done && task.status === 'done' && task.autoCompletedBySubtasks) {
    return {
      ...task,
      subtasks,
      status: task.previousStatus ?? 'todo',
      previousStatus: null,
      completedAt: null,
      autoCompletedBySubtasks: false,
      updatedAt: now,
    }
  }
  return { ...task, subtasks, updatedAt: now }
}
