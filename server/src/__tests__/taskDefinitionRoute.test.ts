import request from 'supertest'
import { buildApp } from '../app'
import { Customer } from '../models/Customer'

const app = buildApp()

// These lock in the fix for the gap found in DECISIONS.md #9: a rule with a
// valid action `type` but a nonsensical `config` used to be accepted
// (201) and only ever failed silently at runtime. Each case here is a
// config shape that must now be rejected at creation time instead.
describe('POST /api/task-definitions — action config validation', () => {
  it('rejects a setFlag action missing value', async () => {
    const customer = await Customer.create({ name: 'Test Realty' })
    const res = await request(app)
      .post('/api/task-definitions')
      .send({
        customerId: customer._id.toString(),
        name: 'Broken setFlag rule',
        watchedKeys: ['purchasePrice'],
        predicates: [],
        actions: [{ type: 'setFlag', config: { flagName: 'highValue' } }],
      })
    expect(res.status).toBe(400)
  })

  it('rejects a sendEmail action missing body', async () => {
    const customer = await Customer.create({ name: 'Test Realty' })
    const res = await request(app)
      .post('/api/task-definitions')
      .send({
        customerId: customer._id.toString(),
        name: 'Broken sendEmail rule',
        watchedKeys: ['purchasePrice'],
        predicates: [],
        actions: [{ type: 'sendEmail', config: { to: 'a@x.com', subject: 'hi' } }],
      })
    expect(res.status).toBe(400)
  })

  it('rejects a createNote action with an empty body', async () => {
    const customer = await Customer.create({ name: 'Test Realty' })
    const res = await request(app)
      .post('/api/task-definitions')
      .send({
        customerId: customer._id.toString(),
        name: 'Broken createNote rule',
        watchedKeys: ['purchasePrice'],
        predicates: [],
        actions: [{ type: 'createNote', config: { body: '' } }],
      })
    expect(res.status).toBe(400)
  })

  it('accepts a correctly-shaped setFlag action', async () => {
    const customer = await Customer.create({ name: 'Test Realty' })
    const res = await request(app)
      .post('/api/task-definitions')
      .send({
        customerId: customer._id.toString(),
        name: 'Working setFlag rule',
        watchedKeys: ['purchasePrice'],
        predicates: [],
        actions: [{ type: 'setFlag', config: { flagName: 'highValue', value: true } }],
      })
    expect(res.status).toBe(201)
  })
})

// Locks in the fix for a second, separately-confirmed gap: a numeric-op
// predicate (gt/gte/lt/lte) with a non-numeric `value` used to be accepted
// and then silently never fire (evalPredicate's numeric ops require both
// sides to be numbers). Confirmed by hand against the running dev server
// before this fix: PATCHing a "High-value flag" predicate's value to the
// string "500000" let it save, then a transaction at $1.1M never got
// flagged. See DECISIONS.md §9.
describe('POST/PATCH /api/task-definitions — predicate value validation', () => {
  it('rejects a gte predicate with a string value', async () => {
    const customer = await Customer.create({ name: 'Test Realty' })
    const res = await request(app)
      .post('/api/task-definitions')
      .send({
        customerId: customer._id.toString(),
        name: 'Broken threshold rule',
        watchedKeys: ['purchasePrice'],
        predicates: [{ key: 'purchasePrice', op: 'gte', value: '500000' }],
        actions: [{ type: 'setFlag', config: { flagName: 'highValue', value: true } }],
      })
    expect(res.status).toBe(400)
  })

  it('accepts a gte predicate with a numeric value', async () => {
    const customer = await Customer.create({ name: 'Test Realty' })
    const res = await request(app)
      .post('/api/task-definitions')
      .send({
        customerId: customer._id.toString(),
        name: 'Working threshold rule',
        watchedKeys: ['purchasePrice'],
        predicates: [{ key: 'purchasePrice', op: 'gte', value: 500000 }],
        actions: [{ type: 'setFlag', config: { flagName: 'highValue', value: true } }],
      })
    expect(res.status).toBe(201)
  })

  it('accepts an eq predicate with a string value', async () => {
    const customer = await Customer.create({ name: 'Test Realty' })
    const res = await request(app)
      .post('/api/task-definitions')
      .send({
        customerId: customer._id.toString(),
        name: 'Cash flag',
        watchedKeys: ['financingType'],
        predicates: [{ key: 'financingType', op: 'eq', value: 'cash' }],
        actions: [{ type: 'setFlag', config: { flagName: 'cashDeal', value: true } }],
      })
    expect(res.status).toBe(201)
  })

  it('accepts a bare exists predicate with no value field', async () => {
    const customer = await Customer.create({ name: 'Test Realty' })
    const res = await request(app)
      .post('/api/task-definitions')
      .send({
        customerId: customer._id.toString(),
        name: 'Exists rule',
        watchedKeys: ['agentEmail'],
        predicates: [{ key: 'agentEmail', op: 'exists' }],
        actions: [{ type: 'setFlag', config: { flagName: 'hasAgent', value: true } }],
      })
    expect(res.status).toBe(201)
  })
})

// Phase 4 additions — see DECISIONS.md §5/§9.
describe('POST /api/task-definitions — Phase 4 predicate ops and setField', () => {
  it('rejects an "in" predicate whose value is not an array', async () => {
    const customer = await Customer.create({ name: 'Test Realty' })
    const res = await request(app)
      .post('/api/task-definitions')
      .send({
        customerId: customer._id.toString(),
        name: 'Broken fha-or-va rule',
        watchedKeys: ['financingType'],
        predicates: [{ key: 'financingType', op: 'in', value: 'fha' }],
        actions: [{ type: 'setFlag', config: { flagName: 'x', value: true } }],
      })
    expect(res.status).toBe(400)
  })

  it('accepts an "in" predicate with an array value', async () => {
    const customer = await Customer.create({ name: 'Test Realty' })
    const res = await request(app)
      .post('/api/task-definitions')
      .send({
        customerId: customer._id.toString(),
        name: 'fha-or-va rule',
        watchedKeys: ['financingType'],
        predicates: [{ key: 'financingType', op: 'in', value: ['fha', 'va'] }],
        actions: [{ type: 'setFlag', config: { flagName: 'x', value: true } }],
      })
    expect(res.status).toBe(201)
  })

  it('accepts a numeric predicate value expressed as a $field reference', async () => {
    const customer = await Customer.create({ name: 'Test Realty' })
    const res = await request(app)
      .post('/api/task-definitions')
      .send({
        customerId: customer._id.toString(),
        name: 'Earnest money vs price',
        watchedKeys: ['earnestMoneyAmount'],
        predicates: [{ key: 'earnestMoneyAmount', op: 'lt', value: { $field: 'purchasePrice', multiplier: 0.05 } }],
        actions: [{ type: 'setFlag', config: { flagName: 'x', value: true } }],
      })
    expect(res.status).toBe(201)
  })

  it('rejects a setField action targeting a key that is not a real SOT field', async () => {
    const customer = await Customer.create({ name: 'Test Realty' })
    const res = await request(app)
      .post('/api/task-definitions')
      .send({
        customerId: customer._id.toString(),
        name: 'Broken setField rule',
        watchedKeys: ['financingType'],
        predicates: [{ key: 'financingType', op: 'eq', value: 'cash' }],
        actions: [{ type: 'setField', config: { key: 'notARealField', value: 'x' } }],
      })
    expect(res.status).toBe(400)
  })

  it('accepts a setField action targeting a real SOT field', async () => {
    const customer = await Customer.create({ name: 'Test Realty' })
    const res = await request(app)
      .post('/api/task-definitions')
      .send({
        customerId: customer._id.toString(),
        name: 'Cash -> Harbor Title',
        watchedKeys: ['financingType'],
        predicates: [{ key: 'financingType', op: 'eq', value: 'cash' }],
        actions: [{ type: 'setField', config: { key: 'titleCompany', value: 'Harbor Title' } }],
      })
    expect(res.status).toBe(201)
  })
})

// Generic arithmetic expressions for a predicate's numeric value — the
// {op, left, right} shape that generalizes $field/multiplier to any
// combination of fields and literals via +, -, *, /. See DECISIONS.md §15.
describe('POST /api/task-definitions — generic {op, left, right} expression values', () => {
  it('accepts a nested expression combining a $field reference and a literal', async () => {
    const customer = await Customer.create({ name: 'Test Realty' })
    const res = await request(app)
      .post('/api/task-definitions')
      .send({
        customerId: customer._id.toString(),
        name: 'Purchase price covers earnest money plus a floor',
        watchedKeys: ['purchasePrice', 'earnestMoneyAmount'],
        predicates: [{
          key: 'purchasePrice',
          op: 'gte',
          value: { op: 'add', left: { $field: 'earnestMoneyAmount' }, right: 500000 },
        }],
        actions: [{ type: 'setFlag', config: { flagName: 'x', value: true } }],
      })
    expect(res.status).toBe(201)
  })

  it('rejects an expression using an op outside add/subtract/multiply/divide', async () => {
    const customer = await Customer.create({ name: 'Test Realty' })
    const res = await request(app)
      .post('/api/task-definitions')
      .send({
        customerId: customer._id.toString(),
        name: 'Broken expression rule',
        watchedKeys: ['purchasePrice'],
        predicates: [{ key: 'purchasePrice', op: 'gte', value: { op: 'modulo', left: 10, right: 3 } }],
        actions: [{ type: 'setFlag', config: { flagName: 'x', value: true } }],
      })
    expect(res.status).toBe(400)
  })

  it('rejects an expression nested deeper than the allowed limit', async () => {
    const customer = await Customer.create({ name: 'Test Realty' })
    let value: unknown = 0
    for (let i = 0; i < 10; i++) value = { op: 'add', left: value, right: 1 }
    const res = await request(app)
      .post('/api/task-definitions')
      .send({
        customerId: customer._id.toString(),
        name: 'Too-deep expression rule',
        watchedKeys: ['purchasePrice'],
        predicates: [{ key: 'purchasePrice', op: 'gte', value }],
        actions: [{ type: 'setFlag', config: { flagName: 'x', value: true } }],
      })
    expect(res.status).toBe(400)
  })
})

// Caps on predicates[]/actions[] per definition — both run synchronously
// inside PATCH /sot, so an unbounded array is an availability risk on
// every future edit to a watched key. See DECISIONS.md §16.
describe('POST /api/task-definitions — predicates/actions array size limits', () => {
  it('accepts exactly 10 predicates', async () => {
    const customer = await Customer.create({ name: 'Test Realty' })
    const predicates = Array.from({ length: 10 }, () => ({ key: 'purchasePrice', op: 'gte', value: 0 }))
    const res = await request(app)
      .post('/api/task-definitions')
      .send({
        customerId: customer._id.toString(),
        name: 'Ten predicates',
        watchedKeys: ['purchasePrice'],
        predicates,
        actions: [{ type: 'setFlag', config: { flagName: 'x', value: true } }],
      })
    expect(res.status).toBe(201)
  })

  it('rejects 11 predicates', async () => {
    const customer = await Customer.create({ name: 'Test Realty' })
    const predicates = Array.from({ length: 11 }, () => ({ key: 'purchasePrice', op: 'gte', value: 0 }))
    const res = await request(app)
      .post('/api/task-definitions')
      .send({
        customerId: customer._id.toString(),
        name: 'Eleven predicates',
        watchedKeys: ['purchasePrice'],
        predicates,
        actions: [{ type: 'setFlag', config: { flagName: 'x', value: true } }],
      })
    expect(res.status).toBe(400)
  })

  it('accepts exactly 10 actions', async () => {
    const customer = await Customer.create({ name: 'Test Realty' })
    const actions = Array.from({ length: 10 }, () => ({ type: 'setFlag', config: { flagName: 'x', value: true } }))
    const res = await request(app)
      .post('/api/task-definitions')
      .send({
        customerId: customer._id.toString(),
        name: 'Ten actions',
        watchedKeys: ['purchasePrice'],
        predicates: [{ key: 'purchasePrice', op: 'gte', value: 0 }],
        actions,
      })
    expect(res.status).toBe(201)
  })

  it('rejects 11 actions', async () => {
    const customer = await Customer.create({ name: 'Test Realty' })
    const actions = Array.from({ length: 11 }, () => ({ type: 'setFlag', config: { flagName: 'x', value: true } }))
    const res = await request(app)
      .post('/api/task-definitions')
      .send({
        customerId: customer._id.toString(),
        name: 'Eleven actions',
        watchedKeys: ['purchasePrice'],
        predicates: [{ key: 'purchasePrice', op: 'gte', value: 0 }],
        actions,
      })
    expect(res.status).toBe(400)
  })

  it('PATCH enforces the same limit as POST', async () => {
    const customer = await Customer.create({ name: 'Test Realty' })
    const created = await request(app)
      .post('/api/task-definitions')
      .send({
        customerId: customer._id.toString(),
        name: 'Updatable rule',
        watchedKeys: ['purchasePrice'],
        predicates: [{ key: 'purchasePrice', op: 'gte', value: 0 }],
        actions: [{ type: 'setFlag', config: { flagName: 'x', value: true } }],
      })
    const predicates = Array.from({ length: 11 }, () => ({ key: 'purchasePrice', op: 'gte', value: 0 }))
    const res = await request(app)
      .patch(`/api/task-definitions/${created.body._id}`)
      .send({ predicates })
    expect(res.status).toBe(400)
  })
})
