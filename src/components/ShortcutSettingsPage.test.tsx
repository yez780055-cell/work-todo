import { useSyncExternalStore } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ShortcutSettingsPage } from './ShortcutSettingsPage'
import { createDefaultShortcutSettings } from '../lib/shortcuts'
import { ShortcutRuntime } from '../lib/shortcutRuntime'
import type { SettingsStorage } from '../lib/shortcutSettings'
import type { ShortcutSettingsController } from '../useShortcutSettings'

let runtime: ShortcutRuntime
let stored = createDefaultShortcutSettings()

function Harness() {
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot)
  const controller: ShortcutSettingsController = { ...snapshot, updateBinding: (id, binding) => runtime.updateBinding(id, binding) }
  return <ShortcutSettingsPage controller={controller} isWindowsDesktop={false} />
}

beforeEach(async () => {
  stored = createDefaultShortcutSettings()
  const storage: SettingsStorage = {
    load: () => ({ settings: structuredClone(stored), warning: null }),
    save: (settings) => { stored = structuredClone(settings) },
  }
  runtime = new ShortcutRuntime({ storage, loadAdapter: async () => { throw new Error('not expected in browser') }, onGlobalAction: () => undefined })
  await act(async () => { await runtime.start(false) })
})

describe('shortcut settings screen', () => {
  it('explains and disables global controls in browser environments', () => {
    render(<Harness />)
    expect(screen.getByText(/当前运行环境不支持注册系统级快捷键/).textContent).toContain('此组设置仅可在 Windows 桌面应用中启用')
    expect((screen.getByRole('button', { name: '编辑Windows 全局快捷键：快速新建任务' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('previews a captured window binding and keeps the saved value when canceled', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '编辑窗口内快捷键：快速新建任务' }))
    fireEvent.click(screen.getByRole('button', { name: '录入组合键' }))
    fireEvent.keyDown(screen.getByRole('button', { name: '正在录入快捷键，按 Esc 取消录入' }), { key: 'F4' })
    expect(screen.getByText('F4', { selector: 'strong' })).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(runtime.getSnapshot().settings.bindings['window.quickCreate'].shortcut).toBe('N')
  })

  it('saves a captured binding and updates the visible shortcut', async () => {
    render(<Harness />)
    const quickCreateRow = screen.getAllByText('快速新建任务')[0].closest('article')!
    fireEvent.click(within(quickCreateRow).getByRole('button', { name: '编辑窗口内快捷键：快速新建任务' }))
    fireEvent.click(screen.getByRole('button', { name: '录入组合键' }))
    fireEvent.keyDown(screen.getByRole('button', { name: '正在录入快捷键，按 Esc 取消录入' }), { key: 'F4' })
    fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
    await waitFor(() => expect(runtime.getSnapshot().settings.bindings['window.quickCreate'].shortcut).toBe('F4'))
    expect(within(quickCreateRow).getByText('F4')).not.toBeNull()
  })

  it('uses Escape to stop recording without closing the editor', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '编辑窗口内快捷键：快速新建任务' }))
    fireEvent.click(screen.getByRole('button', { name: '录入组合键' }))
    fireEvent.keyDown(screen.getByRole('button', { name: '正在录入快捷键，按 Esc 取消录入' }), { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: '设置快捷键 · 快速新建任务' })).not.toBeNull()
    expect(screen.getByRole('button', { name: '录入组合键' })).not.toBeNull()
  })
})
