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
  if (typeof DOMParser === 'undefined') return html.replace(/<[^>]*>/g, ' ')
  return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? ''
}

export function getSearchSnippets(html: string, query: string): Array<{ index: number; text: string }> {
  const term = query.trim()
  if (!term) return []
  const text = plainTextFromHtml(html).replace(/\s+/g, ' ').trim()
  const lower = text.toLocaleLowerCase()
  const needle = term.toLocaleLowerCase()
  const matches: Array<{ index: number; text: string }> = []
  let cursor = 0
  while (matches.length < 12) {
    const index = lower.indexOf(needle, cursor)
    if (index < 0) break
    const start = Math.max(0, index - 35)
    const end = Math.min(text.length, index + term.length + 55)
    matches.push({ index, text: `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}` })
    cursor = index + Math.max(1, term.length)
  }
  return matches
}
