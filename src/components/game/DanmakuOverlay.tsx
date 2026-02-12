'use client';

import { useEffect, useRef, useState } from 'react';
import { useWulinStore } from '@/stores/gameStore';
import { DanmakuItem } from '@/lib/types';

interface FloatingDanmaku extends DanmakuItem {
  top: number;
  key: string;
  isCommentary?: boolean;
}

const COLOR_MAP: Record<string, string> = {
  white: '#e8e0d0',
  gold: '#c9a84c',
  cyan: '#5dade2',
  red: '#e74c3c',
};

export function DanmakuOverlay() {
  const gameState = useWulinStore(s => s.gameState);
  const localDanmaku = useWulinStore(s => s.localDanmaku);
  const clearLocalDanmaku = useWulinStore(s => s.clearLocalDanmaku);
  const [floating, setFloating] = useState<FloatingDanmaku[]>([]);
  const seenIds = useRef(new Set<string>());
  const prevGameIdRef = useRef<string | null>(null);

  // 换局时清空
  useEffect(() => {
    const gid = gameState?.gameId ?? null;
    if (prevGameIdRef.current && gid !== prevGameIdRef.current) {
      seenIds.current.clear();
      setFloating([]);
      clearLocalDanmaku();
    }
    prevGameIdRef.current = gid;
  }, [gameState?.gameId, clearLocalDanmaku]);

  // ended / waiting / countdown 时清空残留弹幕
  const prevStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const status = gameState?.status ?? null;
    if (status !== prevStatusRef.current) {
      if (status === 'ended' || status === 'ending' || status === 'waiting' || status === 'artifact_selection') {
        seenIds.current.clear();
        setFloating([]);
        clearLocalDanmaku();
      }
      prevStatusRef.current = status;
    }
  }, [gameState?.status, clearLocalDanmaku]);

  // 神兵助战阶段不显示弹幕
  const suppressDanmaku = gameState?.status === 'artifact_selection';

  useEffect(() => {
    if (suppressDanmaku) return;
    const serverItems = gameState?.danmaku || [];
    const allItems = [...serverItems, ...localDanmaku];

    const newItems: FloatingDanmaku[] = [];
    for (const item of allItems) {
      if (!seenIds.current.has(item.id)) {
        seenIds.current.add(item.id);
        newItems.push({
          ...item,
          top: 5 + Math.random() * 60,
          key: item.id,
        });
      }
    }

    if (newItems.length > 0) {
      setFloating(prev => [...prev, ...newItems]);
    }
  }, [gameState?.danmaku, localDanmaku, suppressDanmaku]);

  useEffect(() => {
    if (floating.length === 0) return;
    const timer = setTimeout(() => {
      setFloating(prev => prev.slice(1));
    }, 9000);
    return () => clearTimeout(timer);
  }, [floating.length]);

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
      {floating.map(item => {
        const isC = item.isCommentary;
        const color = COLOR_MAP[item.color] || COLOR_MAP.white;
        return (
          <div
            key={item.key}
            className={`absolute whitespace-nowrap font-bold ${
              isC ? 'text-lg bg-ink-dark/60 px-2 py-0.5 rounded border border-gold/30' : 'text-base'
            }`}
            style={{
              top: `${item.top}%`,
              color,
              textShadow: isC
                ? `1px 1px 4px rgba(0,0,0,0.9), 0 0 16px ${color}40`
                : '1px 1px 4px rgba(0,0,0,0.9), 0 0 12px rgba(0,0,0,0.5)',
              animation: 'danmakuScroll 8s linear forwards',
              letterSpacing: '0.02em',
            }}
          >
            {item.wuxiaText}
          </div>
        );
      })}
    </div>
  );
}
