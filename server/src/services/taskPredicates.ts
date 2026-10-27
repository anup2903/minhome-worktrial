import { PREDICATE_OPS } from '../models/TaskDefinition'
import { normalizeNumber, normalizeDate, equalsLoose } from './normalize'

export type PredicateOp = (typeof PREDICATE_OPS)[number]
export type FieldRef = { $field: string; multiplier?: number }
export type PredicateLike = { key: string; op: string; value?: unknown }


const MAX_EXPRESSION_DEPTH = 5

export const BINARY_EXPR_OPS = ['add', 'subtract', 'multiply', 'divide'] as const
export type BinaryExprOp = (typeof BINARY_EXPR_OPS)[number]
export type BinaryExpr = { op: BinaryExprOp; left: unknown; right: unknown }

export function isFieldRef(value: unknown): value is FieldRef {
  return typeof value === 'object' && value !== null && '$field' in (value as Record<string, unknown>)
}

export function isBinaryExpr(value: unknown): value is BinaryExpr {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return 'left' in v && 'right' in v && typeof v.op === 'string'
    && (BINARY_EXPR_OPS as readonly string[]).includes(v.op)
}


function resolveOperand(value: unknown, fields: Record<string, unknown>, depth = 0): number | undefined {
  if (depth > MAX_EXPRESSION_DEPTH) return undefined

  if (isBinaryExpr(value)) {
    const left = resolveOperand(value.left, fields, depth + 1)
    const right = resolveOperand(value.right, fields, depth + 1)
    if (left === undefined || right === undefined) return undefined
    switch (value.op) {
      case 'add': return left + right
      case 'subtract': return left - right
      case 'multiply': return left * right
      case 'divide': return right === 0 ? undefined : left / right
    }
  }

  if (isFieldRef(value)) {
    const base = normalizeNumber(fields[value.$field])
    if (base === undefined) return undefined
    return base * (value.multiplier ?? 1)
  }

  return normalizeNumber(value)
}

export function resolvePredicateValue(value: unknown, fields: Record<string, unknown>): unknown {
  if (!isFieldRef(value) && !isBinaryExpr(value)) return value
  return resolveOperand(value, fields)
}

export function evalPredicate(op: PredicateOp, fieldValue: unknown, predicateValue: unknown): boolean {
  switch (op) {
    case 'eq': return equalsLoose(fieldValue, predicateValue)
    case 'ne': return !equalsLoose(fieldValue, predicateValue)
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = normalizeNumber(fieldValue)
      const b = normalizeNumber(predicateValue)
      if (a === undefined || b === undefined) return false
      if (op === 'gt') return a > b
      if (op === 'gte') return a >= b
      if (op === 'lt') return a < b
      return a <= b
    }
    case 'in':
    case 'notIn': {
      if (!Array.isArray(predicateValue)) return false
      const isMember = predicateValue.some(item => equalsLoose(fieldValue, item))
      return op === 'in' ? isMember : !isMember
    }
    case 'daysUntilLte':
    case 'daysUntilGt': {
      const t = normalizeDate(fieldValue)
      const days = normalizeNumber(predicateValue)
      if (t === undefined || days === undefined) return false
      const daysUntil = (t - Date.now()) / (1000 * 60 * 60 * 24)
      return op === 'daysUntilLte' ? daysUntil <= days : daysUntil > days
    }
    case 'exists': return fieldValue !== undefined && fieldValue !== null && fieldValue !== ''
    case 'notExists': return fieldValue === undefined || fieldValue === null || fieldValue === ''
    default: return false
  }
}


export function predicatesPass(predicates: PredicateLike[] | undefined, fields: Record<string, unknown>): boolean {
  for (const p of predicates ?? []) {
    const resolvedValue = resolvePredicateValue(p.value, fields)
    if (!evalPredicate(p.op as PredicateOp, fields[p.key], resolvedValue)) return false
  }
  return true
}

export type PredicateEvalDetail = {
  key: string
  op: string
  value: unknown
  fieldValue: unknown
  resolvedValue: unknown
  passed: boolean
}

// Used by the dry-run endpoint, which wants to show every predicate's
// result (not just bail on the first failure) so a caller testing a draft
// rule can see exactly which condition didn't match.
export function evaluatePredicatesDetailed(
  predicates: PredicateLike[] | undefined,
  fields: Record<string, unknown>,
): PredicateEvalDetail[] {
  return (predicates ?? []).map(p => {
    const resolvedValue = resolvePredicateValue(p.value, fields)
    const fieldValue = fields[p.key]
    return {
      key: p.key,
      op: p.op,
      value: p.value,
      fieldValue,
      resolvedValue,
      passed: evalPredicate(p.op as PredicateOp, fieldValue, resolvedValue),
    }
  })
}
