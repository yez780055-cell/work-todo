import { useCallback, useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const MODAL_SELECTOR = '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]'

function getFocusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => !element.hasAttribute('disabled') && !element.closest('[hidden], [aria-hidden="true"]'))
}

export function useDialogFocus<TDialog extends HTMLElement>(
  dialogRef: RefObject<TDialog | null>,
  initialFocusRef: RefObject<HTMLElement | null>,
  onEscape?: () => void,
) {
  const restoreFocus = useRef(true)
  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const activeElement = document.activeElement
    const previousFocus = activeElement instanceof HTMLElement && activeElement !== document.body ? activeElement : null
    restoreFocus.current = true

    const requestedFocus = initialFocusRef.current
    const focusTarget = requestedFocus && dialog.contains(requestedFocus) && !requestedFocus.hasAttribute('disabled')
      ? requestedFocus
      : getFocusableElements(dialog)[0] ?? dialog
    focusTarget.focus()

    const keepFocusInside = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll<HTMLElement>(MODAL_SELECTOR)
      if (dialogs.item(dialogs.length - 1) !== dialog) return

      if (event.key === 'Escape' && onEscapeRef.current) {
        event.preventDefault()
        event.stopPropagation()
        onEscapeRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = getFocusableElements(dialog)
      if (focusable.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const currentFocus = document.activeElement
      if (event.shiftKey && (currentFocus === first || !dialog.contains(currentFocus))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (currentFocus === last || !dialog.contains(currentFocus))) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', keepFocusInside, true)
    return () => {
      document.removeEventListener('keydown', keepFocusInside, true)
      if (!restoreFocus.current) return
      if (previousFocus?.isConnected) {
        previousFocus.focus()
        return
      }

      const remainingDialogs = document.querySelectorAll<HTMLElement>(MODAL_SELECTOR)
      const topmostDialog = remainingDialogs.item(remainingDialogs.length - 1)
      const fallback = topmostDialog?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? topmostDialog ??
        document.querySelector<HTMLElement>('[data-dialog-focus-fallback]')
      fallback?.focus()
    }
  }, [dialogRef, initialFocusRef])

  return useCallback(() => {
    restoreFocus.current = false
  }, [])
}
