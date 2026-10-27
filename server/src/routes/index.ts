import { Router } from 'express'
import { MeController } from '../controllers/MeController'
import { TransactionController } from '../controllers/TransactionController'
import { SourceOfTruthController } from '../controllers/SourceOfTruthController'
import { TaskDefinitionController } from '../controllers/TaskDefinitionController'
import { AuditLogController } from '../controllers/AuditLogController'
import { TaskExecutionController } from '../controllers/TaskExecutionController'
import { EmailLogController } from '../controllers/EmailLogController'
import { NoteController } from '../controllers/NoteController'
import { CustomerController } from '../controllers/CustomerController'
import { InternalController } from '../controllers/InternalController'

export function buildApiRouter(): Router {
  const r = Router()

  r.get('/me', MeController.get)

  r.get('/customers', CustomerController.list)
  r.patch('/customers/:id', CustomerController.update)

  r.get('/transactions', TransactionController.list)
  r.post('/transactions', TransactionController.create)
  r.get('/transactions/:id', TransactionController.getById)
  r.patch('/transactions/:id', TransactionController.update)
  r.delete('/transactions/:id', TransactionController.remove)

  r.get('/transactions/:id/sot', SourceOfTruthController.get)
  r.patch('/transactions/:id/sot', SourceOfTruthController.patch)

  r.get('/transactions/:id/audit-log', AuditLogController.listForTransaction)
  r.get('/transactions/:id/task-executions', TaskExecutionController.listForTransaction)

  r.get('/task-definitions', TaskDefinitionController.list)
  r.post('/task-definitions', TaskDefinitionController.create)
  r.post('/task-definitions/dry-run', TaskDefinitionController.dryRun)
  r.get('/task-definitions/:id', TaskDefinitionController.getById)
  r.patch('/task-definitions/:id', TaskDefinitionController.update)
  r.delete('/task-definitions/:id', TaskDefinitionController.remove)

  r.get('/email-log', EmailLogController.list)
  r.get('/notes', NoteController.list)

  r.post('/internal/sweep', InternalController.sweep)

  return r
}
