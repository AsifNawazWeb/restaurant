import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  Check,
  ClipboardCopy,
  KeyRound,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Upload,
  Utensils
} from 'lucide-react'
import { toast } from 'sonner'
import { api, unwrap } from '@/lib/api'
import { useUi, isLicenseUsable } from '@/stores/ui'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { LicenseStatus } from '@shared/types'

const VENDOR_WHATSAPP = '923139329499'
const VENDOR_WHATSAPP_DISPLAY = '+92 313 9329499'

const STATE_META: Record<LicenseStatus['state'], { title: string; tone: string; icon: typeof ShieldCheck }> = {
  trial: { title: 'Free trial active', tone: 'bg-warning-soft text-warning ring-warning/30', icon: CalendarClock },
  grace: { title: 'Free trial ended — grace period', tone: 'bg-danger-soft text-danger ring-danger/30', icon: AlertTriangle },
  trial_expired: { title: 'Free trial ended', tone: 'bg-danger-soft text-danger ring-danger/30', icon: AlertTriangle },
  tampered: { title: 'Clock change detected', tone: 'bg-danger-soft text-danger ring-danger/30', icon: AlertTriangle },
  expired: { title: 'License expired', tone: 'bg-danger-soft text-danger ring-danger/30', icon: AlertTriangle },
  invalid: { title: 'License not valid on this machine', tone: 'bg-danger-soft text-danger ring-danger/30', icon: AlertTriangle },
  licensed: { title: 'License activated', tone: 'bg-success-soft text-success ring-success/30', icon: BadgeCheck }
}

export function ActivationScreen() {
  const { license, licenseLoading, settings, activationOpen, setLicense, setActivationOpen } = useUi()
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const usable = isLicenseUsable(license)
  const machineId = license?.machineId ?? '—'
  const dismissible = usable && activationOpen

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  async function refresh() {
    try {
      setLicense(await unwrap(api.license.status()))
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function copyMachineId() {
    try {
      await navigator.clipboard.writeText(machineId)
      setCopied(true)
      toast.success('Machine ID copied')
    } catch {
      toast.error('Could not copy — please type the ID manually')
    }
  }

  function contactVendor() {
    const message = `Hello RestoPulse Support, I want to activate my POS software.\nMachine ID: ${machineId}\nRestaurant: ${settings?.restaurantName ?? '—'}`
    const url = `https://wa.me/${VENDOR_WHATSAPP}?text=${encodeURIComponent(message)}`
    api.app.openExternal(url).catch(() => toast.error(`Could not open WhatsApp — please message ${VENDOR_WHATSAPP_DISPLAY}`))
  }

  async function activate(event?: React.FormEvent) {
    event?.preventDefault()
    if (!key.trim()) return
    setBusy(true)
    setError('')
    try {
      const status = await unwrap(api.license.activate({ key: key.trim() }))
      setLicense(status)
      toast.success(`License activated for ${status.customer || 'this machine'}`)
      setKey('')
      setActivationOpen(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function importFile() {
    setBusy(true)
    setError('')
    try {
      const res = await unwrap(api.license.importFile())
      if (res.canceled) return
      if (!res.ok) {
        setError(res.error || 'Could not import the license file')
        return
      }
      if (res.status) setLicense(res.status)
      toast.success('License file imported')
      setActivationOpen(false)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (licenseLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950 text-[13px] font-medium text-indigo-100">
        <RefreshCw className="mr-2 animate-spin" size={15} /> Checking license status…
      </div>
    )
  }

  const meta = license ? STATE_META[license.state] : STATE_META.trial_expired
  const MetaIcon = meta.icon

  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden bg-gradient-to-br from-zinc-950 via-indigo-950 to-zinc-950 p-6">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-indigo-400/10 blur-3xl" />

      <div className="relative grid w-full max-w-4xl overflow-hidden rounded-3xl bg-surface shadow-2xl ring-1 ring-border md:grid-cols-[1fr_1.15fr]">
        <div className="hidden flex-col justify-between bg-gradient-to-b from-indigo-600 to-indigo-900 p-8 text-white md:flex">
          <div>
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/30">
              <Utensils size={28} />
            </span>
            <h2 className="mt-6 text-2xl font-extrabold leading-snug">RestoPulse POS</h2>
            <p className="mt-2 text-sm text-indigo-100/80">Offline-first license activation — no internet connection required.</p>
          </div>
          <ul className="space-y-3 text-sm text-indigo-100/90">
            <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-indigo-300" /> Send your Machine ID to the vendor</li>
            <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-indigo-300" /> Receive a license key for this computer</li>
            <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-indigo-300" /> Paste it below — activated for life</li>
            <li className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-indigo-300" /> Each key works on one machine only</li>
          </ul>
          <div className="flex items-center gap-2 text-xs text-indigo-200/70">
            <MessageCircle size={14} /> WhatsApp {VENDOR_WHATSAPP_DISPLAY}
          </div>
        </div>

        <div className="p-8 sm:p-10">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground md:hidden">
              <Utensils size={22} />
            </span>
            <div>
              <h1 className="text-xl font-bold text-foreground">Software Activation</h1>
              <p className="text-xs text-foreground-muted">This terminal must be licensed before the POS can be used</p>
            </div>
          </div>

          <div className={cn('mb-5 flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold ring-1', meta.tone)}>
            <MetaIcon size={18} className="mt-0.5 shrink-0" />
            <div>
              <div>{meta.title}</div>
              {license?.state === 'trial' && (
                <div className="mt-0.5 text-xs font-medium opacity-80">
                  {license.trialDaysLeft} day(s) left · trial ends {license.trialEndsAt ? new Date(license.trialEndsAt).toLocaleDateString() : '—'}
                </div>
              )}
              {license?.state === 'grace' && (
                <div className="mt-0.5 text-xs font-medium opacity-80">
                  {license.graceDaysLeft} grace day(s) left · grace ends {license.graceEndsAt ? new Date(license.graceEndsAt).toLocaleDateString() : '—'}
                </div>
              )}
              {license?.reason && license.state !== 'trial' && license.state !== 'grace' && (
                <div className="mt-0.5 text-xs font-medium opacity-80">{license.reason}</div>
              )}
              {usable && <div className="mt-0.5 text-xs font-medium opacity-80">You can continue using the software; activate any time to remove the trial limit.</div>}
            </div>
          </div>

          <div className="mb-5">
            <label className="mb-1 block text-[11px] font-medium text-foreground-secondary">This computer's Machine ID</label>
            <div className="flex items-stretch gap-2">
              <div className="flex flex-1 items-center rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-sm font-bold tracking-wider text-foreground">
                {machineId}
              </div>
              <Button type="button" variant="secondary" className="px-3" title="Copy Machine ID" onClick={copyMachineId}>
                {copied ? <Check size={16} className="text-success" /> : <ClipboardCopy size={16} />}
              </Button>
              <Button type="button" className="px-3" title={`Contact vendor on WhatsApp ${VENDOR_WHATSAPP_DISPLAY}`} onClick={contactVendor}>
                <MessageCircle size={16} />
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-foreground-muted">Send this ID on WhatsApp to {VENDOR_WHATSAPP_DISPLAY} and you will receive a license key.</p>
          </div>

          <form onSubmit={activate} className="space-y-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-foreground-secondary" htmlFor="license-key">
                License Key
              </label>
              <textarea
                id="license-key"
                className="h-24 w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="RPP1-..."
                value={key}
                onChange={(e) => setKey(e.target.value)}
                spellCheck={false}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-xs font-medium text-danger ring-1 ring-danger/30">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={busy || !key.trim()} className="flex-1 justify-center">
                <KeyRound size={15} /> {busy ? 'Activating…' : 'Activate License'}
              </Button>
              <Button type="button" variant="secondary" onClick={importFile} disabled={busy}>
                <Upload size={15} /> Import .lic
              </Button>
            </div>
          </form>

          <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
            <button
              type="button"
              onClick={refresh}
              className="flex items-center gap-1.5 text-xs font-semibold text-foreground-muted transition-colors hover:text-primary"
            >
              <RefreshCw size={13} /> Refresh status
            </button>
            {dismissible && (
              <button
                type="button"
                onClick={() => setActivationOpen(false)}
                className="text-xs font-bold text-primary hover:underline"
              >
                Continue without activating →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
