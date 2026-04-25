import fp from 'fastify-plugin'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import { env } from '../config/env'

export default fp(async (app) => {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Convexo API',
        description: 'Convexo Protocol Backend — DeFi for Latin American SMEs',
        version: '1.0.0',
      },
      servers: [{ url: env.APP_URL }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  })

  if (env.NODE_ENV === 'production' && env.DOCS_SECRET) {
    app.addHook('onRequest', async (request, reply) => {
      if (!request.url.startsWith('/docs')) return
      const url   = new URL(request.url, 'http://x')
      const token = url.searchParams.get('token') ?? request.headers['x-docs-token']
      if (token !== env.DOCS_SECRET) {
        return reply.status(401).send({ error: 'Unauthorized' })
      }
    })
  }

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  })
})
