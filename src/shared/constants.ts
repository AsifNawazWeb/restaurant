export const APP_NAME = 'RestoPulse POS'
export const CURRENCY = {
  code: 'PKR',
  symbol: 'Rs.'
} as const

export const DB_VERSION = 1

export type OrderType = 'takeaway' | 'dinein' | 'delivery'
export type PaymentMethod = 'cash' | 'card' | 'split'
export type StockStatus = 'healthy' | 'low' | 'critical'
export type WasteReason = 'spoilage' | 'breakage' | 'overproduction' | 'expired' | 'other'
export type UserRole = 'cashier' | 'manager'
