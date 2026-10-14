import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, BriefcaseBusiness, CalendarDays, Circle, RotateCcw, Sun, Umbrella } from 'lucide-react'
import { dateFromKey, getCalendarMonthGrid, getCalendarDayType, getMonthLabel, isSameMonth, toDateKey } from '../lib/dates'
import { WEEKDAY_LABELS, type CalendarDayType } from '../lib/model'

const TYPE_LABELS: Record<CalendarDayType, string> = { workday: '工作日', rest: '休息日', holiday: '节假日' }

export function CalendarPage({ overrides, onSetDays }: {
  overrides: Record<string, CalendarDayType>
  onSetDays: (days: string[], type: CalendarDayType | null) => void
}) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selected, setSelected] = useState<string[]>([])
  const [anchor, setAnchor] = useState<string | null>(null)
  const grid = useMemo(() => getCalendarMonthGrid(year, month), [year, month])
  const currentKey = toDateKey(today)
  const monthOverrides = Object.keys(overrides).filter((key) => isSameMonth(key, year, month) && overrides[key] !== 'workday')
  const counts = grid.filter((key) => isSameMonth(key, year, month)).reduce((acc, key) => { acc[getCalendarDayType(key, overrides)] += 1; return acc }, { workday: 0, rest: 0, holiday: 0 })

  const moveMonth = (step: number) => {
    const next = new Date(year, month + step, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth())
    setSelected([])
    setAnchor(null)
  }

  const chooseDate = (dateKey: string, event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.shiftKey && anchor) {
      const start = grid.indexOf(anchor)
      const end = grid.indexOf(dateKey)
      if (start >= 0 && end >= 0) {
        const low = Math.min(start, end)
        const high = Math.max(start, end)
        setSelected(grid.slice(low, high + 1))
      } else setSelected([dateKey])
    } else if (event.metaKey || event.ctrlKey) {
      setSelected((current) => current.includes(dateKey) ? current.filter((key) => key !== dateKey) : [...current, dateKey])
      setAnchor(dateKey)
    } else if (selected.length > 1 && selected.includes(dateKey)) {
      setSelected((current) => current.filter((key) => key !== dateKey))
      setAnchor(dateKey)
    } else {
      setSelected([dateKey])
      setAnchor(dateKey)
    }
  }

  const apply = (type: CalendarDayType | null) => {
    if (selected.length === 0) return
    onSetDays(selected, type)
    setSelected([])
    setAnchor(null)
  }

  return (
    <div className="calendar-page">
      <section className="calendar-panel">
        <header className="calendar-header">
          <div className="calendar-month-nav"><button className="icon-button" onClick={() => moveMonth(-1)} aria-label="上个月"><ArrowLeft size={17} /></button><h3>{getMonthLabel(year, month)}</h3><button className="icon-button" onClick={() => moveMonth(1)} aria-label="下个月"><ArrowRight size={17} /></button><input className="month-picker" type="month" value={`${year}-${String(month + 1).padStart(2, '0')}`} onChange={(event) => { if (!event.target.value) return; const [y, m] = event.target.value.split('-').map(Number); setYear(y); setMonth(m - 1); setSelected([]); setAnchor(null) }} aria-label="选择月份" /></div>
          <div className="calendar-counts"><span><BriefcaseBusiness size={14} />{counts.workday} 工作日</span><span><Umbrella size={14} />{counts.rest} 休息日</span><span><Sun size={14} />{counts.holiday} 节假日</span></div>
        </header>
        {selected.length > 0 && <div className="calendar-bulk-toolbar"><div><span className="selected-count">{selected.length}</span><span>已选日期</span><small>Shift 连选 · Ctrl / ⌘ 多选</small></div><div className="bulk-actions"><button className="bulk-type bulk-work" onClick={() => apply('workday')}><BriefcaseBusiness size={14} />工作日</button><button className="bulk-type bulk-rest" onClick={() => apply('rest')}><Umbrella size={14} />休息日</button><button className="bulk-type bulk-holiday" onClick={() => apply('holiday')}><Sun size={14} />节假日</button><button className="bulk-clear" onClick={() => apply(null)}><RotateCcw size={14} />恢复默认</button></div></div>}
        <div className="calendar-grid calendar-weekdays">{WEEKDAY_LABELS.map((day) => <div key={day}>{day}</div>)}</div>
        <div className="calendar-grid calendar-days">
          {grid.map((dateKey) => {
            const date = dateFromKey(dateKey)
            const dayType = getCalendarDayType(dateKey, overrides)
            const isSelected = selected.includes(dateKey)
            const hasOverride = Boolean(overrides[dateKey] && overrides[dateKey] !== 'workday')
            return <button
              type="button"
              key={dateKey}
              className={`calendar-day calendar-day-${dayType} ${!isSameMonth(dateKey, year, month) ? 'calendar-day-outside' : ''} ${dateKey === currentKey ? 'calendar-day-today' : ''} ${isSelected ? 'calendar-day-selected' : ''}`}
              onClick={(event) => chooseDate(dateKey, event)}
              aria-pressed={isSelected}
              aria-label={`${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日，${TYPE_LABELS[dayType]}${isSelected ? '，已选择' : ''}`}
            >
              <span className="calendar-day-number">{date.getDate()}</span>
              {hasOverride && <span className={`calendar-type-label type-label-${dayType}`}>{TYPE_LABELS[dayType]}</span>}
              {dateKey === currentKey && <span className="today-label">今天</span>}
              <span className="day-state-dot"><Circle size={7} fill="currentColor" /></span>
            </button>
          })}
        </div>
        <footer className="calendar-footer"><span><CalendarDays size={15} />本月已设置 {monthOverrides.length} 天</span><span>点击日期选择；按住 Shift 或 Ctrl / ⌘ 可批量选择</span></footer>
      </section>
    </div>
  )
}
