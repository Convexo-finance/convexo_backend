# Skill: Add a Webhook Handler

## Trigger
User says: "add a webhook", "handle webhook from [service]", "n8n callback", "stripe webhook"

## Pattern

### 1. Create the route (no auth middleware — webhooks authenticate via signature)
```typescript
app.post('/webhooks/<service>', {
  config: { rawBody: true },   // needed for HMAC signature verification
  schema: { tags: ['Webhooks'], summary: 'Receive <service> events' },
  handler: handleWebhook,
})
```

### 2. Verify the webhook signature
Always verify before processing. Example for HMAC-SHA256:
```typescript
import { createHmac, timingSafeEqual } from 'crypto'

function verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const sig = Buffer.from(signature)
  const exp = Buffer.from(expected)
  if (sig.length !== exp.length) return false
  return timingSafeEqual(sig, exp)
}
```
Reject with 401 if signature doesn't match. Never process unverified payloads.

### 3. Return 200 immediately, process async
```typescript
async function handleWebhook(request, reply) {
  if (!verifySignature(...)) return reply.status(401).send()
  reply.status(200).send({ ok: true })   // acknowledge fast
  processWebhookAsync(request.body).catch(err => logger.error({ err }, 'Webhook processing failed'))
}
```

### 4. Idempotency
Webhook providers retry on failure. Check for duplicate events:
```typescript
const existing = await db.webhookEvent.findUnique({ where: { externalId: event.id } })
if (existing) return   // already processed
```

### 5. Store webhook secret in env
Add to `src/config/env.ts` Zod schema and Railway environment variables.

## n8n callback pattern
n8n sends a POST to `/otc/callback` or similar with `{ requestId, result }`.
Verify via a shared secret in the Authorization header, then update the DB record and notify the user.
