/**
 * Standalone Swagger UI server on port 3002
 * Serves swagger-ui-dist pointing at the main API OpenAPI spec on port 3001
 */
import 'dotenv/config'
import Fastify from 'fastify'

const SWAGGER_PORT = 3002
const API_SPEC_URL = (process.env.APP_URL ?? 'http://localhost:3001') + '/docs/json'

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Convexo API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body { margin: 0; }
    #swagger-ui .topbar { background-color: #0f1219; }
    #swagger-ui .topbar .download-url-wrapper { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '${API_SPEC_URL}',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'StandaloneLayout',
      deepLinking: true,
      docExpansion: 'list',
      displayRequestDuration: true,
      filter: true,
      tryItOutEnabled: true,
      requestInterceptor: (req) => {
        // Persist token across page refresh via localStorage
        const token = localStorage.getItem('convexo_swagger_token')
        if (token) req.headers['Authorization'] = 'Bearer ' + token
        return req
      },
    })
  </script>
</body>
</html>`

async function startSwaggerServer() {
  const app = Fastify({ logger: false })

  app.get('/', async (_req, reply) => {
    reply.type('text/html').send(HTML)
  })

  app.get('/health', async () => ({ status: 'ok', specUrl: API_SPEC_URL }))

  await app.listen({ port: SWAGGER_PORT, host: '0.0.0.0' })
  console.log(`📖 Swagger UI  → http://localhost:${SWAGGER_PORT}`)
  console.log(`   API spec    → ${API_SPEC_URL}`)
}

startSwaggerServer().catch((err) => {
  console.error('Failed to start Swagger server:', err)
  process.exit(1)
})
