import type { CalendarDayType, RecurrenceType, RoutineRule } from './model'

export const pad2 = (value: number) => String(value).padStart(2, '0')

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function dateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day, 12, 0, 0, 0)
}

export function getLocalWeekRange(reference: Date): { start: Date; end: Date } {
  const start = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate())
  const mondayOffset = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - mondayOffset)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return { start, end }
}

export function isInCurrentWeek(timestamp: string | null, now = new Date()): boolean {
  if (!timestamp) return false
  const value = new Date(timestamp)
  if (Number.isNaN(value.getTime())) return false
  const { start, end } = getLocalWeekRange(now)
  return value >= start && value < end
}

export function getCalendarDayType(
  dateKey: string,
  overrides: Record<string, CalendarDayType>,
): CalendarDayType {
  return overrides[dateKey] ?? 'workday'
}

export function getWeekdayIndex(dateKey: string): number {
  return (dateFromKey(dateKey).getDay() + 6) % 7
}

export function recurrenceMatches(rule: Pick<RoutineRule, 'recurrence' | 'weekdays'>, dateKey: string): boolean {
  const weekday = getWeekdayIndex(dateKey)
  switch (rule.recurrence as RecurrenceType) {
    case 'daily':
    case 'workday':
      return true
    case 'weekdays':
      return weekday < 5
    case 'weekly':
      return rule.weekdays.includes(weekday)
  }
}

export function routineRunsOnDate(
  rule: RoutineRule,
  dateKey: string,
  overrides: Record<string, CalendarDayType>,
): boolean {
  if (!rule.enabled || !recurrenceMatches(rule, dateKey)) return false
  const dayType = getCalendarDayType(dateKey, overrides)
  if (rule.recurrence === 'workday') return dayType === 'workday'
  if (dayType === 'rest') return rule.runOnRestDays
  if (dayType === 'holiday') return rule.runOnHolidays
  return true
}

export function getDueDateTime(dueDate: string, dueTime: string): Date | null {
  if (!dueDate) return null
  const date = dateFromKey(dueDate)
  if (dueTime) {
    const [hours, minutes] = dueTime.split(':').map(Number)
    date.setHours(hours, minutes, 0, 0)
  } else {
    date.setHours(23, 59, 59, 999)
  }
  return date
}

export function formatDateLabel(dateKey: string, now = new Date()): string {
  if (!dateKey) return ''
  const date = dateFromKey(dateKey)
  const today = toDateKey(now)
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  if (dateKey === today) return '今天'
  if (dateKey === toDateKey(tomorrow)) return '明天'
  const days = Math.round((date.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000)
  if (days > 0 && days <= 7) return `${days} 天后`
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function formatCountdown(dueDate: string, dueTime: string, now = new Date()): string {
  const target = getDueDateTime(dueDate, dueTime)
  if (!target) return ''
  const delta = target.getTime() - now.getTime()
  const totalMinutes = Math.ceil(Math.abs(delta) / 60_000)
  const days = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const minutes = totalMinutes % 60
  const span = days > 0 ? `${days} 天 ${hours} 小时` : hours > 0 ? `${hours} 小时 ${minutes} 分钟` : `${Math.max(1, minutes)} 分钟`
  return delta < 0 ? `逾期 ${span}` : `${span}后截止`
}

export function getCalendarMonthGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - offset)
  const cellCount = 42
  return Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return toDateKey(date)
  })
}

export function getMonthLabel(year: number, month: number): string {
  return `${year}年${month + 1}月`
}

export function isSameMonth(dateKey: string, year: number, month: number): boolean {
  const date = dateFromKey(dateKey)
  return date.getFullYear() === year && date.getMonth() === month
}
