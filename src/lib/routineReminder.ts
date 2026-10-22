import { routineRunsOnDate } from './dates'
import type { CalendarDayType, RoutineRule, WorkspaceData } from './model'

export const ROUTINE_REMINDER_STORAGE_KEY = 'worktodo.routine-reminder-runtime.v1'
export const ROUTINE_REMINDER_FOLLOW_UP_MS = 30 * 60 * 1000

export type RoutineReminderStage = 'none' | 'first' | 'follow-up'
export interface RoutineReminderRecord { firstSentAt: string | null; followUpSentAt: string | null }
interface RoutineReminderRuntime { version: 1; entries: Record<string, RoutineReminderRecord> }
export interface RoutineReminderAlert { ruleId: string; title: string }

export function routineReminderKey(ruleId: string, date: string): string {
  return `${ruleId}:${date}`
}

export function getRoutineReminderStage(
  rule: RoutineRule,
  date: string,
  today: string,
  overrides: Record<string, CalendarDayType>,
  completed: boolean,
  record: RoutineReminderRecord | undefined,
  now: Date,
): RoutineReminderStage {
  if (date !== today || !rule.enabled || !rule.reminderTime || completed || !routineRunsOnDate(rule, date, overrides)) return 'none'
  if (record?.followUpSentAt) return 'none'
  if (record?.firstSentAt) {
    const firstSent = Date.parse(record.firstSentAt)
    return Number.isFinite(firstSent) && now.getTime() - firstSent >= ROUTINE_REMINDER_FOLLOW_UP_MS ? 'follow-up' : 'none'
  }
  const [hours, minutes] = rule.reminderTime.split(':').map(Number)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return 'none'
  return now.getHours() * 60 + now.getMinutes() >= hours * 60 + minutes ? 'first' : 'none'
}

export class RoutineReminderScheduler {
  private runtime: RoutineReminderRuntime
  private running = false

  constructor(
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'>,
    private readonly notify: (title: string, body: string) => Promise<boolean>,
  ) {
    this.runtime = this.readRuntime()
  }

  async check(workspace: WorkspaceData, now = new Date()): Promise<RoutineReminderAlert[]> {
    if (this.running) return this.getUrgentAlerts(workspace, now)
    this.running = true
    try {
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      for (const key of Object.keys(this.runtime.entries)) {
        const recordDate = key.slice(key.lastIndexOf(':') + 1)
        if (recordDate < today) delete this.runtime.entries[key]
      }
      const completed = new Set(workspace.routineCompletions.filter((item) => item.date === today).map((item) => item.ruleId))
      for (const rule of workspace.routineRules) {
        const key = routineReminderKey(rule.id, today)
        const record = this.runtime.entries[key]
        const stage = getRoutineReminderStage(rule, today, today, workspace.calendarOverrides, completed.has(rule.id), record, now)
        if (stage === 'none') continue

        const title = stage === 'first' ? '例行任务提醒' : '⚠ 再次提醒：例行任务仍未完成'
        const body = stage === 'first' ? `${rule.title} 还没有完成` : `${rule.title} 已提醒 30 分钟仍未完成`
        const sent = await this.notify(title, body)
        if (stage === 'first') {
          if (sent) this.runtime.entries[key] = { firstSentAt: now.toISOString(), followUpSentAt: null }
        } else {
          this.runtime.entries[key] = { firstSentAt: record?.firstSentAt ?? null, followUpSentAt: now.toISOString() }
        }
        this.writeRuntime()
      }
      return this.getUrgentAlerts(workspace, now)
    } finally {
      this.running = false
    }
  }

  private getUrgentAlerts(workspace: WorkspaceData, now: Date): RoutineReminderAlert[] {
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const completed = new Set(workspace.routineCompletions.filter((item) => item.date === today).map((item) => item.ruleId))
    return workspace.routineRules
      .filter((rule) => {
        const record = this.runtime.entries[routineReminderKey(rule.id, today)]
        return Boolean(record?.followUpSentAt && rule.enabled && rule.reminderTime && !completed.has(rule.id) && routineRunsOnDate(rule, today, workspace.calendarOverrides))
      })
      .map((rule) => ({ ruleId: rule.id, title: rule.title }))
  }

  private readRuntime(): RoutineReminderRuntime {
    try {
      const value = JSON.parse(this.storage.getItem(ROUTINE_REMINDER_STORAGE_KEY) ?? 'null') as Partial<RoutineReminderRuntime> | null
      if (value?.version === 1 && value.entries && typeof value.entries === 'object' && !Array.isArray(value.entries)) {
        return { version: 1, entries: value.entries }
      }
    } catch { /* Runtime reminder state is disposable; never block workspace loading. */ }
    return { version: 1, entries: {} }
  }

  private writeRuntime(): void {
    try { this.storage.setItem(ROUTINE_REMINDER_STORAGE_KEY, JSON.stringify(this.runtime)) }
    catch { /* Storage quota/privacy failures must not interrupt routine check-ins. */ }
  }
}
