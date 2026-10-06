import type { IpcResult } from '@shared/ipc'

/** Unwrap the main-process IpcResult envelope; throws on error. */
export async function unwrap<T>(promise: Promise<IpcResult<T>>): Promise<T> {
  const res = await promise
  if (!res.ok) throw new Error(res.error)
  return res.data
}

export const api = window.api
