import { sql } from 'drizzle-orm'
import type { DB } from '../db/connection'
import type {
  CategoryRevenueRow,
  ConsumptionVarianceRow,
  DailySalesRow,
  DashboardKpis,
  HourlySalesPoint,
  ItemProfitabilityRow,
  RawMaterial,
  TopSellerRow
} from '@shared/types'

const PAID = sql`status = 'paid'`

function dayBounds(date: Date): { from: string; to: string } {
  const from = new Date(date)
  from.setHours(0, 0, 0, 0)
  const to = new Date(date)
  to.setHours(23, 59, 59, 999)
  return { from: from.toISOString(), to: to.toISOString() }
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}

/** ---------- Dashboard ---------- */

export async function getDashboardKpis(db: DB): Promise<DashboardKpis> {
  const now = new Date()
  const today = dayBounds(now)
  const yesterday = dayBounds(new Date(now.getTime() - 86_400_000))

  const dayAgg = async (from: string, to: string) => {
    const [row] = (await db.all(sql`
      SELECT
        COUNT(*) AS orders,
        COALESCE(SUM(total_cents), 0) AS revenue,
        COALESCE(SUM(total_cents - cost_cents - tax_cents), 0) AS profit
      FROM orders
      WHERE status = 'paid' AND created_at >= ${from} AND created_at <= ${to}
    `)) as Array<{ orders: number; revenue: number; profit: number }>
    return {
      orders: Number(row?.orders ?? 0),
      revenue: Number(row?.revenue ?? 0),
      profit: Number(row?.profit ?? 0)
    }
  }

  const t = await dayAgg(today.from, today.to)
  const y = await dayAgg(yesterday.from, yesterday.to)

  // 7-day sparks
  const sparkRows = (await db.all(sql`
    SELECT substr(created_at, 1, 10) AS day,
           COALESCE(SUM(total_cents), 0) AS revenue,
           COUNT(*) AS orders
    FROM orders
    WHERE status = 'paid' AND created_at >= ${new Date(now.getTime() - 6 * 86_400_000).toISOString()}
    GROUP BY day ORDER BY day
  `)) as Array<{ day: string; revenue: number; orders: number }>

  return {
    todayRevenueCents: t.revenue,
    todayOrders: t.orders,
    avgOrderValueCents: t.orders > 0 ? Math.round(t.revenue / t.orders) : 0,
    netProfitCents: t.profit,
    revenueChangePct: pctChange(t.revenue, y.revenue),
    ordersChangePct: pctChange(t.orders, y.orders),
    aovChangePct: pctChange(
      t.orders > 0 ? t.revenue / t.orders : 0,
      y.orders > 0 ? y.revenue / y.orders : 0
    ),
    profitChangePct: pctChange(t.profit, y.profit),
    revenueSpark: sparkRows.map((r) => Number(r.revenue)),
    ordersSpark: sparkRows.map((r) => Number(r.orders))
  }
}

export async function getHourlySales(db: DB, date: Date): Promise<HourlySalesPoint[]> {
  const { from, to } = dayBounds(date)
  const rows = (await db.all(sql`
    SELECT CAST(strftime('%H', created_at) AS INTEGER) AS hour,
           COALESCE(SUM(total_cents), 0) AS revenue,
           COUNT(*) AS orders
    FROM orders
    WHERE status = 'paid' AND created_at >= ${from} AND created_at <= ${to}
    GROUP BY hour
  `)) as Array<{ hour: number; revenue: number; orders: number }>
  const byHour = new Map(rows.map((r) => [Number(r.hour), r]))
  const points: HourlySalesPoint[] = []
  for (let h = 8; h <= 23; h++) {
    const r = byHour.get(h)
    points.push({ hour: h, revenueCents: Number(r?.revenue ?? 0), ordersCount: Number(r?.orders ?? 0) })
  }
  return points
}

export async function getLowStock(db: DB, includeHealthy = false): Promise<RawMaterial[]> {
  const { listMaterials } = await import('./inventory')
  const materials = await listMaterials(db)
  return includeHealthy ? materials : materials.filter((m) => m.status !== 'healthy')
}

export async function getTopSellers(db: DB, days = 7, limit = 8): Promise<TopSellerRow[]> {
  const from = new Date(Date.now() - days * 86_400_000).toISOString()
  const rows = (await db.all(sql`
    SELECT oi.menu_item_id AS menuItemId,
           oi.name_snapshot AS name,
           oi.variant_snapshot AS variantName,
           SUM(oi.qty) AS qtySold,
           SUM(oi.line_subtotal_cents) AS revenueCents
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE o.status = 'paid' AND o.created_at >= ${from}
    GROUP BY oi.menu_item_id, oi.name_snapshot, oi.variant_snapshot
    ORDER BY qtySold DESC
    LIMIT ${limit}
  `)) as Array<{ menuItemId: number; name: string; variantName: string | null; qtySold: number; revenueCents: number }>
  return rows.map((r) => ({
    menuItemId: Number(r.menuItemId),
    name: r.name,
    variantName: r.variantName,
    qtySold: Number(r.qtySold),
    revenueCents: Number(r.revenueCents)
  }))
}

/** ---------- Reports ---------- */

export async function getDailySales(db: DB, from: string, to: string): Promise<DailySalesRow[]> {
  const rows = (await db.all(sql`
    SELECT substr(created_at, 1, 10) AS day,
           COUNT(*) AS ordersCount,
           COALESCE(SUM(total_cents), 0) AS revenueCents
    FROM orders
    WHERE ${PAID} AND created_at >= ${from} AND created_at <= ${to}
    GROUP BY day ORDER BY day
  `)) as Array<{ day: string; ordersCount: number; revenueCents: number }>
  return rows.map((r) => ({ day: r.day, ordersCount: Number(r.ordersCount), revenueCents: Number(r.revenueCents) }))
}

export async function getCategorySales(db: DB, from: string, to: string): Promise<CategoryRevenueRow[]> {
  const rows = (await db.all(sql`
    SELECT c.id AS categoryId, c.name AS categoryName,
           COUNT(DISTINCT o.id) AS ordersCount,
           COALESCE(SUM(oi.line_subtotal_cents), 0) AS revenueCents
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN menu_items mi ON mi.id = oi.menu_item_id
    JOIN menu_categories c ON c.id = mi.category_id
    WHERE o.status = 'paid' AND o.created_at >= ${from} AND o.created_at <= ${to}
    GROUP BY c.id, c.name
    ORDER BY revenueCents DESC
  `)) as Array<{ categoryId: number; categoryName: string; ordersCount: number; revenueCents: number }>
  return rows.map((r) => ({
    categoryId: Number(r.categoryId),
    categoryName: r.categoryName,
    ordersCount: Number(r.ordersCount),
    revenueCents: Number(r.revenueCents)
  }))
}

export async function getItemProfitability(db: DB, from: string, to: string, limit = 50): Promise<ItemProfitabilityRow[]> {
  const rows = (await db.all(sql`
    SELECT mi.id AS menuItemId, mi.name,
           SUM(oi.qty) AS qtySold,
           SUM(oi.line_subtotal_cents) AS revenueCents,
           ROUND(SUM(oi.qty * COALESCE(r.cost, 0))) AS costCents
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN menu_items mi ON mi.id = oi.menu_item_id
    LEFT JOIN (
      SELECT r.menu_item_id, SUM(r.consumption_qty * m.avg_unit_cost_cents) AS cost
      FROM recipes r JOIN raw_materials m ON m.id = r.material_id
      GROUP BY r.menu_item_id
    ) r ON r.menu_item_id = mi.id
    WHERE o.status = 'paid' AND o.created_at >= ${from} AND o.created_at <= ${to}
    GROUP BY mi.id, mi.name
    ORDER BY revenueCents DESC
    LIMIT ${limit}
  `)) as Array<{ menuItemId: number; name: string; qtySold: number; revenueCents: number; costCents: number }>
  return rows.map((r) => ({
    menuItemId: Number(r.menuItemId),
    name: r.name,
    qtySold: Number(r.qtySold),
    revenueCents: Number(r.revenueCents),
    costCents: Number(r.costCents ?? 0),
    marginPct:
      Number(r.revenueCents) > 0
        ? Math.round(((Number(r.revenueCents) - Number(r.costCents ?? 0)) / Number(r.revenueCents)) * 1000) / 10
        : 0
  }))
}

/**
 * Consumption variance: theoretical BOM usage from sales vs actual stock
 * consumption (sale movements + wastage) over the period.
 */
export async function getConsumptionVariance(db: DB, from: string, to: string): Promise<ConsumptionVarianceRow[]> {
  const rows = (await db.all(sql`
    SELECT m.id AS materialId, m.name AS materialName, m.base_unit AS unit,
           m.avg_unit_cost_cents AS unitCost,
           COALESCE(theo.qty, 0) AS expectedQty,
           COALESCE(act.qty, 0) AS actualQty
    FROM raw_materials m
    LEFT JOIN (
      SELECT r.material_id, SUM(oi.qty * r.consumption_qty) AS qty
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN recipes r ON r.menu_item_id = oi.menu_item_id
      WHERE o.status = 'paid' AND o.created_at >= ${from} AND o.created_at <= ${to}
      GROUP BY r.material_id
    ) theo ON theo.material_id = m.id
    LEFT JOIN (
      SELECT material_id, SUM(-delta_qty) AS qty
      FROM stock_movements
      WHERE reason = 'sale' AND created_at >= ${from} AND created_at <= ${to}
      GROUP BY material_id
    ) act ON act.material_id = m.id
    WHERE COALESCE(theo.qty, 0) > 0 OR COALESCE(act.qty, 0) > 0
    ORDER BY ABS(COALESCE(act.qty, 0) - COALESCE(theo.qty, 0)) * m.avg_unit_cost_cents DESC
    LIMIT 30
  `)) as Array<{ materialId: number; materialName: string; unit: string; unitCost: number; expectedQty: number; actualQty: number }>

  return rows.map((r) => {
    const expected = Math.round(Number(r.expectedQty) * 100) / 100
    const actual = Math.round(Number(r.actualQty) * 100) / 100
    const variance = Math.round((actual - expected) * 100) / 100
    return {
      materialId: Number(r.materialId),
      materialName: r.materialName,
      unit: r.unit,
      expectedQty: expected,
      actualQty: actual,
      varianceQty: variance,
      varianceCostCents: Math.round(Math.abs(variance) * Number(r.unitCost))
    }
  })
}
