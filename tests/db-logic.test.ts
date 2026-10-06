import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { openDatabase, getSqlite } from '../src/main/db/connection'
import { bootstrapSchema } from '../src/main/db/migrate'
import { seedIfEmpty } from '../src/main/db/seed'
import * as inventory from '../src/main/services/inventory'
import * as orders from '../src/main/services/orders'
import * as shifts from '../src/main/services/shifts'
import * as reports from '../src/main/services/reports'
import * as catalog from '../src/main/services/catalog'
import * as settingsSvc from '../src/main/services/settings'
import type { CheckoutPayload } from '../src/shared/types'

let tmpDir: string

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'restopulse-test-'))
  openDatabase(tmpDir, 'test.db')
  bootstrapSchema(getSqlite())
  await seedIfEmpty(getDb())
})

beforeEach(() => {
  // tests share one connection; each uses fresh records where needed
})

describe('BOM engine — checkout deducts recipe consumption', () => {
  it('deducts materials and creates stock movements on checkout', async () => {
    const items = await catalog.listMenuItems(getDatabase())
    const biryani = items.find((i) => i.name === 'Chicken Biryani')!
    expect(biryani).toBeDefined()
    expect(biryani.costCents).toBeGreaterThan(0) // BOM-derived cost

    const before = await inventory.listMaterials(getDatabase())
    const riceBefore = before.find((m) => m.name === 'Basmati Rice')!.stockQty
    const chickenBefore = before.find((m) => m.name === 'Raw Chicken')!.stockQty

    const payload: CheckoutPayload = {
      lines: [
        {
          menuItemId: biryani.id,
          variantId: biryani.variants[0].id,
          variantName: biryani.variants[0].name,
          sku: biryani.sku,
          name: biryani.name,
          unitPriceCents: biryani.variants[0].priceCents,
          qty: 2,
          note: null,
          taxEnabled: biryani.taxEnabled
        }
      ],
      orderType: 'takeaway',
      discountPercent: 0,
      serviceChargeEnabled: false,
      payments: [{ method: 'card', amountCents: 80000, reference: 'T-1' }]
    }

    const result = await orders.checkout(getDatabase(), payload, 1, 'Ahmed Raza')
    expect(result.orderNumber).toMatch(/^ORD-/)
    expect(result.totals.totalCents).toBeGreaterThan(0)

    const after = await inventory.listMaterials(getDatabase())
    const riceAfter = after.find((m) => m.name === 'Basmati Rice')!.stockQty
    const chickenAfter = after.find((m) => m.name === 'Raw Chicken')!.stockQty

    // 0.2 kg basmati per biryani × 2 sold
    expect(riceBefore - riceAfter).toBeCloseTo(0.4, 5)
    // 0.15 kg chicken per biryani × 2
    expect(chickenBefore - chickenAfter).toBeCloseTo(0.3, 5)

    // movements recorded
    const movements = await inventory.listMovements(getDatabase(), { materialId: after.find((m) => m.name === 'Basmati Rice')!.id, limit: 5 })
    expect(movements.some((mv) => mv.reason === 'sale' && mv.refId === result.id)).toBe(true)
  })

  it('rejects insufficient payment', async () => {
    const items = await catalog.listMenuItems(getDatabase())
    const tea = items.find((i) => i.name === 'Doodh Patti Chai')!
    await expect(
      orders.checkout(
        getDatabase(),
        {
          lines: [
            {
              menuItemId: tea.id,
              variantId: tea.variants[0].id,
              variantName: tea.variants[0].name,
              sku: tea.sku,
              name: tea.name,
              unitPriceCents: tea.variants[0].priceCents,
              qty: 1,
              note: null,
              taxEnabled: tea.taxEnabled
            }
          ],
          orderType: 'takeaway',
          discountPercent: 0,
          serviceChargeEnabled: false,
          payments: [{ method: 'cash', amountCents: 100 }]
        },
        1,
        'Ahmed Raza'
      )
    ).rejects.toThrow(/Insufficient/)
  })

  it('rejects price mismatch between renderer and DB', async () => {
    const items = await catalog.listMenuItems(getDatabase())
    const tea = items.find((i) => i.name === 'Doodh Patti Chai')!
    await expect(
      orders.checkout(
        getDatabase(),
        {
          lines: [
            {
              menuItemId: tea.id,
              variantId: tea.variants[0].id,
              variantName: tea.variants[0].name,
              sku: tea.sku,
              name: tea.name,
              unitPriceCents: tea.variants[0].priceCents + 1,
              qty: 1,
              note: null,
              taxEnabled: tea.taxEnabled
            }
          ],
          orderType: 'takeaway',
          discountPercent: 0,
          serviceChargeEnabled: false,
          payments: [{ method: 'card', amountCents: 999999 }]
        },
        1,
        'Ahmed Raza'
      )
    ).rejects.toThrow(/Price changed/)
  })
})

describe('Inventory — weighted average unit cost', () => {
  it('recalculates weighted average on purchase', async () => {
    const before = (await inventory.listMaterials(getDatabase())).find((m) => m.name === 'Raw Chicken')!
    const oldQty = before.stockQty
    const oldAvg = before.avgUnitCostCents

    await inventory.createPurchase(
      getDatabase(),
      {
        supplierName: 'Test Supplier',
        invoiceRef: 'INV-T1',
        lines: [{ materialId: before.id, qty: 10, lineCostCents: 2_000_000 }] // Rs. 200/kg
      },
      'Tester'
    )

    const after = (await inventory.listMaterials(getDatabase())).find((m) => m.name === 'Raw Chicken')!
    expect(after.stockQty).toBeCloseTo(oldQty + 10, 5)
    const expectedAvg = Math.round((oldQty * oldAvg + 10 * 200000) / (oldQty + 10))
    expect(after.avgUnitCostCents).toBe(expectedAvg)
  })

  it('wastage reduces stock at weighted average cost', async () => {
    const mats = await inventory.listMaterials(getDatabase())
    const oil = mats.find((m) => m.name === 'Cooking Oil')!
    const q0 = oil.stockQty
    const entry = await inventory.logWastage(getDatabase(), oil.id, 1.5, 'spoilage', 'Tester')
    expect(entry.costCents).toBe(Math.round(1.5 * oil.avgUnitCostCents))
    const after = (await inventory.listMaterials(getDatabase())).find((m) => m.id === oil.id)!
    expect(after.stockQty).toBeCloseTo(q0 - 1.5, 5)
  })
})

describe('Shift close — variance and Z-report', () => {
  it('cash out only via recorded cash sales; variance = physical - system', async () => {
    const db = getDatabase()
    // Close the seeded open shift if present, then open a clean one
    const existing = await shifts.getCurrentShift(db)
    if (existing) {
      await shifts.closeShift(db, { physicalCashCents: existing.openingCashCents }, 'Tester')
    }
    const shift = await shifts.openShift(db, 500000, 'Tester')
    void shift

    // make a cash sale
    const items = await catalog.listMenuItems(db)
    const tea = items.find((i) => i.name === 'Doodh Patti Chai')!
    const checkout = await orders.checkout(
      db,
      {
        lines: [
          {
            menuItemId: tea.id,
            variantId: tea.variants[0].id,
            variantName: tea.variants[0].name,
            sku: tea.sku,
            name: tea.name,
            unitPriceCents: tea.variants[0].priceCents,
            qty: 1,
            note: null,
            taxEnabled: tea.taxEnabled
          }
        ],
        orderType: 'takeaway',
        discountPercent: 0,
        serviceChargeEnabled: false,
        payments: [{ method: 'cash', amountCents: 20000 }]
      },
      1,
      'Ahmed Raza'
    )

    const x = await shifts.getXReport(db)
    expect(x).not.toBeNull()
    expect(x!.ordersCount).toBeGreaterThanOrEqual(1)
    expect(x!.systemCashCents).toBe(500000 + x!.cashSalesCents)

    const physical = x!.systemCashCents - 350 // drawer short by Rs. 3.50
    const closed = await shifts.closeShift(db, { physicalCashCents: physical }, 'Tester')
    expect(closed.varianceCents).toBe(-350)
    expect(closed.zReportText).toContain('Z - SHIFT CLOSE REPORT')
    void checkout
  })
})

describe('Reports', () => {
  it('daily sales / category mix / profitability / variance return shapes', async () => {
    const db = getDatabase()
    const { from, to } = { from: '2000-01-01T00:00:00.000Z', to: '2999-01-01T23:59:59.999Z' }
    const daily = await reports.getDailySales(db, from, to)
    expect(daily.length).toBeGreaterThan(0)
    expect(daily[0]).toHaveProperty('revenueCents')

    const cats = await reports.getCategorySales(db, from, to)
    expect(cats.length).toBeGreaterThan(0)

    const prof = await reports.getItemProfitability(db, from, to)
    expect(prof.length).toBeGreaterThan(0)
    expect(prof[0].marginPct).toBeGreaterThan(0)

    const variance = await reports.getConsumptionVariance(db, from, to)
    expect(variance.length).toBeGreaterThan(0)
    for (const v of variance) {
      expect(v.varianceQty).toBeCloseTo(v.actualQty - v.expectedQty, 5)
    }
  })
})

describe('Settings round-trip', () => {
  it('saves and loads typed values', async () => {
    const db = getDatabase()
    const saved = await settingsSvc.saveSettings(db, { defaultVatPercent: 19, serviceChargeEnabled: true, quickDiscounts: [5, 10] })
    expect(saved.defaultVatPercent).toBe(19)
    expect(saved.serviceChargeEnabled).toBe(true)
    expect(saved.quickDiscounts).toEqual([5, 10])
    const loaded = await settingsSvc.getSettings(db)
    expect(loaded.paperWidthMm).toBe(80)
    expect(loaded.defaultVatPercent).toBe(19)
  })
})

/** helper */
import { getDb } from '../src/main/db/connection'
function getDatabase() {
  return getDb()
}
