'use client';

import { useState, useCallback } from 'react';
import { useWulinStore } from '@/stores/gameStore';
import { generateBattleReport } from '@/lib/game/battle-report';

export function ShareButton() {
  const gameState = useWulinStore(s => s.gameState);
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    if (!gameState) return;
    const report = generateBattleReport(gameState);
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = report;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [gameState]);

  return (
    <button
      onClick={handleShare}
      className={`text-sm px-5 py-2 rounded-lg font-bold inline-flex items-center gap-2 transition ${
        copied
          ? 'bg-jade/15 text-jade border border-jade/30'
          : 'btn-ghost hover:border-gold/40 hover:text-gold'
      }`}
    >
      {copied ? '✅ 已复制战报' : '📋 分享战报'}
    </button>
  );
}
