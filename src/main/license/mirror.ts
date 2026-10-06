import { getSqlite } from '../db/connection'

const MIRROR_KEY = 'license_state'

/**
 * The encrypted license blob is mirrored into app_meta so deleting the state
 * files or restoring an old database cannot reset the trial. Must be read
 * BEFORE the license manager is created and imported immediately after.
 */
export function readLicenseMirror(): string | null {
  try {
    const row = getSqlite().prepare('SELECT value FROM app_meta WHERE key = ?').get(MIRROR_KEY) as
      | { value: string }
      | undefined
    return row?.value ?? null
  } catch {
    return null
  }
}

export function writeLicenseMirror(blob: string): void {
  getSqlite()
    .prepare(
      `INSERT INTO app_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .run(MIRROR_KEY, blob)
}
