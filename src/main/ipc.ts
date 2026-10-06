import { dialog, ipcMain, shell } from 'electron'
import type { BrowserWindow, OpenDialogOptions } from 'electron'
import fs from 'node:fs'
import type { DB } from './db/connection'
import * as catalog from './services/catalog'
import * as inventory from './services/inventory'
import * as ordersSvc from './services/orders'
import * as shifts from './services/shifts'
import * as reports from './services/reports'
import * as usersSvc from './services/users'
import * as printerSvc from './services/printer'
import * as settingsSvc from './services/settings'
import type { CurrentUser } from './session'
import type { LicenseGate } from './license/gate'

/**
 * Typed IPC registry. Channel naming: `api:<domain>:<action>`.
 * Handlers receive (db, currentUser, payload) and return plain JSON.
 */
// payload is validated inside each service; channel boundary keeps it loose
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (db: DB, user: CurrentUser, payload: any) => Promise<unknown> | unknown

export interface IpcDeps {
  db: DB
  getUser: () => CurrentUser
  license: LicenseGate
  notifyLicenseChanged: () => void
  getWindow: () => BrowserWindow | null
}

/** Channels reachable without a usable license (activation flow + vendor links). */
const PUBLIC_CHANNELS = new Set(['license:status', 'license:activate', 'license:import', 'system:openExternal'])

export function registerIpcHandlers(deps: IpcDeps): void {
  const { db, getUser, license, notifyLicenseChanged, getWindow } = deps

  const handlers: Record<string, Handler> = {
    // license
    'license:status': () => license.status(),
    'license:activate': (_d, _u, p: { key: string }) => {
      const status = license.activate(p.key)
      notifyLicenseChanged()
      return status
    },
    'license:import': async () => {
      const win = getWindow()
      const options: OpenDialogOptions = {
        title: 'Select License File',
        properties: ['openFile'],
        filters: [
          { name: 'License Files', extensions: ['lic', 'key', 'txt'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      }
      const { canceled, filePaths } = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
      if (canceled || !filePaths[0]) return { ok: false, canceled: true }
      try {
        const status = license.activate(fs.readFileSync(filePaths[0], 'utf8'))
        notifyLicenseChanged()
        return { ok: true, status }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Could not read the license file' }
      }
    },
    'license:deactivate': () => {
      const status = license.deactivate()
      notifyLicenseChanged()
      return status
    },

    // catalog
    'catalog:listCategories': (d, _u, includeInactive: boolean) => catalog.listCategories(d, includeInactive),
    'catalog:createCategory': (d, _u, p: { name: string; sortOrder: number }) => catalog.createCategory(d, p.name, p.sortOrder),
    'catalog:updateCategory': (d, _u, p: { id: number; name: string; isActive: boolean }) => catalog.updateCategory(d, p.id, p.name, p.isActive),
    'catalog:deleteCategory': (d, _u, id: number) => catalog.deleteCategory(d, id),
    'catalog:listItems': (d, _u, p: { categoryId?: number | null; search?: string | null }) => catalog.listMenuItems(d, p),
    'catalog:saveItem': (d, _u, p: unknown) => catalog.saveMenuItem(d, p as never),
    'catalog:setAvailability': (d, _u, p: { id: number; isAvailable: boolean }) => catalog.setItemAvailability(d, p.id, p.isAvailable),
    'catalog:deleteItem': (d, _u, id: number) => catalog.deleteMenuItem(d, id),
    'catalog:getRecipe': (d, _u, itemId: number) => catalog.getRecipe(d, itemId),
    'catalog:setRecipe': (d, _u, p: { menuItemId: number; lines: { materialId: number; consumptionQty: number }[] }) =>
      catalog.setRecipe(d, p.menuItemId, p.lines),

    // inventory
    'inventory:listMaterials': (d) => inventory.listMaterials(d),
    'inventory:saveMaterial': (d, _u, p: unknown) => inventory.saveMaterial(d, p as never),
    'inventory:deleteMaterial': (d, _u, id: number) => inventory.deleteMaterial(d, id),
    'inventory:adjustStock': (d, u, p: { materialId: number; deltaQty: number; note: string }) =>
      inventory.adjustStock(d, p.materialId, p.deltaQty, `${p.note} (by ${u.name})`),
    'inventory:createPurchase': (d, u, p: unknown) => inventory.createPurchase(d, p as never, u.name),
    'inventory:listPurchases': (d, _u, limit?: number) => inventory.listPurchases(d, limit),
    'inventory:logWastage': (d, u, p: { materialId: number; qty: number; reason: string }) =>
      inventory.logWastage(d, p.materialId, p.qty, p.reason as never, u.name),
    'inventory:listWastage': (d, _u, limit?: number) => inventory.listWastage(d, limit),
    'inventory:listMovements': (d, _u, p: unknown) => inventory.listMovements(d, (p ?? {}) as never),

    // orders
    'orders:checkout': (d, u, p: unknown) => ordersSvc.checkout(d, p as never, u.id, u.name),
    'orders:list': (d, _u, p: { from?: string; to?: string; limit?: number }) => ordersSvc.listOrders(d, p),

    // shifts
    'shifts:current': (d) => shifts.getCurrentShift(d),
    'shifts:open': (d, u, openingCashCents: number) => shifts.openShift(d, openingCashCents, u.name),
    'shifts:xReport': (d) => shifts.getXReport(d),
    'shifts:close': (d, u, p: { physicalCashCents: number }) => shifts.closeShift(d, p, u.name),
    'shifts:closedList': (d, _u, limit?: number) => shifts.listClosedShifts(d, limit),

    // reports
    'reports:dashboard': (d) => reports.getDashboardKpis(d),
    'reports:hourly': (d, _u, isoDate: string) => reports.getHourlySales(d, new Date(isoDate)),
    'reports:lowStock': (d, _u, includeHealthy?: boolean) => reports.getLowStock(d, includeHealthy),
    'reports:topSellers': (d, _u, days?: number) => reports.getTopSellers(d, days),
    'reports:dailySales': (d, _u, p: { from: string; to: string }) => reports.getDailySales(d, p.from, p.to),
    'reports:categorySales': (d, _u, p: { from: string; to: string }) => reports.getCategorySales(d, p.from, p.to),
    'reports:itemProfitability': (d, _u, p: { from: string; to: string }) => reports.getItemProfitability(d, p.from, p.to),
    'reports:consumptionVariance': (d, _u, p: { from: string; to: string }) => reports.getConsumptionVariance(d, p.from, p.to),

    // users & auth
    'users:list': (d) => usersSvc.listUsers(d),
    'users:create': (d, _u, p: { name: string; role: string; pin?: string }) =>
      usersSvc.createUser(d, p.name, p.role as never, p.pin),
    'users:setPin': (d, _u, p: { userId: number; pin: string }) => usersSvc.setUserPin(d, p.userId, p.pin),
    'users:loginByPin': (d, _u, pin: string) => usersSvc.loginByPin(d, pin),
    'users:verifyOverride': (d, _u, pin: string) => usersSvc.verifyManagerOverride(d, pin),
    'users:setRole': (d, _u, p: { userId: number; role: string }) => usersSvc.updateUserRole(d, p.userId, p.role as never),
    'users:deactivate': (d, _u, userId: number) => usersSvc.deactivateUser(d, userId),

    // settings
    'settings:get': (d) => settingsSvc.getSettings(d),
    'settings:save': (d, _u, patch: unknown) => settingsSvc.saveSettings(d, patch as never),

    // printer
    'printer:status': (d) => printerSvc.getPrinterStatus(d, getWindow()),
    'printer:printers': () => printerSvc.getSystemPrinters(getWindow()),
    'printer:test': (d) => printerSvc.testPrint(d),
    'printer:kickDrawer': (d) => printerSvc.testDrawerKick(d),
    'printer:receipt': (d, _u, p: { receiptText: string }) => printerSvc.printReceipt(d, p.receiptText),
    'printer:zReport': (d, _u, p: { zText: string }) => printerSvc.printZReport(d, p.zText),

    // app
    'app:version': () => ({ version: process.env.npm_package_version ?? '1.0.0', node: process.versions.node }),
    'system:openExternal': (_d, _u, url: string) => {
      const target = String(url || '')
      if (!/^https:\/\//i.test(target)) throw new Error('Only https links are allowed')
      shell.openExternal(target)
      return { ok: true }
    }
  }

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(`api:${channel}`, async (_event, payload: unknown) => {
      try {
        if (!PUBLIC_CHANNELS.has(channel)) license.requireUsable()
        const user = getUser()
        return { ok: true, data: await handler(db, user, payload) }
      } catch (err) {
        return { ok: false, error: (err as Error).message ?? 'Unknown error' }
      }
    })
  }
}
