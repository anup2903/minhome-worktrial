import { Schema, model, InferSchemaType, HydratedDocument } from 'mongoose'

const customerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    contactEmail: { type: String, trim: true },
  },
  { timestamps: true },
)

export type CustomerDoc = HydratedDocument<InferSchemaType<typeof customerSchema>>

export const Customer = model('Customer', customerSchema)
