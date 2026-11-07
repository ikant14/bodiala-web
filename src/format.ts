/** Supplier names often arrive in capitals ("BED AND BREAKFAST"); show those in sentence case. */
export function tidy(s: string): string {
  if (!s || s !== s.toUpperCase()) return s
  const lower = s.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}
