import type { Task } from './model'

export const TASK_SEARCH_RESULT_LIMIT = 50
export const RECENT_TASK_RESULT_LIMIT = 8

export interface TaskSearchResults {
  items: Task[]
  total: number
  isRecent: boolean
}

export function searchTasks(tasks: Task[], query: string, resultLimit = TASK_SEARCH_RESULT_LIMIT): TaskSearchResults {
  const term = query.trim().toLocaleLowerCase()
  const limit = Math.max(0, Math.floor(resultLimit))
  const orderedTasks = [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  if (!term) {
    return {
      items: orderedTasks.slice(0, Math.min(limit, RECENT_TASK_RESULT_LIMIT)),
      total: tasks.length,
      isRecent: true,
    }
  }

  const matches = orderedTasks.filter((task) => [task.title, task.note, ...task.subtasks.map((subtask) => subtask.title)]
    .some((field) => field.toLocaleLowerCase().includes(term)))

  return { items: matches.slice(0, limit), total: matches.length, isRecent: false }
}
