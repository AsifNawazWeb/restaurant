import { integer, real, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core'

/** ---------- Identity ---------- */

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  role: text('role', { enum: ['cashier', 'manager'] }).notNull().default('cashier'),
  pinHash: text('pin_hash'),
  canOverride: integer('can_override', { mode: 'boolean' }).notNull().default(false),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull()
})

/** ---------- Catalog ---------- */

export const menuCategories = sqliteTable('menu_categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true)
})

export const menuItems = sqliteTable(
  'menu_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => menuCategories.id, { onDelete: 'restrict' }),
    imageUrl: text('image_url'),
    taxEnabled: integer('tax_enabled', { mode: 'boolean' }).notNull().default(true),
    isAvailable: integer('is_available', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull()
  },
  (t) => [uniqueIndex('menu_items_sku_uq').on(t.sku)]
)

export const menuItemVariants = sqliteTable(
  'menu_item_variants',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    menuItemId: integer('menu_item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    priceCents: integer('price_cents').notNull()
  },
  (t) => [uniqueIndex('variant_item_name_uq').on(t.menuItemId, t.name)]
)

/** ---------- Inventory ---------- */

export const rawMaterials = sqliteTable(
  'raw_materials',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull().unique(),
    baseUnit: text('base_unit').notNull(),
    stockQty: real('stock_qty').notNull().default(0),
    safetyThreshold: real('safety_threshold').notNull().default(0),
    avgUnitCostCents: integer('avg_unit_cost_cents').notNull().default(0),
    createdAt: text('created_at').notNull()
  },
  (t) => [index('raw_materials_name_idx').on(t.name)]
)

export const recipes = sqliteTable(
  'recipes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    menuItemId: integer('menu_item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
    materialId: integer('material_id')
      .notNull()
      .references(() => rawMaterials.id, { onDelete: 'cascade' }),
    consumptionQty: real('consumption_qty').notNull()
  },
  (t) => [uniqueIndex('recipe_uq').on(t.menuItemId, t.materialId)]
)

export const purchases = sqliteTable('purchases', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  supplierName: text('supplier_name').notNull(),
  invoiceRef: text('invoice_ref').notNull().default(''),
  totalCents: integer('total_cents').notNull().default(0),
  receivedAt: text('received_at').notNull(),
  receivedBy: text('received_by').notNull().default('system')
})

export const purchaseLines = sqliteTable('purchase_lines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  purchaseId: integer('purchase_id')
    .notNull()
    .references(() => purchases.id, { onDelete: 'cascade' }),
  materialId: integer('material_id')
    .notNull()
    .references(() => rawMaterials.id),
  qty: real('qty').notNull(),
  unitCostCents: integer('unit_cost_cents').notNull(),
  lineCostCents: integer('line_cost_cents').notNull()
})

export const wastage = sqliteTable('wastage', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  materialId: integer('material_id')
    .notNull()
    .references(() => rawMaterials.id),
  qty: real('qty').notNull(),
  reason: text('reason', {
    enum: ['spoilage', 'breakage', 'overproduction', 'expired', 'other']
  }).notNull(),
  costCents: integer('cost_cents').notNull(),
  loggedAt: text('logged_at').notNull(),
  loggedBy: text('logged_by').notNull().default('system')
})

export const stockMovements = sqliteTable(
  'stock_movements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    materialId: integer('material_id')
      .notNull()
      .references(() => rawMaterials.id),
    deltaQty: real('delta_qty').notNull(),
    reason: text('reason', {
      enum: ['purchase', 'sale', 'wastage', 'adjustment', 'recipe_usage']
    }).notNull(),
    refType: text('ref_type'),
    refId: integer('ref_id'),
    note: text('note'),
    createdAt: text('created_at').notNull()
  },
  (t) => [index('stock_movements_material_idx').on(t.materialId, t.createdAt)]
)

/** ---------- Orders ---------- */

export const shifts = sqliteTable('shifts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  openedAt: text('opened_at').notNull(),
  closedAt: text('closed_at'),
  openedBy: text('opened_by').notNull(),
  closedBy: text('closed_by'),
  openingCashCents: integer('opening_cash_cents').notNull().default(0),
  closingCashCents: integer('closing_cash_cents'),
  systemCashCents: integer('system_cash_cents'),
  varianceCents: integer('variance_cents'),
  cashSalesCents: integer('cash_sales_cents'),
  cardSalesCents: integer('card_sales_cents'),
  ordersCount: integer('orders_count'),
  status: text('status', { enum: ['open', 'closed'] }).notNull().default('open')
})

export const orders = sqliteTable(
  'orders',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    orderNumber: text('order_number').notNull(),
    shiftId: integer('shift_id').references(() => shifts.id),
    orderType: text('order_type', { enum: ['takeaway', 'dinein', 'delivery'] })
      .notNull()
      .default('takeaway'),
    status: text('status', { enum: ['paid', 'refunded', 'void'] })
      .notNull()
      .default('paid'),
    subtotalCents: integer('subtotal_cents').notNull(),
    discountPercent: real('discount_percent').notNull().default(0),
    discountCents: integer('discount_cents').notNull().default(0),
    serviceChargeCents: integer('service_charge_cents').notNull().default(0),
    taxCents: integer('tax_cents').notNull().default(0),
    totalCents: integer('total_cents').notNull(),
    costCents: integer('cost_cents').notNull().default(0),
    customerName: text('customer_name'),
    customerPhone: text('customer_phone'),
    cashierId: integer('cashier_id').references(() => users.id),
    cashierName: text('cashier_name').notNull().default('system'),
    createdAt: text('created_at').notNull()
  },
  (t) => [
    uniqueIndex('orders_number_uq').on(t.orderNumber),
    index('orders_created_idx').on(t.createdAt)
  ]
)

export const orderItems = sqliteTable(
  'order_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    menuItemId: integer('menu_item_id')
      .notNull()
      .references(() => menuItems.id),
    variantId: integer('variant_id').references(() => menuItemVariants.id),
    nameSnapshot: text('name_snapshot').notNull(),
    variantSnapshot: text('variant_snapshot'),
    unitPriceCents: integer('unit_price_cents').notNull(),
    qty: integer('qty').notNull(),
    lineSubtotalCents: integer('line_subtotal_cents').notNull(),
    note: text('note'),
    taxEnabled: integer('tax_enabled', { mode: 'boolean' }).notNull().default(true)
  },
  (t) => [index('order_items_order_idx').on(t.orderId)]
)

export const orderPayments = sqliteTable(
  'order_payments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    method: text('method', { enum: ['cash', 'card', 'split'] }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    reference: text('reference')
  },
  (t) => [index('order_payments_order_idx').on(t.orderId)]
)

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})

export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull()
})
