#!/usr/bin/env node
/* Vendor-only license key generator for RestoPulse POS. Never ship this file with the app. */
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const KEY_PREFIX = 'RPP1-'
const DEFAULT_DIR = path.join(__dirname, 'keys')
const PRIVATE_FILE = 'vendor-private.pem'
const PUBLIC_FILE = 'vendor-public.pem'

function toB64url(input) {
  return Buffer.from(input).toString('base64url')
}

function fromB64url(str) {
  return Buffer.from(String(str), 'base64url')
}

function encodePayload(payload) {
  return toB64url(JSON.stringify(payload))
}

function decodePayload(payloadEncoded) {
  try {
    return JSON.parse(fromB64url(payloadEncoded).toString('utf8'))
  } catch {
    throw new Error('License key payload is corrupted')
  }
}

function makeKey(payload, privateKey) {
  const encoded = encodePayload(payload)
  return `${KEY_PREFIX}${encoded}.${toB64url(crypto.sign(null, Buffer.from(encoded), privateKey))}`
}

function parseKey(key) {
  const trimmed = String(key || '').replace(/\s+/g, '')
  const start = trimmed.indexOf(KEY_PREFIX)
  if (start === -1) throw new Error('License key format is not recognized')
  const body = trimmed.slice(start + KEY_PREFIX.length)
  const dot = body.lastIndexOf('.')
  if (dot <= 0 || dot === body.length - 1) throw new Error('License key format is not recognized')
  return { payloadEncoded: body.slice(0, dot), signature: body.slice(dot + 1) }
}

function verifyKey(key, publicKeyPem) {
  const { payloadEncoded, signature } = parseKey(key)
  let valid = false
  try {
    valid = crypto.verify(null, Buffer.from(payloadEncoded), crypto.createPublicKey(publicKeyPem), fromB64url(signature))
  } catch {
    valid = false
  }
  if (!valid) throw new Error('License key signature is not valid')
  const payload = decodePayload(payloadEncoded)
  if (!payload || typeof payload !== 'object') throw new Error('License key payload is corrupted')
  return payload
}

function extractKey(text) {
  const raw = String(text || '').trim()
  const start = raw.indexOf(KEY_PREFIX)
  if (start === -1) return raw
  return raw.slice(start).split(/\s/)[0]
}

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token.startsWith('--')) {
      const name = token.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        args[name] = next
        i++
      } else {
        args[name] = true
      }
    } else {
      args._.push(token)
    }
  }
  return args
}

function askHidden(query) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error('No interactive terminal — set RPP_KEY_PASSPHRASE instead'))
      return
    }
    const stdin = process.stdin
    const stdout = process.stdout
    let input = ''
    stdout.write(query)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.removeListener('data', onData)
          stdout.write('\n')
          resolve(input)
          return
        }
        if (ch === '\u0003') process.exit(130)
        if (ch === '\u007f' || ch === '\b') input = input.slice(0, -1)
        else input += ch
      }
    }
    stdin.on('data', onData)
  })
}

async function resolvePassphrase({ create = false } = {}) {
  if (Object.prototype.hasOwnProperty.call(process.env, 'RPP_KEY_PASSPHRASE')) return process.env.RPP_KEY_PASSPHRASE
  const first = await askHidden(create ? 'New private key passphrase (empty = no encryption): ' : 'Private key passphrase: ')
  if (!create) return first
  const second = await askHidden('Confirm passphrase: ')
  if (first !== second) throw new Error('Passphrases do not match')
  return first
}

function loadPrivateKey(file, passphrase) {
  const pem = fs.readFileSync(file, 'utf8')
  return crypto.createPrivateKey(passphrase ? { key: pem, passphrase } : pem)
}

function loadPublicKeyPem(dir) {
  const file = path.join(dir, PUBLIC_FILE)
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8')
  return null
}

async function generate(args) {
  const dir = path.resolve(args.dir || DEFAULT_DIR)
  const privatePath = path.join(dir, PRIVATE_FILE)
  fs.mkdirSync(dir, { recursive: true })
  if (fs.existsSync(privatePath) && !args.force) {
    console.error(`Private key already exists at ${privatePath}. Re-run with --force to replace it (this invalidates all previously issued keys).`)
    process.exit(1)
  }
  const passphrase = await resolvePassphrase({ create: true })
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  const exportOptions = { type: 'pkcs8', format: 'pem' }
  if (passphrase) {
    exportOptions.cipher = 'aes-256-cbc'
    exportOptions.passphrase = passphrase
  }
  const privatePem = privateKey.export(exportOptions)
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' })
  fs.writeFileSync(privatePath, privatePem, { mode: 0o600 })
  fs.writeFileSync(path.join(dir, PUBLIC_FILE), publicPem, { mode: 0o644 })
  console.log(`Private key: ${privatePath}`)
  console.log(`Public key:  ${path.join(dir, PUBLIC_FILE)}`)
  console.log('\nEmbed this public key in src/main/license/vendorPublicKey.ts:\n')
  console.log(`export const VENDOR_PUBLIC_KEY = ${JSON.stringify(publicPem)}\n`)
}

function normalizeMachineId(value) {
  const hex = String(value || '').toUpperCase().replace(/[^0-9A-F]/g, '')
  if (hex.length !== 16) return null
  return hex.replace(/(.{4})(?=.)/g, '$1-')
}

async function issue(args) {
  const dir = path.resolve(args.dir || DEFAULT_DIR)
  const privatePath = path.join(dir, PRIVATE_FILE)
  if (!fs.existsSync(privatePath)) throw new Error(`Private key not found at ${privatePath}. Run "keygen generate" first.`)
  const machine = normalizeMachineId(args.machine)
  if (!machine) {
    throw new Error('--machine must be the 16-character Machine ID shown in the app, e.g. 1A2B-3C4D-5E6F-7890')
  }
  const year = new Date().getFullYear()
  const serial = crypto.randomBytes(2).toString('hex').toUpperCase()
  const payload = {
    v: 1,
    licenseId: args['license-id'] || args.id || `LIC-${year}-${serial}`,
    customer: args.customer || 'Valued Customer',
    machine,
    issuedAt: new Date().toISOString(),
    expiresAt: null,
    features: args.features ? String(args.features).split(',').map((f) => f.trim()).filter(Boolean) : ['all']
  }
  if (args.expires) {
    const parts = String(args.expires).split('-').map(Number)
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) throw new Error('--expires must be YYYY-MM-DD')
    payload.expiresAt = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59).toISOString()
  }
  const passphrase = await resolvePassphrase()
  const privateKey = loadPrivateKey(privatePath, passphrase)
  const key = makeKey(payload, privateKey)
  console.log(`\nLicense key for ${payload.customer} (${machine}):\n`)
  console.log(key)
  console.log('')
  console.log(JSON.stringify(payload, null, 2))
  if (args.out) {
    fs.writeFileSync(path.resolve(args.out), `${key}\n`, 'utf8')
    console.log(`\nSaved to ${path.resolve(args.out)}`)
  }
}

function inspect(args) {
  const dir = path.resolve(args.dir || DEFAULT_DIR)
  const source = args.key ? String(args.key) : args.file ? fs.readFileSync(path.resolve(args.file), 'utf8') : ''
  if (!source) throw new Error('Provide --key <license key> or --file <path.lic>')
  const publicPem = loadPublicKeyPem(dir)
  if (!publicPem) {
    const privatePath = path.join(dir, PRIVATE_FILE)
    if (!fs.existsSync(privatePath)) throw new Error('No vendor public key found — run "keygen generate" first.')
    const passphrase = process.env.RPP_KEY_PASSPHRASE || ''
    const privateKey = loadPrivateKey(privatePath, passphrase)
    const derived = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' })
    const payload = verifyKey(extractKey(source), derived)
    console.log(JSON.stringify(payload, null, 2))
    return
  }
  const payload = verifyKey(extractKey(source), publicPem)
  console.log(JSON.stringify(payload, null, 2))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const command = args._[0]
  if (command === 'generate') await generate(args)
  else if (command === 'issue') await issue(args)
  else if (command === 'inspect') inspect(args)
  else {
    console.log(`RestoPulse POS — license key generator

Usage:
  node tools/keygen.cjs generate [--dir tools/keys] [--force]
  node tools/keygen.cjs issue --machine XXXX-XXXX-XXXX-XXXX --customer "Restaurant Name" [--license-id LIC-2026-0001] [--expires YYYY-MM-DD] [--out file.lic]
  node tools/keygen.cjs inspect --key RPP1-...   (or --file license.lic)

Set RPP_KEY_PASSPHRASE to avoid the interactive passphrase prompt.`)
    process.exit(command ? 1 : 0)
  }
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : err}`)
  process.exit(1)
})
