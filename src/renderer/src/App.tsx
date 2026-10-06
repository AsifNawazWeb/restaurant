import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { AlertTriangle } from 'lucide-react'
import { useUi, isLicenseUsable } from '@/stores/ui'
import { api, unwrap } from '@/lib/api'
import { Sidebar } from '@/components/Sidebar'
import { TopBar } from '@/components/TopBar'
import { StatusBar } from '@/components/StatusBar'
import { LockScreen } from '@/components/LockScreen'
import { TrialWarning } from '@/components/TrialWarning'
import { ActivationScreen } from '@/screens/activation/Activation'
import { DashboardScreen } from '@/screens/dashboard/Dashboard'
import { PosScreen } from '@/screens/pos/Pos'
import { MenuScreen } from '@/screens/menu/Menu'
import { InventoryScreen } from '@/screens/inventory/Inventory'
import { ReportsScreen } from '@/screens/reports/Reports'
import { SettingsScreen } from '@/screens/settings/Settings'

const SCREEN_FOR_KEY: Record<string, 'dashboard' | 'pos' | 'menu' | 'inventory' | 'reports' | 'settings'> = {
  F1: 'dashboard',
  F2: 'pos',
  F3: 'menu',
  F4: 'inventory',
  F5: 'reports',
  F6: 'settings'
}

export default function App() {
  const {
    screen,
    locked,
    license,
    licenseLoading,
    activationOpen,
    setScreen,
    setShift,
    setDbOk,
    setPrinter,
    setSettings,
    setUser,
    setLocked,
    setLicense,
    setLicenseLoading,
    setActivationOpen
  } = useUi()

  const usable = isLicenseUsable(license)

  // Global keyboard router — disabled while the terminal is locked or the activation screen is open
  useEffect(() => {
    if (locked || activationOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'F12') return // reserved: cash payment (handled by POS screen)
      const target = SCREEN_FOR_KEY[e.key]
      if (target) {
        e.preventDefault()
        setScreen(target)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setScreen, locked, activationOpen])

  // License status: initial fetch + live updates pushed from the main process
  useEffect(() => {
    const unsubscribe = api.license.onChange((next) => setLicense(next))
    ;(async () => {
      try {
        setLicense(await unwrap(api.license.status()))
      } catch (err) {
        console.error('license status failed', err)
      } finally {
        setLicenseLoading(false)
      }
    })()
    return unsubscribe
  }, [setLicense, setLicenseLoading])

  // Bootstrap: settings + shift + hardware status + auto-login (only when licensed/trial/grace)
  useEffect(() => {
    if (!usable) return
    ;(async () => {
      try {
        const settings = await unwrap(api.settings.get())
        setSettings(settings)
        api.app.setZoom(settings.uiScale)
        const users = await unwrap(api.users.list())
        const manager = users.find((u) => u.role === 'manager')
        if (manager) setUser(manager)
        setLocked(false)
        const shift = await unwrap(api.shifts.current())
        setShift(shift)
        setDbOk(true)
        const p = await unwrap(api.printer.status())
        setPrinter(p.ok, p.message)
      } catch (err) {
        console.error('bootstrap failed', err)
      }
    })()
  }, [usable, setSettings, setUser, setLocked, setShift, setDbOk, setPrinter])

  if (licenseLoading || !usable || activationOpen) return <ActivationScreen />

  if (locked) return <LockScreen />

  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {license?.state === 'grace' && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-danger/30 bg-danger-soft px-4 py-2 text-[12px] font-semibold text-danger">
            <span className="flex items-center gap-2">
              <AlertTriangle size={14} />
              Free trial ended — {license.graceDaysLeft} grace day{license.graceDaysLeft === 1 ? '' : 's'} left. Activate to avoid
              interruption.
            </span>
            <button
              onClick={() => setActivationOpen(true)}
              className="rounded-full bg-danger px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white transition hover:opacity-90"
            >
              Activate now →
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto bg-background">
          {screen === 'dashboard' && <DashboardScreen />}
          {screen === 'pos' && <PosScreen />}
          {screen === 'menu' && <MenuScreen />}
          {screen === 'inventory' && <InventoryScreen />}
          {screen === 'reports' && <ReportsScreen />}
          {screen === 'settings' && <SettingsScreen />}
        </div>
        <StatusBar />
      </main>
      <TrialWarning />
      <Toaster position="bottom-right" theme="dark" richColors closeButton />
    </div>
  )
}
