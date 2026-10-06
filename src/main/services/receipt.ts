import { formatPKR } from '../../shared/money'
import type { Settings } from '../../shared/types'

export interface ReceiptOrderData {
  orderNumber: string
  createdAt: string
  orderType: string
  cashierName: string
  customerName?: string | null
  lines: { nameSnapshot: string; variantSnapshot: string | null; qty: number; unitPriceCents: number; lineSubtotalCents: number; note: string | null }[]
  subtotalCents: number
  discountPercent: number
  discountCents: number
  serviceChargeCents: number
  taxCents: number
  totalCents: number
  payments: { method: string; amountCents: number; reference?: string | null }[]
}

export interface ZReportData {
  shiftId: number
  openedAt: string
  closedAt: string
  openedBy: string
  closedBy: string
  openingCashCents: number
  systemCashCents: number
  physicalCashCents: number
  varianceCents: number
  cashSalesCents: number
  cardSalesCents: number
  ordersCount: number
  grossSalesCents: number
  discountCents: number
  serviceChargeCents: number
  taxCents: number
  netSalesCents: number
}

const W = (widthMm: 58 | 80) => (widthMm === 80 ? 42 : 32)

/**
 * Lightweight inline markup consumed by the printer layer:
 * ESC/POS maps it to bold / double-size commands; the HTML (system printer)
 * path maps it to <strong> / larger font; file spool strips it.
 */
export const RECEIPT_TOKENS = {
  boldOn: '{{B}}',
  boldOff: '{{/B}}',
  largeOn: '{{L}}',
  largeOff: '{{/L}}'
} as const

const TOKEN_PATTERN = /\{\{\/?[BL]\}\}/g

/** Remove receipt markup, leaving only printable text. */
export function stripReceiptTokens(text: string): string {
  return text.replace(TOKEN_PATTERN, '')
}

function center(text: string, width: number): string {
  const t = text.length > width ? text.slice(0, width) : text
  const pad = Math.max(0, Math.floor((width - t.length) / 2))
  return ' '.repeat(pad) + t
}

function row(left: string, right: string, width: number): string {
  const r = right
  const space = Math.max(1, width - left.length - r.length)
  return left + ' '.repeat(space) + r
}

function divider(width: number, char = '-'): string {
  return char.repeat(width)
}

/** Column widths per paper size (desc + rate + gap + qty + amount === total width). */
function columns(width: number): { desc: number; rate: number; qty: number; amount: number } {
  return width >= 42 ? { desc: 17, rate: 9, qty: 3, amount: 12 } : { desc: 11, rate: 8, qty: 3, amount: 9 }
}

function padRight(text: string, width: number): string {
  return text.length > width ? text.slice(0, width) : text.padEnd(width)
}

function padLeft(text: string, width: number): string {
  return text.length > width ? text.slice(0, width) : text.padStart(width)
}

/** Plain grouped number (no "Rs." prefix) so the item table stays column-aligned. */
function plainNumber(cents: number): string {
  const abs = Math.abs(cents)
  const whole = Math.floor(abs / 100)
  const frac = abs % 100
  const text = frac === 0 ? whole.toLocaleString('en-US') : `${whole.toLocaleString('en-US')}.${String(frac).padStart(2, '0')}`
  return `${cents < 0 ? '-' : ''}${text}`
}

function itemHeaderRow(width: number): string {
  const c = columns(width)
  return padRight('Description', c.desc) + padLeft('Rate', c.rate) + ' ' + padLeft('Qty', c.qty) + padLeft('Amount', c.amount)
}

function itemRow(name: string, rate: string, qty: number, amount: string, width: number): string {
  const c = columns(width)
  return padRight(name, c.desc) + padLeft(rate, c.rate) + ' ' + padLeft(String(qty), c.qty) + padLeft(amount, c.amount)
}

export function buildReceipt(
  order: ReceiptOrderData,
  settings: Settings,
  widthMm: 58 | 80 = 80
): string {
  const w = W(widthMm)
  const out: string[] = []

  const name = settings.restaurantName
  const canEnlarge = name.length * 2 <= w
  out.push(
    canEnlarge
      ? `${RECEIPT_TOKENS.largeOn}${RECEIPT_TOKENS.boldOn}${name}${RECEIPT_TOKENS.boldOff}${RECEIPT_TOKENS.largeOff}`
      : `${RECEIPT_TOKENS.boldOn}${center(name, w)}${RECEIPT_TOKENS.boldOff}`
  )
  if (settings.address) out.push(center(settings.address, w))
  if (settings.phone) out.push(center(`Tel: ${settings.phone}`, w))
  out.push(divider(w, '='))

  const dt = new Date(order.createdAt)
  const dateStr = dt.toLocaleString('en-GB', { hour12: false })
  out.push(row(`#${order.orderNumber}`, `${order.orderType.toUpperCase()}`, w))
  out.push(row(dateStr, `Cashier: ${order.cashierName}`, w))
  if (order.customerName) out.push(`Customer: ${order.customerName}`)
  out.push(divider(w))

  out.push(itemHeaderRow(w))
  out.push(divider(w))

  const itemsCount = order.lines.reduce((s, l) => s + l.qty, 0)

  for (const line of order.lines) {
    const name = line.variantSnapshot ? `${line.nameSnapshot} (${line.variantSnapshot})` : line.nameSnapshot
    out.push(itemRow(name, plainNumber(line.unitPriceCents), line.qty, plainNumber(line.lineSubtotalCents), w))
    if (line.note) out.push(`   * ${line.note}`)
  }

  out.push(divider(w))
  out.push(row('Items', String(itemsCount), w))
  out.push(`${RECEIPT_TOKENS.boldOn}${row('Subtotal', formatPKR(order.subtotalCents), w)}${RECEIPT_TOKENS.boldOff}`)
  if (order.discountCents > 0) {
    out.push(row(`Discount ${order.discountPercent}%`, `-${formatPKR(order.discountCents)}`, w))
  }
  if (order.serviceChargeCents > 0) {
    out.push(row('Service Charge', formatPKR(order.serviceChargeCents), w))
  }
  out.push(row('GST', formatPKR(order.taxCents), w))
  out.push(divider(w, '='))
  out.push(`${RECEIPT_TOKENS.boldOn}${row('TOTAL', formatPKR(order.totalCents), w)}${RECEIPT_TOKENS.boldOff}`)
  out.push(divider(w, '='))
  out.push(center('Developed by: AsifTech (03139329499)', w))
  out.push('')

  return out.join('\n')
}

export function buildZReport(z: ZReportData, settings: Settings, widthMm: 58 | 80 = 80): string {
  const w = W(widthMm)
  const out: string[] = []
  out.push(center('Z - SHIFT CLOSE REPORT', w))
  out.push(center(settings.restaurantName, w))
  out.push(divider(w, '='))
  out.push(row('Shift ID', `#${z.shiftId}`, w))
  out.push(row('Opened', z.openedAt.replace('T', ' ').slice(0, 19), w))
  out.push(row('Closed', z.closedAt.replace('T', ' ').slice(0, 19), w))
  out.push(row('By', `${z.openedBy} / ${z.closedBy}`, w))
  out.push(divider(w))
  out.push(row('Orders', String(z.ordersCount), w))
  out.push(row('Gross Sales', formatPKR(z.grossSalesCents), w))
  out.push(row('Discounts', `-${formatPKR(z.discountCents)}`, w))
  if (z.serviceChargeCents > 0) out.push(row('Service Charge', formatPKR(z.serviceChargeCents), w))
  out.push(row('GST Collected', formatPKR(z.taxCents), w))
  out.push(row('NET SALES', formatPKR(z.netSalesCents), w))
  out.push(divider(w, '='))
  out.push(row('Cash Sales', formatPKR(z.cashSalesCents), w))
  out.push(row('Card Sales', formatPKR(z.cardSalesCents), w))
  out.push(divider(w))
  out.push(row('Opening Float', formatPKR(z.openingCashCents), w))
  out.push(row('System Cash', formatPKR(z.systemCashCents), w))
  out.push(row('Counted Cash', formatPKR(z.physicalCashCents), w))
  const varLabel = z.varianceCents >= 0 ? 'VARIANCE +' : 'VARIANCE '
  out.push(row(varLabel, formatPKR(z.varianceCents), w))
  out.push(divider(w, '='))
  out.push(center('End of report', w))
  out.push('')
  return out.join('\n')
}
