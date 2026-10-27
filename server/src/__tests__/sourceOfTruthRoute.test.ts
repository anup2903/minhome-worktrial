import request from 'supertest'
import { buildApp } from '../app'
import { Customer } from '../models/Customer'
import { Transaction } from '../models/Transaction'
import { SourceOfTruth } from '../models/SourceOfTruth'
import { TaskDefinition } from '../models/TaskDefinition'
import { AuditLogEntry } from '../models/AuditLogEntry'
import { TaskExecution } from '../models/TaskExecution'
import { EmailLog } from '../models/EmailLog'

const app = buildApp()

describe('PATCH /api/transactions/:id/sot', () => {
  it('applies changes, fires task evaluation, and writes audit log', async () => {
    const customer = await Customer.create({ name: 'Test Realty' })
    const txn = await Transaction.create({ customerId: customer._id, address: '1 Main' })
    await SourceOfTruth.create({ transactionId: txn._id, fields: {} })

    await TaskDefinition.create({
      customerId: customer._id,
      name: 'high-value',
      enabled: true,
      watchedKeys: ['purchasePrice'],
      predicates: [{ key: 'purchasePrice', op: 'gte', value: 1000000 }],
      actions: [{ type: 'sendEmail', config: { to: 'staff@x.com', subject: 'big', body: 'b' } }],
    })

    const res = await request(app)
      .patch(`/api/transactions/${txn._id}/sot`)
      .send({ changes: [{ key: 'purchasePrice', value: 1500000 }] })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.changed).toEqual(['purchasePrice'])

    expect(await AuditLogEntry.countDocuments({ transactionId: txn._id })).toBe(1)
    expect(await TaskExecution.countDocuments({ transactionId: txn._id })).toBe(1)
    expect(await EmailLog.countDocuments()).toBe(1)
  })

  it('returns 400 on unknown SOT key', async () => {
    const customer = await Customer.create({ name: 'Test Realty' })
    const txn = await Transaction.create({ customerId: customer._id, address: '2 Main' })
    await SourceOfTruth.create({ transactionId: txn._id, fields: {} })

    const res = await request(app)
      .patch(`/api/transactions/${txn._id}/sot`)
      .send({ changes: [{ key: 'bogus', value: 1 }] })

    expect(res.status).toBe(400)
  })

  // Regression lock for the hard constraint: "a bad rule must never take
  // MinHome down." Confirmed by hand first (see DECISIONS.md #9) that a
  // task definition whose action throws does not block a sibling
  // definition's action or the audit log write — this test just pins that
  // behavior so it can't silently regress later.
  it('a task definition whose action throws does not block a sibling definition or the audit log', async () => {
    const customer = await Customer.create({ name: 'Test Realty' })
    const txn = await Transaction.create({ customerId: customer._id, address: '3 Main' })
    await SourceOfTruth.create({ transactionId: txn._id, fields: {} })

    await TaskDefinition.create({
      customerId: customer._id,
      name: 'broken',
      enabled: true,
      watchedKeys: ['earnestMoneyAmount'],
      predicates: [],
      actions: [{ type: 'setFlag', config: { flagName: 'broken' } }], // missing `value` -> setFlag handler throws
    })
    await TaskDefinition.create({
      customerId: customer._id,
      name: 'working',
      enabled: true,
      watchedKeys: ['earnestMoneyAmount'],
      predicates: [],
      actions: [{ type: 'setFlag', config: { flagName: 'working', value: true } }],
    })

    const res = await request(app)
      .patch(`/api/transactions/${txn._id}/sot`)
      .send({ changes: [{ key: 'earnestMoneyAmount', value: 12345 }] })

    expect(res.status).toBe(200)
    expect(await AuditLogEntry.countDocuments({ transactionId: txn._id })).toBe(1)

    const updated = await Transaction.findById(txn._id)
    expect(updated?.flags?.get('working')).toBe(true)
    expect(updated?.flags?.get('broken')).toBeUndefined()

    const execs = await TaskExecution.find({ transactionId: txn._id })
    expect(execs).toHaveLength(2)
    const statuses = execs.map(e => e.actionResults[0]?.status).sort()
    expect(statuses).toEqual(['failed', 'ok'])
  })
})
