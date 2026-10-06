import type { DB } from '../db/connection'
import * as schema from '../db/schema'
import type { Settings } from '@shared/types'

export const DEFAULT_SETTINGS: Settings = {
  restaurantName: 'My Restaurant',
  address: '',
  phone: '',
  vatRegistration: '',
  receiptHeader: 'Thank you for your order!',
  receiptFooter: 'Shukriya - Please visit again',
  defaultVatPercent: 18,
  serviceChargePercent: 10,
  serviceChargeEnabled: false,
  quickDiscounts: [5, 10, 15],
  printerType: 'network',
  printerTarget: '192.168.1.87',
  paperWidthMm: 80,
  autoDrawerKick: true,
  uiScale: 1.25
}

const BOOL_KEYS = new Set(['serviceChargeEnabled', 'autoDrawerKick'])
const NUM_KEYS = new Set(['defaultVatPercent', 'serviceChargePercent', 'paperWidthMm', 'uiScale'])
const JSON_KEYS = new Set(['quickDiscounts'])

export async function getSettings(db: DB): Promise<Settings> {
  const rows = await db.select().from(schema.settings)
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS }
  for (const [key, value] of map) {
    if (!(key in out)) continue
    if (BOOL_KEYS.has(key)) out[key] = value === '1' || value === 'true'
    else if (NUM_KEYS.has(key)) out[key] = Number(value)
    else if (JSON_KEYS.has(key)) {
      try {
        out[key] = JSON.parse(value)
      } catch {
        out[key] = DEFAULT_SETTINGS.quickDiscounts
      }
    } else out[key] = value
  }
  return out as unknown as Settings
}

export async function saveSettings(db: DB, patch: Partial<Settings>): Promise<Settings> {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS)) continue
    let stored: string
    if (typeof value === 'boolean') stored = value ? '1' : '0'
    else if (JSON_KEYS.has(key)) stored = JSON.stringify(value)
    else stored = String(value)
    await db
      .insert(schema.settings)
      .values({ key, value: stored })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: stored } })
  }
  return getSettings(db)
}

export async function getPrinterSettings(db: DB): Promise<Settings> {
  return getSettings(db)
}
