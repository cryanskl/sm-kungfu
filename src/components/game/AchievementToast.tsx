'use client';

import { useEffect, useState, useRef } from 'react';
import { useWulinStore } from '@/stores/gameStore';
import type { AchievementUnlock } from '@/lib/types';

export default function AchievementToast() {
  const roundAchievements = useWulinStore(s => s.gameState?.roundAchievements);
  const myHeroId = useWulinStore(s => s.user.heroId);
  const [visible, setVisible] = useState<AchievementUnlock | null>(null);
  const [queue, setQueue] = useState<AchievementUnlock[]>([]);
  const seenRef = useRef(new Set<string>());

  useEffect(() => {
    if (!roundAchievements?.length) return;
    const newOnes = roundAchievements.filter(a => {
      const key = `${a.heroId}:${a.achievementId}`;
      if (seenRef.current.has(key)) return false;
      seenRef.current.add(key);
      return true;
    });
    // Own hero achievements first
    const sorted = [...newOnes].sort((a, b) =>
      (a.heroId === myHeroId ? -1 : 0) - (b.heroId === myHeroId ? -1 : 0)
    );
    if (sorted.length > 0) {
      setQueue(prev => [...prev, ...sorted]);
    }
  }, [roundAchievements, myHeroId]);

  useEffect(() => {
    if (visible || queue.length === 0) return;
    const [next, ...rest] = queue;
    setVisible(next);
    setQueue(rest);
    const timer = setTimeout(() => setVisible(null), 3500);
    return () => clearTimeout(timer);
  }, [queue, visible]);

  if (!visible) return null;
  const isMine = visible.heroId === myHeroId;

  return (
    <div className="fixed top-20 right-4 z-40 animate-slide-in-right">
      <div className={`px-4 py-3 rounded-lg border shadow-lg backdrop-blur-sm max-w-xs ${
        isMine
          ? 'bg-gold/10 border-gold/40 shadow-gold-glow'
          : 'bg-ink-dark/80 border-ink-light/30'
      }`}>
        <div className="flex items-center gap-2">
          <span className="text-2xl">{visible.icon}</span>
          <div>
            <div className="text-xs text-gold font-bold">
              {isMine ? '成就解锁！' : `${visible.heroName} 解锁成就`}
            </div>
            <div className="text-sm font-display text-rice">
              {visible.achievementName}
            </div>
            <div className="text-[10px] text-gold/60">+{visible.points} 积分</div>
          </div>
        </div>
      </div>
    </div>
  );
}
