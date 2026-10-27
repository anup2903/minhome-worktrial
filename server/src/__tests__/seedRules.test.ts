import request from 'supertest'
import { buildApp } from '../app'
import { Customer } from '../models/Customer'
import { Transaction } from '../models/Transaction'
import { SourceOfTruth } from '../models/SourceOfTruth'
import { TaskDefinition } from '../models/TaskDefinition'
import { EmailLog } from '../models/EmailLog'
import { Note } from '../models/Note'

// Confirms the rules already seeded in server/src/scripts/seed.ts still do
// what they did on day zero, except the two documented changes: (a)
// edge-triggered firing for notification actions gated by a comparison-op
// predicate, and (b) the "Failed inspection note" typo fix
// (inspectonStatus -> inspectionStatus). Definitions here mirror
// seed.ts's seedTaskDefinitions() exactly, at the original $500k/$1M
// thresholds (seed.ts itself is never touched — see DECISIONS.md §8).
const app = buildApp()

async function makeTxnWithSot(customerId: any, fields: Record<string, unknown> = {}) {
  const txn = await Transaction.create({ customerId, address: 'Test address' })
  await SourceOfTruth.create({ transactionId: txn._id, fields })
  return txn
}

function patch(txnId: any, changes: { key: string; value: unknown }[]) {
  return request(app).patch(`/api/transactions/${txnId}/sot`).send({ changes })
}

describe('seeded — Redline "High-value flag" ($1M, setFlag)', () => {
  it('still flags at or above $1,000,000', async () => {
    const customer = await Customer.create({ name: 'Redline Realty' })
    await TaskDefinition.create({
      customerId: customer._id, name: 'High-value flag', watchedKeys: ['purchasePrice'],
      predicates: [{ key: 'purchasePrice', op: 'gte', value: 1000000 }],
      actions: [{ type: 'setFlag', config: { flagName: 'highValue', value: true } }],
    })
    const txn = await makeTxnWithSot(customer._id)

    await patch(txn._id, [{ key: 'purchasePrice', value: 2400000 }])
    const updated = await Transaction.findById(txn._id)
    expect(updated?.flags?.get('highValue')).toBe(true)
  })
})

describe('seeded — Redline "High-value email" (documented change: edge-triggered, no more dupes)', () => {
  it('sends one email crossing the threshold, not a second on a further qualifying edit', async () => {
    const customer = await Customer.create({ name: 'Redline Realty' })
    await TaskDefinition.create({
      customerId: customer._id, name: 'High-value email',
      watchedKeys: ['purchasePrice', 'agentEmail'],
      predicates: [
        { key: 'purchasePrice', op: 'gte', value: 1000000 },
        { key: 'agentEmail', op: 'exists' },
      ],
      actions: [{ type: 'sendEmail', config: { to: '{{agentEmail}}', subject: 'High-value: {{propertyAddress}}', body: 'b' } }],
    })
    const txn = await makeTxnWithSot(customer._id, { agentEmail: 'agent@x.test', propertyAddress: '1 Main' })

    await patch(txn._id, [{ key: 'purchasePrice', value: 1200000 }])
    expect(await EmailLog.countDocuments()).toBe(1)

    // Pre-Phase-4 behavior would have re-sent this; edge-triggering suppresses it.
    await patch(txn._id, [{ key: 'purchasePrice', value: 1500000 }])
    expect(await EmailLog.countDocuments()).toBe(1)
  })
})

describe('seeded — Pacific Crest "Inspection reminder" (createNote, gated by a comparison op)', () => {
  it('creates a note once per true-streak — same edge-triggered mechanism now applies here too', async () => {
    const customer = await Customer.create({ name: 'Pacific Crest Homes' })
    await TaskDefinition.create({
      customerId: customer._id, name: 'Inspection reminder',
      watchedKeys: ['inspectionStatus', 'closingDate'],
      predicates: [
        { key: 'inspectionStatus', op: 'ne', value: 'complete' },
        { key: 'closingDate', op: 'exists' },
      ],
      actions: [{ type: 'createNote', config: { body: 'Inspection still pending; closing date {{closingDate}}.' } }],
    })
    const txn = await makeTxnWithSot(customer._id, { closingDate: '2026-12-01', inspectionStatus: 'scheduled' })

    await patch(txn._id, [{ key: 'inspectionStatus', value: 'pending' }]) // still != complete, same true-streak
    expect(await Note.countDocuments({ transactionId: txn._id })).toBe(1)

    // Flip to complete (false) then back off complete (true again) — a new streak, fires again.
    await patch(txn._id, [{ key: 'inspectionStatus', value: 'complete' }])
    await patch(txn._id, [{ key: 'inspectionStatus', value: 'scheduled' }])
    expect(await Note.countDocuments({ transactionId: txn._id })).toBe(2)
  })
})

describe('seeded — Redline "Cash deal flag"', () => {
  it('flags a cash deal', async () => {
    const customer = await Customer.create({ name: 'Redline Realty' })
    await TaskDefinition.create({
      customerId: customer._id, name: 'Cash deal flag', watchedKeys: ['financingType'],
      predicates: [{ key: 'financingType', op: 'eq', value: 'cash' }],
      actions: [{ type: 'setFlag', config: { flagName: 'cashDeal', value: true } }],
    })
    const txn = await makeTxnWithSot(customer._id)

    await patch(txn._id, [{ key: 'financingType', value: 'cash' }])
    const updated = await Transaction.findById(txn._id)
    expect(updated?.flags?.get('cashDeal')).toBe(true)
  })
})

describe('seeded — Harbor & Main "Title company missing" (existence-only, unaffected by edge-triggering)', () => {
  it('creates a note while closing is set and title company is still missing', async () => {
    const customer = await Customer.create({ name: 'Harbor & Main' })
    await TaskDefinition.create({
      customerId: customer._id, name: 'Title company missing',
      watchedKeys: ['titleCompany', 'closingDate'],
      predicates: [
        { key: 'closingDate', op: 'exists' },
        { key: 'titleCompany', op: 'notExists' },
      ],
      actions: [{ type: 'createNote', config: { body: 'Title company not yet selected.' } }],
    })
    const txn = await makeTxnWithSot(customer._id, {})

    await patch(txn._id, [{ key: 'closingDate', value: '2026-12-01' }])
    expect(await Note.countDocuments({ transactionId: txn._id })).toBe(1)
  })
})

describe('seeded — Harbor & Main "Failed inspection note" (the fixed typo: inspectonStatus -> inspectionStatus)', () => {
  it('fires on the correctly-spelled inspectionStatus key', async () => {
    const customer = await Customer.create({ name: 'Harbor & Main' })
    await TaskDefinition.create({
      customerId: customer._id, name: 'Failed inspection note', watchedKeys: ['inspectionStatus'],
      predicates: [{ key: 'inspectionStatus', op: 'eq', value: 'failed' }],
      actions: [{ type: 'createNote', config: { body: 'Inspection failed; schedule a re-inspection.' } }],
    })
    const txn = await makeTxnWithSot(customer._id)

    await patch(txn._id, [{ key: 'inspectionStatus', value: 'failed' }])
    expect(await Note.countDocuments({ transactionId: txn._id })).toBe(1)
  })
})
