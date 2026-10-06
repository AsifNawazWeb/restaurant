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

function itemLine(name: string, qty: number, amount: string, width: number): string {
  const qtyStr = `${qty} x `
  const full = qtyStr + name
  if (full.length + 1 + amount.length <= width) return row(full, amount, width)
  const lines: string[] = []
  let rest = name
  const firstAvail = width - qtyStr.length - amount.length - 1
  lines.push(row(qtyStr + rest.slice(0, firstAvail), amount, width))
  rest = rest.slice(firstAvail)
  while (rest.length > 0) {
    const chunk = rest.slice(0, width)
    lines.push(chunk)
    rest = rest.slice(width)
  }
  return lines.join('\n')
}

export function buildReceipt(
  order: ReceiptOrderData,
  settings: Settings,
  widthMm: 58 | 80 = 80
): string {
  const w = W(widthMm)
  const out: string[] = []

  out.push(center(settings.receiptHeader || settings.restaurantName, w))
  out.push(center(settings.restaurantName, w))
  if (settings.address) out.push(center(settings.address, w))
  if (settings.phone) out.push(center(`Tel: ${settings.phone}`, w))
  if (settings.vatRegistration) out.push(center(settings.vatRegistration, w))
  out.push(divider(w, '='))

  const dt = new Date(order.createdAt)
  const dateStr = dt.toLocaleString('en-GB', { hour12: false })
  out.push(row(`#${order.orderNumber}`, `${order.orderType.toUpperCase()}`, w))
  out.push(row(dateStr, `Cashier: ${order.cashierName}`, w))
  if (order.customerName) out.push(`Customer: ${order.customerName}`)
  out.push(divider(w))

  for (const line of order.lines) {
    const name = line.variantSnapshot ? `${line.nameSnapshot} (${line.variantSnapshot})` : line.nameSnapshot
    out.push(itemLine(name, line.qty, formatPKR(line.lineSubtotalCents), w))
    if (line.note) out.push(`   * ${line.note}`)
  }

  out.push(divider(w))
  out.push(row('Subtotal', formatPKR(order.subtotalCents), w))
  if (order.discountCents > 0) {
    out.push(row(`Discount ${order.discountPercent}%`, `-${formatPKR(order.discountCents)}`, w))
  }
  if (order.serviceChargeCents > 0) {
    out.push(row('Service Charge', formatPKR(order.serviceChargeCents), w))
  }
  out.push(row('GST', formatPKR(order.taxCents), w))
  out.push(divider(w, '='))
  out.push(row('TOTAL', formatPKR(order.totalCents), w))
  out.push(divider(w))

  for (const p of order.payments) {
    out.push(row(p.method.toUpperCase(), formatPKR(p.amountCents), w))
  }

  // Change due (cash overpayment)
  const paid = order.payments.reduce((s, p) => s + p.amountCents, 0)
  if (paid > order.totalCents) {
    out.push(row('CHANGE', formatPKR(paid - order.totalCents), w))
  }

  out.push(divider(w, '='))
  out.push(center(settings.receiptFooter, w))
  out.push('')

  return out.join('\n')
}

export function buildZReport(z: ZReportData, settings: Settings, widthMm: 58 | 80 = 80): string {
  const w = W(widthMm)
  const out: string[] = []
  out.push(center('Z - SHIFT CLOSE REPORT', w))
  out.push(center(settings.restaurantName, w))
  if (settings.vatRegistration) out.push(center(settings.vatRegistration, w))
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
