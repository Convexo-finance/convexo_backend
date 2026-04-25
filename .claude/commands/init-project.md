# /init-project — Claude Code Workspace Scaffold

Use this prompt when setting up Claude Code in a new convexo backend project or after a full reset.

---

## Prompt to paste

```
You are setting up the Claude Code workspace for this project. Read CLAUDE.md first to understand the architecture.

Then create or verify the following structure exists:

1. CLAUDE.local.md — local dev overrides (gitignored): Railway CLI notes, local env vars, how to run locally
2. CHANGELOG.md — version history log. Start from today if it doesn't exist.
3. mcp.json — MCP servers: Railway, GitHub, Context7
4. .claude/settings.json — Claude Code permissions: allow npm/prisma/railway/git commands, deny rm -rf and force push
5. .claude/rules/coding-style.md — module structure, TypeScript, Zod, error handling, formatting rules
6. .claude/rules/testing-practices.md — test DB, no mocks, co-located test files
7. .claude/rules/database-migrations.md — migration workflow, naming, destructive change rules
8. .claude/rules/security.md — auth, sensitive data, input validation, authorization, secrets
9. .claude/commands/init-project.md — this file (the scaffold prompt itself)
10. .claude/skills/deploy.md — how to deploy to Railway
11. .claude/skills/add-module.md — how to add a new feature module
12. .claude/skills/db-migration.md — step-by-step migration creation
13. .claude/skills/fix-error.md — systematic error diagnosis
14. .claude/skills/add-webhook.md — how to add a new webhook handler
15. .claude/hooks/pre-deploy.sh — checks before deploying (service link, build, migrations committed)
16. .claude/hooks/post-code-change.sh — runs type check after edits
17. .claude/hooks/changelog-update.sh — reminds to update CHANGELOG.md
18. Add CLAUDE.local.md to .gitignore

After creating everything, print:
- Complete file tree of created files
- One paragraph summary of the project
- Any assumptions made
- Ask: "What is the first thing you want to build or fix?"
```
