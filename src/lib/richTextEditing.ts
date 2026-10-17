export type RichTextCommand = 'paragraph' | 'heading2' | 'bold' | 'italic' | 'underline' | 'unorderedList' | 'orderedList'

type TextSelection = { node: Text; start: number; end: number }

const INLINE_TAGS: Record<'bold' | 'italic' | 'underline', string> = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
}
const BLOCK_TAGS = new Set(['P', 'H2', 'H3', 'BLOCKQUOTE', 'UL', 'OL'])
const FORMATTABLE_BLOCKS = new Set(['P', 'H2', 'H3', 'BLOCKQUOTE'])

export function applyRichTextCommand(editor: HTMLElement, command: RichTextCommand): boolean {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return false
  const range = selection.getRangeAt(0)
  if (!editor.contains(range.commonAncestorContainer)) return false

  if (command === 'bold' || command === 'italic' || command === 'underline') {
    return applyInlineFormat(editor, selection, range, INLINE_TAGS[command])
  }

  const blocks = getSelectedBlocks(editor, range)
  if (blocks.length === 0) return false
  if (command === 'paragraph' || command === 'heading2') {
    const tagName = command === 'paragraph' ? 'P' : 'H2'
    let changed = false
    const replacements = blocks.filter((block) => FORMATTABLE_BLOCKS.has(block.tagName)).map((block) => {
      if (block.tagName === tagName) return block
      changed = true
      return replaceElementTag(block, tagName)
    })
    restoreBlockSelection(editor, selection, replacements.filter((block): block is HTMLElement => Boolean(block)))
    return changed
  }

  const listTag = command === 'unorderedList' ? 'UL' : 'OL'
  return applyListFormat(editor, selection, range, blocks, listTag)
}

function applyInlineFormat(editor: HTMLElement, selection: Selection, range: Range, tagName: string): boolean {
  if (range.collapsed) return false
  const segments = collectTextSegments(editor, range)
  if (segments.length === 0) return false
  const selector = tagName === 'strong' ? 'strong,b' : tagName === 'em' ? 'em,i' : 'u'
  const marked = segments.map(({ node }) => node.parentElement?.closest(selector))
  const allAlreadyMarked = marked.every(Boolean)

  const selectedNodes = new Map<Text, Text>()
  let changed = false
  for (const segment of [...segments].reverse()) {
    const { node } = segment
    const selectedNode = splitTextSegment(segment)
    const existingFormat = selectedNode.parentElement?.closest(selector)
    if (allAlreadyMarked) {
      if (existingFormat && existingFormat.textContent === selectedNode.textContent) {
        existingFormat.replaceWith(...Array.from(existingFormat.childNodes))
        changed = true
      }
      selectedNodes.set(node, selectedNode)
      continue
    }
    if (existingFormat) {
      selectedNodes.set(node, selectedNode)
      continue
    }
    const wrapper = editor.ownerDocument.createElement(tagName)
    selectedNode.parentNode?.insertBefore(wrapper, selectedNode)
    wrapper.appendChild(selectedNode)
    selectedNodes.set(node, selectedNode)
    changed = true
  }
  const orderedNodes = segments.map(({ node }) => selectedNodes.get(node)).filter((node): node is Text => Boolean(node))
  if (orderedNodes.length > 0) {
    const nextRange = editor.ownerDocument.createRange()
    nextRange.setStart(orderedNodes[0], 0)
    nextRange.setEnd(orderedNodes[orderedNodes.length - 1], orderedNodes[orderedNodes.length - 1].length)
    selection.removeAllRanges()
    selection.addRange(nextRange)
  }
  return changed
}

function splitTextSegment({ node, start, end }: TextSelection): Text {
  if (end < node.length) node.splitText(end)
  return start > 0 ? node.splitText(start) : node
}

function collectTextSegments(editor: HTMLElement, range: Range): TextSelection[] {
  const walker = editor.ownerDocument.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
  const segments: TextSelection[] = []
  let node = walker.nextNode()
  while (node) {
    const textNode = node as Text
    if (textNode.length > 0 && range.intersectsNode(textNode)) {
      const start = range.startContainer === textNode ? range.startOffset : 0
      const end = range.endContainer === textNode ? range.endOffset : textNode.length
      if (end > start) segments.push({ node: textNode, start, end })
    }
    node = walker.nextNode()
  }
  return segments
}

function getSelectedBlocks(editor: HTMLElement, range: Range): HTMLElement[] {
  const children = Array.from(editor.children).filter((element): element is HTMLElement => element instanceof HTMLElement && BLOCK_TAGS.has(element.tagName))
  if (!range.collapsed) return children.filter((element) => range.intersectsNode(element))

  let node: Node | null = range.startContainer
  if (node === editor) {
    node = editor.children[Math.min(range.startOffset, editor.children.length - 1)] ?? editor.children[range.startOffset - 1] ?? null
  }
  while (node && node.parentNode !== editor) node = node.parentNode
  return node instanceof HTMLElement && children.includes(node) ? [node] : []
}

function replaceElementTag(element: HTMLElement, tagName: string): HTMLElement {
  const replacement = element.ownerDocument.createElement(tagName.toLowerCase())
  while (element.firstChild) replacement.appendChild(element.firstChild)
  element.replaceWith(replacement)
  return replacement
}

function applyListFormat(editor: HTMLElement, selection: Selection, range: Range, blocks: HTMLElement[], tagName: 'UL' | 'OL'): boolean {
  const listBlocks = blocks.filter((block) => block.tagName === 'UL' || block.tagName === 'OL')
  if (listBlocks.length === 1 && blocks.length === 1) {
    const list = listBlocks[0]
    const items = Array.from(list.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element.tagName === 'LI')
    const selectedItems = items.filter((item) => range.collapsed ? item.contains(range.startContainer) : range.intersectsNode(item))
    if (selectedItems.length === items.length && items.length > 0) {
      if (list.tagName === tagName) {
        const fragment = editor.ownerDocument.createDocumentFragment()
        const paragraphs: HTMLElement[] = []
        items.forEach((item) => {
          const paragraph = editor.ownerDocument.createElement('p')
          while (item.firstChild) paragraph.appendChild(item.firstChild)
          paragraphs.push(paragraph)
          fragment.appendChild(paragraph)
        })
        list.replaceWith(fragment)
        restoreBlockSelection(editor, selection, paragraphs)
      } else {
        const replacement = replaceElementTag(list, tagName)
        restoreBlockSelection(editor, selection, [replacement])
      }
      return true
    }
    return false
  }

  const eligible = blocks.filter((block) => FORMATTABLE_BLOCKS.has(block.tagName))
  if (eligible.length === 0) return false
  const selected = new Set(eligible)
  const directChildren = Array.from(editor.children)
  const groups: HTMLElement[][] = []
  let current: HTMLElement[] = []
  directChildren.forEach((child) => {
    if (child instanceof HTMLElement && selected.has(child)) current.push(child)
    else if (current.length) { groups.push(current); current = [] }
  })
  if (current.length) groups.push(current)

  const replacementLists = groups.map((group) => {
    const list = editor.ownerDocument.createElement(tagName.toLowerCase())
    group.forEach((block) => {
      const item = editor.ownerDocument.createElement('li')
      while (block.firstChild) item.appendChild(block.firstChild)
      list.appendChild(item)
    })
    group[0].replaceWith(list)
    group.slice(1).forEach((block) => block.remove())
    return list
  })
  restoreBlockSelection(editor, selection, replacementLists)
  return true
}

function restoreBlockSelection(editor: HTMLElement, selection: Selection, blocks: HTMLElement[]): void {
  const first = blocks[0]
  const last = blocks[blocks.length - 1]
  if (!first || !last) return
  try {
    const nextRange = editor.ownerDocument.createRange()
    nextRange.setStart(first, 0)
    nextRange.setEnd(last, last.childNodes.length)
    selection.removeAllRanges()
    selection.addRange(nextRange)
  } catch {
    const caret = editor.ownerDocument.createRange()
    caret.selectNodeContents(editor)
    caret.collapse(false)
    selection.removeAllRanges()
    selection.addRange(caret)
  }
}
