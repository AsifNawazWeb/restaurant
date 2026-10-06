import { cn } from '@/lib/utils'

export function EmptyState({ icon, title, hint, className }: { icon?: React.ReactNode; title: string; hint?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 py-10 text-center', className)}>
      {icon && <div className="text-foreground-muted opacity-60">{icon}</div>}
      <div className="text-[13px] font-medium text-foreground-secondary">{title}</div>
      {hint && <div className="max-w-[280px] text-[12px] text-foreground-muted">{hint}</div>}
    </div>
  )
}
