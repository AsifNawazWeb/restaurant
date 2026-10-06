import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { DB } from '../db/connection'
import * as schema from '../db/schema'
import type { User } from '@shared/types'
import type { UserRole } from '@shared/constants'
import { sql } from 'drizzle-orm'

function hashPin(pin: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${pin}`).digest('hex')
}

export async function listUsers(db: DB): Promise<User[]> {
  const rows = await db.select().from(schema.users).where(eq(schema.users.active, true))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role as UserRole,
    hasPin: Boolean(r.pinHash),
    canOverride: r.canOverride
  }))
}

export async function createUser(db: DB, name: string, role: UserRole, pin?: string): Promise<User> {
  const salt = randomBytes(8).toString('hex')
  const [row] = await db
    .insert(schema.users)
    .values({
      name,
      role,
      pinHash: pin ? `${salt}:${hashPin(pin, salt)}` : null,
      canOverride: role === 'manager',
      createdAt: new Date().toISOString()
    })
    .returning()
  return { id: row.id, name: row.name, role: row.role as UserRole, hasPin: Boolean(row.pinHash), canOverride: row.canOverride }
}

export async function setUserPin(db: DB, userId: number, pin: string): Promise<void> {
  if (!/^\d{4,6}$/.test(pin)) throw new Error('PIN must be 4-6 digits')
  const salt = randomBytes(8).toString('hex')
  await db
    .update(schema.users)
    .set({ pinHash: `${salt}:${hashPin(pin, salt)}` })
    .where(eq(schema.users.id, userId))
}

export async function loginByPin(db: DB, pin: string): Promise<User | null> {
  const rows = await db.select().from(schema.users).where(eq(schema.users.active, true))
  for (const r of rows) {
    if (!r.pinHash) continue
    const [salt, hash] = r.pinHash.split(':')
    if (hash && hashPin(pin, salt) === hash) {
      return { id: r.id, name: r.name, role: r.role as UserRole, canOverride: r.canOverride }
    }
  }
  return null
}

/** Manager override: verify a manager PIN for privileged actions. */
export async function verifyManagerOverride(db: DB, pin: string): Promise<User> {
  const user = await loginByPin(db, pin)
  if (!user || user.role !== 'manager') throw new Error('Manager authorization failed')
  return user
}

export async function updateUserRole(db: DB, userId: number, role: UserRole): Promise<void> {
  await db
    .update(schema.users)
    .set({ role, canOverride: role === 'manager' })
    .where(eq(schema.users.id, userId))
}

export async function deactivateUser(db: DB, userId: number): Promise<void> {
  const [{ cnt }] = await db.select({ cnt: sql<number>`count(*)` }).from(schema.users).where(eq(schema.users.active, true))
  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, userId))
  if (Number(cnt) <= 1 && target?.active) throw new Error('Cannot deactivate the last active user')
  await db.update(schema.users).set({ active: false }).where(eq(schema.users.id, userId))
}
