import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

export function readOsMachineId(): string {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('reg.exe', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], {
        windowsHide: true,
        encoding: 'utf8'
      })
      const match = out.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i)
      if (match) return match[1].trim()
    } else if (process.platform === 'darwin') {
      const out = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8' })
      const match = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/)
      if (match) return match[1].trim()
    } else {
      for (const file of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
        try {
          const value = fs.readFileSync(file, 'utf8').trim()
          if (value) return value
        } catch {
          // try the next source
        }
      }
    }
  } catch {
    // fall back to a host-based identifier below
  }
  return `${os.hostname()}|${os.platform()}|${os.arch()}`
}

export function getInstallId(userDataDir: string): string {
  const file = path.join(userDataDir, 'install.id')
  try {
    const existing = fs.readFileSync(file, 'utf8').trim()
    if (existing) return existing
  } catch {
    // create one below
  }
  const id = crypto.randomUUID()
  try {
    fs.mkdirSync(userDataDir, { recursive: true })
    fs.writeFileSync(file, id, { mode: 0o600 })
  } catch {
    // keep the in-memory id for this session
  }
  return id
}

export function formatMachineId(raw: string, groups = 4): string {
  const hex = String(raw || '').toUpperCase()
  return hex.slice(0, groups * 4).replace(/(.{4})(?=.)/g, '$1-')
}

export function rawFingerprint(userDataDir: string): string {
  const installId = getInstallId(userDataDir)
  return crypto.createHash('sha256').update(`${readOsMachineId()}|${installId}`).digest('hex')
}

export function machineId(userDataDir: string): string {
  return formatMachineId(rawFingerprint(userDataDir))
}
