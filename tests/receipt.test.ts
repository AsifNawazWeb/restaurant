import { describe, expect, it } from 'vitest'
import { buildReceipt, stripReceiptTokens, type ReceiptOrderData } from '../src/main/services/receipt'
import { DEFAULT_SETTINGS } from '../src/main/services/settings'

const settings = { ...DEFAULT_SETTINGS, restaurantName: 'TKR' }

function order(qty: number): ReceiptOrderData {
  return {
    orderNumber: '0009',
    createdAt: '2024-01-13T04:23:13.000Z',
    orderType: 'dinein',
    cashierName: 'SHAHAZAD',
    lines: [
      { nameSnapshot: 'DAS RANGI PLATAR', variantSnapshot: null, qty, unitPriceCents: 1150000, lineSubtotalCents: 1150000 * qty, note: null },
      { nameSnapshot: 'ZEERA RAITA', variantSnapshot: null, qty: 2, unitPriceCents: 16900, lineSubtotalCents: 33800, note: 'no onions' }
    ],
    subtotalCents: 1150000 * qty + 33800,
    discountPercent: 0,
    discountCents: 0,
    serviceChargeCents: 0,
    taxCents: 0,
    totalCents: 1150000 * qty + 33800,
    payments: [{ method: 'cash', amountCents: 1150000 * qty + 33800 }]
  }
}

describe('receipt item table', () => {
  it('prints an aligned Description/Rate/Qty/Amount table (80mm = 42 cols)', () => {
    const lines = stripReceiptTokens(buildReceipt(order(1), settings, 80)).split('\n')
    const header = lines.find((l) => l.startsWith('Description'))!
    expect(header).toBeDefined()
    expect(header.length).toBe(42)
    expect(header).toContain('Rate')
    expect(header).toContain('Qty')
    expect(header).toContain('Amount')

    const dasRangi = lines.find((l) => l.startsWith('DAS RANGI PLATAR'))!
    expect(dasRangi.length).toBe(42)
    expect(dasRangi).toMatch(/^DAS RANGI PLATAR\s+11,500\s+1\s+11,500$/)

    const raita = lines.find((l) => l.startsWith('ZEERA RAITA'))!
    expect(raita).toMatch(/^ZEERA RAITA\s+169\s+2\s+338$/)
    expect(lines).toContain('   * no onions')

    for (const l of lines.filter((l) => l.length > 0)) expect(l.length).toBeLessThanOrEqual(42)
  })

  it('keeps columns exact on 58mm (32 cols)', () => {
    const lines = stripReceiptTokens(buildReceipt(order(1), settings, 58)).split('\n')
    const dasRangi = lines.find((l) => l.startsWith('DAS RANGI'))!
    expect(dasRangi.length).toBe(32)
    expect(dasRangi.startsWith('DAS RANGI P')).toBe(true)
  })

  it('marks the restaurant name bold and enlarged, letting the printer center it', () => {
    const receipt = buildReceipt(order(1), settings, 80)
    const nameLine = receipt.split('\n').find((l) => l.includes('{{L}}'))!
    expect(nameLine).toBe('{{L}}{{B}}TKR{{/B}}{{/L}}')
  })

  it('prints the total item count (sum of quantities)', () => {
    const lines = stripReceiptTokens(buildReceipt(order(16), settings, 80)).split('\n')
    const itemsLine = lines.find((l) => l.trimStart().startsWith('Items'))!
    expect(itemsLine.endsWith('18')).toBe(true)
  })

  it('omits the payment method row and bolds Subtotal/TOTAL', () => {
    const receipt = buildReceipt(order(1), settings, 80)
    expect(stripReceiptTokens(receipt)).not.toContain('CASH')

    const boldLines = receipt.split('\n').filter((l) => l.includes('{{B}}'))
    expect(boldLines.some((l) => l.includes('Subtotal'))).toBe(true)
    expect(boldLines.some((l) => l.includes('TOTAL'))).toBe(true)
  })
})
