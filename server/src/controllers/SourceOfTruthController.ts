import { Request, Response, NextFunction } from 'express'
import { sourceOfTruthService } from '../services/sourceOfTruthService'
import { taskService } from '../services/taskService'
import { auditLogService } from '../services/auditLogService'
import { patchSotBody } from '../validations/sourceOfTruth'
import { objectIdParam } from '../validations/common'
import { NotFoundError } from '../errors'

export const SourceOfTruthController = {
  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = objectIdParam.parse(req.params)
      const sot = await sourceOfTruthService.getByTransactionId(id)
      if (!sot) throw new NotFoundError('SourceOfTruth', id)
      res.json(sot)
    } catch (e) { next(e) }
  },

  async patch(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = objectIdParam.parse(req.params)
      const { changes } = patchSotBody.parse(req.body)

      const diff = await sourceOfTruthService.applyChanges(id, changes as { key: string; value: unknown }[])

      await taskService.evaluate(id, diff, req.currentUser.email)
      await auditLogService.record(id, diff, req.currentUser.email)

      res.json({ ok: true, changed: diff.map(c => c.key) })
    } catch (e) { next(e) }
  },
}
