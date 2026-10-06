import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import type { NodeSQLiteDatabase } from 'drizzle-orm/node-sqlite'
import path from 'node:path'
import fs from 'node:fs'

export type DB = NodeSQLiteDatabase

let db: DB | null = null
let sqlite: DatabaseSync | null = null

export interface OpenDatabaseResult {
  db: DB
  file: string
  isNew: boolean
}

/**
 * Open (or create) the local SQLite database in WAL mode.
 * Uses node:sqlite built into Node 22.5+/Electron 36+ (no native rebuild needed).
 */
export function openDatabase(dir: string, fileName = 'restopulse.db'): OpenDatabaseResult {
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, fileName)
  const isNew = !fs.existsSync(file)

  sqlite = new DatabaseSync(file)

  sqlite.exec('PRAGMA journal_mode = WAL;')
  sqlite.exec('PRAGMA synchronous = NORMAL;')
  sqlite.exec('PRAGMA foreign_keys = ON;')
  sqlite.exec('PRAGMA busy_timeout = 5000;')
  sqlite.exec('PRAGMA journal_size_limit = 67108864;')

  db = drizzle({ client: sqlite })
  return { db, file, isNew }
}

export function getDb(): DB {
  if (!db) throw new Error('Database not initialized - call openDatabase() first')
  return db
}

export function getSqlite(): DatabaseSync {
  if (!sqlite) throw new Error('Database not initialized')
  return sqlite
}

export function closeDatabase(): void {
  sqlite?.close()
  sqlite = null
  db = null
}
