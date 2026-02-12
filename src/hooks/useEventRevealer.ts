import { useState, useRef, useCallback } from 'react';
import { GameEvent, GameHeroSnapshot, RankEntry } from '@/lib/types';

// ---------- Delta application ----------

function applyEventDelta(
  heroes: GameHeroSnapshot[],
  event: Partial<GameEvent>,
): GameHeroSnapshot[] {
  const next = heroes.map(h => ({ ...h }));
  const heroMap = new Map(next.map(h => [h.heroId, h]));

  const type = event.eventType;
  const hpDelta = event.hpDelta || 0;
  const repDelta = event.reputationDelta || 0;
  const hotDelta = event.hotDelta || 0;

  // HP delta routing
  if (type === 'fight' || type === 'gang_up' || type === 'scramble') {
    // damage lands on target
    const target = heroMap.get(event.targetHeroId || '');
    if (target) target.hp = Math.max(0, target.hp + hpDelta);
  } else if (type === 'train' || type === 'rest' || type === 'explore') {
    // heal on self
    const hero = heroMap.get(event.heroId || '');
    if (hero) hero.hp = Math.min(hero.maxHp, hero.hp + hpDelta);
  } else if (hpDelta !== 0) {
    // fallback: apply to heroId
    const hero = heroMap.get(event.heroId || '');
    if (hero) hero.hp = Math.max(0, Math.min(hero.maxHp, hero.hp + hpDelta));
  }

  // Reputation delta on heroId
  if (repDelta !== 0) {
    const hero = heroMap.get(event.heroId || '');
    if (hero) hero.reputation += repDelta;
  }

  // Hot delta on heroId
  if (hotDelta !== 0) {
    const hero = heroMap.get(event.heroId || '');
    if (hero) hero.hot += hotDelta;
  }

  // Betray: steal reputation from target
  if (type === 'betray' && event.data?.stolenRep) {
    const target = heroMap.get(event.targetHeroId || '');
    if (target) target.reputation -= event.data.stolenRep;
  }

  // Eliminated
  if (type === 'eliminated') {
    const hero = heroMap.get(event.heroId || '');
    if (hero) hero.isEliminated = true;
  }

  return next;
}

// ---------- Ranking derivation ----------

function deriveRanking(heroes: GameHeroSnapshot[], key: 'reputation' | 'hot'): RankEntry[] {
  return heroes
    .slice()
    .sort((a, b) => b[key] - a[key])
    .map((h, i) => ({
      heroId: h.heroId,
      heroName: h.heroName,
      faction: h.faction,
      value: h[key],
      rank: i + 1,
    }));
}

// ---------- Hook ----------

export function useEventRevealer() {
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealedEvents, setRevealedEvents] = useState<Partial<GameEvent>[]>([]);
  const [progressiveHeroes, setProgressiveHeroes] = useState<GameHeroSnapshot[]>([]);
  const [progressiveRepRanking, setProgressiveRepRanking] = useState<RankEntry[]>([]);
  const [progressiveHotRanking, setProgressiveHotRanking] = useState<RankEntry[]>([]);
  const [revealProgress, setRevealProgress] = useState({ current: 0, total: 0 });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Partial<GameEvent>[]>([]);
  const heroesRef = useRef<GameHeroSnapshot[]>([]);
  const revealedRef = useRef<Partial<GameEvent>[]>([]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const revealNext = useCallback(() => {
    const pending = pendingRef.current;
    if (pending.length === 0) {
      setIsRevealing(false);
      return;
    }

    const event = pending.shift()!;
    revealedRef.current = [...revealedRef.current, event];
    heroesRef.current = applyEventDelta(heroesRef.current, event);

    const newRevealed = revealedRef.current;
    const newHeroes = heroesRef.current;

    setRevealedEvents([...newRevealed]);
    setProgressiveHeroes([...newHeroes]);
    setProgressiveRepRanking(deriveRanking(newHeroes, 'reputation'));
    setProgressiveHotRanking(deriveRanking(newHeroes, 'hot'));
    setRevealProgress(prev => ({ ...prev, current: prev.current + 1 }));

    if (pending.length > 0) {
      timerRef.current = setTimeout(revealNext, 1000);
    } else {
      setIsRevealing(false);
    }
  }, []);

  const startReveal = useCallback((events: Partial<GameEvent>[], baseHeroes: GameHeroSnapshot[]) => {
    clearTimer();

    if (!events || events.length === 0) return;

    // Filter out low-priority non-actionable events to keep reveal punchy
    const revealable = events.filter(e => e.eventType !== 'decision');

    pendingRef.current = [...revealable];
    heroesRef.current = baseHeroes.map(h => ({ ...h }));
    revealedRef.current = [];

    setIsRevealing(true);
    setRevealedEvents([]);
    setProgressiveHeroes(baseHeroes.map(h => ({ ...h })));
    setProgressiveRepRanking(deriveRanking(baseHeroes, 'reputation'));
    setProgressiveHotRanking(deriveRanking(baseHeroes, 'hot'));
    setRevealProgress({ current: 0, total: revealable.length });

    // Start chain — first event after a short beat
    timerRef.current = setTimeout(revealNext, 600);
  }, [clearTimer, revealNext]);

  const skipReveal = useCallback(() => {
    clearTimer();

    // Apply all remaining events at once
    let heroes = heroesRef.current;
    const remaining = pendingRef.current;
    for (const evt of remaining) {
      heroes = applyEventDelta(heroes, evt);
    }
    const allRevealed = [...revealedRef.current, ...remaining];

    pendingRef.current = [];
    heroesRef.current = heroes;
    revealedRef.current = allRevealed;

    setRevealedEvents([...allRevealed]);
    setProgressiveHeroes([...heroes]);
    setProgressiveRepRanking(deriveRanking(heroes, 'reputation'));
    setProgressiveHotRanking(deriveRanking(heroes, 'hot'));
    setRevealProgress(prev => ({ ...prev, current: prev.total }));
    setIsRevealing(false);
  }, [clearTimer]);

  return {
    isRevealing,
    revealedEvents,
    progressiveHeroes,
    progressiveRepRanking,
    progressiveHotRanking,
    revealProgress,
    startReveal,
    skipReveal,
  };
}
