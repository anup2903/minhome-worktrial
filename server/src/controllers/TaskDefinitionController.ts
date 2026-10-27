import { Request, Response, NextFunction } from 'express'
import { TaskDefinition } from '../models/TaskDefinition'
import {
  createTaskDefinitionBody,
  updateTaskDefinitionBody,
  listTaskDefinitionsQuery,
  dryRunBody,
} from '../validations/taskDefinition'
import { objectIdParam } from '../validations/common'
import { NotFoundError } from '../errors'
import { evaluatePredicatesDetailed } from '../services/taskPredicates'

export const TaskDefinitionController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { customerId } = listTaskDefinitionsQuery.parse(req.query)
      const q = customerId ? { customerId } : {}
      res.json(await TaskDefinition.find(q).sort({ name: 1 }))
    } catch (e) { next(e) }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const body = createTaskDefinitionBody.parse(req.body)
      const created = await TaskDefinition.create(body)
      res.status(201).json(created)
    } catch (e) { next(e) }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = objectIdParam.parse(req.params)
      const def = await TaskDefinition.findById(id)
      if (!def) throw new NotFoundError('TaskDefinition', id)
      res.json(def)
    } catch (e) { next(e) }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = objectIdParam.parse(req.params)
      const body = updateTaskDefinitionBody.parse(req.body)
      const updated = await TaskDefinition.findByIdAndUpdate(id, { $set: body }, { new: true })
      if (!updated) throw new NotFoundError('TaskDefinition', id)
      res.json(updated)
    } catch (e) { next(e) }
  },

  async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = objectIdParam.parse(req.params)
      const deleted = await TaskDefinition.findByIdAndDelete(id)
      if (!deleted) throw new NotFoundError('TaskDefinition', id)
      res.status(204).end()
    } catch (e) { next(e) }
  },

  // Lets a customer admin test a draft rule against sample SOT data before
  // creating it for real. Validates against the exact same schema `create`
  // uses, then only evaluates predicates — no TaskDefinition/TaskExecution/
  // TaskFireState write and no dispatch() call, so no email/flag/note/
  // setField side effects happen on this path.
  async dryRun(req: Request, res: Response, next: NextFunction) {
    try {
      const { taskDefinition, sot } = dryRunBody.parse(req.body)
      const predicateResults = evaluatePredicatesDetailed(taskDefinition.predicates, sot)
      const wouldFire = predicateResults.every(r => r.passed)
      res.json({
        wouldFire,
        predicateResults,
        actions: wouldFire ? taskDefinition.actions : [],
      })
    } catch (e) { next(e) }
  },
}
