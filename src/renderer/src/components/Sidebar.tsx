import {
  LayoutDashboard,
  ShoppingBag,
  Utensils,
  Package,
  BarChart3,
  Settings,
  Lock,
  Wifi,
  ChevronUp,
  Moon,
  Sun,
  LogOut
} from 'lucide-react'
import { useUi, type ScreenId } from '@/stores/ui'
import { usePos } from '@/stores/pos'
import { api, unwrap } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { toast } from 'sonner'

const NAV: { id: ScreenId; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
  { id: 'pos', label: 'POS Billing', icon: <ShoppingBag size={16} /> },
  { id: 'menu', label: 'Menu Items', icon: <Utensils size={16} /> },
  { id: 'inventory', label: 'Stock & Inventory', icon: <Package size={16} /> },
  { id: 'reports', label: 'Reports & Shift', icon: <BarChart3 size={16} /> },
  { id: 'settings', label: 'Settings', icon: <Settings size={16} /> }
]

export function Sidebar() {
  const { screen, setScreen, theme, toggleTheme, user, shift, setLocked, setUser } = useUi()
  const clearCart = usePos((s) => s.clearCart)
  const [profileOpen, setProfileOpen] = useState(false)

  async function lock() {
    setProfileOpen(false)
    clearCart()
    setLocked(true)
  }

  async function openShiftPrompt() {
    try {
      const shiftData = await unwrap(api.shifts.current())
      if (shiftData) {
        toast.info(`Shift #${shiftData.id} is open`)
        return
      }
      const opened = await unwrap(api.shifts.open(0))
      toast.success(`Shift #${opened.id} opened`)
      const s = await unwrap(api.shifts.current())
      useUi.getState().setShift(s)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-border bg-surface">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-fg shadow-sm">
          <Utensils size={17} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-bold tracking-tight text-foreground">RestoPulse POS</div>
          <Badge variant="success" className="mt-0.5">
            <Wifi size={10} /> Offline-Ready
          </Badge>
        </div>
      </div>

      {/* Nav */}
      <nav className="mt-1 flex-1 space-y-0.5 overflow-y-auto px-2.5">
        {NAV.map((item) => {
          const active = screen === item.id
          return (
            <button
              key={item.id}
              onClick={() => setScreen(item.id)}
              className={cn(
                'group flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px] font-medium transition-all',
                active
                  ? 'border-primary/30 bg-primary-soft text-primary'
                  : 'border-transparent text-foreground-secondary hover:bg-surface-2 hover:text-foreground'
              )}
            >
              <span className={cn(active ? 'text-primary' : 'text-foreground-muted group-hover:text-foreground')}>
                {item.icon}
              </span>
              <span className="flex-1 text-left">{item.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Shift status */}
      <div className="px-2.5">
        <button
          onClick={openShiftPrompt}
          className={cn(
            'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-[12px]',
            shift ? 'border-success/30 bg-success-soft text-success' : 'border-warning/30 bg-warning-soft text-warning'
          )}
        >
          <span className="font-medium">{shift ? `Shift #${shift.id} Open` : 'No Shift Open'}</span>
          <span className="tabular text-[11px] opacity-80">
            {shift ? new Date(shift.openedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'tap to open'}
          </span>
        </button>
      </div>

      {/* Cashier profile drawer */}
      <div className="relative p-2.5">
        {profileOpen && (
          <div className="absolute bottom-14 left-2.5 right-2.5 z-20 rounded-xl border border-border bg-surface p-2 shadow-xl">
            <div className="px-2 pb-2 pt-1">
              <div className="text-[13px] font-semibold text-foreground">{user?.name ?? 'System'}</div>
              <div className="text-[11px] capitalize text-foreground-muted">{user?.role ?? 'no user'}</div>
            </div>
            <button
              onClick={toggleTheme}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-foreground-secondary hover:bg-surface-2"
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
            <button
              onClick={lock}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-foreground-secondary hover:bg-surface-2"
            >
              <Lock size={14} /> Lock terminal
            </button>
            <button
              onClick={() => {
                clearCart()
                setUser(null)
                setLocked(true)
                setProfileOpen(false)
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-danger hover:bg-danger-soft"
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        )}
        <button
          onClick={() => setProfileOpen((v) => !v)}
          className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left transition-colors hover:border-border-strong"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-[12px] font-bold text-primary">
            {(user?.name ?? 'SYS')
              .split(' ')
              .map((p) => p[0])
              .slice(0, 2)
              .join('')}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-semibold text-foreground">{user?.name ?? 'System'}</div>
            <div className="text-[11px] capitalize text-foreground-muted">{user?.role ?? 'cashier'}</div>
          </div>
          <ChevronUp size={14} className="text-foreground-muted" />
        </button>
      </div>
    </aside>
  )
}
