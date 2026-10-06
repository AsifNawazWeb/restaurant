import { sql } from 'drizzle-orm'
import type { DB } from './connection'
import * as schema from './schema'

const iso = (d: Date) => d.toISOString()
const now = () => iso(new Date())

export interface SeedTotals {
  orders: number
}

/**
 * Seeds a realistic Pakistani restaurant dataset the first time the app runs:
 * users, categories, menu items + variants, raw materials, BOM recipes,
 * purchase history, a closed shift + today's open shift, 3 days of orders.
 * Theme: Shinwari Restaurant, Namak Mandi, Peshawar (PKR, FBR GST).
 */
export async function seedIfEmpty(db: DB): Promise<void> {
  const [{ cnt }] = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(schema.menuCategories)
  if (cnt > 0) return

  const t = now

  /** Settings */
  const defaultSettings: Record<string, string> = {
    restaurantName: 'Shinwari Restaurant',
    address: 'Shop No. 12, Namak Mandi Food Street, Peshawar',
    phone: '+92 91 527 4321',
    vatRegistration: 'FBR STRN 02-91-8102-043-18',
    receiptHeader: 'Thank you for dining with us!',
    receiptFooter: 'Shukriya! Visit again - Shinwari Restaurant',
    defaultVatPercent: '18',
    serviceChargePercent: '5',
    serviceChargeEnabled: '0',
    quickDiscounts: '5,10,15',
    printerType: 'network',
    printerTarget: '192.168.1.87',
    defaultPrinterName: '',
    paperWidthMm: '80',
    autoDrawerKick: '1'
  }
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db.insert(schema.settings).values({ key, value })
  }

  /** Users */
  const users = await db
    .insert(schema.users)
    .values([
      { name: 'Ahmed Raza', role: 'manager', canOverride: true, createdAt: t(), pinHash: null },
      { name: 'Bilal Hussain', role: 'cashier', canOverride: false, createdAt: t(), pinHash: null }
    ])
    .returning()
  const manager = users[0]

  /** Categories */
  const cats = await db
    .insert(schema.menuCategories)
    .values([
      { name: 'Karahi & BBQ', sortOrder: 1 },
      { name: 'Biryani & Pulao', sortOrder: 2 },
      { name: 'Chinese', sortOrder: 3 },
      { name: 'Naan & Breads', sortOrder: 4 },
      { name: 'Chaat & Snacks', sortOrder: 5 },
      { name: 'Desserts', sortOrder: 6 },
      { name: 'Beverages', sortOrder: 7 }
    ])
    .returning()
  const [bbq, rice, chinese, breads, snacks, desserts, bev] = cats

  const firstVariantPrice = (pick: (typeof items)[number]) => pick.variants[0].priceCents
  const firstVariantName = (pick: (typeof items)[number]) => pick.variants[0].name
  const daysAgo = (d: number, h: number) => {
    const dt = new Date()
    dt.setDate(dt.getDate() - d)
    dt.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0)
    return dt
  }
  const today = (h: number) => {
    const dt = new Date()
    dt.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0)
    return dt
  }

  /** Menu items */

  const items: Array<{
    sku: string
    name: string
    cat: typeof bbq
    taxEnabled?: boolean
    variants: { name: string; priceCents: number }[]
  }> = [
    {
      sku: 'KK-001',
      name: 'Mutton Shinwari Karahi',
      cat: bbq,
      variants: [
        { name: 'Half', priceCents: 280000 },
        { name: 'Full', priceCents: 540000 }
      ]
    },
    {
      sku: 'KK-002',
      name: 'Chicken Shinwari Karahi',
      cat: bbq,
      variants: [
        { name: 'Half', priceCents: 145000 },
        { name: 'Full', priceCents: 280000 }
      ]
    },
    {
      sku: 'BB-001',
      name: 'Chicken Tikka',
      cat: bbq,
      variants: [{ name: 'Single', priceCents: 38000 }]
    },
    {
      sku: 'BB-002',
      name: 'Seekh Kabab',
      cat: bbq,
      variants: [{ name: 'Single', priceCents: 32000 }]
    },
    {
      sku: 'BB-003',
      name: 'Chapli Kabab',
      cat: bbq,
      variants: [{ name: 'Single', priceCents: 28000 }]
    },
    {
      sku: 'BB-004',
      name: 'Malai Boti (4 pcs)',
      cat: bbq,
      variants: [{ name: '4 pcs', priceCents: 42000 }]
    },
    {
      sku: 'BP-001',
      name: 'Chicken Biryani',
      cat: rice,
      variants: [
        { name: 'Regular', priceCents: 32000 },
        { name: 'Large', priceCents: 42000 }
      ]
    },
    {
      sku: 'BP-002',
      name: 'Beef Biryani',
      cat: rice,
      variants: [
        { name: 'Regular', priceCents: 35000 },
        { name: 'Large', priceCents: 45000 }
      ]
    },
    {
      sku: 'BP-003',
      name: 'Kabuli Pulao',
      cat: rice,
      variants: [
        { name: 'Regular', priceCents: 38000 },
        { name: 'Large', priceCents: 48000 }
      ]
    },
    {
      sku: 'CN-001',
      name: 'Chicken Chow Mein',
      cat: chinese,
      variants: [{ name: 'Regular', priceCents: 55000 }]
    },
    {
      sku: 'CN-002',
      name: 'Chicken Manchurian',
      cat: chinese,
      variants: [{ name: 'Regular', priceCents: 52000 }]
    },
    {
      sku: 'NB-001',
      name: 'Butter Naan',
      cat: breads,
      variants: [{ name: 'Piece', priceCents: 8000 }]
    },
    {
      sku: 'NB-002',
      name: 'Garlic Naan',
      cat: breads,
      variants: [{ name: 'Piece', priceCents: 12000 }]
    },
    {
      sku: 'NB-003',
      name: 'Rogni Naan',
      cat: breads,
      variants: [{ name: 'Piece', priceCents: 10000 }]
    },
    {
      sku: 'NB-004',
      name: 'Tandoori Roti',
      cat: breads,
      variants: [{ name: 'Piece', priceCents: 4000 }]
    },
    {
      sku: 'CS-001',
      name: 'Samosa (2 pcs)',
      cat: snacks,
      variants: [{ name: '2 pcs', priceCents: 6000 }]
    },
    {
      sku: 'CS-002',
      name: 'Pakora Plate',
      cat: snacks,
      variants: [{ name: 'Plate', priceCents: 10000 }]
    },
    {
      sku: 'CS-003',
      name: 'Dahi Baray',
      cat: snacks,
      variants: [{ name: 'Plate', priceCents: 18000 }]
    },
    {
      sku: 'CS-004',
      name: 'Bun Kabab',
      cat: snacks,
      variants: [{ name: 'Single', priceCents: 15000 }]
    },
    {
      sku: 'DS-001',
      name: 'Kheer',
      cat: desserts,
      variants: [{ name: 'Bowl', priceCents: 15000 }]
    },
    {
      sku: 'DS-002',
      name: 'Gulab Jamun (4 pcs)',
      cat: desserts,
      variants: [{ name: '4 pcs', priceCents: 14000 }]
    },
    {
      sku: 'DS-003',
      name: 'Falooda',
      cat: desserts,
      variants: [{ name: 'Bowl', priceCents: 25000 }]
    },
    {
      sku: 'BV-001',
      name: 'Doodh Patti Chai',
      cat: bev,
      taxEnabled: false,
      variants: [{ name: 'Cup', priceCents: 8000 }]
    },
    {
      sku: 'BV-002',
      name: 'Lassi',
      cat: bev,
      variants: [
        { name: 'Sweet', priceCents: 15000 },
        { name: 'Salted', priceCents: 14000 }
      ]
    },
    {
      sku: 'BV-003',
      name: 'Fresh Lime Soda',
      cat: bev,
      variants: [{ name: 'Glass', priceCents: 12000 }]
    },
    {
      sku: 'BV-004',
      name: 'Bottled Water 1L',
      cat: bev,
      taxEnabled: false,
      variants: [{ name: '1 Litre', priceCents: 6000 }]
    }
  ]

  const itemIds: Record<string, number> = {}
  const variantIds: Record<string, number> = {}
  for (const it of items) {
    const [inserted] = await db
      .insert(schema.menuItems)
      .values({
        sku: it.sku,
        name: it.name,
        categoryId: it.cat.id,
        taxEnabled: it.taxEnabled ?? true,
        isAvailable: true,
        createdAt: t()
      })
      .returning()
    itemIds[it.sku] = inserted.id
    for (const v of it.variants) {
      const [vi] = await db
        .insert(schema.menuItemVariants)
        .values({ menuItemId: inserted.id, name: v.name, priceCents: v.priceCents })
        .returning()
      variantIds[`${it.sku}:${v.name}`] = vi.id
    }
  }

  /** Raw materials (base units: kg, g, l, ml, pcs) — costs in PKR per base unit */
  const mats = await db
    .insert(schema.rawMaterials)
    .values([
      { name: 'Mutton (Bone-in)', baseUnit: 'kg', stockQty: 8.5, safetyThreshold: 6, avgUnitCostCents: 240000, createdAt: t() },
      { name: 'Raw Chicken', baseUnit: 'kg', stockQty: 28.0, safetyThreshold: 12, avgUnitCostCents: 75000, createdAt: t() },
      { name: 'Beef Mince', baseUnit: 'kg', stockQty: 10.0, safetyThreshold: 5, avgUnitCostCents: 120000, createdAt: t() },
      { name: 'Basmati Rice', baseUnit: 'kg', stockQty: 65.0, safetyThreshold: 25, avgUnitCostCents: 36000, createdAt: t() },
      { name: 'Desi Ghee', baseUnit: 'kg', stockQty: 6.0, safetyThreshold: 3, avgUnitCostCents: 260000, createdAt: t() },
      { name: 'Cooking Oil', baseUnit: 'l', stockQty: 12.0, safetyThreshold: 6, avgUnitCostCents: 52000, createdAt: t() },
      { name: 'Yoghurt (Dahi)', baseUnit: 'kg', stockQty: 14.0, safetyThreshold: 5, avgUnitCostCents: 22000, createdAt: t() },
      { name: 'Fresh Cream', baseUnit: 'ml', stockQty: 3000, safetyThreshold: 1000, avgUnitCostCents: 90, createdAt: t() },
      { name: 'Onions', baseUnit: 'kg', stockQty: 20.0, safetyThreshold: 10, avgUnitCostCents: 11000, createdAt: t() },
      { name: 'Tomatoes', baseUnit: 'kg', stockQty: 9.0, safetyThreshold: 8, avgUnitCostCents: 14000, createdAt: t() },
      { name: 'Potatoes', baseUnit: 'kg', stockQty: 12.0, safetyThreshold: 5, avgUnitCostCents: 9000, createdAt: t() },
      { name: 'Ginger Garlic Paste', baseUnit: 'g', stockQty: 2500, safetyThreshold: 1000, avgUnitCostCents: 12, createdAt: t() },
      { name: 'Green Chillies', baseUnit: 'kg', stockQty: 1.8, safetyThreshold: 1, avgUnitCostCents: 24000, createdAt: t() },
      { name: 'Coriander (Dhania)', baseUnit: 'kg', stockQty: 1.2, safetyThreshold: 0.5, avgUnitCostCents: 30000, createdAt: t() },
      { name: 'Biryani Masala Mix', baseUnit: 'g', stockQty: 3000, safetyThreshold: 1500, avgUnitCostCents: 140, createdAt: t() },
      { name: 'Chaat Masala', baseUnit: 'g', stockQty: 1500, safetyThreshold: 500, avgUnitCostCents: 60, createdAt: t() },
      { name: 'Gram Flour (Besan)', baseUnit: 'kg', stockQty: 6.0, safetyThreshold: 2, avgUnitCostCents: 22000, createdAt: t() },
      { name: 'Wheat Flour (Maida)', baseUnit: 'kg', stockQty: 25.0, safetyThreshold: 12, avgUnitCostCents: 16000, createdAt: t() },
      { name: 'Mixed Vegetables (Frozen)', baseUnit: 'kg', stockQty: 3.0, safetyThreshold: 1.5, avgUnitCostCents: 40000, createdAt: t() },
      { name: 'Noodles', baseUnit: 'g', stockQty: 2000, safetyThreshold: 800, avgUnitCostCents: 30, createdAt: t() },
      { name: 'Burger Buns', baseUnit: 'pcs', stockQty: 60, safetyThreshold: 30, avgUnitCostCents: 3500, createdAt: t() },
      { name: 'Milk (Fresh)', baseUnit: 'l', stockQty: 20.0, safetyThreshold: 8, avgUnitCostCents: 22000, createdAt: t() },
      { name: 'Tea Leaves', baseUnit: 'g', stockQty: 2000, safetyThreshold: 600, avgUnitCostCents: 16, createdAt: t() },
      { name: 'Sugar', baseUnit: 'kg', stockQty: 15.0, safetyThreshold: 5, avgUnitCostCents: 18500, createdAt: t() },
      { name: 'Lemon', baseUnit: 'kg', stockQty: 1.5, safetyThreshold: 0.8, avgUnitCostCents: 20000, createdAt: t() },
      { name: 'Soda Water', baseUnit: 'l', stockQty: 10.0, safetyThreshold: 4, avgUnitCostCents: 8000, createdAt: t() },
      { name: 'Khoya', baseUnit: 'kg', stockQty: 2.5, safetyThreshold: 1, avgUnitCostCents: 180000, createdAt: t() },
      { name: 'Sewiyan (Vermicelli)', baseUnit: 'g', stockQty: 800, safetyThreshold: 300, avgUnitCostCents: 35, createdAt: t() },
      { name: 'Ice Cream (Vanilla)', baseUnit: 'l', stockQty: 6.0, safetyThreshold: 2, avgUnitCostCents: 45000, createdAt: t() },
      { name: 'Bottled Water 1L', baseUnit: 'pcs', stockQty: 96, safetyThreshold: 48, avgUnitCostCents: 5500, createdAt: t() }
    ])
    .returning()
  const matIds: Record<string, number> = {}
  for (const m of mats) matIds[m.name] = m.id

  /** Recipes (BOM) - consumption expressed in base units */
  const bom: Array<{ item: string; lines: Array<[string, number]> }> = [
    {
      item: 'KK-001',
      lines: [
        ['Mutton (Bone-in)', 0.85],
        ['Desi Ghee', 0.08],
        ['Tomatoes', 0.25],
        ['Ginger Garlic Paste', 15],
        ['Green Chillies', 0.02],
        ['Coriander (Dhania)', 0.02]
      ]
    },
    {
      item: 'KK-002',
      lines: [
        ['Raw Chicken', 0.6],
        ['Desi Ghee', 0.05],
        ['Tomatoes', 0.2],
        ['Ginger Garlic Paste', 12],
        ['Green Chillies', 0.015],
        ['Coriander (Dhania)', 0.015]
      ]
    },
    { item: 'BB-001', lines: [['Raw Chicken', 0.25], ['Yoghurt (Dahi)', 0.04], ['Chaat Masala', 3], ['Desi Ghee', 0.01]] },
    { item: 'BB-002', lines: [['Beef Mince', 0.2], ['Onions', 0.03], ['Ginger Garlic Paste', 5], ['Desi Ghee', 0.01]] },
    { item: 'BB-003', lines: [['Beef Mince', 0.15], ['Wheat Flour (Maida)', 0.03], ['Tomatoes', 0.03], ['Desi Ghee', 0.02]] },
    { item: 'BB-004', lines: [['Raw Chicken', 0.2], ['Yoghurt (Dahi)', 0.05], ['Fresh Cream', 60], ['Chaat Masala', 2]] },
    {
      item: 'BP-001',
      lines: [
        ['Basmati Rice', 0.2],
        ['Raw Chicken', 0.15],
        ['Cooking Oil', 0.03],
        ['Biryani Masala Mix', 10],
        ['Onions', 0.05],
        ['Yoghurt (Dahi)', 0.05]
      ]
    },
    {
      item: 'BP-002',
      lines: [
        ['Basmati Rice', 0.2],
        ['Beef Mince', 0.15],
        ['Cooking Oil', 0.03],
        ['Biryani Masala Mix', 10],
        ['Onions', 0.05],
        ['Yoghurt (Dahi)', 0.05]
      ]
    },
    {
      item: 'BP-003',
      lines: [
        ['Basmati Rice', 0.22],
        ['Beef Mince', 0.15],
        ['Desi Ghee', 0.03],
        ['Sugar', 10],
        ['Onions', 0.05]
      ]
    },
    { item: 'CN-001', lines: [['Noodles', 180], ['Raw Chicken', 0.1], ['Mixed Vegetables (Frozen)', 0.15], ['Cooking Oil', 0.02], ['Ginger Garlic Paste', 5]] },
    { item: 'CN-002', lines: [['Raw Chicken', 0.18], ['Mixed Vegetables (Frozen)', 0.1], ['Cooking Oil', 0.03], ['Ginger Garlic Paste', 8], ['Wheat Flour (Maida)', 0.05]] },
    { item: 'NB-001', lines: [['Wheat Flour (Maida)', 0.12], ['Desi Ghee', 0.008]] },
    { item: 'NB-002', lines: [['Wheat Flour (Maida)', 0.12], ['Desi Ghee', 0.01], ['Ginger Garlic Paste', 5]] },
    { item: 'NB-003', lines: [['Wheat Flour (Maida)', 0.12], ['Desi Ghee', 0.012], ['Sugar', 5], ['Milk (Fresh)', 0.02]] },
    { item: 'NB-004', lines: [['Wheat Flour (Maida)', 0.1]] },
    { item: 'CS-001', lines: [['Wheat Flour (Maida)', 0.06], ['Potatoes', 0.15], ['Cooking Oil', 0.015]] },
    { item: 'CS-002', lines: [['Gram Flour (Besan)', 0.15], ['Potatoes', 0.2], ['Cooking Oil', 0.05], ['Chaat Masala', 2]] },
    { item: 'CS-003', lines: [['Gram Flour (Besan)', 0.1], ['Yoghurt (Dahi)', 0.3], ['Chaat Masala', 4]] },
    { item: 'CS-004', lines: [['Burger Buns', 1], ['Beef Mince', 0.08], ['Cooking Oil', 0.01], ['Onions', 0.02]] },
    { item: 'DS-001', lines: [['Milk (Fresh)', 0.3], ['Sugar', 25], ['Khoya', 0.03], ['Sewiyan (Vermicelli)', 5]] },
    { item: 'DS-002', lines: [['Khoya', 0.03], ['Sugar', 30], ['Cooking Oil', 0.02]] },
    { item: 'DS-003', lines: [['Milk (Fresh)', 0.2], ['Ice Cream (Vanilla)', 0.15], ['Sewiyan (Vermicelli)', 10], ['Sugar', 15]] },
    { item: 'BV-001', lines: [['Tea Leaves', 8], ['Milk (Fresh)', 0.1], ['Sugar', 12]] },
    { item: 'BV-002', lines: [['Yoghurt (Dahi)', 0.25], ['Milk (Fresh)', 0.05], ['Sugar', 15]] },
    { item: 'BV-003', lines: [['Lemon', 0.05], ['Sugar', 20], ['Soda Water', 0.2]] },
    { item: 'BV-004', lines: [['Bottled Water 1L', 1]] }
  ]
  for (const b of bom) {
    for (const [matName, qty] of b.lines) {
      await db.insert(schema.recipes).values({
        menuItemId: itemIds[b.item],
        materialId: matIds[matName],
        consumptionQty: qty
      })
    }
  }

  /** Purchase history (drives weighted-average cost realism) */
  const [p1] = await db
    .insert(schema.purchases)
    .values({
      supplierName: 'Peshawar Fresh Foods (Pvt) Ltd',
      invoiceRef: 'INV-88121',
      totalCents: 0,
      receivedAt: iso(daysAgo(2, 9)),
      receivedBy: 'Ahmed Raza'
    })
    .returning()
  const seedPurchaseLines: Array<[string, number, number]> = [
    ['Raw Chicken', 8, 72000],
    ['Mutton (Bone-in)', 5, 235000],
    ['Onions', 8, 10500]
  ]
  let p1Total = 0
  for (const [matName, qty, unit] of seedPurchaseLines) {
    const lineCost = Math.round(qty * unit)
    p1Total += lineCost
    await db.insert(schema.purchaseLines).values({
      purchaseId: p1.id,
      materialId: matIds[matName],
      qty,
      unitCostCents: unit,
      lineCostCents: lineCost
    })
  }
  await db.update(schema.purchases).set({ totalCents: p1Total }).where(sql`id = ${p1.id}`)

  /** Yesterday closed shift + today open shift */
  const [yShift] = await db
    .insert(schema.shifts)
    .values({
      openedAt: iso(daysAgo(1, 8)),
      closedAt: iso(daysAgo(1, 22)),
      openedBy: 'Ahmed Raza',
      closedBy: 'Ahmed Raza',
      openingCashCents: 1500000,
      status: 'closed',
      systemCashCents: 0,
      closingCashCents: 0,
      varianceCents: 0,
      cashSalesCents: 0,
      cardSalesCents: 0,
      ordersCount: 0
    })
    .returning()
  await db.insert(schema.shifts).values({
    openedAt: iso(today(8)),
    openedBy: 'Bilal Hussain',
    openingCashCents: 1500000
  })

  const orderTypeCycle = ['takeaway', 'dinein', 'delivery'] as const
  let seq = 1001
  let cashSales = 0
  let cardSales = 0
  let yOrders = 0

  for (let dayOffset = 2; dayOffset >= 0; dayOffset--) {
    const isToday = dayOffset === 0
    const count = isToday ? 21 : 46 + Math.floor(Math.random() * 10)
    for (let i = 0; i < count; i++) {
      const hourBase = [11, 12, 13, 15, 18, 19, 20, 21][Math.floor(Math.random() * 8)]
      const created = dayOffset === 0 ? today(hourBase + Math.random()) : daysAgo(dayOffset, hourBase + Math.random())
      if (!isToday && created.getHours() <= 8) continue

      // pick 1-3 random items
      const picks = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => items[Math.floor(Math.random() * items.length)])
      let subtotal = 0
      let cost = 0
      const linesToInsert: Array<typeof schema.orderItems.$inferInsert> = []
      const usedVariantNames = new Set<string>()

      for (const pick of picks) {
        if (usedVariantNames.has(pick.sku)) continue
        usedVariantNames.add(pick.sku)
        const qty = 1 + Math.floor(Math.random() * 2)
        const lineSub = firstVariantPrice(pick) * qty
        subtotal += lineSub
        // approximate cost: 38% of revenue (ignores tax on cost)
        cost += Math.round(lineSub * 0.38)
        linesToInsert.push({
          orderId: 0,
          menuItemId: itemIds[pick.sku],
          variantId: variantIds[`${pick.sku}:${firstVariantName(pick)}`],
          nameSnapshot: pick.name,
          variantSnapshot: firstVariantName(pick),
          unitPriceCents: firstVariantPrice(pick),
          qty,
          lineSubtotalCents: lineSub,
          note: null,
          taxEnabled: pick.taxEnabled ?? true
        })
      }

      const discount = Math.random() < 0.12 ? 5 : 0
      const discountCents = Math.round((subtotal * discount) / 100)
      const taxable = subtotal - discountCents
      const tax = Math.round(taxable * 0.18)
      const total = taxable + tax
      const method = Math.random() < 0.45 ? 'cash' : 'card'
      const createdIso = iso(created)
      const isYesterdayOrder = dayOffset === 1

      const [order] = await db
        .insert(schema.orders)
        .values({
          orderNumber: `ORD-${seq++}`,
          shiftId: isYesterdayOrder ? yShift.id : null,
          orderType: orderTypeCycle[i % 3],
          status: 'paid',
          subtotalCents: subtotal,
          discountPercent: discount,
          discountCents,
          serviceChargeCents: 0,
          taxCents: tax,
          totalCents: total,
          costCents: cost,
          customerName: null,
          cashierName: isYesterdayOrder ? 'Ahmed Raza' : 'Bilal Hussain',
          createdAt: createdIso
        })
        .returning()

      for (const li of linesToInsert) {
        await db.insert(schema.orderItems).values({ ...li, orderId: order.id })
      }
      await db.insert(schema.orderPayments).values({
        orderId: order.id,
        method: method as 'cash' | 'card',
        amountCents: total
      })

      if (isYesterdayOrder) {
        yOrders++
        if (method === 'cash') cashSales += total
        else cardSales += total
      }
    }
  }

  await db
    .update(schema.shifts)
    .set({
      systemCashCents: 1500000 + cashSales,
      closingCashCents: 1500000 + cashSales + (Math.floor(Math.random() * 400) - 200),
      varianceCents: Math.floor(Math.random() * 400) - 200,
      cashSalesCents: cashSales,
      cardSalesCents: cardSales,
      ordersCount: yOrders
    })
    .where(sql`id = ${yShift.id}`)

  void manager
}
