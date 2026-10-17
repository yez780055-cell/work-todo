import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createEmptyWorkspace, type IndexColumn } from '../lib/model'
import { IndexPage } from './IndexPage'

const saveState = { status: 'saved' as const, message: '已保存到本机', savedAt: null }

function IndexHarness({ initialColumns = createEmptyWorkspace().indexColumns }: { initialColumns?: IndexColumn[] }) {
  const [columns, setColumns] = useState(initialColumns)
  return <IndexPage columns={columns} saveState={saveState} onChange={setColumns} resetVersion={0} />
}

describe('Index multi-column editor', () => {
  it('shows the editor directly and keeps the existing primary document editable', () => {
    const workspace = createEmptyWorkspace()
    workspace.indexColumns[0] = { ...workspace.indexColumns[0], html: '<p>运营记录</p>' }
    const { container } = render(<IndexHarness initialColumns={workspace.indexColumns} />)
    expect(container.querySelector('.index-cover')).toBeNull()
    expect(screen.getByRole('textbox', { name: '主文档内容' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '新增列' })).toBeTruthy()
  })

  it('adds independent editable columns and persists their order and collapsed state in component data', async () => {
    render(<IndexHarness />)
    fireEvent.click(screen.getByRole('button', { name: '新增列' }))
    const title = screen.getByRole('textbox', { name: '第 2 列标题' })
    fireEvent.change(title, { target: { value: '项目记录' } })
    const editor = screen.getByRole('textbox', { name: '项目记录内容' })
    editor.innerHTML = '<p>只属于第二列</p>'
    fireEvent.input(editor)

    expect(editor.innerHTML).toContain('只属于第二列')
    const firstMoveRight = screen.getByRole('button', { name: '将 主文档 右移' })
    fireEvent.click(firstMoveRight)
    expect((screen.getByRole('textbox', { name: '第 1 列标题' }) as HTMLInputElement).value).toBe('项目记录')
    expect((screen.getByRole('textbox', { name: '第 2 列标题' }) as HTMLInputElement).value).toBe('主文档')

    fireEvent.click(screen.getByRole('button', { name: '折叠 项目记录' }))
    expect(screen.getByRole('button', { name: '展开 项目记录' }).getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(screen.getByRole('button', { name: '展开 项目记录' }))
    expect(screen.getByRole('textbox', { name: '项目记录内容' }).innerHTML).toContain('只属于第二列')
  })

  it('searches all columns and expands a collapsed result before selecting its text', async () => {
    const workspace = createEmptyWorkspace()
    workspace.indexColumns = [
      { id: 'one', title: '工作笔记', html: '<p>普通文字</p>', updatedAt: null, collapsed: false },
      { id: 'two', title: '历史经验', html: '<p>跨列搜索目标</p>', updatedAt: null, collapsed: true },
    ]
    workspace.indexDocument = { html: workspace.indexColumns[0].html, updatedAt: null }
    render(<IndexHarness initialColumns={workspace.indexColumns} />)
    fireEvent.click(screen.getByRole('button', { name: '搜索 Index 内容' }))
    fireEvent.change(screen.getByRole('textbox', { name: '搜索所有 Index 列' }), { target: { value: '跨列搜索' } })
    const result = screen.getByRole('button', { name: /历史经验.*跨列搜索目标/ })
    fireEvent.click(result)
    await waitFor(() => expect(screen.getByRole('textbox', { name: '历史经验内容' })).toBeTruthy())
    expect(screen.getByRole('button', { name: '折叠 历史经验' }).getAttribute('aria-expanded')).toBe('true')
    await waitFor(() => expect(window.getSelection()?.toString()).toBe('跨列搜索'))
  })

  it('selects the later occurrence by its normalized character offset after long multiline content', async () => {
    const workspace = createEmptyWorkspace()
    const firstParagraph = `${'较长的前置内容 '.repeat(35)}needle`
    const secondParagraph = '第二段包含连续   空白，随后是 needle'
    workspace.indexColumns[0] = { ...workspace.indexColumns[0], html: `<p>${firstParagraph}</p><p>${secondParagraph}</p>` }
    render(<IndexHarness initialColumns={workspace.indexColumns} />)
    fireEvent.click(screen.getByRole('button', { name: '搜索 Index 内容' }))
    fireEvent.change(screen.getByRole('textbox', { name: '搜索所有 Index 列' }), { target: { value: 'needle' } })

    const results = document.querySelectorAll('.search-results button')
    expect(results).toHaveLength(2)
    fireEvent.click(results[1])

    await waitFor(() => expect(window.getSelection()?.toString()).toBe('needle'))
    const selection = window.getSelection()!
    expect(selection.anchorNode?.textContent).toBe(secondParagraph)
    expect(selection.anchorOffset).toBe(secondParagraph.lastIndexOf('needle'))
  })

  it('keeps identical matches in different columns attached to their own editors', async () => {
    const workspace = createEmptyWorkspace()
    workspace.indexColumns = [
      { id: 'first', title: '第一列', html: '<p>第一份材料里有同一个词</p>', updatedAt: null, collapsed: false },
      { id: 'second', title: '第二列', html: '<p>第二份材料里有同一个词</p>', updatedAt: null, collapsed: false },
    ]
    workspace.indexDocument = { html: workspace.indexColumns[0].html, updatedAt: null }
    render(<IndexHarness initialColumns={workspace.indexColumns} />)
    fireEvent.click(screen.getByRole('button', { name: '搜索 Index 内容' }))
    fireEvent.change(screen.getByRole('textbox', { name: '搜索所有 Index 列' }), { target: { value: '同一个词' } })

    const results = document.querySelectorAll('.search-results button')
    expect(results).toHaveLength(2)
    fireEvent.click(results[1])

    await waitFor(() => expect(window.getSelection()?.toString()).toBe('同一个词'))
    const selection = window.getSelection()!
    expect(selection.anchorNode?.parentElement?.closest('.rich-editor')?.getAttribute('aria-label')).toBe('第二列内容')
  })

  it('opens Index-only search from the magnifier and closes it with Escape', async () => {
    render(<IndexHarness />)
    const toggle = screen.getByRole('button', { name: '搜索 Index 内容' })
    fireEvent.click(toggle)
    const input = screen.getByRole('textbox', { name: '搜索所有 Index 列' })
    expect(document.activeElement).toBe(input)
    fireEvent.change(input, { target: { value: '局部关键词' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('textbox', { name: '搜索所有 Index 列' })).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(toggle))
  })

  it('uses an in-app confirmation dialog and leaves the document intact when canceled', async () => {
    const workspace = createEmptyWorkspace()
    workspace.indexColumns[0].html = '<p>仍需保留</p>'
    render(<IndexHarness initialColumns={workspace.indexColumns} />)
    const deleteButton = screen.getByRole('button', { name: '删除列：主文档' })
    deleteButton.focus()
    fireEvent.click(deleteButton)
    const dialog = screen.getByRole('alertdialog', { name: '删除“主文档”？' })
    expect(dialog.textContent).toContain('列内容也会一并删除。此操作不可撤销。')
    const cancelButton = screen.getByRole('button', { name: '取消' })
    await waitFor(() => expect(document.activeElement).toBe(cancelButton))
    const confirmButton = screen.getByRole('button', { name: /^删除列$/ })
    confirmButton.focus()
    fireEvent.keyDown(confirmButton, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭确认框' }))
    cancelButton.focus()
    fireEvent.keyDown(cancelButton, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: '删除“主文档”？' })).toBeNull())
    expect((screen.getByRole('textbox', { name: '主文档内容' }) as HTMLDivElement).innerHTML).toContain('仍需保留')
    await waitFor(() => expect(document.activeElement).toBe(deleteButton))
  })

  it('keeps one blank editable column when the last column is deliberately deleted', () => {
    const workspace = createEmptyWorkspace()
    workspace.indexColumns[0].html = '<p>确认后删除的内容</p>'
    render(<IndexHarness initialColumns={workspace.indexColumns} />)
    fireEvent.click(screen.getByRole('button', { name: '删除列：主文档' }))
    fireEvent.click(screen.getByRole('button', { name: /^删除列$/ }))
    expect(screen.getByRole('textbox', { name: '第 1 列标题' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: '主文档内容' }).textContent).toBe('')
    expect(screen.getByRole('button', { name: '新增列' })).toBeTruthy()
  })
})
