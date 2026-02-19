# Interactive Round Choices Design

Date: 2026-02-20
Status: Approved

## Overview

Transform the passive round experience into an interactive one where players choose personal encounters (奇遇) each round from a candidate pool, with AI fallback for timeouts. Core actions (fight/train/ally/betray) remain AI-driven via SecondMe. Additionally, add a one-per-game directional influence danmaku system.

## State Machine

```
waiting → countdown → intro → choosing_1 → resolving_1 → round_1 →
choosing_2 → resolving_2 → round_2 → ... → choosing_5 → resolving_5 → round_5 →
semifinals → final → ending → ended
```

Each round splits into three phases:

| Phase | Status | Duration | Player Behavior |
|-------|--------|----------|-----------------|
| Choosing | `choosing_N` | 15s | Pick 2 encounters from 6 candidates on own perspective |
| Resolving | `resolving_N` | ~2s | Engine processes (AI decisions + encounters + danmaku effects) |
| Reveal | `round_N` | 15s | Events reveal progressively; can switch viewpoints; can send danmaku |

## Round Timeline

```
[choosing_N starts]
  ├─ Server: generate 6 candidate encounters per alive hero → write to game_heroes.pending_choices
  ├─ Frontend: SSE/polling receives candidates → show selection UI
  ├─ Player: select 2 encounters → POST /api/game/choose
  ├─ 15s countdown ends
  │
[resolving_N starts]
  ├─ Server: AI fallback fills in for players who didn't choose
  ├─ Server: collectDecisions() (SecondMe AI decides core actions)
  ├─ Server: resolveRound() (merge core actions + chosen encounters + danmaku effects)
  ├─ Server: write events → advance to round_N
  │
[round_N starts]
  ├─ Frontend: progressive event reveal (~15s)
  ├─ Player: can switch viewpoints after own events revealed
  └─ Player: can send danmaku (including one directional influence per game)
```

## Candidate Generation

Candidates are drawn from the existing encounter pool (150+ events in `encounters.ts`).

- Configuration: **generate 6, player picks 2**
- Selection uses existing weighted logic: round gating (`minRound`/`maxRound`), faction/personality affinity (70% affinity preference), no repeats within game
- New function `rollCandidateEncounters(round, hero, 6, usedIds)` replaces direct assignment
- NPCs get candidates auto-selected at generation time (no player input)

## Database Changes

### `game_heroes` table — new columns

| Column | Type | Description |
|--------|------|-------------|
| `pending_choices` | `JSONB DEFAULT '[]'` | 6 candidate encounters for current round |
| `chosen_encounters` | `JSONB DEFAULT '[]'` | Player's 2 chosen encounter IDs |

### `game_state` table — new fields in JSONB

| Field | Type | Description |
|-------|------|-------------|
| `choosing_deadline` | `TIMESTAMPTZ` | Server-authoritative deadline for choosing phase |
| `hero_choice_status` | `JSONB DEFAULT '{}'` | `{ heroId: 'pending' \| 'chosen' }` |

### `heroes` table — new column

| Column | Type | Description |
|--------|------|-------------|
| `influence_used` | `BOOLEAN DEFAULT false` | Whether directional influence danmaku has been used this game |

## API Changes

### New: `POST /api/game/choose`

```
Request:  { gameId, heroId, encounterIds: [string, string] }
Response: { success: true, chosen: Encounter[] }
```

Validations: status must be `choosing_N`, player must be alive, IDs must exist in `pending_choices`.
Writes `game_heroes.chosen_encounters`, updates `game_state.hero_choice_status`.

### New: `POST /api/audience/influence`

```
Request:  { targetHeroId, effectType: 'buff' | 'debuff' }
Response: { success: true }
```

Validations: `influence_used === false`, one per game.
- Buff: target +10 HP or +10 reputation (random)
- Debuff: target -10 HP or -10 reputation (random)

Effect queued in `game_state.pending_influences`, consumed next round in `resolveRound()`.

### Modified: Engine endpoints

**New `POST /api/engine/choose-start`:**
Triggers `startChoosing(gameId, roundNumber)` — generates candidates, sets deadline, kicks off prefetch.

**Modified `POST /api/engine/round`:**
Now handles `choosing_N → resolving_N` transition. Reads `chosen_encounters`, AI fills gaps, resolves round.

### Modified: `GET /api/game/state`

When status is `choosing_N`, response includes `pendingChoices` (current player's 6 candidates), `choosingDeadline`, and `heroChoiceStatus`.

## Frontend Changes

### New Component: `ChoosingPanel`

Full-screen selection panel shown during `choosing_N`:
- 6 encounter cards in 2x3 grid (mobile: single column scroll)
- Each card shows: icon, name, effect preview (green positive / red negative)
- Click to toggle selection (gold border + check mark)
- Submit button activates when 2 selected
- Server-authoritative countdown timer top-right
- After submission: "Waiting for others..." with danmaku input available

### New Component: `InfluenceButton`

Adjacent to danmaku input, shown when viewing another hero's perspective:
- Lightning bolt icon button, one-time use per game
- Opens popup: choose buff (+10 HP or +10 rep) or debuff (-10 HP or -10 rep)
- After use: grayed out with "Used" label
- Triggers special golden/red danmaku animation on use

### New Component: `HeroChoiceSummary`

Shown in event feed header when viewing another hero during `round_N`:
- Small tags showing which 2 encounters the hero chose
- "AI auto-selected" badge for heroes who timed out

### Component Structure

```
ActiveGamePhase
├── ViewpointBar          (existing, unchanged)
├── ChoosingPanel         (new: rendered during choosing_N)
│   ├── CountdownTimer
│   ├── EncounterCardGrid
│   └── SubmitButton
├── EventFeed             (existing: rendered during round_N)
│   └── HeroChoiceSummary (new: shows hero's choices when switching viewpoints)
├── DanmakuInput          (existing, extended)
│   └── InfluenceButton   (new: directional influence button)
└── DanmakuOverlay        (existing, unchanged)
```

### Zustand Store Extensions

```typescript
pendingChoices: Encounter[];
chosenEncounterIds: string[];
choosingDeadline: string | null;
heroChoiceStatus: Record<string, 'pending' | 'chosen'>;
influenceUsed: boolean;
submitChoices: (ids: string[]) => Promise<void>;
submitInfluence: (targetHeroId: string, type: 'buff' | 'debuff') => Promise<void>;
```

### displayPhase Mapping

```
Server status    →  Frontend displayPhase
choosing_N       →  'choosing'    (show selection panel)
resolving_N      →  'resolving'   (show "Resolving..." transition)
round_N          →  'round'       (event reveal, same as existing)
```

## Engine Changes

### New: `startChoosing(gameId, roundNumber)`

1. Optimistic lock: `UPDATE games SET status='choosing_N' WHERE status=expected`
2. For each alive hero: `rollCandidateEncounters(round, heroInfo, 6)` → write to `pending_choices`
3. For NPCs: immediately auto-select 2 → write to `chosen_encounters`, mark as `'chosen'`
4. Set `choosing_deadline = now() + 15s`
5. Initialize `hero_choice_status`
6. Update `game_state` cache (triggers SSE)
7. Background: start `prefetchDecisions()`

### Modified: `resolveAndReveal()` (formerly `processRound`)

1. Lock: `choosing_N → resolving_N`
2. AI fallback: for heroes with empty `chosen_encounters`, randomly pick 2 from their `pending_choices`
3. Collect core action decisions (from prefetch cache or live SecondMe call)
4. `resolveRound()` now receives each hero's `chosenEncounters` instead of calling `rollPersonalEncounters()`
5. Clear `pending_choices` and `chosen_encounters`
6. Write events → advance to `round_N`

### encounters.ts

```typescript
// New: generate candidate encounters for a single hero
export function rollCandidateEncounters(
  round: number,
  hero: HeroInfo,
  count: number,            // 6
  usedEncounterIds: Set<string>,
): Encounter[]
```

Reuses existing round filtering, affinity weighting, dedup logic. Existing `rollPersonalEncounters` retained for NPC auto-assignment compatibility.

## Phase Transition Triggers

| Transition | Triggered By | Mechanism |
|------------|-------------|-----------|
| `intro` → `choosing_1` | Frontend `useGameDriver` | After intro display, calls `POST /api/engine/choose-start` |
| `choosing_N` → `resolving_N` | Frontend `useGameDriver` | After countdown, calls `POST /api/engine/round` |
| `resolving_N` → `round_N` | Server `resolveAndReveal()` | Auto-advances after resolution |
| `round_N` → `choosing_N+1` | Frontend `useGameDriver` | After event reveal, calls `POST /api/engine/choose-start` |
| `round_5` → `semifinals` | Server | Same as existing |

## Anti-Stuck Mechanisms

- **Choosing timeout**: If `choosing_N` exceeds 20s (5s buffer), any client calling `/api/engine/round` triggers server-side auto-fill and forced transition to `resolving_N`
- **Resolving timeout**: Existing 30s stuck detection — if `resolving_N` stuck >30s, auto-reset

## Directional Influence Danmaku

- `influence_used` flag on `heroes` table (persists across rounds within a game)
- Effects don't apply immediately; queued in `game_state.pending_influences` JSONB
- Consumed in next `resolveRound()`, generates `eventType: 'audience_influence'` event
- Reuses existing `audience-influence.ts` effect application logic
- Reset at game end (or game join)
