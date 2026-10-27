import request from 'supertest'
import { buildApp } from '../app'
import { Customer } from '../models/Customer'
import { Transaction } from '../models/Transaction'
import { SourceOfTruth } from '../models/SourceOfTruth'
import { TaskDefinition } from '../models/TaskDefinition'
import { EmailLog } from '../models/EmailLog'
import { Note } from '../models/Note'
import { taskService } from '../services/taskService'

// Exercises the 7 shipped rules (+ the $750k threshold edit) with the exact
// boundary/messy-data cases CLAUDE.md Phase 6 calls out, through the real
// PATCH /api/transactions/:id/sot path — the same path a customer's own
// edits go through. Definitions mirror server/src/scripts/apply-rule-queue.ts
// exactly; if that script's shape changes, update both together.
const app = buildApp()

async function makeTxnWithSot(customerId: any, fields: Record<string, unknown> = {}) {
  const txn = await Transaction.create({ customerId, address: 'Test address' })
  await SourceOfTruth.create({ transactionId: txn._id, fields })
  return txn
}

function patch(txnId: any, changes: { key: string; value: unknown }[], editorEmail?: string) {
  const req = request(app).patch(`/api/transactions/${txnId}/sot`).send({ changes })
  return editorEmail ? req.set('x-current-user', editorEmail) : req
}

describe('Pacific Crest #3 — High-value flag threshold raised to $750k', () => {
  it('does not flag a deal that would have qualified under the old $500k threshold', async () => {
    const customer = await Customer.create({ name: 'Pacific Crest Homes' })
    await TaskDefinition.create({
      customerId: customer._id, name: 'High-value flag', watchedKeys: ['purchasePrice'],
      predicates: [{ key: 'purchasePrice', op: 'gte', value: 750000 }],
      actions: [{ type: 'setFlag', config: { flagName: 'highValue', value: true } }],
    })
    const txn = await makeTxnWithSot(customer._id)

    await patch(txn._id, [{ key: 'purchasePrice', value: 649999 }])
    const updated = await Transaction.findById(txn._id)
    expect(updated?.flags?.get('highValue')).toBeUndefined()
  })

  it('flags at exactly $750,000 (gte boundary is inclusive)', async () => {
    const customer = await Customer.create({ name: 'Pacific Crest Homes' })
    await TaskDefinition.create({
      customerId: customer._id, name: 'High-value flag', watchedKeys: ['purchasePrice'],
      predicates: [{ key: 'purchasePrice', op: 'gte', value: 750000 }],
      actions: [{ type: 'setFlag', config: { flagName: 'highValue', value: true } }],
    })
    const txn = await makeTxnWithSot(customer._id)

    await patch(txn._id, [{ key: 'purchasePrice', value: 750000 }])
    const updated = await Transaction.findById(txn._id)
    expect(updated?.flags?.get('highValue')).toBe(true)
  })
})

describe('Pacific Crest #1 — FHA appraisal timeline note', () => {
  async function makeRule(customerId: any) {
    return TaskDefinition.create({
      customerId, name: 'FHA appraisal timeline note', watchedKeys: ['financingType'],
      predicates: [{ key: 'financingType', op: 'eq', value: 'fha' }],
      actions: [{ type: 'createNote', config: { body: 'Financing set to FHA — check FHA appraisal timelines for {{propertyAddress}}.' } }],
    })
  }

  it('creates a note when financingType is set to fha', async () => {
    const customer = await Customer.create({ name: 'Pacific Crest Homes' })
    await makeRule(customer._id)
    const txn = await makeTxnWithSot(customer._id, { propertyAddress: '1 Main St' })

    await patch(txn._id, [{ key: 'financingType', value: 'fha' }])
    expect(await Note.countDocuments({ transactionId: txn._id })).toBe(1)
  })

  it('still fires on uppercase "FHA" (case-insensitive eq) — real seed data uses this', async () => {
    const customer = await Customer.create({ name: 'Pacific Crest Homes' })
    await makeRule(customer._id)
    const txn = await makeTxnWithSot(customer._id, { propertyAddress: '1 Main St' })

    await patch(txn._id, [{ key: 'financingType', value: 'FHA' }])
    expect(await Note.countDocuments({ transactionId: txn._id })).toBe(1)
  })

  it('does not fire for a cash deal', async () => {
    const customer = await Customer.create({ name: 'Pacific Crest Homes' })
    await makeRule(customer._id)
    const txn = await makeTxnWithSot(customer._id, { propertyAddress: '1 Main St' })

    await patch(txn._id, [{ key: 'financingType', value: 'cash' }])
    expect(await Note.countDocuments({ transactionId: txn._id })).toBe(0)
  })
})

describe('Pacific Crest #2 — failed inspection email on FHA/VA, not cash', () => {
  async function makeRule(customerId: any) {
    return TaskDefinition.create({
      customerId, name: 'Failed inspection email (FHA/VA)',
      watchedKeys: ['inspectionStatus', 'financingType'],
      predicates: [
        { key: 'inspectionStatus', op: 'eq', value: 'failed' },
        { key: 'financingType', op: 'in', value: ['fha', 'va'] },
      ],
      actions: [{ type: 'sendEmail', config: { to: '{{customerContactEmail}}', subject: 'Failed inspection', body: 'b' } }],
    })
  }

  it('emails the customer on a failed inspection with fha financing', async () => {
    const customer = await Customer.create({ name: 'Pacific Crest Homes', contactEmail: 'ops@pacificcrest.test' })
    await makeRule(customer._id)
    const txn = await makeTxnWithSot(customer._id, { financingType: 'fha' })

    await patch(txn._id, [{ key: 'inspectionStatus', value: 'failed' }])
    expect(await EmailLog.countDocuments({ to: 'ops@pacificcrest.test' })).toBe(1)
  })

  it('emails on va financing too', async () => {
    const customer = await Customer.create({ name: 'Pacific Crest Homes', contactEmail: 'ops@pacificcrest.test' })
    await makeRule(customer._id)
    const txn = await makeTxnWithSot(customer._id, { financingType: 'va' })

    await patch(txn._id, [{ key: 'inspectionStatus', value: 'failed' }])
    expect(await EmailLog.countDocuments()).toBe(1)
  })

  it('does not email on a cash deal\'s failed inspection — explicitly out of scope', async () => {
    const customer = await Customer.create({ name: 'Pacific Crest Homes', contactEmail: 'ops@pacificcrest.test' })
    await makeRule(customer._id)
    const txn = await makeTxnWithSot(customer._id, { financingType: 'cash' })

    await patch(txn._id, [{ key: 'inspectionStatus', value: 'failed' }])
    expect(await EmailLog.countDocuments()).toBe(0)
  })
})

describe('Redline #4 — low earnest money: flag unless FHA, then email instead', () => {
  async function makeRules(customerId: any) {
    await TaskDefinition.create({
      customerId, name: 'Low earnest money flag',
      watchedKeys: ['earnestMoneyAmount', 'purchasePrice', 'financingType'],
      predicates: [
        { key: 'earnestMoneyAmount', op: 'lt', value: { $field: 'purchasePrice', multiplier: 0.05 } },
        { key: 'financingType', op: 'ne', value: 'fha' },
      ],
      actions: [{ type: 'setFlag', config: { flagName: 'lowEarnestMoney', value: true } }],
    })
    await TaskDefinition.create({
      customerId, name: 'Low earnest money FHA email',
      watchedKeys: ['earnestMoneyAmount', 'purchasePrice', 'financingType'],
      predicates: [
        { key: 'earnestMoneyAmount', op: 'lt', value: { $field: 'purchasePrice', multiplier: 0.05 } },
        { key: 'financingType', op: 'eq', value: 'fha' },
      ],
      actions: [{ type: 'sendEmail', config: { to: '{{editorEmail}}', subject: 'Low earnest money', body: 'b' } }],
    })
  }

  it('flags (no email) when non-FHA earnest money is below 5% of price', async () => {
    const customer = await Customer.create({ name: 'Redline Realty' })
    await makeRules(customer._id)
    const txn = await makeTxnWithSot(customer._id, { purchasePrice: 400000, financingType: 'conventional' })

    await patch(txn._id, [{ key: 'earnestMoneyAmount', value: 15000 }])
    const updated = await Transaction.findById(txn._id)
    expect(updated?.flags?.get('lowEarnestMoney')).toBe(true)
    expect(await EmailLog.countDocuments()).toBe(0)
  })

  it('emails the coordinator (no flag) when the same shortfall happens on an FHA deal', async () => {
    const customer = await Customer.create({ name: 'Redline Realty' })
    await makeRules(customer._id)
    const txn = await makeTxnWithSot(customer._id, { purchasePrice: 400000, financingType: 'fha' })

    await patch(txn._id, [{ key: 'earnestMoneyAmount', value: 15000 }], 'coordinator@minhome.test')
    const updated = await Transaction.findById(txn._id)
    expect(updated?.flags?.get('lowEarnestMoney')).toBeUndefined()
    expect(await EmailLog.countDocuments({ to: 'coordinator@minhome.test' })).toBe(1)
  })

  it('does neither when earnest money is at or above the 5% threshold', async () => {
    const customer = await Customer.create({ name: 'Redline Realty' })
    await makeRules(customer._id)
    const txn = await makeTxnWithSot(customer._id, { purchasePrice: 400000, financingType: 'conventional' })

    await patch(txn._id, [{ key: 'earnestMoneyAmount', value: 20000 }]) // exactly 5%
    const updated = await Transaction.findById(txn._id)
    expect(updated?.flags?.get('lowEarnestMoney')).toBeUndefined()
  })

  it('flags correctly when price and earnest money are both comma/dollar-formatted strings (19 Alder Ct shape)', async () => {
    const customer = await Customer.create({ name: 'Redline Realty' })
    await makeRules(customer._id)
    const txn = await makeTxnWithSot(customer._id, { purchasePrice: '875,000', financingType: 'conventional' })

    await patch(txn._id, [{ key: 'earnestMoneyAmount', value: '$15,000' }])
    const updated = await Transaction.findById(txn._id)
    expect(updated?.flags?.get('lowEarnestMoney')).toBe(true) // 15,000 < 5% of 875,000 (43,750)
  })
})

describe('Harbor & Main #5 — closing within 7 days + inspection still pending', () => {
  async function makeRule(customerId: any) {
    return TaskDefinition.create({
      customerId, name: 'Closing soon with inspection pending',
      watchedKeys: ['closingDate', 'inspectionStatus'],
      predicates: [
        { key: 'closingDate', op: 'daysUntilLte', value: 7 },
        { key: 'inspectionStatus', op: 'eq', value: 'pending' },
      ],
      actions: [
        { type: 'setFlag', config: { flagName: 'closingSoonInspectionPending', value: true } },
        { type: 'sendEmail', config: { to: '{{customerContactEmail}}', subject: 'Closing soon', body: 'b' } },
      ],
    })
  }

  it('flags and emails at exactly 7 days out with inspection pending', async () => {
    const customer = await Customer.create({ name: 'Harbor & Main', contactEmail: 'ops@harbormain.test' })
    await makeRule(customer._id)
    const closingDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const txn = await makeTxnWithSot(customer._id, { inspectionStatus: 'pending' })

    await patch(txn._id, [{ key: 'closingDate', value: closingDate }])
    const updated = await Transaction.findById(txn._id)
    expect(updated?.flags?.get('closingSoonInspectionPending')).toBe(true)
    expect(await EmailLog.countDocuments({ to: 'ops@harbormain.test' })).toBe(1)
  })

  it('does not fire when closing is 8 days out (just outside the window)', async () => {
    const customer = await Customer.create({ name: 'Harbor & Main', contactEmail: 'ops@harbormain.test' })
    await makeRule(customer._id)
    const closingDate = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString()
    const txn = await makeTxnWithSot(customer._id, { inspectionStatus: 'pending' })

    await patch(txn._id, [{ key: 'closingDate', value: closingDate }])
    const updated = await Transaction.findById(txn._id)
    expect(updated?.flags?.get('closingSoonInspectionPending')).toBeUndefined()
  })

  it('does not fire when inspection is no longer pending, even if closing is imminent', async () => {
    const customer = await Customer.create({ name: 'Harbor & Main', contactEmail: 'ops@harbormain.test' })
    await makeRule(customer._id)
    const closingDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
    const txn = await makeTxnWithSot(customer._id, { inspectionStatus: 'scheduled' })

    await patch(txn._id, [{ key: 'closingDate', value: closingDate }])
    const updated = await Transaction.findById(txn._id)
    expect(updated?.flags?.get('closingSoonInspectionPending')).toBeUndefined()
  })

  it('fires via the scheduled sweep with no edit at all — the whole point of the rule', async () => {
    const customer = await Customer.create({ name: 'Harbor & Main', contactEmail: 'ops@harbormain.test' })
    await makeRule(customer._id)
    const closingDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString()
    // Directly in the DB, not via PATCH — simulates a deal nobody has touched today.
    await makeTxnWithSot(customer._id, { closingDate, inspectionStatus: 'pending' })

    await taskService.runScheduledSweep()
    expect(await EmailLog.countDocuments({ to: 'ops@harbormain.test' })).toBe(1)
  })
})

describe('Harbor & Main #6 + #7 — cash deal auto-sets Harbor Title, which cascades to an agent email', () => {
  async function makeRules(customerId: any) {
    await TaskDefinition.create({
      customerId, name: 'Cash deal default title company', watchedKeys: ['financingType'],
      predicates: [{ key: 'financingType', op: 'eq', value: 'cash' }],
      actions: [{ type: 'setField', config: { key: 'titleCompany', value: 'Harbor Title' } }],
    })
    await TaskDefinition.create({
      customerId, name: 'Title company change agent notice', watchedKeys: ['titleCompany'],
      predicates: [{ key: 'titleCompany', op: 'exists' }],
      actions: [{ type: 'sendEmail', config: { to: '{{agentEmail}}', subject: 'Title set', body: 'now {{titleCompany}}' } }],
    })
  }

  it('setting financingType to cash auto-sets titleCompany and cascades into the agent email', async () => {
    const customer = await Customer.create({ name: 'Harbor & Main' })
    await makeRules(customer._id)
    const txn = await makeTxnWithSot(customer._id, { agentEmail: 'agent@x.test' })

    await patch(txn._id, [{ key: 'financingType', value: 'cash' }])

    const sot = await SourceOfTruth.findOne({ transactionId: txn._id })
    expect(sot?.fields?.titleCompany).toBe('Harbor Title')
    expect(await EmailLog.countDocuments({ to: 'agent@x.test', body: 'now Harbor Title' })).toBe(1)
  })

  it('on the empty-SOT transaction (no agentEmail), the cascade still writes titleCompany — the email just fails safely', async () => {
    const customer = await Customer.create({ name: 'Harbor & Main' })
    await makeRules(customer._id)
    const txn = await makeTxnWithSot(customer._id, {}) // no agentEmail at all

    const res = await patch(txn._id, [{ key: 'financingType', value: 'cash' }])

    expect(res.status).toBe(200) // isolation held — the PATCH itself never fails
    const sot = await SourceOfTruth.findOne({ transactionId: txn._id })
    expect(sot?.fields?.titleCompany).toBe('Harbor Title')
    expect(await EmailLog.countDocuments()).toBe(0)
  })

  it('a later manual titleCompany edit sends a second email (rule #7 is not edge-triggered — it watches for genuine changes, not a one-time arm)', async () => {
    const customer = await Customer.create({ name: 'Harbor & Main' })
    await makeRules(customer._id)
    const txn = await makeTxnWithSot(customer._id, { agentEmail: 'agent@x.test' })

    await patch(txn._id, [{ key: 'financingType', value: 'cash' }])
    expect(await EmailLog.countDocuments()).toBe(1)

    await patch(txn._id, [{ key: 'titleCompany', value: 'Some Other Title' }])
    expect(await EmailLog.countDocuments()).toBe(2)
  })
})
