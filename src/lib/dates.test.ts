import { describe, expect, it } from 'vitest'
import { dateFromKey, getCalendarDayDistance, getCalendarMonthGrid, getLocalWeekRange, getTaskDeadlineDisplay, getWeekDateKeys, getWeekStartKey, isInCurrentWeek, routineRunsOnDate, shiftDateKey, toDateKey } from './dates'
import type { RoutineRule } from './model'

const rule = (overrides: Partial<RoutineRule> = {}): RoutineRule => ({
  id: 'r1', title: '例行', recurrence: 'weekdays', weekdays: [0, 1, 2, 3, 4],
  runOnRestDays: false, runOnHolidays: true, enabled: true, order: 0,
  createdAt: '', updatedAt: '', ...overrides,
})

describe('local date behavior', () => {
  it('formats same-day deadlines as a nonnegative live countdown and marks elapsed deadlines overdue', () => {
    const now = new Date(2026, 9, 16, 10, 0, 0)
    expect(getTaskDeadlineDisplay('2026-10-16', '12:00', now)).toEqual({ text: '02:00:00', tone: 'today' })
    expect(getTaskDeadlineDisplay('2026-10-16', '09:59', now)).toEqual({ text: '已逾期', tone: 'overdue' })
    expect(getTaskDeadlineDisplay('2026-10-16', '10:00', now)).toEqual({ text: '已逾期', tone: 'overdue' })
  })

  it('uses local end-of-day semantics for date-only deadlines', () => {
    const now = new Date(2026, 9, 16, 23, 59, 58)
    expect(getTaskDeadlineDisplay('2026-10-16', '', now)).toEqual({ text: '00:00:02', tone: 'today' })
  })

  it('classifies tomorrow, the third calendar day, and later dates with distinct tones', () => {
    const now = new Date(2026, 9, 16, 12, 0, 0)
    expect(getTaskDeadlineDisplay('2026-10-17', '12:00', now)).toEqual({ text: '1天 0小时', tone: 'near' })
    expect(getTaskDeadlineDisplay('2026-10-19', '12:00', now)).toEqual({ text: '3天 0小时', tone: 'near' })
    expect(getTaskDeadlineDisplay('2026-10-20', '12:00', now)).toEqual({ text: '4天 0小时', tone: 'far' })
  })

  it('classifies by local calendar dates across midnight and day-length changes', () => {
    const lateNight = new Date(2026, 9, 16, 23, 59, 0)
    expect(getTaskDeadlineDisplay('2026-10-17', '00:00', lateNight).tone).toBe('near')
    const beforeDaylightChange = toDateKey(new Date(2026, 2, 7, 23, 0))
    const afterDaylightChange = toDateKey(new Date(2026, 2, 8, 1, 0))
    expect(getCalendarDayDistance(beforeDaylightChange, afterDaylightChange)).toBe(1)
  })

  it('uses Monday 00:00 through the next Monday as the current week', () => {
    const sunday = new Date(2026, 9, 18, 23, 59)
    const monday = new Date(2026, 9, 19, 0, 0)
    expect(toDateKey(getLocalWeekRange(sunday).start)).toBe('2026-10-12')
    expect(isInCurrentWeek(new Date(2026, 9, 18, 23, 59).toISOString(), sunday)).toBe(true)
    expect(isInCurrentWeek(monday.toISOString(), sunday)).toBe(false)
  })

  it('matches the recurrence before considering the calendar day type', () => {
    expect(routineRunsOnDate(rule(), '2026-10-17', { '2026-10-17': 'rest' })).toBe(false)
    expect(routineRunsOnDate(rule({ runOnRestDays: true }), '2026-10-17', { '2026-10-17': 'rest' })).toBe(false)
    expect(routineRunsOnDate(rule({ recurrence: 'daily' }), '2026-10-17', { '2026-10-17': 'rest' })).toBe(false)
    expect(routineRunsOnDate(rule({ recurrence: 'daily', runOnRestDays: true }), '2026-10-17', { '2026-10-17': 'rest' })).toBe(true)
  })

  it('shows workday rules only on workday calendar dates', () => {
    const workdayRule = rule({ recurrence: 'workday' })
    expect(routineRunsOnDate(workdayRule, '2026-10-17', {})).toBe(true)
    expect(routineRunsOnDate(workdayRule, '2026-10-17', { '2026-10-17': 'holiday' })).toBe(false)
  })

  it('generates a complete six-week local calendar grid', () => {
    const grid = getCalendarMonthGrid(2026, 9)
    expect(grid).toHaveLength(42)
    expect(grid[0]).toBe('2026-09-28')
    expect(grid[7]).toBe('2026-10-05')
    expect(grid[41]).toBe('2026-11-08')
    for (let index = 1; index < grid.length; index += 1) {
      const nextDate = dateFromKey(grid[index - 1])
      nextDate.setDate(nextDate.getDate() + 1)
      expect(grid[index]).toBe(toDateKey(nextDate))
    }
    expect(getCalendarMonthGrid(2024, 1)).toContain('2024-02-29')
  })

  it('builds Monday-to-Sunday local weeks across month/year and DST boundaries', () => {
    expect(getWeekStartKey('2026-01-01')).toBe('2025-12-29')
    expect(getWeekDateKeys('2026-01-01')).toEqual([
      '2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04',
    ])
    const springWeek = getWeekDateKeys('2026-03-08')
    expect(springWeek).toEqual(['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08'])
    expect(shiftDateKey('2026-03-08', 1)).toBe('2026-03-09')
  })
})
