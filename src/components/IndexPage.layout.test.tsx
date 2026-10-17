import { useState } from 'react'
import { readFileSync } from 'node:fs'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { IndexColumn } from '../lib/model'
import { IndexPage } from './IndexPage'

const saveState = { status: 'saved' as const, message: '已保存到本机', savedAt: null }
const styles = readFileSync('src/styles.css', 'utf8')

function Harness({ initialColumns }: { initialColumns: IndexColumn[] }) {
  const [columns, setColumns] = useState(initialColumns)
  return <IndexPage columns={columns} saveState={saveState} onChange={setColumns} resetVersion={0} />
}

describe('Index independent column flow', () => {
  it('uses a real multicolumn block container so folding any card releases its vertical space', () => {
    const initialColumns: IndexColumn[] = Array.from({ length: 5 }, (_, index) => ({
      id: `column-${index + 1}`,
      title: `列 ${index + 1}`,
      html: `<p>${'长内容 '.repeat(index + 1)}</p>`,
      updatedAt: null,
      collapsed: false,
    }))
    const { container } = render(<Harness initialColumns={initialColumns} />)

    const grid = container.querySelector('.index-column-grid')!
    expect(grid.children).toHaveLength(5)
    fireEvent.click(screen.getByRole('button', { name: '折叠 列 1' }))
    expect(grid.children).toHaveLength(5)
    expect(grid.children[0].classList.contains('index-document-collapsed')).toBe(true)
    expect(grid.children[1].classList.contains('index-document-collapsed')).toBe(false)

    const stylesheet = document.createElement('style')
    stylesheet.textContent = styles
    document.head.append(stylesheet)
    const computedGridStyle = window.getComputedStyle(grid)
    const computedCardStyle = window.getComputedStyle(grid.children[0])
    expect(computedGridStyle.display).toBe('block')
    expect(computedGridStyle.getPropertyValue('columns')).toContain('350px')
    expect(computedCardStyle.getPropertyValue('break-inside')).toMatch(/avoid/)
    stylesheet.remove()

    expect(styles).toMatch(/\.index-column-grid\s*\{\s*display:\s*block;\s*columns:\s*350px;\s*column-gap:\s*16px;\s*column-fill:\s*balance;/)
    const lastGridOverride = styles.lastIndexOf('.index-column-grid { display: block; }')
    const previousGridDisplay = styles.lastIndexOf('.index-column-grid { display: grid')
    expect(lastGridOverride).toBeGreaterThan(previousGridDisplay)
    expect(styles).toMatch(/\.index-document-card\s*\{[^}]*break-inside:\s*avoid/)
  })
})
