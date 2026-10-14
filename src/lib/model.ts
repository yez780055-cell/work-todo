export const TASK_STATUSES = ['todo', 'doing', 'review', 'done'] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]
export type CalendarDayType = 'workday' | 'rest' | 'holiday'
export type RecurrenceType = 'daily' | 'weekdays' | 'weekly' | 'workday'

export interface Subtask {
  id: string
  title: string
  done: boolean
}

export interface Task {
  id: string
  title: string
  status: TaskStatus
  dueDate: string
  dueTime: string
  important: boolean
  note: string
  subtasks: Subtask[]
  createdAt: string
  updatedAt: string
  completedAt: string | null
  previousStatus: TaskStatus | null
  autoCompletedBySubtasks: boolean
}

export interface RoutineRule {
  id: string
  title: string
  recurrence: RecurrenceType
  weekdays: number[]
  runOnRestDays: boolean
  runOnHolidays: boolean
  enabled: boolean
  order: number
  createdAt: string
  updatedAt: string
}

export interface RoutineCompletion {
  id: string
  ruleId: string
  ruleTitle: string
  date: string
  completedAt: string
}

export interface IndexDocument {
  html: string
  updatedAt: string | null
}

export interface WorkspaceData {
  schemaVersion: 1
  tasks: Task[]
  routineRules: RoutineRule[]
  routineCompletions: RoutineCompletion[]
  calendarOverrides: Record<string, CalendarDayType>
  indexDocument: IndexDocument
}

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: '未开始',
  doing: '进行中',
  review: '待检查',
  done: '已完成',
}

export const STATUS_ORDER: TaskStatus[] = ['todo', 'doing', 'review', 'done']

export const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

export const createId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function createEmptyWorkspace(): WorkspaceData {
  return {
    schemaVersion: 1,
    tasks: [],
    routineRules: [],
    routineCompletions: [],
    calendarOverrides: {},
    indexDocument: { html: '<p><br></p>', updatedAt: null },
  }
}

export function createTask(title = '', status: TaskStatus = 'todo'): Task {
  const now = new Date().toISOString()
  return {
    id: createId(),
    title,
    status,
    dueDate: '',
    dueTime: '',
    important: false,
    note: '',
    subtasks: [],
    createdAt: now,
    updatedAt: now,
    completedAt: status === 'done' ? now : null,
    previousStatus: status === 'done' ? 'todo' : null,
    autoCompletedBySubtasks: false,
  }
}

export function createRoutineRule(order = 0): RoutineRule {
  const now = new Date().toISOString()
  return {
    id: createId(),
    title: '',
    recurrence: 'daily',
    weekdays: [0, 1, 2, 3, 4],
    runOnRestDays: true,
    runOnHolidays: true,
    enabled: true,
    order,
    createdAt: now,
    updatedAt: now,
  }
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && TASK_STATUSES.includes(value as TaskStatus)
}
