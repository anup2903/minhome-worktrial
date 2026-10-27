import { EmailLog } from '../../models/EmailLog'
import { resolveTemplate } from './templating'
import type { ActionContext, ActionResult } from './index'

type Config = { to: string; subject: string; body: string }

export async function sendEmail(config: Config, ctx: ActionContext): Promise<ActionResult> {
  if (!config?.to || !config?.subject || !config?.body) {
    throw new Error('sendEmail config requires to, subject, body')
  }
  
  const fields = (ctx.sot.fields?.toObject?.() ?? ctx.sot.fields ?? {}) as Record<string, unknown>
  const vars = { ...fields, editorEmail: ctx.editorEmail, customerContactEmail: ctx.customerContactEmail }
  await EmailLog.create({
    to: resolveTemplate(config.to, vars),
    subject: resolveTemplate(config.subject, vars),
    body: resolveTemplate(config.body, vars),
    sentAt: new Date(),
    taskDefinitionId: ctx.taskDefinition._id,
    transactionId: ctx.transaction._id,
  })
  return { type: 'sendEmail', status: 'ok' }
}
