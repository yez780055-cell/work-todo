import indexHtml from '../../index.html?raw'
import { describe, expect, it } from 'vitest'

describe('browser favicon', () => {
  it('declares the local SVG icon so Chromium does not request a missing default favicon', () => {
    expect(indexHtml).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />')
  })
})
