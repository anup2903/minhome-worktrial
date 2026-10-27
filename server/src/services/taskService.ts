import { TaskDefinition, TaskDefinitionDoc } from '../models/TaskDefinition'
import { TaskExecution } from '../models/TaskExecution'
import { TaskFireState } from '../models/TaskFireState'
import { Transaction } from '../models/Transaction'
import { Customer } from '../models/Customer'
import { SourceOfTruth, SotChange } from '../models/SourceOfTruth'
import { dispatch, ActionContext, ActionResult } from './taskActions'
import { NotFoundError } from '../errors'
import { predicatesPass } from './taskPredicates'


// Ops that describe a condition with a real "false" state (threshold/match).
// Only these get fire-once tracking — exists/notExists rules fire every time.
const COMPARISON_OPS = new Set<string>(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'notIn', 'daysUntilLte', 'daysUntilGt'])

// Stop a chain of rules triggering each other forever.
const MAX_CASCADE_DEPTH = 3

// True if this rule needs "only fire on false→true" behavior.
function needsFireStateDedup(def: TaskDefinitionDoc): boolean {
  return (def.predicates ?? []).some(p => COMPARISON_OPS.has(p.op as string))
}

export const taskService = {
  async evaluate(
    transactionId: string,
    changes: SotChange[],
    editorEmail?: string,
    depth = 0,
    chainDefIds: Set<string> = new Set(),
  ): Promise<void> {
    // Nothing changed, nothing to check.
    if (changes.length === 0) return

    const transaction = await Transaction.findById(transactionId)
    if (!transaction) throw new NotFoundError('Transaction', transactionId)

    const sot = await SourceOfTruth.findOne({ transactionId })
    if (!sot) return

    // Needed for the {{customerContactEmail}} template variable.
    const customer = await Customer.findById(transaction.customerId)

    // Only look at rules that (a) belong to this customer, (b) are turned on,
    // (c) watch at least one of the fields that just changed, and (d) haven't
    // already run earlier in this same cascade chain (loop protection).
    const changedKeys = changes.map(c => c.key)
    const candidates = await TaskDefinition.find({
      customerId: transaction.customerId,
      enabled: true,
      watchedKeys: { $in: changedKeys },
      _id: { $nin: Array.from(chainDefIds) },
    })

    const fields = (sot.fields ?? {}) as Record<string, unknown>
    const cascadedChanges: SotChange[] = []
    const evaluatedIds: string[] = []

    // Check and run each candidate rule one at a time.
    for (const def of candidates) {
      evaluatedIds.push(def._id.toString())
      // Everything for this one rule is wrapped in try/catch so a bug in
      // this rule can never stop the other rules or crash the PATCH.
      try {
        const pass = predicatesPass(def.predicates, fields)
        // Does this rule need "only fire once per true-streak" behavior?
        const dedupe = needsFireStateDedup(def)

        if (dedupe) {
          const fireState = await TaskFireState.findOne({
            taskDefinitionId: def._id,
            transactionId: transaction._id,
          })

          if (!pass) {
            // Condition is false now — reset so the next time it becomes
            // true counts as a fresh firing.
            if (fireState?.armed) {
              fireState.armed = false
              await fireState.save()
            }
            continue
          }
          // Condition is true but we already fired for this streak — skip.
          if (fireState?.armed) continue // already fired for this true-streak

          // Condition just became true — mark it armed and fall through to fire.
          if (fireState) {
            fireState.armed = true
            await fireState.save()
          } else {
            await TaskFireState.create({ taskDefinitionId: def._id, transactionId: transaction._id, armed: true })
          }
        } else if (!pass) {
          // No dedup needed (e.g. exists/notExists rule) — just skip if it fails.
          continue
        }

        // Predicate passed (and we're allowed to fire) — run this rule's actions.
        const ctx: ActionContext = {
          transaction,
          sot,
          taskDefinition: def,
          triggeringChanges: changes,
          editorEmail,
          customerContactEmail: customer?.contactEmail ?? undefined,
        }
        const actionResults: ActionResult[] = []
        for (const action of def.actions ?? []) {
          const result = await dispatch(action as any, ctx)
          actionResults.push(result)
          // setField actions report their write here — collect it so it can
          // trigger other rules below (cascading).
          if (result.changes?.length) cascadedChanges.push(...result.changes)
        }
        
        await TaskExecution.create({
          taskDefinitionId: def._id,
          transactionId: transaction._id,
          executedAt: new Date(),
          triggeringChanges: changes,
          actionResults,
        })
      } catch (err) {
        console.error(`taskService: definition ${def._id} (${def.name}) failed during evaluate`, err)
      }
    }

    // If any rule wrote a new field value, re-run evaluate() on those writes
    // so other rules watching that field can react too (capped depth, and
    // never re-running a rule already seen in this chain).
    if (cascadedChanges.length > 0 && depth < MAX_CASCADE_DEPTH) {
      const nextChain = new Set([...chainDefIds, ...evaluatedIds])
      await taskService.evaluate(transactionId, cascadedChanges, editorEmail, depth + 1, nextChain)
    }
  },

  // Catches time-based rules (e.g. "closing in <7 days") that need to fire
  // even when nobody edits the transaction that day. 
  async runScheduledSweep(): Promise<void> {
    // Only bother with customers/rules that actually use a date-math predicate.
    const dateDrivenDefs = await TaskDefinition.find({
      enabled: true,
      'predicates.op': { $in: ['daysUntilLte', 'daysUntilGt'] },
    })
    if (dateDrivenDefs.length === 0) return

    // Group the fields these rules care about, per customer.
    const byCustomer = new Map<string, Set<string>>()
    for (const def of dateDrivenDefs) {
      const customerId = def.customerId.toString()
      const keys = byCustomer.get(customerId) ?? new Set<string>()
      for (const key of def.watchedKeys ?? []) keys.add(key)
      byCustomer.set(customerId, keys)
    }

    const transactions = await Transaction.find({
      customerId: { $in: Array.from(byCustomer.keys()) },
      status: 'active',
    })

    // Re-check every active transaction for those customers.
    for (const txn of transactions) {
      const watchedKeys = byCustomer.get(txn.customerId.toString())
      if (!watchedKeys || watchedKeys.size === 0) continue

      const sot = await SourceOfTruth.findOne({ transactionId: txn._id })
      if (!sot) continue
      const fields = (sot.fields ?? {}) as Record<string, unknown>

      // Nothing actually changed — this is a fake "change" just so
      // evaluate()'s watchedKeys filter picks up these rules.
      const syntheticChanges: SotChange[] = Array.from(watchedKeys).map(key => ({
        key,
        oldValue: fields[key],
        newValue: fields[key],
      }))
      await taskService.evaluate(txn._id.toString(), syntheticChanges)
    }
  },
}
