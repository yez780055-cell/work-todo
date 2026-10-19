import { useEffect, useMemo, useRef, useState } from 'react'
import { AlignLeft, Bold, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Heading2, Italic, List, ListOrdered, Plus, Search, Trash2, Underline, X } from 'lucide-react'
import { createId, type IndexColumn } from '../lib/model'
import { getSearchSnippets, normalizeSearchText, plainTextFromHtml, sanitizeRichText } from '../lib/richText'
import { applyRichTextCommand, type RichTextCommand } from '../lib/richTextEditing'
import { Button, ConfirmDialog } from './common'
import type { SaveState } from '../useWorkspace'

interface SearchMatch {
  columnId: string
  columnTitle: string
  start: number
  end: number
  text: string
  source: 'title' | 'body'
}

type TextNodePoint = { node: Text; offset: number }
type TextPoint = TextNodePoint | null

function collectEditorText(root: HTMLElement): { text: string; points: TextPoint[] } {
  const blockTags = new Set(['P', 'H2', 'H3', 'LI', 'BLOCKQUOTE'])
  let text = ''
  const points: TextPoint[] = []
  const appendBreak = () => {
    if (text && !text.endsWith('\n')) { text += '\n'; points.push(null) }
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
    if (element.tagName === 'BR') { appendBreak(); return }
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
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<IndexColumn | null>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchButtonRef = useRef<HTMLButtonElement>(null)
  const pendingMatchRef = useRef<SearchMatch | null>(null)
  const activeDocument = columns.find((column) => column.id === activeDocumentId) ?? null
  const matches = useMemo<SearchMatch[]>(() => {
    const term = query.trim()
    if (!term) return []
    return columns.flatMap((column) => {
      const titleMatch = normalizeSearchText(column.title).text.indexOf(normalizeSearchText(term).text)
      const titleResults: SearchMatch[] = titleMatch >= 0 ? [{ columnId: column.id, columnTitle: column.title, start: titleMatch, end: titleMatch + normalizeSearchText(term).text.length, text: `标题：${column.title}`, source: 'title' }] : []
      const bodyResults = getSearchSnippets(column.html, term).map((match) => ({ ...match, columnId: column.id, columnTitle: column.title, source: 'body' as const }))
      return [...titleResults, ...bodyResults]
    }).slice(0, 12)
  }, [columns, query])

  useEffect(() => {
    if (activeDocument && editorRef.current) editorRef.current.innerHTML = sanitizeRichText(activeDocument.html)
  }, [activeDocumentId, resetVersion])

  useEffect(() => {
    const pending = pendingMatchRef.current
    if (!pending || pending.columnId !== activeDocumentId || !editorRef.current) return
    pendingMatchRef.current = null
    window.setTimeout(() => jumpToMatch(pending), 0)
  }, [activeDocumentId, resetVersion])

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

  const addDocument = () => {
    const now = new Date().toISOString()
    const document = { id: createId(), title: '新建文档', html: '<p><br></p>', updatedAt: now, collapsed: false }
    onChange([...columns, document])
    setSearchOpen(false)
    setQuery('')
    setActiveDocumentId(document.id)
  }

  const requestDeleteDocument = (columnId: string) => {
    const document = columns.find((column) => column.id === columnId)
    if (document) setPendingDelete(document)
  }

  const confirmDeleteDocument = () => {
    if (!pendingDelete) return
    const index = columns.findIndex((item) => item.id === pendingDelete.id)
    if (index < 0) { setPendingDelete(null); return }
    let nextColumns = columns.filter((item) => item.id !== pendingDelete.id)
    if (nextColumns.length === 0) nextColumns = [{ id: createId(), title: '主文档', html: '<p><br></p>', updatedAt: null, collapsed: false }]
    setPendingDelete(null)
    onChange(nextColumns)
    if (activeDocumentId === pendingDelete.id) setActiveDocumentId(null)
    window.setTimeout(() => titleInputRef.current?.focus(), 0)
  }

  const toggleSearch = () => {
    if (searchOpen) {
      setQuery('')
      setSearchOpen(false)
      window.setTimeout(() => searchButtonRef.current?.focus(), 0)
    } else setSearchOpen(true)
  }

  const moveDocument = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= columns.length) return
    const reordered = [...columns]
    ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
    onChange(reordered)
  }

  const jumpToMatch = (match: SearchMatch) => {
    const root = editorRef.current
    if (!root) return
    const source = collectEditorText(root)
    const normalized = normalizeSearchText(source.text)
    const sourceStart = normalized.sourceRanges[match.start]?.start
    const sourceEnd = normalized.sourceRanges[match.end - 1]?.end
    if (sourceStart === undefined || sourceEnd === undefined) return
    let startPoint: TextNodePoint | null = null
    for (let offset = sourceStart; offset < source.points.length && !startPoint; offset += 1) startPoint = source.points[offset]
    let endPoint: TextNodePoint | null = null
    for (let offset = sourceEnd - 1; offset >= 0 && !endPoint; offset -= 1) endPoint = source.points[offset]
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
    pendingMatchRef.current = match.source === 'body' ? match : null
    setSearchOpen(false)
    setQuery('')
    setActiveDocumentId(match.columnId)
  }

  const toolbar = [
    { label: '正文', icon: <AlignLeft size={16} />, command: 'paragraph' as const },
    { label: '二级标题', icon: <Heading2 size={16} />, command: 'heading2' as const },
    { label: '加粗', icon: <Bold size={16} />, command: 'bold' as const },
    { label: '斜体', icon: <Italic size={16} />, command: 'italic' as const },
    { label: '下划线', icon: <Underline size={16} />, command: 'underline' as const },
    { label: '项目符号列表', icon: <List size={16} />, command: 'unorderedList' as const },
    { label: '编号列表', icon: <ListOrdered size={16} />, command: 'orderedList' as const },
  ].map((item: { label: string; icon: React.ReactNode; command: RichTextCommand }) => ({
    ...item,
    run: () => {
      const editor = editorRef.current
      if (!editor || !activeDocument) return
      editor.focus()
      if (!applyRichTextCommand(editor, item.command)) return
      updateColumn(activeDocument.id, (column) => ({ ...column, html: sanitizeRichText(editor.innerHTML), updatedAt: new Date().toISOString() }))
    },
  }))

  const saveEditor = (editor: HTMLDivElement) => {
    if (!activeDocument) return
    updateColumn(activeDocument.id, (column) => ({ ...column, html: sanitizeRichText(editor.innerHTML), updatedAt: new Date().toISOString() }))
  }

  useEffect(() => {
    if (!activeDocumentId) return
    const handleEditorEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.keyCode === 229) return
      if (pendingDelete || searchOpen || document.querySelector('[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]')) return
      event.preventDefault()
      if (editorRef.current) saveEditor(editorRef.current)
      setActiveDocumentId(null)
    }
    window.addEventListener('keydown', handleEditorEscape)
    return () => window.removeEventListener('keydown', handleEditorEscape)
  }, [activeDocumentId, columns, pendingDelete, searchOpen])

  return (
    <div className="index-page">
      <div className="index-page-heading">
        <div><h2>工作 Index</h2></div>
        <div className="index-page-actions">
          {!activeDocument && <button type="button" className="button button-primary" onClick={addDocument}><Plus size={15} />新增文档</button>}
          {searchOpen && <div className="index-search-inline"><Search size={15} /><input ref={searchInputRef} aria-label="搜索 Index 文档标题或内容" placeholder="搜索文档标题或内容…" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <span>{matches.length} 处</span>}<button type="button" className="index-search-close" aria-label="关闭 Index 搜索" onClick={toggleSearch}><X size={15} /></button></div>}
          {!activeDocument && <button ref={searchButtonRef} type="button" className={`index-search-button ${searchOpen ? 'index-search-button-active' : ''}`} title="搜索 Index 文档" aria-label="搜索 Index 文档" aria-expanded={searchOpen} onClick={toggleSearch}><Search size={17} /></button>}
        </div>
      </div>
      {searchOpen && query && <div className="search-results" aria-label="Index 搜索结果">
        {matches.length === 0 ? <p>没有找到匹配内容。</p> : matches.map((item, index) => <button type="button" key={`${item.columnId}-${item.start}-${item.end}`} onClick={() => selectMatch(item)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item.columnTitle}</strong>{item.text}</button>)}
      </div>}
      {activeDocument ? <section className="index-editor-view" aria-label="Index 文档编辑器">
        <button type="button" className="index-back-button" onClick={() => setActiveDocumentId(null)}><ChevronLeft size={16} />返回列表</button>
        <header className="index-editor-heading">
          <div className="index-editor-title-group">
            <span className="index-document-number">{String(columns.findIndex((column) => column.id === activeDocument.id) + 1).padStart(2, '0')}</span>
            <input ref={titleInputRef} aria-label="文档标题" value={activeDocument.title} onChange={(event) => updateColumn(activeDocument.id, (column) => ({ ...column, title: event.target.value }))} />
            <p>最近编辑：{activeDocument.updatedAt ? new Date(activeDocument.updatedAt).toLocaleString() : '尚未编辑'}</p>
          </div>
          <div className="index-column-controls">
            <button type="button" aria-label="上移文档" title="上移" disabled={columns.findIndex((column) => column.id === activeDocument.id) === 0} onClick={() => moveDocument(columns.findIndex((column) => column.id === activeDocument.id), -1)}><ChevronUp size={17} /></button>
            <button type="button" aria-label="下移文档" title="下移" disabled={columns.findIndex((column) => column.id === activeDocument.id) === columns.length - 1} onClick={() => moveDocument(columns.findIndex((column) => column.id === activeDocument.id), 1)}><ChevronDown size={17} /></button>
            <button type="button" className="index-column-delete" aria-label={`删除文档：${activeDocument.title || '未命名文档'}`} title="删除文档" onClick={() => requestDeleteDocument(activeDocument.id)}><Trash2 size={15} /></button>
          </div>
        </header>
        <div className="index-editor-shell">
          <div className="index-actions"><div className="editor-toolbar" aria-label="文档文字格式">
            {toolbar.map((item) => <button type="button" key={item.label} title={item.label} aria-label={`文档：${item.label}`} onMouseDown={(event) => event.preventDefault()} onClick={item.run}>{item.icon}</button>)}
          </div></div>
          <div className="index-writing-area" onClick={(event) => {
            if (event.target !== event.currentTarget) return
            const editor = editorRef.current
            if (!editor) return
            editor.focus()
            const range = document.createRange()
            range.selectNodeContents(editor)
            range.collapse(false)
            const selection = window.getSelection()
            selection?.removeAllRanges()
            selection?.addRange(range)
          }}><div className="rich-editor" ref={editorRef} contentEditable suppressContentEditableWarning spellCheck={false} role="textbox" aria-label={`${activeDocument.title || '当前文档'}内容`} aria-multiline="true" onInput={(event) => saveEditor(event.currentTarget)} /></div>
          <footer className="index-document-footer"><span>自动保存到当前工作区</span><span>支持标题、段落、列表与基础文字格式</span></footer>
        </div>
      </section> : <div className="index-document-list" role="region" aria-label="Index 文档目录">
        {columns.map((column, index) => {
          const summary = plainTextFromHtml(column.html).replace(/\s+/g, ' ').trim()
          return <article className="index-document-row" key={column.id}>
            <button type="button" className="index-row-main" aria-label={`打开文档：${column.title || '未命名文档'}`} onClick={() => setActiveDocumentId(column.id)}>
              <span className="index-row-number">{String(index + 1).padStart(2, '0')}</span>
              <strong className="index-row-title">{column.title || '未命名文档'}</strong>
              <span className="index-row-summary" title={summary}>{summary || '暂无正文'}</span>
              <ChevronRight className="index-row-arrow" size={17} aria-hidden="true" />
            </button>
            <div className="index-column-controls index-row-controls">
              <button type="button" aria-label={`将 ${column.title || '文档'} 上移`} title="上移" disabled={index === 0} onClick={() => moveDocument(index, -1)}><ChevronUp size={16} /></button>
              <button type="button" aria-label={`将 ${column.title || '文档'} 下移`} title="下移" disabled={index === columns.length - 1} onClick={() => moveDocument(index, 1)}><ChevronDown size={16} /></button>
              <button type="button" className="index-column-delete" aria-label={`删除文档：${column.title || '未命名文档'}`} title="删除文档" onClick={() => requestDeleteDocument(column.id)}><Trash2 size={15} /></button>
            </div>
          </article>
        })}
      </div>}
      {saveState.status === 'error' && <div className="storage-warning">保存遇到问题：{saveState.message}。建议立即导出备份。</div>}
      <div className="index-private-note"><span>只存储在这台设备的本地工作区</span><span>·</span><Button variant="ghost" onClick={() => window.dispatchEvent(new CustomEvent('open-backup-settings'))}>导入 / 导出备份</Button></div>
      {pendingDelete && <ConfirmDialog title={`删除“${pendingDelete.title || '未命名文档'}”？`} message={`${plainTextFromHtml(pendingDelete.html).trim() ? '文档内容也会一并删除。' : ''}此操作不可撤销。确认后才会保存更改。`} onClose={() => setPendingDelete(null)} onConfirm={confirmDeleteDocument} confirmLabel="删除文档" />}
    </div>
  )
}
