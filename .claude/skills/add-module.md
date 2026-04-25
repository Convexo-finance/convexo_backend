# Skill: Add a New Feature Module

## Trigger
User says: "add a [name] module", "create endpoints for [feature]", "I need a new module"

## File structure to create
```
src/modules/<name>/
  <name>.schema.ts    — Zod schemas + exported inferred types
  <name>.service.ts   — business logic + Prisma queries
  <name>.controller.ts — parse input, call service, reply
  <name>.routes.ts    — register routes with Fastify
```

## Steps

### 1. Schema (`<name>.schema.ts`)
- Define one Zod schema per operation (create, update, list, etc.)
- Export inferred types: `export type CreateXInput = z.infer<typeof createXSchema>`

### 2. Service (`<name>.service.ts`)
- Import `db` from `../../config/database`
- Import error types from `../../shared/errors`
- Import types from `./<name>.schema`
- Each function: one clear responsibility, throws typed errors on failure

### 3. Controller (`<name>.controller.ts`)
- Import service functions and schemas
- Each handler: parse input with Zod → call service → `reply.send(result)`
- Use `reply.status(201)` for creates, `reply.status(204)` for deletes

### 4. Routes (`<name>.routes.ts`)
- Export `async function <name>Routes(app: FastifyInstance)`
- Apply preHandlers: `[requireAuth]`, `[requireAuth, requireBusiness]`, etc.
- Tag routes for Swagger: `schema: { tags: ['<Name>'], summary: '...' }`

### 5. Register in app
Add to `src/app.ts`:
```typescript
import { <name>Routes } from './modules/<name>/<name>.routes'
app.register(<name>Routes)
```

### 6. Prisma model (if needed)
- Add model to `prisma/schema.prisma`
- Run `npx prisma migrate dev --name add_<name>_table`
- Run `npx prisma generate`

### 7. Update CHANGELOG.md
Add entry under the next version with what was added.
