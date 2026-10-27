import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose'

// Tracks whether a definition's actions have already run for the current
// "stay true" streak of its predicates on a given transaction
const taskFireStateSchema = new Schema(
  {
    taskDefinitionId: { type: Schema.Types.ObjectId, ref: 'TaskDefinition', required: true },
    transactionId: { type: Schema.Types.ObjectId, ref: 'Transaction', required: true },
    armed: { type: Boolean, default: false },
  },
  { timestamps: true },
)

taskFireStateSchema.index({ taskDefinitionId: 1, transactionId: 1 }, { unique: true })

export type TaskFireStateDoc = HydratedDocument<InferSchemaType<typeof taskFireStateSchema>>

export const TaskFireState = model('TaskFireState', taskFireStateSchema)
