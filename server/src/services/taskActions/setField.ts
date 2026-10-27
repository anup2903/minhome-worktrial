import { sourceOfTruthService } from '../sourceOfTruthService'
import { auditLogService } from '../auditLogService'
import { SOT_FIELD_KEYS } from '../../config/sotSchema'
import type { ActionContext, ActionResult } from './index'

type Config = { key: string; value: unknown }

export async function setField(config: Config, ctx: ActionContext): Promise<ActionResult> {
  if (!config?.key || !(SOT_FIELD_KEYS as readonly string[]).includes(config.key)) {
    throw new Error('setField config requires a valid SOT field key')
  }
  const diff = await sourceOfTruthService.applyChanges(ctx.transaction._id.toString(), [
    { key: config.key, value: config.value },
  ])
  if (diff.length > 0) {
    // Audit trail should say a rule wrote this, not the human who made the
    // edit that triggered it — see DECISIONS.md §4.
    await auditLogService.record(ctx.transaction._id.toString(), diff, `rule:${ctx.taskDefinition._id}`)
  }
  return { type: 'setField', status: 'ok', changes: diff }
}
