import { describe, expect, it, vi } from 'vitest'
import { createEmptyWorkspace, type RoutineRule } from './model'
import { getRoutineReminderStage, ROUTINE_REMINDER_FOLLOW_UP_MS, RoutineReminderScheduler } from './routineReminder'

const rule: RoutineRule = {
  id: 'morning', title: '晨间检查', recurrence: 'daily', weekdays: [], runOnRestDays: true,
  runOnHolidays: true, enabled: true, reminderTime: '09:00', order: 0,
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
}
const overrides = {}
const at = (hour: number, minute: number) => new Date(2026, 9, 20, hour, minute)

describe('routine reminder schedule', () => {
  it('waits until reminder time, then schedules exactly one follow-up 30 minutes after first send', () => {
    const firstSentAt = at(9, 0).toISOString()
    expect(getRoutineReminderStage(rule, '2026-10-20', '2026-10-20', overrides, false, undefined, at(8, 59))).toBe('none')
    expect(getRoutineReminderStage(rule, '2026-10-20', '2026-10-20', overrides, false, undefined, at(9, 0))).toBe('first')
    expect(getRoutineReminderStage(rule, '2026-10-20', '2026-10-20', overrides, false, { firstSentAt, followUpSentAt: null }, new Date(new Date(firstSentAt).getTime() + ROUTINE_REMINDER_FOLLOW_UP_MS - 1))).toBe('none')
    expect(getRoutineReminderStage(rule, '2026-10-20', '2026-10-20', overrides, false, { firstSentAt, followUpSentAt: null }, new Date(new Date(firstSentAt).getTime() + ROUTINE_REMINDER_FOLLOW_UP_MS))).toBe('follow-up')
    expect(getRoutineReminderStage(rule, '2026-10-20', '2026-10-20', overrides, false, { firstSentAt, followUpSentAt: at(9, 30).toISOString() }, at(10, 0))).toBe('none')
  })

  it('does not remind when completed, disabled, unconfigured, inapplicable, or on another date', () => {
    expect(getRoutineReminderStage(rule, '2026-10-20', '2026-10-20', overrides, true, undefined, at(10, 0))).toBe('none')
    expect(getRoutineReminderStage({ ...rule, enabled: false }, '2026-10-20', '2026-10-20', overrides, false, undefined, at(10, 0))).toBe('none')
    expect(getRoutineReminderStage({ ...rule, reminderTime: null }, '2026-10-20', '2026-10-20', overrides, false, undefined, at(10, 0))).toBe('none')
    expect(getRoutineReminderStage({ ...rule, recurrence: 'weekly', weekdays: [0] }, '2026-10-20', '2026-10-20', overrides, false, undefined, at(10, 0))).toBe('none')
    expect(getRoutineReminderStage(rule, '2026-10-19', '2026-10-20', overrides, false, undefined, at(10, 0))).toBe('none')
  })

  it('sends first and follow-up once per rule/day and clears the in-app alert after check-in', async () => {
    const memory = new Map<string, string>()
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
    const notify = vi.fn(async () => true)
    const scheduler = new RoutineReminderScheduler(storage, notify)
    const workspace = { ...createEmptyWorkspace(), routineRules: [rule] }

    expect(await scheduler.check(workspace, at(9, 0))).toEqual([])
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenLastCalledWith('例行任务提醒', '晨间检查 还没有完成')
    await scheduler.check(workspace, at(9, 29))
    expect(notify).toHaveBeenCalledTimes(1)
    const alerts = await scheduler.check(workspace, at(9, 30))
    expect(notify).toHaveBeenCalledTimes(2)
    expect(notify).toHaveBeenLastCalledWith('⚠ 再次提醒：例行任务仍未完成', '晨间检查 已提醒 30 分钟仍未完成')
    expect(alerts).toEqual([{ ruleId: 'morning', title: '晨间检查' }])
    await scheduler.check(workspace, at(10, 0))
    expect(notify).toHaveBeenCalledTimes(2)
    expect(await scheduler.check({ ...workspace, routineCompletions: [{ id: 'c1', ruleId: rule.id, ruleTitle: rule.title, date: '2026-10-20', completedAt: at(10, 1).toISOString() }] }, at(10, 1))).toEqual([])
  })

  it('keeps each date independent and stores runtime state outside workspace backup data', async () => {
    const memory = new Map<string, string>()
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value) } }
    const scheduler = new RoutineReminderScheduler(storage, async () => true)
    const workspace = { ...createEmptyWorkspace(), routineRules: [rule] }
    await scheduler.check(workspace, at(9, 0))
    const nextDate = new Date(2026, 9, 21, 9, 0)
    await scheduler.check(workspace, nextDate)
    const runtime = JSON.parse(memory.values().next().value as string)
    expect(Object.keys(runtime.entries)).toContain('morning:2026-10-21')
    expect(Object.keys(runtime.entries)).not.toContain('morning:2026-10-20')
    expect(workspace).not.toHaveProperty('routineReminderRuntime')
  })
})
