# Skill: Diagnose and Fix an Error

## Trigger
User pastes an error message, stack trace, or says "it's broken", "I'm getting an error", "this doesn't work"

## Diagnosis steps

### 1. Identify error type
- **TypeScript compile error** → read the file at the reported line, check types
- **Prisma error** (P1xxx, P2xxx) → check schema, migration state, DATABASE_URL
- **Zod validation error** → request body doesn't match schema; check field names and types
- **JWT / auth error** → check middleware order in routes, JWT_SECRET env var
- **Railway deploy failure** → `railway logs` for the crashed deployment

### 2. Common Prisma errors
| Code | Meaning | Fix |
|------|---------|-----|
| P1001 | Can't reach DB | Check DATABASE_URL, Postgres service status |
| P2002 | Unique constraint | Duplicate record; handle gracefully with `findFirst` before create |
| P2025 | Record not found | Use `findFirst` + throw `NotFoundError` instead of `findFirstOrThrow` |
| P3006 | Migration failed | Check migration SQL for syntax errors |

### 3. Common TypeScript errors
- `Property X does not exist on type Y` → check Prisma client is regenerated after schema change (`npx prisma generate`)
- `Argument of type X is not assignable to Y` → Zod inferred type mismatch; check schema
- `Cannot find module` → missing import or new file not saved

### 4. Runtime errors
- Read `railway logs` for the exact error and stack trace
- Check if the error is in a `.catch()` that's silently swallowing it
- Add temporary `logger.error` to narrow down where it fails

### 5. Fix and verify
- Fix the root cause, not the symptom
- Run `npm run build` to confirm no TypeScript errors
- If schema changed, run `npx prisma generate`
- Deploy and watch logs for the fix taking effect
