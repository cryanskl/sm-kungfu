'use client';

import { useEffect, useState, useRef } from 'react';
import { useWulinStore } from '@/stores/gameStore';
import { GameEvent, GameHeroSnapshot } from '@/lib/types';

interface FloatItem {
  id: string;
  moveName: string;
  damage: number;
  x: number;
}

const COMBAT_TYPES = new Set(['fight', 'gang_up', 'scramble']);

export function FloatingText({ overrideEvents }: { overrideEvents?: Partial<GameEvent>[] } = {}) {
  const gameState = useWulinStore(s => s.gameState);
  const [items, setItems] = useState<FloatItem[]>([]);
  const processedRef = useRef(new Set<string>());

  useEffect(() => {
    const events = overrideEvents || gameState?.recentEvents || [];
    const heroes = gameState?.heroes || [];
    const heroMap = new Map<string, GameHeroSnapshot>();
    for (const h of heroes) heroMap.set(h.heroId, h);

    const newItems: FloatItem[] = [];

    for (const evt of events) {
      if (!evt.eventType || !COMBAT_TYPES.has(evt.eventType)) continue;
      if (!evt.id || processedRef.current.has(evt.id)) continue;
      processedRef.current.add(evt.id);

      const hero = heroMap.get(evt.heroId || '');
      const moveName = hero?.martialArts?.[0]?.name || '无名掌法';
      const damage = Math.abs(evt.data?.damage || evt.hpDelta || 0);

      if (damage > 0) {
        newItems.push({
          id: `${evt.id}-${Date.now()}`,
          moveName,
          damage,
          x: 10 + Math.random() * 80,
        });
      }
    }

    if (newItems.length > 0) {
      setItems(prev => [...prev, ...newItems]);
    }
  }, [overrideEvents, gameState?.recentEvents]);

  useEffect(() => {
    if (items.length === 0) return;
    const timer = setTimeout(() => {
      setItems(prev => prev.slice(1));
    }, 1600);
    return () => clearTimeout(timer);
  }, [items.length]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (processedRef.current.size > 200) processedRef.current.clear();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  if (items.length === 0) return null;

  return (
    <>
      {items.map(item => (
        <div
          key={item.id}
          className="absolute pointer-events-none animate-float-up z-10"
          style={{ left: `${item.x}%`, top: '30%' }}
        >
          <div className="text-center whitespace-nowrap">
            <div className="text-lg font-black text-gold font-display"
              style={{ textShadow: '0 0 12px var(--gold-glow)' }}>
              {item.moveName}
            </div>
            <div className="text-xl font-black text-vermillion"
              style={{ textShadow: '0 0 10px var(--vermillion-glow)' }}>
              -{item.damage}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
