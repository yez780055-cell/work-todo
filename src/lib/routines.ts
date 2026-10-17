import { routineRunsOnDate } from './dates'
import { createId, type CalendarDayType, type RoutineCompletion, type RoutineRule } from './model'

export type RoutineMatrixCellState = 'complete' | 'actionable' | 'preview' | 'unknown' | 'unavailable'

export function updateRoutineCompletion(
  completions: RoutineCompletion[],
  rule: RoutineRule,
  date: string,
  done: boolean,
  completedAt = new Date().toISOString(),
): RoutineCompletion[] {
  const matches = completions.filter((item) => item.ruleId === rule.id && item.date === date)
  const others = completions.filter((item) => item.ruleId !== rule.id || item.date !== date)
  if (!done) return matches.length === 0 ? completions : others
  if (matches.length > 0) return matches.length === 1 ? completions : [...others, matches[0]]
  return [...completions, { id: createId(), ruleId: rule.id, ruleTitle: rule.title, date, completedAt }]
}

export function getRoutineMatrixCellState(
  rule: RoutineRule | null,
  date: string,
  today: string,
  overrides: Record<string, CalendarDayType>,
  completed: boolean,
): RoutineMatrixCellState {
  if (completed) return 'complete'
  if (date < today) return 'unknown'
  if (!rule) return 'unavailable'

  const applies = rule.enabled && routineRunsOnDate(rule, date, overrides)
  if (!applies) return 'unavailable'
  return date === today ? 'actionable' : 'preview'
}
