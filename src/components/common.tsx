import { useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useDialogFocus } from './useDialogFocus'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; icon?: ReactNode }

export function Button({ variant = 'secondary', icon, className = '', children, ...props }: ButtonProps) {
  return (
    <button className={`button button-${variant} ${className}`} {...props}>
      {icon}{children}
    </button>
  )
}

export function IconButton({ label, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button className={`icon-button ${className}`} aria-label={label} title={label} {...props} />
}

export function Modal({ title, subtitle, onClose, children, wide = false, closeOnEscape = true }: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
  closeOnEscape?: boolean
}) {
  const dialogRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()
  useDialogFocus(dialogRef, closeRef, closeOnEscape ? onClose : undefined)

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={dialogRef}>
        <header className="modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button ref={closeRef} type="button" className="icon-button close-button" aria-label="关闭" onClick={onClose}><X size={18} /></button>
        </header>
        {children}
      </section>
    </div>
  )
}

export function ConfirmDialog({ title, message, onClose, onConfirm, confirmLabel = '确认删除', cancelLabel = '取消' }: {
  title: string
  message: string
  onClose: () => void
  onConfirm: () => void
  confirmLabel?: string
  cancelLabel?: string
}) {
  const dialogRef = useRef<HTMLElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const resolved = useRef(false)
  const cancel = () => {
    if (resolved.current) return
    resolved.current = true
    onClose()
  }
  const confirm = () => {
    if (resolved.current) return
    resolved.current = true
    onConfirm()
  }
  useDialogFocus(dialogRef, cancelRef, cancel)

  return <div className="modal-backdrop confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) cancel() }}>
    <section className="modal confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message" tabIndex={-1} ref={dialogRef}>
      <header className="confirm-dialog-heading"><span className="confirm-dialog-icon"><AlertTriangle size={18} /></span><div><h2 id="confirm-dialog-title">{title}</h2><p id="confirm-dialog-message">{message}</p></div><button type="button" className="icon-button close-button" aria-label="关闭确认框" onClick={cancel}><X size={17} /></button></header>
      <footer className="modal-footer"><button ref={cancelRef} type="button" className="button button-secondary confirm-cancel" aria-label={cancelLabel} onClick={cancel}>{cancelLabel}</button><Button type="button" variant="danger" onClick={confirm}>{confirmLabel}</Button></footer>
    </section>
  </div>
}

export function EmptyState({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><strong>{title}</strong><p>{detail}</p></div>
}

export function SaveIndicator({ status, message, savedAt }: { status: string; message: string; savedAt: string | null }) {
  return (
    <div className={`save-indicator save-${status}`} title={savedAt ? `保存时间：${new Date(savedAt).toLocaleTimeString()}` : message}>
      <span className="save-dot" />
      <span>{message}</span>
    </div>
  )
}
