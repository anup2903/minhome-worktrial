import { normalizeNumber, normalizeDate, stringsEqualCaseInsensitive, equalsLoose } from '../services/normalize'

// Pure-function coverage for the messy-data handling called out in
// CLAUDE.md Phase 3/6 ("prices/earnest money as strings with $/,",
// "financingType: 'FHA' uppercase", "closingDate as a string", "purchasePrice: 0",
// "empty SOT"). These are the building blocks every predicate op in
// taskPredicates.ts relies on, so a regression here is silent and wide.
describe('normalizeNumber', () => {
  it('strips $ and , from strings before parsing', () => {
    expect(normalizeNumber('$15,000')).toBe(15000)
    expect(normalizeNumber('875,000')).toBe(875000)
  })

  it('passes finite numbers through, including 0', () => {
    expect(normalizeNumber(0)).toBe(0)
    expect(normalizeNumber(1500000)).toBe(1500000)
  })

  it('returns undefined for unparseable or missing values, never throws', () => {
    expect(normalizeNumber('')).toBeUndefined()
    expect(normalizeNumber('N/A')).toBeUndefined()
    expect(normalizeNumber(undefined)).toBeUndefined()
    expect(normalizeNumber(null)).toBeUndefined()
    expect(normalizeNumber(NaN)).toBeUndefined()
    expect(normalizeNumber({})).toBeUndefined()
  })
})

describe('normalizeDate', () => {
  it('parses a Date instance and an ISO-ish date string to the same instant', () => {
    const asString = normalizeDate('2026-11-02')
    const asDate = normalizeDate(new Date('2026-11-02'))
    expect(asString).toBe(asDate)
  })

  it('returns undefined for an invalid date string, never throws', () => {
    expect(normalizeDate('not a date')).toBeUndefined()
    expect(normalizeDate(undefined)).toBeUndefined()
    expect(normalizeDate(new Date('garbage'))).toBeUndefined()
  })
})

describe('stringsEqualCaseInsensitive', () => {
  it('matches regardless of case', () => {
    expect(stringsEqualCaseInsensitive('FHA', 'fha')).toBe(true)
    expect(stringsEqualCaseInsensitive('cash', 'Cash')).toBe(true)
  })

  it('returns false for a genuine mismatch', () => {
    expect(stringsEqualCaseInsensitive('fha', 'va')).toBe(false)
  })

  it('returns undefined (not a string/string comparison) when either side is not a string', () => {
    expect(stringsEqualCaseInsensitive(500000, '500000')).toBeUndefined()
    expect(stringsEqualCaseInsensitive(undefined, 'fha')).toBeUndefined()
  })
})

describe('equalsLoose', () => {
  it('is case-insensitive for strings (financingType FHA vs fha)', () => {
    expect(equalsLoose('FHA', 'fha')).toBe(true)
  })

  it('treats a comma/dollar-formatted string as equal to its numeric value', () => {
    expect(equalsLoose('875,000', 875000)).toBe(true)
    expect(equalsLoose('$15,000', 15000)).toBe(true)
  })

  it('falls back to strict equality for non-numeric, non-string-insensitive mismatches', () => {
    expect(equalsLoose(true, 'true')).toBe(false)
    expect(equalsLoose(null, undefined)).toBe(false)
  })
})
