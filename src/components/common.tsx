import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
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

export function Modal({ title, subtitle, onClose, children, wide = false }: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button close-button" aria-label="关闭" onClick={onClose}><X size={18} /></button>
        </header>
        {children}
      </section>
    </div>
  )
}

export function ConfirmDialog({ title, message, onClose, onConfirm, confirmLabel = '确认删除' }: {
  title: string
  message: string
  onClose: () => void
  onConfirm: () => void
  confirmLabel?: string
}) {
  const dialogRef = useRef<HTMLElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  useDialogFocus(dialogRef, cancelRef)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    dialog.addEventListener('keydown', closeOnEscape)
    return () => dialog.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return <div className="modal-backdrop confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="modal confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message" tabIndex={-1} ref={dialogRef}>
      <header className="confirm-dialog-heading"><span className="confirm-dialog-icon"><AlertTriangle size={18} /></span><div><h2 id="confirm-dialog-title">{title}</h2><p id="confirm-dialog-message">{message}</p></div><button type="button" className="icon-button close-button" aria-label="关闭确认框" onClick={onClose}><X size={17} /></button></header>
      <footer className="modal-footer"><button ref={cancelRef} type="button" className="button button-secondary confirm-cancel" aria-label="取消删除" onClick={onClose}>取消</button><Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button></footer>
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
