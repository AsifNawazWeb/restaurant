import { create } from 'zustand'
import type { CartLine, OrderType, PaymentMethod, Settings, TotalsSummary } from '@shared/types'
import { computeTotals } from '@shared/totals'

export interface NewPayment {
  method: PaymentMethod
  amountCents: number
  reference?: string
}

interface PosState {
  lines: CartLine[]
  orderType: OrderType
  discountPercent: number
  serviceChargeEnabled: boolean
  activeCategoryId: number | 'all'
  search: string
  lastCheckout: { orderNumber: string; receiptText: string } | null
  setActiveCategory: (c: number | 'all') => void
  setSearch: (s: string) => void
  setOrderType: (t: OrderType) => void
  setDiscount: (p: number) => void
  toggleServiceCharge: () => void
  addLine: (line: Omit<CartLine, 'qty' | 'note'> & { qty?: number; note?: string | null }) => void
  increment: (index: number) => void
  decrement: (index: number) => void
  setNote: (index: number, note: string) => void
  removeLine: (index: number) => void
  clearCart: () => void
  setLastCheckout: (c: { orderNumber: string; receiptText: string } | null) => void
  totals: (settings: Settings | null) => TotalsSummary
}

export const usePos = create<PosState>((set, get) => ({
  lines: [],
  orderType: 'takeaway',
  discountPercent: 0,
  serviceChargeEnabled: false,
  activeCategoryId: 'all',
  search: '',
  lastCheckout: null,
  setActiveCategory: (activeCategoryId) => set({ activeCategoryId }),
  setSearch: (search) => set({ search }),
  setOrderType: (orderType) => set({ orderType }),
  setDiscount: (discountPercent) => set({ discountPercent }),
  toggleServiceCharge: () => set((s) => ({ serviceChargeEnabled: !s.serviceChargeEnabled })),
  addLine: (line) =>
    set((s) => {
      const idx = s.lines.findIndex(
        (l) => l.variantId === line.variantId && l.name === line.name && (l.note ?? '') === ''
      )
      if (idx >= 0 && !line.note) {
        const lines = [...s.lines]
        lines[idx] = { ...lines[idx], qty: lines[idx].qty + 1 }
        return { lines }
      }
      return { lines: [...s.lines, { ...line, qty: line.qty ?? 1, note: line.note ?? null }] }
    }),
  increment: (index) =>
    set((s) => {
      const lines = [...s.lines]
      lines[index] = { ...lines[index], qty: lines[index].qty + 1 }
      return { lines }
    }),
  decrement: (index) =>
    set((s) => {
      const lines = [...s.lines]
      if (lines[index].qty <= 1) return { lines: lines.filter((_, i) => i !== index) }
      lines[index] = { ...lines[index], qty: lines[index].qty - 1 }
      return { lines }
    }),
  setNote: (index, note) =>
    set((s) => {
      const lines = [...s.lines]
      lines[index] = { ...lines[index], note: note || null }
      return { lines }
    }),
  removeLine: (index) => set((s) => ({ lines: s.lines.filter((_, i) => i !== index) })),
  clearCart: () => set({ lines: [], discountPercent: 0, serviceChargeEnabled: false }),
  setLastCheckout: (lastCheckout) => set({ lastCheckout }),
  totals: (settings) => {
    const s = get()
    if (!settings) {
      return {
        subtotalCents: 0,
        discountCents: 0,
        taxableBaseCents: 0,
        serviceChargeCents: 0,
        taxCents: 0,
        totalCents: 0,
        paidCents: 0,
        changeCents: 0
      }
    }
    const t = computeTotals({
      lines: s.lines,
      discountPercent: s.discountPercent,
      vatPercent: settings.defaultVatPercent,
      serviceChargePercent: settings.serviceChargePercent,
      serviceChargeEnabled: s.serviceChargeEnabled
    })
    return {
      subtotalCents: t.subtotalCents,
      discountCents: t.discountCents,
      taxableBaseCents: t.subtotalCents - t.discountCents + t.serviceChargeCents,
      serviceChargeCents: t.serviceChargeCents,
      taxCents: t.taxCents,
      totalCents: t.totalCents,
      paidCents: 0,
      changeCents: 0
    }
  }
}))
