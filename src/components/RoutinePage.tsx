import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, ChevronRight, Clock3, ListChecks, Plus, Settings2, Trash2 } from 'lucide-react'
import { routineRunsOnDate } from '../lib/dates'
import { createId, createRoutineRule, WEEKDAY_LABELS, type CalendarDayType, type RecurrenceType, type RoutineCompletion, type RoutineRule } from '../lib/model'
import { Button, EmptyState, Modal } from './common'

const RECURRENCE_LABELS: Record<RecurrenceType, string> = {
  daily: '每天',
  weekdays: '周一至周五',
  weekly: '每周指定星期',
  workday: '每个工作日',
}

export function RoutinePage({
  rules, completions, dateKey, calendarOverrides, onToggleCompletion, onSaveRule, onDeleteRule, onToggleRule,
}: {
  rules: RoutineRule[]
  completions: RoutineCompletion[]
  dateKey: string
  calendarOverrides: Record<string, CalendarDayType>
  onToggleCompletion: (rule: RoutineRule, done: boolean) => void
  onSaveRule: (rule: RoutineRule) => void
  onDeleteRule: (rule: RoutineRule) => void
  onToggleRule: (rule: RoutineRule) => void
}) {
  const [managerOpen, setManagerOpen] = useState(false)
  const [editorRule, setEditorRule] = useState<RoutineRule | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const expected = useMemo(() => rules
    .filter((rule) => routineRunsOnDate(rule, dateKey, calendarOverrides))
    .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)), [rules, dateKey, calendarOverrides])
  const doneIds = new Set(completions.filter((item) => item.date === dateKey).map((item) => item.ruleId))
  const doneCount = expected.filter((rule) => doneIds.has(rule.id)).length
  const allDone = expected.length > 0 && doneCount === expected.length
  useEffect(() => { if (!allDone) setShowCompleted(false) }, [allDone])
  const visibleRules = expected.filter((rule) => !allDone || showCompleted || !doneIds.has(rule.id))
    .sort((a, b) => Number(doneIds.has(a.id)) - Number(doneIds.has(b.id)) || a.order - b.order)

  const today = new Date()
  const displayDate = today.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })

  return (
    <div className="routine-page">
      <div className="routine-intro">
        <div><span className="eyebrow">DAILY RHYTHM</span><h2>把固定的小事，轻轻做完。</h2><p>只显示今天按规则需要执行的事项，明天会重新开始。</p></div>
        <div className="today-date"><CalendarDays size={16} /><span>{displayDate}</span></div>
      </div>
      <section className="routine-panel">
        <header className="routine-panel-header">
          <div><div className="panel-title"><span className="panel-icon"><ListChecks size={18} /></span><h3>今日例行任务</h3></div>
            <p>{expected.length === 0 ? '按你的日历和重复规则计算' : allDone ? '今天的固定事项已经完成' : `还剩 ${expected.length - doneCount} 项`}</p>
          </div>
          <div className="routine-header-actions">
            {allDone && <button className={`completed-summary ${showCompleted ? 'summary-open' : ''}`} onClick={() => setShowCompleted((value) => !value)} aria-expanded={showCompleted}><span className="summary-check"><Check size={14} /></span>已完成 {doneCount}/{expected.length}<ChevronRight className={showCompleted ? 'chevron-open' : ''} size={15} /></button>}
            <Button onClick={() => setManagerOpen(true)} icon={<Settings2 size={16} />}>规则管理</Button>
          </div>
        </header>
        {expected.length === 0 ? (
          <EmptyState icon={<Clock3 size={22} />} title="今天没有例行任务" detail="新建规则后，它会按照工作日历出现在这里。" />
        ) : visibleRules.length === 0 ? (
          null
        ) : (
          <div className="routine-list">
            {!allDone && doneCount > 0 && <div className="routine-divider"><span>已完成 · {doneCount}</span></div>}
            {visibleRules.map((rule) => {
              const done = doneIds.has(rule.id)
              return (
                <label className={`routine-row ${done ? 'routine-row-done' : ''}`} key={rule.id}>
                  <input type="checkbox" checked={done} onChange={(event) => onToggleCompletion(rule, event.target.checked)} />
                  <span className="routine-check"><Check size={15} /></span>
                  <span className="routine-row-title">{rule.title}</span>
                  <span className="routine-row-rule">{RECURRENCE_LABELS[rule.recurrence]}</span>
                </label>
              )
            })}
          </div>
        )}
      </section>
      {managerOpen && <RoutineManager
        rules={rules}
        onClose={() => { setManagerOpen(false); setEditorRule(null) }}
        onAdd={() => setEditorRule(createRoutineRule(rules.length))}
        onEdit={setEditorRule}
        onDelete={onDeleteRule}
        onToggle={onToggleRule}
      />}
      {editorRule && <RoutineRuleEditor
        rule={editorRule}
        onClose={() => setEditorRule(null)}
        onSave={(rule) => { onSaveRule(rule); setEditorRule(null) }}
      />}
    </div>
  )
}

function RoutineManager({ rules, onClose, onAdd, onEdit, onDelete, onToggle }: {
  rules: RoutineRule[]
  onClose: () => void
  onAdd: () => void
  onEdit: (rule: RoutineRule) => void
  onDelete: (rule: RoutineRule) => void
  onToggle: (rule: RoutineRule) => void
}) {
  const ordered = [...rules].sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt))
  return (
    <Modal title="规则管理" subtitle="调整重复方式和执行日期；完成记录会继续保留。" onClose={onClose} wide>
      <div className="manager-list">
        {ordered.length === 0 ? <EmptyState icon={<Settings2 size={22} />} title="还没有规则" detail="添加一条你想每天或每周重复的工作事项。" /> : ordered.map((rule) => (
          <article className={`manager-rule ${rule.enabled ? '' : 'manager-rule-disabled'}`} key={rule.id}>
            <div className="manager-rule-info"><span className="manager-rule-icon"><Check size={15} /></span><div><strong>{rule.title}</strong><span>{RECURRENCE_LABELS[rule.recurrence]}{rule.recurrence === 'weekly' ? ` · ${rule.weekdays.map((day) => WEEKDAY_LABELS[day]).join('、')}` : ''}</span></div></div>
            <div className="manager-rule-actions"><button onClick={() => onToggle(rule)} className={`switch ${rule.enabled ? 'switch-on' : ''}`} role="switch" aria-checked={rule.enabled} aria-label={rule.enabled ? '暂停规则' : '启用规则'}><span /></button><button className="text-action" onClick={() => onEdit(rule)}>编辑</button><button className="delete-subtask" onClick={() => { if (window.confirm(`删除“${rule.title}”？已保存的完成记录会保留。`)) onDelete(rule) }} aria-label="删除规则"><Trash2 size={15} /></button></div>
          </article>
        ))}
      </div>
      <footer className="modal-footer"><Button onClick={onClose}>关闭</Button><Button variant="primary" onClick={onAdd} icon={<Plus size={16} />}>新建规则</Button></footer>
    </Modal>
  )
}

function RoutineRuleEditor({ rule: initial, onClose, onSave }: {
  rule: RoutineRule
  onClose: () => void
  onSave: (rule: RoutineRule) => void
}) {
  const [rule, setRule] = useState<RoutineRule>(initial)
  const [error, setError] = useState('')
  const update = <K extends keyof RoutineRule>(key: K, value: RoutineRule[K]) => setRule((current) => ({ ...current, [key]: value, updatedAt: new Date().toISOString() }))
  const toggleWeekday = (day: number) => {
    const weekdays = rule.weekdays.includes(day) ? rule.weekdays.filter((value) => value !== day) : [...rule.weekdays, day].sort((a, b) => a - b)
    update('weekdays', weekdays)
  }
  const save = () => {
    if (!rule.title.trim()) { setError('请填写任务标题。'); return }
    if (rule.recurrence === 'weekly' && rule.weekdays.length === 0) { setError('至少选择一个星期。'); return }
    onSave({ ...rule, title: rule.title.trim() })
  }
  const showOffDayOptions = rule.recurrence !== 'workday'
  return (
    <Modal title={initial.title ? '编辑例行规则' : '新建例行规则'} subtitle="每条规则可以单独决定休息日和节假日是否执行。" onClose={onClose}>
      <div className="rule-form">
        <label className="field-label">任务标题<input value={rule.title} onChange={(event) => update('title', event.target.value)} placeholder="例如：检查店铺 Feedback" autoFocus /></label>
        <label className="field-label">重复方式<select value={rule.recurrence} onChange={(event) => update('recurrence', event.target.value as RecurrenceType)}>{Object.entries(RECURRENCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {rule.recurrence === 'weekly' && <fieldset className="weekday-picker"><legend>选择星期</legend><div>{WEEKDAY_LABELS.map((label, index) => <button type="button" className={rule.weekdays.includes(index) ? 'weekday-selected' : ''} key={label} onClick={() => toggleWeekday(index)} aria-pressed={rule.weekdays.includes(index)}>{label}</button>)}</div></fieldset>}
        {showOffDayOptions ? <fieldset className="offday-options"><legend>遇到非工作日时</legend><label><input type="checkbox" checked={rule.runOnRestDays} onChange={(event) => update('runOnRestDays', event.target.checked)} /><span><strong>休息日执行</strong><small>未勾选则当天跳过，不顺延</small></span></label><label><input type="checkbox" checked={rule.runOnHolidays} onChange={(event) => update('runOnHolidays', event.target.checked)} /><span><strong>节假日执行</strong><small>未勾选则当天跳过，不顺延</small></span></label></fieldset> : <div className="workday-rule-note"><CalendarDays size={16} /> 只在日历标记为“工作日”的日期显示</div>}
        {error && <div className="form-error">{error}</div>}
      </div>
      <footer className="modal-footer"><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={save}>保存规则</Button></footer>
    </Modal>
  )
}

export function createCompletion(rule: RoutineRule, date: string): RoutineCompletion {
  return { id: createId(), ruleId: rule.id, ruleTitle: rule.title, date, completedAt: new Date().toISOString() }
}
