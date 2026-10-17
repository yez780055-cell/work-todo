import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, ChevronLeft, ChevronRight, Circle, ListChecks, Plus, Settings2, Trash2 } from 'lucide-react'
import { dateFromKey, getWeekDateKeys, getWeekStartKey, routineRunsOnDate, shiftDateKey } from '../lib/dates'
import { createId, createRoutineRule, WEEKDAY_LABELS, type CalendarDayType, type RecurrenceType, type RoutineCompletion, type RoutineRule } from '../lib/model'
import { getRoutineMatrixCellState } from '../lib/routines'
import { Button, ConfirmDialog, EmptyState, Modal } from './common'

const RECURRENCE_LABELS: Record<RecurrenceType, string> = {
  daily: '每天',
  weekdays: '周一至周五',
  weekly: '每周指定星期',
  workday: '每个工作日',
}

const WEEKDAY_LONG_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

interface MatrixRuleRow {
  id: string
  title: string
  rule: RoutineRule | null
  archived: boolean
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
  const currentWeekStart = getWeekStartKey(dateKey)
  const [weekStartKey, setWeekStartKey] = useState(currentWeekStart)
  const [followsCurrentWeek, setFollowsCurrentWeek] = useState(true)
  useEffect(() => {
    if (followsCurrentWeek) setWeekStartKey(currentWeekStart)
  }, [currentWeekStart, followsCurrentWeek])

  const weekDates = useMemo(() => getWeekDateKeys(weekStartKey), [weekStartKey])
  const weekDateSet = useMemo(() => new Set(weekDates), [weekDates])
  const completionByDate = useMemo(() => {
    const index = new Map<string, RoutineCompletion>()
    completions.filter((item) => weekDateSet.has(item.date)).forEach((item) => {
      const key = `${item.ruleId}\u0000${item.date}`
      const prior = index.get(key)
      if (!prior || item.completedAt > prior.completedAt) index.set(key, item)
    })
    return index
  }, [completions, weekDateSet])
  const matrixRows = useMemo<MatrixRuleRow[]>(() => {
    const recentRuleIds = new Set(Array.from(completionByDate.values()).map((item) => item.ruleId))
    const orderedRules = [...rules]
      .filter((rule) => rule.enabled || recentRuleIds.has(rule.id))
      .sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map((rule) => ({ id: rule.id, title: rule.title, rule, archived: false }))
    const knownRuleIds = new Set(rules.map((rule) => rule.id))
    const archived = new Map<string, string>()
    completionByDate.forEach((item) => {
      if (!knownRuleIds.has(item.ruleId)) archived.set(item.ruleId, item.ruleTitle || '已删除的例行任务')
    })
    const archivedRows = Array.from(archived, ([id, title]) => ({ id, title, rule: null, archived: true }))
      .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
    return [...orderedRules, ...archivedRows]
  }, [rules, completionByDate])

  const todayRules = useMemo(() => rules.filter((rule) => rule.enabled && routineRunsOnDate(rule, dateKey, calendarOverrides)), [rules, dateKey, calendarOverrides])
  const todayCompletionIds = useMemo(() => new Set(completions.filter((item) => item.date === dateKey).map((item) => item.ruleId)), [completions, dateKey])
  const todayDoneCount = todayRules.filter((rule) => todayCompletionIds.has(rule.id)).length
  const weekRangeLabel = useMemo(() => {
    const start = dateFromKey(weekDates[0])
    const end = dateFromKey(weekDates[6])
    const startLabel = `${start.getMonth() + 1}月${start.getDate()}日`
    const endLabel = `${end.getMonth() + 1}月${end.getDate()}日`
    return start.getFullYear() === end.getFullYear()
      ? `${start.getFullYear()}年${startLabel}–${endLabel}`
      : `${start.getFullYear()}年${startLabel}–${end.getFullYear()}年${endLabel}`
  }, [weekDates])
  const todayLabel = dateFromKey(dateKey).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })

  const moveWeek = (days: number) => {
    const nextWeekStart = getWeekStartKey(shiftDateKey(weekStartKey, days))
    setWeekStartKey(nextWeekStart)
    setFollowsCurrentWeek(nextWeekStart === currentWeekStart)
  }

  const returnToCurrentWeek = () => {
    setFollowsCurrentWeek(true)
    setWeekStartKey(currentWeekStart)
  }

  return (
    <div className="routine-page">
      <div className="routine-intro">
        <div><h2>例行任务</h2><p>每周打卡记录；未记录的历史日期保持未知。</p></div>
        <div className="today-date"><CalendarDays size={16} /><span>{todayLabel}</span></div>
      </div>
      <section className="routine-week-panel" aria-label="例行任务每周打卡矩阵">
        <header className="routine-week-header">
          <div className="routine-week-navigation">
            <button type="button" className="icon-button" aria-label="上一周" title="上一周" onClick={() => moveWeek(-7)}><ChevronLeft size={18} /></button>
            <h3>{weekRangeLabel}</h3>
            <button type="button" className="icon-button" aria-label="下一周" title="下一周" onClick={() => moveWeek(7)}><ChevronRight size={18} /></button>
            <Button className="routine-current-week" disabled={weekStartKey === currentWeekStart} onClick={returnToCurrentWeek}>本周</Button>
          </div>
          <div className="routine-week-actions">
            <div className="routine-today-progress" aria-label={`今日完成 ${todayDoneCount}/${todayRules.length}`}><span>今日完成</span><strong>{todayDoneCount}/{todayRules.length}</strong></div>
            <Button onClick={() => setManagerOpen(true)} icon={<Settings2 size={16} />}>规则管理</Button>
          </div>
        </header>
        <div className="routine-matrix-legend" aria-label="打卡状态说明">
          <span><Check size={14} />已完成</span><span><Circle size={13} />今天可打卡</span><span><b>?</b>过去无记录</span><span><b>—</b>不适用</span><span>点击今天的勾号可撤销</span>
        </div>
        <div className="routine-matrix-scroll" role="region" aria-label="每周例行任务矩阵，可横向滚动" tabIndex={0}>
          <table className="routine-week-matrix">
            <thead><tr>
              <th scope="col" className="routine-matrix-task-heading">例行任务</th>
              {weekDates.map((key, index) => {
                const date = dateFromKey(key)
                const isToday = key === dateKey
                return <th scope="col" key={key} className={isToday ? 'routine-matrix-today-heading' : ''} aria-label={`${WEEKDAY_LONG_LABELS[index]} ${date.getMonth() + 1}月${date.getDate()}日${isToday ? '，今天' : ''}`}>
                  <span>{WEEKDAY_LONG_LABELS[index]}</span><strong>{date.getDate()}</strong>{isToday && <small>今天</small>}
                </th>
              })}
            </tr></thead>
            <tbody>
              {matrixRows.length === 0
                ? <tr><td colSpan={8} className="routine-matrix-empty">还没有启用的例行规则。可通过“规则管理”新建。</td></tr>
                : matrixRows.map((row) => <tr key={row.id}>
                  <th scope="row" className="routine-matrix-rule" title={row.title}><strong>{row.title || '未命名例行任务'}</strong>{row.archived ? <small>已删除规则 · 历史记录</small> : row.rule && !row.rule.enabled ? <small>已停用 · 历史记录</small> : row.rule && <small>{RECURRENCE_LABELS[row.rule.recurrence]}</small>}</th>
                  {weekDates.map((key) => {
                    const completion = completionByDate.get(`${row.id}\u0000${key}`)
                    const state = getRoutineMatrixCellState(row.rule, key, dateKey, calendarOverrides, Boolean(completion))
                    const date = dateFromKey(key)
                    const cellDateLabel = `${date.getMonth() + 1}月${date.getDate()}日`
                    return <td key={key} className={`${key === dateKey ? 'routine-matrix-today-cell ' : ''}routine-cell-${state}`}>
                      {state === 'complete' && key === dateKey && row.rule
                        ? <button type="button" className="routine-matrix-mark routine-matrix-complete" aria-label={`撤销打卡：${row.title}，${cellDateLabel}`} title="点击撤销今日打卡" onClick={() => onToggleCompletion(row.rule!, false)}><Check size={16} /></button>
                        : state === 'complete'
                          ? <span className="routine-matrix-mark routine-matrix-complete" aria-label={`已完成：${row.title}，${cellDateLabel}`} title={`${completion?.completedAt ? `完成于 ${new Date(completion.completedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : '已完成'}${row.archived ? ' · 规则已删除' : ''}`}><Check size={16} /></span>
                          : state === 'actionable'
                            ? <button type="button" className="routine-matrix-mark routine-matrix-actionable" aria-label={`标记完成：${row.title}，${cellDateLabel}`} title="点击完成今天的例行任务" onClick={() => onToggleCompletion(row.rule!, true)}><Circle size={16} /></button>
                            : state === 'preview'
                              ? <span className="routine-matrix-mark routine-matrix-preview" aria-label={`未来预览：${row.title}，${cellDateLabel}`} title="未来日期，仅预览"><Circle size={14} /></span>
                              : state === 'unknown'
                                ? <span className="routine-matrix-unknown" aria-label={`无记录：${row.title}，${cellDateLabel}`} title="无记录（未知；不推断为未完成）">?</span>
                                : <span className="routine-matrix-unavailable" aria-label={`不适用：${row.title}，${cellDateLabel}`} title="此日期不适用或规则已停用">—</span>}
                    </td>
                  })}
                </tr>)}
            </tbody>
          </table>
        </div>
        <footer className="routine-matrix-footer"><span><ListChecks size={15} />历史日期仅显示已保存记录；未知日期不会推测为漏打卡。</span><span>记录仅在今天产生，可撤销；未来日期不可打卡。</span></footer>
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
  const [pendingDelete, setPendingDelete] = useState<RoutineRule | null>(null)
  return (
    <Modal title="规则管理" subtitle="调整重复方式和执行日期；完成记录会继续保留。" onClose={onClose} wide>
      <div className="manager-list">
        {ordered.length === 0 ? <EmptyState icon={<Settings2 size={22} />} title="还没有规则" detail="添加一条你想每天或每周重复的工作事项。" /> : ordered.map((rule) => (
          <article className={`manager-rule ${rule.enabled ? '' : 'manager-rule-disabled'}`} key={rule.id}>
            <div className="manager-rule-info"><span className="manager-rule-icon"><Check size={15} /></span><div><strong>{rule.title}</strong><span>{RECURRENCE_LABELS[rule.recurrence]}{rule.recurrence === 'weekly' ? ` · ${rule.weekdays.map((day) => WEEKDAY_LABELS[day]).join('、')}` : ''}</span></div></div>
            <div className="manager-rule-actions"><button type="button" onClick={() => onToggle(rule)} className={`switch ${rule.enabled ? 'switch-on' : ''}`} role="switch" aria-checked={rule.enabled} aria-label={rule.enabled ? '暂停规则' : '启用规则'}><span /></button><button type="button" className="text-action" onClick={() => onEdit(rule)}>编辑</button><button type="button" className="delete-subtask" onClick={() => setPendingDelete(rule)} aria-label={`删除规则：${rule.title}`}><Trash2 size={15} /></button></div>
          </article>
        ))}
      </div>
      <footer className="modal-footer"><Button onClick={onClose}>关闭</Button><Button variant="primary" onClick={onAdd} icon={<Plus size={16} />}>新建规则</Button></footer>
      {pendingDelete && <ConfirmDialog
        title="删除例行规则？"
        message={`“${pendingDelete.title}”规则会被删除；已保存的完成记录会保留。此操作无法撤销。`}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => { onDelete(pendingDelete); setPendingDelete(null) }}
        confirmLabel="删除规则"
      />}
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
