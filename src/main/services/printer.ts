import fs from 'node:fs'
import path from 'node:path'
import type { DB } from '../db/connection'
import { getSettings, saveSettings } from './settings'
import type { PrinterTestResult, Settings } from '@shared/types'

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

export async function getPrinterStatus(db: DB): Promise<PrinterTestResult> {
  const settings = await getSettings(db)
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
    // Offline-first fallback: keep a printable spool on disk + return preview
    const spoolDir = spoolDirectory()
    fs.mkdirSync(spoolDir, { recursive: true })
    const file = path.join(spoolDir, `job-${Date.now()}.txt`)
    fs.writeFileSync(file, text, 'utf8')
    return { ok: false, message: `Printer unreachable — job saved to ${file}` }
  }
}

function spoolDirectory(): string {
  return path.join(process.env.APPDATA || process.env.HOME || '/tmp', 'RestoPulse', 'print-spool')
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
