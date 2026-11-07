/** Supplier names often arrive in capitals ("BED AND BREAKFAST"); show those in sentence case. */
export function tidy(s: string): string {
  if (!s || s !== s.toUpperCase()) return s
  const lower = s.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/** "€258.11" in the viewer's locale; falls back to "EUR 258.11" for a code Intl doesn't know. */
export function money(value: number, currency: string, digits = 2): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(digits)}`
  }
}

/** "1 night", "3 nights" … */
export const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
