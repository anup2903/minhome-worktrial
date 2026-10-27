import { z } from 'zod'
import { objectId } from './common'
import { SOT_FIELD_KEYS } from '../config/sotSchema'


const NUMERIC_OPS = ['gt', 'gte', 'lt', 'lte'] as const
const EQUALITY_OPS = ['eq', 'ne'] as const
const EXISTENCE_OPS = ['exists', 'notExists'] as const


const MEMBERSHIP_OPS = ['in', 'notIn'] as const
const DAYS_OPS = ['daysUntilLte', 'daysUntilGt'] as const


const sotFieldKey = z.string().refine(k => (SOT_FIELD_KEYS as readonly string[]).includes(k), {
  message: 'key must be a valid SOT field key',
})


const fieldRef = z.object({
  $field: z.string().min(1),
  multiplier: z.number().optional(),
})

const BINARY_EXPR_OPS = ['add', 'subtract', 'multiply', 'divide'] as const

type OperandInput =
  | number
  | { $field: string; multiplier?: number }
  | { op: (typeof BINARY_EXPR_OPS)[number]; left: OperandInput; right: OperandInput }


const operand: z.ZodType<OperandInput> = z.lazy(() =>
  z.union([
    z.number(),
    fieldRef,
    z.object({
      op: z.enum(BINARY_EXPR_OPS),
      left: operand,
      right: operand,
    }),
  ]),
)


const MAX_EXPRESSION_DEPTH = 5
function operandDepth(value: OperandInput): number {
  if (typeof value === 'object' && value !== null && 'op' in value) {
    return 1 + Math.max(operandDepth(value.left), operandDepth(value.right))
  }
  return 0
}

const numericValue = operand.refine(
  v => operandDepth(v) <= MAX_EXPRESSION_DEPTH,
  { message: `expression nested too deeply (max depth ${MAX_EXPRESSION_DEPTH})` },
)

const numericPredicate = z.object({
  key: sotFieldKey,
  op: z.enum(NUMERIC_OPS),
  value: numericValue,
})

const equalityPredicate = z.object({
  key: sotFieldKey,
  op: z.enum(EQUALITY_OPS),
  value: z.union([z.string(), z.number(), z.boolean()]),
})

const existencePredicate = z.object({
  key: sotFieldKey,
  op: z.enum(EXISTENCE_OPS),
})

const membershipPredicate = z.object({
  key: sotFieldKey,
  op: z.enum(MEMBERSHIP_OPS),
  value: z.array(z.union([z.string(), z.number(), z.boolean()])).min(1),
})

const daysPredicate = z.object({
  key: sotFieldKey,
  op: z.enum(DAYS_OPS),
  value: z.number(),
})

const predicate = z.union([numericPredicate, equalityPredicate, existencePredicate, membershipPredicate, daysPredicate])

// Each action type gets its own strict config shape instead of `z.any()`,
// so a rule that can never work (e.g. setFlag with no value) is rejected
// at creation time instead of silently failing every time it fires.
const sendEmailAction = z.object({
  type: z.literal('sendEmail'),
  config: z.object({
    to: z.string().min(1),
    subject: z.string().min(1),
    body: z.string().min(1),
  }),
})

const setFlagAction = z.object({
  type: z.literal('setFlag'),
  config: z.object({
    flagName: z.string().min(1),
    value: z.boolean(),
  }),
})

const createNoteAction = z.object({
  type: z.literal('createNote'),
  config: z.object({
    body: z.string().min(1),
  }),
})

// `key` is restricted to known SOT fields so a rule can't be written to
// clobber something the engine doesn't understand. See DECISIONS.md §5/§9.
const setFieldAction = z.object({
  type: z.literal('setField'),
  config: z.object({
    key: sotFieldKey,
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  }),
})

const action = z.discriminatedUnion('type', [sendEmailAction, setFlagAction, createNoteAction, setFieldAction])

// Caps how many predicates/actions one rule can carry. Both run
// synchronously inside the PATCH /sot request (evaluate() awaits every
// predicate check and every dispatch() call before the response returns),
// so an unbounded array is a latency/availability risk on every future
// edit to a watched key, not just a storage concern. See DECISIONS.md §16.
const MAX_PREDICATES_PER_DEFINITION = 10
const MAX_ACTIONS_PER_DEFINITION = 10

export const createTaskDefinitionBody = z.object({
  customerId: objectId,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  watchedKeys: z.array(sotFieldKey).default([]),
  predicates: z.array(predicate).max(MAX_PREDICATES_PER_DEFINITION).default([]),
  actions: z.array(action).max(MAX_ACTIONS_PER_DEFINITION).default([]),
  enabled: z.boolean().default(true),
})

// customerId is deliberately excluded here (not just made optional) — a
// PATCH must not be able to move a rule to a different customer after
// creation. See CLAUDE.md Phase 5 / cross-tenant scoping.
export const updateTaskDefinitionBody = createTaskDefinitionBody.omit({ customerId: true }).partial()

// Optional: GET with no customerId returns every customer's rules, same
// as before Phase 5's cross-tenant tightening — reverted at the user's
// explicit request. See DECISIONS.md §13 addendum.
export const listTaskDefinitionsQuery = z.object({
  customerId: objectId.optional(),
})

// Validates a draft rule against the exact shape it would be created with,
// then evaluates it against a caller-supplied SOT payload. No DB writes and
// no dispatch() call happen on this path — see TaskDefinitionController.dryRun.
export const dryRunBody = z.object({
  taskDefinition: createTaskDefinitionBody,
  sot: z.record(z.string(), z.unknown()).default({}),
})
