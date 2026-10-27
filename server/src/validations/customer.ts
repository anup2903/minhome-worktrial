import { z } from 'zod'

// contactEmail is the only field exposed for self-serve update today — name
// is set at onboarding and isn't part of this ask. `null` explicitly clears
// a previously-set contact email (unsets the field) rather than storing the
// literal string "null".
export const updateCustomerBody = z.object({
  contactEmail: z.union([z.string().trim().email(), z.null()]),
})
