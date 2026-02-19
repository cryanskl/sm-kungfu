# Interactive Round Choices Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform passive round experience into interactive one — players choose 2 encounters from 6 candidates per round (15s), with AI fallback for timeouts, plus one-per-game directional influence danmaku.

**Architecture:** Extend the existing state machine with `choosing_N` / `resolving_N` phases between rounds. Candidates generated from the existing 150+ encounter pool via new `rollCandidateEncounters()`. Player choices submitted via new `/api/game/choose` endpoint, stored in `game_heroes` JSONB columns. Engine reads choices at resolution time. SSE/polling delivers candidates to frontend.

**Tech Stack:** Next.js 14 API Routes, Supabase PostgreSQL, Zustand 5, TypeScript, Tailwind CSS.

**Note:** This project has no test framework configured. Steps that would normally be TDD are written as manual verification steps instead.

---

### Task 1: Database Migrations

**Files:**
- Modify: `scripts/migrate.mjs` — append new migration SQL statements to `MIGRATION_SQL` array (after line ~93)

**Step 1: Add migration SQL**

Append these statements to the `MIGRATION_SQL` array in `scripts/migrate.mjs`:

```sql
ALTER TABLE game_heroes ADD COLUMN IF NOT EXISTS pending_choices JSONB DEFAULT '[]'
ALTER TABLE game_heroes ADD COLUMN IF NOT EXISTS chosen_encounters JSONB DEFAULT '[]'
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS choosing_deadline TIMESTAMPTZ
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS hero_choice_status JSONB DEFAULT '{}'
ALTER TABLE game_state ADD COLUMN IF NOT EXISTS pending_influences JSONB DEFAULT '[]'
ALTER TABLE heroes ADD COLUMN IF NOT EXISTS influence_used BOOLEAN DEFAULT false
```

**Step 2: Run migration**

Run: `npm run db:migrate`
Expected: All 6 ALTER statements succeed (or "already exists" — idempotent).

**Step 3: Verify columns exist**

Open Supabase dashboard, check that `game_heroes` has `pending_choices` and `chosen_encounters` columns, `game_state` has `choosing_deadline`, `hero_choice_status`, `pending_influences`, and `heroes` has `influence_used`.

**Step 4: Commit**

```bash
git add scripts/migrate.mjs
git commit -m "feat: add DB columns for interactive round choices and influence danmaku"
```

---

### Task 2: Type System Updates

**Files:**
- Modify: `src/lib/types.ts` — extend `GameStatus`, add `DisplayPhase`, extend `GameState` interface

**Step 1: Extend `GameStatus` type**

At `src/lib/types.ts:91-100`, add the new statuses. The full type becomes:

```typescript
export type GameStatus =
  | 'waiting'
  | 'countdown'
  | 'intro'
  | 'choosing_1' | 'choosing_2' | 'choosing_3' | 'choosing_4' | 'choosing_5'
  | 'resolving_1' | 'resolving_2' | 'resolving_3' | 'resolving_4' | 'resolving_5'
  | 'round_1' | 'round_2' | 'round_3' | 'round_4' | 'round_5' | 'round_6'
  | 'semifinals'
  | 'artifact_selection'
  | 'final'
  | 'ending'
  | 'ended';
```

**Step 2: Extend `GameState` interface**

At `src/lib/types.ts:184-233`, add these fields to the `GameState` interface:

```typescript
  // Interactive round choices
  pendingChoices: Encounter[];  // current player's 6 candidate encounters
  choosingDeadline: string | null;  // ISO timestamp
  heroChoiceStatus: Record<string, 'pending' | 'chosen'>;
  pendingInfluences: { sourceHeroId: string; targetHeroId: string; effectType: 'buff' | 'debuff' }[];
```

Note: `Encounter` is exported from `encounters.ts`. Add the import at top of `types.ts` or use inline type. Since `types.ts` is a pure type file and `encounters.ts` has runtime code, define a lightweight `EncounterChoice` interface in `types.ts` instead:

```typescript
export interface EncounterChoice {
  id: string;
  category: string;
  name: string;       // pre-rendered narrative text for display
  effects: { hp?: number; reputation?: number; hot?: number; morality?: number; credit?: number };
  martialArt?: { name: string; attackBonus: number; defenseBonus: number };
  factionAffinity?: string[];
  personalityAffinity?: string[];
}
```

Then use `EncounterChoice[]` for `pendingChoices` in `GameState`.

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds (existing code may have type errors from missing fields — fix defaults in state-mapper in Task 3).

**Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: extend types for choosing/resolving phases and encounter choices"
```

---

### Task 3: State Mapper & Constants Updates

**Files:**
- Modify: `src/lib/game/state-mapper.ts:7-39` — add new field mappings
- Modify: `src/lib/game/constants.ts` — add choosing phase constants

**Step 1: Add constants**

In `src/lib/game/constants.ts`, add:

```typescript
export const CHOOSING_DURATION = 15;       // seconds for choosing phase
export const CHOOSING_TIMEOUT = 20;        // seconds before forced auto-fill
export const CANDIDATES_PER_HERO = 6;      // encounter candidates offered
export const CHOICES_PER_HERO = 2;         // encounters player must pick
export const INFLUENCE_BUFF_AMOUNT = 10;   // +HP or +rep for buff
export const INFLUENCE_DEBUFF_AMOUNT = 10; // -HP or -rep for debuff
```

**Step 2: Add state-mapper fields**

In `src/lib/game/state-mapper.ts`, inside `mapGameStateRow()`, add after the `newAchievements` line:

```typescript
    pendingChoices: [],  // populated per-player in the API route, not from game_state
    choosingDeadline: data.choosing_deadline || null,
    heroChoiceStatus: data.hero_choice_status || {},
    pendingInfluences: data.pending_influences || [],
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds with no type errors.

**Step 4: Commit**

```bash
git add src/lib/game/state-mapper.ts src/lib/game/constants.ts
git commit -m "feat: add constants and state mapping for choosing phase"
```

---

### Task 4: Encounter Candidate Generation

**Files:**
- Modify: `src/lib/game/encounters.ts` — add `rollCandidateEncounters()` function and `toEncounterChoice()` serializer

**Step 1: Add `toEncounterChoice` serializer**

After the `Encounter` interface (line ~29), add a function that converts an `Encounter` to the serializable `EncounterChoice` for the frontend:

```typescript
import type { EncounterChoice } from '../types';

export function toEncounterChoice(enc: Encounter, heroName: string): EncounterChoice {
  return {
    id: enc.id,
    category: enc.category,
    name: enc.narrative(heroName),
    effects: enc.effects,
    martialArt: enc.martialArt,
    factionAffinity: enc.factionAffinity,
    personalityAffinity: enc.personalityAffinity,
  };
}
```

**Step 2: Add `rollCandidateEncounters` function**

After `rollPersonalEncounters` (line ~1677), add:

```typescript
/**
 * Generate candidate encounters for a single hero (player chooses from these).
 * Reuses existing round filtering, affinity weighting, and dedup logic.
 */
export function rollCandidateEncounters(
  round: number,
  hero: HeroInfo,
  count: number,
  usedEncounterIds: Set<string>,
): Encounter[] {
  const eligible = ENCOUNTERS.filter(e => {
    if (e.minRound && round < e.minRound) return false;
    if (e.maxRound && round > e.maxRound) return false;
    return true;
  });

  const results: Encounter[] = [];

  for (let i = 0; i < count; i++) {
    let pool = eligible.filter(e => !usedEncounterIds.has(e.id) && !results.some(r => r.id === e.id));
    if (pool.length === 0) {
      // Pool exhausted — allow repeats from eligible (excluding already picked for this hero)
      pool = eligible.filter(e => !results.some(r => r.id === e.id));
    }
    if (pool.length === 0) break;

    const affinityPool = pool.filter(e =>
      (e.factionAffinity?.includes(hero.faction)) ||
      (e.personalityAffinity?.includes(hero.personalityType))
    );

    const useAffinity = affinityPool.length > 0 && Math.random() < 0.7;
    const encounter = weightedPick(useAffinity ? affinityPool : pool);
    results.push(encounter);
    usedEncounterIds.add(encounter.id);
  }

  return results;
}
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/lib/game/encounters.ts
git commit -m "feat: add rollCandidateEncounters and toEncounterChoice for interactive choices"
```

---

### Task 5: Engine — `startChoosing()` Function

**Files:**
- Modify: `src/lib/game/engine.ts` — add `startChoosing()` export, import new functions

**Step 1: Add imports**

At `src/lib/game/engine.ts:10`, change:
```typescript
import { rollEncounters, rollPersonalEncounters } from './encounters';
```
to:
```typescript
import { rollEncounters, rollPersonalEncounters, rollCandidateEncounters, toEncounterChoice } from './encounters';
```

**Step 2: Add `startChoosing` function**

After the `prefetchDecisions` function (line ~75), add:

```typescript
/**
 * Begin the choosing phase for a round.
 * Generates 6 candidate encounters per alive hero, writes to DB, sets deadline.
 * NPCs auto-select immediately.
 */
export async function startChoosing(gameId: string, roundNumber: number): Promise<{ success: boolean; error?: string }> {
  // Determine expected previous status
  const expectedStatus = roundNumber === 1 ? 'intro' : `round_${roundNumber - 1}`;
  const choosingStatus = `choosing_${roundNumber}`;

  // Optimistic lock
  const { data: lockResult, error: lockError } = await supabaseAdmin
    .from('games')
    .update({ status: choosingStatus, updated_at: new Date().toISOString() })
    .eq('id', gameId)
    .eq('status', expectedStatus)
    .select('id')
    .single();

  if (lockError || !lockResult) {
    // Check if already in choosing phase (idempotent)
    const { data: game } = await supabaseAdmin.from('games').select('status').eq('id', gameId).single();
    if (game?.status === choosingStatus) return { success: true };
    return { success: false, error: `Lock failed: expected ${expectedStatus}, got ${game?.status}` };
  }

  // Fetch alive heroes
  const { data: gameHeroes } = await supabaseAdmin
    .from('game_heroes')
    .select('*, hero:heroes(hero_name, faction, personality_type, is_npc, access_token)')
    .eq('game_id', gameId)
    .eq('is_eliminated', false);

  if (!gameHeroes || gameHeroes.length === 0) {
    return { success: false, error: 'No alive heroes' };
  }

  const usedEncounterIds = new Set<string>();
  const heroChoiceStatus: Record<string, 'pending' | 'chosen'> = {};
  const deadline = new Date(Date.now() + C.CHOOSING_DURATION * 1000).toISOString();

  for (const gh of gameHeroes) {
    const heroInfo = {
      heroName: gh.hero.hero_name,
      heroId: gh.hero_id,
      faction: gh.hero.faction,
      personalityType: gh.hero.personality_type,
    };

    const candidates = rollCandidateEncounters(roundNumber, heroInfo, C.CANDIDATES_PER_HERO, usedEncounterIds);
    const candidateChoices = candidates.map(c => toEncounterChoice(c, heroInfo.heroName));

    if (gh.hero.is_npc) {
      // NPC: auto-select first CHOICES_PER_HERO candidates
      const autoChosen = candidateChoices.slice(0, C.CHOICES_PER_HERO).map(c => c.id);
      await supabaseAdmin.from('game_heroes').update({
        pending_choices: candidateChoices,
        chosen_encounters: autoChosen,
      }).eq('id', gh.id);
      heroChoiceStatus[gh.hero_id] = 'chosen';
    } else {
      // Real player: set candidates, leave chosen empty
      await supabaseAdmin.from('game_heroes').update({
        pending_choices: candidateChoices,
        chosen_encounters: [],
      }).eq('id', gh.id);
      heroChoiceStatus[gh.hero_id] = 'pending';
    }
  }

  // Update game_state cache
  await supabaseAdmin.from('game_state').update({
    status: choosingStatus,
    current_round: roundNumber,
    choosing_deadline: deadline,
    hero_choice_status: heroChoiceStatus,
    phase_started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', 'current');

  // Background: prefetch SecondMe decisions for resolving phase
  prefetchDecisions(gameId, roundNumber).catch(() => {});

  return { success: true };
}
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/lib/game/engine.ts
git commit -m "feat: add startChoosing() engine function for candidate generation"
```

---

### Task 6: Engine — Modify `processRound()` for `choosing_N → resolving_N` Flow

**Files:**
- Modify: `src/lib/game/engine.ts:88-218` — update `processRound` to handle new status transitions

**Step 1: Update `processRound` to accept `choosing_N` as expected status**

At line ~101 in `processRound`, change the `expectedStatus` calculation:

```typescript
// Old:
const expectedStatus = roundNumber === 1 ? 'intro' : `round_${roundNumber - 1}`;
// New:
const expectedStatus = `choosing_${roundNumber}`;
```

And change the processing status from `processing_N` to `resolving_N`:

```typescript
const processingStatus = `resolving_${roundNumber}`;
```

Update the optimistic lock SQL accordingly. The function now transitions `choosing_N → resolving_N → round_N` (or `→ semifinals` for R5).

**Step 2: Add AI fallback for unchosen heroes**

After the optimistic lock succeeds and before `collectDecisions`, add:

```typescript
// AI fallback: fill in choices for heroes who didn't choose
const { data: aliveHeroes } = await supabaseAdmin
  .from('game_heroes')
  .select('id, hero_id, pending_choices, chosen_encounters')
  .eq('game_id', gameId)
  .eq('is_eliminated', false);

if (aliveHeroes) {
  for (const gh of aliveHeroes) {
    const chosen = gh.chosen_encounters || [];
    if (chosen.length < C.CHOICES_PER_HERO && gh.pending_choices?.length > 0) {
      // Auto-fill from pending choices
      const available = (gh.pending_choices as any[]).filter((c: any) => !chosen.includes(c.id));
      const autoFill = available.slice(0, C.CHOICES_PER_HERO - chosen.length).map((c: any) => c.id);
      const finalChosen = [...chosen, ...autoFill];
      await supabaseAdmin.from('game_heroes').update({
        chosen_encounters: finalChosen,
      }).eq('id', gh.id);
    }
  }
}
```

**Step 3: Replace `rollPersonalEncounters` call with chosen encounters**

At the personal encounters block (~line 658-713), instead of calling `rollPersonalEncounters`, read `chosen_encounters` from `game_heroes` and look up the full encounter data to apply effects. The encounter effects application logic stays the same — just the source changes from "randomly rolled" to "player-chosen + looked up from encounters pool".

```typescript
// --- 个人支线奇遇（玩家选择版） ---
const { data: heroChoices } = await supabaseAdmin
  .from('game_heroes')
  .select('hero_id, chosen_encounters, pending_choices')
  .eq('game_id', gameId)
  .eq('is_eliminated', false);

if (heroChoices) {
  for (const hc of heroChoices) {
    const chosenIds: string[] = hc.chosen_encounters || [];
    const pendingChoices: any[] = hc.pending_choices || [];
    const heroSnap = snapshots.find(s => s.heroId === hc.hero_id);
    if (!heroSnap) continue;

    for (const chosenId of chosenIds) {
      const choice = pendingChoices.find((c: any) => c.id === chosenId);
      if (!choice) continue;
      // Apply effects same as existing encounter application logic
      const effects = choice.effects || {};
      events.push({
        gameId, round: roundNumber,
        heroId: hc.hero_id,
        eventType: 'encounter',
        narrative: choice.name,
        hpDelta: effects.hp || 0,
        repDelta: effects.reputation || 0,
        hotDelta: effects.hot || 0,
        data: { encounterId: chosenId, category: choice.category, martialArt: choice.martialArt },
      });
    }
  }
}
```

**Step 4: Clear pending_choices and chosen_encounters after resolution**

After events are written, add:

```typescript
// Clear choice data for this round
await supabaseAdmin.from('game_heroes').update({
  pending_choices: [],
  chosen_encounters: [],
}).eq('game_id', gameId);
```

**Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 6: Commit**

```bash
git add src/lib/game/engine.ts
git commit -m "feat: update processRound for choosing→resolving flow with AI fallback"
```

---

### Task 7: API Routes — `/api/engine/choose-start` and `/api/game/choose`

**Files:**
- Create: `src/app/api/engine/choose-start/route.ts`
- Create: `src/app/api/game/choose/route.ts`

**Step 1: Create `/api/engine/choose-start`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { startChoosing } from '@/lib/game/engine';

export async function POST(request: NextRequest) {
  const { gameId, roundNumber } = await request.json();
  if (!gameId || !roundNumber) {
    return NextResponse.json({ error: 'Missing gameId or roundNumber' }, { status: 400 });
  }

  const result = await startChoosing(gameId, roundNumber);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({ success: true });
}
```

**Step 2: Create `/api/game/choose`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getHeroIdFromCookies } from '@/lib/auth';
import * as C from '@/lib/game/constants';

export async function POST(request: NextRequest) {
  const { userId, heroId } = getHeroIdFromCookies(request.cookies);
  if (!heroId) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  }

  const { gameId, encounterIds } = await request.json();
  if (!gameId || !Array.isArray(encounterIds) || encounterIds.length !== C.CHOICES_PER_HERO) {
    return NextResponse.json({ error: `Must choose exactly ${C.CHOICES_PER_HERO} encounters` }, { status: 400 });
  }

  // Verify game is in choosing phase
  const { data: game } = await supabaseAdmin.from('games').select('status').eq('id', gameId).single();
  if (!game?.status?.startsWith('choosing_')) {
    return NextResponse.json({ error: 'Not in choosing phase' }, { status: 409 });
  }

  // Verify hero is alive and get pending choices
  const { data: gh } = await supabaseAdmin
    .from('game_heroes')
    .select('id, pending_choices, chosen_encounters')
    .eq('game_id', gameId)
    .eq('hero_id', heroId)
    .eq('is_eliminated', false)
    .single();

  if (!gh) {
    return NextResponse.json({ error: 'Hero not found or eliminated' }, { status: 404 });
  }

  // Already chosen
  if (gh.chosen_encounters && gh.chosen_encounters.length >= C.CHOICES_PER_HERO) {
    return NextResponse.json({ error: 'Already submitted choices' }, { status: 409 });
  }

  // Validate encounterIds exist in pending_choices
  const pendingIds = (gh.pending_choices as any[]).map((c: any) => c.id);
  const allValid = encounterIds.every((id: string) => pendingIds.includes(id));
  if (!allValid) {
    return NextResponse.json({ error: 'Invalid encounter IDs' }, { status: 400 });
  }

  // Write chosen encounters
  await supabaseAdmin.from('game_heroes').update({
    chosen_encounters: encounterIds,
  }).eq('id', gh.id);

  // Update hero_choice_status in game_state
  const { data: gs } = await supabaseAdmin.from('game_state').select('hero_choice_status').eq('id', 'current').single();
  const status = gs?.hero_choice_status || {};
  status[heroId] = 'chosen';
  await supabaseAdmin.from('game_state').update({
    hero_choice_status: status,
    updated_at: new Date().toISOString(),
  }).eq('id', 'current');

  const chosen = (gh.pending_choices as any[]).filter((c: any) => encounterIds.includes(c.id));
  return NextResponse.json({ success: true, chosen });
}
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds with new routes visible in output.

**Step 4: Commit**

```bash
git add src/app/api/engine/choose-start/route.ts src/app/api/game/choose/route.ts
git commit -m "feat: add choose-start and game/choose API routes"
```

---

### Task 8: API Route — `/api/audience/influence`

**Files:**
- Create: `src/app/api/audience/influence/route.ts`

**Step 1: Create the endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getHeroIdFromCookies } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const { userId, heroId } = getHeroIdFromCookies(request.cookies);
  if (!heroId) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  }

  const { targetHeroId, effectType } = await request.json();
  if (!targetHeroId || !['buff', 'debuff'].includes(effectType)) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  }

  if (targetHeroId === heroId) {
    return NextResponse.json({ error: 'Cannot influence yourself' }, { status: 400 });
  }

  // Check if already used this game
  const { data: hero } = await supabaseAdmin
    .from('heroes')
    .select('influence_used')
    .eq('id', heroId)
    .single();

  if (hero?.influence_used) {
    return NextResponse.json({ error: 'Influence already used this game' }, { status: 409 });
  }

  // Mark as used
  await supabaseAdmin.from('heroes').update({ influence_used: true }).eq('id', heroId);

  // Queue the influence effect
  const { data: gs } = await supabaseAdmin
    .from('game_state')
    .select('pending_influences')
    .eq('id', 'current')
    .single();

  const influences = gs?.pending_influences || [];
  influences.push({ sourceHeroId: heroId, targetHeroId, effectType });

  await supabaseAdmin.from('game_state').update({
    pending_influences: influences,
    updated_at: new Date().toISOString(),
  }).eq('id', 'current');

  return NextResponse.json({ success: true });
}
```

**Step 2: Reset `influence_used` on game join**

In `src/app/api/game/join/route.ts`, find where the hero is upserted into `game_heroes`, and add nearby:

```typescript
await supabaseAdmin.from('heroes').update({ influence_used: false }).eq('id', heroId);
```

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/app/api/audience/influence/route.ts src/app/api/game/join/route.ts
git commit -m "feat: add directional influence danmaku endpoint"
```

---

### Task 9: Modify `/api/game/state` to Include Player-Specific Choices

**Files:**
- Modify: `src/app/api/game/state/route.ts`

**Step 1: Add player-specific pending choices**

The state endpoint currently returns generic game state. When in `choosing_N` phase, it should also include the requesting player's pending choices. Modify the GET handler:

After `computeDynamicFields`, check if status starts with `choosing_` and if so, look up the requesting player's `pending_choices` from `game_heroes`:

```typescript
// Add cookie import
import { getHeroIdFromCookies } from '@/lib/auth';

// Inside GET handler, after computeDynamicFields:
if (gameState.status?.startsWith('choosing_')) {
  const { heroId } = getHeroIdFromCookies(request.cookies);
  if (heroId) {
    const { data: gh } = await supabaseAdmin
      .from('game_heroes')
      .select('pending_choices')
      .eq('game_id', gameState.gameId)
      .eq('hero_id', heroId)
      .single();
    if (gh?.pending_choices) {
      gameState.pendingChoices = gh.pending_choices;
    }
  }
}
```

Note: the GET handler needs to accept `request: NextRequest` parameter (check if it currently does; if not, add it).

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/app/api/game/state/route.ts
git commit -m "feat: include player-specific pending choices in game state during choosing phase"
```

---

### Task 10: Zustand Store Extensions

**Files:**
- Modify: `src/stores/gameStore.ts` — add new state fields and actions

**Step 1: Add state fields and actions**

In the `WulinStore` interface (lines ~24-74), add:

```typescript
  // Interactive choices
  chosenEncounterIds: string[];
  influenceUsed: boolean;
  submitChoices: (gameId: string, encounterIds: string[]) => Promise<boolean>;
  submitInfluence: (targetHeroId: string, effectType: 'buff' | 'debuff') => Promise<boolean>;
  resetChoices: () => void;
```

In the store creation, add initial values and implementations:

```typescript
  chosenEncounterIds: [],
  influenceUsed: false,

  submitChoices: async (gameId, encounterIds) => {
    const res = await fetch('/api/game/choose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, encounterIds }),
    });
    if (res.ok) {
      set({ chosenEncounterIds: encounterIds });
      return true;
    }
    return false;
  },

  submitInfluence: async (targetHeroId, effectType) => {
    const res = await fetch('/api/audience/influence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetHeroId, effectType }),
    });
    if (res.ok) {
      set({ influenceUsed: true });
      return true;
    }
    return false;
  },

  resetChoices: () => set({ chosenEncounterIds: [] }),
```

**Step 2: Reset choices on phase transitions**

In the `setGameState` action (or wherever `gameState` is updated from polling/SSE), add logic: when status transitions away from `choosing_N`, call `resetChoices()`.

**Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add src/stores/gameStore.ts
git commit -m "feat: extend Zustand store with choice submission and influence actions"
```

---

### Task 11: Frontend — `ChoosingPanel` Component

**Files:**
- Create: `src/components/game/ChoosingPanel.tsx`

**Step 1: Create the component**

Build a full-screen selection panel that:
- Shows 6 encounter cards in a 2x3 grid (responsive: single column on mobile)
- Each card displays: category icon, narrative name, effects (green for positive, red for negative), optional martial art bonus
- Click toggles selection state (gold border + check mark when selected)
- Counter shows "已选 N/2"
- Submit button activates when exactly 2 are selected
- Server-authoritative countdown timer in top-right using `gameState.choosingDeadline`
- After submission: shows "等待其他玩家..." with choice status indicators

Use the existing project styling conventions: `card-wuxia`, `btn-gold`, `text-gold`, `border-gold/30`, `bg-gold/5`, ink color palette.

Accept props:

```typescript
interface ChoosingPanelProps {
  gameState: GameState;
  onSubmit: (encounterIds: string[]) => void;
  isSubmitted: boolean;
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/components/game/ChoosingPanel.tsx
git commit -m "feat: add ChoosingPanel component for encounter selection UI"
```

---

### Task 12: Frontend — `InfluenceButton` Component

**Files:**
- Create: `src/components/game/InfluenceButton.tsx`

**Step 1: Create the component**

A compact button + popup for directional influence:
- Lightning bolt button next to danmaku input
- When clicked, shows a small popup with two options: buff (green) and debuff (red)
- Each option describes the effect: "+10 HP 或 +10 声望" / "-10 HP 或 -10 声望"
- After use: button grayed out, shows "已使用"
- Needs `targetHeroId` (from current viewpoint) and `onInfluence` callback

Props:

```typescript
interface InfluenceButtonProps {
  targetHeroId: string;
  influenceUsed: boolean;
  onInfluence: (targetHeroId: string, effectType: 'buff' | 'debuff') => Promise<void>;
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/components/game/InfluenceButton.tsx
git commit -m "feat: add InfluenceButton component for directional danmaku"
```

---

### Task 13: Frontend — `HeroChoiceSummary` Component

**Files:**
- Create: `src/components/game/HeroChoiceSummary.tsx`

**Step 1: Create the component**

Small inline component shown in event feed header when viewing another hero:
- Shows 2 small tags with encounter names the hero chose
- If hero timed out (AI auto-selected), show "AI 代选" badge
- Rendered conditionally when `viewingHeroId !== myHeroId` and during `round_N` phase

Props:

```typescript
interface HeroChoiceSummaryProps {
  heroId: string;
  heroName: string;
  // These come from the game state or a separate lookup
}
```

Note: The chosen encounters for other heroes need to be available. Consider adding a summary to `game_state.hero_choice_status` that includes chosen encounter names (extend from `'pending' | 'chosen'` to `{ status: 'pending' | 'chosen'; chosenNames?: string[] }`).

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/components/game/HeroChoiceSummary.tsx
git commit -m "feat: add HeroChoiceSummary component for viewpoint choice display"
```

---

### Task 14: Frontend — Wire Up `ActiveGamePhase` and `page.tsx`

**Files:**
- Modify: `src/components/game/phases/ActiveGamePhase.tsx` — conditionally render `ChoosingPanel` during choosing phase
- Modify: `src/app/page.tsx` — add choosing phase timer logic and `choose-start` trigger
- Modify: `src/hooks/useGameDriver.ts` — add `triggerChooseStart` function

**Step 1: Update `useGameDriver` with `triggerChooseStart`**

Add a new function to the hook:

```typescript
const triggerChooseStart = useCallback(async (gameId: string, roundNumber: number) => {
  if (isProcessing) return;
  setIsProcessing(true);
  try {
    await fetch('/api/engine/choose-start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId, roundNumber }),
    });
  } catch (e) {
    console.error('triggerChooseStart failed:', e);
  }
  setIsProcessing(false);
}, [isProcessing]);
```

Return it from the hook alongside existing functions.

**Step 2: Update `page.tsx` phase transitions**

In `page.tsx`, where reveal completion triggers the next round (lines 64-88), change:
- Instead of calling `triggerRound(gameId, nextRound)` after reveal, call `triggerChooseStart(gameId, nextRound)` to enter the choosing phase first
- Add a new effect: when `gameState.status` is `choosing_N` and the deadline passes, call `triggerRound(gameId, roundNumber)` to move to resolving

Similarly, after intro ends, call `triggerChooseStart(gameId, 1)` instead of `triggerRound(gameId, 1)`.

**Step 3: Update `ActiveGamePhase` to render `ChoosingPanel`**

Import `ChoosingPanel` and render it when status starts with `choosing_`:

```typescript
{status?.startsWith('choosing_') && (
  <ChoosingPanel
    gameState={gameState!}
    onSubmit={handleSubmitChoices}
    isSubmitted={chosenEncounterIds.length > 0}
  />
)}
```

Wire `handleSubmitChoices` to the store's `submitChoices` action.

**Step 4: Add `InfluenceButton` to `DanmakuInput` area**

When `viewingHeroId` is set and is not the current player, render `InfluenceButton` alongside `DanmakuInput`.

**Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 6: Manual verification**

Run: `npm run dev`
Start a game, join, wait for intro to end. Verify:
- Choosing panel appears with 6 encounter cards
- Can select 2 and submit
- After 15s, round resolves even if not all players chose
- Events reveal shows chosen encounters
- Can switch viewpoints and see other heroes' choices
- Influence button appears on other heroes' viewpoints

**Step 7: Commit**

```bash
git add src/components/game/phases/ActiveGamePhase.tsx src/app/page.tsx src/hooks/useGameDriver.ts
git commit -m "feat: wire up choosing phase in game loop and ActiveGamePhase"
```

---

### Task 15: Consume Pending Influences in Engine

**Files:**
- Modify: `src/lib/game/engine.ts` — inside `resolveRound`, consume `pending_influences` from `game_state`

**Step 1: Add influence consumption**

Inside `resolveRound`, after director events and before the main action resolution, add:

```typescript
// Consume pending influences from audience
const { data: gsInfluence } = await supabaseAdmin
  .from('game_state')
  .select('pending_influences')
  .eq('id', 'current')
  .single();

const pendingInfluences = gsInfluence?.pending_influences || [];
for (const inf of pendingInfluences) {
  const target = snapshots.find(s => s.heroId === inf.targetHeroId && !s.isEliminated);
  if (!target) continue;

  const isHp = Math.random() < 0.5;
  const amount = inf.effectType === 'buff' ? C.INFLUENCE_BUFF_AMOUNT : -C.INFLUENCE_DEBUFF_AMOUNT;

  events.push({
    gameId, round: roundNumber,
    heroId: inf.targetHeroId,
    eventType: 'audience_influence',
    narrative: inf.effectType === 'buff'
      ? `观众助力！${target.heroName} ${isHp ? '气血' : '声望'}+${C.INFLUENCE_BUFF_AMOUNT}`
      : `观众干扰！${target.heroName} ${isHp ? '气血' : '声望'}-${C.INFLUENCE_DEBUFF_AMOUNT}`,
    hpDelta: isHp ? amount : 0,
    repDelta: isHp ? 0 : amount,
    data: { influenceType: inf.effectType, sourceHeroId: inf.sourceHeroId },
  });
}

// Clear consumed influences
if (pendingInfluences.length > 0) {
  await supabaseAdmin.from('game_state').update({
    pending_influences: [],
  }).eq('id', 'current');
}
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add src/lib/game/engine.ts
git commit -m "feat: consume pending influence effects during round resolution"
```

---

### Task 16: SSE Stream — Include Choosing Phase Data

**Files:**
- Modify: `src/app/api/game/stream/route.ts` — ensure SSE pushes `choosingDeadline` and `heroChoiceStatus` changes

**Step 1: Verify SSE coverage**

The SSE endpoint at `/api/game/stream` subscribes to `postgres_changes` on the `game_state` table. Since `choosingDeadline`, `heroChoiceStatus`, and `pendingInfluences` are all stored in `game_state`, changes to these fields will automatically trigger SSE pushes via Supabase Realtime.

However, `pendingChoices` (player-specific) comes from `game_heroes`, not `game_state`. The SSE push won't include it. This is fine because:
- The initial state fetch (`/api/game/state`) includes `pendingChoices` when in choosing phase
- Once SSE notifies of a status change to `choosing_N`, the frontend should fetch fresh state to get `pendingChoices`

**Step 2: In the SSE handler's message serialization, ensure `mapGameStateRow` and `computeDynamicFields` correctly pass through the new fields**

This should already work since we updated `state-mapper.ts` in Task 3. Verify by reading the SSE route and confirming it uses `mapGameStateRow`.

**Step 3: Commit (if changes needed)**

If the SSE route needs modification, commit. Otherwise, skip — the existing Supabase Realtime subscription covers `game_state` changes automatically.

---

### Task 17: Final Integration & Edge Cases

**Files:**
- Modify: `src/lib/game/engine.ts` — stuck detection for `choosing_N`
- Modify: `src/app/api/engine/round/route.ts` — handle `choosing_N` → forced resolve

**Step 1: Add choosing timeout in engine round handler**

In the `/api/engine/round` route handler, before calling `processRound`, add a check: if current status is `choosing_N` and the deadline has passed, proceed with forced resolution (auto-fill unchosen heroes). This is the 20-second anti-stuck safety net.

**Step 2: Reset `influence_used` on game end**

In `src/app/api/engine/end/route.ts`, add:

```typescript
// Reset influence_used for all heroes
await supabaseAdmin.from('heroes').update({ influence_used: false }).neq('id', '00000000-0000-0000-0000-000000000000');
```

(Use a broad WHERE clause that matches all rows, or iterate game participants.)

**Step 3: Verify full game loop**

Run `npm run dev`, play through a full game:
1. Waiting → Countdown → Intro → Choosing phase appears
2. Select 2 encounters → Submit → Wait for resolve
3. Events reveal with chosen encounters
4. Next round: choosing → resolve → reveal
5. All 5 rounds complete → semifinals → final → ending
6. Influence button works during reveal phase
7. Timeout scenario: don't choose → AI auto-selects after 15s

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: complete interactive round choices with edge case handling"
```

---

## Summary of Files Changed

| File | Action | Task |
|------|--------|------|
| `scripts/migrate.mjs` | Modify | 1 |
| `src/lib/types.ts` | Modify | 2 |
| `src/lib/game/state-mapper.ts` | Modify | 3 |
| `src/lib/game/constants.ts` | Modify | 3 |
| `src/lib/game/encounters.ts` | Modify | 4 |
| `src/lib/game/engine.ts` | Modify | 5, 6, 15 |
| `src/app/api/engine/choose-start/route.ts` | Create | 7 |
| `src/app/api/game/choose/route.ts` | Create | 7 |
| `src/app/api/audience/influence/route.ts` | Create | 8 |
| `src/app/api/game/join/route.ts` | Modify | 8 |
| `src/app/api/game/state/route.ts` | Modify | 9 |
| `src/stores/gameStore.ts` | Modify | 10 |
| `src/components/game/ChoosingPanel.tsx` | Create | 11 |
| `src/components/game/InfluenceButton.tsx` | Create | 12 |
| `src/components/game/HeroChoiceSummary.tsx` | Create | 13 |
| `src/components/game/phases/ActiveGamePhase.tsx` | Modify | 14 |
| `src/app/page.tsx` | Modify | 14 |
| `src/hooks/useGameDriver.ts` | Modify | 14 |
| `src/app/api/game/stream/route.ts` | Verify/Modify | 16 |
| `src/app/api/engine/round/route.ts` | Modify | 17 |
| `src/app/api/engine/end/route.ts` | Modify | 17 |
