import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow } from 'electron'
import type { DB } from '../db/connection'
import { getSettings, saveSettings } from './settings'
import type { PrinterInfo, PrinterTestResult, Settings } from '@shared/types'

/**
 * ESC/POS printing via node-thermal-printer.
 * Graceful degradation: if no printer is reachable, every print call returns
 * the document text so the UI can show a preview (offline-first guarantee).
 */

interface PrinterProfile {
  type: string
  interface: string
  width: number
}

function profileFromSettings(settings: Settings): PrinterProfile {
  const target = settings.printerTarget?.trim() || '192.168.1.87'
  let iface: string
  if (settings.printerType === 'network') iface = `tcp://${target}`
  else if (settings.printerType === 'usb') iface = `printer:${target}`
  else if (settings.printerType === 'serial') iface = target // COMx or /dev/ttyUSB0
  else iface = target // file path
  return {
    type: settings.printerType === 'star' ? 'star' : 'epson',
    interface: iface,
    width: settings.paperWidthMm
  }
}

export async function getPrinterStatus(db: DB, win: BrowserWindow | null = null): Promise<PrinterTestResult> {
  const settings = await getSettings(db)
  if (settings.printerType === 'system') {
    const printers = await getSystemPrinters(win)
    if (printers.length === 0) return { ok: false, message: 'No printers installed on this system' }
    const requested = settings.defaultPrinterName.trim()
    if (!requested) {
      const fallback = printers.find((p) => p.isDefault)
      return { ok: true, message: `Connected (system default${fallback ? `: ${fallback.displayName}` : ''})` }
    }
    const found = printers.find((p) => p.name === requested)
    return found
      ? { ok: true, message: `Connected (system: ${found.displayName})` }
      : { ok: false, message: `Printer "${requested}" is not installed` }
  }
  const profile = profileFromSettings(settings)
  try {
    const { ThermalPrinter } = await import('node-thermal-printer')
    const printer = new ThermalPrinter({
      type: profile.type as never,
      interface: profile.interface,
      characterSet: 'PC437_USA' as never,
      removeSpecialCharacters: false,
      lineCharacter: '=',
      options: { timeout: 2500 }
    })
    const connected = await printer.isPrinterConnected()
    return connected
      ? { ok: true, message: `Connected (${profile.type.toUpperCase()} @ ${profile.interface})` }
      : { ok: false, message: `No response from ${profile.interface}` }
  } catch (err) {
    return { ok: false, message: `Printer error: ${(err as Error).message}` }
  }
}

async function printText(db: DB, text: string, kickDrawer = false): Promise<PrinterTestResult> {
  const settings = await getSettings(db)
  if (settings.printerType === 'system') return printViaSystem(db, text)
  const profile = profileFromSettings(settings)
  try {
    const { ThermalPrinter } = await import('node-thermal-printer')
    const printer = new ThermalPrinter({
      type: profile.type as never,
      interface: profile.interface,
      characterSet: 'PC437_USA' as never,
      removeSpecialCharacters: false,
      lineCharacter: '=',
      options: { timeout: 4000 }
    })
    printer.alignCenter()
    for (const line of text.split('\n')) {
      printer.println(line)
    }
    printer.cut()
    if (kickDrawer && settings.autoDrawerKick) printer.openCashDrawer()
    const executed = await printer.execute()
    if (executed) return { ok: true, message: 'Printed' }
    return { ok: false, message: 'Printer accepted job but did not confirm', }
  } catch {
    return spoolJob(text, 'Printer unreachable')
  }
}

/** Offline-first fallback: keep a printable spool on disk + return preview. */
function spoolJob(text: string, reason: string): PrinterTestResult {
  const spoolDir = spoolDirectory()
  fs.mkdirSync(spoolDir, { recursive: true })
  const file = path.join(spoolDir, `job-${Date.now()}.txt`)
  fs.writeFileSync(file, text, 'utf8')
  return { ok: false, message: `${reason} — job saved to ${file}` }
}

function spoolDirectory(): string {
  return path.join(process.env.APPDATA || process.env.HOME || '/tmp', 'RestoPulse', 'print-spool')
}

/** List printers installed in the operating system (Chromium view). */
export async function getSystemPrinters(win: BrowserWindow | null = null): Promise<PrinterInfo[]> {
  let target = win && !win.isDestroyed() ? win : null
  let owned = false
  try {
    if (!target) {
      target = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } })
      owned = true
    }
    const printers = await target.webContents.getPrintersAsync()
    return printers.map((p) => {
      const raw = p as unknown as { isDefault?: boolean; options?: Record<string, string> }
      return {
        name: p.name,
        displayName: p.displayName || p.name,
        isDefault: raw.isDefault === true || raw.options?.['printer-is-default'] === 'true'
      }
    })
  } catch {
    return []
  } finally {
    if (owned && target && !target.isDestroyed()) target.destroy()
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function receiptPageHtml(text: string, widthMm: 58 | 80): string {
  const fontSize = widthMm === 58 ? 9.5 : 11
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html, body { margin: 0; padding: 0; background: #fff; }
pre { margin: 0; padding: 0; font-family: 'Courier New', ui-monospace, monospace; font-size: ${fontSize}px; line-height: 1.35; white-space: pre; color: #000; }
</style></head><body><pre>${escapeHtml(text)}</pre></body></html>`
}

/**
 * Silent receipt printing through the OS printer driver (Chromium print pipeline).
 * Same offline-first guarantee as ESC/POS: failed jobs are spooled to disk.
 */
async function printViaSystem(db: DB, text: string): Promise<PrinterTestResult> {
  const settings = await getSettings(db)
  const widthMm: 58 | 80 = settings.paperWidthMm === 58 ? 58 : 80
  const requested = settings.defaultPrinterName.trim()
  const win = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true }
  })
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(receiptPageHtml(text, widthMm)))
    const options: Electron.WebContentsPrintOptions = {
      silent: true,
      printBackground: true,
      margins: { marginType: 'none' },
      pageSize: { width: widthMm * 1000, height: 297000 }
    }
    if (requested) {
      const printers = await win.webContents.getPrintersAsync()
      if (printers.some((p) => p.name === requested)) options.deviceName = requested
    }
    const result = await Promise.race([
      new Promise<PrinterTestResult>((resolve) => {
        win.webContents.print(options, (ok, failureReason) => {
          resolve(
            ok
              ? { ok: true, message: requested ? `Printed via ${requested}` : 'Printed via system default printer' }
              : { ok: false, message: failureReason || 'Printing failed' }
          )
        })
      }),
      new Promise<PrinterTestResult>((resolve) => {
        setTimeout(() => resolve({ ok: false, message: 'Printer did not respond within 45 seconds' }), 45000)
      })
    ])
    return result.ok ? result : spoolJob(text, result.message)
  } catch (err) {
    return spoolJob(text, `Printer unreachable (${(err as Error).message})`)
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

export async function printReceipt(db: DB, receiptText: string, kickDrawer = false): Promise<PrinterTestResult> {
  return printText(db, receiptText, kickDrawer)
}

export async function printZReport(db: DB, zText: string): Promise<PrinterTestResult> {
  return printText(db, zText)
}

export async function testPrint(db: DB): Promise<PrinterTestResult> {
  const settings = await getSettings(db)
  const text = [
    '=== PRINTER TEST ===',
    settings.restaurantName,
    `Width: ${settings.paperWidthMm}mm`,
    '--------------------------------',
    'Rs. 1,234   <- PKR sample',
    '--------------------------------',
    new Date().toISOString()
  ].join('\n')
  return printText(db, text)
}

export async function testDrawerKick(db: DB): Promise<PrinterTestResult> {
  const settings = await getSettings(db)
  if (settings.printerType === 'system') {
    return { ok: false, message: 'Cash drawer kick requires an ESC/POS connection (Network / USB / Serial)' }
  }
  try {
    const profile = profileFromSettings(settings)
    const { ThermalPrinter } = await import('node-thermal-printer')
    const printer = new ThermalPrinter({
      type: profile.type as never,
      interface: profile.interface,
      characterSet: 'PC437_USA' as never,
      options: { timeout: 3000 }
    })
    printer.openCashDrawer()
    await printer.execute()
    return { ok: true, message: 'Cash drawer kicked' }
  } catch (err) {
    return { ok: false, message: `Drawer kick failed: ${(err as Error).message}` }
  }
}

export async function savePrinterSettings(db: DB, patch: Partial<Settings>): Promise<Settings> {
  return saveSettings(db, patch)
}
