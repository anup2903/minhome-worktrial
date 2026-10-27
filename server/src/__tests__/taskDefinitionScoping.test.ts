import request from 'supertest'
import { buildApp } from '../app'
import { Customer } from '../models/Customer'
import { TaskDefinition } from '../models/TaskDefinition'

const app = buildApp()

// customerId on GET /api/task-definitions is optional, by explicit user
// request (reverting the Phase 5 cross-tenant tightening — see
// DECISIONS.md §13 addendum): no filter still means "every customer's
// rules," same as day zero. Providing one still filters correctly.
describe('GET /api/task-definitions — optional customer filter', () => {
  it('returns every customer\'s rules when no customerId is given', async () => {
    const a = await Customer.create({ name: 'Customer A' })
    const b = await Customer.create({ name: 'Customer B' })
    await TaskDefinition.create({ customerId: a._id, name: 'A rule', watchedKeys: [], predicates: [], actions: [] })
    await TaskDefinition.create({ customerId: b._id, name: 'B rule', watchedKeys: [], predicates: [], actions: [] })

    const res = await request(app).get('/api/task-definitions')
    expect(res.status).toBe(200)
    expect(res.body.map((d: any) => d.name).sort()).toEqual(['A rule', 'B rule'])
  })

  it('filters to one customer\'s rules when customerId is given', async () => {
    const a = await Customer.create({ name: 'Customer A' })
    const b = await Customer.create({ name: 'Customer B' })
    await TaskDefinition.create({ customerId: a._id, name: 'A rule', watchedKeys: [], predicates: [], actions: [] })
    await TaskDefinition.create({ customerId: b._id, name: 'B rule', watchedKeys: [], predicates: [], actions: [] })

    const res = await request(app).get(`/api/task-definitions?customerId=${a._id}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].name).toBe('A rule')
  })
})

// A rule's customerId must not be movable after creation via PATCH — the
// body-level field is simply not part of the update schema, so a stray
// customerId in the payload is silently ignored rather than honored.
describe('PATCH /api/task-definitions/:id — customerId is not movable', () => {
  it('ignores a customerId in the PATCH body and leaves the original owner intact', async () => {
    const a = await Customer.create({ name: 'Customer A' })
    const b = await Customer.create({ name: 'Customer B' })
    const def = await TaskDefinition.create({ customerId: a._id, name: 'A rule', watchedKeys: [], predicates: [], actions: [] })

    const res = await request(app)
      .patch(`/api/task-definitions/${def._id}`)
      .send({ customerId: b._id.toString(), description: 'updated' })

    expect(res.status).toBe(200)
    expect(res.body.customerId).toBe(a._id.toString())
    expect(res.body.description).toBe('updated')
  })
})

// The dry-run endpoint is the self-serve safety valve: a customer admin
// should be able to test a draft rule against sample data with zero side
// effects before creating it for real.
describe('POST /api/task-definitions/dry-run', () => {
  it('reports wouldFire=true and does not persist anything', async () => {
    const customer = await Customer.create({ name: 'Customer A' })
    const res = await request(app)
      .post('/api/task-definitions/dry-run')
      .send({
        taskDefinition: {
          customerId: customer._id.toString(),
          name: 'Draft rule',
          watchedKeys: ['financingType'],
          predicates: [{ key: 'financingType', op: 'in', value: ['fha', 'va'] }],
          actions: [{ type: 'setFlag', config: { flagName: 'x', value: true } }],
        },
        sot: { financingType: 'FHA' },
      })

    expect(res.status).toBe(200)
    expect(res.body.wouldFire).toBe(true)
    expect(await TaskDefinition.countDocuments({ name: 'Draft rule' })).toBe(0)
  })

  it('reports wouldFire=false with per-predicate detail, and still validates the draft shape', async () => {
    const customer = await Customer.create({ name: 'Customer A' })
    const res = await request(app)
      .post('/api/task-definitions/dry-run')
      .send({
        taskDefinition: {
          customerId: customer._id.toString(),
          name: 'Draft rule',
          watchedKeys: ['purchasePrice'],
          predicates: [{ key: 'purchasePrice', op: 'gte', value: 750000 }],
          actions: [{ type: 'setFlag', config: { flagName: 'highValue', value: true } }],
        },
        sot: { purchasePrice: 645000 },
      })

    expect(res.status).toBe(200)
    expect(res.body.wouldFire).toBe(false)
    expect(res.body.predicateResults[0]).toMatchObject({ passed: false })
    expect(res.body.actions).toEqual([])
  })

  it('rejects a draft with an invalid action config, same as a real create would', async () => {
    const customer = await Customer.create({ name: 'Customer A' })
    const res = await request(app)
      .post('/api/task-definitions/dry-run')
      .send({
        taskDefinition: {
          customerId: customer._id.toString(),
          name: 'Broken draft',
          watchedKeys: ['purchasePrice'],
          predicates: [],
          actions: [{ type: 'setFlag', config: { flagName: 'x' } }], // missing value
        },
        sot: {},
      })

    expect(res.status).toBe(400)
  })
})
