'use client';

import { useEffect, useRef, useState } from 'react';
import { useWulinStore } from '@/stores/gameStore';
import { DanmakuItem } from '@/lib/types';

interface FloatingDanmaku extends DanmakuItem {
  top: number;   // % from top
  key: string;    // unique render key
}

const COLOR_MAP: Record<string, string> = {
  white: '#e8e0d0',
  gold: '#d4a843',
  cyan: '#5dade2',
};

export function DanmakuOverlay() {
  const gameState = useWulinStore(s => s.gameState);
  const localDanmaku = useWulinStore(s => s.localDanmaku);
  const [floating, setFloating] = useState<FloatingDanmaku[]>([]);
  const seenIds = useRef(new Set<string>());
  const prevGameIdRef = useRef<string | null>(null);

  // 新比赛清空弹幕
  useEffect(() => {
    const gid = gameState?.gameId ?? null;
    if (prevGameIdRef.current && gid !== prevGameIdRef.current) {
      seenIds.current.clear();
      setFloating([]);
    }
    prevGameIdRef.current = gid;
  }, [gameState?.gameId]);

  // Merge server danmaku + local danmaku, deduplicate
  useEffect(() => {
    const serverItems = gameState?.danmaku || [];
    const allItems = [...serverItems, ...localDanmaku];

    const newItems: FloatingDanmaku[] = [];
    for (const item of allItems) {
      if (!seenIds.current.has(item.id)) {
        seenIds.current.add(item.id);
        newItems.push({
          ...item,
          top: 5 + Math.random() * 60, // 5%-65% from top
          key: item.id,
        });
      }
    }

    if (newItems.length > 0) {
      setFloating(prev => [...prev, ...newItems]);
    }
  }, [gameState?.danmaku, localDanmaku]);

  // Auto-remove after animation (9s)
  useEffect(() => {
    if (floating.length === 0) return;
    const timer = setTimeout(() => {
      setFloating(prev => prev.slice(1));
    }, 9000);
    return () => clearTimeout(timer);
  }, [floating.length]);

  // Clean seen IDs periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (seenIds.current.size > 200) {
        seenIds.current.clear();
      }
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  if (floating.length === 0) return null;

  return (
    <div className="fixed inset-0 z-20 pointer-events-none overflow-hidden">
      {floating.map(item => (
        <div
          key={item.key}
          className="absolute whitespace-nowrap text-lg font-bold danmaku-scroll"
          style={{
            top: `${item.top}%`,
            color: COLOR_MAP[item.color] || COLOR_MAP.white,
            textShadow: '1px 1px 3px rgba(0,0,0,0.8), 0 0 10px rgba(0,0,0,0.5)',
            animation: 'danmakuScroll 8s linear forwards',
          }}
        >
          {item.wuxiaText}
        </div>
      ))}
    </div>
  );
}
