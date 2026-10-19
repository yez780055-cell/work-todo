import indexHtml from '../../index.html?raw'
import { describe, expect, it } from 'vitest'

describe('browser favicon', () => {
  it('declares the local PNG icon so Chromium does not request a missing default favicon', () => {
    expect(indexHtml).toContain('<link rel="icon" type="image/png" href="/favicon.png" />')
  })
})
