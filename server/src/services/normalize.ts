// Comparison-time normalization for messy SOT data.
// Never mutates stored data — only used inside evalPredicate.

export function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,]/g, '').trim()
    if (cleaned === '') return undefined
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

export function normalizeDate(value: unknown): number | undefined {
  if (value instanceof Date) {
    const t = value.getTime()
    return Number.isNaN(t) ? undefined : t
  }
  if (typeof value === 'string') {
    const t = new Date(value).getTime()
    return Number.isNaN(t) ? undefined : t
  }
  return undefined
}

// undefined means "not a string-vs-string comparison" — caller falls back.
export function stringsEqualCaseInsensitive(a: unknown, b: unknown): boolean | undefined {
  if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase()
  return undefined
}

export function equalsLoose(fieldValue: unknown, predicateValue: unknown): boolean {
  const ci = stringsEqualCaseInsensitive(fieldValue, predicateValue)
  if (ci !== undefined) return ci
  const a = normalizeNumber(fieldValue)
  const b = normalizeNumber(predicateValue)
  if (a !== undefined && b !== undefined) return a === b
  return fieldValue === predicateValue
}
