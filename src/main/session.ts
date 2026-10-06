import type { User } from '@shared/types'

export type CurrentUser = Omit<Pick<User, 'id' | 'name' | 'role' | 'canOverride'>, 'id'> & { id: number | null }

let current: CurrentUser = { id: null, name: 'system', role: 'cashier', canOverride: false }

export function getCurrentUser(): CurrentUser {
  return current
}

export function setCurrentUser(user: CurrentUser): void {
  current = user
}

export function clearCurrentUser(): void {
  current = { id: null, name: 'system', role: 'cashier', canOverride: false }
}
