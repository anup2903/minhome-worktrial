import { Request, Response, NextFunction } from 'express'
import { Customer } from '../models/Customer'
import { updateCustomerBody } from '../validations/customer'
import { objectIdParam } from '../validations/common'
import { NotFoundError } from '../errors'

export const CustomerController = {
  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await Customer.find().sort({ name: 1 }))
    } catch (e) { next(e) }
  },

  // Self-serve replacement for hand-editing contactEmail in Mongo (see
  // DECISIONS.md §17). `null` unsets the field rather than storing "null".
  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = objectIdParam.parse(req.params)
      const { contactEmail } = updateCustomerBody.parse(req.body)
      const update = contactEmail === null ? { $unset: { contactEmail: '' } } : { $set: { contactEmail } }
      const updated = await Customer.findByIdAndUpdate(id, update, { new: true })
      if (!updated) throw new NotFoundError('Customer', id)
      res.json(updated)
    } catch (e) { next(e) }
  },
}
