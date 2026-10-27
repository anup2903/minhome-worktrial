import React from 'react'
import ReactDOM from 'react-dom/client'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { CustomerProvider } from './context/CustomerContext'

const theme = createTheme({
  palette: {
    primary: { main: '#2563eb', dark: '#1d4ed8' },
    background: { default: '#ffffff', paper: '#ffffff' },
    divider: 'rgba(37, 99, 235, 0.10)',
    text: { primary: '#0b1220', secondary: '#475569' },
    success: { main: '#16a34a' },
    error: { main: '#dc2626' },
    warning: { main: '#d97706' },
    action: { hover: 'rgba(37, 99, 235, 0.05)' },
  },
  shape: { borderRadius: 14 },
  spacing: 8,
  typography: {
    fontFamily: '"Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif',
    h5: { fontWeight: 700, fontSize: '1.65rem', letterSpacing: '-0.02em' },
    h6: { fontWeight: 600, fontSize: '1.125rem' },
    subtitle1: { fontWeight: 600, fontSize: '0.95rem' },
    subtitle2: { fontWeight: 600, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.06em' },
    body2: { fontSize: '0.875rem', lineHeight: 1.55 },
    button: { textTransform: 'none', fontWeight: 500 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: '#ffffff' },
      },
    },
    MuiPaper: {
      styleOverrides: {
        outlined: {
          border: '1px solid rgba(15, 23, 42, 0.08)',
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04), 0 16px 32px -20px rgba(37, 99, 235, 0.25)',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 20 },
      },
    },
    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'inherit' },
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',
          color: '#0b1220',
          boxShadow: '0 1px 0 rgba(37, 99, 235, 0.08), 0 8px 24px -18px rgba(15, 23, 42, 0.25)',
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-head': {
            fontSize: '0.72rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: '#475569',
            backgroundColor: '#eff4ff',
            borderBottomColor: 'rgba(37, 99, 235, 0.10)',
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottomColor: 'rgba(37, 99, 235, 0.08)' },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: { height: 3, borderRadius: 1.5 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          minHeight: 44,
          fontSize: '0.9rem',
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600, borderRadius: 999, paddingLeft: 18, paddingRight: 18 },
        sizeMedium: { paddingTop: 8, paddingBottom: 8 },
        containedPrimary: {
          boxShadow: '0 1px 2px rgba(37, 99, 235, 0.15)',
          '&:hover': { boxShadow: '0 10px 20px -8px rgba(37, 99, 235, 0.45)' },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        sizeSmall: { height: 22, fontSize: '0.72rem', fontWeight: 500 },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small' },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 10 },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:last-of-type td': { borderBottom: 'none' },
        },
      },
    },
  },
})

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, refetchOnWindowFocus: false, retry: 1 },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <CustomerProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </CustomerProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
