import type { OrderType, PaymentMethod, StockStatus, UserRole, WasteReason } from './constants'

export type { OrderType, PaymentMethod, StockStatus, UserRole, WasteReason }

/** ---------- Catalog ---------- */
export interface MenuCategory {
  id: number
  name: string
  sortOrder: number
  isActive: boolean
}

export interface MenuItemVariant {
  id: number
  menuItemId: number
  name: string
  priceCents: number
}

export interface MenuItem {
  id: number
  sku: string
  name: string
  categoryId: number
  categoryName?: string
  imageUrl?: string | null
  taxEnabled: boolean
  isAvailable: boolean
  costCents: number
  variants: MenuItemVariant[]
  minPriceCents: number
}

export interface MenuItemInput {
  id?: number
  sku: string
  name: string
  categoryId: number
  imageUrl?: string | null
  taxEnabled: boolean
  isAvailable: boolean
  variants: { id?: number; name: string; priceCents: number }[]
}

/** ---------- Inventory ---------- */
export interface RawMaterial {
  id: number
  name: string
  baseUnit: string
  stockQty: number
  safetyThreshold: number
  avgUnitCostCents: number
  status: StockStatus
}

export interface RawMaterialInput {
  id?: number
  name: string
  baseUnit: string
  stockQty: number
  safetyThreshold: number
  initialCostCents?: number
}

export interface RecipeLine {
  id: number
  menuItemId: number
  materialId: number
  materialName: string
  materialUnit: string
  consumptionQty: number
}

export interface PurchaseInput {
  materialId: number
  qty: number
  lineCostCents: number
}

export interface PurchaseRecord {
  id: number
  supplierName: string
  invoiceRef: string
  receivedAt: string
  totalCents: number
  lines: { materialId: number; materialName: string; qty: number; unitCostCents: number; lineCostCents: number }[]
}

export interface PurchaseDraft {
  supplierName: string
  invoiceRef: string
  receivedAt?: string
  lines: PurchaseInput[]
}

export interface WastageEntry {
  id: number
  materialId: number
  materialName: string
  qty: number
  reason: WasteReason
  costCents: number
  loggedAt: string
}

/** ---------- Orders ---------- */
export interface CartLine {
  menuItemId: number
  variantId: number | null
  variantName: string | null
  sku: string
  name: string
  unitPriceCents: number
  qty: number
  note: string | null
  taxEnabled: boolean
}

export interface CheckoutPayload {
  lines: CartLine[]
  orderType: OrderType
  discountPercent: number
  serviceChargeEnabled: boolean
  payments: { method: PaymentMethod; amountCents: number; reference?: string }[]
  customerName?: string | null
  customerPhone?: string | null
}

export interface CheckoutResult {
  id: number
  orderNumber: string
  receiptText: string
  totals: TotalsSummary
  lowStockAlerts: { materialId: number; materialName: string; stockQty: number; unit: string; threshold: number }[]
}

export interface TotalsSummary {
  subtotalCents: number
  discountCents: number
  taxableBaseCents: number
  serviceChargeCents: number
  taxCents: number
  totalCents: number
  paidCents: number
  changeCents: number
}

export interface OrderSummary {
  id: number
  orderNumber: string
  orderType: OrderType
  status: string
  subtotalCents: number
  discountCents: number
  serviceChargeCents: number
  taxCents: number
  totalCents: number
  createdAt: string
  cashierName: string
  itemsCount: number
}

/** ---------- Shifts ---------- */
export interface OpenShift {
  id: number
  openedAt: string
  openingCashCents: number
  cashierName: string
}

export interface ShiftCloseInput {
  physicalCashCents: number
}

export interface ShiftCloseResult {
  id: number
  closingCashCents: number
  varianceCents: number
  systemCashCents: number
  cashSalesCents: number
  cardSalesCents: number
  ordersCount: number
}

/** ---------- Shifts (extended) ---------- */
export interface XReport {
  shift: OpenShift
  ordersCount: number
  grossSalesCents: number
  discountCents: number
  serviceChargeCents: number
  taxCents: number
  netSalesCents: number
  cashSalesCents: number
  cardSalesCents: number
  systemCashCents: number
  unassignedOrders: number
}

/** ---------- Reports ---------- */
export interface DailySalesRow {
  day: string
  ordersCount: number
  revenueCents: number
}

export interface CategoryRevenueRow {
  categoryId: number
  categoryName: string
  revenueCents: number
  ordersCount: number
}

export interface ItemProfitabilityRow {
  menuItemId: number
  name: string
  qtySold: number
  revenueCents: number
  costCents: number
  marginPct: number
}

export interface ConsumptionVarianceRow {
  materialId: number
  materialName: string
  unit: string
  expectedQty: number
  actualQty: number
  varianceQty: number
  varianceCostCents: number
}

/** ---------- Dashboard ---------- */
export interface DashboardKpis {
  todayRevenueCents: number
  todayOrders: number
  avgOrderValueCents: number
  netProfitCents: number
  revenueChangePct: number | null
  ordersChangePct: number | null
  aovChangePct: number | null
  profitChangePct: number | null
  revenueSpark: number[]
  ordersSpark: number[]
}

export interface HourlySalesPoint {
  hour: number
  revenueCents: number
  ordersCount: number
}

export interface TopSellerRow {
  menuItemId: number
  name: string
  variantName: string | null
  qtySold: number
  revenueCents: number
}

/** ---------- Settings & users ---------- */
export interface Settings {
  restaurantName: string
  address: string
  phone: string
  vatRegistration: string
  receiptHeader: string
  receiptFooter: string
  defaultVatPercent: number
  serviceChargePercent: number
  serviceChargeEnabled: boolean
  quickDiscounts: number[]
  printerType: string
  printerTarget: string
  defaultPrinterName: string
  paperWidthMm: 58 | 80
  autoDrawerKick: boolean
  uiScale: number
}

export interface User {
  id: number
  name: string
  role: UserRole
  pinHash?: string
  hasPin?: boolean
  canOverride: boolean
}

export interface PrinterTestResult {
  ok: boolean
  message: string
}

export interface PrinterInfo {
  name: string
  displayName: string
  isDefault: boolean
}

/** ---------- License ---------- */
export type LicenseState = 'licensed' | 'trial' | 'grace' | 'trial_expired' | 'expired' | 'invalid' | 'tampered'

export interface LicenseStatus {
  machineId: string
  appId: string
  state: LicenseState
  reason: string | null
  customer: string | null
  licenseId: string | null
  expiresAt: string | null
  daysLeft: number | null
  trialDaysLeft: number
  trialEndsAt: string
  graceDaysLeft: number
  graceEndsAt: string
}
