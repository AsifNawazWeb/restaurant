import { useEffect, useState } from 'react'
import { Database, Printer } from 'lucide-react'
import { useUi } from '@/stores/ui'
import { cn } from '@/lib/utils'

export function StatusBar() {
  const { dbOk, printerOk, printerMessage } = useUi()
  const [clock, setClock] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const time = clock.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <footer className="flex h-[28px] shrink-0 items-center justify-between border-t border-border bg-surface px-3 text-[11px] text-foreground-muted">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className={cn('h-1.5 w-1.5 rounded-full', dbOk ? 'bg-success' : 'bg-danger animate-pulse')} />
          <Database size={11} />
          Offline Local SQLite (WAL Mode)
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              printerOk === true ? 'bg-success' : printerOk === false ? 'bg-warning' : 'bg-foreground-muted'
            )}
          />
          <Printer size={11} />
          ESC/POS Thermal 80mm {printerOk === true ? 'Connected' : printerMessage.slice(0, 40)}
        </span>
      </div>
      <span className="tabular">{time}</span>
    </footer>
  )
}
