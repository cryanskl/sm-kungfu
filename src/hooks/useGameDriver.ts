'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { useWulinStore } from '@/stores/gameStore';

// 前端驱动器：根据游戏状态自动推进回合
export function useGameDriver() {
  const { gameState, user } = useWulinStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 30 秒倒计时
  useEffect(() => {
    if (gameState?.status === 'countdown') {
      setCountdown(30);
      timerRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev === null || prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            // 倒计时结束，触发开赛（保持 0 而非 null，防止闪回入座按钮）
            triggerStart(gameState.gameId!);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [gameState?.status]);

  // 触发开赛
  const triggerStart = useCallback(async (gameId: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await fetch('/api/engine/start', { method: 'POST' });
    } catch { /* ignore */ }
    setIsProcessing(false);
  }, [isProcessing]);

  // 触发回合（intro 结束后 → R1，R1 结束后 → R2，...）
  const triggerRound = useCallback(async (gameId: string, roundNumber: number) => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const res = await fetch('/api/engine/round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, roundNumber }),
      });
      const data = await res.json();
      if (data.events) {
        useWulinStore.getState().setCurrentEvents(data.events);
      }
    } catch { /* ignore */ }
    setIsProcessing(false);
  }, [isProcessing]);

  return { countdown, isProcessing, triggerStart, triggerRound };
}
