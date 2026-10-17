import { useEffect, useMemo, useRef, useState } from 'react'
import { AlignLeft, Bold, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Heading2, Italic, List, ListOrdered, Plus, Search, Trash2, Underline, X } from 'lucide-react'
import { createId, type IndexColumn } from '../lib/model'
import { getSearchSnippets, normalizeSearchText, plainTextFromHtml, sanitizeRichText } from '../lib/richText'
import { Button, ConfirmDialog } from './common'
import type { SaveState } from '../useWorkspace'

interface SearchMatch {
  columnId: string
  columnTitle: string
  start: number
  end: number
  text: string
}

type TextNodePoint = { node: Text; offset: number }
type TextPoint = TextNodePoint | null

function collectEditorText(root: HTMLElement): { text: string; points: TextPoint[] } {
  const blockTags = new Set(['P', 'H2', 'H3', 'LI', 'BLOCKQUOTE'])
  let text = ''
  const points: TextPoint[] = []
  const appendBreak = () => {
    if (text && !text.endsWith('\n')) {
      text += '\n'
      points.push(null)
    }
  }
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const textNode = node as Text
      const content = textNode.textContent ?? ''
      text += content
      for (let offset = 0; offset < content.length; offset += 1) points.push({ node: textNode, offset })
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const element = node as HTMLElement
    if (element.tagName === 'BR') {
      appendBreak()
      return
    }
    const isBlock = blockTags.has(element.tagName)
    if (isBlock) appendBreak()
    Array.from(element.childNodes).forEach(visit)
    if (isBlock) appendBreak()
  }
  Array.from(root.childNodes).forEach(visit)
  return { text, points }
}

export function IndexPage({ columns, saveState, onChange, resetVersion }: {
  columns: IndexColumn[]
  saveState: SaveState
  onChange: (columns: IndexColumn[]) => void
  resetVersion: number
}) {
  const editorRefs = useRef(new Map<string, HTMLDivElement>())
  const titleInputRefs = useRef(new Map<string, HTMLInputElement>())
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchButtonRef = useRef<HTMLButtonElement>(null)
  const pendingMatchRef = useRef<SearchMatch | null>(null)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<IndexColumn | null>(null)
  const matches = useMemo<SearchMatch[]>(() => {
    const term = query.trim()
    if (!term) return []
    return columns.flatMap((column) => getSearchSnippets(column.html, term).map((match) => ({
      ...match,
      columnId: column.id,
      columnTitle: column.title,
    }))).slice(0, 12)
  }, [columns, query])

  useEffect(() => {
    columns.forEach((column) => {
      const editor = editorRefs.current.get(column.id)
      if (editor) editor.innerHTML = sanitizeRichText(column.html)
    })
  }, [resetVersion])

  const visibleColumnKey = columns.filter((column) => !column.collapsed).map((column) => column.id).join('|')
  useEffect(() => {
    columns.forEach((column) => {
      if (column.collapsed) return
      const editor = editorRefs.current.get(column.id)
      if (editor && editor.innerHTML === '') editor.innerHTML = sanitizeRichText(column.html)
    })
  }, [visibleColumnKey])

  useEffect(() => {
    const pending = pendingMatchRef.current
    if (!pending) return
    const column = columns.find((item) => item.id === pending.columnId)
    if (!column || column.collapsed) return
    pendingMatchRef.current = null
    window.setTimeout(() => jumpToMatch(pending), 0)
  }, [columns])

  useEffect(() => {
    if (!searchOpen) return
    searchInputRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setQuery('')
      setSearchOpen(false)
      window.setTimeout(() => searchButtonRef.current?.focus(), 0)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [searchOpen])

  const updateColumn = (columnId: string, update: (column: IndexColumn) => IndexColumn) => {
    onChange(columns.map((column) => column.id === columnId ? update(column) : column))
  }

  const addColumn = () => {
    const now = new Date().toISOString()
    onChange([...columns, { id: createId(), title: '新建列', html: '<p><br></p>', updatedAt: now, collapsed: false }])
  }

  const requestDeleteColumn = (columnId: string) => {
    const index = columns.findIndex((column) => column.id === columnId)
    if (index < 0) return
    setPendingDelete(columns[index])
  }

  const confirmDeleteColumn = () => {
    if (!pendingDelete) return
    const index = columns.findIndex((column) => column.id === pendingDelete.id)
    if (index < 0) { setPendingDelete(null); return }
    let nextColumns = columns.filter((item) => item.id !== pendingDelete.id)
    if (nextColumns.length === 0) {
      nextColumns = [{ id: createId(), title: '主文档', html: '<p><br></p>', updatedAt: null, collapsed: false }]
    }
    setPendingDelete(null)
    onChange(nextColumns)
    const focusId = nextColumns[Math.min(index, nextColumns.length - 1)].id
    window.setTimeout(() => titleInputRefs.current.get(focusId)?.focus(), 0)
  }

  const toggleSearch = () => {
    if (searchOpen) {
      setQuery('')
      setSearchOpen(false)
      window.setTimeout(() => searchButtonRef.current?.focus(), 0)
    } else setSearchOpen(true)
  }

  const moveColumn = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= columns.length) return
    const reordered = [...columns]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    onChange(reordered)
  }

  const jumpToMatch = (match: SearchMatch) => {
    const root = editorRefs.current.get(match.columnId)
    if (!root) return
    const source = collectEditorText(root)
    const normalized = normalizeSearchText(source.text)
    const sourceStart = normalized.sourceRanges[match.start]?.start
    const sourceEnd = normalized.sourceRanges[match.end - 1]?.end
    if (sourceStart === undefined || sourceEnd === undefined) return
    let startPoint: TextNodePoint | null = null
    for (let offset = sourceStart; offset < source.points.length && !startPoint; offset += 1) {
      startPoint = source.points[offset]
    }
    let endPoint: TextNodePoint | null = null
    for (let offset = sourceEnd - 1; offset >= 0 && !endPoint; offset -= 1) {
      endPoint = source.points[offset]
    }
    if (!startPoint || !endPoint) return
    const range = document.createRange()
    range.setStart(startPoint.node, startPoint.offset)
    range.setEnd(endPoint.node, endPoint.offset + 1)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    startPoint.node.parentElement?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
  }

  const selectMatch = (match: SearchMatch) => {
    const column = columns.find((item) => item.id === match.columnId)
    if (column?.collapsed) {
      pendingMatchRef.current = match
      onChange(columns.map((item) => item.id === match.columnId ? { ...item, collapsed: false } : item))
      return
    }
    jumpToMatch(match)
  }

  const toolbar = (columnId: string) => [
    { label: '正文', icon: <AlignLeft size={16} />, command: 'formatBlock', value: '<p>' },
    { label: '二级标题', icon: <Heading2 size={16} />, command: 'formatBlock', value: '<h2>' },
    { label: '加粗', icon: <Bold size={16} />, command: 'bold' },
    { label: '斜体', icon: <Italic size={16} />, command: 'italic' },
    { label: '下划线', icon: <Underline size={16} />, command: 'underline' },
    { label: '项目符号列表', icon: <List size={16} />, command: 'insertUnorderedList' },
    { label: '编号列表', icon: <ListOrdered size={16} />, command: 'insertOrderedList' },
  ].map((item) => ({
    ...item,
    run: () => {
      const editor = editorRefs.current.get(columnId)
      editor?.focus()
      document.execCommand(item.command, false, item.value)
      if (editor) updateColumn(columnId, (column) => ({ ...column, html: sanitizeRichText(editor.innerHTML), updatedAt: new Date().toISOString() }))
    },
  }))

  return (
    <div className="index-page">
      <div className="index-page-heading">
        <div><h2>工作 Index</h2></div>
        <div className="index-page-actions">
          <button type="button" className="button button-secondary" onClick={addColumn}><Plus size={15} />新增列</button>
          {searchOpen && <div className="index-search-inline"><Search size={15} /><input ref={searchInputRef} aria-label="搜索所有 Index 列" placeholder="搜索 Index" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <span>{matches.length} 处</span>}<button type="button" className="index-search-close" aria-label="关闭 Index 搜索" onClick={toggleSearch}><X size={15} /></button></div>}
          <button ref={searchButtonRef} type="button" className={`index-search-button ${searchOpen ? 'index-search-button-active' : ''}`} title="搜索 Index 内容" aria-label="搜索 Index 内容" aria-expanded={searchOpen} onClick={toggleSearch}><Search size={17} /></button>
        </div>
      </div>
      {query && <div className="search-results" aria-label="Index 搜索结果">
        {matches.length === 0 ? <p>没有找到匹配内容。</p> : matches.map((item, index) => <button type="button" key={`${item.columnId}-${item.start}-${item.end}`} onClick={() => selectMatch(item)}><span>{index + 1}</span><strong>{item.columnTitle}</strong>{item.text}</button>)}
      </div>}
      <div className="index-column-grid">
        {columns.map((column, index) => {
          return <section className={`index-document-card ${column.collapsed ? 'index-document-collapsed' : ''}`} key={column.id}>
            <header className="index-document-header">
              <div className="index-column-heading">
                <span className="document-type">INDEX · {String(index + 1).padStart(2, '0')}</span>
                <input ref={(element) => { if (element) titleInputRefs.current.set(column.id, element); else titleInputRefs.current.delete(column.id) }} aria-label={`第 ${index + 1} 列标题`} value={column.title} onChange={(event) => updateColumn(column.id, (current) => ({ ...current, title: event.target.value }))} />
              </div>
              <div className="index-column-controls">
                <button type="button" aria-label={`将 ${column.title || '此列'} 左移`} title="左移" disabled={index === 0} onClick={() => moveColumn(index, -1)}><ChevronLeft size={17} /></button>
                <button type="button" aria-label={`将 ${column.title || '此列'} 右移`} title="右移" disabled={index === columns.length - 1} onClick={() => moveColumn(index, 1)}><ChevronRight size={17} /></button>
                <button type="button" aria-label={column.collapsed ? `展开 ${column.title || '此列'}` : `折叠 ${column.title || '此列'}`} aria-expanded={!column.collapsed} onClick={() => updateColumn(column.id, (current) => ({ ...current, collapsed: !current.collapsed }))}>{column.collapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}</button>
                <button type="button" className="index-column-delete" aria-label={`删除列：${column.title || '未命名列'}`} title="删除列" onClick={() => requestDeleteColumn(column.id)}><Trash2 size={15} /></button>
              </div>
            </header>
            {!column.collapsed && <>
              <div className="index-actions"><div className="editor-toolbar" aria-label={`${column.title || '此列'}文字格式`}>
                {toolbar(column.id).map((item) => <button type="button" key={item.label} title={item.label} aria-label={`${column.title || '此列'}：${item.label}`} onMouseDown={(event) => event.preventDefault()} onClick={item.run}>{item.icon}</button>)}
              </div></div>
              <div className="index-writing-area">
                <div className="rich-editor" ref={(element) => { if (element) editorRefs.current.set(column.id, element); else editorRefs.current.delete(column.id) }} contentEditable suppressContentEditableWarning spellCheck={false} role="textbox" aria-label={`${column.title || `第 ${index + 1} 列`}内容`} aria-multiline="true" onInput={(event) => updateColumn(column.id, (current) => ({ ...current, html: sanitizeRichText(event.currentTarget.innerHTML), updatedAt: new Date().toISOString() }))} />
              </div>
              <footer className="index-document-footer"><span>自动保存到当前工作区</span><span>支持标题、段落、列表与基础文字格式</span></footer>
            </>}
          </section>
        })}
      </div>
      {saveState.status === 'error' && <div className="storage-warning">保存遇到问题：{saveState.message}。建议立即导出备份。</div>}
      <div className="index-private-note"><span>只存储在这台设备的本地工作区</span><span>·</span><Button variant="ghost" onClick={() => window.dispatchEvent(new CustomEvent('open-backup-settings'))}>导入 / 导出备份</Button></div>
      {pendingDelete && <ConfirmDialog
        title={`删除“${pendingDelete.title || '未命名列'}”？`}
        message={`${plainTextFromHtml(pendingDelete.html).trim() ? '列内容也会一并删除。' : ''}此操作不可撤销。确认后才会保存更改。`}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDeleteColumn}
        confirmLabel="删除列"
      />}
    </div>
  )
}
