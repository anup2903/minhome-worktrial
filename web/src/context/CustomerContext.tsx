import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { endpoints } from '../api/endpoints'
import type { Customer } from '../types'

type CustomerContextValue = {
  customers: Customer[]
  isLoading: boolean
  selectedCustomerId: string
  setSelectedCustomerId: (id: string) => void
  selectedCustomer: Customer | undefined
  isAllCustomers: boolean
}

const CustomerContext = createContext<CustomerContextValue | undefined>(undefined)

const STORAGE_KEY = 'minhome.selectedCustomerId'

// Sentinel for "no tenant filter — show every customer's data." Kept
// distinct from '' (which means "nothing selected yet, still loading")
// so the two states can't be confused.
export const ALL_CUSTOMERS = '__all__'

// Single source of truth for "which customer's data is the app showing right
// now." Lives above the router so every page reads/writes the same
// selection — switching it in one tab's dropdown is reflected everywhere
// else that reads this context, no extra wiring per page.
export function CustomerProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({ queryKey: ['customers'], queryFn: endpoints.listCustomers })

  const [selectedCustomerId, setSelectedCustomerIdState] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_KEY) ?? '' } catch { return '' }
  })

  const setSelectedCustomerId = (id: string) => {
    setSelectedCustomerIdState(id)
    try { localStorage.setItem(STORAGE_KEY, id) } catch { /* ignore */ }
  }

  // Pick a valid default once customers load: keep a remembered selection
  // (including "All") if it still makes sense, otherwise fall back to the
  // first customer.
  useEffect(() => {
    if (!data || data.length === 0) return
    const stillValid = selectedCustomerId === ALL_CUSTOMERS || data.some(c => c._id === selectedCustomerId)
    if (!stillValid) setSelectedCustomerId(data[0]._id)
  }, [data, selectedCustomerId])

  const isAllCustomers = selectedCustomerId === ALL_CUSTOMERS
  const selectedCustomer = data?.find(c => c._id === selectedCustomerId)

  const value = useMemo<CustomerContextValue>(() => ({
    customers: data ?? [],
    isLoading,
    selectedCustomerId,
    setSelectedCustomerId,
    selectedCustomer,
    isAllCustomers,
  }), [data, isLoading, selectedCustomerId, selectedCustomer, isAllCustomers])

  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>
}

export function useCustomer(): CustomerContextValue {
  const ctx = useContext(CustomerContext)
  if (!ctx) throw new Error('useCustomer must be used within a CustomerProvider')
  return ctx
}
