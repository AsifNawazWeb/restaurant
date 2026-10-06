import { describe, expect, it } from 'vitest'
import { computeTotals, roundCashTender } from '../src/shared/totals'

describe('computeTotals — single source of truth for POS bill math', () => {
  const lines = [
    { unitPriceCents: 95000, qty: 2, taxEnabled: true }, // taxable 190,000
    { unitPriceCents: 12000, qty: 1, taxEnabled: false } // non-taxable beverage 12,000
  ]

  it('plain taxable order: 18% GST on (subtotal - discount) + service charge', () => {
    const t = computeTotals({ lines, discountPercent: 0, vatPercent: 18, serviceChargePercent: 10, serviceChargeEnabled: false })
    expect(t.subtotalCents).toBe(202000)
    expect(t.discountCents).toBe(0)
    expect(t.serviceChargeCents).toBe(0)
    // GST base = taxable subtotal (190000)
    expect(t.taxCents).toBe(34200)
    expect(t.totalCents).toBe(236200)
  })

  it('discount allocates proportionally to taxable lines only', () => {
    const t = computeTotals({ lines, discountPercent: 5, vatPercent: 18, serviceChargePercent: 10, serviceChargeEnabled: true })
    expect(t.discountCents).toBe(10100) // 5% of 202000
    expect(t.taxableDiscountCents).toBe(9500) // 5% of 190000
    // SC on (202000 - 10100)
    expect(t.serviceChargeCents).toBe(19190)
    // GST base = (190000 - 9500) + 19190 = 199690
    expect(t.taxCents).toBe(35944)
    expect(t.totalCents).toBe(202000 - 10100 + 19190 + 35944)
  })

  it('service charge is only applied when enabled', () => {
    const on = computeTotals({ lines, discountPercent: 0, vatPercent: 18, serviceChargePercent: 10, serviceChargeEnabled: true })
    const off = computeTotals({ lines, discountPercent: 0, vatPercent: 18, serviceChargePercent: 10, serviceChargeEnabled: false })
    expect(on.serviceChargeCents).toBe(20200)
    expect(off.serviceChargeCents).toBe(0)
    // GST is charged on (taxable + SC) when SC is on
    expect(on.taxCents).toBe(percentOfCents(190000 + on.serviceChargeCents, 18))
    expect(on.totalCents).toBe(off.totalCents + on.serviceChargeCents + percentOfCents(on.serviceChargeCents, 18))
  })

  it('empty cart produces zeros', () => {
    const t = computeTotals({ lines: [], discountPercent: 10, vatPercent: 18, serviceChargePercent: 10, serviceChargeEnabled: true })
    expect(t.totalCents).toBe(0)
  })

  it('cash tender rounds to whole rupees', () => {
    expect(roundCashTender(236214)).toBe(236200)
    expect(roundCashTender(236250)).toBe(236300)
  })
})

function percentOfCents(cents: number, pct: number): number {
  return Math.round((cents * pct) / 100)
}
