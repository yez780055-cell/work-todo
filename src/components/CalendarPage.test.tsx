import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CalendarPage } from './CalendarPage'

describe('compact work calendar', () => {
  it('starts directly with the month calendar and retains date selection controls', () => {
    const { container } = render(<CalendarPage overrides={{}} onSetDays={() => undefined} />)
    const root = container.querySelector('.calendar-page')
    expect(root?.firstElementChild?.classList.contains('calendar-panel')).toBe(true)
    expect(container.querySelector('.calendar-intro')).toBeNull()
    expect(container.querySelectorAll('.calendar-day')).toHaveLength(42)
    expect(screen.getByRole('button', { name: '上个月' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '下个月' })).toBeTruthy()
  })

  it('renders three aligned date statistic groups with separate icon, value, and unit elements', () => {
    const { container } = render(<CalendarPage overrides={{}} onSetDays={() => undefined} />)
    const items = Array.from(container.querySelectorAll('.calendar-count-item'))
    expect(items).toHaveLength(3)
    expect(items.map((item) => item.querySelector('.calendar-count-label')?.textContent)).toEqual(['工作日', '休息日', '节假日'])
    items.forEach((item) => {
      expect(item.querySelector('.calendar-count-icon')).not.toBeNull()
      expect(item.querySelector('.calendar-count-value')?.textContent).toMatch(/^\d+$/)
    })
  })
})
