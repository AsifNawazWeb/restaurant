import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import type { DB } from '../db/connection'
import * as schema from '../db/schema'
import { getSettings } from './settings'
import { buildZReport } from './receipt'
import type { OpenShift, ShiftCloseInput, ShiftCloseResult, XReport } from '@shared/types'

export async function getCurrentShift(db: DB): Promise<OpenShift | null> {
  const [row] = await db
    .select()
    .from(schema.shifts)
    .where(eq(schema.shifts.status, 'open'))
    .orderBy(desc(schema.shifts.id))
    .limit(1)
  if (!row) return null
  return {
    id: row.id,
    openedAt: row.openedAt,
    openingCashCents: row.openingCashCents,
    cashierName: row.openedBy
  }
}

export async function openShift(db: DB, openingCashCents: number, userName: string): Promise<OpenShift> {
  const existing = await getCurrentShift(db)
  if (existing) throw new Error('A shift is already open — close it first')
  const [row] = await db
    .insert(schema.shifts)
    .values({
      openedAt: new Date().toISOString(),
      openedBy: userName,
      openingCashCents
    })
    .returning()
  return {
    id: row.id,
    openedAt: row.openedAt,
    openingCashCents: row.openingCashCents,
    cashierName: row.openedBy
  }
}

/** X-Report: totals for the open shift so far (non-closing snapshot). */
export async function getXReport(db: DB): Promise<XReport | null> {
  const shift = await getCurrentShift(db)
  if (!shift) return null
  return computeShiftTotals(db, shift, false)
}

async function computeShiftTotals(db: DB, shift: OpenShift, closing: boolean, physicalCashCents = 0): Promise<XReport & { varianceCents?: number }> {
  const [agg] = await db
    .select({
      ordersCount: sql<number>`COUNT(*)`,
      gross: sql<number>`COALESCE(SUM(${schema.orders.subtotalCents}), 0)`,
      discounts: sql<number>`COALESCE(SUM(${schema.orders.discountCents}), 0)`,
      sc: sql<number>`COALESCE(SUM(${schema.orders.serviceChargeCents}), 0)`,
      tax: sql<number>`COALESCE(SUM(${schema.orders.taxCents}), 0)`,
      net: sql<number>`COALESCE(SUM(${schema.orders.totalCents}), 0)`
    })
    .from(schema.orders)
    .where(
      closing
        ? sql`${schema.orders.shiftId} = ${shift.id} AND ${schema.orders.status} = 'paid'`
        : and(eq(schema.orders.shiftId, shift.id), eq(schema.orders.status, 'paid'))
    )

  const [payAgg] = await db
    .select({
      cash: sql<number>`COALESCE(SUM(CASE WHEN ${schema.orderPayments.method} = 'cash' THEN ${schema.orderPayments.amountCents} ELSE 0 END), 0)`,
      card: sql<number>`COALESCE(SUM(CASE WHEN ${schema.orderPayments.method} = 'card' THEN ${schema.orderPayments.amountCents} ELSE 0 END), 0)`
    })
    .from(schema.orderPayments)
    .innerJoin(schema.orders, eq(schema.orderPayments.orderId, schema.orders.id))
    .where(eq(schema.orders.shiftId, shift.id))

  const cashSales = Number(payAgg?.cash ?? 0)
  const cardSales = Number(payAgg?.card ?? 0)

  const [unassigned] = await db
    .select({ cnt: sql<number>`COUNT(*)` })
    .from(schema.orders)
    .where(and(isNull(schema.orders.shiftId), eq(schema.orders.status, 'paid')))

  return {
    shift,
    ordersCount: Number(agg?.ordersCount ?? 0),
    grossSalesCents: Number(agg?.gross ?? 0),
    discountCents: Number(agg?.discounts ?? 0),
    serviceChargeCents: Number(agg?.sc ?? 0),
    taxCents: Number(agg?.tax ?? 0),
    netSalesCents: Number(agg?.net ?? 0),
    cashSalesCents: cashSales,
    cardSalesCents: cardSales,
    systemCashCents: shift.openingCashCents + cashSales,
    unassignedOrders: Number(unassigned?.cnt ?? 0),
    ...(closing ? { varianceCents: physicalCashCents - (shift.openingCashCents + cashSales) } : {})
  }
}

/** Close the open shift: computes variance, stamps the shift row, returns Z text. */
export async function closeShift(
  db: DB,
  input: ShiftCloseInput,
  userName: string
): Promise<ShiftCloseResult & { zReportText: string }> {
  const shift = await getCurrentShift(db)
  if (!shift) throw new Error('No open shift to close')

  const totals = await computeShiftTotals(db, shift, true, input.physicalCashCents)
  const closedAt = new Date().toISOString()
  const variance = totals.varianceCents ?? 0

  await db
    .update(schema.shifts)
    .set({
      closedAt,
      closedBy: userName,
      closingCashCents: input.physicalCashCents,
      systemCashCents: totals.systemCashCents,
      varianceCents: variance,
      cashSalesCents: totals.cashSalesCents,
      cardSalesCents: totals.cardSalesCents,
      ordersCount: totals.ordersCount,
      status: 'closed'
    })
    .where(eq(schema.shifts.id, shift.id))

  const settings = await getSettings(db)
  const zReportText = buildZReport(
    {
      shiftId: shift.id,
      openedAt: shift.openedAt,
      closedAt,
      openedBy: shift.cashierName,
      closedBy: userName,
      openingCashCents: shift.openingCashCents,
      systemCashCents: totals.systemCashCents,
      physicalCashCents: input.physicalCashCents,
      varianceCents: variance,
      cashSalesCents: totals.cashSalesCents,
      cardSalesCents: totals.cardSalesCents,
      ordersCount: totals.ordersCount,
      grossSalesCents: totals.grossSalesCents,
      discountCents: totals.discountCents,
      serviceChargeCents: totals.serviceChargeCents,
      taxCents: totals.taxCents,
      netSalesCents: totals.netSalesCents
    },
    settings,
    settings.paperWidthMm
  )

  return {
    id: shift.id,
    closingCashCents: input.physicalCashCents,
    varianceCents: variance,
    systemCashCents: totals.systemCashCents,
    cashSalesCents: totals.cashSalesCents,
    cardSalesCents: totals.cardSalesCents,
    ordersCount: totals.ordersCount,
    zReportText
  }
}

/** Last N closed shifts (for the shift history list). */
export async function listClosedShifts(db: DB, limit = 10) {
  return db
    .select()
    .from(schema.shifts)
    .where(eq(schema.shifts.status, 'closed'))
    .orderBy(desc(schema.shifts.id))
    .limit(limit)
}
