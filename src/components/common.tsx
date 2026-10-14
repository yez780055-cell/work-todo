import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { X } from 'lucide-react'

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
