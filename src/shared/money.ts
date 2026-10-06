/**
 * All PKR money values are stored as integer cents to avoid float drift.
 * 1 rupee = 100 paisa. "Rs. 1,234.50" is stored as 123450.
 * Display convention: amounts are shown as whole rupees whenever the paisa
 * fraction is zero (typical Pakistani menu pricing), e.g. "Rs. 350".
 */

/** Round half-up to integer cents from any float input (e.g. rate * base). */
export function roundCents(value: number): number {
  if (!Number.isFinite(value)) return 0
  return value >= 0 ? Math.round(value) : -Math.round(-value)
}

/** Convert a decimal rupee amount (12.5) to cents (1250). */
export function rupeesToCents(rupees: number): number {
  return roundCents(rupees * 100)
}

/** Convert cents (1250) to decimal rupees (12.5). */
export function centsToRupees(cents: number): number {
  return cents / 100
}

/** Percentage of an integer-cent amount, half-up rounded. */
export function percentOfCents(cents: number, percent: number): number {
  return roundCents((cents * percent) / 100)
}

/** Apply a percent discount to an amount (amount after discount, in cents). */
export function applyDiscountCents(cents: number, discountPercent: number): number {
  const off = percentOfCents(cents, discountPercent)
  return cents - off
}

/** Compact human format: whole rupees when possible ("Rs. 1,234"), exact when paisa exists ("Rs. 1,234.50"). */
export function formatPKR(cents: number): string {
  const negative = cents < 0
  const abs = Math.abs(cents)
  const whole = Math.floor(abs / 100)
  const frac = abs % 100
  const grouping = whole.toLocaleString('en-US')

  let text: string
  if (frac === 0) {
    text = grouping
  } else {
    text = `${grouping}.${frac.toString().padStart(2, '0')}`
  }
  return `${negative ? '-' : ''}Rs. ${text}`
}

/** Plain numeric string for input fields: "1234.50" */
export function centsToInput(cents: number): string {
  return (Math.abs(cents) / 100).toFixed(2)
}
