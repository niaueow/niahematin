Project Overview

Project name: #niahematin Project type: Telegram finance tracker bot (single user, Rp 2.000.000 monthly allowance).

The Telegram bot is the completed first phase of the project. The web dashboard (Vue 3 + Tailwind on Vercel, reached through Cloudflare Tunnel) is Phase 2 and is out of scope unless the owner says otherwise.

Stack: Node.js + TypeScript, grammY, Express.js, Prisma ORM with SQLite, zod, Vitest, Docker Compose on an Ubuntu home server. Free-text parsing is rule-based first, with an optional Claude API fallback.

Source of truth for behavior: the PRD (PRD v3). If it is not in the repo, ask the owner for its location before judging behavior.

General Rules
Read the existing project documentation before making changes.
Understand the existing code before modifying it.
Follow the project's current architecture and style.
Do not rewrite working features unnecessarily.
Never expose API tokens, passwords, or secrets.
Never use production financial data for testing.
Do not delete user data or reset the database without explicit permission.
Do not commit, push, or deploy unless the owner asks.
When the code and the PRD disagree, do not decide which one is right. Report it and ask the owner.
Data and Secrets Safety
Do not read, print, copy, or log the production .env or any real token, API key, or Telegram user ID.
Use .env.test (or in-test configuration) with fake values only.
Tests must use a temporary SQLite database created for the test run. Never point a test at the production database file.
Before any test run, confirm the resolved database path is not the production path. If it is, stop and report.
Tests must not call the real Telegram API or the real Claude API. Use mocks (see QA.md section 4).
Never print real amounts, balances, or transactions from the production database in reports, logs, or chat.
Working Modes

Every task runs in exactly one mode. If the mode is unclear, ask the owner.

Mode	May change	Must not change
Audit	Nothing in the repo. Read-only.	Application code, tests, config, database
Testing	Test files and test fixtures only	Application code, schema, config, dependencies
Fixing	Application code for owner-approved bugs, plus their regression tests	Anything not tied to an approved bug
QA Rules
Review QA.md before performing QA tasks.
Start with an audit before fixing bugs.
Do not modify application code during an audit-only task.
Use existing test commands where possible. Discover them from package.json instead of guessing.
Do not claim a test passed unless it was run and its result was verified.
Report tests that could not be executed, with the reason.
Ask for approval before making significant fixes.

A fix is significant, and needs explicit approval, if it:

touches money calculation (limits, pots, sweeps, drift, HP days, rounding),
changes the Prisma schema or a migration,
touches authentication, the Telegram ID whitelist, or secret handling,
changes more than 3 files, or
removes or rewrites an existing test.
Reporting

Summarize:

What was checked.
Tests executed and their results.
Bugs found and their severity.
Files changed, if any.
Remaining risks and recommended next steps.

For a full QA run, deliver QA_REPORT.md in the format defined in QA.md section 9.