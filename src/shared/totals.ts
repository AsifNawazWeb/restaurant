import { percentOfCents, roundCents } from './money'

export interface TotalsInputLine {
  unitPriceCents: number
  qty: number
  taxEnabled: boolean
}

export interface TotalsInput {
  lines: TotalsInputLine[]
  discountPercent: number
  vatPercent: number
  serviceChargePercent: number
  serviceChargeEnabled: boolean
}
export interface Totals {
  subtotalCents: number
  discountCents: number
  taxableDiscountCents: number
  serviceChargeCents: number
  taxCents: number
  totalCents: number
}

/**
 * Single source of truth for bill math (renderer preview + main checkout):
 *   subtotal = Σ (price × qty)
 *   discount = subtotal × discountPercent, allocated proportionally to taxable lines
 *   serviceCharge = (subtotal - discount) × scPercent        [when enabled]
 *   GST base   = (taxableSubtotal - taxableDiscount) + serviceCharge
 *   tax        = base × gstPercent (FBR Sales Tax / GST)
 *   total      = subtotal - discount + serviceCharge + tax
 */
export function computeTotals(input: TotalsInput): Totals {
  let subtotalCents = 0
  let taxableSubtotal = 0
  for (const line of input.lines) {
    const lineTotal = roundCents(line.unitPriceCents * line.qty)
    subtotalCents += lineTotal
    if (line.taxEnabled) taxableSubtotal += lineTotal
  }

  const discountCents = percentOfCents(subtotalCents, input.discountPercent)
  const taxableDiscountCents = percentOfCents(taxableSubtotal, input.discountPercent)

  const netAfterDiscount = subtotalCents - discountCents
  const serviceChargeCents = input.serviceChargeEnabled
    ? percentOfCents(netAfterDiscount, input.serviceChargePercent)
    : 0

  const vatBase = taxableSubtotal - taxableDiscountCents + serviceChargeCents
  const taxCents = percentOfCents(vatBase, input.vatPercent)

  const totalCents = netAfterDiscount + serviceChargeCents + taxCents

  return {
    subtotalCents,
    discountCents,
    taxableDiscountCents,
    serviceChargeCents,
    taxCents,
    totalCents
  }
}

/** Cash rounding: Pakistani cash transactions settle to the whole rupee. */
export function roundCashTender(totalCents: number): number {
  return Math.round(totalCents / 100) * 100
}
