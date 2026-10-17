import { useEffect, useState } from 'react'
import { Check, Keyboard, RotateCcw } from 'lucide-react'
import { Button, Modal } from './common'
import { SHORTCUT_DEFINITIONS, createDefaultShortcutSettings, formatShortcut, shortcutFromKeyEvent, type ShortcutBinding, type ShortcutId, type ShortcutSettings } from '../lib/shortcuts'
import type { ShortcutSettingsController } from '../useShortcutSettings'

export function ShortcutSettingsPage({ controller, isWindowsDesktop }: {
  controller: ShortcutSettingsController
  isWindowsDesktop: boolean
}) {
  const [editingId, setEditingId] = useState<ShortcutId | null>(null)
  const [draft, setDraft] = useState<ShortcutSettings | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    if (!capturing) return
    const captureKey = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.isComposing || event.keyCode === 229) return
      if (event.key === 'Escape') {
        setCapturing(false)
        setFeedback('')
        return
      }
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return
      if (!editingId || !draft) return
      if (event.key === 'Backspace' || event.key === 'Delete') {
        setDraft({ ...draft, bindings: { ...draft.bindings, [editingId]: { ...draft.bindings[editingId], shortcut: '', enabled: false } } })
        setCapturing(false)
        return
      }
      const shortcut = shortcutFromKeyEvent(event)
      if (!shortcut) {
        setFeedback('此按键暂不支持。请使用 A–Z、0–9 或 F1–F12。')
        return
      }
      setDraft({ ...draft, bindings: { ...draft.bindings, [editingId]: { ...draft.bindings[editingId], shortcut, enabled: true } } })
      setCapturing(false)
      setFeedback('')
    }
    window.addEventListener('keydown', captureKey, true)
    return () => window.removeEventListener('keydown', captureKey, true)
  }, [capturing, draft, editingId])

  const openEditor = (id: ShortcutId, next?: ShortcutBinding) => {
    setEditingId(id)
    setDraft({
      ...controller.settings,
      bindings: { ...controller.settings.bindings, [id]: { ...(next ?? controller.settings.bindings[id]) } },
    })
    setCapturing(false)
    setFeedback('')
  }

  const closeEditor = () => {
    if (saving) return
    setEditingId(null)
    setDraft(null)
    setCapturing(false)
    setFeedback('')
  }

  const edited = editingId ? SHORTCUT_DEFINITIONS.find((item) => item.id === editingId) : undefined
  const currentDraft = editingId && draft ? draft.bindings[editingId] : null

  const saveDraft = async () => {
    if (!editingId || !currentDraft) return
    setSaving(true)
    setFeedback('')
    const result = await controller.updateBinding(editingId, currentDraft)
    setSaving(false)
    if (!result.ok) {
      setFeedback(result.message ?? '无法保存快捷键设置。')
      return
    }
    closeEditor()
  }

  const groups = [
    { scope: 'window' as const, title: '窗口内快捷键', detail: '仅 Work Todo 窗口获得焦点时生效。' },
    { scope: 'global' as const, title: 'Windows 全局快捷键', detail: '应用在后台时也可唤起窗口并打开对应功能。' },
  ]

  return <section className="shortcut-settings-page">
    <div className="shortcut-settings-intro"><div className="shortcut-settings-intro-icon"><Keyboard size={20} /></div><div><h2>快捷键</h2><p>设置快速新建任务和任务搜索的键盘组合。</p></div></div>
    {controller.warning && <p className="shortcut-settings-warning" role="status">{controller.warning}</p>}
    {groups.map((group) => <section className="shortcut-settings-group" key={group.scope} aria-labelledby={`shortcut-group-${group.scope}`}>
      <header><div><h3 id={`shortcut-group-${group.scope}`}>{group.title}</h3><p>{group.detail}</p></div></header>
      {group.scope === 'global' && !isWindowsDesktop && <div className="shortcut-unsupported" role="status">当前运行环境不支持注册系统级快捷键。此组设置仅可在 Windows 桌面应用中启用。</div>}
      {group.scope === 'global' && isWindowsDesktop && <div className="shortcut-focus-note">全局按键会尝试显示并聚焦主窗口；最小化窗口可恢复。若窗口已关闭，应用无法接收快捷键。请留意与其他程序的组合键冲突。</div>}
      <div className="shortcut-setting-list">
        {SHORTCUT_DEFINITIONS.filter((item) => item.scope === group.scope).map((definition) => {
          const binding = controller.settings.bindings[definition.id]
          const status = controller.statuses[definition.id]
          const unavailable = definition.scope === 'global' && !isWindowsDesktop
          return <article className="shortcut-setting-row" key={definition.id}>
            <div className="shortcut-setting-copy"><strong>{definition.label}</strong><small>{definition.description}</small><span className={`shortcut-status shortcut-status-${status.state}`} title={status.message}>{status.message || status.state}</span></div>
            <div className="shortcut-setting-controls">
              <kbd>{binding.enabled ? formatShortcut(binding.shortcut) : '未分配'}</kbd>
              <Button aria-label={`编辑${group.title}：${definition.label}`} disabled={unavailable || !controller.ready} onClick={() => openEditor(definition.id)}>编辑</Button>
              <Button aria-label={`${binding.enabled ? '停用' : '启用'}${group.title}：${definition.label}`} disabled={unavailable || !controller.ready} onClick={() => openEditor(definition.id, { ...binding, enabled: !binding.enabled })}>{binding.enabled ? '停用' : '启用'}</Button>
              <button className="shortcut-reset-button" type="button" aria-label={`恢复${group.title}默认值：${definition.label}`} title="恢复默认值" disabled={unavailable || !controller.ready} onClick={() => openEditor(definition.id, createDefaultShortcutSettings().bindings[definition.id])}><RotateCcw size={15} /></button>
            </div>
          </article>
        })}
      </div>
    </section>)}

    {edited && currentDraft && <Modal title={`设置快捷键 · ${edited.label}`} subtitle={edited.scope === 'global' ? 'Windows 全局快捷键必须包含 Ctrl 和至少另一个修饰键。' : '仅接受字母、数字或 F1–F12，可组合修饰键。'} onClose={closeEditor} closeOnEscape={!capturing}>
      <div className="shortcut-editor-content">
        <label className="shortcut-enabled-toggle"><input type="checkbox" checked={currentDraft.enabled} onChange={(event) => setDraft({ ...draft!, bindings: { ...draft!.bindings, [edited.id]: { ...currentDraft, enabled: event.target.checked } } })} />启用此快捷键</label>
        <div className="shortcut-capture-row"><div><span>按键组合</span><small>按“录入组合键”后，同时按下想使用的修饰键和字母或功能键。</small></div><kbd>{currentDraft.shortcut ? formatShortcut(currentDraft.shortcut) : '未分配'}</kbd><Button autoFocus={false} aria-label={capturing ? '正在录入快捷键，按 Esc 取消录入' : '录入组合键'} onClick={() => { setCapturing(true); setFeedback('请按下快捷键；按 Esc 取消录入，Backspace 清除。') }}>{capturing ? '请按键…' : '录入组合键'}</Button></div>
        {capturing && <p className="shortcut-capture-hint" role="status">按下组合键，按 Esc 取消；Backspace 或 Delete 清除绑定。</p>}
        {feedback && <p className="shortcut-editor-feedback" role="status">{feedback}</p>}
        <p className="shortcut-preview"><span>预览</span><strong>{currentDraft.enabled && currentDraft.shortcut ? formatShortcut(currentDraft.shortcut) : '快捷键已停用'}</strong></p>
        {controller.statuses[edited.id].state === 'conflict' && <p className="shortcut-editor-feedback">{controller.statuses[edited.id].message}</p>}
      </div>
      <footer className="modal-footer"><Button onClick={closeEditor} disabled={saving}>取消</Button><Button variant="primary" icon={<Check size={15} />} onClick={() => void saveDraft()} disabled={saving || !controller.ready}>{saving ? '正在保存…' : '保存设置'}</Button></footer>
    </Modal>}
  </section>
}
