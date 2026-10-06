import crypto from 'node:crypto'

export const KEY_PREFIX = 'RPP1-'

export interface LicensePayload {
  v: number
  licenseId: string
  customer: string
  machine: string
  issuedAt: string
  expiresAt: string | null
  features: string[]
}

function toB64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

function fromB64url(str: string): Buffer {
  return Buffer.from(String(str), 'base64url')
}

export function encodePayload(payload: unknown): string {
  return toB64url(JSON.stringify(payload))
}

export function decodePayload(payloadEncoded: string): LicensePayload {
  let parsed: unknown
  try {
    parsed = JSON.parse(fromB64url(payloadEncoded).toString('utf8'))
  } catch {
    throw new Error('License key payload is corrupted')
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('License key payload is corrupted')
  return parsed as LicensePayload
}

export function signEncodedPayload(payloadEncoded: string, privateKey: crypto.KeyObject): string {
  return toB64url(crypto.sign(null, Buffer.from(payloadEncoded), privateKey))
}

export function makeKey(payload: unknown, privateKey: crypto.KeyObject): string {
  const encoded = encodePayload(payload)
  return `${KEY_PREFIX}${encoded}.${signEncodedPayload(encoded, privateKey)}`
}

export function parseKey(key: string): { payloadEncoded: string; signature: string } {
  const trimmed = String(key || '').replace(/\s+/g, '')
  const start = trimmed.indexOf(KEY_PREFIX)
  if (start === -1) throw new Error('License key format is not recognized')
  const body = trimmed.slice(start + KEY_PREFIX.length)
  const dot = body.lastIndexOf('.')
  if (dot <= 0 || dot === body.length - 1) throw new Error('License key format is not recognized')
  return { payloadEncoded: body.slice(0, dot), signature: body.slice(dot + 1) }
}

export function verifyKey(key: string, publicKeyPem: string): LicensePayload {
  const { payloadEncoded, signature } = parseKey(key)
  let valid = false
  try {
    valid = crypto.verify(null, Buffer.from(payloadEncoded), crypto.createPublicKey(publicKeyPem), fromB64url(signature))
  } catch {
    valid = false
  }
  if (!valid) throw new Error('License key signature is not valid')
  return decodePayload(payloadEncoded)
}

export function extractKey(text: string): string {
  const raw = String(text || '').trim()
  const start = raw.indexOf(KEY_PREFIX)
  if (start === -1) return raw
  return raw.slice(start).split(/\s/)[0]
}
