import { describe, expect, it } from 'vitest'
import { getCalendarMonthGrid, getLocalWeekRange, isInCurrentWeek, routineRunsOnDate, toDateKey } from './dates'
import type { RoutineRule } from './model'

const rule = (overrides: Partial<RoutineRule> = {}): RoutineRule => ({
  id: 'r1', title: '例行', recurrence: 'weekdays', weekdays: [0, 1, 2, 3, 4],
  runOnRestDays: false, runOnHolidays: true, enabled: true, order: 0,
  createdAt: '', updatedAt: '', ...overrides,
})

describe('local date behavior', () => {
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
  })
})
