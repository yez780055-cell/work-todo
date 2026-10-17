import { StrictMode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from './App'
import { createEmptyWorkspace, createTask, type Task, type TaskStatus, type WorkspaceData } from './lib/model'

const { loadWorkspaceMock, saveWorkspaceMock } = vi.hoisted(() => ({
  loadWorkspaceMock: vi.fn(),
  saveWorkspaceMock: vi.fn(),
}))

vi.mock('./lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/storage')>()
  return { ...actual, loadWorkspace: loadWorkspaceMock, saveWorkspace: saveWorkspaceMock }
})
function taskFixture(title: string, status: TaskStatus = 'todo', overrides: Partial<Task> = {}): Task {
  return {
    ...createTask(title, status),
    id: overrides.id ?? title,
    updatedAt: '2026-10-14T09:00:00.000Z',
    ...overrides,
  }
}

async function renderWorkspace(tasks: Task[] = [], strict = false) {
  const workspace = createEmptyWorkspace()
  workspace.tasks = tasks
  loadWorkspaceMock.mockReset().mockResolvedValue(workspace)
  saveWorkspaceMock.mockReset().mockResolvedValue(undefined)
  render(strict ? <StrictMode><App /></StrictMode> : <App />)
  await screen.findByRole('button', { name: '已完成历史' })
  await waitFor(() => expect(saveWorkspaceMock).toHaveBeenCalled())
  saveWorkspaceMock.mockClear()
}

function lastSavedWorkspace(): WorkspaceData {
  const call = saveWorkspaceMock.mock.calls.at(-1)
  if (!call) throw new Error('Workspace has not been saved')
  return call[0] as WorkspaceData
}

function openQuickCreate() {
  fireEvent.keyDown(document.body, { key: 'n' })
  return screen.getByRole('dialog', { name: '快速创建任务' })
}

function openTaskSearch(modifier: 'ctrlKey' | 'metaKey' = 'ctrlKey') {
  fireEvent.keyDown(document.body, { key: 'k', [modifier]: true })
  return screen.getByRole('dialog', { name: '全局任务搜索' })
}

describe('global task shortcuts and quick creation', () => {
  beforeEach(() => {
    loadWorkspaceMock.mockReset()
    saveWorkspaceMock.mockReset()
    window.localStorage.clear()
  })

  it('keeps the shared topbar free of permanent quick-create and task-search cards on every page', async () => {
    await renderWorkspace()
    const navigation = within(screen.getByRole('navigation', { name: '主导航' }))
    const topbar = document.querySelector('.topbar')!
    const expectNoTopbarActions = () => {
      expect(topbar.querySelector('.topbar-action, .topbar-actions')).toBeNull()
      expect(topbar.textContent).not.toMatch(/快速新建|快速创建|搜索任务/)
    }

    for (const label of ['任务看板', '例行任务', '工作日历', 'Index']) {
      fireEvent.click(navigation.getByRole('button', { name: new RegExp(label) }))
      expectNoTopbarActions()
    }
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    await screen.findByRole('heading', { name: '设置' })
    expectNoTopbarActions()
  }, 15_000)

  it('applies a saved custom in-window shortcut and shows the Windows-only global limitation', async () => {
    await renderWorkspace()
    const mainNavigation = within(screen.getByRole('navigation', { name: '主导航' }))
    expect(mainNavigation.queryByRole('button', { name: /快捷键/ })).toBeNull()
    expect(document.querySelector('.topbar-action')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    expect(await screen.findByRole('heading', { name: '设置' })).not.toBeNull()
    expect(screen.getByRole('heading', { name: '窗口内快捷键' })).not.toBeNull()
    expect(screen.getByText(/当前运行环境不支持注册系统级快捷键/)).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '编辑窗口内快捷键：快速新建任务' }))
    fireEvent.click(screen.getByRole('button', { name: '录入组合键' }))
    fireEvent.keyDown(screen.getByRole('button', { name: '正在录入快捷键，按 Esc 取消录入' }), { key: 'y', ctrlKey: true, shiftKey: true })
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
    await waitFor(() => expect(window.localStorage.getItem('worktodo.shortcut-settings.v1')).toContain('Ctrl+Shift+Y'))
    fireEvent.keyDown(document.body, { key: 'y', ctrlKey: true, shiftKey: true })
    expect(screen.getByRole('dialog', { name: '快速创建任务' })).not.toBeNull()
    fireEvent.keyDown(screen.getByRole('textbox', { name: '任务标题' }), { key: 'Escape' })
    fireEvent.keyDown(document.body, { key: 'n' })
    expect(screen.queryByRole('dialog', { name: '快速创建任务' })).toBeNull()
  }, 15_000)

  it('opens quick creation with N and focuses its title field', async () => {
    await renderWorkspace()

    const dialog = openQuickCreate()
    expect(dialog).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: '任务标题' }))
    expect(screen.getByLabelText('创建后状态').querySelectorAll('option')).toHaveLength(3)
    expect(screen.queryByRole('option', { name: '已完成' })).toBeNull()
    fireEvent.keyDown(screen.getByRole('textbox', { name: '任务标题' }), { key: 'Escape' })
    fireEvent.keyDown(document.body, { key: 'n', repeat: true })
    expect(screen.queryByRole('dialog', { name: '快速创建任务' })).toBeNull()
  })

  it('ignores N in editable controls and while an IME composition is active', async () => {
    await renderWorkspace([taskFixture('已有任务')])

    fireEvent.click(screen.getByRole('button', { name: '打开任务详情：已有任务' }))
    const titleInput = await screen.findByPlaceholderText('例如：整理本周产品数据')
    fireEvent.keyDown(titleInput, { key: 'n' })
    fireEvent.keyDown(screen.getByPlaceholderText('记录背景、链接或需要留意的内容'), { key: 'n' })
    fireEvent.keyDown(screen.getByPlaceholderText('添加一个子任务'), { key: 'n' })
    expect(screen.queryByRole('dialog', { name: '快速创建任务' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    fireEvent.click(screen.getByRole('button', { name: /Index/ }))
    const editor = screen.getByRole('textbox', { name: '主文档内容' })
    fireEvent.keyDown(editor, { key: 'n' })
    expect(screen.queryByRole('dialog', { name: '快速创建任务' })).toBeNull()

    fireEvent.compositionStart(document.body)
    fireEvent.keyDown(document.body, { key: 'n' })
    fireEvent.compositionEnd(document.body)
    expect(screen.queryByRole('dialog', { name: '快速创建任务' })).toBeNull()
  })

  it('creates one trimmed task with the selected status when Enter is pressed', async () => {
    await renderWorkspace()
    openQuickCreate()
    const titleInput = screen.getByRole('textbox', { name: '任务标题' })
    fireEvent.change(titleInput, { target: { value: '  准备周报  ' } })
    fireEvent.change(screen.getByLabelText('创建后状态'), { target: { value: 'doing' } })
    fireEvent.keyDown(titleInput, { key: 'Enter' })

    expect(screen.queryByRole('dialog', { name: '快速创建任务' })).toBeNull()
    await waitFor(() => expect(saveWorkspaceMock).toHaveBeenCalled())
    const created = lastSavedWorkspace().tasks.filter((task) => task.title === '准备周报')
    expect(created).toHaveLength(1)
    expect(created[0].status).toBe('doing')
  })

  it('ignores a second create activation after the first submit', async () => {
    await renderWorkspace()
    openQuickCreate()
    fireEvent.change(screen.getByRole('textbox', { name: '任务标题' }), { target: { value: '只创建一次' } })
    const createButton = screen.getByRole('button', { name: '创建任务' })
    fireEvent.click(createButton)
    fireEvent.click(createButton)

    await waitFor(() => expect(saveWorkspaceMock).toHaveBeenCalled())
    expect(lastSavedWorkspace().tasks.filter((task) => task.title === '只创建一次')).toHaveLength(1)
  })

  it.each([{ modifier: 'ctrlKey' as const }, { modifier: 'metaKey' as const }])(
    'creates once and opens the same task details with $modifier + Enter', async ({ modifier }) => {
      await renderWorkspace()
      openQuickCreate()
      const titleInput = screen.getByRole('textbox', { name: '任务标题' })
      fireEvent.change(titleInput, { target: { value: '继续补充背景' } })
      fireEvent.keyDown(titleInput, { key: 'Enter', [modifier]: true })

      const details = await screen.findByRole('dialog', { name: '任务详情' })
      expect(details).toBeTruthy()
      expect((screen.getByPlaceholderText('例如：整理本周产品数据') as HTMLInputElement).value).toBe('继续补充背景')
      await waitFor(() => expect(saveWorkspaceMock).toHaveBeenCalled())
      expect(lastSavedWorkspace().tasks.filter((task) => task.title === '继续补充背景')).toHaveLength(1)
      expect(screen.queryByRole('dialog', { name: '快速创建任务' })).toBeNull()
    },
  )

  it('keeps blank drafts out of storage and lets Escape cancel the dialog', async () => {
    await renderWorkspace()
    const dialog = openQuickCreate()
    const titleInput = screen.getByRole('textbox', { name: '任务标题' })
    fireEvent.change(titleInput, { target: { value: '   ' } })
    fireEvent.keyDown(titleInput, { key: 'Enter' })
    expect(within(dialog).getByRole('alert').textContent).toBe('请输入任务标题。')
    expect(saveWorkspaceMock).not.toHaveBeenCalled()

    fireEvent.keyDown(titleInput, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '快速创建任务' })).toBeNull()
    expect(saveWorkspaceMock).not.toHaveBeenCalled()
  })

  it('keeps the board column plus button status preset', async () => {
    await renderWorkspace()
    fireEvent.click(screen.getByRole('button', { name: '在待检查中新建任务' }))
    const titleInput = await screen.findByPlaceholderText('例如：整理本周产品数据')
    expect((screen.getByLabelText('当前状态') as HTMLSelectElement).value).toBe('review')
    fireEvent.change(titleInput, { target: { value: '需要复核的任务' } })
    await waitFor(() => expect(saveWorkspaceMock).toHaveBeenCalled())
    expect(lastSavedWorkspace().tasks.find((task) => task.title === '需要复核的任务')?.status).toBe('review')
  })

  it('removes the completed-task badge from the board navigation and keeps column counts', async () => {
    const completed = taskFixture('本周已完成', 'done', { completedAt: new Date().toISOString() })
    await renderWorkspace([taskFixture('待办任务'), completed])

    const taskNavigation = screen.getByRole('button', { name: /任务看板/ })
    expect(taskNavigation.querySelector('.nav-count')).toBeNull()
    expect(document.querySelector('.column-todo .column-count')?.textContent).toBe('1')
    expect(document.querySelector('.column-done .column-count')?.textContent).toBe('1')
  })

  it('synchronizes the legacy primary document mirror after deleting the first Index column', async () => {
    const workspace = createEmptyWorkspace()
    workspace.indexColumns = [
      { id: 'primary', title: '主文档', html: '<p>原始主文档</p>', updatedAt: null, collapsed: false },
      { id: 'second', title: '第二列', html: '<p>保留的内容</p>', updatedAt: null, collapsed: false },
    ]
    workspace.indexDocument = { html: workspace.indexColumns[0].html, updatedAt: null }
    loadWorkspaceMock.mockReset().mockResolvedValue(workspace)
    saveWorkspaceMock.mockReset().mockResolvedValue(undefined)
    render(<App />)
    await screen.findByRole('button', { name: '已完成历史' })
    fireEvent.click(within(screen.getByRole('navigation', { name: '主导航' })).getByRole('button', { name: /Index/ }))
    fireEvent.click(screen.getByRole('button', { name: '删除列：主文档' }))
    fireEvent.click(screen.getByRole('button', { name: /^删除列$/ }))
    await waitFor(() => expect(lastSavedWorkspace().indexDocument.html).toContain('保留的内容'))
    expect(lastSavedWorkspace().indexColumns).toHaveLength(1)
    expect(lastSavedWorkspace().indexDocument.html).toBe(lastSavedWorkspace().indexColumns[0].html)
  })
})

describe('global task search', () => {
  beforeEach(() => {
    loadWorkspaceMock.mockReset()
    saveWorkspaceMock.mockReset()
  })

  it('opens from every page and preserves the Index editor Ctrl+K behavior', async () => {
    await renderWorkspace()
    const pages = [
      /任务看板/,
      /例行任务/,
      /工作日历/,
      /Index/,
    ]
    const mainNavigation = within(screen.getByRole('navigation', { name: '主导航' }))
    for (const [index, page] of pages.entries()) {
      fireEvent.click(mainNavigation.getByRole('button', { name: page }))
      expect(document.querySelector('.topbar-action')).toBeNull()
      openTaskSearch(index % 2 === 0 ? 'metaKey' : 'ctrlKey')
      fireEvent.keyDown(screen.getByRole('textbox', { name: '搜索任务标题、备注或子任务' }), { key: 'Escape' })
      expect(screen.queryByRole('dialog', { name: '全局任务搜索' })).toBeNull()
    }

    fireEvent.click(screen.getByRole('button', { name: '设置' }))
    expect(document.querySelector('.topbar-action')).toBeNull()
    openTaskSearch('ctrlKey')
    fireEvent.keyDown(screen.getByRole('textbox', { name: '搜索任务标题、备注或子任务' }), { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '全局任务搜索' })).toBeNull()

    fireEvent.click(mainNavigation.getByRole('button', { name: /Index/ }))
    const editor = screen.getByRole('textbox', { name: '主文档内容' })
    fireEvent.keyDown(editor, { key: 'k', ctrlKey: true })
    expect(screen.queryByRole('dialog', { name: '全局任务搜索' })).toBeNull()
  })

  it('searches titles, notes, and subtasks, including old completed tasks', async () => {
    const titleTask = taskFixture('Quarterly Planning')
    const noteTask = taskFixture('Prepare Review', 'doing', { id: 'note-task', note: 'Budget Follow-up' })
    const subtaskTask = taskFixture('Launch Campaign', 'review', {
      id: 'subtask-task',
      subtasks: [{ id: 'child-1', title: 'Notify Vendors', done: false }],
    })
    const archivedTask = taskFixture('Archived Delivery', 'done', {
      id: 'archived-task',
      note: 'secret archive token',
      completedAt: '2024-01-02T00:00:00.000Z',
    })
    await renderWorkspace([titleTask, noteTask, subtaskTask, archivedTask])
    openTaskSearch()
    const input = screen.getByRole('textbox', { name: '搜索任务标题、备注或子任务' })

    for (const [query, resultName] of [
      [' quarterly ', '打开任务：Quarterly Planning，未开始'],
      ['budget', '打开任务：Prepare Review，进行中'],
      ['vendors', '打开任务：Launch Campaign，待检查'],
      ['archive token', '打开任务：Archived Delivery，已完成'],
    ]) {
      fireEvent.change(input, { target: { value: query } })
      expect(await screen.findByRole('option', { name: resultName })).toBeTruthy()
    }

    fireEvent.keyDown(input, { key: 'Enter' })
    await screen.findByRole('dialog', { name: '任务详情' })
    expect((screen.getByPlaceholderText('例如：整理本周产品数据') as HTMLInputElement).value).toBe('Archived Delivery')
  })

  it('supports arrow selection, Enter, mouse open, Escape, and empty-result feedback', async () => {
    const older = taskFixture('Project Alpha', 'todo', { id: 'alpha', updatedAt: '2026-10-12T09:00:00.000Z' })
    const newer = taskFixture('Project Beta', 'doing', { id: 'beta', updatedAt: '2026-10-13T09:00:00.000Z' })
    await renderWorkspace([older, newer])
    openTaskSearch()
    const input = screen.getByRole('textbox', { name: '搜索任务标题、备注或子任务' })
    fireEvent.change(input, { target: { value: 'project' } })
    const beta = await screen.findByRole('option', { name: '打开任务：Project Beta，进行中' })
    const alpha = screen.getByRole('option', { name: '打开任务：Project Alpha，未开始' })
    expect(beta.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(alpha.getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(input, { key: 'Enter' })
    await screen.findByRole('dialog', { name: '任务详情' })
    expect((screen.getByPlaceholderText('例如：整理本周产品数据') as HTMLInputElement).value).toBe('Project Alpha')

    fireEvent.keyDown(screen.getByRole('button', { name: '关闭' }), { key: 'Escape' })
    openTaskSearch()
    const searchInput = screen.getByRole('textbox', { name: '搜索任务标题、备注或子任务' })
    fireEvent.change(searchInput, { target: { value: 'not-a-task' } })
    expect(screen.getByRole('status').textContent).toContain('没有找到匹配任务')
    fireEvent.keyDown(searchInput, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '全局任务搜索' })).toBeNull()

    openTaskSearch()
    const clickInput = screen.getByRole('textbox', { name: '搜索任务标题、备注或子任务' })
    fireEvent.change(clickInput, { target: { value: 'project beta' } })
    fireEvent.click(await screen.findByRole('option', { name: '打开任务：Project Beta，进行中' }))
    await screen.findByRole('dialog', { name: '任务详情' })
    expect((screen.getByPlaceholderText('例如：整理本周产品数据') as HTMLInputElement).value).toBe('Project Beta')
  })

  it('resets selection when the query changes and closes only the topmost dialog with Escape', async () => {
    const tasks = [
      taskFixture('Alpha project', 'todo', { id: 'alpha', updatedAt: '2026-10-12T09:00:00.000Z' }),
      taskFixture('Beta project', 'doing', { id: 'beta', updatedAt: '2026-10-13T09:00:00.000Z' }),
    ]
    await renderWorkspace(tasks)
    fireEvent.click(screen.getByRole('button', { name: /例行任务/ }))
    fireEvent.click(screen.getByRole('button', { name: '规则管理' }))
    fireEvent.click(screen.getByRole('button', { name: '新建规则' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(2)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: '规则管理' })).toBeTruthy()
    expect(screen.queryByRole('dialog', { name: '新建例行规则' })).toBeNull()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: '规则管理' })).toBeNull()

    openTaskSearch()
    const input = screen.getByRole('textbox', { name: '搜索任务标题、备注或子任务' })
    fireEvent.change(input, { target: { value: 'project' } })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.change(input, { target: { value: 'alpha' } })
    expect(screen.getByRole('option', { name: '打开任务：Alpha project，未开始' }).getAttribute('aria-selected')).toBe('true')
  })

  it('returns focus after closing and keeps global shortcuts to one listener under StrictMode', async () => {
    await renderWorkspace([], true)
    const quickButton = screen.getByRole('button', { name: '在未开始中新建任务' })
    quickButton.focus()
    fireEvent.keyDown(quickButton, { key: 'n' })
    const quickInput = screen.getByRole('textbox', { name: '任务标题' })
    expect(document.activeElement).toBe(quickInput)
    const lastAction = screen.getByRole('button', { name: '创建并填写详情' })
    lastAction.focus()
    fireEvent.keyDown(lastAction, { key: 'Tab' })
    const closeButton = screen.getByRole('button', { name: '关闭快速创建' })
    expect(document.activeElement).toBe(closeButton)
    fireEvent.keyDown(closeButton, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(lastAction)
    fireEvent.keyDown(quickInput, { key: 'Escape' })
    expect(document.activeElement).toBe(quickButton)

    fireEvent.keyDown(document.body, { key: 'n' })
    expect(screen.getAllByRole('dialog', { name: '快速创建任务' })).toHaveLength(1)
    const input = screen.getByRole('textbox', { name: '任务标题' })
    fireEvent.change(input, { target: { value: 'Strict mode task' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(saveWorkspaceMock).toHaveBeenCalled())
    expect(lastSavedWorkspace().tasks.filter((task) => task.title === 'Strict mode task')).toHaveLength(1)
  })
})
