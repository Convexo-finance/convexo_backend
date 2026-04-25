# Database Migration Rules

## Golden rules
1. Never edit a migration file after it has been applied to production.
2. Never run `prisma migrate reset` against production — it drops all data.
3. Always create a new migration for every schema change, no matter how small.
4. Every migration must be committed to git before deploying.

## Workflow for schema changes
```bash
# 1. Edit prisma/schema.prisma
# 2. Generate migration SQL
npx prisma migrate dev --name <descriptive-name>
# 3. Review the generated SQL in prisma/migrations/
# 4. Run prisma generate to update the client
npx prisma generate
# 5. Commit schema + migration together
git add prisma/
git commit -m "feat: <describe the schema change>"
# 6. Deploy — Railway runs `npx prisma migrate deploy` automatically
railway up
```

## Migration naming convention
`YYYYMMDD_HHMMSS_<snake_case_description>` — e.g. `20260422_bank_account_fields`.
Use the `--name` flag; Prisma prepends the timestamp.

## Destructive changes
- Dropping a column: add it as nullable first, migrate data, then drop in a second migration.
- Renaming a column: add new column + backfill, then drop old in a second migration.
- Never `DROP COLUMN` on a column that has live traffic reading it.

## Backfill pattern
```sql
-- In migration SQL, before adding NOT NULL:
UPDATE "TableName" SET "column" = 'default_value' WHERE "column" IS NULL;
ALTER TABLE "TableName" ALTER COLUMN "column" SET NOT NULL;
```

## Railway deploy
`railway.toml` sets `preDeployCommand = "npx prisma migrate deploy"`.
This runs migrations before the new container starts — zero-downtime for additive changes.
For destructive changes, coordinate with a maintenance window.
