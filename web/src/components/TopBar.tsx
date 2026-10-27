import { AppBar, Toolbar, Typography, Box, Stack, Avatar, TextField, MenuItem } from '@mui/material'
import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { endpoints } from '../api/endpoints'
import { useCustomer, ALL_CUSTOMERS } from '../context/CustomerContext'

const navLinkStyle = ({ isActive }: { isActive: boolean }) => ({
  textDecoration: 'none',
  color: isActive ? '#0b1220' : '#475569',
  fontWeight: isActive ? 600 : 500,
  fontSize: '0.9rem',
  padding: '8px 16px',
  borderRadius: 999,
  background: isActive ? 'rgba(37, 99, 235, 0.10)' : 'transparent',
  transition: 'background 0.15s ease, color 0.15s ease',
})

function initials(name: string): string {
  return name.split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

export function TopBar() {
  const { data } = useQuery({ queryKey: ['me'], queryFn: endpoints.me })
  const { customers, selectedCustomerId, setSelectedCustomerId } = useCustomer()

  return (
    <AppBar position="static">
      <Toolbar sx={{ minHeight: 60 }}>
        <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mr: 4 }}>
          <Box sx={{
            width: 28, height: 28, borderRadius: 1.25,
            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', fontWeight: 700, fontSize: 13, letterSpacing: 0.5,
          }}>
            M
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 600, letterSpacing: '-0.01em' }}>
            MinHome
          </Typography>
        </Stack>
        <Stack direction="row" spacing={0.5} sx={{ flexGrow: 1 }}>
          <NavLink to="/transactions" style={navLinkStyle as any}>Transactions</NavLink>
          <NavLink to="/task-definitions" style={navLinkStyle as any}>Task Definitions</NavLink>
        </Stack>
        {customers.length > 0 && (
          <TextField
            select
            size="small"
            value={selectedCustomerId}
            onChange={e => setSelectedCustomerId(e.target.value)}
            sx={{ minWidth: 200, mr: 2.5 }}
          >
            <MenuItem value={ALL_CUSTOMERS}>All customers</MenuItem>
            {customers.map(c => (
              <MenuItem key={c._id} value={c._id}>{c.name}</MenuItem>
            ))}
          </TextField>
        )}
        {data?.user && (
          <Stack direction="row" alignItems="center" spacing={1.25}>
            <Box sx={{ textAlign: 'right' }}>
              <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.15 }}>
                {data.user.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {data.user.email}
              </Typography>
            </Box>
            <Avatar sx={{
              width: 34, height: 34, fontSize: 13, fontWeight: 600,
              bgcolor: 'rgba(37, 99, 235, 0.12)', color: 'primary.main',
            }}>
              {initials(data.user.name)}
            </Avatar>
          </Stack>
        )}
      </Toolbar>
    </AppBar>
  )
}
