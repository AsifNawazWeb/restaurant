import { create } from 'zustand'
import type { LicenseStatus, Settings, User } from '@shared/types'

export type ScreenId = 'dashboard' | 'pos' | 'menu' | 'inventory' | 'reports' | 'settings'

interface ShiftLite {
  id: number
  openedAt: string
  openingCashCents: number
  cashierName: string
}

interface UiState {
  screen: ScreenId
  theme: 'dark' | 'light'
  user: User | null
  locked: boolean
  shift: ShiftLite | null
  dbOk: boolean
  printerOk: boolean | null
  printerMessage: string
  settings: Settings | null
  license: LicenseStatus | null
  licenseLoading: boolean
  activationOpen: boolean
  setScreen: (s: ScreenId) => void
  toggleTheme: () => void
  setTheme: (t: 'dark' | 'light') => void
  setUser: (u: User | null) => void
  setLocked: (v: boolean) => void
  setShift: (s: ShiftLite | null) => void
  setDbOk: (v: boolean) => void
  setPrinter: (ok: boolean, message: string) => void
  setSettings: (s: Settings) => void
  setLicense: (l: LicenseStatus | null) => void
  setLicenseLoading: (v: boolean) => void
  setActivationOpen: (v: boolean) => void
}

export function isLicenseUsable(license: LicenseStatus | null): boolean {
  return !!license && (license.state === 'licensed' || license.state === 'trial' || license.state === 'grace')
}

function applyTheme(theme: 'dark' | 'light') {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export const useUi = create<UiState>((set) => ({
  screen: 'dashboard',
  theme: 'dark',
  user: null,
  locked: true,
  shift: null,
  dbOk: false,
  printerOk: null,
  printerMessage: 'Checking…',
  settings: null,
  license: null,
  licenseLoading: true,
  activationOpen: false,
  setScreen: (screen) => set({ screen }),
  toggleTheme: () =>
    set((s) => {
      const theme = s.theme === 'dark' ? 'light' : 'dark'
      applyTheme(theme)
      return { theme }
    }),
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },
  setUser: (user) => set({ user }),
  setLocked: (locked) => set({ locked }),
  setShift: (shift) => set({ shift }),
  setDbOk: (dbOk) => set({ dbOk }),
  setPrinter: (printerOk, printerMessage) => set({ printerOk, printerMessage }),
  setSettings: (settings) => set({ settings }),
  setLicense: (license) => set({ license }),
  setLicenseLoading: (licenseLoading) => set({ licenseLoading }),
  setActivationOpen: (activationOpen) => set({ activationOpen })
}))
