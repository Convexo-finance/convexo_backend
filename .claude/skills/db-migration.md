# Skill: Create a Database Migration

## Trigger
User says: "add a column", "create a table", "change the schema", "add field to [model]"

## Steps

### 1. Edit `prisma/schema.prisma`
Make the desired change. For new required fields on existing tables, add them as `String?` (optional) first if backfill is needed.

### 2. Generate migration
```bash
npx prisma migrate dev --name <descriptive_name>
```
Examples:
- `add_bank_account_swift_code`
- `create_loan_table`
- `make_holder_name_required`

### 3. Review the generated SQL
Open `prisma/migrations/<timestamp>_<name>/migration.sql`.
Check for:
- Unexpected `DROP COLUMN` or `DROP TABLE`
- Missing backfill before `NOT NULL` constraint
- Correct data types (BYTEA for binary, DECIMAL for monetary values)

### 4. Add backfill if needed (required fields)
Edit the migration SQL to add an UPDATE before the NOT NULL constraint:
```sql
UPDATE "User" SET "newField" = 'default' WHERE "newField" IS NULL;
ALTER TABLE "User" ALTER COLUMN "newField" SET NOT NULL;
```

### 5. Regenerate Prisma client
```bash
npx prisma generate
```

### 6. Test locally
```bash
npm run build   # confirm TypeScript is happy
```

### 7. Commit
```bash
git add prisma/
git commit -m "feat: <describe the change>"
```

### 8. Deploy
Migration runs automatically via `preDeployCommand` on `railway up`.

## Never do
- Edit migration SQL after it's been applied to production
- Run `prisma migrate reset` on production (drops all data)
- Deploy without committing the migration file
