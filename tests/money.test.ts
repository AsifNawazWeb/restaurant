import { describe, expect, it } from 'vitest'
import {
  roundCents,
  rupeesToCents,
  percentOfCents,
  formatPKR,
  applyDiscountCents,
  centsToInput
} from '../src/shared/money'

describe('money primitives (PKR integer paisa/cents)', () => {
  it('rounds half-up to cents', () => {
    expect(roundCents(1234.5)).toBe(1235)
    expect(roundCents(-1234.5)).toBe(-1235)
    expect(roundCents(0.005)).toBe(0)
  })

  it('converts rupees to cents exactly', () => {
    expect(rupeesToCents(12.5)).toBe(1250)
    expect(rupeesToCents(0.1)).toBe(10)
    expect(rupeesToCents(1e-9)).toBe(0)
  })

  it('computes percentages of cent amounts with half-up rounding', () => {
    expect(percentOfCents(95000, 18)).toBe(17100) // 18% GST on Rs. 950
    expect(percentOfCents(999, 5)).toBe(50) // 49.95 -> 50
    expect(percentOfCents(100, 0)).toBe(0)
  })

  it('applies discounts', () => {
    expect(applyDiscountCents(100000, 10)).toBe(90000)
  })

  it('formats whole rupees without paisa decimals', () => {
    expect(formatPKR(1214500)).toBe('Rs. 12,145')
    expect(formatPKR(95000)).toBe('Rs. 950')
    expect(formatPKR(500000)).toBe('Rs. 5,000')
  })

  it('keeps exact paisa only when the fraction is non-zero', () => {
    expect(formatPKR(-250)).toBe('-Rs. 2.50')
    expect(formatPKR(123456789)).toBe('Rs. 1,234,567.89')
    expect(formatPKR(5760)).toBe('Rs. 57.60') // 18% GST on Rs. 320
  })

  it('produces clean numeric input strings', () => {
    expect(centsToInput(129900)).toBe('1299.00')
  })
})
