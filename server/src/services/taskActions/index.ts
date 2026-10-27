import type { TransactionDoc } from '../../models/Transaction'
import type { SourceOfTruthDoc, SotChange } from '../../models/SourceOfTruth'
import type { TaskDefinitionDoc } from '../../models/TaskDefinition'
import { sendEmail } from './sendEmail'
import { setFlag } from './setFlag'
import { createNote } from './createNote'
import { setField } from './setField'

export type ActionContext = {
  transaction: TransactionDoc
  sot: SourceOfTruthDoc
  taskDefinition: TaskDefinitionDoc
  triggeringChanges: SotChange[]
  editorEmail?: string
  customerContactEmail?: string
}

export type ActionResult = {
  type: string
  status: 'ok' | 'failed'
  detail?: string
  // Only set by setField: the SOT diff it actually wrote, so taskService
  // can cascade re-evaluation off of it. 
  changes?: SotChange[]
}

export type Action = { type: string; config: any }

const handlers: Record<string, (config: any, ctx: ActionContext) => Promise<ActionResult>> = {
  sendEmail,
  setFlag,
  createNote,
  setField,
}

export async function dispatch(action: Action, ctx: ActionContext): Promise<ActionResult> {
  const handler = handlers[action.type]
  if (!handler) {
    return { type: action.type, status: 'failed', detail: `Unknown action type: ${action.type}` }
  }
  try {
    return await handler(action.config, ctx)
  } catch (err) {
    return { type: action.type, status: 'failed', detail: (err as Error).message }
  }
}
