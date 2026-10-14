import { useEffect, useMemo, useRef, useState } from 'react'
import { AlignLeft, Bold, Heading2, Italic, List, ListOrdered, Search, Underline, X } from 'lucide-react'
import { getSearchSnippets, plainTextFromHtml, sanitizeRichText } from '../lib/richText'
import { Button, SaveIndicator } from './common'
import type { SaveState } from '../useWorkspace'

export function IndexPage({ html, saveState, onChange, resetVersion }: {
  html: string
  saveState: SaveState
  onChange: (html: string) => void
  resetVersion: number
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const snippets = useMemo(() => getSearchSnippets(html, query), [html, query])

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = sanitizeRichText(html)
  }, [resetVersion])

  const applyCommand = (command: string, value?: string) => {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
    if (editorRef.current) onChange(sanitizeRichText(editorRef.current.innerHTML))
  }

  const handleInput = () => {
    if (editorRef.current) onChange(sanitizeRichText(editorRef.current.innerHTML))
  }

  const jumpToMatch = (matchIndex: number) => {
    const root = editorRef.current
    if (!root || !query.trim()) return
    const content = root.textContent ?? ''
    const needle = query.trim().toLocaleLowerCase()
    let cursor = 0
    let start = -1
    for (let i = 0; i <= matchIndex; i += 1) {
      start = content.toLocaleLowerCase().indexOf(needle, cursor)
      if (start < 0) return
      cursor = start + Math.max(1, needle.length)
    }
    let end = start + needle.length
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let offset = 0
    let startNode: Text | null = null
    let endNode: Text | null = null
    let startOffset = 0
    let endOffset = 0
    while (walker.nextNode()) {
      const node = walker.currentNode as Text
      const nodeStart = offset
      const nodeEnd = offset + (node.textContent ?? '').length
      if (!startNode && start >= nodeStart && start < nodeEnd) {
        startNode = node
        startOffset = start - nodeStart
      }
      if (end > nodeStart && end <= nodeEnd) {
        endNode = node
        endOffset = end - nodeStart
        break
      }
      offset = nodeEnd
    }
    if (!startNode || !endNode) return
    const range = document.createRange()
    range.setStart(startNode, startOffset)
    range.setEnd(endNode, endOffset)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    startNode.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const matches = snippets.length
  const toolbar = [
    { label: '正文', icon: <AlignLeft size={16} />, run: () => applyCommand('formatBlock', '<p>') },
    { label: '二级标题', icon: <Heading2 size={16} />, run: () => applyCommand('formatBlock', '<h2>') },
    { label: '加粗', icon: <Bold size={16} />, run: () => applyCommand('bold') },
    { label: '斜体', icon: <Italic size={16} />, run: () => applyCommand('italic') },
    { label: '下划线', icon: <Underline size={16} />, run: () => applyCommand('underline') },
    { label: '项目符号列表', icon: <List size={16} />, run: () => applyCommand('insertUnorderedList') },
    { label: '编号列表', icon: <ListOrdered size={16} />, run: () => applyCommand('insertOrderedList') },
  ]

  return (
    <div className="index-page">
      <section className="index-document-card">
        <header className="index-document-header"><div><span className="document-type">主文档</span><h3>工作 Index</h3></div><SaveIndicator status={saveState.status} message={saveState.message} savedAt={saveState.savedAt} /></header>
        <div className="index-actions"><div className="editor-toolbar" aria-label="文字格式">
          {toolbar.map((item) => <button type="button" key={item.label} title={item.label} aria-label={item.label} onMouseDown={(event) => event.preventDefault()} onClick={item.run}>{item.icon}</button>)}
        </div><button className={`search-toggle ${query ? 'search-toggle-active' : ''}`} onClick={() => { if (!query) document.getElementById('index-search')?.focus(); else setQuery('') }} aria-label={query ? '清除搜索' : '搜索文档'}>{query ? <X size={16} /> : <Search size={16} />}<span>{query ? '清除' : '搜索'}</span></button></div>
        {query && <div className="index-search-bar"><Search size={16} /><input id="index-search" autoFocus placeholder="搜索这份文档" value={query} onChange={(event) => setQuery(event.target.value)} /><span>{matches} 处</span></div>}
        {query && <div className="search-results">
          {matches === 0 ? <p>没有找到匹配内容。</p> : snippets.map((item, index) => <button key={`${item.index}-${index}`} onClick={() => jumpToMatch(index)}><span>{index + 1}</span>{item.text}</button>)}
        </div>}
        <div className="index-writing-area">
          <div className="index-page-number">MY FIELD NOTES <span>·</span> 2026</div>
          <div
            className="rich-editor"
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            role="textbox"
            aria-label="工作 Index 主文档"
            aria-multiline="true"
            onInput={handleInput}
            onBlur={handleInput}
          />
          {plainTextFromHtml(html).trim().length === 0 && <div className="editor-placeholder">从一个工作要点开始……</div>}
        </div>
        <footer className="index-document-footer"><span>自动保存到当前浏览器</span><span>支持标题、段落、列表与基础文字格式</span></footer>
      </section>
      {saveState.status === 'error' && <div className="storage-warning">保存遇到问题：{saveState.message}。建议立即导出备份。</div>}
      <div className="index-private-note"><span>只存储在这台设备的浏览器中</span><span>·</span><Button variant="ghost" onClick={() => window.dispatchEvent(new CustomEvent('open-backup-settings'))}>导入 / 导出备份</Button></div>
    </div>
  )
}
