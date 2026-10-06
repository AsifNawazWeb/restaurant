import { useEffect, useState } from 'react'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend
} from 'recharts'
import { CalendarDays, Lock, Printer, Scale, TrendingUp, Utensils } from 'lucide-react'
import { toast } from 'sonner'
import { useUi } from '@/stores/ui'
import { api, unwrap } from '@/lib/api'
import { formatPKR } from '@shared/money'
import type {
  CategoryRevenueRow,
  ConsumptionVarianceRow,
  DailySalesRow,
  ItemProfitabilityRow,
  OpenShift,
  XReport
} from '@shared/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs } from '@/components/ui/tabs'
import { Dialog, DialogHeader } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty'
import { cn } from '@/lib/utils'

const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#0ea5e9', '#a855f7', '#84cc16']

const REPORT_TABS = [
  { id: 'daily', label: 'Daily Sales' },
  { id: 'category', label: 'Category Mix' },
  { id: 'profitability', label: 'Item Profitability' },
  { id: 'variance', label: 'Consumption Variance' }
]

function defaultRange(): { from: string; to: string } {
  const to = new Date()
  const from = new Date(Date.now() - 6 * 86_400_000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { from: fmt(from), to: fmt(to) }
}

export function ReportsScreen() {
  const { user } = useUi()
  const [tab, setTab] = useState('daily')
  const [range, setRange] = useState(defaultRange)
  const [shift, setShift] = useState<OpenShift | null>(null)
  const [xReport, setXReport] = useState<XReport | null>(null)
  const [closeDialog, setCloseDialog] = useState(false)
  const [physicalCash, setPhysicalCash] = useState('')

  async function refreshShift() {
    const [s, x] = await Promise.all([unwrap(api.shifts.current()), unwrap(api.shifts.xReport())])
    setShift(s)
    setXReport(x as XReport | null)
  }
  useEffect(() => {
    refreshShift().catch(toast.error)
  }, [])

  const from = `${range.from}T00:00:00.000Z`
  const to = `${range.to}T23:59:59.999Z`

  async function closeShift() {
    try {
      const result = await unwrap(api.shifts.close({ physicalCashCents: Math.round(Number(physicalCash) * 100) }))
      toast.success(`Shift #${result.id} closed — variance ${formatPKR(result.varianceCents)}`)
      const p = await unwrap(api.printer.zReport({ zText: result.zReportText }))
      if (!p.ok) toast.warning(p.message)
      setCloseDialog(false)
      setPhysicalCash('')
      refreshShift()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[17px] font-bold tracking-tight">Reports & Shift Close</h1>
          <p className="text-[12px] text-foreground-muted">Financial analytics and end-of-day reconciliation</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5">
            <CalendarDays size={13} className="text-foreground-muted" />
            <Input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="h-6 w-[130px] border-0 bg-transparent p-0 text-[12px]" />
            <span className="text-foreground-muted">→</span>
            <Input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="h-6 w-[130px] border-0 bg-transparent p-0 text-[12px]" />
          </div>
          {shift ? (
            <Button size="sm" variant="danger" onClick={() => setCloseDialog(true)}>
              <Lock size={13} /> Close Shift (Z-Report)
            </Button>
          ) : (
            <Button
              size="sm"
              variant="success"
              onClick={async () => {
                try {
                  await unwrap(api.shifts.open(0))
                  toast.success('Shift opened')
                  refreshShift()
                } catch (err) {
                  toast.error((err as Error).message)
                }
              }}
            >
              Open Shift
            </Button>
          )}
        </div>
      </div>

      {/* Shift panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <TrendingUp size={13} /> Shift Close (Z-Report) Drawer
          </CardTitle>
          {shift ? (
            <Badge variant="success">Shift #{shift.id} open since {new Date(shift.openedAt).toLocaleString()}</Badge>
          ) : (
            <Badge variant="neutral">No open shift</Badge>
          )}
        </CardHeader>
        <CardContent>
          {xReport ? (
            <div className="grid grid-cols-[repeat(4,minmax(0,1fr))] gap-3">
              <ShiftStat label="Opening Cash" value={formatPKR(xReport.shift.openingCashCents)} />
              <ShiftStat label="Cash Sales" value={formatPKR(xReport.cashSalesCents)} />
              <ShiftStat label="Card Sales" value={formatPKR(xReport.cardSalesCents)} />
              <ShiftStat label="System Calculated Cash" value={formatPKR(xReport.systemCashCents)} strong />
              <ShiftStat label="Orders" value={String(xReport.ordersCount)} />
              <ShiftStat label="Gross Sales" value={formatPKR(xReport.grossSalesCents)} />
              <ShiftStat label="GST Collected" value={formatPKR(xReport.taxCents)} />
              <ShiftStat label="Net Sales" value={formatPKR(xReport.netSalesCents)} strong />
              {xReport.unassignedOrders > 0 && (
                <div className="col-span-4 rounded-lg bg-warning-soft px-3 py-2 text-[12px] text-warning">
                  {xReport.unassignedOrders} order(s) recorded before this shift — they will not appear in this Z-report.
                </div>
              )}
            </div>
          ) : (
            <EmptyState title="No open shift" hint="Open a shift to start reconciliation" />
          )}
        </CardContent>
      </Card>

      {/* Report tabs */}
      <Card>
        <CardHeader>
          <CardTitle>Reports</CardTitle>
          <Tabs tabs={REPORT_TABS} active={tab} onChange={setTab} />
        </CardHeader>
        <CardContent>
          {tab === 'daily' && <DailyReport from={from} to={to} />}
          {tab === 'category' && <CategoryReport from={from} to={to} />}
          {tab === 'profitability' && <ProfitabilityReport from={from} to={to} />}
          {tab === 'variance' && <VarianceReport from={from} to={to} />}
        </CardContent>
      </Card>

      {/* Close shift dialog */}
      <Dialog open={closeDialog} onClose={() => setCloseDialog(false)} width="max-w-md">
        <DialogHeader title="Close Shift & Print Z-Report" description="Count the physical cash in the drawer, then enter it below." onClose={() => setCloseDialog(false)} />
        <div className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-2 text-[12.5px]">
            <div className="rounded-lg bg-surface-2 px-3 py-2">
              <div className="text-[11px] text-foreground-muted">Opening balance</div>
              <div className="tabular font-semibold">{shift ? formatPKR(shift.openingCashCents) : '—'}</div>
            </div>
            <div className="rounded-lg bg-surface-2 px-3 py-2">
              <div className="text-[11px] text-foreground-muted">System calculated cash</div>
              <div className="tabular font-semibold">{xReport ? formatPKR(xReport.systemCashCents) : '—'}</div>
            </div>
          </div>
          <div>
            <span className="mb-1 block text-[11px] font-medium text-foreground-secondary">Physical cash count (Rs.)</span>
            <Input type="number" autoFocus value={physicalCash} onChange={(e) => setPhysicalCash(e.target.value)} className="tabular text-[16px] font-semibold" placeholder="0.00" />
          </div>
          {xReport && physicalCash !== '' && (
            <div
              className={cn(
                'flex items-center justify-between rounded-lg px-3 py-2.5 text-[13px] font-semibold',
                Number(physicalCash) * 100 - xReport.systemCashCents === 0
                  ? 'bg-success-soft text-success'
                  : Number(physicalCash) * 100 - xReport.systemCashCents > 0
                    ? 'bg-warning-soft text-warning'
                    : 'bg-danger-soft text-danger'
              )}
            >
              <span className="flex items-center gap-1.5">
                <Scale size={13} /> Variance
              </span>
              <span className="tabular">{formatPKR(Number(physicalCash) * 100 - xReport.systemCashCents)}</span>
            </div>
          )}
          <Button size="xl" variant="danger" className="w-full" disabled={physicalCash === ''} onClick={closeShift}>
            <Printer size={15} /> Close Shift & Print Z-Report
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

function ShiftStat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('rounded-lg border border-border px-3 py-2', strong && 'bg-primary-soft border-primary/20')}>
      <div className="text-[11px] text-foreground-muted">{label}</div>
      <div className={cn('tabular mt-0.5 font-bold', strong ? 'text-[15px] text-primary' : 'text-[13px]')}>{value}</div>
    </div>
  )
}

/** ---------- Report bodies ---------- */

function DailyReport({ from, to }: { from: string; to: string }) {
  const [rows, setRows] = useState<DailySalesRow[]>([])
  useEffect(() => {
    unwrap(api.reports.dailySales({ from, to })).then(setRows).catch(toast.error)
  }, [from, to])

  if (rows.length === 0) return <EmptyState title="No sales in range" />
  const chart = rows.map((r) => ({ day: r.day.slice(5), revenue: r.revenueCents / 100, orders: r.ordersCount }))

  return (
    <div className="grid grid-cols-[3fr_2fr] gap-4">
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chart} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} stroke="var(--fg-muted)" tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10 }} stroke="var(--fg-muted)" tickLine={false} axisLine={false} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
            <Tooltip
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
              formatter={(value) => [`Rs. ${Number(value).toLocaleString()}`, 'Revenue'] as [string, string]}
            />
            <Bar dataKey="revenue" fill="#6366f1" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="text-[12.5px]">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase text-foreground-muted">
            <th className="pb-2 font-medium">Day</th>
            <th className="pb-2 text-right font-medium">Orders</th>
            <th className="pb-2 text-right font-medium">Revenue</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.day}>
              <td className="py-1.5">{r.day}</td>
              <td className="tabular py-1.5 text-right">{r.ordersCount}</td>
              <td className="tabular py-1.5 text-right font-semibold">{formatPKR(r.revenueCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CategoryReport({ from, to }: { from: string; to: string }) {
  const [rows, setRows] = useState<CategoryRevenueRow[]>([])
  useEffect(() => {
    unwrap(api.reports.categorySales({ from, to })).then(setRows).catch(toast.error)
  }, [from, to])

  if (rows.length === 0) return <EmptyState title="No category sales in range" />
  const total = rows.reduce((s, r) => s + r.revenueCents, 0)

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="revenueCents" nameKey="categoryName" innerRadius={55} outerRadius={90} paddingAngle={2}>
              {rows.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="var(--surface)" />
              ))}
            </Pie>
            <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }} formatter={(value) => formatPKR(Number(value))} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={r.categoryId} className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
            <span className="flex-1 text-[12.5px] font-medium">{r.categoryName}</span>
            <span className="tabular text-[11px] text-foreground-muted">{Math.round((r.revenueCents / total) * 100)}%</span>
            <span className="tabular w-[88px] text-right text-[12px] font-semibold">{formatPKR(r.revenueCents)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProfitabilityReport({ from, to }: { from: string; to: string }) {
  const [rows, setRows] = useState<ItemProfitabilityRow[]>([])
  useEffect(() => {
    unwrap(api.reports.itemProfitability({ from, to })).then(setRows).catch(toast.error)
  }, [from, to])

  if (rows.length === 0) return <EmptyState title="No item sales in range" />

  return (
    <table className="w-full text-[12.5px]">
      <thead>
        <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-foreground-muted">
          <th className="py-2 font-medium">Item</th>
          <th className="py-2 text-right font-medium">Qty Sold</th>
          <th className="py-2 text-right font-medium">Revenue</th>
          <th className="py-2 text-right font-medium">BOM Cost</th>
          <th className="py-2 text-right font-medium">Gross Profit</th>
          <th className="py-2 text-right font-medium">Margin</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((r) => (
          <tr key={r.menuItemId} className="hover:bg-surface-2/60">
            <td className="py-2 font-medium">{r.name}</td>
            <td className="tabular py-2 text-right">{r.qtySold}</td>
            <td className="tabular py-2 text-right">{formatPKR(r.revenueCents)}</td>
            <td className="tabular py-2 text-right text-foreground-secondary">{formatPKR(r.costCents)}</td>
            <td className="tabular py-2 text-right font-semibold text-success">{formatPKR(r.revenueCents - r.costCents)}</td>
            <td className="py-2 text-right">
              <Badge variant={r.marginPct >= 50 ? 'success' : r.marginPct >= 30 ? 'warning' : 'danger'}>{r.marginPct}%</Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function VarianceReport({ from, to }: { from: string; to: string }) {
  const [rows, setRows] = useState<ConsumptionVarianceRow[]>([])
  useEffect(() => {
    unwrap(api.reports.consumptionVariance({ from, to })).then(setRows).catch(toast.error)
  }, [from, to])

  if (rows.length === 0) return <EmptyState title="No consumption data in range" />

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[11.5px] text-foreground-muted">
        <Utensils size={12} /> Theoretical BOM usage (what recipes say) vs actual stock consumption (what moved).
        Positive variance = overuse/wastage.
      </p>
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-foreground-muted">
            <th className="py-2 font-medium">Material</th>
            <th className="py-2 text-right font-medium">Expected</th>
            <th className="py-2 text-right font-medium">Actual Used</th>
            <th className="py-2 text-right font-medium">Variance</th>
            <th className="py-2 text-right font-medium">Variance Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => (
            <tr key={r.materialId} className="hover:bg-surface-2/60">
              <td className="py-2 font-medium">{r.materialName} <span className="text-foreground-muted">({r.unit})</span></td>
              <td className="tabular py-2 text-right">{r.expectedQty}</td>
              <td className="tabular py-2 text-right">{r.actualQty}</td>
              <td className={cn('tabular py-2 text-right font-semibold', r.varianceQty > 0 ? 'text-danger' : r.varianceQty < 0 ? 'text-success' : 'text-foreground-muted')}>
                {r.varianceQty > 0 ? '+' : ''}{r.varianceQty} {r.unit}
              </td>
              <td className="tabular py-2 text-right">{r.varianceQty !== 0 ? formatPKR(r.varianceCostCents) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
