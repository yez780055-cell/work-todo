import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createEmptyWorkspace, type IndexColumn } from '../lib/model'
import { IndexPage } from './IndexPage'

const saveState = { status: 'saved' as const, message: '已保存到本机', savedAt: null }

function IndexHarness({ initialColumns = createEmptyWorkspace().indexColumns, onSave }: { initialColumns?: IndexColumn[]; onSave?: (columns: IndexColumn[]) => void }) {
  const [columns, setColumns] = useState(initialColumns)
  const changeColumns = (next: IndexColumn[]) => { setColumns(next); onSave?.(next) }
  return <IndexPage columns={columns} saveState={saveState} onChange={changeColumns} resetVersion={0} />
}

function multiDocumentWorkspace() {
  const workspace = createEmptyWorkspace()
  workspace.indexColumns = [
    { id: 'one', title: '主文档', html: '<p>主文档正文内容</p>', updatedAt: null, collapsed: true },
    { id: 'two', title: '选品思路', html: '<p>历史记录关键字</p>', updatedAt: null, collapsed: false },
  ]
  workspace.indexDocument = { html: workspace.indexColumns[0].html, updatedAt: null }
  return workspace
}

describe('Index document directory and focused editor', () => {
  it('starts in a compact directory without rendering any document editor', () => {
    const workspace = multiDocumentWorkspace()
    const { container } = render(<IndexHarness initialColumns={workspace.indexColumns} />)
    expect(screen.getByRole('region', { name: 'Index 文档目录' }).children).toHaveLength(2)
    expect(container.querySelector('[contenteditable="true"]')).toBeNull()
    expect(screen.getByText('01')).toBeTruthy()
    expect(screen.getByText('02')).toBeTruthy()
    expect(screen.getByText('主文档正文内容')).toBeTruthy()
  })

  it('opens exactly one document, returns to the directory, then opens another', async () => {
    const { container } = render(<IndexHarness initialColumns={multiDocumentWorkspace().indexColumns} />)
    fireEvent.click(screen.getByRole('button', { name: '打开文档：主文档' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: '主文档内容' })).toBeTruthy())
    expect(container.querySelectorAll('[contenteditable="true"]')).toHaveLength(1)
    expect(screen.queryByRole('region', { name: 'Index 文档目录' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '返回列表' }))
    expect(screen.getByRole('region', { name: 'Index 文档目录' })).toBeTruthy()
    expect(container.querySelector('[contenteditable="true"]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '打开文档：选品思路' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: '选品思路内容' })).toBeTruthy())
    expect(container.querySelectorAll('[contenteditable="true"]')).toHaveLength(1)
  })

  it('opens from the document card body and keeps sort and delete controls independent', async () => {
    render(<IndexHarness initialColumns={multiDocumentWorkspace().indexColumns} />)
    const openControl = screen.getByRole('button', { name: '打开文档：主文档' })
    expect(openControl.tabIndex).toBe(0)
    fireEvent.click(openControl)
    await screen.findByRole('textbox', { name: '主文档内容' })
    fireEvent.click(screen.getByRole('button', { name: '返回列表' }))

    fireEvent.click(screen.getByRole('button', { name: '将 主文档 下移' }))
    expect(screen.queryByRole('textbox', { name: '主文档内容' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Index 文档目录' })).toBeTruthy()
    const deleteButton = screen.getByRole('button', { name: '删除文档：主文档' })
    fireEvent.click(deleteButton)
    expect(screen.queryByRole('textbox', { name: '主文档内容' })).toBeNull()
    expect(screen.getByRole('alertdialog', { name: '删除“主文档”？' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.getByRole('region', { name: 'Index 文档目录' })).toBeTruthy()
  })

  it('focuses the rich editor when its surrounding blank writing area is clicked', async () => {
    const { container } = render(<IndexHarness />)
    fireEvent.click(screen.getByRole('button', { name: '打开文档：主文档' }))
    const editor = await screen.findByRole('textbox', { name: '主文档内容' })
    fireEvent.click(container.querySelector('.index-writing-area')!)
    expect(document.activeElement).toBe(editor)
  })

  it('returns from an open document with Escape and saves the latest editor content', async () => {
    let savedColumns: IndexColumn[] = []
    render(<IndexHarness onSave={(columns) => { savedColumns = columns }} />)
    fireEvent.click(screen.getByRole('button', { name: '打开文档：主文档' }))
    const editor = await screen.findByRole('textbox', { name: '主文档内容' })
    editor.innerHTML = '<p>Esc 前刚编辑的内容</p>'
    fireEvent.input(editor)
    fireEvent.keyDown(editor, { key: 'Escape' })
    expect(screen.getByRole('region', { name: 'Index 文档目录' })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: '主文档内容' })).toBeNull()
    expect(savedColumns[0].html).toContain('Esc 前刚编辑的内容')
    expect(screen.getByText('Esc 前刚编辑的内容')).toBeTruthy()
  })

  it('does nothing on Escape while the Index directory is open', () => {
    render(<IndexHarness />)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.getByRole('region', { name: 'Index 文档目录' })).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: '主文档内容' })).toBeNull()
  })

  it('lets Escape close a delete confirmation without leaving the document editor', async () => {
    render(<IndexHarness initialColumns={multiDocumentWorkspace().indexColumns} />)
    fireEvent.click(screen.getByRole('button', { name: '打开文档：主文档' }))
    await screen.findByRole('textbox', { name: '主文档内容' })
    fireEvent.click(screen.getByRole('button', { name: '删除文档：主文档' }))
    const dialog = screen.getByRole('alertdialog', { name: '删除“主文档”？' })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: '删除“主文档”？' })).toBeNull())
    expect(screen.getByRole('textbox', { name: '主文档内容' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Index 文档目录' })).toBeNull()
  })

  it('autosaves edits and preserves the prior document when opening another', async () => {
    let savedColumns: IndexColumn[] = []
    render(<IndexHarness initialColumns={multiDocumentWorkspace().indexColumns} onSave={(columns) => { savedColumns = columns }} />)
    fireEvent.click(screen.getByRole('button', { name: '打开文档：主文档' }))
    const editor = await screen.findByRole('textbox', { name: '主文档内容' })
    editor.innerHTML = '<p>新编辑的主文档内容</p>'
    fireEvent.input(editor)
    await waitFor(() => expect(savedColumns[0].html).toContain('新编辑的主文档内容'))
    fireEvent.click(screen.getByRole('button', { name: '返回列表' }))
    fireEvent.click(screen.getByRole('button', { name: '打开文档：选品思路' }))
    await screen.findByRole('textbox', { name: '选品思路内容' })
    expect(savedColumns[0].html).toContain('新编辑的主文档内容')
  })

  it('creates a blank document and opens it for editing', async () => {
    const { container } = render(<IndexHarness />)
    fireEvent.click(screen.getByRole('button', { name: '新增文档' }))
    const editor = await screen.findByRole('textbox', { name: '新建文档内容' })
    expect(container.querySelectorAll('[contenteditable="true"]')).toHaveLength(1)
    expect(editor.textContent).toBe('')
  })

  it('searches document titles and body text and opens the matching document', async () => {
    const { container } = render(<IndexHarness initialColumns={multiDocumentWorkspace().indexColumns} />)
    fireEvent.click(screen.getByRole('button', { name: '搜索 Index 文档' }))
    fireEvent.change(screen.getByRole('textbox', { name: '搜索 Index 文档标题或内容' }), { target: { value: '选品思路' } })
    fireEvent.click(screen.getByRole('button', { name: /选品思路.*标题：选品思路/ }))
    await screen.findByRole('textbox', { name: '选品思路内容' })
    expect(container.querySelectorAll('[contenteditable="true"]')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: '返回列表' }))
    fireEvent.click(screen.getByRole('button', { name: '搜索 Index 文档' }))
    fireEvent.change(screen.getByRole('textbox', { name: '搜索 Index 文档标题或内容' }), { target: { value: '历史记录关键字' } })
    fireEvent.click(screen.getByRole('button', { name: /选品思路.*历史记录关键字/ }))
    await screen.findByRole('textbox', { name: '选品思路内容' })
    await waitFor(() => expect(window.getSelection()?.toString()).toBe('历史记录关键字'))
  })

  it('moves documents in the directory and updates their displayed order', () => {
    render(<IndexHarness initialColumns={multiDocumentWorkspace().indexColumns} />)
    fireEvent.click(screen.getByRole('button', { name: '将 主文档 下移' }))
    const rows = screen.getByRole('region', { name: 'Index 文档目录' }).children
    expect(rows[0].querySelector('.index-row-number')?.textContent).toBe('01')
    expect(rows[0].querySelector('.index-row-title')?.textContent).toBe('选品思路')
    expect(rows[1].querySelector('.index-row-title')?.textContent).toBe('主文档')
  })

  it('keeps search Escape behavior and restores focus to its button', async () => {
    render(<IndexHarness />)
    const toggle = screen.getByRole('button', { name: '搜索 Index 文档' })
    fireEvent.click(toggle)
    const input = screen.getByRole('textbox', { name: '搜索 Index 文档标题或内容' })
    expect(document.activeElement).toBe(input)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('textbox', { name: '搜索 Index 文档标题或内容' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Index 文档目录' })).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(toggle))
  })

  it('uses an in-app confirmation dialog and leaves the document intact when canceled', async () => {
    const workspace = createEmptyWorkspace()
    workspace.indexColumns[0].html = '<p>仍需保留</p>'
    render(<IndexHarness initialColumns={workspace.indexColumns} />)
    const deleteButton = screen.getByRole('button', { name: '删除文档：主文档' })
    deleteButton.focus()
    fireEvent.click(deleteButton)
    const dialog = screen.getByRole('alertdialog', { name: '删除“主文档”？' })
    expect(dialog.textContent).toContain('文档内容也会一并删除。此操作不可撤销。')
    const cancelButton = screen.getByRole('button', { name: '取消' })
    await waitFor(() => expect(document.activeElement).toBe(cancelButton))
    const confirmButton = screen.getByRole('button', { name: /^删除文档$/ })
    confirmButton.focus()
    fireEvent.keyDown(confirmButton, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '关闭确认框' }))
    cancelButton.focus()
    fireEvent.keyDown(cancelButton, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: '删除“主文档”？' })).toBeNull())
    expect(screen.getByRole('button', { name: '打开文档：主文档' })).toBeTruthy()
    expect(screen.getByText('仍需保留')).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(deleteButton))
  })

  it('deleting the first document preserves the next document and its legacy primary copy', async () => {
    let savedColumns: IndexColumn[] = []
    render(<IndexHarness initialColumns={multiDocumentWorkspace().indexColumns} onSave={(columns) => { savedColumns = columns }} />)
    fireEvent.click(screen.getByRole('button', { name: '删除文档：主文档' }))
    fireEvent.click(screen.getByRole('button', { name: /^删除文档$/ }))
    await waitFor(() => expect(savedColumns).toHaveLength(1))
    expect(savedColumns[0]).toMatchObject({ title: '选品思路', html: '<p>历史记录关键字</p>' })
    expect(screen.getByRole('button', { name: '打开文档：选品思路' })).toBeTruthy()
  })

  it('keeps a blank primary document when the final document is deleted', () => {
    render(<IndexHarness />)
    fireEvent.click(screen.getByRole('button', { name: '删除文档：主文档' }))
    fireEvent.click(screen.getByRole('button', { name: /^删除文档$/ }))
    expect(screen.getByRole('region', { name: 'Index 文档目录' }).children).toHaveLength(1)
    expect(screen.getByText('主文档', { selector: '.index-row-title' })).toBeTruthy()
    expect(screen.getByText('暂无正文')).toBeTruthy()
  })
})
