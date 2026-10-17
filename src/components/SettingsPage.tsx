import { useState, type ChangeEvent } from 'react'
import { Check, Download, FileUp, X } from 'lucide-react'
import { Button } from './common'
import { ShortcutSettingsPage } from './ShortcutSettingsPage'
import type { WorkspaceData } from '../lib/model'
import type { ShortcutSettingsController } from '../useShortcutSettings'

export function SettingsPage({ shortcutController, isWindowsDesktop, data, isDesktop, saveState, message, error, onExport, onImport }: {
  shortcutController: ShortcutSettingsController
  isWindowsDesktop: boolean
  data: WorkspaceData
  isDesktop: boolean
  saveState: { status: string; message: string; savedAt: string | null }
  message: string
  error: string
  onExport: () => Promise<void>
  onImport: (file?: File) => Promise<void>
}) {
  return <section className="settings-page">
    <header className="settings-page-heading"><h1>设置</h1></header>
    <ShortcutSettingsPage controller={shortcutController} isWindowsDesktop={isWindowsDesktop} />
    <BackupSettingsSection data={data} isDesktop={isDesktop} saveState={saveState} message={message} error={error} onExport={onExport} onImport={onImport} />
  </section>
}

function BackupSettingsSection({ data, isDesktop, saveState, message, error, onExport, onImport }: {
  data: WorkspaceData
  isDesktop: boolean
  saveState: { status: string; message: string; savedAt: string | null }
  message: string
  error: string
  onExport: () => Promise<void>
  onImport: (file?: File) => Promise<void>
}) {
  const [importing, setImporting] = useState(false)
  const importFromDesktop = async () => {
    setImporting(true)
    try {
      await onImport()
    } finally {
      setImporting(false)
    }
  }
  const importFromBrowser = async (event: ChangeEvent<HTMLInputElement>) => {
    setImporting(true)
    try {
      await onImport(event.target.files?.[0])
    } finally {
      event.target.value = ''
      setImporting(false)
    }
  }

  return <section className="settings-backup" aria-labelledby="settings-backup-title">
    <header className="settings-backup-heading">
      <div>
        <h2 id="settings-backup-title">本机数据与备份</h2>
        <p>{isDesktop ? '数据保存在此设备的桌面应用中，与网页端不自动同步。' : '任务与笔记保存在当前浏览器，不会自动同步到其他设备。'}</p>
      </div>
    </header>
    <div className="backup-content">
      <div className={`backup-status backup-status-${saveState.status}`}><span className="save-dot" /><div><strong>{saveState.message}</strong>{saveState.status === 'error' && <small>请先导出当前数据，避免数据丢失。</small>}</div></div>
      <div className="backup-actions">
        <Button variant="primary" icon={<Download size={16} />} onClick={() => void onExport()}>导出全部数据</Button>
        {isDesktop
          ? <Button icon={<FileUp size={16} />} disabled={importing} onClick={() => void importFromDesktop()}>{importing ? '正在读取备份…' : '导入备份'}</Button>
          : <label className="button button-secondary backup-import-label"><FileUp size={16} />导入备份<input type="file" accept="application/json,.json" disabled={importing} onChange={(event) => void importFromBrowser(event)} /></label>}
      </div>
      {importing && <p className="backup-message">正在读取备份…</p>}
      {message && <p className="backup-message"><Check size={14} />{message}</p>}
      {error && <p className="backup-error"><X size={14} />{error}</p>}
      <div className="backup-details"><span>看板任务 <strong>{data.tasks.length}</strong></span><span>例行规则 <strong>{data.routineRules.length}</strong></span><span>日历排班 <strong>{Object.keys(data.calendarOverrides).length} 天</strong></span></div>
      <p className="backup-note">备份包含任务、例行任务、工作日历和全部 Index 内容。导入会替换当前工作区数据。</p>
    </div>
  </section>
}
