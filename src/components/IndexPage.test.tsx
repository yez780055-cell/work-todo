import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IndexPage } from './IndexPage'

describe('Index primary editor layout', () => {
  it('places the editable document first, without an oversized introduction card', () => {
    const { container } = render(
      <IndexPage html="<p>运营记录</p>"
        saveState={{ status: 'saved', message: '已保存到本机', savedAt: null }}
        onChange={() => undefined} resetVersion={0} />,
    )
    const root = container.querySelector('.index-page')
    expect(root?.firstElementChild?.classList.contains('index-document-card')).toBe(true)
    expect(container.querySelector('.index-cover')).toBeNull()
    expect(screen.getByRole('textbox', { name: '工作 Index 主文档' })).toBeTruthy()
  })
})
