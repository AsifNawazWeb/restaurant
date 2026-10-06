import { desc, eq, sql } from 'drizzle-orm'
import type { DB } from '../db/connection'
import { getSqlite } from '../db/connection'
import * as schema from '../db/schema'
import { computeTotals, roundCashTender } from '../../shared/totals'
import { getSettings } from './settings'
import { buildReceipt } from './receipt'
import { withTransaction } from './catalog'
import type { CheckoutPayload, CheckoutResult, OrderSummary, TotalsSummary } from '@shared/types'

/** ---------- Helpers ---------- */

async function nextOrderNumber(db: DB): Promise<string> {
  const [{ maxId }] = await db
    .select({ maxId: sql<number>`COALESCE(MAX(id), 0)` })
    .from(schema.orders)
  return `ORD-${1001 + Number(maxId)}`
}

/** ---------- Checkout (single transaction: order + BOM deduction) ---------- */

export async function checkout(
  db: DB,
  payload: CheckoutPayload,
  cashierId: number | null,
  cashierName: string
): Promise<CheckoutResult> {
  if (payload.lines.length === 0) throw new Error('Cart is empty')

  const settings = await getSettings(db)

  // Validations
  for (const line of payload.lines) {
    if (line.qty <= 0) throw new Error(`Invalid quantity for ${line.name}`)
  }
  const paidCents = payload.payments.reduce((s, p) => s + p.amountCents, 0)

  // Pre-fetch prices (re-validate against DB, never trust renderer)
  const variantIds = payload.lines.map((l) => l.variantId).filter((v): v is number => v != null)
  const dbVariants = variantIds.length
    ? await db.select().from(schema.menuItemVariants).where(sql`${schema.menuItemVariants.id} IN (${sql.join(variantIds.map((id) => sql`${id}`), sql`, `)})`)
    : []
  const variantPrice = new Map(dbVariants.map((v) => [v.id, v.priceCents]))

  for (const line of payload.lines) {
    if (line.variantId != null) {
      const dbPrice = variantPrice.get(line.variantId)
      if (dbPrice == null) throw new Error(`Variant missing for ${line.name}`)
      if (dbPrice !== line.unitPriceCents) throw new Error(`Price changed for ${line.name} — refresh the bill`)
    }
  }

  // Receipt payment normalization: cash settles to whole rupees (paisa not used in practice)
  const totals = computeTotals({
    lines: payload.lines,
    discountPercent: payload.discountPercent,
    vatPercent: settings.defaultVatPercent,
    serviceChargePercent: settings.serviceChargePercent,
    serviceChargeEnabled: payload.serviceChargeEnabled
  })

  const normalizedPayments = payload.payments.map((p) => {
    return p.method === 'cash' ? { ...p, amountCents: Math.round(p.amountCents / 100) * 100 } : p
  })
  const normalizedPaid = normalizedPayments.reduce((s, p) => s + p.amountCents, 0)
  if (normalizedPaid + 99 < totals.totalCents) {
    throw new Error('Insufficient payment for total')
  }

  const result = await withTransaction(db, async (): Promise<CheckoutResult> => {
    // Attach to open shift if any
    const [openShift] = await db
      .select()
      .from(schema.shifts)
      .where(eq(schema.shifts.status, 'open'))
      .orderBy(desc(schema.shifts.id))
      .limit(1)

    const orderNumber = await nextOrderNumber(db)
    const createdAt = new Date().toISOString()

    const [order] = await db
      .insert(schema.orders)
      .values({
        orderNumber,
        shiftId: openShift?.id ?? null,
        orderType: payload.orderType,
        status: 'paid',
        subtotalCents: totals.subtotalCents,
        discountPercent: payload.discountPercent,
        discountCents: totals.discountCents,
        serviceChargeCents: totals.serviceChargeCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        costCents: 0,
        customerName: payload.customerName ?? null,
        customerPhone: payload.customerPhone ?? null,
        cashierId,
        cashierName,
        createdAt
      })
      .returning()

    for (const line of payload.lines) {
      await db.insert(schema.orderItems).values({
        orderId: order.id,
        menuItemId: line.menuItemId,
        variantId: line.variantId,
        nameSnapshot: line.name,
        variantSnapshot: line.variantName,
        unitPriceCents: line.unitPriceCents,
        qty: line.qty,
        lineSubtotalCents: Math.round(line.unitPriceCents * line.qty),
        note: line.note,
        taxEnabled: line.taxEnabled
      })
    }

    for (const p of normalizedPayments) {
      await db.insert(schema.orderPayments).values({
        orderId: order.id,
        method: p.method,
        amountCents: p.amountCents,
        reference: p.reference ?? null
      })
    }

    /** BOM deduction: per menu item line, consume recipe materials */
    const lowStockAlerts: CheckoutResult['lowStockAlerts'] = []
    let totalCost = 0

    const consumedPerMaterial = new Map<number, number>()
    for (const line of payload.lines) {
      const recipeRows = await db
        .select({
          materialId: schema.recipes.materialId,
          qty: schema.recipes.consumptionQty,
          avgUnitCostCents: schema.rawMaterials.avgUnitCostCents,
          baseUnit: schema.rawMaterials.baseUnit,
          materialName: schema.rawMaterials.name,
          safetyThreshold: schema.rawMaterials.safetyThreshold
        })
        .from(schema.recipes)
        .innerJoin(schema.rawMaterials, eq(schema.recipes.materialId, schema.rawMaterials.id))
        .where(eq(schema.recipes.menuItemId, line.menuItemId))

      for (const r of recipeRows) {
        const used = r.qty * line.qty
        totalCost += Math.round(used * r.avgUnitCostCents)
        consumedPerMaterial.set(r.materialId, (consumedPerMaterial.get(r.materialId) ?? 0) + used)
      }
    }

    // Apply deductions and evaluate low stock post-deduction
    for (const [materialId, used] of consumedPerMaterial) {
      const [mat] = await db.select().from(schema.rawMaterials).where(eq(schema.rawMaterials.id, materialId))
      if (!mat) continue
      const newQty = mat.stockQty - used
      await db.update(schema.rawMaterials).set({ stockQty: newQty }).where(eq(schema.rawMaterials.id, materialId))
      await db.insert(schema.stockMovements).values({
        materialId,
        deltaQty: -used,
        reason: 'sale',
        refType: 'order',
        refId: order.id,
        createdAt
      })
      if (mat.safetyThreshold > 0 && newQty <= mat.safetyThreshold) {
        lowStockAlerts.push({
          materialId,
          materialName: mat.name,
          stockQty: Math.round(newQty * 100) / 100,
          unit: mat.baseUnit,
          threshold: mat.safetyThreshold
        })
      }
    }

    await db.update(schema.orders).set({ costCents: totalCost }).where(eq(schema.orders.id, order.id))

    const receiptText = buildReceipt(
      {
        orderNumber,
        createdAt,
        orderType: payload.orderType,
        cashierName,
        customerName: payload.customerName,
        lines: payload.lines.map((l) => ({
          nameSnapshot: l.name,
          variantSnapshot: l.variantName,
          qty: l.qty,
          unitPriceCents: l.unitPriceCents,
          lineSubtotalCents: Math.round(l.unitPriceCents * l.qty),
          note: l.note
        })),
        subtotalCents: totals.subtotalCents,
        discountPercent: payload.discountPercent,
        discountCents: totals.discountCents,
        serviceChargeCents: totals.serviceChargeCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        payments: normalizedPayments.map((p) => ({ method: p.method, amountCents: p.amountCents, reference: p.reference }))
      },
      settings,
      settings.paperWidthMm
    )

    return {
      id: order.id,
      orderNumber,
      receiptText,
      totals: { ...totals, taxableBaseCents: totals.taxableDiscountCents >= 0 ? totals.subtotalCents - totals.discountCents + totals.serviceChargeCents : totals.subtotalCents, paidCents: normalizedPaid, changeCents: Math.max(0, normalizedPaid - totals.totalCents) },
      lowStockAlerts
    }
  })

  return result
}

/** ---------- Order listing ---------- */

export async function listOrders(db: DB, opts?: { from?: string; to?: string; limit?: number }): Promise<OrderSummary[]> {
  const conds = []
  if (opts?.from) conds.push(sql`${schema.orders.createdAt} >= ${opts.from}`)
  if (opts?.to) conds.push(sql`${schema.orders.createdAt} <= ${opts.to}`)
  const q = db
    .select({
      id: schema.orders.id,
      orderNumber: schema.orders.orderNumber,
      orderType: schema.orders.orderType,
      status: schema.orders.status,
      subtotalCents: schema.orders.subtotalCents,
      discountCents: schema.orders.discountCents,
      serviceChargeCents: schema.orders.serviceChargeCents,
      taxCents: schema.orders.taxCents,
      totalCents: schema.orders.totalCents,
      createdAt: schema.orders.createdAt,
      cashierName: schema.orders.cashierName,
      itemsCount: sql<number>`(SELECT COALESCE(SUM(qty), 0) FROM order_items WHERE order_id = ${schema.orders.id})`
    })
    .from(schema.orders)
  const rows = conds.length
    ? await q.where(sql.join(conds, sql` AND `)).orderBy(desc(schema.orders.id)).limit(opts?.limit ?? 100)
    : await q.orderBy(desc(schema.orders.id)).limit(opts?.limit ?? 100)
  return rows as OrderSummary[]
}

export async function getOrderPayments(db: DB, orderId: number) {
  return db.select().from(schema.orderPayments).where(eq(schema.orderPayments.orderId, orderId))
}
