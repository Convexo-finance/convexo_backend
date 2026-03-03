import fp from 'fastify-plugin'
import multipart from '@fastify/multipart'

export default fp(async (app) => {
  await app.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024, // 20 MB per file
      files: 10,
      fieldSize: 1024 * 1024,     // 1 MB for text fields
    },
  })
})
