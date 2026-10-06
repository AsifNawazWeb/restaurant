import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DialogProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
  width?: string
}

/** Floating glassmorphism modal overlay. */
export function Dialog({ open, onClose, children, className, width = 'max-w-lg' }: DialogProps) {
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-overlay backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cn(
          'relative z-10 max-h-[85vh] overflow-auto rounded-2xl border border-border bg-surface/95 shadow-2xl backdrop-blur-xl animate-in',
          width,
          className
        )}
      >
        {children}
      </div>
    </div>
  )
}

interface DialogHeaderProps {
  title: string
  description?: string
  onClose?: () => void
  right?: React.ReactNode
}

export function DialogHeader({ title, description, onClose, right }: DialogHeaderProps) {
  return (
    <div className="flex items-start justify-between border-b border-border px-5 py-3.5">
      <div>
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-[12px] text-foreground-muted">{description}</p>}
      </div>
      <div className="flex items-center gap-2">
        {right}
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-foreground-muted hover:bg-surface-2 hover:text-foreground"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  )
}

interface SheetProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  width?: string
}

/** Slide-over panel from the right. */
export function Sheet({ open, onClose, children, width = 'w-[480px]' }: SheetProps) {
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-overlay" onClick={onClose} />
      <div
        className={cn(
          'absolute inset-y-0 right-0 flex max-w-full flex-col border-l border-border bg-surface shadow-2xl',
          width
        )}
      >
        {children}
      </div>
    </div>
  )
}
