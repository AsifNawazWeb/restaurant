import * as React from 'react'
import { cn } from '@/lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-lg border border-border bg-surface px-3 text-[13px] text-foreground placeholder:text-foreground-muted',
        'focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-shadow',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-foreground placeholder:text-foreground-muted',
        'focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-shadow resize-none',
        className
      )}
      {...props}
    />
  )
)
Textarea.displayName = 'Textarea'

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-[13px] text-foreground',
        'focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60',
        className
      )}
      {...props}
    />
  )
)
Select.displayName = 'Select'
