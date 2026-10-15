import { useCallback, useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useDialogFocus<TDialog extends HTMLElement>(
  dialogRef: RefObject<TDialog | null>,
  initialFocusRef: RefObject<HTMLElement | null>,
) {
  const restoreFocus = useRef(true)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    restoreFocus.current = true
    initialFocusRef.current?.focus()

    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault()
        first.focus()
      }
    }

    dialog.addEventListener('keydown', keepFocusInside)
    return () => {
      dialog.removeEventListener('keydown', keepFocusInside)
      if (restoreFocus.current && previousFocus?.isConnected) previousFocus.focus()
    }
  }, [dialogRef, initialFocusRef])

  return useCallback(() => {
    restoreFocus.current = false
  }, [])
}
