import { beforeAll, describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { makeKey, verifyKey, extractKey } from '../src/main/license/format'
import {
  createLicenseManager,
  encryptState,
  decryptState,
  TRIAL_DAYS,
  GRACE_DAYS
} from '../src/main/license/manager'
import type { LicenseManager } from '../src/main/license/manager'

const BASE = new Date('2026-01-01T00:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000

let privateKey: crypto.KeyObject
let publicPem: string
let otherPublicPem: string

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `restopulse-${prefix}-`))
}

function issue(machine: string, overrides: Partial<{ expiresAt: string | null; customer: string }> = {}): string {
  return makeKey(
    {
      v: 1,
      licenseId: 'LIC-TEST-0001',
      customer: overrides.customer ?? 'Test Restaurant',
      machine,
      issuedAt: BASE.toISOString(),
      expiresAt: overrides.expiresAt ?? null,
      features: ['all']
    },
    privateKey
  )
}

function managerAt(dir: string, now: () => Date, persist: ((blob: string) => void) | null = null): LicenseManager {
  return createLicenseManager({ userDataDir: dir, publicKeyPem: publicPem, now, persist })
}

beforeAll(() => {
  const pair = crypto.generateKeyPairSync('ed25519')
  privateKey = pair.privateKey
  publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' }) as string
  otherPublicPem = crypto.generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }) as string
})

describe('license key format', () => {
  it('round-trips a signed key with the vendor public key', () => {
    const key = issue('1A2B-3C4D-5E6F-7890')
    const payload = verifyKey(key, publicPem)
    expect(payload.customer).toBe('Test Restaurant')
    expect(payload.machine).toBe('1A2B-3C4D-5E6F-7890')
  })

  it('rejects a key signed by another keypair', () => {
    expect(() => verifyKey(issue('1A2B-3C4D-5E6F-7890'), otherPublicPem)).toThrow(/signature/i)
  })

  it('rejects a tampered payload', () => {
    const key = issue('1A2B-3C4D-5E6F-7890')
    const body = key.slice('RPP1-'.length)
    const dot = body.lastIndexOf('.')
    const payload = body.slice(0, dot)
    const signature = body.slice(dot + 1)
    const tampered = payload.slice(0, -2) + (payload.endsWith('A') ? 'B' : 'A') + payload.slice(-1)
    expect(() => verifyKey(`RPP1-${tampered}.${signature}`, publicPem)).toThrow()
  })

  it('extracts the key from wrapped chat text', () => {
    const key = issue('1A2B-3C4D-5E6F-7890')
    expect(extractKey(`Here is your key:\n  ${key}\nThanks!`)).toBe(key)
  })
})

describe('encrypted state', () => {
  it('round-trips and rejects a foreign fingerprint', () => {
    const state = { version: 1, trialStartedAt: BASE.toISOString() }
    const blob = encryptState(state, 'fingerprint-a')
    expect(decryptState(blob, 'fingerprint-a')).toEqual(state)
    expect(() => decryptState(blob, 'fingerprint-b')).toThrow()
  })
})

describe('license state machine', () => {
  it('starts a fresh trial with a formatted machine ID', () => {
    const manager = managerAt(tmpDir('fresh'), () => BASE)
    const status = manager.status()
    expect(status.state).toBe('trial')
    expect(status.trialDaysLeft).toBe(TRIAL_DAYS)
    expect(status.machineId).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/)
  })

  it('activates a valid key and rejects wrong-machine or expired keys', () => {
    const manager = managerAt(tmpDir('activate'), () => BASE)
    const status = manager.activate(issue(manager.machineId, { customer: 'City Diner' }))
    expect(status.state).toBe('licensed')
    expect(status.customer).toBe('City Diner')

    const other = managerAt(tmpDir('other'), () => BASE)
    expect(() => other.activate(issue(manager.machineId))).toThrow(/another machine|belongs to machine/i)

    const expired = managerAt(tmpDir('expired'), () => BASE)
    expect(() => expired.activate(issue(expired.machineId, { expiresAt: new Date(BASE.getTime() - DAY).toISOString() }))).toThrow(/expired/i)
  })

  it('moves trial → grace → locked at the expected times', () => {
    const dir = tmpDir('timeline')
    let clock = BASE
    const manager = managerAt(dir, () => clock)

    expect(manager.status().state).toBe('trial')

    clock = new Date(BASE.getTime() + (TRIAL_DAYS + 1) * DAY)
    const grace = manager.status()
    expect(grace.state).toBe('grace')
    expect(grace.graceDaysLeft).toBeGreaterThan(0)
    expect(grace.graceDaysLeft).toBeLessThanOrEqual(GRACE_DAYS)
    expect(manager.isUsable(grace)).toBe(true)

    clock = new Date(BASE.getTime() + (TRIAL_DAYS + GRACE_DAYS + 1) * DAY)
    const locked = manager.status()
    expect(locked.state).toBe('trial_expired')
    expect(manager.isUsable(locked)).toBe(false)
    expect(() => manager.requireUsable()).toThrow(/activation required/i)
  })

  it('flags a clock rollback beyond tolerance as tampered', () => {
    const dir = tmpDir('clock')
    let clock = BASE
    const manager = managerAt(dir, () => clock)
    manager.status()

    clock = new Date(BASE.getTime() - 12 * 60 * 60 * 1000)
    expect(manager.status().state).toBe('tampered')
  })

  it('cannot reset the trial when state files are deleted while the mirror survives', () => {
    const dir = tmpDir('mirror')
    let blob = ''
    let clock = BASE
    const manager = managerAt(dir, () => clock, (b) => (blob = b))
    expect(manager.status().state).toBe('trial')

    clock = new Date(BASE.getTime() + 5 * DAY)
    const first = manager.status()
    expect(first.trialDaysLeft).toBe(TRIAL_DAYS - 5)

    // Simulate a user wiping the state files to restart the trial
    fs.rmSync(path.join(dir, 'license.dat'))
    fs.rmSync(path.join(dir, 'license.bak'))

    const recreated = managerAt(dir, () => clock)
    expect(recreated.status().trialDaysLeft).toBe(TRIAL_DAYS)
    expect(recreated.importState(blob)).toBe(true)
    expect(recreated.status().trialDaysLeft).toBe(TRIAL_DAYS - 5)
  })

  it('recomputes the correct state after deactivation', () => {
    const dir = tmpDir('deactivate')
    const manager = managerAt(dir, () => BASE)
    manager.activate(issue(manager.machineId))
    expect(manager.status().state).toBe('licensed')
    expect(manager.deactivate().state).toBe('trial')
  })
})
