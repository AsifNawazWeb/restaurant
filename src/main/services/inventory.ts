import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import type { DB } from '../db/connection'
import * as schema from '../db/schema'
import { withTransaction } from './catalog'
import type {
  PurchaseDraft,
  PurchaseRecord,
  RawMaterial,
  RawMaterialInput,
  WastageEntry
} from '@shared/types'
import type { StockStatus, WasteReason } from '@shared/constants'

function statusOf(stock: number, threshold: number): StockStatus {
  if (threshold > 0 && stock <= threshold * 0.5) return 'critical'
  if (threshold > 0 && stock <= threshold) return 'low'
  if (threshold <= 0 && stock <= 0) return 'critical'
  return 'healthy'
}

/** ---------- Raw materials ---------- */

export async function listMaterials(db: DB): Promise<RawMaterial[]> {
  const rows = await db.select().from(schema.rawMaterials).orderBy(schema.rawMaterials.name)
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    baseUnit: r.baseUnit,
    stockQty: r.stockQty,
    safetyThreshold: r.safetyThreshold,
    avgUnitCostCents: r.avgUnitCostCents,
    status: statusOf(r.stockQty, r.safetyThreshold)
  }))
}

export async function saveMaterial(db: DB, input: RawMaterialInput): Promise<number> {
  if (input.id) {
    await db
      .update(schema.rawMaterials)
      .set({
        name: input.name,
        baseUnit: input.baseUnit,
        safetyThreshold: input.safetyThreshold
      })
      .where(eq(schema.rawMaterials.id, input.id))
    return input.id
  }
  const [row] = await db
    .insert(schema.rawMaterials)
    .values({
      name: input.name,
      baseUnit: input.baseUnit,
      stockQty: input.stockQty,
      safetyThreshold: input.safetyThreshold,
      avgUnitCostCents: input.initialCostCents ?? 0,
      createdAt: new Date().toISOString()
    })
    .returning()
  if (input.stockQty !== 0) {
    await db.insert(schema.stockMovements).values({
      materialId: row.id,
      deltaQty: input.stockQty,
      reason: 'adjustment',
      refType: 'opening',
      note: 'Opening balance',
      createdAt: new Date().toISOString()
    })
  }
  return row.id
}

export async function deleteMaterial(db: DB, id: number): Promise<void> {
  const [{ cnt }] = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(schema.recipes)
    .where(eq(schema.recipes.materialId, id))
  if (cnt > 0) throw new Error('Material is used in recipes — remove it from recipes first')
  await db.delete(schema.rawMaterials).where(eq(schema.rawMaterials.id, id))
}

/** Manual stock adjustment (positive or negative), recorded in the ledger. */
export async function adjustStock(
  db: DB,
  materialId: number,
  deltaQty: number,
  note: string
): Promise<void> {
  await withTransaction(db, async () => {
    await db
      .update(schema.rawMaterials)
      .set({ stockQty: sql`${schema.rawMaterials.stockQty} + ${deltaQty}` })
      .where(eq(schema.rawMaterials.id, materialId))
    await db.insert(schema.stockMovements).values({
      materialId,
      deltaQty,
      reason: 'adjustment',
      refType: 'manual',
      note,
      createdAt: new Date().toISOString()
    })
  })
}

/** ---------- Purchases (goods received) ---------- */

/**
 * Records a purchase and updates each material's weighted average unit cost:
 *   newAvg = (oldQty × oldAvg + buyQty × unitCost) / (oldQty + buyQty)
 */
export async function createPurchase(db: DB, draft: PurchaseDraft, userName: string): Promise<PurchaseRecord> {
  const receivedAt = draft.receivedAt ?? new Date().toISOString()

  const result = await withTransaction(db, async (): Promise<PurchaseRecord> => {
    let total = 0
    for (const line of draft.lines) {
      if (line.qty <= 0) throw new Error('Purchase quantities must be positive')
      if (line.lineCostCents < 0) throw new Error('Purchase cost cannot be negative')
      total += line.lineCostCents
    }

    const [purchase] = await db
      .insert(schema.purchases)
      .values({
        supplierName: draft.supplierName,
        invoiceRef: draft.invoiceRef,
        totalCents: total,
        receivedAt,
        receivedBy: userName
      })
      .returning()

    const recordLines: PurchaseRecord['lines'] = []
    for (const line of draft.lines) {
      const unitCostCents = Math.round(line.lineCostCents / line.qty)
      const [mat] = await db
        .select()
        .from(schema.rawMaterials)
        .where(eq(schema.rawMaterials.id, line.materialId))

      if (!mat) throw new Error(`Material ${line.materialId} not found`)

      const newQty = mat.stockQty + line.qty
      const newAvg =
        newQty > 0
          ? Math.round((mat.stockQty * mat.avgUnitCostCents + line.qty * unitCostCents) / newQty)
          : unitCostCents

      await db
        .update(schema.rawMaterials)
        .set({ stockQty: newQty, avgUnitCostCents: newAvg })
        .where(eq(schema.rawMaterials.id, line.materialId))

      await db.insert(schema.purchaseLines).values({
        purchaseId: purchase.id,
        materialId: line.materialId,
        qty: line.qty,
        unitCostCents,
        lineCostCents: line.lineCostCents
      })

      await db.insert(schema.stockMovements).values({
        materialId: line.materialId,
        deltaQty: line.qty,
        reason: 'purchase',
        refType: 'purchase',
        refId: purchase.id,
        createdAt: receivedAt
      })

      recordLines.push({
        materialId: line.materialId,
        materialName: mat.name,
        qty: line.qty,
        unitCostCents,
        lineCostCents: line.lineCostCents
      })
    }

    return {
      id: purchase.id,
      supplierName: purchase.supplierName,
      invoiceRef: purchase.invoiceRef,
      receivedAt: purchase.receivedAt,
      totalCents: total,
      lines: recordLines
    }
  })

  void userName
  return result
}

export async function listPurchases(db: DB, limit = 50): Promise<PurchaseRecord[]> {
  const purchases = await db
    .select()
    .from(schema.purchases)
    .orderBy(desc(schema.purchases.receivedAt))
    .limit(limit)
  if (purchases.length === 0) return []

  const allLines = await db
    .select({
      purchaseId: schema.purchaseLines.purchaseId,
      materialId: schema.purchaseLines.materialId,
      materialName: schema.rawMaterials.name,
      qty: schema.purchaseLines.qty,
      unitCostCents: schema.purchaseLines.unitCostCents,
      lineCostCents: schema.purchaseLines.lineCostCents
    })
    .from(schema.purchaseLines)
    .innerJoin(schema.rawMaterials, eq(schema.purchaseLines.materialId, schema.rawMaterials.id))
    .where(
      sql`${schema.purchaseLines.purchaseId} IN (${sql.join(
        purchases.map((p) => sql`${p.id}`),
        sql`, `
      )})`
    )

  return purchases.map((p) => ({
    id: p.id,
    supplierName: p.supplierName,
    invoiceRef: p.invoiceRef,
    receivedAt: p.receivedAt,
    totalCents: p.totalCents,
    lines: allLines.filter((l) => l.purchaseId === p.id)
  }))
}

/** ---------- Wastage ---------- */

export async function logWastage(
  db: DB,
  materialId: number,
  qty: number,
  reason: WasteReason,
  userName: string
): Promise<WastageEntry> {
  return withTransaction(db, async () => {
    if (qty <= 0) throw new Error('Wastage quantity must be positive')
    const [mat] = await db.select().from(schema.rawMaterials).where(eq(schema.rawMaterials.id, materialId))
    if (!mat) throw new Error('Material not found')
    const cost = Math.round(qty * mat.avgUnitCostCents)

    await db
      .update(schema.rawMaterials)
      .set({ stockQty: sql`${schema.rawMaterials.stockQty} - ${qty}` })
      .where(eq(schema.rawMaterials.id, materialId))

    const [row] = await db
      .insert(schema.wastage)
      .values({
        materialId,
        qty,
        reason,
        costCents: cost,
        loggedAt: new Date().toISOString(),
        loggedBy: userName
      })
      .returning()

    await db.insert(schema.stockMovements).values({
      materialId,
      deltaQty: -qty,
      reason: 'wastage',
      refType: 'wastage',
      refId: row.id,
      createdAt: row.loggedAt
    })

    return {
      id: row.id,
      materialId,
      materialName: mat.name,
      qty,
      reason,
      costCents: cost,
      loggedAt: row.loggedAt
    }
  })
}

export async function listWastage(db: DB, limit = 50): Promise<WastageEntry[]> {
  const rows = await db
    .select({
      id: schema.wastage.id,
      materialId: schema.wastage.materialId,
      materialName: schema.rawMaterials.name,
      qty: schema.wastage.qty,
      reason: schema.wastage.reason,
      costCents: schema.wastage.costCents,
      loggedAt: schema.wastage.loggedAt
    })
    .from(schema.wastage)
    .innerJoin(schema.rawMaterials, eq(schema.wastage.materialId, schema.rawMaterials.id))
    .orderBy(desc(schema.wastage.loggedAt))
    .limit(limit)
  return rows as WastageEntry[]
}

/** ---------- Movements ledger (for reports) ---------- */

export interface MovementFilter {
  materialId?: number
  from?: string
  to?: string
  reason?: string
  limit?: number
}

export async function listMovements(db: DB, filter: MovementFilter) {
  const conds = []
  if (filter.materialId) conds.push(eq(schema.stockMovements.materialId, filter.materialId))
  if (filter.from) conds.push(gte(schema.stockMovements.createdAt, filter.from))
  if (filter.to) conds.push(lte(schema.stockMovements.createdAt, filter.to))
  if (filter.reason) conds.push(eq(schema.stockMovements.reason, filter.reason as never))
  const q = db
    .select({
      id: schema.stockMovements.id,
      materialId: schema.stockMovements.materialId,
      materialName: schema.rawMaterials.name,
      deltaQty: schema.stockMovements.deltaQty,
      reason: schema.stockMovements.reason,
      refType: schema.stockMovements.refType,
      refId: schema.stockMovements.refId,
      note: schema.stockMovements.note,
      createdAt: schema.stockMovements.createdAt
    })
    .from(schema.stockMovements)
    .innerJoin(schema.rawMaterials, eq(schema.stockMovements.materialId, schema.rawMaterials.id))
  const rows = conds.length
    ? await q.where(and(...conds)).orderBy(desc(schema.stockMovements.id)).limit(filter.limit ?? 200)
    : await q.orderBy(desc(schema.stockMovements.id)).limit(filter.limit ?? 200)
  return rows
}
