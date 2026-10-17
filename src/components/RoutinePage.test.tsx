import { useState } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateRoutineCompletion } from '../lib/routines'
import type { CalendarDayType, RoutineCompletion, RoutineRule } from '../lib/model'
import { RoutinePage } from './RoutinePage'

const dateKey = '2026-10-14'

function makeRule(title: string, order: number, overrides: Partial<RoutineRule> = {}): RoutineRule {
  return {
    id: title.toLowerCase().replaceAll(' ', '-'), title, recurrence: 'daily', weekdays: [],
    runOnRestDays: true, runOnHolidays: true, enabled: true, order,
    createdAt: `2026-10-01T00:0${order}:00.000Z`, updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

function Harness({
  initialRules = [makeRule('Alpha', 0)],
  initialCompletions = [],
  initialOverrides = {},
}: {
  initialRules?: RoutineRule[]
  initialCompletions?: RoutineCompletion[]
  initialOverrides?: Record<string, CalendarDayType>
}) {
  const [rules, setRules] = useState(initialRules)
  const [completions, setCompletions] = useState(initialCompletions)
  return <RoutinePage
    rules={rules}
    completions={completions}
    dateKey={dateKey}
    calendarOverrides={initialOverrides}
    onToggleCompletion={(rule, done) => setCompletions((current) => updateRoutineCompletion(current, rule, dateKey, done))}
    onSaveRule={(rule) => setRules((current) => current.some((item) => item.id === rule.id) ? current.map((item) => item.id === rule.id ? rule : item) : [...current, rule])}
    onDeleteRule={(rule) => setRules((current) => current.filter((item) => item.id !== rule.id))}
    onToggleRule={(rule) => setRules((current) => current.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item))}
  />
}

describe('weekly routine check-in matrix', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('shows an aligned Monday-to-Sunday matrix and keeps today checked until explicitly undone', () => {
    const { container } = render(<Harness />)
    expect(screen.getByRole('heading', { name: '例行任务' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '2026年10月12日–10月18日' })).toBeTruthy()
    expect(container.querySelectorAll('.routine-week-matrix thead th')).toHaveLength(8)
    expect(screen.getByLabelText('今日完成 0/1')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '标记完成：Alpha，10月14日' }))
    expect(screen.getByRole('button', { name: '撤销打卡：Alpha，10月14日' })).toBeTruthy()
    expect(screen.getByLabelText('今日完成 1/1')).toBeTruthy()
    expect(screen.getByRole('row', { name: /Alpha/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '撤销打卡：Alpha，10月14日' }))
    expect(screen.getByRole('button', { name: '标记完成：Alpha，10月14日' })).toBeTruthy()
    expect(screen.getByLabelText('今日完成 0/1')).toBeTruthy()
  })

  it('uses an in-app rule deletion confirmation and preserves completed history', async () => {
    const rule = makeRule('Alpha', 0)
    const completion: RoutineCompletion = {
      id: 'completion-alpha',
      ruleId: rule.id,
      ruleTitle: rule.title,
      date: dateKey,
      completedAt: '2026-10-14T09:00:00.000Z',
    }
    render(<Harness initialRules={[rule]} initialCompletions={[completion]} />)
    fireEvent.click(screen.getByRole('button', { name: '规则管理' }))
    fireEvent.click(screen.getByRole('button', { name: '删除规则：Alpha' }))

    const confirmation = await screen.findByRole('alertdialog', { name: '删除例行规则？' })
    expect(confirmation.textContent).toContain('已保存的完成记录会保留')
    fireEvent.click(within(confirmation).getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('alertdialog', { name: '删除例行规则？' })).toBeNull()
    expect(screen.getByRole('button', { name: '删除规则：Alpha' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '删除规则：Alpha' }))
    const secondConfirmation = await screen.findByRole('alertdialog', { name: '删除例行规则？' })
    fireEvent.click(within(secondConfirmation).getByRole('button', { name: '删除规则' }))
    expect(await screen.findByText('已删除规则 · 历史记录')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '删除规则：Alpha' })).toBeNull()
  })

  it('shows past unrecorded dates as unknown and future dates as noninteractive previews', () => {
    render(<Harness />)
    expect(screen.getByLabelText('无记录：Alpha，10月13日').textContent).toBe('?')
    expect(screen.getByLabelText('未来预览：Alpha，10月15日').tagName).toBe('SPAN')
    expect(screen.getByLabelText('未来预览：Alpha，10月18日').tagName).toBe('SPAN')
    expect(screen.getByText('历史日期仅显示已保存记录；未知日期不会推测为漏打卡。')).toBeTruthy()
  })

  it('uses existing repeat rules and calendar overrides for each date cell', () => {
    const rules = [
      makeRule('Daily Rest', 0, { runOnRestDays: true }),
      makeRule('Weekdays', 1, { recurrence: 'weekdays', runOnRestDays: false }),
      makeRule('Wednesday', 2, { recurrence: 'weekly', weekdays: [2] }),
      makeRule('Workday', 3, { recurrence: 'workday' }),
    ]
    render(<Harness initialRules={rules} initialOverrides={{ '2026-10-17': 'rest' }} />)
    expect(screen.getByRole('button', { name: '标记完成：Wednesday，10月14日' })).toBeTruthy()
    expect(screen.getByLabelText('不适用：Weekdays，10月17日')).toBeTruthy()
    expect(screen.getByLabelText('不适用：Workday，10月17日')).toBeTruthy()
    expect(screen.getByLabelText('未来预览：Daily Rest，10月17日')).toBeTruthy()
  })

  it('navigates weeks and returns to the local current week', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '上一周' }))
    expect(screen.getByRole('heading', { name: '2026年10月5日–10月11日' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '下一周' }))
    expect(screen.getByRole('heading', { name: '2026年10月12日–10月18日' })).toBeTruthy()
    expect((screen.getByRole('button', { name: '本周' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('keeps completed history visible after a rule is deleted', async () => {
    const archivedRecord: RoutineCompletion = {
      id: 'old-check-in', ruleId: 'alpha', ruleTitle: 'Alpha', date: '2026-10-13', completedAt: '2026-10-13T04:30:00.000Z',
    }
    const nativeConfirm = vi.spyOn(window, 'confirm')
    render(<Harness initialCompletions={[archivedRecord]} />)
    expect(screen.getByLabelText('已完成：Alpha，10月13日')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '规则管理' }))
    const manager = screen.getByRole('dialog', { name: '规则管理' })
    fireEvent.click(within(manager).getByRole('button', { name: '删除规则：Alpha' }))
    const confirmation = await screen.findByRole('alertdialog', { name: '删除例行规则？' })
    fireEvent.click(within(confirmation).getByRole('button', { name: '删除规则' }))
    await waitFor(() => expect(screen.getByText('已删除规则 · 历史记录')).toBeTruthy())
    expect(screen.getByLabelText('已完成：Alpha，10月13日').getAttribute('title')).toContain('规则已删除')
    expect(nativeConfirm).not.toHaveBeenCalled()
  })
})
