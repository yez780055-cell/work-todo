import type { Task, TaskStatus } from './model'

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
