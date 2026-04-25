# Coding Style Rules

## Module structure
Every feature module lives in `src/modules/<name>/` with exactly:
- `<name>.routes.ts` — Fastify route registration only
- `<name>.controller.ts` — parse/validate input, call service, send reply
- `<name>.service.ts` — business logic and DB queries
- `<name>.schema.ts` — Zod schemas and inferred TypeScript types

Never put business logic in routes or controllers. Never put DB calls in routes.

## TypeScript
- Strict mode on. No `any`. Use `unknown` + narrowing if type is uncertain.
- Infer types from Zod schemas with `z.infer<typeof schema>` — don't duplicate types manually.
- Export inferred types from schema files, import them in service files.

## Validation
- All request bodies, query strings, and path params go through Zod `.parse()` in the controller.
- Never trust `request.body` directly — always parse first.
- Coerce query string numbers: `z.coerce.number()`.

## Error handling
- Throw typed errors from `src/shared/errors.ts`: `NotFoundError`, `BadRequestError`, `ForbiddenError`, `UnauthorizedError`.
- The global Fastify error handler maps these to correct HTTP status codes.
- Never `reply.status(404).send()` inline — throw instead.

## Async notifications
- Telegram and email calls must be non-blocking: `.catch((err) => logger.error({ err }, '...'))`.
- Never `await` a notification inside a request handler path.

## Formatting
- 2-space indentation.
- Align object values with spaces when it improves readability (Prisma queries, schema objects).
- Single quotes for strings.
- No semicolons except where required by TypeScript grammar.
- Trailing comma in multi-line objects and arrays.
