import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { RoutineCompletion, RoutineRule } from '../lib/model'
import { RoutinePage, createCompletion } from './RoutinePage'

const rules: RoutineRule[] = ['Alpha', 'Bravo', 'Charlie'].map((title, order) => ({
  id: title,
  title,
  recurrence: 'daily',
  weekdays: [],
  runOnRestDays: true,
  runOnHolidays: true,
  enabled: true,
  order,
  createdAt: '',
  updatedAt: '',
}))

function Harness() {
  const [completions, setCompletions] = useState<RoutineCompletion[]>([])
  const dateKey = '2026-10-14'
  return <RoutinePage
    rules={rules}
    completions={completions}
    dateKey={dateKey}
    calendarOverrides={{}}
    onToggleCompletion={(rule, done) => setCompletions((current) => done
      ? [...current.filter((item) => item.ruleId !== rule.id || item.date !== dateKey), createCompletion(rule, dateKey)]
      : current.filter((item) => item.ruleId !== rule.id || item.date !== dateKey))}
    onSaveRule={() => undefined}
    onDeleteRule={() => undefined}
    onToggleRule={() => undefined}
  />
}

describe('today routine checklist', () => {
  it('keeps completed rows visible at the bottom until every due routine is done, then collapses and can reopen', () => {
    const { container } = render(<Harness />)
    const getRows = () => Array.from(container.querySelectorAll('.routine-row-title')).map((node) => node.textContent)
    const clickTask = (title: string) => {
      const row = Array.from(container.querySelectorAll('.routine-row')).find((node) => node.querySelector('.routine-row-title')?.textContent === title)
      const checkbox = row?.querySelector('input[type="checkbox"]')
      if (!checkbox) throw new Error(`No checkbox found for ${title}`)
      fireEvent.click(checkbox)
    }

    clickTask('Alpha')
    expect(getRows()).toEqual(['Bravo', 'Charlie', 'Alpha'])

    clickTask('Bravo')
    expect(getRows()).toEqual(['Charlie', 'Alpha', 'Bravo'])

    clickTask('Charlie')
    expect(getRows()).toEqual([])
    expect(screen.getByRole('button', { name: /已完成 3\/3/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /已完成 3\/3/ }))
    expect(getRows()).toEqual(['Alpha', 'Bravo', 'Charlie'])

    clickTask('Bravo')
    expect(getRows()).toEqual(['Bravo', 'Alpha', 'Charlie'])
    expect(screen.getByText('还剩 1 项')).toBeTruthy()
  })
})
