import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose'

export const PREDICATE_OPS = [
  'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'exists', 'notExists',
  'in', 'notIn', 'daysUntilLte', 'daysUntilGt',
] as const

export const ACTION_TYPES = ['sendEmail', 'setFlag', 'createNote', 'setField'] as const

const predicateSchema = new Schema(
  {
    key: { type: String, required: true },
    op: { type: String, enum: PREDICATE_OPS, required: true },
    value: { type: Schema.Types.Mixed },
  },
  { _id: false },
)

const actionSchema = new Schema(
  {
    type: { type: String, enum: ACTION_TYPES, required: true },
    config: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false },
)

const taskDefinitionSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    watchedKeys: { type: [String], default: [] },
    predicates: { type: [predicateSchema], default: [] },
    actions: { type: [actionSchema], default: [] },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
)

export type TaskDefinitionDoc = HydratedDocument<InferSchemaType<typeof taskDefinitionSchema>>

export const TaskDefinition = model('TaskDefinition', taskDefinitionSchema)
