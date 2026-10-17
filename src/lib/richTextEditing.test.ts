import { afterEach, describe, expect, it } from 'vitest'
import { sanitizeRichText } from './richText'
import { applyRichTextCommand, type RichTextCommand } from './richTextEditing'

function createEditor(html: string): HTMLDivElement {
  const editor = document.createElement('div')
  editor.contentEditable = 'true'
  editor.innerHTML = html
  document.body.append(editor)
  return editor
}

function selectText(editor: HTMLElement, text: string): void {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode() as Text | null
  while (node && !node.textContent?.includes(text)) node = walker.nextNode() as Text | null
  if (!node) throw new Error(`Unable to find selected text: ${text}`)
  const start = node.textContent!.indexOf(text)
  const range = document.createRange()
  range.setStart(node, start)
  range.setEnd(node, start + text.length)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
}

afterEach(() => {
  document.body.innerHTML = ''
  window.getSelection()?.removeAllRanges()
})

describe('Index rich text toolbar commands', () => {
  it.each([
    ['bold', 'strong'],
    ['italic', 'em'],
    ['underline', 'u'],
  ] as Array<[RichTextCommand, string]>)('applies %s to a selected text range and keeps that selection', (command, tagName) => {
    const editor = createEditor('<p>Work Todo</p>')
    selectText(editor, 'Todo')

    expect(applyRichTextCommand(editor, command)).toBe(true)
    expect(editor.innerHTML).toBe(`<p>Work <${tagName}>Todo</${tagName}></p>`)
    expect(window.getSelection()?.toString()).toBe('Todo')
  })

  it('toggles a toolbar format off again when the same complete formatted range is selected', () => {
    const editor = createEditor('<p>Work Todo</p>')
    selectText(editor, 'Todo')
    expect(applyRichTextCommand(editor, 'bold')).toBe(true)
    expect(applyRichTextCommand(editor, 'bold')).toBe(true)
    expect(editor.innerHTML).toBe('<p>Work Todo</p>')
    expect(window.getSelection()?.toString()).toBe('Todo')
  })

  it('formats multiple selected paragraphs and headings without nesting block tags', () => {
    const editor = createEditor('<p>第一段</p><p>第二段</p>')
    const range = document.createRange()
    range.selectNodeContents(editor)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    expect(applyRichTextCommand(editor, 'heading2')).toBe(true)
    expect(editor.innerHTML).toBe('<h2>第一段</h2><h2>第二段</h2>')
    expect(applyRichTextCommand(editor, 'paragraph')).toBe(true)
    expect(editor.innerHTML).toBe('<p>第一段</p><p>第二段</p>')
  })

  it.each([
    ['unorderedList', 'ul'],
    ['orderedList', 'ol'],
  ] as Array<[RichTextCommand, string]>)('converts selected paragraphs to %s and back to paragraphs', (command, tagName) => {
    const editor = createEditor('<p>第一项</p><p>第二项</p>')
    const range = document.createRange()
    range.selectNodeContents(editor)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    expect(applyRichTextCommand(editor, command)).toBe(true)
    expect(editor.innerHTML).toBe(`<${tagName}><li>第一项</li><li>第二项</li></${tagName}>`)
    expect(applyRichTextCommand(editor, command)).toBe(true)
    expect(editor.innerHTML).toBe('<p>第一项</p><p>第二项</p>')
  })

  it('sanitizes the formatted result and ignores commands without a text selection', () => {
    const editor = createEditor('<p onclick="run()"><img src="x" onerror="run()">安全内容</p>')
    selectText(editor, '安全内容')
    expect(applyRichTextCommand(editor, 'bold')).toBe(true)
    expect(sanitizeRichText(editor.innerHTML)).toBe('<p><strong>安全内容</strong></p>')

    const collapsedEditor = createEditor('<p>未选中的文字</p>')
    const caret = document.createRange()
    caret.selectNodeContents(collapsedEditor.firstChild!)
    caret.collapse(false)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(caret)
    expect(applyRichTextCommand(collapsedEditor, 'bold')).toBe(false)
    expect(collapsedEditor.innerHTML).toBe('<p>未选中的文字</p>')
  })
})
