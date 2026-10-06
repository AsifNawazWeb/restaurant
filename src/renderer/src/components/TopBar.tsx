import { AlertTriangle, BadgeCheck, CalendarClock } from 'lucide-react'
import { useUi, type ScreenId } from '@/stores/ui'
import { cn } from '@/lib/utils'

const SCREEN_LABELS: Record<ScreenId, string> = {
  dashboard: 'Dashboard',
  pos: 'POS Billing',
  menu: 'Menu Items',
  inventory: 'Stock & Inventory',
  reports: 'Reports & Shift',
  settings: 'Settings'
}

/** Header strip to the right of the nav — carries the license banner on the right. */
export function TopBar() {
  const { screen, settings, license, setActivationOpen } = useUi()

  return (
    <header className="flex h-10 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface px-4">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="truncate text-[13px] font-bold tracking-tight text-foreground">
          {settings?.restaurantName ?? 'RestoPulse POS'}
        </span>
        <span className="truncate text-[11px] text-foreground-muted">{SCREEN_LABELS[screen]}</span>
      </div>

      {license?.state === 'trial' && (
        <button
          onClick={() => setActivationOpen(true)}
          title={`Free trial — ends ${new Date(license.trialEndsAt).toLocaleDateString()}. Click to activate.`}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ring-1 transition-colors',
            license.trialDaysLeft <= 5
              ? 'bg-danger-soft text-danger ring-danger/30 hover:bg-danger-soft/70'
              : 'bg-warning-soft text-warning ring-warning/30 hover:bg-warning-soft/70'
          )}
        >
          <CalendarClock size={13} />
          {license.trialDaysLeft} day{license.trialDaysLeft === 1 ? '' : 's'} trial left
        </button>
      )}

      {license?.state === 'grace' && (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-danger-soft px-3 py-1 text-[11px] font-semibold text-danger ring-1 ring-danger/30">
            <AlertTriangle size={13} />
            Trial ended — {license.graceDaysLeft}d grace
          </span>
          <button
            onClick={() => setActivationOpen(true)}
            className="rounded-full bg-danger px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white transition hover:opacity-90"
          >
            Activate now →
          </button>
        </div>
      )}

      {license?.state === 'licensed' && (
        <span
          title={[license.customer, license.licenseId].filter(Boolean).join(' · ') || 'Licensed'}
          className="flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-[11px] font-semibold text-success ring-1 ring-success/30"
        >
          <BadgeCheck size={13} />
          Licensed
        </span>
      )}
    </header>
  )
}
