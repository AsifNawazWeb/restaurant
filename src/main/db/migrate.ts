import type { DatabaseSync } from 'node:sqlite'

/**
 * Idempotent schema bootstrap executed at app start.
 * Raw DDL keeps the runtime self-contained (no migration files to ship).
 * Version tracked in app_meta so upgrade scripts can layer on top later.
 */
const SCHEMA_VERSION = 1

const DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'cashier',
    pin_hash TEXT,
    can_override INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS menu_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1
  );`,
  `CREATE TABLE IF NOT EXISTS menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES menu_categories(id),
    image_url TEXT,
    tax_enabled INTEGER NOT NULL DEFAULT 1,
    is_available INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS menu_items_sku_uq ON menu_items (sku);`,
  `CREATE TABLE IF NOT EXISTS menu_item_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    UNIQUE (menu_item_id, name)
  );`,
  `CREATE TABLE IF NOT EXISTS raw_materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    base_unit TEXT NOT NULL,
    stock_qty REAL NOT NULL DEFAULT 0,
    safety_threshold REAL NOT NULL DEFAULT 0,
    avg_unit_cost_cents INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS raw_materials_name_idx ON raw_materials (name);`,
  `CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    material_id INTEGER NOT NULL REFERENCES raw_materials(id) ON DELETE CASCADE,
    consumption_qty REAL NOT NULL,
    UNIQUE (menu_item_id, material_id)
  );`,
  `CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_name TEXT NOT NULL,
    invoice_ref TEXT NOT NULL DEFAULT '',
    total_cents INTEGER NOT NULL DEFAULT 0,
    received_at TEXT NOT NULL,
    received_by TEXT NOT NULL DEFAULT 'system'
  );`,
  `CREATE TABLE IF NOT EXISTS purchase_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
    material_id INTEGER NOT NULL REFERENCES raw_materials(id),
    qty REAL NOT NULL,
    unit_cost_cents INTEGER NOT NULL,
    line_cost_cents INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS wastage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL REFERENCES raw_materials(id),
    qty REAL NOT NULL,
    reason TEXT NOT NULL,
    cost_cents INTEGER NOT NULL,
    logged_at TEXT NOT NULL,
    logged_by TEXT NOT NULL DEFAULT 'system'
  );`,
  `CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL REFERENCES raw_materials(id),
    delta_qty REAL NOT NULL,
    reason TEXT NOT NULL,
    ref_type TEXT,
    ref_id INTEGER,
    note TEXT,
    created_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS stock_movements_material_idx ON stock_movements (material_id, created_at);`,
  `CREATE TABLE IF NOT EXISTS shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    opened_at TEXT NOT NULL,
    closed_at TEXT,
    opened_by TEXT NOT NULL,
    closed_by TEXT,
    opening_cash_cents INTEGER NOT NULL DEFAULT 0,
    closing_cash_cents INTEGER,
    system_cash_cents INTEGER,
    variance_cents INTEGER,
    cash_sales_cents INTEGER,
    card_sales_cents INTEGER,
    orders_count INTEGER,
    status TEXT NOT NULL DEFAULT 'open'
  );`,
  `CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT NOT NULL,
    shift_id INTEGER REFERENCES shifts(id),
    order_type TEXT NOT NULL DEFAULT 'takeaway',
    status TEXT NOT NULL DEFAULT 'paid',
    subtotal_cents INTEGER NOT NULL,
    discount_percent REAL NOT NULL DEFAULT 0,
    discount_cents INTEGER NOT NULL DEFAULT 0,
    service_charge_cents INTEGER NOT NULL DEFAULT 0,
    tax_cents INTEGER NOT NULL DEFAULT 0,
    total_cents INTEGER NOT NULL,
    cost_cents INTEGER NOT NULL DEFAULT 0,
    customer_name TEXT,
    customer_phone TEXT,
    cashier_id INTEGER REFERENCES users(id),
    cashier_name TEXT NOT NULL DEFAULT 'system',
    created_at TEXT NOT NULL
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS orders_number_uq ON orders (order_number);`,
  `CREATE INDEX IF NOT EXISTS orders_created_idx ON orders (created_at);`,
  `CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
    variant_id INTEGER REFERENCES menu_item_variants(id),
    name_snapshot TEXT NOT NULL,
    variant_snapshot TEXT,
    unit_price_cents INTEGER NOT NULL,
    qty INTEGER NOT NULL,
    line_subtotal_cents INTEGER NOT NULL,
    note TEXT,
    tax_enabled INTEGER NOT NULL DEFAULT 1
  );`,
  `CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id);`,
  `CREATE TABLE IF NOT EXISTS order_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    method TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    reference TEXT
  );`,
  `CREATE INDEX IF NOT EXISTS order_payments_order_idx ON order_payments (order_id);`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );`
]

/** Applies DDL through the raw node:sqlite driver; safe to re-run. */
export function bootstrapSchema(sqlite: DatabaseSync): void {
  for (const stmt of DDL) sqlite.exec(stmt)
  sqlite
    .prepare(
      `INSERT INTO app_meta (key, value) VALUES ('schema_version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(String(SCHEMA_VERSION))
}
