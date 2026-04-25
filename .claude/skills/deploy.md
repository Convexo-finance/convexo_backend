# Skill: Deploy to Railway

## Trigger
User says: "deploy", "push to railway", "deploy this to prod", "update railway"

## Steps

### 1. Verify you're on the right service
```bash
railway status
```
Must show `convexo-api`, NOT `Postgres`. If wrong service:
```bash
railway service link "convexo-api"
```

### 2. Check for uncommitted migrations
```bash
git status prisma/migrations/
```
If there are uncommitted migration files, commit them first — Railway's `preDeployCommand` only applies migrations that are in git.

### 3. Build check
```bash
npm run build
```
Fix any TypeScript errors before deploying.

### 4. Deploy
```bash
railway up
```

### 5. Watch deployment
```bash
railway logs
```
Look for:
- `Migration X applied successfully` — migration ran
- `Server listening on 0.0.0.0:PORT` — app started
- Any `Error` or `CRASHED` — investigate before declaring success

### 6. Verify
Check a lightweight endpoint to confirm the new version is live.

## Common failures
- **P1001 Can't reach database**: Postgres service is down or DATABASE_URL wrong
- **Missing env var**: Check Railway service env vars match `.env.example`
- **Migration conflict**: A previous migration was edited — check git log
- **Build failed**: TypeScript errors — fix before deploying
