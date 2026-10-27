import { Box, Stack, Typography } from '@mui/material'
import { ReactNode } from 'react'

type Stat = { label: string; value: ReactNode }

export function StatsRow({ stats }: { stats: Stat[] }) {
  return (
    <Stack direction="row" spacing={2} sx={{ mb: 3, flexWrap: 'wrap' }}>
      {stats.map(s => (
        <Box
          key={s.label}
          sx={{
            flex: '1 1 160px',
            minWidth: 150,
            bgcolor: '#eff4ff',
            borderRadius: '16px',
            px: 2.5,
            py: 2,
          }}
        >
          <Typography sx={{ fontWeight: 700, fontSize: '1.65rem', letterSpacing: '-0.02em', color: 'primary.dark', lineHeight: 1.1 }}>
            {s.value}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {s.label}
          </Typography>
        </Box>
      ))}
    </Stack>
  )
}
