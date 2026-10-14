import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { createEmptyWorkspace, createTask } from './lib/model'

const { loadWorkspaceMock, saveWorkspaceMock } = vi.hoisted(() => ({
  loadWorkspaceMock: vi.fn(),
  saveWorkspaceMock: vi.fn(),
}))

vi.mock('./lib/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/storage')>()
  return { ...actual, loadWorkspace: loadWorkspaceMock, saveWorkspace: saveWorkspaceMock }
})

describe('subtask completion through the workspace persistence flow', () => {
  beforeEach(() => {
    const workspace = createEmptyWorkspace()
    const task = createTask('整理发布清单', 'doing')
    task.subtasks = [
      { id: 's1', title: '核对内容', done: true },
      { id: 's2', title: '确认发布', done: false },
    ]
    workspace.tasks.push(task)
    loadWorkspaceMock.mockReset().mockResolvedValue(workspace)
    saveWorkspaceMock.mockReset().mockResolvedValue(undefined)
  })

  it('updates progress, auto-completes the parent, and sends the new workspace to the existing save hook', async () => {
    render(<App />)
    const summary = await screen.findByRole('button', { name: '整理发布清单：子任务 1/2，展开' })
    await waitFor(() => expect(saveWorkspaceMock).toHaveBeenCalled())
    saveWorkspaceMock.mockClear()

    fireEvent.click(summary)
    fireEvent.click(await screen.findByRole('checkbox', { name: '子任务：确认发布' }))

    await waitFor(() => {
      const savedWorkspace = saveWorkspaceMock.mock.calls
        .map(([data]) => data as ReturnType<typeof createEmptyWorkspace>)
        .find((data) => data.tasks.some((item) => item.id && item.status === 'done' && item.subtasks.some((subtask) => subtask.id === 's2' && subtask.done)))
      expect(savedWorkspace).toBeDefined()
      const savedTask = savedWorkspace?.tasks[0]
      expect(savedTask).toMatchObject({ status: 'done', previousStatus: 'doing', autoCompletedBySubtasks: true })
      expect(savedTask?.subtasks.map((subtask) => subtask.done)).toEqual([true, true])
    })
    expect(screen.getByText('2/2 子任务')).toBeTruthy()
  })
})
