import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Search,
  Plus,
  Minus,
  Trash2,
  StickyNote,
  Printer,
  ShoppingBag,
  Utensils,
  Bike,
  CircleAlert
} from 'lucide-react'
import { toast } from 'sonner'
import { useUi } from '@/stores/ui'
import { usePos } from '@/stores/pos'
import { api, unwrap } from '@/lib/api'
import { formatPKR } from '@shared/money'
import type { CheckoutPayload, CheckoutResult, MenuCategory, MenuItem, PaymentMethod } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty'
import { cn } from '@/lib/utils'

const ORDER_TYPES = [
  { id: 'takeaway', label: 'Takeaway', icon: <ShoppingBag size={13} /> },
  { id: 'dinein', label: 'Dine-In', icon: <Utensils size={13} /> },
  { id: 'delivery', label: 'Delivery', icon: <Bike size={13} /> }
] as const

const PAYMENT_METHODS: { id: PaymentMethod; label: string }[] = [
  { id: 'cash', label: 'Cash' },
  { id: 'card', label: 'Card' },
  { id: 'split', label: 'Split (Cash + Card)' }
]

export function PosScreen() {
  const { settings, shift } = useUi()
  const pos = usePos()
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const searchRef = useRef<HTMLInputElement>(null)

  const totals = pos.totals(settings)

  /** Initial + refresh */
  useEffect(() => {
    ;(async () => {
      try {
        const [cats, all] = await Promise.all([unwrap(api.catalog.listCategories()), unwrap(api.catalog.listItems({}))])
        setCategories(cats)
        setItems(all)
      } catch (err) {
        toast.error((err as Error).message)
      }
    })()
  }, [])

  /** Ctrl+F focuses search */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
      if (e.key === 'F12') {
        e.preventDefault()
        if (usePos.getState().lines.length > 0) generateBillRef.current()
      }
      if (e.key === 'F2') {
        // F2 = new bill when already on POS
        if (useUi.getState().screen === 'pos') {
          pos.clearCart()
          searchRef.current?.focus()
          toast.success('New bill started')
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const term = pos.search.trim().toLowerCase()
    return items.filter((i) => {
      if (!i.isAvailable) return false
      if (pos.activeCategoryId !== 'all' && i.categoryId !== pos.activeCategoryId) return false
      if (!term) return true
      return i.name.toLowerCase().includes(term) || i.sku.toLowerCase().includes(term)
    })
  }, [items, pos.activeCategoryId, pos.search])

  function quickAdd(item: MenuItem) {
    const v = item.variants[0]
    if (!v) {
      toast.error(`${item.name} has no price configured`)
      return
    }
    pos.addLine({
      menuItemId: item.id,
      variantId: v.id,
      variantName: v.name,
      sku: item.sku,
      name: item.name,
      unitPriceCents: v.priceCents,
      taxEnabled: item.taxEnabled
    })
  }

  const [payMethod, setPayMethod] = useState<PaymentMethod>('cash')
  const [splitCash, setSplitCash] = useState('')
  const [splitCard, setSplitCard] = useState('')
  const [busy, setBusy] = useState(false)

  const total = totals.totalCents
  const splitMismatch = payMethod === 'split' && Math.round(Number(splitCash) * 100) + Math.round(Number(splitCard) * 100) !== total

  async function generateBill(method: PaymentMethod = payMethod) {
    const s = usePos.getState()
    if (s.lines.length === 0) {
      toast.error('Cart is empty')
      return
    }
    let payments: CheckoutPayload['payments']
    if (method === 'cash') {
      payments = [{ method: 'cash', amountCents: total }]
    } else if (method === 'card') {
      payments = [{ method: 'card', amountCents: total }]
    } else {
      payments = [
        { method: 'cash', amountCents: Math.round(Number(splitCash) * 100) },
        { method: 'card', amountCents: Math.round(Number(splitCard) * 100) }
      ]
    }
    await doCheckout(payments)
  }

  /** Latest generateBill for keyboard shortcuts (avoids stale closures) */
  const generateBillRef = useRef(generateBill)
  useEffect(() => {
    generateBillRef.current = generateBill
  })

  async function doCheckout(payloadPayments: CheckoutPayload['payments']) {
    const s = usePos.getState()
    if (!settings) return
    setBusy(true)
    try {
      const payload: CheckoutPayload = {
        lines: s.lines,
        orderType: s.orderType,
        discountPercent: s.discountPercent,
        serviceChargeEnabled: s.serviceChargeEnabled,
        payments: payloadPayments,
        customerName: null
      }
      const result = (await unwrap(api.orders.checkout(payload))) as CheckoutResult
      toast.success(`Order ${result.orderNumber} paid — ${formatPKR(result.totals.totalCents)}`)
      if (result.totals.changeCents > 0) {
        toast.info(`Change due: ${formatPKR(result.totals.changeCents)}`)
      }
      for (const a of result.lowStockAlerts) {
        toast.warning(`Low stock: ${a.materialName} — ${a.stockQty} ${a.unit} left`, {
          icon: <CircleAlert size={14} />
        })
      }
      await unwrap(api.printer.receipt({ receiptText: result.receiptText }))
      pos.setLastCheckout({ orderNumber: result.orderNumber, receiptText: result.receiptText })
      pos.clearCart()
      setSplitCash('')
      setSplitCard('')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ---------- Left: Menu Browser (65%) ---------- */}
      <section className="flex min-w-0 flex-[65] flex-col border-r border-border">
        {/* Top bar */}
        <div className="flex flex-col gap-3 border-b border-border bg-surface px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <h1 className="text-[15px] font-bold tracking-tight">POS Billing</h1>
              {shift ? (
                <Badge variant="success">Shift #{shift.id}</Badge>
              ) : (
                <Badge variant="warning">No Shift — sales still record</Badge>
              )}
            </div>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground-muted" />
            <Input
              ref={searchRef}
              value={pos.search}
              onChange={(e) => pos.setSearch(e.target.value)}
              placeholder="Search menu items or SKU…"
              className="pl-8"
            />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <CategoryPill active={pos.activeCategoryId === 'all'} onClick={() => pos.setActiveCategory('all')}>
              All
            </CategoryPill>
            {categories.map((c) => (
              <CategoryPill
                key={c.id}
                active={pos.activeCategoryId === c.id}
                onClick={() => pos.setActiveCategory(c.id)}
              >
                {c.name}
              </CategoryPill>
            ))}
          </div>
        </div>

        {/* Item grid */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Utensils size={28} />}
              title="No items found"
              hint={pos.search ? `Nothing matches "${pos.search}"` : 'This category has no available items'}
            />
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
              {filtered.map((item) => (
                <button
                  key={item.id}
                  onClick={() => quickAdd(item)}
                  className="group flex flex-col overflow-hidden rounded-xl border border-border bg-surface text-left transition-all hover:border-primary/50 hover:shadow-md active:scale-[0.98]"
                >
                  <div
                    className="flex h-[72px] items-center justify-center bg-gradient-to-br from-primary-soft to-surface-2 text-[18px] font-bold text-primary"
                    style={
                      item.imageUrl
                        ? { backgroundImage: `url(${item.imageUrl})`, backgroundSize: 'cover', color: 'transparent' }
                        : undefined
                    }
                  >
                    {item.imageUrl ? '' : item.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-2.5">
                    <div className="line-clamp-2 min-h-[32px] text-[12px] font-medium leading-tight text-foreground">
                      {item.name}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="tabular text-[12px] font-bold text-foreground">
                        {formatPKR(item.variants[0]?.priceCents ?? item.minPriceCents)}
                      </span>
                      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary text-primary-fg opacity-80 transition-opacity group-hover:opacity-100">
                        <Plus size={12} />
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ---------- Right: Active Bill (35%) ---------- */}
      <section className="flex min-w-0 flex-[35] flex-col bg-surface">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-[14px] font-bold">Active Bill</h2>
            <Badge variant="neutral">#NEXT</Badge>
          </div>
          <div className="flex rounded-lg border border-border p-0.5">
            {ORDER_TYPES.map((t) => (
              <button
                key={t.id}
                onClick={() => pos.setOrderType(t.id)}
                className={cn(
                  'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                  pos.orderType === t.id ? 'bg-primary text-primary-fg' : 'text-foreground-muted hover:text-foreground'
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Cart */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {pos.lines.length === 0 ? (
            <EmptyState
              icon={<ShoppingBag size={26} />}
              title="No items yet"
              hint="Tap menu items on the left to build the bill"
              className="pt-16"
            />
          ) : (
            <ul className="divide-y divide-border">
              {pos.lines.map((line, i) => (
                <li key={`${line.variantId}-${i}-${line.name}`} className="group px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-medium text-foreground">{line.name}</div>
                      {line.variantName && (
                        <div className="text-[11px] text-foreground-muted">{line.variantName}</div>
                      )}
                    </div>
                    <span className="tabular text-[12.5px] font-semibold">
                      {formatPKR(line.unitPriceCents * line.qty)}
                    </span>
                    <button
                      onClick={() => pos.removeLine(i)}
                      className="rounded-md p-1 text-foreground-muted opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger group-hover:opacity-100"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <div className="flex items-center rounded-md border border-border">
                      <button
                        onClick={() => pos.decrement(i)}
                        className="flex h-6 w-6 items-center justify-center rounded-l-md text-foreground-secondary hover:bg-surface-2"
                      >
                        <Minus size={11} />
                      </button>
                      <span className="tabular w-7 text-center text-[12px] font-semibold">{line.qty}</span>
                      <button
                        onClick={() => pos.increment(i)}
                        className="flex h-6 w-6 items-center justify-center rounded-r-md text-foreground-secondary hover:bg-surface-2"
                      >
                        <Plus size={11} />
                      </button>
                    </div>
                    <div className="flex flex-1 items-center gap-1 rounded-md border border-border px-2 focus-within:border-primary/60">
                      <StickyNote size={10} className="shrink-0 text-foreground-muted" />
                      <input
                        value={line.note ?? ''}
                        onChange={(e) => pos.setNote(i, e.target.value)}
                        placeholder="e.g. no onions"
                        className="h-6 w-full bg-transparent text-[11px] outline-none placeholder:text-foreground-muted"
                      />
                    </div>
                    <span className="tabular text-[11px] text-foreground-muted">{formatPKR(line.unitPriceCents)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Summary */}
        <div className="space-y-1.5 border-t border-border px-4 py-3 text-[12.5px]">
          <SummaryRow label="Subtotal" value={formatPKR(totals.subtotalCents)} />
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-foreground-secondary">
              Discount %
              <select
                value={pos.discountPercent}
                onChange={(e) => pos.setDiscount(Number(e.target.value))}
                className="h-6 rounded-md border border-border bg-surface-2 px-1.5 text-[11px]"
              >
                {settings?.quickDiscounts?.map((d) => (
                  <option key={d} value={d}>
                    {d}%
                  </option>
                ))}
                <option value={0}>None</option>
              </select>
            </span>
            <span className="tabular text-success">-{formatPKR(totals.discountCents)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-foreground-secondary">
              Service Charge
              <button
                onClick={pos.toggleServiceCharge}
                className={cn(
                  'h-4.5 w-8 rounded-full border px-0.5 text-[10px] font-semibold transition-colors',
                  pos.serviceChargeEnabled
                    ? 'border-success bg-success text-white'
                    : 'border-border bg-surface-2 text-foreground-muted'
                )}
              >
                {pos.serviceChargeEnabled ? `${settings?.serviceChargePercent ?? 10}%` : 'OFF'}
              </button>
            </span>
            <span className="tabular">{formatPKR(totals.serviceChargeCents)}</span>
          </div>
          <SummaryRow label={`GST ${settings?.defaultVatPercent ?? 18}%`} value={formatPKR(totals.taxCents)} />
          <div className="flex items-center justify-between border-t border-border pt-2">
            <span className="text-[13px] font-bold">Total</span>
            <span className="tabular text-[18px] font-extrabold tracking-tight">{formatPKR(total)}</span>
          </div>
        </div>

        {/* Generate Bill footer */}
        <div className="border-t border-border p-3">
          {payMethod === 'split' && (
            <div className="mb-2 space-y-1.5 rounded-lg border border-border bg-surface-2 p-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-foreground-secondary">Cash portion (Rs.)</label>
                  <Input
                    type="number"
                    value={splitCash}
                    onChange={(e) => {
                      setSplitCash(e.target.value)
                      setSplitCard(String(Math.max(0, total / 100 - Number(e.target.value))))
                    }}
                    className="tabular mt-0.5 h-8"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-foreground-secondary">Card portion (Rs.)</label>
                  <Input
                    type="number"
                    value={splitCard}
                    onChange={(e) => setSplitCard(e.target.value)}
                    className="tabular mt-0.5 h-8"
                  />
                </div>
              </div>
              {splitMismatch && (
                <div className="text-center text-[11px] font-medium text-warning">
                  Portions must equal {formatPKR(total)}
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <select
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
              className="h-12 shrink-0 rounded-lg border border-border bg-surface-2 px-2.5 text-[12.5px] font-medium outline-none focus:border-primary/60"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <Button
              variant="success"
              size="xl"
              className="flex-1"
              disabled={busy || pos.lines.length === 0 || splitMismatch}
              onClick={() => generateBill()}
            >
              <span className="flex items-center gap-2">
                <Printer size={15} /> {busy ? 'Printing…' : 'Generate Bill'}
              </span>
            </Button>
          </div>
          <button
            onClick={() => pos.clearCart()}
            className="mt-2 w-full rounded-lg py-1 text-[11px] text-foreground-muted hover:text-danger"
          >
            Clear bill
          </button>
        </div>
      </section>

    </div>
  )
}

function CategoryPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-all',
        active
          ? 'border-primary bg-primary text-primary-fg shadow-sm'
          : 'border-border bg-surface text-foreground-secondary hover:border-border-strong hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-foreground-secondary">{label}</span>
      <span className="tabular">{value}</span>
    </div>
  )
}
