import { taskService } from '../services/taskService'
import { sourceOfTruthService } from '../services/sourceOfTruthService'
import { TaskDefinition } from '../models/TaskDefinition'
import { SourceOfTruth } from '../models/SourceOfTruth'
import { TaskExecution } from '../models/TaskExecution'
import { EmailLog } from '../models/EmailLog'
import { Customer } from '../models/Customer'
import { makeCustomer, makeTxn, makeSot } from './helpers'

// Mirrors what SourceOfTruthController.patch actually does: write the
// change through sourceOfTruthService (so it lands in the DB and the diff
// reflects a real no-op filter), then hand that diff to taskService. Tests
// that instead pass a hand-built SotChange[] without writing it first were
// testing against stale SOT state — evaluate() reads current `fields` from
// the DB, it doesn't trust the `changes` array's `newValue`.
async function applyAndEvaluate(
  transactionId: string,
  changes: { key: string; value: unknown }[],
  editorEmail?: string,
) {
  const diff = await sourceOfTruthService.applyChanges(transactionId, changes)
  await taskService.evaluate(transactionId, diff, editorEmail)
  return diff
}

describe('taskService.evaluate — edge-triggered firing', () => {
  it('a comparison predicate (gte) fires once per true-streak, not on every edit that keeps it true', async () => {
    const customer = await makeCustomer()
    const txn = await makeTxn({ customerId: customer._id })
    await makeSot(txn._id, {})
    await TaskDefinition.create({
      customerId: customer._id,
      name: 'High-value email',
      watchedKeys: ['purchasePrice'],
      predicates: [{ key: 'purchasePrice', op: 'gte', value: 1000000 }],
      actions: [{ type: 'sendEmail', config: { to: 'a@x.com', subject: 'hi', body: 'b' } }],
    })

    await applyAndEvaluate(txn._id.toString(), [{ key: 'purchasePrice', value: 1500000 }])
    expect(await EmailLog.countDocuments()).toBe(1)

    // Still above threshold — must not re-send.
    await applyAndEvaluate(txn._id.toString(), [{ key: 'purchasePrice', value: 2000000 }])
    expect(await EmailLog.countDocuments()).toBe(1)

    // Drops below, then crosses again — a new event, must fire again.
    await applyAndEvaluate(txn._id.toString(), [{ key: 'purchasePrice', value: 900000 }])
    await applyAndEvaluate(txn._id.toString(), [{ key: 'purchasePrice', value: 1600000 }])
    expect(await EmailLog.countDocuments()).toBe(2)
  })

  it('an existence-only predicate (Harbor & Main #7 style) fires on every genuine value change, not just the first', async () => {
    const customer = await makeCustomer()
    const txn = await makeTxn({ customerId: customer._id })
    await makeSot(txn._id, {})
    await TaskDefinition.create({
      customerId: customer._id,
      name: 'Title company changed',
      watchedKeys: ['titleCompany'],
      predicates: [{ key: 'titleCompany', op: 'exists' }],
      actions: [{ type: 'sendEmail', config: { to: 'agent@x.com', subject: 'Title set', body: 'now {{titleCompany}}' } }],
    })

    await applyAndEvaluate(txn._id.toString(), [{ key: 'titleCompany', value: 'Lone Star Title' }])
    expect(await EmailLog.countDocuments()).toBe(1)

    // Still "exists" both before and after — a naive true/true dedup would
    // wrongly swallow this, but the field's value genuinely changed and the
    // rule says "set or changes".
    await applyAndEvaluate(txn._id.toString(), [{ key: 'titleCompany', value: 'Coastal Title' }])
    expect(await EmailLog.countDocuments()).toBe(2)
    const latest = await EmailLog.findOne().sort({ sentAt: -1 })
    expect(latest?.body).toBe('now Coastal Title')
  })
})

describe('taskService.evaluate — cascading setField writes', () => {
  it('a setField write re-triggers a dependent rule watching that field', async () => {
    const customer = await makeCustomer()
    const txn = await makeTxn({ customerId: customer._id })
    await makeSot(txn._id, {})

    await TaskDefinition.create({
      customerId: customer._id,
      name: 'Cash deal -> Harbor Title',
      watchedKeys: ['financingType'],
      predicates: [{ key: 'financingType', op: 'eq', value: 'cash' }],
      actions: [{ type: 'setField', config: { key: 'titleCompany', value: 'Harbor Title' } }],
    })
    await TaskDefinition.create({
      customerId: customer._id,
      name: 'Notify agent of title company',
      watchedKeys: ['titleCompany'],
      predicates: [{ key: 'titleCompany', op: 'exists' }],
      actions: [{ type: 'sendEmail', config: { to: 'agent@x.com', subject: 'Title set', body: '{{titleCompany}}' } }],
    })

    await applyAndEvaluate(txn._id.toString(), [{ key: 'financingType', value: 'cash' }])

    const sot = await SourceOfTruth.findOne({ transactionId: txn._id })
    expect(sot?.fields?.titleCompany).toBe('Harbor Title')
    expect(await EmailLog.countDocuments({ body: 'Harbor Title' })).toBe(1)
  })

  it('a rule cannot re-trigger itself via its own setField output', async () => {
    const customer = await makeCustomer()
    const txn = await makeTxn({ customerId: customer._id })
    await makeSot(txn._id, { notes: 'open' })

    await TaskDefinition.create({
      customerId: customer._id,
      name: 'Self-loop',
      watchedKeys: ['notes'],
      predicates: [{ key: 'notes', op: 'ne', value: 'done' }],
      actions: [{ type: 'setField', config: { key: 'notes', value: 'done' } }],
    })

    await applyAndEvaluate(txn._id.toString(), [{ key: 'notes', value: 'in-progress' }])

    // Writing 'done' makes the predicate false, which would normally be a
    // dead end anyway — the real test is that this resolves at all (no hang,
    // no runaway writes) and settles on exactly one execution.
    expect(await TaskExecution.countDocuments({ transactionId: txn._id })).toBe(1)
    const sot = await SourceOfTruth.findOne({ transactionId: txn._id })
    expect(sot?.fields?.notes).toBe('done')
  })

  it('stops cascading at the depth cap even when each hop produces a genuinely new value', async () => {
    const customer = await makeCustomer()
    const txn = await makeTxn({ customerId: customer._id })
    await makeSot(txn._id, {})

    // A chain of 4 distinct rules, each triggered by the previous one's
    // write, plus a 5th rule that would only fire one hop beyond the cap.
    await TaskDefinition.create({
      customerId: customer._id, name: 'R1', watchedKeys: ['agentName'],
      predicates: [{ key: 'agentName', op: 'eq', value: 'start' }],
      actions: [{ type: 'setField', config: { key: 'sellerName', value: 's1' } }],
    })
    await TaskDefinition.create({
      customerId: customer._id, name: 'R2', watchedKeys: ['sellerName'],
      predicates: [{ key: 'sellerName', op: 'eq', value: 's1' }],
      actions: [{ type: 'setField', config: { key: 'buyerName', value: 's2' } }],
    })
    await TaskDefinition.create({
      customerId: customer._id, name: 'R3', watchedKeys: ['buyerName'],
      predicates: [{ key: 'buyerName', op: 'eq', value: 's2' }],
      actions: [{ type: 'setField', config: { key: 'notes', value: 's3' } }],
    })
    await TaskDefinition.create({
      customerId: customer._id, name: 'R4', watchedKeys: ['notes'],
      predicates: [{ key: 'notes', op: 'eq', value: 's3' }],
      actions: [{ type: 'setField', config: { key: 'agentName', value: 's4' } }],
    })
    await TaskDefinition.create({
      customerId: customer._id, name: 'R5', watchedKeys: ['agentName'],
      predicates: [{ key: 'agentName', op: 'eq', value: 's4' }],
      actions: [{ type: 'setField', config: { key: 'notes', value: 's5' } }],
    })

    await applyAndEvaluate(txn._id.toString(), [{ key: 'agentName', value: 'start' }])

    expect(await TaskExecution.countDocuments({ transactionId: txn._id })).toBe(4) // R1-R4, not R5
    const sot = await SourceOfTruth.findOne({ transactionId: txn._id })
    expect(sot?.fields?.agentName).toBe('s4') // R4's write landed
    expect(sot?.fields?.notes).toBe('s3') // R5 never ran, didn't overwrite this to 's5'
  })
})

describe('taskService.evaluate — new predicate ops', () => {
  it('"in" covers OR-style membership (fha or va)', async () => {
    const customer = await makeCustomer()
    const txn = await makeTxn({ customerId: customer._id })
    await makeSot(txn._id, { inspectionStatus: 'failed' })
    await TaskDefinition.create({
      customerId: customer._id,
      name: 'Failed inspection on financed deal',
      watchedKeys: ['financingType'],
      predicates: [
        { key: 'financingType', op: 'in', value: ['fha', 'va'] },
        { key: 'inspectionStatus', op: 'eq', value: 'failed' },
      ],
      actions: [{ type: 'sendEmail', config: { to: 'coord@x.com', subject: 'Inspection failed', body: 'b' } }],
    })

    await applyAndEvaluate(txn._id.toString(), [{ key: 'financingType', value: 'FHA' }])
    expect(await EmailLog.countDocuments()).toBe(1) // case-insensitive match too
  })

  it('a $field reference resolves cross-field comparison (earnest money vs 5% of price)', async () => {
    const customer = await makeCustomer()
    const txn = await makeTxn({ customerId: customer._id })
    await makeSot(txn._id, { purchasePrice: '400,000' })
    await TaskDefinition.create({
      customerId: customer._id,
      name: 'Low earnest money',
      watchedKeys: ['earnestMoneyAmount'],
      predicates: [{ key: 'earnestMoneyAmount', op: 'lt', value: { $field: 'purchasePrice', multiplier: 0.05 } }],
      actions: [{ type: 'setFlag', config: { flagName: 'lowEarnestMoney', value: true } }],
    })

    // 5% of 400,000 is 20,000 — 15,000 should fail the threshold.
    await applyAndEvaluate(txn._id.toString(), [{ key: 'earnestMoneyAmount', value: 15000 }])
    const exec = await TaskExecution.findOne({ transactionId: txn._id })
    expect(exec?.actionResults[0]).toMatchObject({ status: 'ok' })
  })

  it('does not fire when the field reference can\'t be resolved (missing purchasePrice)', async () => {
    const customer = await makeCustomer()
    const txn = await makeTxn({ customerId: customer._id })
    await makeSot(txn._id, {}) // no purchasePrice at all
    await TaskDefinition.create({
      customerId: customer._id,
      name: 'Low earnest money',
      watchedKeys: ['earnestMoneyAmount'],
      predicates: [{ key: 'earnestMoneyAmount', op: 'lt', value: { $field: 'purchasePrice', multiplier: 0.05 } }],
      actions: [{ type: 'setFlag', config: { flagName: 'lowEarnestMoney', value: true } }],
    })

    await applyAndEvaluate(txn._id.toString(), [{ key: 'earnestMoneyAmount', value: 15000 }])
    expect(await TaskExecution.countDocuments({ transactionId: txn._id })).toBe(0)
  })

  it('daysUntilLte fires for a closing date inside the window, using messy string dates', async () => {
    const customer = await makeCustomer()
    const txn = await makeTxn({ customerId: customer._id })
    const closingDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    await makeSot(txn._id, { inspectionStatus: 'pending' })
    await TaskDefinition.create({
      customerId: customer._id,
      name: 'Closing soon, inspection pending',
      watchedKeys: ['closingDate', 'inspectionStatus'],
      predicates: [
        { key: 'closingDate', op: 'daysUntilLte', value: 7 },
        { key: 'inspectionStatus', op: 'eq', value: 'pending' },
      ],
      actions: [{ type: 'setFlag', config: { flagName: 'closingSoon', value: true } }],
    })

    await applyAndEvaluate(txn._id.toString(), [{ key: 'closingDate', value: closingDate }])
    expect(await TaskExecution.countDocuments({ transactionId: txn._id })).toBe(1)
  })
})

describe('taskService.evaluate — editor/customer email template variables', () => {
  it('exposes {{editorEmail}} and {{customerContactEmail}} alongside SOT fields', async () => {
    const customer = await Customer.create({ name: 'Pacific Crest Homes', contactEmail: 'ops@pacificcrest.test' })
    const txn = await makeTxn({ customerId: customer._id })
    await makeSot(txn._id, {})
    await TaskDefinition.create({
      customerId: customer._id,
      name: 'Email us on FHA earnest money',
      watchedKeys: ['financingType'],
      predicates: [{ key: 'financingType', op: 'eq', value: 'fha' }],
      actions: [{
        type: 'sendEmail',
        config: { to: '{{customerContactEmail}}', subject: 'FYI {{editorEmail}}', body: 'b' },
      }],
    })

    await applyAndEvaluate(txn._id.toString(), [{ key: 'financingType', value: 'fha' }], 'jane.coordinator@minhome.test')

    const log = await EmailLog.findOne()
    expect(log?.to).toBe('ops@pacificcrest.test')
    expect(log?.subject).toBe('FYI jane.coordinator@minhome.test')
  })
})
