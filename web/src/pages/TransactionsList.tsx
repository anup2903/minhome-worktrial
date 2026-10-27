import { useState } from 'react'
import {
  Container, Paper, Table, TableBody, TableCell, TableHead, TableRow,
  Button, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Chip, Stack, MenuItem, Box, Typography,
} from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { endpoints } from '../api/endpoints'
import { TopBar } from '../components/TopBar'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { StatsRow } from '../components/StatsRow'
import { transactionStatusColor } from '../utils/status'
import { useCustomer } from '../context/CustomerContext'

function formatDate(d?: unknown) {
  if (typeof d !== 'string') return '—'
  return new Date(d).toLocaleDateString()
}

function formatPrice(n?: unknown) {
  if (typeof n !== 'number') return null
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

const initialDraft = { customerId: '', address: '', buyerName: '', sellerName: '', status: 'active' as const }

export function TransactionsList() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(initialDraft)
  const { customers, selectedCustomerId, selectedCustomer, isAllCustomers } = useCustomer()
  const customerName = (id: string) => customers.find(c => c._id === id)?.name ?? '—'

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', selectedCustomerId],
    queryFn: () => endpoints.listTxns({ customerId: isAllCustomers ? undefined : selectedCustomerId }),
    enabled: !!selectedCustomerId,
  })

  const createMut = useMutation({
    mutationFn: async () => {
      const txn = await endpoints.createTxn({ customerId: draft.customerId, address: draft.address, status: draft.status })
      const sotChanges = [
        { key: 'propertyAddress', value: draft.address },
        ...(draft.buyerName ? [{ key: 'buyerName', value: draft.buyerName }] : []),
        ...(draft.sellerName ? [{ key: 'sellerName', value: draft.sellerName }] : []),
      ]
      if (sotChanges.length > 0) {
        await endpoints.patchSot(txn._id, sotChanges)
      }
      return txn
    },
    onSuccess: txn => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      setOpen(false)
      setDraft(initialDraft)
      nav(`/transactions/${txn._id}`)
    },
  })

  const loading = isLoading || !selectedCustomerId
  const total = data?.total ?? 0
  const items = data?.items ?? []
  const activeCount = items.filter(t => t.status === 'active').length
  const flaggedCount = items.filter(t => Object.values(t.flags ?? {}).some(Boolean)).length

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <TopBar />
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <PageHeader
          title="Transactions"
          subtitle={loading ? 'Loading…' : `${isAllCustomers ? 'All customers' : selectedCustomer?.name ?? ''} · ${total} ${total === 1 ? 'transaction' : 'transactions'} on file`}
          actions={
            <Button variant="contained" onClick={() => { setDraft({ ...initialDraft, customerId: isAllCustomers ? '' : selectedCustomerId }); setOpen(true) }}>
              New Transaction
            </Button>
          }
        />

        {!loading && items.length > 0 && (
          <StatsRow
            stats={[
              { label: 'Total transactions', value: total },
              { label: 'Active', value: activeCount },
              { label: 'Flagged', value: flaggedCount },
            ]}
          />
        )}

        {loading ? <LoadingSpinner /> : (data?.items?.length ?? 0) === 0 ? (
          <EmptyState title="No transactions yet" body="Create one to get started." />
        ) : (
          <Paper variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Address</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Flags</TableCell>
                  <TableCell>Last Updated</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data!.items.map(txn => {
                  const activeFlags = Object.entries(txn.flags ?? {}).filter(([, v]) => v).map(([k]) => k)
                  return (
                    <TableRow
                      key={txn._id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => nav(`/transactions/${txn._id}`)}
                    >
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {txn.address}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {customerName(txn.customerId)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={txn.status}
                          color={transactionStatusColor(txn.status)}
                          variant={txn.status === 'active' ? 'filled' : 'outlined'}
                        />
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" gap={0.5} flexWrap="wrap">
                          {activeFlags.length === 0 ? (
                            <Typography variant="caption" color="text.secondary">—</Typography>
                          ) : activeFlags.map(k => (
                            <Chip key={k} size="small" label={k} color="primary" variant="outlined" />
                          ))}
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {formatDate(txn.updatedAt)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Paper>
        )}
      </Container>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 600 }}>New Transaction</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              select
              fullWidth
              label="Customer"
              value={draft.customerId}
              onChange={e => setDraft(d => ({ ...d, customerId: e.target.value }))}
            >
              {customers.map(c => (
                <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>
              ))}
            </TextField>
            <TextField
              autoFocus
              fullWidth
              label="Address"
              value={draft.address}
              onChange={e => setDraft(d => ({ ...d, address: e.target.value }))}
            />
            <TextField
              fullWidth
              label="Buyer Name"
              value={draft.buyerName}
              onChange={e => setDraft(d => ({ ...d, buyerName: e.target.value }))}
            />
            <TextField
              fullWidth
              label="Seller Name"
              value={draft.sellerName}
              onChange={e => setDraft(d => ({ ...d, sellerName: e.target.value }))}
            />
            <TextField
              select
              fullWidth
              label="Status"
              value={draft.status}
              onChange={e => setDraft(d => ({ ...d, status: e.target.value as typeof d.status }))}
            >
              <MenuItem value="active">active</MenuItem>
              <MenuItem value="closed">closed</MenuItem>
              <MenuItem value="cancelled">cancelled</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!draft.customerId || !draft.address.trim() || createMut.isPending}
            onClick={() => createMut.mutate()}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

void formatPrice
