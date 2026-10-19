import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const styles = readFileSync('src/styles.css', 'utf8')

describe('Index directory layout', () => {
  it('uses a compact row directory and a single readable-width editor without masonry styles', () => {
    expect(styles).toMatch(/\.index-document-list\s*\{\s*display:\s*grid;\s*gap:\s*7px;/)
    expect(styles).toMatch(/\.index-row-main\s*\{[^}]*display:\s*grid;\s*grid-template-columns:\s*38px minmax\(150px, 220px\) minmax\(0, 1fr\) 18px/)
    expect(styles).toMatch(/\.index-row-main:focus-visible\s*\{\s*outline:/)
    expect(styles).toMatch(/\.rich-editor\s*\{\s*width:\s*min\(100%, 900px\)/)
    expect(styles).not.toMatch(/\.index-column-grid|\.index-document-collapsed|columns:\s*350px|break-inside:\s*avoid-column/)
  })
})
