import {
  Container, Paper, Table, TableHead, TableRow, TableCell, TableBody, Typography,
  Button, Chip, Switch, Stack, Box,
} from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { endpoints } from '../api/endpoints'
import { TopBar } from '../components/TopBar'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { EmptyState } from '../components/EmptyState'
import { PageHeader } from '../components/PageHeader'
import { StatsRow } from '../components/StatsRow'
import { useCustomer } from '../context/CustomerContext'

export function TaskDefinitionsList() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const { selectedCustomerId, selectedCustomer, isAllCustomers, customers } = useCustomer()
  const customerName = (id: string) => customers.find(c => c._id === id)?.name ?? '—'
  const { data, isLoading } = useQuery({
    queryKey: ['task-definitions', selectedCustomerId],
    queryFn: () => endpoints.listTaskDefs(isAllCustomers ? undefined : selectedCustomerId),
    enabled: !!selectedCustomerId,
  })

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      endpoints.updateTaskDef(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-definitions'] }),
  })

  const loading = isLoading || !selectedCustomerId
  const total = data?.length ?? 0
  const enabledCount = (data ?? []).filter(d => d.enabled).length
  const disabledCount = total - enabledCount

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <TopBar />
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <PageHeader
          title="Task Definitions"
          subtitle={loading ? 'Loading…' : `${isAllCustomers ? 'All customers' : selectedCustomer?.name ?? ''} · ${total} defined · ${enabledCount} enabled`}
          actions={
            <Button variant="contained" onClick={() => nav('/task-definitions/new')}>
              New Task Definition
            </Button>
          }
        />

        {!loading && total > 0 && (
          <StatsRow
            stats={[
              { label: 'Total rules', value: total },
              { label: 'Enabled', value: enabledCount },
              { label: 'Disabled', value: disabledCount },
            ]}
          />
        )}

        {loading ? <LoadingSpinner /> : (data?.length ?? 0) === 0 ? (
          <EmptyState title="No task definitions" body="Create one to wire up a trigger." />
        ) : (
          <Paper variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Customer</TableCell>
                  <TableCell>Watched Keys</TableCell>
                  <TableCell align="right">Predicates</TableCell>
                  <TableCell align="right">Actions</TableCell>
                  <TableCell align="right">Enabled</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data!.map(def => (
                  <TableRow key={def._id} hover sx={{ cursor: 'pointer' }}
                    onClick={() => nav(`/task-definitions/${def._id}`)}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{def.name}</Typography>
                      {def.description && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                          {def.description}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {customerName(def.customerId)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" gap={0.5} flexWrap="wrap">
                        {def.watchedKeys.map(k => <Chip key={k} size="small" label={k} variant="outlined" />)}
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" color="text.secondary">{def.predicates.length}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" color="text.secondary">{def.actions.length}</Typography>
                    </TableCell>
                    <TableCell align="right" onClick={e => e.stopPropagation()}>
                      <Switch
                        checked={def.enabled}
                        onChange={e => toggle.mutate({ id: def._id, enabled: e.target.checked })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}
      </Container>
    </Box>
  )
}
