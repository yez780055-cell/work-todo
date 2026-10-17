import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog, Modal } from './common'

function ModalHarness() {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" onClick={() => setOpen(true)}>打开弹窗</button>
    {open && <Modal title="键盘测试弹窗" onClose={() => setOpen(false)}>
      <input aria-label="弹窗输入框" />
      <button type="button">最后一个操作</button>
    </Modal>}
  </>
}

describe('modal focus and keyboard behavior', () => {
  it('moves focus into the dialog, traps Tab in both directions, closes on Escape, and restores focus', async () => {
    render(<ModalHarness />)
    const trigger = screen.getByRole('button', { name: '打开弹窗' })
    trigger.focus()
    fireEvent.click(trigger)

    const dialog = screen.getByRole('dialog', { name: '键盘测试弹窗' })
    const close = screen.getByRole('button', { name: '关闭' })
    const lastAction = screen.getByRole('button', { name: '最后一个操作' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(close)

    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(lastAction)
    fireEvent.keyDown(lastAction, { key: 'Tab' })
    expect(document.activeElement).toBe(close)

    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(close, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '键盘测试弹窗' })).toBeNull())
    expect(document.activeElement).toBe(trigger)
  })

  it('focuses the safe cancel action and treats Escape as a single cancellation', async () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    render(<ConfirmDialog title="删除项目？" message="此操作无法撤销。" onClose={onClose} onConfirm={onConfirm} />)
    const dialog = screen.getByRole('alertdialog', { name: '删除项目？' })
    const cancel = screen.getByRole('button', { name: '取消' })
    await waitFor(() => expect(document.activeElement).toBe(cancel))

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('runs a confirmed action at most once even if the button receives repeated clicks', () => {
    const onClose = vi.fn()
    const onConfirm = vi.fn()
    render(<ConfirmDialog title="覆盖数据？" message="现有数据将被替换。" onClose={onClose} onConfirm={onConfirm} confirmLabel="覆盖并导入" />)
    const confirm = screen.getByRole('button', { name: '覆盖并导入' })

    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })
})
