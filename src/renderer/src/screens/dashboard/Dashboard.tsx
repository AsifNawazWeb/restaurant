import { useEffect, useState } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts'
import { TrendingUp, TrendingDown, Minus, Receipt, Flame, AlertTriangle, Wallet, Zap, ArrowRight, PackagePlus } from 'lucide-react'
import { useUi } from '@/stores/ui'
import { api, unwrap } from '@/lib/api'
import { formatPKR } from '@shared/money'
import type { DashboardKpis, HourlySalesPoint, RawMaterial, TopSellerRow } from '@shared/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty'
import { cn } from '@/lib/utils'

export function DashboardScreen() {
  const { setScreen, dbOk } = useUi()
  const [kpis, setKpis] = useState<DashboardKpis | null>(null)
  const [hourly, setHourly] = useState<HourlySalesPoint[]>([])
  const [lowStock, setLowStock] = useState<RawMaterial[]>([])
  const [topSellers, setTopSellers] = useState<TopSellerRow[]>([])

  useEffect(() => {
    ;(async () => {
      try {
        const [k, h, l, t] = await Promise.all([
          unwrap(api.reports.dashboard()),
          unwrap(api.reports.hourly(new Date().toISOString())),
          unwrap(api.reports.lowStock()),
          unwrap(api.reports.topSellers(7))
        ])
        setKpis(k)
        setHourly(h)
        setLowStock(l)
        setTopSellers(t)
      } catch (err) {
        console.error(err)
      }
    })()
  }, [dbOk])

  const chartData = hourly.map((p) => ({
    hour: `${String(p.hour).padStart(2, '0')}`,
    revenue: p.revenueCents / 100,
    orders: p.ordersCount
  }))
  const peak = chartData.reduce((m, p) => (p.revenue > m.revenue ? p : m), chartData[0])

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[17px] font-bold tracking-tight">Operations Dashboard</h1>
          <p className="text-[12px] text-foreground-muted">
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setScreen('pos')}>
            <Zap size={13} /> Start New Bill
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setScreen('inventory')}>
            <PackagePlus size={13} /> Log Stock Purchase
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setScreen('reports')}>
            Print Shift Summary
          </Button>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCard
          label="Today's Revenue"
          value={kpis ? formatPKR(kpis.todayRevenueCents) : '…'}
          change={kpis?.revenueChangePct ?? null}
          spark={kpis?.revenueSpark ?? []}
          icon={<Wallet size={14} />}
        />
        <KpiCard
          label="Total Orders"
          value={kpis ? `${kpis.todayOrders} orders` : '…'}
          change={kpis?.ordersChangePct ?? null}
          spark={kpis?.ordersSpark ?? []}
          icon={<Receipt size={14} />}
        />
        <KpiCard
          label="Avg Order Value"
          value={kpis ? formatPKR(kpis.avgOrderValueCents) : '…'}
          change={kpis?.aovChangePct ?? null}
          icon={<Flame size={14} />}
        />
        <KpiCard
          label="Est. Net Profit"
          value={kpis ? formatPKR(kpis.netProfitCents) : '…'}
          change={kpis?.profitChangePct ?? null}
          icon={<TrendingUp size={14} />}
          accent="success"
        />
      </div>

      {/* Middle split */}
      <div className="grid grid-cols-[3fr_2fr] gap-3">
        <Card>
          <CardHeader>
            <CardTitle>Hourly Sales — Peak Hours</CardTitle>
            <Badge variant="neutral">8 AM → 11 PM</Badge>
          </CardHeader>
          <CardContent>
            <div className="h-[210px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} stroke="var(--fg-muted)" tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} stroke="var(--fg-muted)" tickLine={false} axisLine={false} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 10,
                      fontSize: 12
                    }}
                    formatter={(value) => [`Rs. ${Number(value).toLocaleString()}`, 'Revenue'] as [string, string]}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fill="url(#rev)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {peak && peak.revenue > 0 && (
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-foreground-muted">
                <Flame size={11} className="text-warning" /> Peak hour: {peak.hour}:00 — {formatPKR(peak.revenue * 100)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">
              <AlertTriangle size={13} className="text-warning" /> Low Stock Radar
            </CardTitle>
            <Badge variant={lowStock.length ? 'warning' : 'success'}>{lowStock.length} alerts</Badge>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <EmptyState title="All ingredients healthy" hint="No raw materials below safety levels" className="py-8" />
            ) : (
              <ul className="max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
                {lowStock.map((m) => (
                  <li key={m.id} className="flex items-center justify-between rounded-lg border border-border px-2.5 py-2">
                    <div>
                      <div className="text-[12px] font-medium">{m.name}</div>
                      <div className="text-[11px] text-foreground-muted">
                        Safety level: {m.safetyThreshold} {m.baseUnit}
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={cn(
                          'tabular text-[12px] font-bold',
                          m.status === 'critical' ? 'text-danger' : 'text-warning'
                        )}
                      >
                        {m.stockQty} {m.baseUnit}
                      </div>
                      <Badge variant={m.status === 'critical' ? 'danger' : 'warning'}>Reorder Alert</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top sellers */}
      <Card>
        <CardHeader>
          <CardTitle>Top Selling Menu Items</CardTitle>
          <Badge variant="neutral">last 7 days</Badge>
        </CardHeader>
        <CardContent>
          {topSellers.length === 0 ? (
            <EmptyState title="No sales yet" hint="Top sellers appear after the first bills" className="py-6" />
          ) : (
            <ol className="space-y-1">
              {topSellers.map((t, i) => (
                <li key={`${t.menuItemId}-${t.variantName}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                  <span
                    className={cn(
                      'tabular flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold',
                      i === 0 ? 'bg-warning-soft text-warning' : 'bg-surface-2 text-foreground-muted'
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-[11px] font-bold text-primary">
                    {t.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium">{t.name}</div>
                    {t.variantName && <div className="text-[11px] text-foreground-muted">{t.variantName}</div>}
                  </div>
                  <span className="tabular text-[12px] text-foreground-secondary">{t.qtySold} sold</span>
                  <span className="tabular w-[92px] text-right text-[12.5px] font-semibold">{formatPKR(t.revenueCents)}</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <button
        onClick={() => setScreen('reports')}
        className="mx-auto flex items-center gap-1 text-[12px] text-foreground-muted hover:text-primary"
      >
        Open full reports <ArrowRight size={12} />
      </button>
    </div>
  )
}

function KpiCard({
  label,
  value,
  change,
  spark,
  icon,
  accent
}: {
  label: string
  value: string
  change: number | null
  spark?: number[]
  icon: React.ReactNode
  accent?: 'success'
}) {
  const TrendIcon = change == null ? Minus : change >= 0 ? TrendingUp : TrendingDown
  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-3.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-foreground-secondary">
            {icon}
            {label}
          </span>
          {change != null && (
            <span
              className={cn(
                'flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold',
                change >= 0 ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
              )}
            >
              <TrendIcon size={10} />
              {change >= 0 ? '+' : ''}
              {change}%
            </span>
          )}
        </div>
        <div className="tabular mt-1.5 text-[22px] font-extrabold tracking-tight" style={accent === 'success' ? { color: 'var(--success)' } : undefined}>
          {value}
        </div>
        {spark && spark.length > 1 && (
          <div className="mt-1 flex h-6 items-end gap-[2px]">
            {spark.map((v, i) => {
              const max = Math.max(...spark, 1)
              return (
                <div
                  key={i}
                  className="w-full rounded-sm bg-primary/25"
                  style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
                />
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
