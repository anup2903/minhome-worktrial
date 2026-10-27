import { api } from './client'
import type {
  Customer, Txn, Sot, AuditEntry, TaskExec, TaskDef, EmailLogEntry, Note, Paginated,
} from '../types'

export const endpoints = {
  me: () => api.get<{ user: { email: string; name: string } }>('/api/me').then(r => r.data),

  listCustomers: () => api.get<Customer[]>('/api/customers').then(r => r.data),

  listTxns: (params: { customerId?: string; status?: string; limit?: number; offset?: number } = {}) =>
    api.get<Paginated<Txn>>('/api/transactions', { params }).then(r => r.data),
  createTxn: (body: { customerId: string; address: string; status?: string }) =>
    api.post<Txn>('/api/transactions', body).then(r => r.data),
  getTxn: (id: string) =>
    api.get<{ transaction: Txn; sourceOfTruth: Sot | null }>(`/api/transactions/${id}`).then(r => r.data),
  updateTxn: (id: string, body: Partial<{ address: string; status: string }>) =>
    api.patch<Txn>(`/api/transactions/${id}`, body).then(r => r.data),
  deleteTxn: (id: string) =>
    api.delete(`/api/transactions/${id}`).then(r => r.data),

  patchSot: (id: string, changes: Array<{ key: string; value: unknown }>) =>
    api.patch<{ ok: true; changed: string[] }>(`/api/transactions/${id}/sot`, { changes }).then(r => r.data),

  listAudit: (id: string, params: { limit?: number; offset?: number } = {}) =>
    api.get<Paginated<AuditEntry>>(`/api/transactions/${id}/audit-log`, { params }).then(r => r.data),

  listExecs: (id: string, params: { limit?: number; offset?: number } = {}) =>
    api.get<Paginated<TaskExec>>(`/api/transactions/${id}/task-executions`, { params }).then(r => r.data),

  listTaskDefs: (customerId?: string) =>
    api.get<TaskDef[]>('/api/task-definitions', { params: customerId ? { customerId } : {} }).then(r => r.data),
  createTaskDef: (body: Omit<TaskDef, '_id' | 'createdAt' | 'updatedAt'>) =>
    api.post<TaskDef>('/api/task-definitions', body).then(r => r.data),
  getTaskDef: (id: string) => api.get<TaskDef>(`/api/task-definitions/${id}`).then(r => r.data),
  updateTaskDef: (id: string, body: Partial<TaskDef>) =>
    api.patch<TaskDef>(`/api/task-definitions/${id}`, body).then(r => r.data),
  deleteTaskDef: (id: string) => api.delete(`/api/task-definitions/${id}`).then(r => r.data),

  listEmail: (params: { transactionId?: string; limit?: number; offset?: number } = {}) =>
    api.get<Paginated<EmailLogEntry>>('/api/email-log', { params }).then(r => r.data),

  listNotes: (transactionId: string, params: { limit?: number; offset?: number } = {}) =>
    api.get<Paginated<Note>>('/api/notes', { params: { transactionId, ...params } }).then(r => r.data),
}
