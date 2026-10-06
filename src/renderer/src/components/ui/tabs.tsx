import * as React from 'react'
import { cn } from '@/lib/utils'

interface TabsProps {
  tabs: { id: string; label: string; icon?: React.ReactNode }[]
  active: string
  onChange: (id: string) => void
  className?: string
}

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div className={cn('flex gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1.5 shadow-sm', className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition',
            active === t.id
              ? 'bg-primary text-primary-fg shadow-sm'
              : 'text-foreground-secondary hover:bg-surface-2 hover:text-foreground'
          )}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  )
}
