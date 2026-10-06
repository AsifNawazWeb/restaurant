import { app, BrowserWindow, Menu, screen } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDatabase, closeDatabase, getSqlite } from './db/connection'
import type { DB } from './db/connection'
import { bootstrapSchema } from './db/migrate'
import { seedIfEmpty } from './db/seed'
import { registerIpcHandlers } from './ipc'
import { getSettings, saveSettings } from './services/settings'
import { getCurrentUser, setCurrentUser } from './session'
import { createLicenseManager } from './license/manager'
import { createLicenseGate } from './license/gate'
import type { LicenseGate } from './license/gate'
import { VENDOR_PUBLIC_KEY } from './license/vendorPublicKey'
import { readLicenseMirror, writeLicenseMirror } from './license/mirror'

// ESM bundles have no __dirname — derive it once
const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.on('uncaughtException', (err) => {
  console.error('[main] uncaught:', err)
})
process.on('unhandledRejection', (err) => {
  console.error('[main] unhandled:', err)
})

let mainWindow: BrowserWindow | null = null
let dbFile = ''
let dbRef: DB | null = null
let licenseGate: LicenseGate | null = null
let safetyBackupDone = false

const licenseBypass = !app.isPackaged && process.env.RESTOPULSE_LICENSE_BYPASS === '1'

const DEFAULT_UI_SCALE = 1.25
const MIN_UI_SCALE = 0.8
const MAX_UI_SCALE = 2.0
let uiScale = DEFAULT_UI_SCALE

function applyZoom(win: BrowserWindow, factor: number): void {
  uiScale = Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, Math.round(factor * 100) / 100))
  win.webContents.setZoomFactor(uiScale)
}

function persistZoom(): void {
  if (!dbRef) return
  saveSettings(dbRef, { uiScale }).catch((err) => console.error('[main] persist zoom failed:', err))
}

function sendLicenseState(): void {
  if (!licenseGate || !mainWindow || mainWindow.isDestroyed()) return
  try {
    mainWindow.webContents.send('license:changed', licenseGate.status())
  } catch {
    // window is going away
  }
}

/**
 * When the license locks, copy the SQLite file once to userData/backups so the
 * customer's data is recoverable even though the app is unusable.
 */
function ensureSafetyBackup(): void {
  try {
    if (!dbRef || !dbFile || !licenseGate || licenseGate.bypass || licenseGate.isUsable() || safetyBackupDone) return
    const dir = path.join(app.getPath('userData'), 'backups')
    fs.mkdirSync(dir, { recursive: true })
    getSqlite().exec('PRAGMA wal_checkpoint(TRUNCATE);')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    fs.copyFileSync(dbFile, path.join(dir, `restopulse-${stamp}.db`))
    safetyBackupDone = true
    console.log(`[main] safety backup written to ${dir}`)
  } catch (err) {
    console.error('[main] safety backup failed:', err)
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}

function createWindow(): void {
  const { workAreaSize } = screen.getPrimaryDisplay()
  const width = Math.max(1280, Math.min(1800, workAreaSize.width - 40))
  const height = Math.max(768, Math.min(1000, workAreaSize.height - 40))

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 1280,
    minHeight: 768,
    show: false,
    title: 'RestoPulse POS',
    autoHideMenuBar: true,
    backgroundColor: '#18181b',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      zoomFactor: uiScale
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => (mainWindow = null))

  // Ctrl/Cmd + '=' / '-' / '0' — app menu is disabled, so wire zoom manually
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const mod = process.platform === 'darwin' ? input.meta : input.control
    if (!mod || !mainWindow) return
    let next: number | null = null
    if (input.key === '=' || input.key === '+') next = uiScale + 0.05
    else if (input.key === '-' || input.key === '_') next = uiScale - 0.05
    else if (input.key === '0') next = DEFAULT_UI_SCALE
    if (next === null) return
    event.preventDefault()
    applyZoom(mainWindow, next)
    persistZoom()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Lock down navigation
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const allowed = process.env.ELECTRON_RENDERER_URL ?? 'file://'
    if (!url.startsWith(allowed)) e.preventDefault()
  })
}

app.whenReady().then(async () => {
  // Database bootstrap (userData when packaged, local data/ in dev)
  const dbDir = app.isPackaged ? app.getPath('userData') : path.join(app.getAppPath(), 'data')
  const { db, file } = openDatabase(dbDir)
  dbFile = file
  bootstrapSchema(getSqlite())
  await seedIfEmpty(db)
  dbRef = db
  uiScale = (await getSettings(db)).uiScale
  console.log(`[main] DB ready: ${file} (uiScale ${uiScale})`)

  // Auto-login default manager (PIN security applied at lock screen)
  const users = await import('./services/users')
  const all = await users.listUsers(db)
  const manager = all.find((u) => u.role === 'manager')
  if (manager) setCurrentUser({ id: manager.id, name: manager.name, role: 'manager', canOverride: true })

  // License bootstrap: read the DB mirror BEFORE creating the manager, then import it
  // so a deleted state file or restored database cannot reset the trial.
  const mirror = readLicenseMirror()
  const license = createLicenseManager({
    userDataDir: app.getPath('userData'),
    publicKeyPem: VENDOR_PUBLIC_KEY,
    persist: (blob) => writeLicenseMirror(blob)
  })
  if (mirror) license.importState(mirror)
  licenseGate = createLicenseGate(license, licenseBypass)
  console.log(`[main] license: ${licenseGate.status().state} (machine ${licenseGate.machineId})`)
  ensureSafetyBackup()

  registerIpcHandlers({
    db,
    getUser: getCurrentUser,
    license: licenseGate,
    notifyLicenseChanged: sendLicenseState,
    getWindow: () => mainWindow
  })

  Menu.setApplicationMenu(null)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  const licenseTimer = setInterval(() => {
    sendLicenseState()
    ensureSafetyBackup()
  }, 60 * 60 * 1000)
  if (typeof licenseTimer.unref === 'function') licenseTimer.unref()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  try {
    getSqlite().exec('PRAGMA wal_checkpoint(TRUNCATE);')
  } catch {
    /* ignore */
  }
  closeDatabase()
  console.log('[main] DB closed (WAL checkpointed)')
})
