import { z } from 'zod'

export const updateIndividualSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  displayName: z.string().min(1).max(100).optional(),
  dateOfBirth: z.string().datetime().optional(),
  nationality: z.string().length(2).optional(),
  countryOfResidence: z.string().length(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  telegram: z.string().max(50).optional(),
  twitter: z.string().max(50).optional(),
  linkedin: z.string().max(100).optional(),
})

export const updateBusinessSchema = z.object({
  companyName: z.string().min(1).max(200).optional(),
  legalName: z.string().min(1).max(200).optional(),
  taxId: z.string().max(50).optional(),
  registrationNumber: z.string().max(100).optional(),
  industry: z.string().max(100).optional(),
  companySize: z.enum(['MICRO', 'SMALL', 'MEDIUM', 'LARGE']).optional(),
  foundedYear: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
  website: z.string().url().optional(),
  description: z.string().max(1000).optional(),
  country: z.string().length(2).optional(),
  city: z.string().max(100).optional(),
  address: z.string().max(300).optional(),
  postalCode: z.string().max(20).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  telegram: z.string().max(50).optional(),
  linkedin: z.string().max(100).optional(),
  repFirstName: z.string().max(100).optional(),
  repLastName: z.string().max(100).optional(),
  repTitle: z.string().max(100).optional(),
  repEmail: z.string().email().optional(),
  repPhone: z.string().max(30).optional(),
})

export type UpdateIndividualInput = z.infer<typeof updateIndividualSchema>
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>
