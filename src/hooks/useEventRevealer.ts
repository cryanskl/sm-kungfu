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

// ---------- Event sorting by perspective ----------

/**
 * 按视角排序事件：优先展示与 viewingHeroId 相关的事件，然后展示其他事件
 */
export function sortEventsByPerspective(
  events: Partial<GameEvent>[],
  viewingHeroId: string | null,
): Partial<GameEvent>[] {
  if (!viewingHeroId) return events;

  const related: Partial<GameEvent>[] = [];
  const others: Partial<GameEvent>[] = [];

  for (const event of events) {
    const isRelated =
      event.heroId === viewingHeroId ||
      event.targetHeroId === viewingHeroId ||
      event.data?.intersectWith != null; // 交汇事件对双方都可见
    if (isRelated) {
      related.push(event);
    } else {
      others.push(event);
    }
  }

  return [...related, ...others];
}

// ---------- Hook ----------

export function useEventRevealer() {
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealedEvents, setRevealedEvents] = useState<Partial<GameEvent>[]>([]);
  const [progressiveHeroes, setProgressiveHeroes] = useState<GameHeroSnapshot[]>([]);
  const [progressiveRepRanking, setProgressiveRepRanking] = useState<RankEntry[]>([]);
  const [progressiveHotRanking, setProgressiveHotRanking] = useState<RankEntry[]>([]);
  const [revealProgress, setRevealProgress] = useState({ current: 0, total: 0 });
  const [myEventsCount, setMyEventsCount] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Partial<GameEvent>[]>([]);
  const heroesRef = useRef<GameHeroSnapshot[]>([]);
  const revealedRef = useRef<Partial<GameEvent>[]>([]);
  const intervalRef = useRef(1000); // 动态间隔（毫秒）
  const myEventsCountRef = useRef(0);
  const myEventsTotalRef = useRef(0);
  const onMyEventsCompletedRef = useRef<(() => void) | null>(null);

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

    // 跟踪自己的事件进度
    myEventsCountRef.current++;
    if (myEventsCountRef.current >= myEventsTotalRef.current && onMyEventsCompletedRef.current) {
      onMyEventsCompletedRef.current();
      onMyEventsCompletedRef.current = null; // 只触发一次
    }

    if (pending.length > 0) {
      timerRef.current = setTimeout(revealNext, intervalRef.current);
    } else {
      setIsRevealing(false);
    }
  }, []);

  /**
   * 开始逐条揭晓事件。
   * @param events - 要揭晓的事件列表
   * @param baseHeroes - 揭晓前的英雄快照
   * @param durationMs - 可用展示时长（毫秒），事件会均匀铺满这段时间
   * @param viewingHeroId - 当前观看的角色 ID，相关事件优先揭示
   * @param onMyCompleted - 自己相关事件揭示完毕的回调
   */
  const startReveal = useCallback((
    events: Partial<GameEvent>[],
    baseHeroes: GameHeroSnapshot[],
    durationMs?: number,
    viewingHeroId?: string | null,
    onMyCompleted?: () => void,
  ) => {
    clearTimer();

    if (!events || events.length === 0) return;

    // Filter out low-priority non-actionable events to keep reveal punchy
    const revealable = events.filter(e => e.eventType !== 'decision');

    // 按视角排序：viewingHeroId 相关事件优先
    const sorted = viewingHeroId
      ? sortEventsByPerspective(revealable, viewingHeroId)
      : revealable;

    // 计算自己相关事件数量
    const myCount = viewingHeroId
      ? sorted.filter(e =>
          e.heroId === viewingHeroId ||
          e.targetHeroId === viewingHeroId
        ).length
      : sorted.length;

    myEventsCountRef.current = 0;
    myEventsTotalRef.current = myCount;
    onMyEventsCompletedRef.current = onMyCompleted || null;
    setMyEventsCount(myCount);

    // 计算动态间隔：均匀铺满展示窗口，留 2s 缓冲
    if (durationMs && sorted.length > 0) {
      const available = durationMs - 2000; // 留 2s 余量
      const raw = Math.floor(available / sorted.length);
      intervalRef.current = Math.max(500, Math.min(raw, 2500)); // 限制 500ms~2500ms
    } else {
      intervalRef.current = 1000; // 默认 1s
    }

    pendingRef.current = [...sorted];
    heroesRef.current = baseHeroes.map(h => ({ ...h }));
    revealedRef.current = [];

    setIsRevealing(true);
    setRevealedEvents([]);
    setProgressiveHeroes(baseHeroes.map(h => ({ ...h })));
    setProgressiveRepRanking(deriveRanking(baseHeroes, 'reputation'));
    setProgressiveHotRanking(deriveRanking(baseHeroes, 'hot'));
    setRevealProgress({ current: 0, total: sorted.length });

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

    // 触发回调
    if (onMyEventsCompletedRef.current) {
      onMyEventsCompletedRef.current();
      onMyEventsCompletedRef.current = null;
    }
  }, [clearTimer]);

  const resetReveal = useCallback(() => {
    clearTimer();
    pendingRef.current = [];
    heroesRef.current = [];
    revealedRef.current = [];
    onMyEventsCompletedRef.current = null;
    setIsRevealing(false);
    setRevealedEvents([]);
    setProgressiveHeroes([]);
    setProgressiveRepRanking([]);
    setProgressiveHotRanking([]);
    setRevealProgress({ current: 0, total: 0 });
    setMyEventsCount(0);
  }, [clearTimer]);

  return {
    isRevealing,
    revealedEvents,
    progressiveHeroes,
    progressiveRepRanking,
    progressiveHotRanking,
    revealProgress,
    myEventsCount,
    startReveal,
    skipReveal,
    resetReveal,
  };
}
