const ALLOWED_TAGS = new Set(['P', 'BR', 'H2', 'H3', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'BLOCKQUOTE', 'CODE'])

export function sanitizeRichText(html: string): string {
  if (typeof DOMParser === 'undefined') return html.replace(/<[^>]*>/g, '')
  const document = new DOMParser().parseFromString(html, 'text/html')
  const clean = (node: Node): Node[] => {
    if (node.nodeType === Node.TEXT_NODE) return [document.createTextNode(node.textContent ?? '')]
    if (node.nodeType !== Node.ELEMENT_NODE) return []
    const element = node as HTMLElement
    const children = Array.from(element.childNodes).flatMap(clean)
    if (!ALLOWED_TAGS.has(element.tagName)) return children
    const replacement = document.createElement(element.tagName.toLowerCase())
    children.forEach((child) => replacement.appendChild(child))
    return [replacement]
  }
  const body = document.createElement('div')
  Array.from(document.body.childNodes).flatMap(clean).forEach((node) => body.appendChild(node))
  return body.innerHTML || '<p><br></p>'
}

export function plainTextFromHtml(html: string): string {
  if (typeof DOMParser === 'undefined') {
    return html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|h[23]|li|blockquote)>/gi, '\n')
      .replace(/<[^>]*>/g, '')
  }

  const document = new DOMParser().parseFromString(html, 'text/html')
  const blocks = new Set(['P', 'H2', 'H3', 'LI', 'BLOCKQUOTE'])
  let text = ''
  const appendBreak = () => {
    if (text && !text.endsWith('\n')) text += '\n'
  }
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? ''
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const element = node as HTMLElement
    if (element.tagName === 'BR') {
      appendBreak()
      return
    }
    const isBlock = blocks.has(element.tagName)
    if (isBlock) appendBreak()
    Array.from(element.childNodes).forEach(visit)
    if (isBlock) appendBreak()
  }
  Array.from(document.body.childNodes).forEach(visit)
  return text
}

export interface NormalizedSearchText {
  text: string
  /** For each UTF-16 code unit in text, its half-open range in the source string. */
  sourceRanges: Array<{ start: number; end: number }>
}

export function normalizeSearchText(source: string): NormalizedSearchText {
  let text = ''
  const sourceRanges: Array<{ start: number; end: number }> = []
  let whitespaceStart: number | null = null
  let whitespaceEnd = 0
  let sourceOffset = 0

  for (const character of source) {
    const start = sourceOffset
    const end = start + character.length
    sourceOffset = end
    if (/\s/u.test(character)) {
      if (text) {
        whitespaceStart ??= start
        whitespaceEnd = end
      }
      continue
    }
    if (whitespaceStart !== null) {
      text += ' '
      sourceRanges.push({ start: whitespaceStart, end: whitespaceEnd })
      whitespaceStart = null
    }
    text += character
    for (let offset = 0; offset < character.length; offset += 1) sourceRanges.push({ start, end })
  }

  return { text, sourceRanges }
}

interface FoldedText {
  text: string
  sourceRanges: Array<{ start: number; end: number }>
}

function foldText(text: string): FoldedText {
  let folded = ''
  const ranges: Array<{ start: number; end: number }> = []
  let offset = 0
  for (const character of text) {
    const start = offset
    const end = start + character.length
    offset = end
    const lower = character.toLocaleLowerCase()
    folded += lower
    const sourceRange = { start, end }
    for (let index = 0; index < lower.length; index += 1) ranges.push(sourceRange)
  }
  return { text: folded, sourceRanges: ranges }
}

export function getSearchSnippets(html: string, query: string): Array<{ start: number; end: number; text: string }> {
  const normalized = normalizeSearchText(plainTextFromHtml(html))
  const normalizedQuery = normalizeSearchText(query).text
  if (!normalizedQuery) return []
  const folded = foldText(normalized.text)
  const needle = foldText(normalizedQuery).text
  const matches: Array<{ start: number; end: number; text: string }> = []
  let cursor = 0
  while (matches.length < 12) {
    const index = folded.text.indexOf(needle, cursor)
    if (index < 0) break
    const sourceStart = folded.sourceRanges[index].start
    const sourceEnd = folded.sourceRanges[index + needle.length - 1].end
    const start = Math.max(0, sourceStart - 35)
    const end = Math.min(normalized.text.length, sourceEnd + 55)
    matches.push({
      start: sourceStart,
      end: sourceEnd,
      text: `${start > 0 ? '…' : ''}${normalized.text.slice(start, end)}${end < normalized.text.length ? '…' : ''}`,
    })
    cursor = index + Math.max(1, needle.length)
  }
  return matches
}
