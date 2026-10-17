import { describe, expect, it } from 'vitest'
import { getSearchSnippets, normalizeSearchText, plainTextFromHtml } from './richText'

describe('Index search text offsets', () => {
  it('collapses source whitespace while retaining an offset map to the original text', () => {
    const normalized = normalizeSearchText('  first\n\nsecond   target  ')
    expect(normalized.text).toBe('first second target')
    const targetOffset = normalized.text.indexOf('target')
    const sourceRange = normalized.sourceRanges[targetOffset]
    expect(sourceRange).toEqual({ start: '  first\n\nsecond   '.length, end: '  first\n\nsecond   '.length + 1 })
  })

  it('keeps paragraph boundaries as searchable whitespace and reports repeated match ranges', () => {
    const html = '<p>prefix target</p><p>more   text target</p>'
    const plainText = plainTextFromHtml(html)
    expect(plainText).toContain('\n')
    const matches = getSearchSnippets(html, 'target')
    expect(matches).toHaveLength(2)
    const normalized = normalizeSearchText(plainText).text
    expect(normalized.slice(matches[0].start, matches[0].end)).toBe('target')
    expect(normalized.slice(matches[1].start, matches[1].end)).toBe('target')
    expect(matches[1].start).toBeGreaterThan(matches[0].start)
  })
})
