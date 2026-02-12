# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI 武林大会 (AI Wuxia Championship) — a multiplayer AI-powered martial arts battle royale game. 12 AI characters (real players via SecondMe OAuth + NPC templates) compete across 6 rounds for the title of Wuxia Champion. Built for the SecondMe A2A Hackathon.

**Tech Stack:** Next.js 14 (App Router) · Supabase (PostgreSQL) · Zustand · Tailwind CSS · TypeScript · Vercel

## Commands

```bash
npm run dev      # Development server on localhost:3000
npm run build    # Production build
npm run start    # Start production server
npm run lint     # ESLint with next config
```

Deploy: `vercel --prod` (env vars must be configured in Vercel dashboard)

## Environment Variables

Required in `.env.local` (copy from `.env.local.example`):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase public config
- `SUPABASE_SERVICE_ROLE_KEY` — Server-side admin key
- `SECONDME_CLIENT_ID`, `SECONDME_CLIENT_SECRET`, `SECONDME_REDIRECT_URI` — OAuth
- `COOKIE_SECRET` — Cookie signing (falls back to SECONDME_CLIENT_SECRET)

## Architecture

### Data Flow

```
Browser (Zustand store, 3s polling) → Next.js API Routes → Supabase (PostgreSQL)
                                                         → SecondMe API (OAuth + AI decisions)
```

The frontend polls `/api/game/state` every 3 seconds. All game logic runs server-side in API route handlers. There is no WebSocket — the `game_state` table acts as a single-row cache (`id='current'`) that the polling endpoint reads.

### API Routes (`src/app/api/`)

- **`auth/*`** — SecondMe OAuth flow (login redirect, callback, session via signed cookies, logout)
- **`game/join`** — Player joins current game; NPC slots auto-fill
- **`game/state`** — Polling endpoint; reads cached `game_state` row
- **`engine/start`** — Creates game, transitions waiting→countdown→intro
- **`engine/round`** — Processes one round (1-5): collect decisions → resolve → write events → advance status
- **`engine/finals`** — Semifinals + finals (bluff-based 1v1 combat); R6 does NOT use `processRound`
- **`engine/end`** — Award titles, update season leaderboard, mark game ended

### Game Engine (`src/lib/game/`)

The heart of the application. Key modules:

- **`engine.ts`** — `processRound()` orchestrates each round: idempotent status locking via DB update, decision collection, resolution, event writing, state cache update. Has crash recovery (30s stuck detection).
- **`combat.ts`** — Damage formulas: `AttackPower = str*0.4 + innerForce*0.3 + martialBonus`, `DefensePower = con*0.3 + agi*0.2 + martialBonus`, `Damage = max(5, attack - defense)`. Finals uses rock-paper-scissors with bluff mechanic.
- **`npc-decisions.ts`** — Weighted random action selection for NPCs, modified by personality and game traits. Special rules for specific NPCs (alwaysFightStrongest, pairedWith, betrayRound).
- **`secondme-client.ts`** — Wraps SecondMe chat API for real player decisions. Includes token refresh logic.
- **`prompts.ts`** — LLM prompt templates and per-round director events (R1: scroll scramble, R2: master training, R3: betrayal, R4: wanted bounty, R5: death pact).
- **`constants.ts`** — All game balance numbers. Change balance here, not in engine.ts.
- **`npc-data/templates.ts`** — 24 NPC character definitions with attributes, faction bonuses, behavior flags, and action weights.

### Game State Machine

```
waiting → countdown (30s) → intro (25s) → round_1 → round_2 → round_3 → round_4 → round_5
→ semifinals → final → ending (25s) → ended
```

Each round transition uses optimistic locking: `UPDATE games SET status='processing_N' WHERE status=expected_status` prevents duplicate processing.

### Frontend (`src/app/page.tsx`, `src/components/`, `src/stores/`)

- **`useWulinStore`** (Zustand) — Single store for user auth state, game state, polling control, and display phase
- **`useGameDriver`** hook — Drives game progression client-side using timers; triggers engine API calls when phase transitions happen
- **`HeroCard`** — Character card with HP bar, attributes radar, faction styling
- **`EventFeed`** — Scrolling event narrative display
- **`RankingPanel`** — Reputation + Hot leaderboards

### Database Schema

Defined in `supabase-schema.sql`. Key tables:
- `heroes` — Persistent character records (real players + NPCs), stores SecondMe tokens
- `games` — Game instances with status state machine
- `game_heroes` — Per-game runtime state (HP, reputation, hot, allies, martial arts). Unique on `(game_id, hero_id)` and `(game_id, seat_number)`
- `game_events` — Append-only event log per round
- `game_state` — Single-row world snapshot cache (id='current') for polling
- `season_leaderboard` — Cross-game rankings

DB columns use `snake_case`. TypeScript types in `src/lib/types.ts` use `camelCase`. The engine maps between them manually in `gameHeroesToSnapshots()`.

## Conventions

- Path alias: `@/*` maps to `./src/*` (tsconfig)
- All game balance constants live in `src/lib/game/constants.ts` — import as `* as C`
- Cookie-based auth with HMAC-SHA256 signing (`src/lib/auth.ts`)
- Chinese-language UI and narrative text throughout; code comments mix Chinese and English
- NPC trait assignment is deterministic per game via hash-based seeding (`getStableTrait`)
- The `game_state` table has exactly one row (id='current') — always use upsert
