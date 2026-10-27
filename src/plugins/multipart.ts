import fp from 'fastify-plugin'
import multipart from '@fastify/multipart'

/**
 * Multipart is registered ONLY inside `documentsRoutes` (public Pinata/IPFS docs),
 * not globally. KYB / KYC / credit-score files go direct to Supabase Storage via
 * signed upload URLs and never transit the API.
 *
 * Limits sit under Vercel's 4.5 MB request-body cap (file + multipart framing),
 * so oversize uploads fail with a clear 413 from Fastify instead of an opaque
 * platform error.
 */
export const MULTIPART_MAX_FILE_BYTES = 4 * 1024 * 1024 // 4 MB

export default fp(async (app) => {
  await app.register(multipart, {
    limits: {
      fileSize:  MULTIPART_MAX_FILE_BYTES,
      files:     1,
      fieldSize: 64 * 1024, // 64 KB for text fields
    },
    throwFileSizeLimit: true,
  })
})
