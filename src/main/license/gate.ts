import type { LicenseStatus } from '@shared/types'
import type { LicenseManager } from './manager'

export interface LicenseGate {
  readonly bypass: boolean
  readonly machineId: string
  status: () => LicenseStatus
  requireUsable: () => LicenseStatus
  isUsable: () => boolean
  activate: (key: string) => LicenseStatus
  deactivate: () => LicenseStatus
  importState: (blob: string | null) => boolean
}

function notReady(): never {
  throw new Error('License subsystem is not ready')
}

/** Wraps the manager with the dev bypass; the single place enforcement policy lives. */
export function createLicenseGate(manager: LicenseManager | null, bypass: boolean): LicenseGate {
  const status = (): LicenseStatus => {
    if (!manager) notReady()
    if (bypass) {
      return {
        ...manager.status(),
        state: 'licensed',
        reason: null,
        customer: 'Development Mode',
        licenseId: 'DEV-BYPASS',
        daysLeft: null
      }
    }
    return manager.status()
  }

  return {
    bypass,
    get machineId() {
      if (!manager) notReady()
      return manager.machineId
    },
    status,
    requireUsable: () => {
      if (bypass) return status()
      if (!manager) notReady()
      return manager.requireUsable()
    },
    isUsable: () => {
      if (bypass) return true
      return manager ? manager.isUsable() : false
    },
    activate: (key) => {
      if (!manager) notReady()
      return manager.activate(key)
    },
    deactivate: () => {
      if (!manager) notReady()
      return manager.deactivate()
    },
    importState: (blob) => (manager ? manager.importState(blob) : false)
  }
}
