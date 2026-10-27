import { Note } from '../../models/Note'
import { resolveTemplate } from './templating'
import type { ActionContext, ActionResult } from './index'

type Config = { body: string }

export async function createNote(config: Config, ctx: ActionContext): Promise<ActionResult> {
  if (!config?.body) {
    throw new Error('createNote config requires body')
  }
  
  const fields = (ctx.sot.fields?.toObject?.() ?? ctx.sot.fields ?? {}) as Record<string, unknown>
  const vars = { ...fields, editorEmail: ctx.editorEmail, customerContactEmail: ctx.customerContactEmail }
  await Note.create({
    transactionId: ctx.transaction._id,
    body: resolveTemplate(config.body, vars),
    source: 'task',
    taskDefinitionId: ctx.taskDefinition._id,
  })
  return { type: 'createNote', status: 'ok' }
}
