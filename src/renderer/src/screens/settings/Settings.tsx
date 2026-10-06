import { useEffect, useState } from 'react'
import {
  Save,
  Printer,
  TestTube,
  Vault,
  Users as UsersIcon,
  Plus,
  Monitor,
  KeyRound,
  ClipboardCopy,
  Check,
  RefreshCw,
  MessageCircle,
  Upload,
  AlertTriangle,
  CalendarClock,
  BadgeCheck,
  ShieldCheck
} from 'lucide-react'
import { toast } from 'sonner'
import { api, unwrap } from '@/lib/api'
import type { LicenseStatus, Settings, User } from '@shared/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useUi } from '@/stores/ui'

const SECTIONS = [
  { id: 'profile', label: 'Business Profile' },
  { id: 'hardware', label: 'Hardware & Printers' },
  { id: 'display', label: 'Display' },
  { id: 'taxes', label: 'Taxes & Discounts' },
  { id: 'users', label: 'Security & Users' },
  { id: 'license', label: 'License' }
]

export function SettingsScreen() {
  const [section, setSection] = useState('profile')
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    unwrap(api.settings.get()).then(setSettings).catch(toast.error)
  }, [])

  if (!settings) return null

  return (
    <div className="flex h-full min-h-0">
      <div className="w-[200px] shrink-0 border-r border-border bg-surface/50 p-3">
        <h1 className="mb-3 px-2 text-[15px] font-bold tracking-tight">Settings</h1>
        <div className="space-y-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={cn(
                'flex w-full items-center rounded-lg px-3 py-2 text-left text-[12.5px] font-medium transition-colors',
                section === s.id ? 'bg-primary-soft text-primary' : 'text-foreground-secondary hover:bg-surface-2'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto p-5">
        {section === 'profile' && <ProfileSection settings={settings} onSaved={setSettings} />}
        {section === 'hardware' && <HardwareSection settings={settings} onSaved={setSettings} />}
        {section === 'display' && <DisplaySection settings={settings} onSaved={setSettings} />}
        {section === 'taxes' && <TaxesSection settings={settings} onSaved={setSettings} />}
        {section === 'users' && <UsersSection />}
        {section === 'license' && <LicenseSection />}
      </div>
    </div>
  )
}

async function persist(patch: Partial<Settings>, onSaved: (s: Settings) => void) {
  try {
    const saved = await unwrap(api.settings.save(patch))
    setSettingsState(saved, onSaved)
    toast.success('Settings saved')
  } catch (err) {
    toast.error((err as Error).message)
  }
}

function setSettingsState(s: Settings, onSaved: (s: Settings) => void) {
  onSaved(s)
}

/** ---------- Profile ---------- */

function ProfileSection({ settings, onSaved }: { settings: Settings; onSaved: (s: Settings) => void }) {
  const [form, setForm] = useState(settings)
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Business Profile</CardTitle>
        <Button size="sm" onClick={() => persist(form, onSaved)}>
          <Save size={13} /> Save
        </Button>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        <FieldWide label="Restaurant name">
          <Input value={form.restaurantName} onChange={(e) => setForm({ ...form, restaurantName: e.target.value })} />
        </FieldWide>
        <FieldWide label="Phone">
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </FieldWide>
        <FieldWide label="Address">
          <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </FieldWide>
        <FieldWide label="FBR STRN / NTN No.">
          <Input value={form.vatRegistration} onChange={(e) => setForm({ ...form, vatRegistration: e.target.value })} />
        </FieldWide>
        <FieldWide label="Receipt header text">
          <Input value={form.receiptHeader} onChange={(e) => setForm({ ...form, receiptHeader: e.target.value })} />
        </FieldWide>
        <FieldWide label="Receipt footer text">
          <Input value={form.receiptFooter} onChange={(e) => setForm({ ...form, receiptFooter: e.target.value })} />
        </FieldWide>
      </CardContent>
    </Card>
  )
}

/** ---------- Hardware ---------- */

function HardwareSection({ settings, onSaved }: { settings: Settings; onSaved: (s: Settings) => void }) {
  const [form, setForm] = useState(settings)
  const [status, setStatus] = useState<string>('')

  return (
    <div className="grid max-w-3xl grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Printer size={13} /> ESC/POS Thermal Printer
          </CardTitle>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              await persist(form, onSaved)
              const r = await unwrap(api.printer.test())
              setStatus(r.message)
              r.ok ? toast.success(r.message) : toast.warning(r.message)
            }}
          >
            <TestTube size={13} /> Test Print
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <FieldWide label="Connection type">
            <select
              value={form.printerType}
              onChange={(e) => setForm({ ...form, printerType: e.target.value })}
              className="h-9 w-full rounded-lg border border-border bg-surface px-2 text-[13px]"
            >
              <option value="network">LAN / TCP (IP)</option>
              <option value="usb">USB</option>
              <option value="serial">Serial / COM</option>
              <option value="file">File spool (dev)</option>
            </select>
          </FieldWide>
          <FieldWide label="Target (IP / device path / COM port)">
            <Input value={form.printerTarget} onChange={(e) => setForm({ ...form, printerTarget: e.target.value })} placeholder="192.168.1.87 or /dev/usb/lp0" />
          </FieldWide>
          <FieldWide label="Paper width">
            <div className="flex gap-2">
              {([58, 80] as const).map((w) => (
                <button
                  key={w}
                  onClick={() => setForm({ ...form, paperWidthMm: w })}
                  className={cn(
                    'rounded-lg border px-4 py-1.5 text-[12.5px] font-medium transition-colors',
                    form.paperWidthMm === w ? 'border-primary bg-primary-soft text-primary' : 'border-border text-foreground-secondary hover:bg-surface-2'
                  )}
                >
                  {w}mm
                </button>
              ))}
            </div>
          </FieldWide>
          {status && <div className="rounded-lg bg-surface-2 px-3 py-2 text-[11.5px] text-foreground-secondary">{status}</div>}
          <Button size="sm" onClick={() => persist(form, onSaved)}>
            <Save size={13} /> Save printer
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <Vault size={13} /> Cash Drawer (RJ11)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
            <span className="text-[12.5px]">Auto-kick drawer on cash payment</span>
            <Switch checked={form.autoDrawerKick} onCheckedChange={(v) => setForm({ ...form, autoDrawerKick: v })} />
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              await persist(form, onSaved)
              const r = await unwrap(api.printer.kickDrawer())
              r.ok ? toast.success(r.message) : toast.warning(r.message)
            }}
          >
            Trigger test kick
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

/** ---------- Display ---------- */

const UI_SCALE_OPTIONS = [1, 1.1, 1.25, 1.5]

function DisplaySection({ settings, onSaved }: { settings: Settings; onSaved: (s: Settings) => void }) {
  const [scale, setScale] = useState(settings.uiScale)
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <Monitor size={13} /> Display Scale
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          {UI_SCALE_OPTIONS.map((v) => (
            <button
              key={v}
              onClick={() => {
                setScale(v)
                api.app.setZoom(v)
                persist({ uiScale: v }, onSaved)
              }}
              className={cn(
                'rounded-lg border px-4 py-1.5 text-[12.5px] font-medium transition-colors',
                scale === v ? 'border-primary bg-primary-soft text-primary' : 'border-border text-foreground-secondary hover:bg-surface-2'
              )}
            >
              {Math.round(v * 100)}%
            </button>
          ))}
        </div>
        <p className="text-[11px] text-foreground-muted">
          Scales the entire interface. Keyboard: Ctrl + “+”, Ctrl + “-”, Ctrl + 0 to reset.
        </p>
      </CardContent>
    </Card>
  )
}

/** ---------- Taxes ---------- */

function TaxesSection({ settings, onSaved }: { settings: Settings; onSaved: (s: Settings) => void }) {
  const [form, setForm] = useState(settings)
  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>Taxes & Discounts</CardTitle>
        <Button size="sm" onClick={() => persist(form, onSaved)}>
          <Save size={13} /> Save
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FieldWide label="Default GST %">
            <Input type="number" value={form.defaultVatPercent} onChange={(e) => setForm({ ...form, defaultVatPercent: Number(e.target.value) })} />
          </FieldWide>
          <FieldWide label="Service charge %">
            <Input type="number" value={form.serviceChargePercent} onChange={(e) => setForm({ ...form, serviceChargePercent: Number(e.target.value) })} />
          </FieldWide>
        </div>
        <FieldWide label="Quick discount presets (comma separated %)">
          <Input
            value={form.quickDiscounts.join(', ')}
            onChange={(e) =>
              setForm({
                ...form,
                quickDiscounts: e.target.value
                  .split(',')
                  .map((s) => Number(s.trim()))
                  .filter((n) => Number.isFinite(n) && n >= 0)
              })
            }
          />
        </FieldWide>
        <p className="text-[11px] text-foreground-muted">These presets appear in the POS discount selector (e.g. Staff Discount).</p>
      </CardContent>
    </Card>
  )
}

/** ---------- Users ---------- */

function UsersSection() {
  const [users, setUsers] = useState<User[]>([])
  const [name, setName] = useState('')
  const [role, setRole] = useState<'cashier' | 'manager'>('cashier')
  const [pinInputs, setPinInputs] = useState<Record<number, string>>({})

  async function refresh() {
    setUsers(await unwrap(api.users.list()))
  }
  useEffect(() => {
    refresh().catch(toast.error)
  }, [])

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <UsersIcon size={13} /> Cashier PIN Management
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
            <div className="flex-1">
              <div className="text-[12.5px] font-medium">{u.name}</div>
              <div className="text-[11px] text-foreground-muted">
                {u.hasPin ? 'PIN set' : 'No PIN'} · canOverride: {String(u.canOverride)}
              </div>
            </div>
            <Badge variant={u.role === 'manager' ? 'default' : 'neutral'}>{u.role}</Badge>
            <Input
              type="password"
              maxLength={6}
              placeholder="New PIN"
              className="h-8 w-24"
              value={pinInputs[u.id] ?? ''}
              onChange={(e) => setPinInputs((p) => ({ ...p, [u.id]: e.target.value.replace(/\D/g, '') }))}
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                try {
                  await unwrap(api.users.setPin({ userId: u.id, pin: pinInputs[u.id] }))
                  toast.success('PIN updated')
                  setPinInputs((p) => ({ ...p, [u.id]: '' }))
                  refresh()
                } catch (err) {
                  toast.error((err as Error).message)
                }
              }}
            >
              Set PIN
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                try {
                  await unwrap(api.users.setRole({ userId: u.id, role: u.role === 'manager' ? 'cashier' : 'manager' }))
                  refresh()
                } catch (err) {
                  toast.error((err as Error).message)
                }
              }}
            >
              {u.role === 'manager' ? 'Demote' : 'Promote'}
            </Button>
          </div>
        ))}
        <div className="flex gap-2 rounded-lg border border-dashed border-border p-2.5">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New staff name" className="flex-1" />
          <select value={role} onChange={(e) => setRole(e.target.value as 'cashier' | 'manager')} className="h-9 rounded-lg border border-border bg-surface px-2 text-[13px]">
            <option value="cashier">cashier</option>
            <option value="manager">manager</option>
          </select>
          <Button
            onClick={async () => {
              if (!name.trim()) return
              try {
                await unwrap(api.users.create({ name: name.trim(), role }))
                setName('')
                refresh()
                toast.success('User added')
              } catch (err) {
                toast.error((err as Error).message)
              }
            }}
          >
            <Plus size={13} /> Add
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/** ---------- License ---------- */

const VENDOR_WHATSAPP = '923139329499'
const VENDOR_WHATSAPP_DISPLAY = '+92 313 9329499'

const LICENSE_META: Record<LicenseStatus['state'], { title: string; tone: string; icon: typeof ShieldCheck }> = {
  licensed: { title: 'Licensed', tone: 'bg-success-soft text-success ring-success/30', icon: BadgeCheck },
  trial: { title: 'Free trial', tone: 'bg-warning-soft text-warning ring-warning/30', icon: CalendarClock },
  grace: { title: 'Grace period', tone: 'bg-danger-soft text-danger ring-danger/30', icon: AlertTriangle },
  trial_expired: { title: 'Trial expired', tone: 'bg-danger-soft text-danger ring-danger/30', icon: AlertTriangle },
  expired: { title: 'License expired', tone: 'bg-danger-soft text-danger ring-danger/30', icon: AlertTriangle },
  invalid: { title: 'Invalid license', tone: 'bg-danger-soft text-danger ring-danger/30', icon: AlertTriangle },
  tampered: { title: 'Clock change detected', tone: 'bg-danger-soft text-danger ring-danger/30', icon: AlertTriangle }
}

function LicenseSection() {
  const { license, settings, setLicense } = useUi()
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  async function refresh() {
    try {
      setLicense(await unwrap(api.license.status()))
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function activate() {
    if (!key.trim()) return
    setBusy(true)
    setError('')
    try {
      const status = await unwrap(api.license.activate({ key: key.trim() }))
      setLicense(status)
      setKey('')
      toast.success('License activated')
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
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function deactivate() {
    try {
      setLicense(await unwrap(api.license.deactivate()))
      toast.success('License removed from this machine')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function copyMachineId() {
    if (!license) return
    try {
      await navigator.clipboard.writeText(license.machineId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Machine ID copied')
    } catch {
      toast.error('Could not copy — please type the ID manually')
    }
  }

  function contactVendor() {
    if (!license) return
    const message = `Hello RestoPulse Support, I want to activate my POS software.\nMachine ID: ${license.machineId}\nRestaurant: ${settings?.restaurantName ?? '—'}`
    const url = `https://wa.me/${VENDOR_WHATSAPP}?text=${encodeURIComponent(message)}`
    api.app.openExternal(url).catch(() => toast.error(`Could not open WhatsApp — please message ${VENDOR_WHATSAPP_DISPLAY}`))
  }

  if (!license) return null
  const meta = LICENSE_META[license.state]
  const MetaIcon = meta.icon

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <KeyRound size={13} /> License & Activation
        </CardTitle>
        <Button size="sm" variant="secondary" onClick={refresh}>
          <RefreshCw size={13} /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={cn('flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold ring-1', meta.tone)}>
          <MetaIcon size={17} className="mt-0.5 shrink-0" />
          <div>
            <div>{meta.title}</div>
            {license.reason && <div className="mt-0.5 text-xs font-medium opacity-80">{license.reason}</div>}
            {license.state === 'trial' && (
              <div className="mt-0.5 text-xs font-medium opacity-80">
                {license.trialDaysLeft} day(s) left · ends {new Date(license.trialEndsAt).toLocaleDateString()}
              </div>
            )}
            {license.state === 'grace' && (
              <div className="mt-0.5 text-xs font-medium opacity-80">
                {license.graceDaysLeft} grace day(s) left · ends {new Date(license.graceEndsAt).toLocaleDateString()}
              </div>
            )}
            {license.state === 'licensed' && (
              <div className="mt-0.5 text-xs font-medium opacity-80">
                {license.customer ?? '—'}
                {license.licenseId ? ` · ${license.licenseId}` : ''}
                {license.expiresAt ? ` · expires ${new Date(license.expiresAt).toLocaleDateString()}` : ' · perpetual'}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="mb-1 text-[11px] font-medium text-foreground-secondary">Machine ID</div>
          <div className="flex gap-2">
            <div className="flex flex-1 items-center rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-[13px] font-bold tracking-wider text-foreground">
              {license.machineId}
            </div>
            <Button size="sm" variant="secondary" onClick={copyMachineId} title="Copy Machine ID">
              {copied ? <Check size={14} className="text-success" /> : <ClipboardCopy size={14} />}
            </Button>
            <Button size="sm" variant="secondary" onClick={contactVendor}>
              <MessageCircle size={14} /> WhatsApp
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-foreground-muted">
            Send this ID to {VENDOR_WHATSAPP_DISPLAY} to receive a license key for this terminal.
          </p>
        </div>

        <div>
          <div className="mb-1 text-[11px] font-medium text-foreground-secondary">Activate / replace license key</div>
          <textarea
            className="h-20 w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
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

        <div className="flex flex-wrap gap-2">
          <Button onClick={activate} disabled={busy || !key.trim()}>
            <KeyRound size={14} /> {busy ? 'Activating…' : 'Activate'}
          </Button>
          <Button variant="secondary" onClick={importFile} disabled={busy}>
            <Upload size={14} /> Import .lic
          </Button>
          {license.state === 'licensed' && (
            <Button variant="ghost" className="text-danger" onClick={deactivate}>
              Deactivate
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function FieldWide({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-foreground-secondary">{label}</span>
      {children}
    </label>
  )
}
