import { z } from 'zod'

/**
 * Per-document KYB extraction schemas. Each PDF is extracted independently;
 * the verification service merges them into a single KybSubmission row.
 *
 * Field names mirror prisma KybSubmission / BusinessProfile columns where
 * possible so the merge step is dumb-mapping rather than translation.
 */

const trimmedString = z.string().trim().min(1).nullable()
const optionalInt   = z.number().int().nullable()

// ─── Certificate of Incorporation ────────────────────────────────────────────

export const incorporationExtractionSchema = z.object({
  companyName:         trimmedString,                         // e.g. "ACME SAS"
  legalName:           trimmedString,                         // razón social legal
  incorporationNumber: trimmedString,                         // matrícula mercantil
  taxNumber:           trimmedString,                         // NIT (Colombia)
  companyType:         trimmedString,                         // SAS, LTDA, SA, etc.
  country:             trimmedString,                         // ISO-2 or ISO-3, e.g. "CO"
  city:                trimmedString,
  stateRegion:         trimmedString,
  street:              trimmedString,
  postalCode:          trimmedString,
  foundedYear:         optionalInt,                           // YYYY
  industry:            trimmedString,                         // economic activity / CIIU description
  repFirstName:        trimmedString,                         // legal representative
  repLastName:         trimmedString,
  repDocType:          trimmedString,                         // CC, CE, PASAPORTE
  repDocNumber:        trimmedString,
})
export type IncorporationExtraction = z.infer<typeof incorporationExtractionSchema>

// ─── Articles of Association / Bylaws ────────────────────────────────────────

export const articlesExtractionSchema = z.object({
  companyType:         trimmedString,
  shareClasses:        z.array(z.string()).default([]),       // e.g. ["ORDINARIAS", "PREFERENCIALES"]
  signingThresholds:   z.string().nullable(),                 // free-text summary of who can bind the company
  boardSize:           optionalInt,
  fiscalYearEnd:       trimmedString,                         // e.g. "12-31"
  durationYears:       optionalInt,                           // company duration (often "indefinida" → null)
  governanceSummary:   z.string().nullable(),                 // free-text 1-3 sentence summary
})
export type ArticlesExtraction = z.infer<typeof articlesExtractionSchema>

// ─── Membership / Shareholders Certificate ───────────────────────────────────

export const shareholderSchema = z.object({
  name:          trimmedString,
  documentType:  trimmedString,   // CC, CE, NIT
  documentNumber:trimmedString,
  percentage:    z.number().min(0).max(100).nullable(),  // ownership %
  shareClass:    trimmedString,   // optional — falls back to "ORDINARIAS"
})
export type ShareholderExtraction = z.infer<typeof shareholderSchema>

export const shareholdersExtractionSchema = z.object({
  asOfDate:     trimmedString,                                // e.g. "2026-01-15"
  totalShares:  optionalInt,
  shareholders: z.array(shareholderSchema).default([]),
})
export type ShareholdersExtraction = z.infer<typeof shareholdersExtractionSchema>
