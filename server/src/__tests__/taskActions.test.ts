import { dispatch, ActionContext } from '../services/taskActions'
import { Customer } from '../models/Customer'
import { Transaction } from '../models/Transaction'
import { SourceOfTruth } from '../models/SourceOfTruth'
import { TaskDefinition } from '../models/TaskDefinition'
import { EmailLog } from '../models/EmailLog'
import { Note } from '../models/Note'
import { AuditLogEntry } from '../models/AuditLogEntry'

async function buildCtx(fields: Record<string, unknown> = {}): Promise<ActionContext> {
  const customer = await Customer.create({ name: 'Test Realty' })
  const transaction = await Transaction.create({ customerId: customer._id, address: '1 Main' })
  const sot = await SourceOfTruth.create({ transactionId: transaction._id, fields })
  const taskDefinition = await TaskDefinition.create({ customerId: customer._id, name: 'T', watchedKeys: [], predicates: [], actions: [] })
  return { transaction, sot, taskDefinition, triggeringChanges: [] }
}

describe('taskActions.dispatch', () => {
  it('sendEmail writes EmailLog and resolves {{templateVars}}', async () => {
    const ctx = await buildCtx({ agentEmail: 'a@x.com', agentName: 'Alice' })
    const result = await dispatch(
      { type: 'sendEmail', config: { to: '{{agentEmail}}', subject: 'Hi {{agentName}}', body: 'Hello' } },
      ctx,
    )
    expect(result).toMatchObject({ type: 'sendEmail', status: 'ok' })
    const logged = await EmailLog.findOne({ to: 'a@x.com' })
    expect(logged?.subject).toBe('Hi Alice')
  })

  it('setFlag updates Transaction.flags', async () => {
    const ctx = await buildCtx()
    const result = await dispatch(
      { type: 'setFlag', config: { flagName: 'highValue', value: true } },
      ctx,
    )
    expect(result.status).toBe('ok')
    const updated = await Transaction.findById(ctx.transaction._id)
    expect(updated?.flags?.get('highValue')).toBe(true)
  })

  it('createNote inserts a Note with source=task and resolves templates', async () => {
    const ctx = await buildCtx({ titleCompany: 'Acme' })
    const result = await dispatch(
      { type: 'createNote', config: { body: 'Title is {{titleCompany}}' } },
      ctx,
    )
    expect(result.status).toBe('ok')
    const note = await Note.findOne({ transactionId: ctx.transaction._id })
    expect(note?.body).toBe('Title is Acme')
    expect(note?.source).toBe('task')
  })

  it('returns failed result when handler throws', async () => {
    const ctx = await buildCtx()
    const result = await dispatch({ type: 'setFlag', config: {} as any }, ctx)
    expect(result.status).toBe('failed')
  })

  it('returns a failed result for an unknown action type instead of throwing', async () => {
    // A handler-less type can't reach this through the API today (the
    // zod enum and the handlers map share the same ACTION_TYPES list), but
    // it becomes one commit away from reachable the moment a new action
    // type is added without its handler wired up in the same change — see
    // DECISIONS.md §9. dispatch() must degrade safely either way: an
    // unhandled definition should fail on its own, not throw out of
    // taskService.evaluate()'s loop and take every other queued rule (and
    // the audit log write) down with it.
    const ctx = await buildCtx()
    const result = await dispatch({ type: 'nope' as any, config: {} }, ctx)
    expect(result).toMatchObject({ type: 'nope', status: 'failed' })
    expect(result.detail).toMatch(/unknown action type/i)
  })

  it('setField writes the SOT field, audits it as the rule, and reports the diff for cascading', async () => {
    const ctx = await buildCtx({ financingType: 'cash' })
    const result = await dispatch({ type: 'setField', config: { key: 'titleCompany', value: 'Harbor Title' } }, ctx)
    expect(result.status).toBe('ok')
    expect(result.changes).toEqual([{ key: 'titleCompany', oldValue: undefined, newValue: 'Harbor Title' }])

    const sot = await SourceOfTruth.findOne({ transactionId: ctx.transaction._id })
    expect(sot?.fields?.titleCompany).toBe('Harbor Title')

    const entry = await AuditLogEntry.findOne({ transactionId: ctx.transaction._id })
    expect(entry?.actor).toBe(`rule:${ctx.taskDefinition._id}`)
  })

  it('setField reports no changes (and does not audit) on a no-op write', async () => {
    const ctx = await buildCtx({ titleCompany: 'Harbor Title' })
    const result = await dispatch({ type: 'setField', config: { key: 'titleCompany', value: 'Harbor Title' } }, ctx)
    expect(result.changes).toEqual([])
    expect(await AuditLogEntry.countDocuments({ transactionId: ctx.transaction._id })).toBe(0)
  })

  it('rejects a setField key that is not a real SOT field', async () => {
    const ctx = await buildCtx()
    const result = await dispatch({ type: 'setField', config: { key: 'bogus', value: 'x' } }, ctx)
    expect(result.status).toBe('failed')
  })
})
