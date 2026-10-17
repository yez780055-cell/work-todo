import { describe, expect, it } from 'vitest'
import { createEmptyWorkspace } from './model'
import { sanitizeImportedIndexWorkspace, updateIndexWorkspace } from './indexWorkspace'

describe('Index workspace content safety', () => {
  it('does not rewrite unchanged column HTML for title, order, or collapse updates', () => {
    const current = createEmptyWorkspace()
    current.indexColumns = [
      { id: 'first', title: '首列', html: '<p><strong>保留格式</strong></p>', updatedAt: null, collapsed: false },
      { id: 'second', title: '第二列', html: '<p>另一段</p>', updatedAt: null, collapsed: false },
    ]
    current.indexDocument = { html: current.indexColumns[0].html, updatedAt: null }
    const columns = [
      { ...current.indexColumns[1], title: '改名', collapsed: true },
      { ...current.indexColumns[0], title: '首列', collapsed: false },
    ]

    const updated = updateIndexWorkspace(current, columns)
    expect(updated.indexColumns[1].html).toBe(current.indexColumns[0].html)
    expect(updated.indexColumns[0].html).toBe(current.indexColumns[1].html)
    expect(updated.indexDocument).toEqual({ html: current.indexColumns[1].html, updatedAt: null })
  })

  it('sanitizes only changed or new HTML and always synchronizes the compatibility mirror', () => {
    const current = createEmptyWorkspace()
    current.indexColumns[0] = { ...current.indexColumns[0], html: '<p>首列原文</p>', updatedAt: null }
    current.indexDocument = { html: current.indexColumns[0].html, updatedAt: null }
    const unchangedFirst = current.indexColumns[0]
    const changedSecond = { id: 'second', title: '第二列', html: '<p>安全文本</p><img src=x onerror="alert(1)">', updatedAt: null, collapsed: false }

    const updated = updateIndexWorkspace(current, [unchangedFirst, changedSecond])
    expect(updated.indexColumns[0]).toBe(unchangedFirst)
    expect(updated.indexColumns[1].html).toBe('<p>安全文本</p>')
    expect(updated.indexDocument).toEqual({ html: unchangedFirst.html, updatedAt: unchangedFirst.updatedAt })
  })

  it('sanitizes imported content once and mirrors the imported first column', () => {
    const imported = createEmptyWorkspace()
    imported.indexColumns = [
      { id: 'first', title: '首列', html: '<p onclick="run()">安全<strong>格式</strong><script>bad()</script></p>', updatedAt: null, collapsed: true },
      { id: 'second', title: '第二列', html: '<h2>保留标题</h2>', updatedAt: null, collapsed: false },
    ]
    const result = sanitizeImportedIndexWorkspace(imported)
    expect(result.indexColumns[0].html).toBe('<p>安全<strong>格式</strong></p>')
    expect(result.indexColumns[1].html).toBe('<h2>保留标题</h2>')
    expect(result.indexDocument).toEqual({ html: result.indexColumns[0].html, updatedAt: null })
    expect(result.indexColumns.map((column) => column.collapsed)).toEqual([true, false])
  })
})
