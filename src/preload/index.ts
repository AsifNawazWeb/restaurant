import { contextBridge, ipcRenderer, webFrame } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type {
  CheckoutPayload,
  CheckoutResult,
  MenuCategory,
  MenuItem,
  MenuItemInput,
  OrderSummary,
  PurchaseDraft,
  PurchaseRecord,
  RawMaterial,
  RecipeLine,
  Settings,
  TopSellerRow,
  DashboardKpis,
  HourlySalesPoint,
  DailySalesRow,
  CategoryRevenueRow,
  ItemProfitabilityRow,
  ConsumptionVarianceRow,
  OpenShift,
  ShiftCloseResult,
  User,
  PrinterTestResult,
  XReport,
  WastageEntry,
  LicenseStatus
} from '@shared/types'
import type { IpcResult } from '@shared/ipc'
// IpcResult type comes from @shared/ipc

function invoke<T>(channel: string, payload?: unknown): Promise<IpcResult<T>> {
  return ipcRenderer.invoke(channel, payload)
}

const api = {
  catalog: {
    listCategories: (includeInactive?: boolean) => invoke<MenuCategory[]>('api:catalog:listCategories', includeInactive),
    createCategory: (p: { name: string; sortOrder: number }) => invoke<MenuCategory>('api:catalog:createCategory', p),
    updateCategory: (p: { id: number; name: string; isActive: boolean }) => invoke<void>('api:catalog:updateCategory', p),
    deleteCategory: (id: number) => invoke<void>('api:catalog:deleteCategory', id),
    listItems: (p?: { categoryId?: number | null; search?: string | null }) => invoke<MenuItem[]>('api:catalog:listItems', p),
    saveItem: (p: MenuItemInput) => invoke<number>('api:catalog:saveItem', p),
    setAvailability: (p: { id: number; isAvailable: boolean }) => invoke<void>('api:catalog:setAvailability', p),
    deleteItem: (id: number) => invoke<void>('api:catalog:deleteItem', id),
    getRecipe: (menuItemId: number) => invoke<RecipeLine[]>('api:catalog:getRecipe', menuItemId),
    setRecipe: (p: { menuItemId: number; lines: { materialId: number; consumptionQty: number }[] }) =>
      invoke<void>('api:catalog:setRecipe', p)
  },
  inventory: {
    listMaterials: () => invoke<RawMaterial[]>('api:inventory:listMaterials'),
    saveMaterial: (p: unknown) => invoke<number>('api:inventory:saveMaterial', p),
    deleteMaterial: (id: number) => invoke<void>('api:inventory:deleteMaterial', id),
    adjustStock: (p: { materialId: number; deltaQty: number; note: string }) => invoke<void>('api:inventory:adjustStock', p),
    createPurchase: (p: PurchaseDraft) => invoke<PurchaseRecord>('api:inventory:createPurchase', p),
    listPurchases: (limit?: number) => invoke<PurchaseRecord[]>('api:inventory:listPurchases', limit),
    logWastage: (p: { materialId: number; qty: number; reason: string }) => invoke<WastageEntry>('api:inventory:logWastage', p),
    listWastage: (limit?: number) => invoke<WastageEntry[]>('api:inventory:listWastage', limit),
    listMovements: (p?: { materialId?: number; from?: string; to?: string; reason?: string; limit?: number }) =>
      invoke<unknown[]>('api:inventory:listMovements', p)
  },
  orders: {
    checkout: (p: CheckoutPayload) => invoke<CheckoutResult>('api:orders:checkout', p),
    list: (p?: { from?: string; to?: string; limit?: number }) => invoke<OrderSummary[]>('api:orders:list', p)
  },
  shifts: {
    current: () => invoke<OpenShift | null>('api:shifts:current'),
    open: (openingCashCents: number) => invoke<OpenShift>('api:shifts:open', openingCashCents),
    xReport: () => invoke<XReport | null>('api:shifts:xReport'),
    close: (p: { physicalCashCents: number }) => invoke<ShiftCloseResult & { zReportText: string }>('api:shifts:close', p),
    closedList: (limit?: number) => invoke<unknown[]>('api:shifts:closedList', limit)
  },
  reports: {
    dashboard: () => invoke<DashboardKpis>('api:reports:dashboard'),
    hourly: (isoDate: string) => invoke<HourlySalesPoint[]>('api:reports:hourly', isoDate),
    lowStock: (includeHealthy?: boolean) => invoke<RawMaterial[]>('api:reports:lowStock', includeHealthy),
    topSellers: (days?: number) => invoke<TopSellerRow[]>('api:reports:topSellers', days),
    dailySales: (p: { from: string; to: string }) => invoke<DailySalesRow[]>('api:reports:dailySales', p),
    categorySales: (p: { from: string; to: string }) => invoke<CategoryRevenueRow[]>('api:reports:categorySales', p),
    itemProfitability: (p: { from: string; to: string }) => invoke<ItemProfitabilityRow[]>('api:reports:itemProfitability', p),
    consumptionVariance: (p: { from: string; to: string }) => invoke<ConsumptionVarianceRow[]>('api:reports:consumptionVariance', p)
  },
  users: {
    list: () => invoke<User[]>('api:users:list'),
    create: (p: { name: string; role: string; pin?: string }) => invoke<User>('api:users:create', p),
    setPin: (p: { userId: number; pin: string }) => invoke<void>('api:users:setPin', p),
    loginByPin: (pin: string) => invoke<User | null>('api:users:loginByPin', pin),
    verifyOverride: (pin: string) => invoke<User>('api:users:verifyOverride', pin),
    setRole: (p: { userId: number; role: string }) => invoke<void>('api:users:setRole', p),
    deactivate: (userId: number) => invoke<void>('api:users:deactivate', userId)
  },
  settings: {
    get: () => invoke<Settings>('api:settings:get'),
    save: (patch: Partial<Settings>) => invoke<Settings>('api:settings:save', patch)
  },
  printer: {
    status: () => invoke<PrinterTestResult>('api:printer:status'),
    test: () => invoke<PrinterTestResult>('api:printer:test'),
    kickDrawer: () => invoke<PrinterTestResult>('api:printer:kickDrawer'),
    receipt: (p: { receiptText: string }) => invoke<PrinterTestResult>('api:printer:receipt', p),
    zReport: (p: { zText: string }) => invoke<PrinterTestResult>('api:printer:zReport', p)
  },
  license: {
    status: () => invoke<LicenseStatus>('api:license:status'),
    activate: (p: { key: string }) => invoke<LicenseStatus>('api:license:activate', p),
    importFile: () => invoke<{ ok: boolean; canceled?: boolean; error?: string; status?: LicenseStatus }>('api:license:import'),
    deactivate: () => invoke<LicenseStatus>('api:license:deactivate'),
    onChange(callback: (status: LicenseStatus) => void) {
      const listener = (_event: IpcRendererEvent, status: LicenseStatus) => callback(status)
      ipcRenderer.on('license:changed', listener)
      return () => {
        ipcRenderer.removeListener('license:changed', listener)
      }
    }
  },
  app: {
    version: () => invoke<{ version: string; node: string }>('api:app:version'),
    setZoom: (factor: number) => webFrame.setZoomFactor(factor),
    openExternal: (url: string) => invoke<{ ok: boolean }>('api:system:openExternal', url)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
