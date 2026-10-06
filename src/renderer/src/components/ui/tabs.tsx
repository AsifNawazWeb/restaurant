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
    <div className={cn('inline-flex items-center gap-1 rounded-xl border border-border bg-surface-2 p-1', className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg px-3 h-7 text-[12px] font-medium transition-all',
            active === t.id
              ? 'bg-surface text-foreground shadow-sm'
              : 'text-foreground-muted hover:text-foreground'
          )}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  )
}
