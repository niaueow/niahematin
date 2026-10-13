# #niahematin

Phase 1 implementation from the PRD: a private Telegram bot plus minimal Express API for one student budget.

## Stack

- Node.js 20 + TypeScript
- grammY long polling bot
- Express `/health` and `/summary`
- Prisma + SQLite
- Croner scheduler in `Asia/Jakarta`
- Vitest for pure money rules

## Setup

```bash
npm install
cp .env.example .env
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run dev
```

Required bot env:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_USER_ID`

If the token is empty, the API still starts.

## Bot Commands

- `/masuk 1000 jatah`
- quick log: `15 kopi`, `25rb nasgor`, `goceng parkir`
- `/boleh 25000 boba`
- `/sisa`
- `/undo`
- `/mode calibration` or `/mode active`
- `/pinjam`

All money is stored as integer rupiah.
