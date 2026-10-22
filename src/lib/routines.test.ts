import { describe, expect, it } from 'vitest'
import type { RoutineCompletion, RoutineRule } from './model'
import { getRoutineMatrixCellState, updateRoutineCompletion } from './routines'

const dailyRule: RoutineRule = {
  id: 'daily-1', title: '每日检查', recurrence: 'daily', weekdays: [],
  runOnRestDays: true, runOnHolidays: true, enabled: true, reminderTime: null, order: 0,
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
}

const completion: RoutineCompletion = {
  id: 'done-1', ruleId: dailyRule.id, ruleTitle: dailyRule.title,
  date: '2026-10-14', completedAt: '2026-10-14T02:00:00.000Z',
}

describe('weekly routine matrix state and completion records', () => {
  it('computes daily, weekday, selected-weekday, and work-calendar applicability', () => {
    const restDays = { '2026-10-17': 'rest' as const, '2026-10-18': 'holiday' as const }
    const weekdays: RoutineRule = { ...dailyRule, recurrence: 'weekdays', runOnRestDays: false, runOnHolidays: false }
    const selectedWednesday: RoutineRule = { ...dailyRule, recurrence: 'weekly', weekdays: [2] }
    const workCalendar: RoutineRule = { ...dailyRule, recurrence: 'workday' }

    expect(getRoutineMatrixCellState(dailyRule, '2026-10-17', '2026-10-14', restDays, false)).toBe('preview')
    expect(getRoutineMatrixCellState(weekdays, '2026-10-17', '2026-10-14', restDays, false)).toBe('unavailable')
    expect(getRoutineMatrixCellState(selectedWednesday, '2026-10-14', '2026-10-14', {}, false)).toBe('actionable')
    expect(getRoutineMatrixCellState(selectedWednesday, '2026-10-15', '2026-10-14', {}, false)).toBe('unavailable')
    expect(getRoutineMatrixCellState(workCalendar, '2026-10-17', '2026-10-14', restDays, false)).toBe('unavailable')
    expect(getRoutineMatrixCellState(workCalendar, '2026-10-14', '2026-10-14', {}, false)).toBe('actionable')
  })

  it('marks applicable history as missed and keeps future dates preview-only', () => {
    expect(getRoutineMatrixCellState(dailyRule, '2026-10-13', '2026-10-14', {}, false)).toBe('missed')
    expect(getRoutineMatrixCellState(dailyRule, '2026-10-15', '2026-10-14', {}, false)).toBe('preview')
    expect(getRoutineMatrixCellState(dailyRule, '2026-10-13', '2026-10-14', {}, true)).toBe('complete')
    expect(getRoutineMatrixCellState(null, '2026-10-13', '2026-10-14', {}, false)).toBe('unavailable')
  })

  it('does not mark disabled, non-applicable, or pre-creation history as missed', () => {
    const changedRule: RoutineRule = {
      ...dailyRule,
      recurrence: 'weekly',
      weekdays: [0],
      enabled: false,
      runOnRestDays: false,
      runOnHolidays: false,
    }
    expect(getRoutineMatrixCellState(changedRule, '2026-10-13', '2026-10-14', { '2026-10-13': 'holiday' }, false)).toBe('unavailable')
    expect(getRoutineMatrixCellState(changedRule, '2026-10-13', '2026-10-14', { '2026-10-13': 'rest' }, false)).toBe('unavailable')
    expect(getRoutineMatrixCellState(changedRule, '2026-10-13', '2026-10-14', {}, false)).toBe('unavailable')
    expect(getRoutineMatrixCellState({ ...dailyRule, createdAt: '2026-10-14T00:00:00.000Z' }, '2026-10-13', '2026-10-14', {}, false)).toBe('unavailable')
    expect(getRoutineMatrixCellState(null, '2026-10-13', '2026-10-14', {}, true)).toBe('complete')
  })

  it('continues applying current rule settings to today and future dates', () => {
    const disabled = { ...dailyRule, enabled: false }
    const weekdays = { ...dailyRule, recurrence: 'weekdays' as const, runOnRestDays: false }
    expect(getRoutineMatrixCellState(disabled, '2026-10-14', '2026-10-14', {}, false)).toBe('unavailable')
    expect(getRoutineMatrixCellState(weekdays, '2026-10-17', '2026-10-14', { '2026-10-17': 'rest' }, false)).toBe('unavailable')
    expect(getRoutineMatrixCellState(dailyRule, '2026-10-15', '2026-10-14', {}, false)).toBe('preview')
  })

  it('makes the same day and rule check-in idempotent and supports undo without changing other dates', () => {
    const priorDate = { ...completion, id: 'prior', date: '2026-10-13' }
    const records = [priorDate]
    const checked = updateRoutineCompletion(records, dailyRule, '2026-10-14', true, '2026-10-14T03:00:00.000Z')
    expect(checked).toHaveLength(2)
    expect(updateRoutineCompletion(checked, dailyRule, '2026-10-14', true, '2026-10-14T04:00:00.000Z')).toEqual(checked)
    expect(updateRoutineCompletion(checked, dailyRule, '2026-10-14', false)).toEqual([priorDate])
  })

  it('deduplicates legacy records for a rule and date without altering the surviving historical record', () => {
    const duplicate = { ...completion, id: 'duplicate', completedAt: '2026-10-14T03:00:00.000Z' }
    const result = updateRoutineCompletion([completion, duplicate], dailyRule, completion.date, true)
    expect(result).toEqual([completion])
  })
})
