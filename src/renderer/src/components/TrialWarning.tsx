import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CalendarClock, KeyRound } from 'lucide-react'
import { useUi } from '@/stores/ui'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const WARN_DAYS = 5

function localDateKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function warningKey(day: string) {
  return `restopulse:trial-warning:${day}`
}

/** Daily full-screen trial/grace reminder; dismissed once per calendar day. */
export function TrialWarning() {
  const { license, activationOpen, setActivationOpen } = useUi()
  const [dayKey, setDayKey] = useState(localDateKey)
  const [dismissed, setDismissed] = useState(true)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      const now = new Date()
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      timer = setTimeout(() => {
        setDayKey(localDateKey())
        schedule()
      }, nextMidnight.getTime() - now.getTime())
    }
    schedule()
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(warningKey(dayKey)) === '1')
    } catch {
      setDismissed(false)
    }
  }, [dayKey])

  const dismissForToday = useCallback(() => {
    try {
      localStorage.setItem(warningKey(dayKey), '1')
    } catch {
      // storage unavailable — the warning simply shows again next launch
    }
    setDismissed(true)
  }, [dayKey])

  const isTrialWarning = license?.state === 'trial' && (license.trialDaysLeft ?? WARN_DAYS + 1) <= WARN_DAYS
  const isGraceWarning = license?.state === 'grace'
  if (dismissed || activationOpen || (!isTrialWarning && !isGraceWarning)) return null

  const daysLeft = isGraceWarning ? license?.graceDaysLeft ?? 0 : license?.trialDaysLeft ?? 0
  const deadline = isGraceWarning ? license?.graceEndsAt : license?.trialEndsAt
  const endDate = deadline ? new Date(deadline).toLocaleDateString() : ''

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-overlay backdrop-blur-sm" />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-border">
        <div
          className={cn(
            'flex items-center gap-3 px-6 py-5 text-white',
            isGraceWarning ? 'bg-gradient-to-r from-rose-600 to-rose-700' : 'bg-gradient-to-r from-amber-500 to-amber-600'
          )}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30">
            {isGraceWarning ? <AlertTriangle size={22} /> : <CalendarClock size={22} />}
          </span>
          <div>
            <h2 className="text-lg font-extrabold leading-tight">{isGraceWarning ? 'Free trial has ended' : 'Your free trial is ending soon'}</h2>
            <p className="text-xs font-medium text-white/80">
              {isGraceWarning ? 'The software will lock when the grace period ends' : 'Activate to keep using the software without interruption'}
            </p>
          </div>
        </div>

        <div className="px-6 py-5">
          <div className="flex items-baseline justify-center gap-2 rounded-xl bg-surface-2 py-5 ring-1 ring-border">
            <span className={cn('text-4xl font-black tabular', isGraceWarning ? 'text-danger' : 'text-warning')}>{daysLeft}</span>
            <span className="text-sm font-semibold text-foreground-secondary">
              {daysLeft === 1 ? 'day' : 'days'} left{endDate ? ` · until ${endDate}` : ''}
            </span>
          </div>

          <p className="mt-4 text-center text-xs leading-relaxed text-foreground-muted">
            {isGraceWarning
              ? 'Your sales data is safe. Activate before the grace period ends to remove the limit.'
              : 'Send your Machine ID to RestoPulse on WhatsApp and activate this terminal with the license key you receive.'}
          </p>

          <div className="mt-5 flex gap-2">
            <Button
              className="flex-1 justify-center"
              onClick={() => {
                dismissForToday()
                setActivationOpen(true)
              }}
            >
              <KeyRound size={15} /> Activate Now
            </Button>
            <Button variant="secondary" onClick={dismissForToday}>
              {isGraceWarning ? 'Continue for today' : 'Continue Trial'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
