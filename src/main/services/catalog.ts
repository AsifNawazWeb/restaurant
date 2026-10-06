import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { DB } from '../db/connection'
import * as schema from '../db/schema'
import type {
  MenuCategory,
  MenuItem,
  MenuItemInput,
  RecipeLine
} from '@shared/types'

/** ---------- Categories ---------- */

export async function listCategories(db: DB, includeInactive = false): Promise<MenuCategory[]> {
  const rows = includeInactive
    ? await db.select().from(schema.menuCategories).orderBy(asc(schema.menuCategories.sortOrder))
    : await db
        .select()
        .from(schema.menuCategories)
        .where(eq(schema.menuCategories.isActive, true))
        .orderBy(asc(schema.menuCategories.sortOrder))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sortOrder: r.sortOrder,
    isActive: r.isActive
  }))
}

export async function createCategory(db: DB, name: string, sortOrder: number): Promise<MenuCategory> {
  const [row] = await db
    .insert(schema.menuCategories)
    .values({ name, sortOrder })
    .returning()
  return { id: row.id, name: row.name, sortOrder: row.sortOrder, isActive: row.isActive }
}

export async function updateCategory(db: DB, id: number, name: string, isActive: boolean): Promise<void> {
  await db.update(schema.menuCategories).set({ name, isActive }).where(eq(schema.menuCategories.id, id))
}

export async function deleteCategory(db: DB, id: number): Promise<void> {
  const [{ cnt }] = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(schema.menuItems)
    .where(eq(schema.menuItems.categoryId, id))
  if (cnt > 0) throw new Error('Category has menu items — reassign them first')
  await db.delete(schema.menuCategories).where(eq(schema.menuCategories.id, id))
}

/** ---------- Menu items ---------- */

interface ItemRow {
  id: number
  sku: string
  name: string
  categoryId: number
  categoryName: string
  imageUrl: string | null
  taxEnabled: boolean
  isAvailable: boolean
}

function stockStatus(stock: number, threshold: number): 'healthy' | 'low' | 'critical' {
  if (threshold <= 0) return stock <= 0 ? 'critical' : 'healthy'
  if (stock <= threshold * 0.5) return 'critical'
  if (stock <= threshold) return 'low'
  return 'healthy'
}

/** Recipe cost for an item = Σ consumption × material weighted avg unit cost. */
export async function getBomCostCents(db: DB, menuItemId: number): Promise<number> {
  const rows = await db
    .select({
      qty: schema.recipes.consumptionQty,
      avgUnitCostCents: schema.rawMaterials.avgUnitCostCents
    })
    .from(schema.recipes)
    .innerJoin(schema.rawMaterials, eq(schema.recipes.materialId, schema.rawMaterials.id))
    .where(eq(schema.recipes.menuItemId, menuItemId))
  return rows.reduce((sum, r) => sum + Math.round(r.qty * r.avgUnitCostCents), 0)
}

export async function listMenuItems(db: DB, opts?: { categoryId?: number | null; search?: string | null }): Promise<MenuItem[]> {
  const conditions = []
  if (opts?.categoryId) conditions.push(eq(schema.menuItems.categoryId, opts.categoryId))
  if (opts?.search) {
    const term = `%${opts.search.toLowerCase()}%`
    conditions.push(sql`(lower(${schema.menuItems.name}) LIKE ${term} OR lower(${schema.menuItems.sku}) LIKE ${term})`)
  }

  const base = db
    .select({
      id: schema.menuItems.id,
      sku: schema.menuItems.sku,
      name: schema.menuItems.name,
      categoryId: schema.menuItems.categoryId,
      categoryName: schema.menuCategories.name,
      imageUrl: schema.menuItems.imageUrl,
      taxEnabled: schema.menuItems.taxEnabled,
      isAvailable: schema.menuItems.isAvailable
    })
    .from(schema.menuItems)
    .innerJoin(schema.menuCategories, eq(schema.menuItems.categoryId, schema.menuCategories.id))

  const itemRows = (conditions.length
    ? await base.where(and(...conditions)).orderBy(asc(schema.menuItems.name))
    : await base.orderBy(asc(schema.menuItems.name))) as ItemRow[]

  if (itemRows.length === 0) return []

  const ids = itemRows.map((r) => r.id)
  const variantRows = await db
    .select()
    .from(schema.menuItemVariants)
    .where(inArray(schema.menuItemVariants.menuItemId, ids))
    .orderBy(asc(schema.menuItemVariants.id))

  const costRows = await db
    .select({
      menuItemId: schema.recipes.menuItemId,
      cost: sql<number>`SUM(CAST(${schema.recipes.consumptionQty} * ${schema.rawMaterials.avgUnitCostCents} AS INTEGER))`
    })
    .from(schema.recipes)
    .innerJoin(schema.rawMaterials, eq(schema.recipes.materialId, schema.rawMaterials.id))
    .where(inArray(schema.recipes.menuItemId, ids))
    .groupBy(schema.recipes.menuItemId)
  const costMap = new Map(costRows.map((r) => [r.menuItemId, Number(r.cost) || 0]))

  return itemRows.map((r) => {
    const variants = variantRows
      .filter((v) => v.menuItemId === r.id)
      .map((v) => ({ id: v.id, menuItemId: v.menuItemId, name: v.name, priceCents: v.priceCents }))
    return {
      ...r,
      variants,
      minPriceCents: variants.length ? Math.min(...variants.map((v) => v.priceCents)) : 0,
      costCents: costMap.get(r.id) ?? 0
    }
  })
}

export async function saveMenuItem(db: DB, input: MenuItemInput): Promise<number> {
  const nowIso = new Date().toISOString()

  let itemId: number
  if (input.id) {
    await db
      .update(schema.menuItems)
      .set({
        sku: input.sku,
        name: input.name,
        categoryId: input.categoryId,
        imageUrl: input.imageUrl ?? null,
        taxEnabled: input.taxEnabled,
        isAvailable: input.isAvailable
      })
      .where(eq(schema.menuItems.id, input.id))
    itemId = input.id
  } else {
    const [row] = await db
      .insert(schema.menuItems)
      .values({
        sku: input.sku,
        name: input.name,
        categoryId: input.categoryId,
        imageUrl: input.imageUrl ?? null,
        taxEnabled: input.taxEnabled,
        isAvailable: input.isAvailable,
        createdAt: nowIso
      })
      .returning()
    itemId = row.id
  }

  // Replace variants wholesale (keeps API simple; variant ids may shift)
  await db.delete(schema.menuItemVariants).where(eq(schema.menuItemVariants.menuItemId, itemId))
  if (input.variants.length) {
    await db.insert(schema.menuItemVariants).values(
      input.variants.map((v) => ({
        menuItemId: itemId,
        name: v.name,
        priceCents: v.priceCents
      }))
    )
  }
  return itemId
}

export async function setItemAvailability(db: DB, id: number, isAvailable: boolean): Promise<void> {
  await db.update(schema.menuItems).set({ isAvailable }).where(eq(schema.menuItems.id, id))
}

export async function deleteMenuItem(db: DB, id: number): Promise<void> {
  const [{ cnt }] = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(schema.orderItems)
    .where(eq(schema.orderItems.menuItemId, id))
  if (cnt > 0) {
    // Preserve order history: soft delete
    await db.update(schema.menuItems).set({ isAvailable: false }).where(eq(schema.menuItems.id, id))
    throw new Error('Item has sales history — marked unavailable instead of deleting')
  }
  await db.delete(schema.menuItems).where(eq(schema.menuItems.id, id))
}

/** ---------- Recipes (BOM) ---------- */

export async function getRecipe(db: DB, menuItemId: number): Promise<RecipeLine[]> {
  const rows = await db
    .select({
      id: schema.recipes.id,
      menuItemId: schema.recipes.menuItemId,
      materialId: schema.recipes.materialId,
      materialName: schema.rawMaterials.name,
      materialUnit: schema.rawMaterials.baseUnit,
      consumptionQty: schema.recipes.consumptionQty
    })
    .from(schema.recipes)
    .innerJoin(schema.rawMaterials, eq(schema.recipes.materialId, schema.rawMaterials.id))
    .where(eq(schema.recipes.menuItemId, menuItemId))
    .orderBy(asc(schema.recipes.id))
  return rows
}

/** Replace the entire recipe for an item atomically. */
export async function setRecipe(db: DB, menuItemId: number, lines: { materialId: number; consumptionQty: number }[]): Promise<void> {
  const run = async (): Promise<void> => {
    await db.delete(schema.recipes).where(eq(schema.recipes.menuItemId, menuItemId))
    if (lines.length) {
      const seen = new Set<number>()
      const values = lines
        .filter((l) => l.consumptionQty > 0 && !seen.has(l.materialId) && seen.add(l.materialId))
        .map((l) => ({ menuItemId, materialId: l.materialId, consumptionQty: l.consumptionQty }))
      if (values.length) await db.insert(schema.recipes).values(values)
    }
  }
  await withTransaction(db, run)
}

/** ---------- shared txn helper ---------- */

import { getSqlite } from '../db/connection'

export async function withTransaction<T>(db: DB, fn: () => Promise<T>): Promise<T> {
  const sqlite = getSqlite()
  sqlite.exec('BEGIN IMMEDIATE')
  try {
    const result = await fn()
    sqlite.exec('COMMIT')
    return result
  } catch (err) {
    try {
      sqlite.exec('ROLLBACK')
    } catch {
      /* already rolled back */
    }
    throw err
  }
}
