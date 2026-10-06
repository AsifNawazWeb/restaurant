import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { rawFingerprint, machineId } from './machine'
import { verifyKey, extractKey } from './format'
import type { LicensePayload } from './format'
import type { LicenseStatus } from '@shared/types'

export type { LicenseStatus }

export const TRIAL_DAYS = 14
export const GRACE_DAYS = 3
export const CLOCK_TOLERANCE_MS = 6 * 60 * 60 * 1000
export const LAST_SEEN_WRITE_INTERVAL_MS = 5 * 60 * 1000
const STATE_VERSION = 1
const STATE_SALT = 'restopulse-license-state-v1'
const DEFAULT_APP_ID = 'com.restopulse.pos'

interface LicenseStateBlob {
  version: number
  appId: string
  trialStartedAt: string
  lastSeenAt: string
  license: { key: string; activatedAt: string } | null
}

export interface LicenseManagerOptions {
  userDataDir: string
  publicKeyPem: string
  now?: () => Date
  persist?: ((blob: string) => void) | null
  appId?: string
}

function deriveStateKey(fingerprint: string): Buffer {
  return crypto.scryptSync(`restopulse:${fingerprint}`, STATE_SALT, 32)
}

export function encryptState(state: unknown, fingerprint: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveStateKey(fingerprint), iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(state), 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.')
}

export function decryptState(blob: string, fingerprint: string): LicenseStateBlob {
  const [version, iv, tag, data] = String(blob || '').split('.')
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('License state is corrupted')
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveStateKey(fingerprint), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  const plain = Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()])
  return JSON.parse(plain.toString('utf8')) as LicenseStateBlob
}

function toTime(value: string | null | undefined): number {
  const parsed = Date.parse(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function createLicenseManager(options: LicenseManagerOptions) {
  const { userDataDir, publicKeyPem, now = () => new Date(), persist = null, appId = DEFAULT_APP_ID } = options
  const fingerprint = rawFingerprint(userDataDir)
  const machine = machineId(userDataDir)
  const statePath = path.join(userDataDir, 'license.dat')
  const backupPath = path.join(userDataDir, 'license.bak')

  let state: LicenseStateBlob | null = null

  function saveState(): string {
    const blob = encryptState(state, fingerprint)
    try {
      fs.mkdirSync(userDataDir, { recursive: true })
      fs.writeFileSync(statePath, blob, { mode: 0o600 })
      fs.writeFileSync(backupPath, blob, { mode: 0o600 })
    } catch {
      // the DB mirror still carries the state
    }
    if (persist) {
      try {
        persist(blob)
      } catch {
        // mirroring is best effort
      }
    }
    return blob
  }

  function readState(): LicenseStateBlob | null {
    for (const file of [statePath, backupPath]) {
      try {
        return decryptState(fs.readFileSync(file, 'utf8'), fingerprint)
      } catch {
        // try the next location
      }
    }
    return null
  }

  state = readState()
  if (!state || typeof state !== 'object') {
    const timestamp = now().toISOString()
    state = { version: STATE_VERSION, appId, trialStartedAt: timestamp, lastSeenAt: timestamp, license: null }
    saveState()
  }

  function importState(blob: string | null | undefined): boolean {
    if (!blob) return false
    let other: LicenseStateBlob
    try {
      other = decryptState(String(blob), fingerprint)
    } catch {
      return false
    }
    if (!other || typeof other !== 'object' || !state) return false
    let changed = false
    const currentTrial = toTime(state.trialStartedAt)
    const otherTrial = toTime(other.trialStartedAt)
    if (otherTrial && (!currentTrial || otherTrial < currentTrial)) {
      state.trialStartedAt = other.trialStartedAt
      changed = true
    }
    if (toTime(other.lastSeenAt) > toTime(state.lastSeenAt)) {
      state.lastSeenAt = other.lastSeenAt
      changed = true
    }
    if (!state.license && other.license) {
      state.license = other.license
      changed = true
    }
    if (changed) saveState()
    return changed
  }

  function readStoredLicense(): { payload?: LicensePayload; error?: string } | null {
    const license = state?.license
    if (!license || !license.key) return null
    try {
      const payload = verifyKey(license.key, publicKeyPem)
      if (!payload.machine || payload.machine !== machine) {
        return { error: `This license was issued for a different machine (${payload.machine || 'unknown'})` }
      }
      return { payload }
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'License key is not valid' }
    }
  }

  function status(): LicenseStatus {
    if (!state) throw new Error('License state is not initialized')
    const current = now()
    const currentMs = current.getTime()
    const lastSeenMs = toTime(state.lastSeenAt)
    const rolledBack = lastSeenMs > 0 && currentMs < lastSeenMs - CLOCK_TOLERANCE_MS
    if (currentMs > lastSeenMs) {
      state.lastSeenAt = current.toISOString()
      if (currentMs - lastSeenMs > LAST_SEEN_WRITE_INTERVAL_MS) saveState()
    }

    const trialStart = toTime(state.trialStartedAt) || currentMs
    const trialEndsMs = trialStart + TRIAL_DAYS * 24 * 60 * 60 * 1000
    const graceEndsMs = trialEndsMs + GRACE_DAYS * 24 * 60 * 60 * 1000
    const trialDaysLeft = Math.max(0, Math.ceil((trialEndsMs - currentMs) / (24 * 60 * 60 * 1000)))
    const graceDaysLeft = Math.max(0, Math.ceil((graceEndsMs - currentMs) / (24 * 60 * 60 * 1000)))
    const trialActive = currentMs < trialEndsMs

    const base = {
      machineId: machine,
      appId,
      trialDaysLeft,
      trialEndsAt: new Date(trialEndsMs).toISOString(),
      graceDaysLeft,
      graceEndsAt: new Date(graceEndsMs).toISOString()
    }

    const stored = readStoredLicense()
    if (stored && stored.payload) {
      const payload = stored.payload
      const effectiveMs = Math.max(currentMs, rolledBack ? lastSeenMs : currentMs)
      const expiresMs = payload.expiresAt ? toTime(payload.expiresAt) : 0
      if (expiresMs && effectiveMs >= expiresMs) {
        return {
          ...base,
          state: 'expired',
          reason: 'The license period has ended — please renew',
          customer: payload.customer || null,
          licenseId: payload.licenseId || null,
          expiresAt: payload.expiresAt,
          daysLeft: 0
        }
      }
      return {
        ...base,
        state: 'licensed',
        reason: null,
        customer: payload.customer || null,
        licenseId: payload.licenseId || null,
        expiresAt: payload.expiresAt || null,
        daysLeft: expiresMs ? Math.max(0, Math.ceil((expiresMs - effectiveMs) / (24 * 60 * 60 * 1000))) : null
      }
    }

    if (rolledBack) {
      return {
        ...base,
        state: 'tampered',
        reason: 'System clock change detected — please activate a license',
        customer: null,
        licenseId: null,
        expiresAt: null,
        daysLeft: null
      }
    }

    if (trialActive) {
      return {
        ...base,
        state: 'trial',
        reason: stored && stored.error ? stored.error : null,
        customer: null,
        licenseId: null,
        expiresAt: null,
        daysLeft: null
      }
    }

    if (currentMs < graceEndsMs) {
      return {
        ...base,
        state: 'grace',
        reason: `Free trial ended — ${graceDaysLeft} grace day(s) left, please activate`,
        customer: null,
        licenseId: null,
        expiresAt: null,
        daysLeft: null
      }
    }

    if (stored && stored.error) {
      return { ...base, state: 'invalid', reason: stored.error, customer: null, licenseId: null, expiresAt: null, daysLeft: null }
    }

    return {
      ...base,
      state: 'trial_expired',
      reason: 'The free trial has ended — please activate a license',
      customer: null,
      licenseId: null,
      expiresAt: null,
      daysLeft: null
    }
  }

  function activate(key: string): LicenseStatus {
    if (!state) throw new Error('License state is not initialized')
    const clean = extractKey(key)
    if (!clean) throw new Error('Please paste a license key')
    const payload = verifyKey(clean, publicKeyPem)
    if (!payload.machine || payload.machine !== machine) {
      throw new Error(
        `This key belongs to machine ${payload.machine || 'unknown'}. Send your machine ID (${machine}) to receive the correct key.`
      )
    }
    const expiresMs = payload.expiresAt ? toTime(payload.expiresAt) : 0
    if (expiresMs && now().getTime() >= expiresMs) throw new Error('This license key has already expired')
    state.license = { key: clean, activatedAt: now().toISOString() }
    state.lastSeenAt = now().toISOString()
    saveState()
    return status()
  }

  function deactivate(): LicenseStatus {
    if (!state) throw new Error('License state is not initialized')
    state.license = null
    saveState()
    return status()
  }

  function isUsable(value: LicenseStatus = status()): boolean {
    return value.state === 'licensed' || value.state === 'trial' || value.state === 'grace'
  }

  function requireUsable(): LicenseStatus {
    const value = status()
    if (!isUsable(value)) {
      throw new Error(`License activation required: ${value.reason || 'this software is not activated on this machine'}`)
    }
    return value
  }

  return {
    get machineId() {
      return machine
    },
    status,
    activate,
    deactivate,
    isUsable,
    requireUsable,
    importState,
    exportState: () => encryptState(state, fingerprint)
  }
}

export type LicenseManager = ReturnType<typeof createLicenseManager>
